"""
SBonus+ — Customer 360 API.

Полный профиль клиента: LTV, RFM, churn risk, top products,
visit pattern, timeline, referral tree.

GET /api/v1/admin/customer360/{customer_id}
"""

import logging
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, and_, desc, case, extract
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import UserRole, require_role
from app.models import (
    BonusAccount, BonusCampaign, BonusCampaignRecipient,
    Coupon, Customer, CustomerDebt,
    Product, PurchaseItem, ReviewRequest,
    Setting, Tier, Transaction, TransactionType,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/admin/customer360",
    tags=["Customer 360"],
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)


@router.get("/{customer_id}")
async def get_customer_360(
    customer_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Полный профиль клиента — Customer 360.

    Возвращает:
    - basic: ФИО, телефон, QR, уровень, дата регистрации
    - balance: текущий баланс, заработано/потрачено всего
    - ltv: lifetime value (сумма всех покупок)
    - rfm: Recency, Frequency, Monetary scores
    - churn_risk: уровень риска оттока
    - visit_pattern: по дням недели и часам
    - top_products: топ-10 товаров
    - timeline: последние 20 транзакций
    - referrals: рефералы клиента
    - coupons: активные купоны
    - debts: активные долги
    - campaigns_received: полученные кампании
    """
    # ── Загрузка клиента ──────────────────
    result = await db.execute(
        select(Customer)
        .options(selectinload(Customer.tier))
        .where(Customer.id == customer_id)
    )
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    # ── Бонусный счёт ──────────────────
    acc_result = await db.execute(
        select(BonusAccount).where(BonusAccount.customer_id == customer_id)
    )
    account = acc_result.scalar_one_or_none()

    balance_data = {
        "balance": float(account.balance) if account else 0,
        "total_earned": float(account.total_earned) if account else 0,
        "total_spent": float(account.total_spent) if account else 0,
    }

    # ── LTV + RFM ──────────────────
    now = datetime.utcnow()

    # All EARN transactions (purchases)
    earn_result = await db.execute(
        select(
            func.count(Transaction.id).label("frequency"),
            func.sum(Transaction.purchase_amount).label("monetary"),
            func.max(Transaction.created_at).label("last_purchase"),
            func.min(Transaction.created_at).label("first_purchase"),
        ).where(
            and_(
                Transaction.customer_id == customer_id,
                Transaction.type == TransactionType.EARN,
            )
        )
    )
    earn_stats = earn_result.one()

    frequency = earn_stats.frequency or 0
    monetary = float(earn_stats.monetary or 0)
    last_purchase = earn_stats.last_purchase
    first_purchase = earn_stats.first_purchase

    # Recency (days since last purchase)
    recency_days = (now - last_purchase).days if last_purchase else 999

    # RFM scoring (1-5 scale)
    def rfm_recency_score(days):
        if days <= 7: return 5
        if days <= 14: return 4
        if days <= 30: return 3
        if days <= 60: return 2
        return 1

    def rfm_frequency_score(count):
        if count >= 20: return 5
        if count >= 10: return 4
        if count >= 5: return 3
        if count >= 2: return 2
        return 1

    def rfm_monetary_score(total):
        if total >= 100000: return 5
        if total >= 50000: return 4
        if total >= 20000: return 3
        if total >= 5000: return 2
        return 1

    r_score = rfm_recency_score(recency_days)
    f_score = rfm_frequency_score(frequency)
    m_score = rfm_monetary_score(monetary)
    rfm_total = r_score + f_score + m_score

    # RFM segment name
    def rfm_segment(r, f, m):
        total = r + f + m
        if total >= 13: return "Champion"
        if r >= 4 and f >= 3: return "Loyal"
        if r >= 4 and f <= 2: return "New Customer"
        if r <= 2 and f >= 3: return "At Risk"
        if r <= 2 and f <= 2: return "Lost"
        return "Regular"

    segment = rfm_segment(r_score, f_score, m_score)

    # Churn risk
    def churn_risk(recency, freq):
        if recency <= 14 and freq >= 3: return {"level": "low", "score": 10, "label": "Низкий"}
        if recency <= 30: return {"level": "medium", "score": 40, "label": "Средний"}
        if recency <= 60: return {"level": "high", "score": 70, "label": "Высокий"}
        return {"level": "critical", "score": 95, "label": "Критический"}

    churn = churn_risk(recency_days, frequency)

    # Average purchase
    avg_purchase = monetary / frequency if frequency > 0 else 0

    # Customer lifetime (days)
    lifetime_days = (now - first_purchase).days if first_purchase else 0

    ltv_data = {
        "total_purchases": monetary,
        "purchase_count": frequency,
        "avg_purchase": round(avg_purchase, 2),
        "lifetime_days": lifetime_days,
        "first_purchase": first_purchase.isoformat() if first_purchase else None,
        "last_purchase": last_purchase.isoformat() if last_purchase else None,
        "recency_days": recency_days,
    }

    rfm_data = {
        "recency": r_score,
        "frequency": f_score,
        "monetary": m_score,
        "total": rfm_total,
        "segment": segment,
    }

    # ── Visit pattern (по дням недели + часам) ──────────────────
    visit_dow_result = await db.execute(
        select(
            extract("dow", Transaction.created_at).label("dow"),
            func.count(Transaction.id).label("cnt"),
        ).where(
            and_(
                Transaction.customer_id == customer_id,
                Transaction.type == TransactionType.EARN,
            )
        ).group_by("dow").order_by("dow")
    )

    dow_names = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"]
    visit_by_day = {dow_names[int(r.dow)]: r.cnt for r in visit_dow_result.all()}

    visit_hour_result = await db.execute(
        select(
            extract("hour", Transaction.created_at).label("hour"),
            func.count(Transaction.id).label("cnt"),
        ).where(
            and_(
                Transaction.customer_id == customer_id,
                Transaction.type == TransactionType.EARN,
            )
        ).group_by("hour").order_by("hour")
    )
    visit_by_hour = {f"{int(r.hour):02d}:00": r.cnt for r in visit_hour_result.all()}

    # ── Top products ──────────────────
    top_products_result = await db.execute(
        select(
            Product.name,
            Product.category,
            func.sum(PurchaseItem.quantity).label("total_qty"),
            func.sum(PurchaseItem.total).label("total_sum"),
            func.count(PurchaseItem.id).label("buy_count"),
        )
        .join(PurchaseItem, PurchaseItem.product_id == Product.id)
        .join(Transaction, Transaction.id == PurchaseItem.transaction_id)
        .where(Transaction.customer_id == customer_id)
        .group_by(Product.id, Product.name, Product.category)
        .order_by(desc("total_sum"))
        .limit(10)
    )
    top_products = [
        {
            "name": r.name,
            "category": r.category,
            "quantity": float(r.total_qty),
            "total": float(r.total_sum),
            "purchases": r.buy_count,
        }
        for r in top_products_result.all()
    ]

    # ── Top categories ──────────────────
    top_cats_result = await db.execute(
        select(
            Product.category,
            func.sum(PurchaseItem.total).label("total_sum"),
            func.count(func.distinct(PurchaseItem.transaction_id)).label("tx_count"),
        )
        .join(PurchaseItem, PurchaseItem.product_id == Product.id)
        .join(Transaction, Transaction.id == PurchaseItem.transaction_id)
        .where(
            and_(
                Transaction.customer_id == customer_id,
                Product.category.isnot(None),
            )
        )
        .group_by(Product.category)
        .order_by(desc("total_sum"))
        .limit(8)
    )
    top_categories = [
        {"category": r.category or "Без категории", "total": float(r.total_sum), "purchases": r.tx_count}
        for r in top_cats_result.all()
    ]

    # ── Timeline (последние 20 транзакций) ──────────────────
    timeline_result = await db.execute(
        select(Transaction)
        .where(Transaction.customer_id == customer_id)
        .order_by(desc(Transaction.created_at))
        .limit(20)
    )
    timeline = [
        {
            "id": str(t.id),
            "type": t.type.value,
            "amount": float(t.amount),
            "purchase_amount": float(t.purchase_amount) if t.purchase_amount else None,
            "note": t.note,
            "created_at": t.created_at.isoformat(),
        }
        for t in timeline_result.scalars().all()
    ]

    # ── Monthly spend trend (last 12 months) ──────────────────
    twelve_months_ago = now - timedelta(days=365)
    monthly_result = await db.execute(
        select(
            func.date_trunc(func.literal_column("'month'"), Transaction.created_at).label("month"),
            func.sum(Transaction.purchase_amount).label("total"),
            func.count(Transaction.id).label("count"),
        ).where(
            and_(
                Transaction.customer_id == customer_id,
                Transaction.type == TransactionType.EARN,
                Transaction.created_at >= twelve_months_ago,
            )
        ).group_by("month").order_by("month")
    )
    monthly_trend = [
        {
            "month": r.month.strftime("%Y-%m") if r.month else "",
            "total": float(r.total or 0),
            "count": r.count,
        }
        for r in monthly_result.all()
    ]

    # ── Referrals ──────────────────
    referral_result = await db.execute(
        select(Customer.id, Customer.full_name, Customer.phone, Customer.created_at)
        .where(Customer.referred_by == customer_id)
        .order_by(desc(Customer.created_at))
        .limit(20)
    )
    referrals = [
        {
            "id": str(r.id),
            "name": r.full_name,
            "phone": r.phone,
            "joined": r.created_at.isoformat(),
        }
        for r in referral_result.all()
    ]

    # ── Active coupons ──────────────────
    coupon_result = await db.execute(
        select(Coupon).where(
            and_(
                Coupon.customer_id == customer_id,
                Coupon.is_active == True,
                Coupon.is_used == False,
            )
        ).order_by(desc(Coupon.created_at))
    )
    coupons = [
        {
            "id": str(c.id),
            "code": c.code,
            "title": c.title,
            "bonus_amount": float(c.bonus_amount),
            "expires_at": c.expires_at.isoformat() if c.expires_at else None,
        }
        for c in coupon_result.scalars().all()
    ]

    # ── Active debts ──────────────────
    debt_result = await db.execute(
        select(CustomerDebt).where(
            and_(
                CustomerDebt.customer_id == customer_id,
                CustomerDebt.status != "paid",
            )
        ).order_by(desc(CustomerDebt.created_at))
    )
    debts = [
        {
            "id": str(d.id),
            "total_amount": float(d.total_amount),
            "paid_amount": float(d.paid_amount),
            "remaining": float(d.amount),
            "status": d.status,
            "overdue_days": d.overdue_days,
        }
        for d in debt_result.scalars().all()
    ]

    # ── Campaigns received ──────────────────
    camp_result = await db.execute(
        select(
            BonusCampaign.name,
            BonusCampaign.campaign_type,
            BonusCampaign.amount,
            BonusCampaignRecipient.status,
            BonusCampaignRecipient.sent_at,
        )
        .join(BonusCampaignRecipient, BonusCampaignRecipient.campaign_id == BonusCampaign.id)
        .where(BonusCampaignRecipient.customer_id == customer_id)
        .order_by(desc(BonusCampaignRecipient.created_at))
        .limit(10)
    )
    campaigns = [
        {
            "name": r.name,
            "type": r.campaign_type,
            "amount": float(r.amount) if r.amount else None,
            "status": r.status,
            "sent_at": r.sent_at.isoformat() if r.sent_at else None,
        }
        for r in camp_result.all()
    ]

    # ── Expiring bonuses (next 30 days) ──────────────────
    thirty_days = now + timedelta(days=30)
    twelve_months = now - timedelta(days=335)  # bonuses earned 335-365 days ago
    expiring_result = await db.execute(
        select(func.sum(Transaction.amount)).where(
            and_(
                Transaction.customer_id == customer_id,
                Transaction.type == TransactionType.EARN,
                Transaction.created_at <= twelve_months,
                Transaction.created_at >= now - timedelta(days=365),
            )
        )
    )
    expiring_amount = float(expiring_result.scalar() or 0)

    # ── Reviews ──────────────────
    review_result = await db.execute(
        select(ReviewRequest).where(ReviewRequest.customer_id == customer_id)
        .order_by(desc(ReviewRequest.created_at))
    )
    reviews = [
        {
            "platform": r.platform,
            "status": r.status,
            "bonus_amount": float(r.bonus_amount) if r.bonus_amount else None,
            "created_at": r.created_at.isoformat(),
        }
        for r in review_result.scalars().all()
    ]

    # ── All tiers for progress ──────────────────
    tiers_result = await db.execute(
        select(Tier).where(Tier.is_active == True).order_by(Tier.sort_order)
    )
    all_tiers = tiers_result.scalars().all()

    current_tier = customer.tier
    next_tier = None
    tier_progress = 100

    for i, t in enumerate(all_tiers):
        if current_tier and t.id == current_tier.id and i + 1 < len(all_tiers):
            next_tier = all_tiers[i + 1]
            break

    if next_tier and current_tier:
        range_total = float(next_tier.min_total_kgs - current_tier.min_total_kgs)
        progress = float(Decimal(str(monetary)) - current_tier.min_total_kgs)
        tier_progress = min(100, round(progress / range_total * 100, 1)) if range_total > 0 else 100

    # ── Assemble response ──────────────────
    return {
        "basic": {
            "id": str(customer.id),
            "full_name": customer.full_name,
            "phone": customer.phone,
            "qr_code": customer.qr_code,
            "birth_date": customer.birth_date.isoformat() if customer.birth_date else None,
            "referral_code": customer.referral_code,
            "is_active": customer.is_active,
            "created_at": customer.created_at.isoformat(),
            "tier": {
                "name": current_tier.name if current_tier else "Bronze",
                "bonus_percent": float(current_tier.bonus_percent) if current_tier else 2,
                "max_spend_pct": float(current_tier.max_spend_pct) if current_tier else 30,
            },
            "next_tier": {
                "name": next_tier.name,
                "min_total_kgs": float(next_tier.min_total_kgs),
                "progress": tier_progress,
                "remaining": float(next_tier.min_total_kgs) - monetary,
            } if next_tier else None,
        },
        "balance": balance_data,
        "ltv": ltv_data,
        "rfm": rfm_data,
        "churn_risk": churn,
        "visit_pattern": {
            "by_day": visit_by_day,
            "by_hour": visit_by_hour,
        },
        "monthly_trend": monthly_trend,
        "top_products": top_products,
        "top_categories": top_categories,
        "timeline": timeline,
        "referrals": {
            "count": len(referrals),
            "list": referrals,
        },
        "coupons": coupons,
        "debts": debts,
        "campaigns": campaigns,
        "expiring_bonus": expiring_amount,
        "reviews": reviews,
    }
