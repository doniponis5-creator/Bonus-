"""
Sbonus+ — Multi-Branch Comparison Analytics.
Сравнение филиалов: выручка, клиенты, транзакции, кассиры.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case, and_, literal_column, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role, UserRole
from app.models import (
    Branch, Customer, BonusAccount, Transaction, TransactionType,
    User, UserRoleEnum,
)

router = APIRouter(prefix="/branch-analytics", tags=["Branch Analytics"])


@router.get("/comparison")
async def branch_comparison(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Сравнение всех филиалов по ключевым метрикам."""
    tz = timezone(timedelta(hours=6))
    now = datetime.now(tz)
    since = now - timedelta(days=days)
    prev_since = since - timedelta(days=days)

    # All active branches
    branches_q = await db.execute(
        select(Branch).where(Branch.is_active == True).order_by(Branch.name)
    )
    branches = branches_q.scalars().all()

    results = []
    for branch in branches:
        bid = branch.id

        # Current period: revenue + tx count
        cur_stats = await db.execute(
            select(
                func.coalesce(func.sum(Transaction.purchase_amount), 0).label("revenue"),
                func.count().label("tx_count"),
                func.count(func.distinct(Transaction.customer_id)).label("unique_customers"),
                func.coalesce(func.sum(
                    case((Transaction.type == TransactionType.EARN, Transaction.amount), else_=Decimal("0"))
                ), 0).label("bonuses_earned"),
                func.coalesce(func.sum(
                    case((Transaction.type == TransactionType.SPEND, Transaction.amount), else_=Decimal("0"))
                ), 0).label("bonuses_spent"),
            ).where(
                Transaction.branch_id == bid,
                Transaction.type == TransactionType.EARN,
                Transaction.created_at >= since,
            )
        )
        cur = cur_stats.one()

        # Previous period revenue for growth
        prev_stats = await db.execute(
            select(
                func.coalesce(func.sum(Transaction.purchase_amount), 0).label("revenue"),
                func.count().label("tx_count"),
            ).where(
                Transaction.branch_id == bid,
                Transaction.type == TransactionType.EARN,
                Transaction.created_at >= prev_since,
                Transaction.created_at < since,
            )
        )
        prev = prev_stats.one()

        # Avg check
        avg_check = float(cur.revenue) / cur.tx_count if cur.tx_count > 0 else 0

        # Revenue growth %
        prev_rev = float(prev.revenue)
        cur_rev = float(cur.revenue)
        growth = ((cur_rev - prev_rev) / prev_rev * 100) if prev_rev > 0 else 0

        # Cashier count
        cashier_count_q = await db.execute(
            select(func.count()).where(
                User.branch_id == bid,
                User.role == UserRoleEnum.CASHIER,
                User.is_active == True,
            )
        )

        # Spend transactions too
        spend_stats = await db.execute(
            select(
                func.count().label("spend_count"),
                func.coalesce(func.sum(Transaction.amount), 0).label("spend_total"),
            ).where(
                Transaction.branch_id == bid,
                Transaction.type == TransactionType.SPEND,
                Transaction.created_at >= since,
            )
        )
        spend = spend_stats.one()

        results.append({
            "branch_id": str(bid),
            "name": branch.name,
            "address": branch.address,
            "city": branch.city,
            "revenue": round(cur_rev, 2),
            "revenue_growth": round(growth, 1),
            "transactions": cur.tx_count,
            "unique_customers": cur.unique_customers,
            "avg_check": round(avg_check, 2),
            "bonuses_earned": round(float(cur.bonuses_earned), 2),
            "bonuses_spent": round(float(spend.spend_total), 2),
            "spend_transactions": spend.spend_count,
            "cashiers": cashier_count_q.scalar() or 0,
        })

    # Sort by revenue desc
    results.sort(key=lambda x: x["revenue"], reverse=True)

    # Add rank
    for i, r in enumerate(results):
        r["rank"] = i + 1

    return {"period_days": days, "branches": results}


@router.get("/trends")
async def branch_trends(
    days: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Дневные тренды по филиалам для графиков."""
    tz = timezone(timedelta(hours=6))
    since = datetime.now(tz) - timedelta(days=days)

    # All branches
    branches_q = await db.execute(
        select(Branch.id, Branch.name).where(Branch.is_active == True)
    )
    branches = {r.id: r.name for r in branches_q.all()}

    # Daily revenue per branch
    daily = await db.execute(
        select(
            Transaction.branch_id,
            func.date_trunc(literal_column("'day'"), Transaction.created_at).label("day"),
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("revenue"),
            func.count().label("tx_count"),
        ).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= since,
            Transaction.branch_id.isnot(None),
        ).group_by(Transaction.branch_id, "day").order_by("day")
    )

    # Organize by branch
    trends = {}
    for row in daily.all():
        bid = str(row.branch_id)
        name = branches.get(row.branch_id, "Unknown")
        if bid not in trends:
            trends[bid] = {"branch_id": bid, "name": name, "daily": []}
        trends[bid]["daily"].append({
            "date": row.day.strftime("%Y-%m-%d") if hasattr(row.day, 'strftime') else str(row.day)[:10],
            "revenue": round(float(row.revenue), 2),
            "transactions": row.tx_count,
        })

    return {"period_days": days, "trends": list(trends.values())}


@router.get("/heatmap")
async def branch_heatmap(
    days: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Тепловая карта: активность по дням недели и часам для каждого филиала."""
    tz = timezone(timedelta(hours=6))
    since = datetime.now(tz) - timedelta(days=days)

    branches_q = await db.execute(
        select(Branch.id, Branch.name).where(Branch.is_active == True)
    )
    branches = {r.id: r.name for r in branches_q.all()}

    # DOW + hour breakdown
    hourly = await db.execute(
        select(
            Transaction.branch_id,
            func.extract("dow", Transaction.created_at).label("dow"),
            func.extract("hour", Transaction.created_at).label("hour"),
            func.count().label("cnt"),
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("rev"),
        ).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= since,
            Transaction.branch_id.isnot(None),
        ).group_by(Transaction.branch_id, "dow", "hour")
    )

    heatmaps = {}
    for row in hourly.all():
        bid = str(row.branch_id)
        name = branches.get(row.branch_id, "Unknown")
        if bid not in heatmaps:
            heatmaps[bid] = {"branch_id": bid, "name": name, "data": []}
        heatmaps[bid]["data"].append({
            "dow": int(row.dow),
            "hour": int(row.hour),
            "count": row.cnt,
            "revenue": round(float(row.rev), 2),
        })

    return {"period_days": days, "heatmaps": list(heatmaps.values())}


@router.get("/cashier-performance")
async def cashier_performance_by_branch(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Производительность кассиров по филиалам."""
    tz = timezone(timedelta(hours=6))
    since = datetime.now(tz) - timedelta(days=days)

    # Cashier stats
    cashier_stats = await db.execute(
        select(
            Transaction.cashier_id,
            Transaction.branch_id,
            func.count().label("tx_count"),
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("revenue"),
            func.count(func.distinct(Transaction.customer_id)).label("unique_customers"),
        ).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= since,
            Transaction.cashier_id.isnot(None),
        ).group_by(Transaction.cashier_id, Transaction.branch_id)
    )

    branches_q = await db.execute(
        select(Branch.id, Branch.name).where(Branch.is_active == True)
    )
    branch_map = {r.id: r.name for r in branches_q.all()}

    users_q = await db.execute(
        select(User.id, User.full_name, User.phone).where(User.is_active == True)
    )
    user_map = {r.id: {"name": r.full_name, "phone": r.phone} for r in users_q.all()}

    result = []
    for row in cashier_stats.all():
        u = user_map.get(row.cashier_id, {})
        result.append({
            "cashier_id": str(row.cashier_id),
            "name": u.get("name", "—"),
            "phone": u.get("phone", "—"),
            "branch": branch_map.get(row.branch_id, "—"),
            "branch_id": str(row.branch_id) if row.branch_id else None,
            "transactions": row.tx_count,
            "revenue": round(float(row.revenue), 2),
            "unique_customers": row.unique_customers,
            "avg_check": round(float(row.revenue) / row.tx_count, 2) if row.tx_count else 0,
        })

    result.sort(key=lambda x: x["revenue"], reverse=True)
    return {"period_days": days, "cashiers": result}
