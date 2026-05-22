"""
Sbonus+ — Analytics Dashboard API.

Admin panel uchun to'liq statistika endpointlari:
  - Umumiy ko'rsatkichlar (revenue, customers, bonuses)
  - Kunlik/haftalik/oylik trendlar
  - Top klientlar
  - Tier taqsimoti
  - Koleso statistikasi
  - Kampaniya samaradorligi
  - Kassir statistikasi

Barcha endpointlar faqat SUPER_ADMIN va BRANCH_ADMIN uchun.
"""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, cast, Date, extract, func, select, and_, Integer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import UserRole, require_role
from app.models import (
    BonusAccount,
    BonusCampaign,
    BonusCampaignRecipient,
    Branch,
    Customer,
    Notification,
    NotificationStatus,
    Setting,
    Tier,
    Transaction,
    TransactionType,
    User,
    UserRoleEnum,
)

router = APIRouter(
    prefix="/analytics",
    tags=["Analytics Dashboard"],
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)


# ═══════════════════════════════════════════
# RESPONSE SCHEMAS
# ═══════════════════════════════════════════

class OverviewStats(BaseModel):
    """Asosiy ko'rsatkichlar — dashboard uchun."""
    total_customers: int
    active_customers: int          # oxirgi 30 kunda xarid qilgan
    new_customers_today: int
    new_customers_month: int

    total_revenue: float           # jami xarid summasi (purchase_amount)
    revenue_today: float
    revenue_month: float

    total_bonus_issued: float      # jami berilgan bonus
    total_bonus_spent: float       # jami sarflangan
    total_bonus_balance: float     # joriy jami balans

    transactions_today: int
    transactions_month: int

    wheel_spins_today: int
    wheel_wins_today: float        # bugungi yutgan bonus


class DailyTrend(BaseModel):
    """Kunlik statistika nuqtasi."""
    date: str
    revenue: float
    bonus_issued: float
    bonus_spent: float
    transactions: int
    new_customers: int


class TopCustomer(BaseModel):
    """Top klient statistikasi."""
    id: str
    full_name: str
    phone: str
    total_earned: float
    total_spent: float
    balance: float
    tier_name: str
    purchase_count: int
    total_purchases: float


class TierDistribution(BaseModel):
    """Tier bo'yicha klientlar soni."""
    tier_name: str
    customer_count: int
    percentage: float


class CashierStats(BaseModel):
    """Kassir statistikasi."""
    id: str
    full_name: str
    branch_name: Optional[str]
    transactions_count: int
    total_earn_amount: float
    total_spend_amount: float
    total_purchase_volume: float


class CampaignStats(BaseModel):
    """Kampaniya samaradorligi."""
    id: str
    name: str
    status: str
    total_recipients: int
    sent_count: int
    total_bonus: float
    created_at: str


class WheelStats(BaseModel):
    """Koleso statistikasi."""
    total_spins: int
    total_bonus_won: float
    physical_prizes_won: int
    spins_today: int
    bonus_won_today: float


# ═══════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════

@router.get("/overview", response_model=OverviewStats)
async def get_overview(
    db: AsyncSession = Depends(get_db),
) -> OverviewStats:
    """
    Dashboard uchun asosiy ko'rsatkichlar.
    Bitta endpointda hamma muhim raqamlar.
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    thirty_days_ago = now - timedelta(days=30)

    # Customers
    total_cust = (await db.execute(
        select(func.count(Customer.id)).where(Customer.is_active == True)
    )).scalar() or 0

    new_today = (await db.execute(
        select(func.count(Customer.id)).where(
            Customer.created_at >= today_start,
            Customer.is_active == True,
        )
    )).scalar() or 0

    new_month = (await db.execute(
        select(func.count(Customer.id)).where(
            Customer.created_at >= month_start,
            Customer.is_active == True,
        )
    )).scalar() or 0

    # Active customers (bought in last 30 days)
    active_subq = (await db.execute(
        select(func.count(func.distinct(Transaction.customer_id))).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= thirty_days_ago,
        )
    )).scalar() or 0

    # Revenue (purchase_amount from EARN transactions)
    total_rev = (await db.execute(
        select(func.coalesce(func.sum(Transaction.purchase_amount), 0)).where(
            Transaction.type == TransactionType.EARN,
        )
    )).scalar() or 0

    rev_today = (await db.execute(
        select(func.coalesce(func.sum(Transaction.purchase_amount), 0)).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= today_start,
        )
    )).scalar() or 0

    rev_month = (await db.execute(
        select(func.coalesce(func.sum(Transaction.purchase_amount), 0)).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= month_start,
        )
    )).scalar() or 0

    # Bonus stats
    total_issued = (await db.execute(
        select(func.coalesce(func.sum(BonusAccount.total_earned), 0))
    )).scalar() or 0

    total_spent = (await db.execute(
        select(func.coalesce(func.sum(BonusAccount.total_spent), 0))
    )).scalar() or 0

    total_balance = (await db.execute(
        select(func.coalesce(func.sum(BonusAccount.balance), 0))
    )).scalar() or 0

    # Transactions count
    txn_today = (await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.created_at >= today_start,
            Transaction.type.in_([TransactionType.EARN, TransactionType.SPEND]),
        )
    )).scalar() or 0

    txn_month = (await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.created_at >= month_start,
            Transaction.type.in_([TransactionType.EARN, TransactionType.SPEND]),
        )
    )).scalar() or 0

    # Wheel stats today
    wheel_spins = (await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.type == TransactionType.PROMO,
            Transaction.note.like("Колесо удачи%"),
            Transaction.created_at >= today_start,
        )
    )).scalar() or 0

    wheel_wins = (await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.type == TransactionType.PROMO,
            Transaction.note.like("Колесо удачи:%"),
            Transaction.amount > 0,
            Transaction.created_at >= today_start,
        )
    )).scalar() or 0

    return OverviewStats(
        total_customers=total_cust,
        active_customers=active_subq,
        new_customers_today=new_today,
        new_customers_month=new_month,
        total_revenue=float(total_rev),
        revenue_today=float(rev_today),
        revenue_month=float(rev_month),
        total_bonus_issued=float(total_issued),
        total_bonus_spent=float(total_spent),
        total_bonus_balance=float(total_balance),
        transactions_today=txn_today,
        transactions_month=txn_month,
        wheel_spins_today=wheel_spins,
        wheel_wins_today=float(wheel_wins),
    )


@router.get("/trends", response_model=list[DailyTrend])
async def get_daily_trends(
    days: int = Query(30, ge=7, le=90, description="Kunlar soni"),
    db: AsyncSession = Depends(get_db),
) -> list[DailyTrend]:
    """
    Kunlik trendlar: revenue, bonus, transactions.
    Grafik uchun 7-90 kunlik data.
    """
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)

    # Daily transaction aggregates
    txn_query = (
        select(
            cast(Transaction.created_at, Date).label("day"),
            func.coalesce(
                func.sum(
                    case(
                        (Transaction.type == TransactionType.EARN, Transaction.purchase_amount),
                        else_=Decimal("0"),
                    )
                ), 0
            ).label("revenue"),
            func.coalesce(
                func.sum(
                    case(
                        (Transaction.type == TransactionType.EARN, Transaction.amount),
                        else_=Decimal("0"),
                    )
                ), 0
            ).label("bonus_issued"),
            func.coalesce(
                func.sum(
                    case(
                        (Transaction.type == TransactionType.SPEND, Transaction.amount),
                        else_=Decimal("0"),
                    )
                ), 0
            ).label("bonus_spent"),
            func.count(
                case(
                    (Transaction.type.in_([TransactionType.EARN, TransactionType.SPEND]), Transaction.id),
                )
            ).label("transactions"),
        )
        .where(Transaction.created_at >= start_date)
        .group_by(cast(Transaction.created_at, Date))
        .order_by(cast(Transaction.created_at, Date))
    )

    txn_result = await db.execute(txn_query)
    txn_rows = {str(r.day): r for r in txn_result.all()}

    # Daily new customers
    cust_query = (
        select(
            cast(Customer.created_at, Date).label("day"),
            func.count(Customer.id).label("new_customers"),
        )
        .where(Customer.created_at >= start_date)
        .group_by(cast(Customer.created_at, Date))
    )
    cust_result = await db.execute(cust_query)
    cust_rows = {str(r.day): r.new_customers for r in cust_result.all()}

    # Fill all days
    trends = []
    for i in range(days):
        d = (start_date + timedelta(days=i)).date()
        day_str = str(d)
        txn = txn_rows.get(day_str)
        trends.append(DailyTrend(
            date=day_str,
            revenue=float(txn.revenue) if txn else 0,
            bonus_issued=float(txn.bonus_issued) if txn else 0,
            bonus_spent=float(txn.bonus_spent) if txn else 0,
            transactions=int(txn.transactions) if txn else 0,
            new_customers=cust_rows.get(day_str, 0),
        ))

    return trends


@router.get("/top-customers", response_model=list[TopCustomer])
async def get_top_customers(
    limit: int = Query(20, ge=5, le=100, description="Nechta klient"),
    sort_by: str = Query("total_earned", description="Saralash: total_earned, total_spent, balance, purchases"),
    db: AsyncSession = Depends(get_db),
) -> list[TopCustomer]:
    """Top klientlar — eng ko'p xarid/bonus bo'yicha."""

    # Purchase count + total purchases per customer
    purchase_subq = (
        select(
            Transaction.customer_id,
            func.count(Transaction.id).label("purchase_count"),
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("total_purchases"),
        )
        .where(Transaction.type == TransactionType.EARN)
        .group_by(Transaction.customer_id)
        .subquery()
    )

    query = (
        select(
            Customer.id,
            Customer.full_name,
            Customer.phone,
            BonusAccount.total_earned,
            BonusAccount.total_spent,
            BonusAccount.balance,
            Tier.name.label("tier_name"),
            func.coalesce(purchase_subq.c.purchase_count, 0).label("purchase_count"),
            func.coalesce(purchase_subq.c.total_purchases, 0).label("total_purchases"),
        )
        .join(BonusAccount, BonusAccount.customer_id == Customer.id)
        .outerjoin(Tier, Tier.id == Customer.tier_id)
        .outerjoin(purchase_subq, purchase_subq.c.customer_id == Customer.id)
        .where(Customer.is_active == True)
    )

    # Sort
    sort_map = {
        "total_earned": BonusAccount.total_earned.desc(),
        "total_spent": BonusAccount.total_spent.desc(),
        "balance": BonusAccount.balance.desc(),
        "purchases": purchase_subq.c.total_purchases.desc().nulls_last(),
    }
    query = query.order_by(sort_map.get(sort_by, BonusAccount.total_earned.desc()))
    query = query.limit(limit)

    result = await db.execute(query)
    rows = result.all()

    return [
        TopCustomer(
            id=str(r.id),
            full_name=r.full_name,
            phone=r.phone,
            total_earned=float(r.total_earned or 0),
            total_spent=float(r.total_spent or 0),
            balance=float(r.balance or 0),
            tier_name=r.tier_name or "Bronze",
            purchase_count=r.purchase_count,
            total_purchases=float(r.total_purchases or 0),
        )
        for r in rows
    ]


@router.get("/tier-distribution", response_model=list[TierDistribution])
async def get_tier_distribution(
    db: AsyncSession = Depends(get_db),
) -> list[TierDistribution]:
    """Tier bo'yicha klientlar taqsimoti."""
    total = (await db.execute(
        select(func.count(Customer.id)).where(Customer.is_active == True)
    )).scalar() or 1

    query = (
        select(
            func.coalesce(Tier.name, "Без уровня").label("tier_name"),
            func.count(Customer.id).label("count"),
        )
        .outerjoin(Tier, Tier.id == Customer.tier_id)
        .where(Customer.is_active == True)
        .group_by(Tier.name, Tier.sort_order)
        .order_by(Tier.sort_order.nulls_last())
    )

    result = await db.execute(query)
    return [
        TierDistribution(
            tier_name=r.tier_name,
            customer_count=r.count,
            percentage=round(r.count / total * 100, 1),
        )
        for r in result.all()
    ]


@router.get("/cashiers", response_model=list[CashierStats])
async def get_cashier_stats(
    days: int = Query(30, ge=1, le=365, description="Davr (kunlarda)"),
    db: AsyncSession = Depends(get_db),
) -> list[CashierStats]:
    """Kassirlar statistikasi — kim qancha tranzaksiya qildi."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    query = (
        select(
            User.id,
            User.full_name,
            Branch.name.label("branch_name"),
            func.count(Transaction.id).label("txn_count"),
            func.coalesce(
                func.sum(case(
                    (Transaction.type == TransactionType.EARN, Transaction.amount),
                    else_=Decimal("0"),
                )), 0
            ).label("earn_sum"),
            func.coalesce(
                func.sum(case(
                    (Transaction.type == TransactionType.SPEND, Transaction.amount),
                    else_=Decimal("0"),
                )), 0
            ).label("spend_sum"),
            func.coalesce(
                func.sum(case(
                    (Transaction.type == TransactionType.EARN, Transaction.purchase_amount),
                    else_=Decimal("0"),
                )), 0
            ).label("purchase_vol"),
        )
        .join(Transaction, Transaction.cashier_id == User.id)
        .outerjoin(Branch, Branch.id == User.branch_id)
        .where(
            User.role == UserRoleEnum.CASHIER,
            Transaction.created_at >= since,
        )
        .group_by(User.id, User.full_name, Branch.name)
        .order_by(func.count(Transaction.id).desc())
    )

    result = await db.execute(query)
    return [
        CashierStats(
            id=str(r.id),
            full_name=r.full_name,
            branch_name=r.branch_name,
            transactions_count=r.txn_count,
            total_earn_amount=float(r.earn_sum),
            total_spend_amount=float(r.spend_sum),
            total_purchase_volume=float(r.purchase_vol),
        )
        for r in result.all()
    ]


@router.get("/wheel", response_model=WheelStats)
async def get_wheel_stats(
    db: AsyncSession = Depends(get_db),
) -> WheelStats:
    """Koleso statistikasi — umumiy va bugungi."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Jami koleso tranzaksiyalari
    total_spins = (await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.type == TransactionType.PROMO,
            Transaction.note.like("Колесо удачи%"),
        )
    )).scalar() or 0

    total_won = (await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.type == TransactionType.PROMO,
            Transaction.note.like("Колесо удачи:%"),
            Transaction.amount > 0,
        )
    )).scalar() or 0

    physical_won = (await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.type == TransactionType.PROMO,
            Transaction.note.like("Колесо удачи — приз:%"),
        )
    )).scalar() or 0

    spins_today = (await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.type == TransactionType.PROMO,
            Transaction.note.like("Колесо удачи%"),
            Transaction.created_at >= today_start,
        )
    )).scalar() or 0

    won_today = (await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.type == TransactionType.PROMO,
            Transaction.note.like("Колесо удачи:%"),
            Transaction.amount > 0,
            Transaction.created_at >= today_start,
        )
    )).scalar() or 0

    return WheelStats(
        total_spins=total_spins,
        total_bonus_won=float(total_won),
        physical_prizes_won=physical_won,
        spins_today=spins_today,
        bonus_won_today=float(won_today),
    )


@router.get("/campaigns", response_model=list[CampaignStats])
async def get_campaign_stats(
    limit: int = Query(20, ge=5, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[CampaignStats]:
    """Kampaniyalar statistikasi — oxirgi N ta."""
    query = (
        select(
            BonusCampaign.id,
            BonusCampaign.name,
            BonusCampaign.status,
            BonusCampaign.amount,
            BonusCampaign.sent_count,
            BonusCampaign.created_at,
            func.count(BonusCampaignRecipient.id).label("total_recipients"),
        )
        .outerjoin(BonusCampaignRecipient, BonusCampaignRecipient.campaign_id == BonusCampaign.id)
        .group_by(BonusCampaign.id)
        .order_by(BonusCampaign.created_at.desc())
        .limit(limit)
    )

    result = await db.execute(query)
    return [
        CampaignStats(
            id=str(r.id),
            name=r.name,
            status=r.status.value if hasattr(r.status, 'value') else str(r.status),
            total_recipients=r.total_recipients,
            sent_count=r.sent_count,
            total_bonus=float(r.amount * r.sent_count) if r.sent_count else 0,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in result.all()
    ]
