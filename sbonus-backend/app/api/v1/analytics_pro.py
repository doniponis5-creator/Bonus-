"""
S Bonus+ — PRO Analytics API.
Бизнес-аналитика, когортный анализ, RFM-сегментация, воронка клиентов,
маркетинг ROI, и real-time мониторинг.
"""

import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case, distinct, and_, extract, literal_column
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role, UserRole
from app.models import (
    Customer, Transaction, TransactionType, BonusAccount,
    BonusCampaign, CampaignStatus,
    Notification, NotificationStatus,
)

router = APIRouter(prefix="/analytics-pro", tags=["analytics-pro"])


def _txn_branch_cond(user: dict):
    """Условие фильтра транзакций по филиалу (branch-админ видит только свой)."""
    if user and user.get("role") == UserRole.BRANCH_ADMIN.value and user.get("branch_id"):
        try:
            return Transaction.branch_id == uuid.UUID(str(user["branch_id"]))
        except (ValueError, TypeError):
            return None
    return None




# ═══════════════════════════════════════════════════
#  1. БИЗНЕС-ОБЗОР — KPI с сравнением по периодам
# ═══════════════════════════════════════════════════

@router.get("/business", dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def business_overview(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    current_start = now - timedelta(days=days)
    prev_start = current_start - timedelta(days=days)
    bcond = _txn_branch_cond(user)  # None для super-admin → вся сеть

    def _cur(*extra):
        conds = [Transaction.created_at >= current_start, *extra]
        if bcond is not None:
            conds.append(bcond)
        return and_(*conds)

    def _prev(*extra):
        conds = [Transaction.created_at >= prev_start, Transaction.created_at < current_start, *extra]
        if bcond is not None:
            conds.append(bcond)
        return and_(*conds)

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
        ).where(_cur())
    )
    c = cur.one()

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
        ).where(_prev())
    )
    p = prev.one()

    avg_check_cur = float(c.revenue) / max(c.tx_count, 1)
    avg_check_prev_q = await db.execute(
        select(func.coalesce(func.avg(Transaction.purchase_amount), 0)).where(
            _prev(Transaction.type == TransactionType.EARN, Transaction.purchase_amount > 0)
        )
    )
    avg_check_prev = float(avg_check_prev_q.scalar() or 0)

    totals = await db.execute(select(func.count(Customer.id)))
    total_customers = totals.scalar() or 1
    all_revenue = await db.execute(
        select(func.coalesce(func.sum(Transaction.purchase_amount), 0)).where(
            Transaction.type == TransactionType.EARN
        )
    )
    ltv = float(all_revenue.scalar() or 0) / max(total_customers, 1)

    prev_ltv_q = await db.execute(
        select(func.coalesce(func.sum(Transaction.purchase_amount), 0)).where(
            and_(Transaction.type == TransactionType.EARN, Transaction.created_at < current_start)
        )
    )
    prev_total_cust_q = await db.execute(
        select(func.count(Customer.id)).where(Customer.created_at < current_start)
    )
    prev_total_cust = prev_total_cust_q.scalar() or 1
    prev_ltv = float(prev_ltv_q.scalar() or 0) / max(prev_total_cust, 1)

    # % использования: потрачено / начислено (грубая ликвидность, не когортная)
    burn_rate = round(float(c.bonus_spent) / max(float(c.bonus_issued), 1) * 100, 1)

    # ── Разбивка ВСЕХ начисленных бонусов строго по типу транзакции ──
    # (точная атрибуция вместо хрупкого поиска по тексту заметки)
    bd_rows = await db.execute(
        select(Transaction.type, func.coalesce(func.sum(Transaction.amount), 0)).where(
            _cur(
                Transaction.type.in_([
                    TransactionType.EARN, TransactionType.PROMO, TransactionType.BIRTHDAY,
                    TransactionType.CAMPAIGN, TransactionType.REFERRAL,
                ]),
                Transaction.amount > 0,
            )
        ).group_by(Transaction.type)
    )
    bd_map = {row[0]: float(row[1]) for row in bd_rows.all()}
    bonus_breakdown = {
        "cashback": bd_map.get(TransactionType.EARN, 0.0),       # кешбэк за покупки
        "wheel_promo": bd_map.get(TransactionType.PROMO, 0.0),   # колесо + промокоды
        "birthday": bd_map.get(TransactionType.BIRTHDAY, 0.0),   # дни рождения
        "campaigns": bd_map.get(TransactionType.CAMPAIGN, 0.0),  # рассылки/подарки
        "referral": bd_map.get(TransactionType.REFERRAL, 0.0),   # рефералы
    }
    bonus_issued_all = round(sum(bonus_breakdown.values()), 2)

    revenue_f = float(c.revenue)
    # Стоимость программы:
    #  issued  — НАЧИСЛЕНО (максимальная потенциальная стоимость / обязательство)
    #  real    — РЕАЛЬНО ПОТРАЧЕНО клиентами за период (фактический расход кэшем)
    bonus_cost_pct = round(bonus_issued_all / revenue_f * 100, 1) if revenue_f > 0 else 0.0
    bonus_real_cost_pct = round(float(c.bonus_spent) / revenue_f * 100, 1) if revenue_f > 0 else 0.0

    prev_bd = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            _prev(Transaction.type.in_([
                TransactionType.EARN, TransactionType.PROMO, TransactionType.BIRTHDAY,
                TransactionType.CAMPAIGN, TransactionType.REFERRAL,
            ]), Transaction.amount > 0)
        )
    )
    prev_bonus_issued_all = float(prev_bd.scalar() or 0)
    prev_revenue_f = float(p.revenue)
    prev_bonus_cost_pct = round(prev_bonus_issued_all / prev_revenue_f * 100, 1) if prev_revenue_f > 0 else 0.0

    prev_burn_issued = await db.execute(
        select(func.coalesce(func.sum(case(
            (Transaction.type == TransactionType.EARN, Transaction.amount), else_=Decimal(0)
        )), 0)).where(_prev())
    )
    prev_burn_spent = await db.execute(
        select(func.coalesce(func.sum(case(
            (Transaction.type == TransactionType.SPEND, Transaction.amount), else_=Decimal(0)
        )), 0)).where(_prev())
    )
    pi = float(prev_burn_issued.scalar() or 0)
    ps = float(prev_burn_spent.scalar() or 0)
    prev_burn_rate = round(ps / max(pi, 1) * 100, 1)

    # Keys match frontend exactly
    return {
        "revenue": revenue_f,
        "prev_revenue": float(p.revenue),
        "tx_count": c.tx_count,
        "prev_tx_count": p.tx_count,
        "avg_check": round(avg_check_cur, 0),
        "prev_avg_check": round(avg_check_prev, 0),
        "active_buyers": c.active_buyers,
        "prev_active_buyers": p.active_buyers,
        "ltv": round(ltv, 0),
        "prev_ltv": round(prev_ltv, 0),
        "burn_rate": burn_rate,
        "prev_burn_rate": prev_burn_rate,
        "bonus_issued": float(c.bonus_issued),
        "bonus_spent": float(c.bonus_spent),
        "bonus_issued_all": bonus_issued_all,
        "bonus_breakdown": bonus_breakdown,
        "bonus_cost_pct": bonus_cost_pct,
        "prev_bonus_cost_pct": prev_bonus_cost_pct,
        "bonus_real_cost_pct": bonus_real_cost_pct,
    }


# ═══════════════════════════════════════════════════
#  2. КОГОРТНЫЙ АНАЛИЗ
# ═══════════════════════════════════════════════════

@router.get("/cohorts", dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def cohort_analysis(
    months: int = Query(6, ge=2, le=12),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=months * 31)

    q = await db.execute(
        select(
            func.date_trunc(literal_column("'month'"), Customer.created_at).label("reg_month"),
            func.date_trunc(literal_column("'month'"), Transaction.created_at).label("tx_month"),
            Customer.id,
        ).outerjoin(Transaction, and_(
            Transaction.customer_id == Customer.id,
            Transaction.type == TransactionType.EARN,
        )).where(Customer.created_at >= start)
    )
    rows = q.all()

    cohorts_dict: dict = {}
    for row in rows:
        if not row.reg_month:
            continue
        reg = row.reg_month.strftime("%Y-%m")
        if reg not in cohorts_dict:
            cohorts_dict[reg] = {"customers": set(), "months": {}}
        cohorts_dict[reg]["customers"].add(row.id)

        if row.tx_month:
            reg_dt = row.reg_month
            tx_dt = row.tx_month
            offset = (tx_dt.year - reg_dt.year) * 12 + (tx_dt.month - reg_dt.month)
            if offset >= 0:
                if offset not in cohorts_dict[reg]["months"]:
                    cohorts_dict[reg]["months"][offset] = set()
                cohorts_dict[reg]["months"][offset].add(row.id)

    result = []
    for month_key in sorted(cohorts_dict.keys()):
        cd = cohorts_dict[month_key]
        total = len(cd["customers"])
        # Return retention as array of numbers (frontend expects array)
        retention_arr = []
        for offset in range(months):
            active = len(cd["months"].get(offset, set()))
            retention_arr.append(round(active / max(total, 1) * 100, 1))

        result.append({
            "month": month_key,
            "size": total,
            "retention": retention_arr,
        })

    return {"cohorts": result}


# ═══════════════════════════════════════════════════
#  3. RFM-СЕГМЕНТАЦИЯ
# ═══════════════════════════════════════════════════

@router.get("/rfm", dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def rfm_segmentation(
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)

    q = await db.execute(
        select(
            Customer.id,
            func.max(Transaction.created_at).label("last_purchase"),
            func.count(Transaction.id).label("frequency"),
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("monetary"),
        ).outerjoin(Transaction, and_(
            Transaction.customer_id == Customer.id,
            Transaction.type == TransactionType.EARN,
        )).where(Customer.is_active == True)
        .group_by(Customer.id)
    )
    customers = q.all()

    if not customers:
        return {"segments": {}, "total": 0}

    recencies = []
    frequencies = []
    monetaries = []
    for c in customers:
        if c.last_purchase:
            recencies.append((now - c.last_purchase).days)
        frequencies.append(c.frequency)
        monetaries.append(float(c.monetary))

    def percentile(arr, p):
        if not arr:
            return 0
        s = sorted(arr)
        k = (len(s) - 1) * p / 100
        f = int(k)
        c_idx = min(f + 1, len(s) - 1)
        return s[f] + (k - f) * (s[c_idx] - s[f])

    r_33 = percentile(recencies, 33) if recencies else 7
    r_66 = percentile(recencies, 66) if recencies else 30
    f_33 = percentile(frequencies, 33) if frequencies else 2
    f_66 = percentile(frequencies, 66) if frequencies else 5
    m_33 = percentile(monetaries, 33) if monetaries else 1000
    m_66 = percentile(monetaries, 66) if monetaries else 5000

    seg_counts: dict = {
        "champions": {"count": 0, "revenue": 0},
        "loyal": {"count": 0, "revenue": 0},
        "potential_loyal": {"count": 0, "revenue": 0},
        "new_customers": {"count": 0, "revenue": 0},
        "sleeping": {"count": 0, "revenue": 0},
        "at_risk": {"count": 0, "revenue": 0},
        "lost": {"count": 0, "revenue": 0},
    }

    for c in customers:
        money = float(c.monetary)
        if not c.last_purchase:
            seg = "new_customers" if c.frequency == 0 else "lost"
        else:
            days_ago = (now - c.last_purchase).days
            freq = c.frequency
            if days_ago <= r_33 and freq >= f_66 and money >= m_66:
                seg = "champions"
            elif freq >= f_66 and money >= m_33:
                seg = "loyal"
            elif days_ago <= r_33 and freq <= f_33:
                seg = "potential_loyal"
            elif days_ago <= r_33:
                seg = "new_customers"
            elif days_ago <= r_66:
                seg = "sleeping"
            elif days_ago <= r_66 * 2:
                seg = "at_risk"
            else:
                seg = "lost"

        seg_counts[seg]["count"] += 1
        seg_counts[seg]["revenue"] += money

    total = len(customers)
    # Frontend expects: segments dict with count, avg_revenue, percent
    segments_out = {}
    for key, data in seg_counts.items():
        segments_out[key] = {
            "count": data["count"],
            "percent": round(data["count"] / max(total, 1) * 100, 1),
            "avg_revenue": round(data["revenue"] / max(data["count"], 1), 0),
        }

    return {"segments": segments_out, "total": total}


# ═══════════════════════════════════════════════════
#  4. ВОРОНКА КЛИЕНТОВ
# ═══════════════════════════════════════════════════

@router.get("/funnel", dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def customer_funnel(
    days: int = Query(90, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    registered = await db.execute(
        select(func.count(Customer.id)).where(Customer.created_at >= since)
    )
    total_registered = registered.scalar() or 0

    first_purchase = await db.execute(
        select(func.count(distinct(Transaction.customer_id))).where(
            and_(Transaction.type == TransactionType.EARN, Transaction.created_at >= since,
                 Transaction.customer_id.in_(
                     select(Customer.id).where(Customer.created_at >= since)
                 ))
        )
    )
    total_first = first_purchase.scalar() or 0

    spent_q = await db.execute(
        select(func.count(distinct(Transaction.customer_id))).where(
            and_(Transaction.type == TransactionType.SPEND, Transaction.created_at >= since,
                 Transaction.customer_id.in_(
                     select(Customer.id).where(Customer.created_at >= since)
                 ))
        )
    )
    total_spent = spent_q.scalar() or 0

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

    referred_q = await db.execute(
        select(func.count(distinct(Customer.referred_by))).where(
            and_(Customer.created_at >= since, Customer.referred_by.is_not(None))
        )
    )
    total_referrers = referred_q.scalar() or 0

    # Frontend expects: steps[] with {key, value}
    return {
        "steps": [
            {"key": "registered", "value": total_registered},
            {"key": "first_purchase", "value": total_first},
            {"key": "used_bonus", "value": total_spent},
            {"key": "repeat_buyer", "value": total_repeat},
            {"key": "loyal", "value": total_loyal},
            {"key": "referrer", "value": total_referrers},
        ]
    }


# ═══════════════════════════════════════════════════
#  5. МАРКЕТИНГ ROI
# ═══════════════════════════════════════════════════

@router.get("/marketing", dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def marketing_roi(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    # Campaign list with ROI
    camp_q = await db.execute(
        select(BonusCampaign).where(BonusCampaign.created_at >= since).order_by(BonusCampaign.created_at.desc()).limit(10)
    )
    campaigns_list = []
    for camp in camp_q.scalars().all():
        cost_q = await db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                and_(Transaction.type == TransactionType.CAMPAIGN,
                     Transaction.created_at >= camp.created_at,
                     Transaction.note.ilike(f"%{camp.name[:20]}%"))
            )
        )
        bonus_cost = float(cost_q.scalar() or 0)
        campaigns_list.append({
            "name": camp.name,
            "sent": camp.sent_count,
            "bonus_cost": bonus_cost,
            "revenue": 0,
            "roi": 0,
        })

    # Promo codes
    promo_cost_q = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(Transaction.type == TransactionType.PROMO, Transaction.created_at >= since)
        )
    )
    promo_cost = float(promo_cost_q.scalar() or 0)

    # Referral
    ref_cost_q = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            and_(Transaction.type == TransactionType.REFERRAL, Transaction.created_at >= since)
        )
    )
    referral_cost = float(ref_cost_q.scalar() or 0)

    ref_new = await db.execute(
        select(func.count(Customer.id)).where(
            and_(Customer.created_at >= since, Customer.referred_by.is_not(None))
        )
    )
    referral_new_customers = ref_new.scalar() or 0

    active_referrers_q = await db.execute(
        select(func.count(distinct(Customer.referred_by))).where(
            and_(Customer.created_at >= since, Customer.referred_by.is_not(None))
        )
    )
    active_referrers = active_referrers_q.scalar() or 0

    ref_revenue = await db.execute(
        select(func.coalesce(func.sum(Transaction.purchase_amount), 0)).where(
            and_(Transaction.type == TransactionType.EARN, Transaction.created_at >= since,
                 Transaction.customer_id.in_(
                     select(Customer.id).where(Customer.referred_by.is_not(None))
                 ))
        )
    )
    referral_revenue = float(ref_revenue.scalar() or 0)
    ref_roi = round(referral_revenue / max(referral_cost, 1) * 100 - 100, 1) if referral_cost > 0 else 0

    # Frontend expects: campaigns[], promos[], referral{}
    return {
        "campaigns": campaigns_list,
        "promos": [],
        "referral": {
            "total_referrals": referral_new_customers,
            "active_referrers": active_referrers,
            "bonus_cost": referral_cost,
            "revenue_from_referred": referral_revenue,
            "roi": ref_roi,
        },
    }


# ═══════════════════════════════════════════════════
#  6. REAL-TIME МОНИТОРИНГ
# ═══════════════════════════════════════════════════

@router.get("/realtime", dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def realtime_monitor(
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    hour_ago = now - timedelta(hours=1)

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
    avg_check_today = float(td.revenue) / max(td.tx_count, 1)

    hour_q = await db.execute(
        select(
            func.count(Transaction.id).label("tx_count"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.EARN, Transaction.purchase_amount),
                else_=Decimal(0)
            )), 0).label("revenue"),
            func.count(distinct(Transaction.customer_id)).label("unique_customers"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.EARN, Transaction.amount), else_=Decimal(0)
            )), 0).label("bonus_issued"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.SPEND, Transaction.amount), else_=Decimal(0)
            )), 0).label("bonus_spent"),
        ).where(Transaction.created_at >= hour_ago)
    )
    hr = hour_q.one()

    new_today = await db.execute(
        select(func.count(Customer.id)).where(Customer.created_at >= today_start)
    )

    recent_q = await db.execute(
        select(
            Transaction.id, Transaction.type, Transaction.amount,
            Transaction.purchase_amount, Transaction.created_at,
            Customer.full_name, Customer.phone,
        ).join(Customer, Transaction.customer_id == Customer.id)
        .order_by(Transaction.created_at.desc()).limit(15)
    )
    recent = []
    for r in recent_q.all():
        recent.append({
            "type": r.type.value if hasattr(r.type, 'value') else str(r.type),
            "amount": float(r.amount),
            "purchase_amount": float(r.purchase_amount) if r.purchase_amount else 0,
            "customer_name": r.full_name,
            "customer_phone": r.phone,
            "created_at": r.created_at.isoformat(),
        })

    hourly_q = await db.execute(
        select(
            extract('hour', Transaction.created_at).label("hour"),
            func.count(Transaction.id).label("tx_count"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.EARN, Transaction.purchase_amount),
                else_=Decimal(0)
            )), 0).label("revenue"),
        ).where(Transaction.created_at >= today_start)
        .group_by(extract('hour', Transaction.created_at))
        .order_by(extract('hour', Transaction.created_at))
    )
    hourly = [{"hour": int(h.hour), "tx_count": h.tx_count, "revenue": float(h.revenue)} for h in hourly_q.all()]

    return {
        "today": {
            "revenue": float(td.revenue),
            "tx_count": td.tx_count,
            "active_customers": td.unique_customers,
            "avg_check": round(avg_check_today, 0),
            "new_registrations": new_today.scalar() or 0,
        },
        "last_hour": {
            "tx_count": hr.tx_count,
            "revenue": float(hr.revenue),
            "unique_customers": hr.unique_customers,
            "bonus_issued": float(hr.bonus_issued),
            "bonus_spent": float(hr.bonus_spent),
        },
        "recent_transactions": recent,
        "hourly_breakdown": hourly,
    }


# ═══════════════════════════════════════════════════
#  7. ЕЖЕДНЕВНЫЙ ТРЕНД
# ═══════════════════════════════════════════════════

@router.get("/daily-trends", dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def daily_trends(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)

    q = await db.execute(
        select(
            func.date_trunc(literal_column("'day'"), Transaction.created_at).label("day"),
            func.count(Transaction.id).label("tx_count"),
            func.coalesce(func.sum(case(
                (Transaction.type == TransactionType.EARN, Transaction.purchase_amount),
                else_=Decimal(0)
            )), 0).label("revenue"),
            func.count(distinct(Transaction.customer_id)).label("active_customers"),
        ).where(Transaction.created_at >= since)
        .group_by(func.date_trunc(literal_column("'day'"), Transaction.created_at))
        .order_by(func.date_trunc(literal_column("'day'"), Transaction.created_at))
    )

    result = []
    for r in q.all():
        rev = float(r.revenue)
        result.append({
            "date": r.day.strftime("%Y-%m-%d"),
            "revenue": rev,
            "tx_count": r.tx_count,
            "avg_check": round(rev / max(r.tx_count, 1), 0),
        })

    return {"trends": result}


# ═══════════════════════════════════════════
# Smart Notification Stats
# ═══════════════════════════════════════════

@router.get("/smart-notifications")
async def get_smart_notification_stats_endpoint(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
):
    """Статистика smart уведомлений."""
    from app.services.smart_notifications import get_smart_notification_stats
    return await get_smart_notification_stats(db, days)
