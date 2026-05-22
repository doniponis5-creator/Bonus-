"""
S Bonus+ — PRO Analytics API.
Бизнес-аналитика, когортный анализ, RFM-сегментация, воронка клиентов,
маркетинг ROI, и real-time мониторинг.

Профессиональный уровень аналитики для маркетологов и владельцев бизнеса.
"""

import json
from datetime import datetime, timezone, timedelta, date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case, distinct, text, and_, or_, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import (
    Customer, Transaction, TransactionType, BonusAccount,
    BonusCampaign, BonusCampaignRecipient, CampaignStatus,
    Notification, NotificationStatus, NotificationChannel,
    PromoCode, User, UserRoleEnum, Tier, Branch,
)

router = APIRouter(prefix="/analytics-pro", tags=["analytics-pro"])


def _require_admin(user: User):
    from fastapi import HTTPException
    if user.role not in (UserRoleEnum.SUPER_ADMIN, UserRoleEnum.BRANCH_ADMIN):
        raise HTTPException(status_code=403, detail="Только для администраторов")


# ════════════════════════════════════════════════════════════════
#  1. БИЗНЕС-ОБЗОР — KPI, выручка, средний чек, рост
# ════════════════════════════════════════════════════════════════

@router.get("/business")
async def business_overview(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Главные бизнес-метрики с сравнением по периодам.
    """
    _require_admin(user)
    now = datetime.now(timezone.utc)
    current_start = now - timedelta(days=days)
    prev_start = current_start - timedelta(days=days)

    # --- Current period ---
    cur = await db.execute(
        select(
            func.count(Transaction.id).label("tx_count"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.EARN, Transaction.purchase_amount),
                else_=Decimal(0)
            )), 0).label("revenue"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.EARN, Transaction.amount),
                else_=Decimal(0)
            )), 0).label("bonus_issued"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.SPEND, Transaction.amount),
                else_=Decimal(0)
            )), 0).label("bonus_spent"),
            func.count(distinct(case(
                (Transaction.type == TransactionType.EARN, Transaction.customer_id),
            ))).label("active_buyers"),
        ).where(Transaction.created_at >= current_start)
    )
    c = cur.one()

    # --- Previous period ---
    prev = await db.execute(
        select(
            func.count(Transaction.id).label("tx_count"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.EARN, Transaction.purchase_amount),
                else_=Decimal(0)
            )), 0).label("revenue"),
            func.count(distinct(case(
                (Transaction.type == TransactionType.EARN, Transaction.customer_id),
            ))).label("active_buyers"),
        ).where(and_(Transaction.created_at >= prev_start, Transaction.created_at < current_start))
    )
    p = prev.one()

    # New customers
    new_cur = await db.execute(
        select(func.count(Customer.id)).where(Customer.created_at >= current_start)
    )
    new_prev = await db.execute(
        select(func.count(Customer.id)).where(and_(Customer.created_at >= prev_start, Customer.created_at < current_start))
    )
    new_customers_cur = new_cur.scalar() or 0
    new_customers_prev = new_prev.scalar() or 0

    # Total customers & balance
    totals = await db.execute(
        select(
            func.count(Customer.id).label("total"),
            func.count(case((Customer.is_active == True, 1))).label("active"),
        )
    )
    t = totals.one()
    total_balance = await db.execute(select(func.coalesce(func.sum(BonusAccount.balance), 0)))
    bal = total_balance.scalar()

    # Average check
    avg_check_cur = float(c.revenue) / max(c.tx_count, 1)
    avg_check_prev_q = await db.execute(
        select(func.coalesce(func.avg(Transaction.purchase_amount), 0)).where(
            and_(Transaction.created_at >= prev_start, Transaction.created_at < current_start,
                 Transaction.type == TransactionType.EARN, Transaction.purchase_amount > 0)
        )
    )
    avg_check_prev = float(avg_check_prev_q.scalar() or 0)

    # LTV = total revenue / total customers
    all_revenue = await db.execute(
        select(func.coalesce(func.sum(Transaction.purchase_amount), 0)).where(
            Transaction.type == TransactionType.EARN
        )
    )
    ltv = float(all_revenue.scalar() or 0) / max(t.total, 1)

    # Repeat purchase rate
    repeat_q = await db.execute(
        select(func.count()).select_from(
            select(Transaction.customer_id).where(
                and_(Transaction.type == TransactionType.EARN, Transaction.created_at >= current_start)
            ).group_by(Transaction.customer_id).having(func.count(Transaction.id) > 1).subquery()
        )
    )
    repeat_buyers = repeat_q.scalar() or 0
    retention_rate = round(repeat_buyers / max(c.active_buyers, 1) * 100, 1)

    # Bonus burn rate
    burn_rate = round(float(c.bonus_spent) / max(float(c.bonus_issued), 1) * 100, 1)

    def change_pct(cur_val, prev_val):
        if prev_val == 0: return 100.0 if cur_val > 0 else 0.0
        return round((cur_val - prev_val) / prev_val * 100, 1)

    return {
        "period_days": days,
        # Revenue
        "revenue_current": float(c.revenue),
        "revenue_previous": float(p.revenue),
        "revenue_change_pct": change_pct(float(c.revenue), float(p.revenue)),
        # Transactions
        "transactions_current": c.tx_count,
        "transactions_previous": p.tx_count,
        "transactions_change_pct": change_pct(c.tx_count, p.tx_count),
        # Average check
        "avg_check_current": round(avg_check_cur, 0),
        "avg_check_previous": round(avg_check_prev, 0),
        "avg_check_change_pct": change_pct(avg_check_cur, avg_check_prev),
        # Customers
        "new_customers_current": new_customers_cur,
        "new_customers_previous": new_customers_prev,
        "new_customers_change_pct": change_pct(new_customers_cur, new_customers_prev),
        "total_customers": t.total,
        "active_customers": t.active,
        "active_buyers": c.active_buyers,
        "active_buyers_previous": p.active_buyers,
        # LTV & retention
        "average_ltv": round(ltv, 0),
        "retention_rate": retention_rate,
        "repeat_buyers": repeat_buyers,
        # Bonus health
        "bonus_issued": float(c.bonus_issued),
        "bonus_spent": float(c.bonus_spent),
        "bonus_balance": float(bal),
        "burn_rate": burn_rate,
    }


# ════════════════════════════════════════════════════════════════
#  2. КОГОРТНЫЙ АНАЛИЗ — retention по месяцам регистрации
# ════════════════════════════════════════════════════════════════

@router.get("/cohorts")
async def cohort_analysis(
    months: int = Query(6, ge=2, le=12),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Когортный анализ: какой % клиентов из месяца регистрации
    совершает покупки в следующие месяцы.
    """
    _require_admin(user)
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=months * 31)

    # Get all customers registered in period with their purchase months
    q = await db.execute(
        select(
            func.date_trunc('month', Customer.created_at).label("reg_month"),
            func.date_trunc('month', Transaction.created_at).label("tx_month"),
            Customer.id,
        ).outerjoin(Transaction, and_(
            Transaction.customer_id == Customer.id,
            Transaction.type == TransactionType.EARN,
        )).where(Customer.created_at >= start)
    )
    rows = q.all()

    # Build cohort data
    cohorts = {}
    for row in rows:
        reg = row.reg_month.strftime("%Y-%m") if row.reg_month else None
        if not reg: continue

        if reg not in cohorts:
            cohorts[reg] = {"customers": set(), "months": {}}
        cohorts[reg]["customers"].add(row.id)

        if row.tx_month:
            tx_m = row.tx_month.strftime("%Y-%m")
            # Calculate month offset
            reg_dt = row.reg_month
            tx_dt = row.tx_month
            offset = (tx_dt.year - reg_dt.year) * 12 + (tx_dt.month - reg_dt.month)
            if offset >= 0:
                if offset not in cohorts[reg]["months"]:
                    cohorts[reg]["months"][offset] = set()
                cohorts[reg]["months"][offset].add(row.id)

    # Format response
    result = []
    for month_key in sorted(cohorts.keys()):
        c = cohorts[month_key]
        total = len(c["customers"])
        retention = {}
        for offset in range(months):
            active = len(c["months"].get(offset, set()))
            retention[f"m{offset}"] = round(active / max(total, 1) * 100, 1)

        result.append({
            "cohort": month_key,
            "size": total,
            "retention": retention,
        })

    return {"months": months, "cohorts": result}


# ════════════════════════════════════════════════════════════════
#  3. RFM-СЕГМЕНТАЦИЯ — Recency, Frequency, Monetary
# ════════════════════════════════════════════════════════════════

@router.get("/rfm")
async def rfm_segmentation(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    RFM-анализ: сегментация клиентов по давности, частоте и сумме покупок.

    Сегменты:
    - Чемпионы: недавно, часто, много
    - Лояльные: часто, много
    - Потенциальные: недавно, мало опыта
    - Новички: только зарегистрировались
    - Засыпающие: давно не покупали
    - В группе риска: были активны, давно нет
    - Потерянные: очень давно
    """
    _require_admin(user)
    now = datetime.now(timezone.utc)

    # Get RFM data per customer
    q = await db.execute(
        select(
            Customer.id,
            Customer.full_name,
            Customer.phone,
            func.max(Transaction.created_at).label("last_purchase"),
            func.count(Transaction.id).label("frequency"),
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("monetary"),
        ).outerjoin(Transaction, and_(
            Transaction.customer_id == Customer.id,
            Transaction.type == TransactionType.EARN,
        )).where(Customer.is_active == True)
        .group_by(Customer.id, Customer.full_name, Customer.phone)
    )
    customers = q.all()

    if not customers:
        return {"segments": [], "total": 0}

    # Calculate percentiles for scoring
    recencies = []
    frequencies = []
    monetaries = []

    for c in customers:
        if c.last_purchase:
            recencies.append((now - c.last_purchase).days)
        frequencies.append(c.frequency)
        monetaries.append(float(c.monetary))

    def percentile(arr, p):
        if not arr: return 0
        s = sorted(arr)
        k = (len(s) - 1) * p / 100
        f = int(k)
        c_idx = f + 1 if f + 1 < len(s) else f
        return s[f] + (k - f) * (s[c_idx] - s[f])

    r_33 = percentile(recencies, 33) if recencies else 7
    r_66 = percentile(recencies, 66) if recencies else 30
    f_33 = percentile(frequencies, 33) if frequencies else 2
    f_66 = percentile(frequencies, 66) if frequencies else 5
    m_33 = percentile(monetaries, 33) if monetaries else 1000
    m_66 = percentile(monetaries, 66) if monetaries else 5000

    segments = {
        "champions": {"label": "Чемпионы", "color": "#22c55e", "description": "Покупают часто, недавно, на большие суммы", "customers": []},
        "loyal": {"label": "Лояльные", "color": "#3b82f6", "description": "Регулярные покупатели, хороший средний чек", "customers": []},
        "potential": {"label": "Перспективные", "color": "#a855f7", "description": "Недавние клиенты с потенциалом роста", "customers": []},
        "new": {"label": "Новички", "color": "#06b6d4", "description": "Только пришли, нужно вовлечь", "customers": []},
        "sleeping": {"label": "Засыпающие", "color": "#f59e0b", "description": "Были активны, начинают уходить", "customers": []},
        "at_risk": {"label": "В группе риска", "color": "#f97316", "description": "Давно не покупали, нужна реактивация", "customers": []},
        "lost": {"label": "Потерянные", "color": "#ef4444", "description": "Очень давно нет активности", "customers": []},
    }

    for c in customers:
        if not c.last_purchase:
            seg = "new" if c.frequency == 0 else "lost"
        else:
            days_ago = (now - c.last_purchase).days
            freq = c.frequency
            money = float(c.monetary)

            if days_ago <= r_33 and freq >= f_66 and money >= m_66:
                seg = "champions"
            elif freq >= f_66 and money >= m_33:
                seg = "loyal"
            elif days_ago <= r_33 and freq <= f_33:
                seg = "potential"
            elif days_ago <= r_33:
                seg = "new"
            elif days_ago <= r_66:
                seg = "sleeping"
            elif days_ago <= r_66 * 2:
                seg = "at_risk"
            else:
                seg = "lost"

        segments[seg]["customers"].append({
            "id": str(c.id),
            "name": c.full_name,
            "phone": c.phone,
            "last_purchase": c.last_purchase.isoformat() if c.last_purchase else None,
            "frequency": c.frequency,
            "monetary": float(c.monetary),
        })

    result = []
    for key, data in segments.items():
        result.append({
            "segment": key,
            "label": data["label"],
            "color": data["color"],
            "description": data["description"],
            "count": len(data["customers"]),
            "total_monetary": sum(c["monetary"] for c in data["customers"]),
            "avg_frequency": round(sum(c["frequency"] for c in data["customers"]) / max(len(data["customers"]), 1), 1),
            "top_customers": sorted(data["customers"], key=lambda x: x["monetary"], reverse=True)[:5],
        })

    return {"segments": result, "total": len(customers)}


# ════════════════════════════════════════════════════════════════
#  4. ВОРОНКА КЛИЕНТОВ
# ════════════════════════════════════════════════════════════════

@router.get("/funnel")
async def customer_funnel(
    days: int = Query(90, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Воронка: Регистрация → Первая покупка → Повторная → Постоянный → Потерян.
    """
    _require_admin(user)
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    # Total registered
    registered = await db.execute(
        select(func.count(Customer.id)).where(Customer.created_at >= since)
    )
    total_registered = registered.scalar() or 0

    # Made at least 1 purchase
    first_purchase = await db.execute(
        select(func.count(distinct(Transaction.customer_id))).where(
            and_(Transaction.type == TransactionType.EARN, Transaction.created_at >= since,
                 Transaction.customer_id.in_(
                     select(Customer.id).where(Customer.created_at >= since)
                 ))
        )
    )
    total_first = first_purchase.scalar() or 0

    # Made 2+ purchases
    repeat_q = await db.execute(
        select(func.count()).select_from(
            select(Transaction.customer_id).where(
                and_(Transaction.type == TransactionType.EARN, Transaction.created_at >= since,
                     Transaction.customer_id.in_(
                         select(Customer.id).where(Customer.created_at >= since)
                     ))
            ).group_by(Transaction.customer_id).having(func.count(Transaction.id) >= 2).subquery()
        )
    )
    total_repeat = repeat_q.scalar() or 0

    # Made 5+ purchases (loyal)
    loyal_q = await db.execute(
        select(func.count()).select_from(
            select(Transaction.customer_id).where(
                and_(Transaction.type == TransactionType.EARN, Transaction.created_at >= since,
                     Transaction.customer_id.in_(
                         select(Customer.id).where(Customer.created_at >= since)
                     ))
            ).group_by(Transaction.customer_id).having(func.count(Transaction.id) >= 5).subquery()
        )
    )
    total_loyal = loyal_q.scalar() or 0

    # Used bonus (spent)
    spent_q = await db.execute(
        select(func.count(distinct(Transaction.customer_id))).where(
            and_(Transaction.type == TransactionType.SPEND, Transaction.created_at >= since,
                 Transaction.customer_id.in_(
                     select(Customer.id).where(Customer.created_at >= since)
                 ))
        )
    )
    total_spent = spent_q.scalar() or 0

    # Referred someone
    referred_q = await db.execute(
        select(func.count(distinct(Customer.referred_by))).where(
            and_(Customer.created_at >= since, Customer.referred_by.is_not(None))
        )
    )
    total_referrers = referred_q.scalar() or 0

    funnel = [
        {"step": "registered", "label": "Зарегистрировались", "count": total_registered, "pct": 100},
        {"step": "first_purchase", "label": "Первая покупка", "count": total_first,
         "pct": round(total_first / max(total_registered, 1) * 100, 1)},
        {"step": "used_bonus", "label": "Использовали бонусы", "count": total_spent,
         "pct": round(total_spent / max(total_registered, 1) * 100, 1)},
        {"step": "repeat_purchase", "label": "Повторная покупка (2+)", "count": total_repeat,
         "pct": round(total_repeat / max(total_registered, 1) * 100, 1)},
        {"step": "loyal", "label": "Постоянный клиент (5+)", "count": total_loyal,
         "pct": round(total_loyal / max(total_registered, 1) * 100, 1)},
        {"step": "referrer", "label": "Привёл друга", "count": total_referrers,
         "pct": round(total_referrers / max(total_registered, 1) * 100, 1)},
    ]

    return {"period_days": days, "funnel": funnel}


# ════════════════════════════════════════════════════════════════
#  5. МАРКЕТИНГ ROI — кампании, промокоды, реферал
# ════════════════════════════════════════════════════════════════

@router.get("/marketing")
async def marketing_roi(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    ROI маркетинговых инструментов: кампании, промокоды, реферальная программа.
    """
    _require_admin(user)
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    # Campaign stats
    campaigns_q = await db.execute(
        select(
            func.count(BonusCampaign.id).label("total"),
            func.count(case((BonusCampaign.status == CampaignStatus.SENT, 1))).label("sent"),
        ).where(BonusCampaign.created_at >= since)
    )
    camp = campaigns_q.one()

    # Campaign bonus cost
    camp_cost = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(Transaction.type == TransactionType.CAMPAIGN, Transaction.created_at >= since)
        )
    )
    campaign_cost = float(camp_cost.scalar() or 0)

    # Promo cost
    promo_cost_q = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(Transaction.type == TransactionType.PROMO, Transaction.created_at >= since)
        )
    )
    promo_cost = float(promo_cost_q.scalar() or 0)

    # Referral cost
    ref_cost_q = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(Transaction.type == TransactionType.REFERRAL, Transaction.created_at >= since)
        )
    )
    referral_cost = float(ref_cost_q.scalar() or 0)

    # Referral new customers
    ref_new = await db.execute(
        select(func.count(Customer.id)).where(
            and_(Customer.created_at >= since, Customer.referred_by.is_not(None))
        )
    )
    referral_new_customers = ref_new.scalar() or 0

    # Revenue from referred customers
    ref_revenue = await db.execute(
        select(func.coalesce(func.sum(Transaction.purchase_amount), 0)).where(
            and_(Transaction.type == TransactionType.EARN, Transaction.created_at >= since,
                 Transaction.customer_id.in_(
                     select(Customer.id).where(Customer.referred_by.is_not(None))
                 ))
        )
    )
    referral_revenue = float(ref_revenue.scalar() or 0)

    # Notification delivery
    notif_q = await db.execute(
        select(
            func.count(Notification.id).label("total"),
            func.count(case((Notification.status == NotificationStatus.SENT, 1))).label("sent"),
            func.count(case((Notification.status == NotificationStatus.FAILED, 1))).label("failed"),
        ).where(Notification.created_at >= since)
    )
    notif = notif_q.one()

    total_marketing_cost = campaign_cost + promo_cost + referral_cost

    return {
        "period_days": days,
        "campaigns": {
            "total": camp.total,
            "sent": camp.sent,
            "bonus_cost": campaign_cost,
        },
        "promo_codes": {
            "bonus_cost": promo_cost,
        },
        "referral": {
            "new_customers": referral_new_customers,
            "bonus_cost": referral_cost,
            "revenue_generated": referral_revenue,
            "roi": round(referral_revenue / max(referral_cost, 1) * 100 - 100, 1) if referral_cost > 0 else 0,
        },
        "notifications": {
            "total": notif.total,
            "sent": notif.sent,
            "failed": notif.failed,
            "delivery_rate": round(notif.sent / max(notif.total, 1) * 100, 1),
        },
        "total_marketing_cost": total_marketing_cost,
    }


# ════════════════════════════════════════════════════════════════
#  6. REAL-TIME МОНИТОРИНГ
# ════════════════════════════════════════════════════════════════

@router.get("/realtime")
async def realtime_monitor(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Real-time данные: сегодня, последний час, последние транзакции.
    """
    _require_admin(user)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    hour_ago = now - timedelta(hours=1)

    # Today stats
    today_q = await db.execute(
        select(
            func.count(Transaction.id).label("tx_count"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.EARN, Transaction.purchase_amount),
                else_=Decimal(0)
            )), 0).label("revenue"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.EARN, Transaction.amount),
                else_=Decimal(0)
            )), 0).label("bonus_earned"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.SPEND, Transaction.amount),
                else_=Decimal(0)
            )), 0).label("bonus_spent"),
            func.count(distinct(Transaction.customer_id)).label("unique_customers"),
        ).where(Transaction.created_at >= today_start)
    )
    td = today_q.one()

    # Last hour
    hour_q = await db.execute(
        select(
            func.count(Transaction.id).label("tx_count"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.EARN, Transaction.purchase_amount),
                else_=Decimal(0)
            )), 0).label("revenue"),
        ).where(Transaction.created_at >= hour_ago)
    )
    hr = hour_q.one()

    # New customers today
    new_today = await db.execute(
        select(func.count(Customer.id)).where(Customer.created_at >= today_start)
    )

    # Last 15 transactions
    recent_q = await db.execute(
        select(
            Transaction.id, Transaction.type, Transaction.amount,
            Transaction.purchase_amount, Transaction.created_at, Transaction.note,
            Customer.full_name, Customer.phone,
        ).join(Customer, Transaction.customer_id == Customer.id)
        .order_by(Transaction.created_at.desc()).limit(15)
    )
    recent = []
    for r in recent_q.all():
        recent.append({
            "id": str(r.id),
            "type": r.type.value,
            "amount": float(r.amount),
            "purchase_amount": float(r.purchase_amount) if r.purchase_amount else None,
            "customer": r.full_name,
            "phone": r.phone,
            "note": r.note,
            "time": r.created_at.isoformat(),
            "ago": _time_ago(now, r.created_at),
        })

    # Hourly breakdown today
    hourly_q = await db.execute(
        select(
            extract('hour', Transaction.created_at).label("hour"),
            func.count(Transaction.id).label("count"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.EARN, Transaction.purchase_amount),
                else_=Decimal(0)
            )), 0).label("revenue"),
        ).where(Transaction.created_at >= today_start)
        .group_by(extract('hour', Transaction.created_at))
        .order_by(extract('hour', Transaction.created_at))
    )
    hourly = [{"hour": int(h.hour), "count": h.count, "revenue": float(h.revenue)} for h in hourly_q.all()]

    return {
        "timestamp": now.isoformat(),
        "today": {
            "transactions": td.tx_count,
            "revenue": float(td.revenue),
            "bonus_earned": float(td.bonus_earned),
            "bonus_spent": float(td.bonus_spent),
            "unique_customers": td.unique_customers,
            "new_customers": new_today.scalar() or 0,
        },
        "last_hour": {
            "transactions": hr.tx_count,
            "revenue": float(hr.revenue),
        },
        "recent_transactions": recent,
        "hourly_today": hourly,
    }


def _time_ago(now, dt):
    diff = now - dt
    seconds = int(diff.total_seconds())
    if seconds < 60: return f"{seconds} сек назад"
    if seconds < 3600: return f"{seconds // 60} мин назад"
    if seconds < 86400: return f"{seconds // 3600} ч назад"
    return f"{seconds // 86400} дн назад"


# ════════════════════════════════════════════════════════════════
#  7. ЕЖЕДНЕВНЫЙ ТРЕНД ПО ДНЯМ (для графиков)
# ════════════════════════════════════════════════════════════════

@router.get("/daily-trends")
async def daily_trends(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Данные по дням для графиков: выручка, транзакции, новые клиенты."""
    _require_admin(user)
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    q = await db.execute(
        select(
            func.date_trunc('day', Transaction.created_at).label("day"),
            func.count(Transaction.id).label("tx_count"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.EARN, Transaction.purchase_amount),
                else_=Decimal(0)
            )), 0).label("revenue"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.EARN, Transaction.amount),
                else_=Decimal(0)
            )), 0).label("bonus_earned"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.SPEND, Transaction.amount),
                else_=Decimal(0)
            )), 0).label("bonus_spent"),
            func.count(distinct(Transaction.customer_id)).label("active_customers"),
        ).where(Transaction.created_at >= since)
        .group_by(func.date_trunc('day', Transaction.created_at))
        .order_by(func.date_trunc('day', Transaction.created_at))
    )

    # New customers by day
    new_q = await db.execute(
        select(
            func.date_trunc('day', Customer.created_at).label("day"),
            func.count(Customer.id).label("new_count"),
        ).where(Customer.created_at >= since)
        .group_by(func.date_trunc('day', Customer.created_at))
    )
    new_map = {r.day.strftime("%Y-%m-%d"): r.new_count for r in new_q.all()}

    result = []
    for r in q.all():
        day_str = r.day.strftime("%Y-%m-%d")
        result.append({
            "date": day_str,
            "revenue": float(r.revenue),
            "bonus_earned": float(r.bonus_earned),
            "bonus_spent": float(r.bonus_spent),
            "transactions": r.tx_count,
            "active_customers": r.active_customers,
            "new_customers": new_map.get(day_str, 0),
        })

    return {"days": days, "data": result}
