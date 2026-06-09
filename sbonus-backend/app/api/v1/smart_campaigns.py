"""
Sbonus+ — Smart Campaign Builder with AI Segmentation.
Умное создание кампаний: RFM-сегменты, авто-таргетинг, шаблоны.
"""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, case, and_, literal_column, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role, UserRole
from app.models import (
    Customer, BonusAccount, Transaction, TransactionType,
    Tier, Setting,
    BonusCampaign, BonusCampaignRecipient, CampaignStatus, CampaignTargetType,
)

router = APIRouter(prefix="/smart-campaigns", tags=["Smart Campaigns"])


# ═══════════════════════════════════════════
# RFM SEGMENTATION ENGINE
# ═══════════════════════════════════════════

RFM_SEGMENTS = {
    "champions": {
        "name": "Чемпионы",
        "desc": "Покупали недавно, часто и много",
        "r": (4, 5), "f": (4, 5), "m": (4, 5),
        "icon": "👑", "color": "#10b981",
        "template": "Спасибо за верность! Вот ваш эксклюзивный бонус — {amount} сом 🎁",
    },
    "loyal": {
        "name": "Лояльные",
        "desc": "Покупают регулярно, хорошие чеки",
        "r": (3, 5), "f": (3, 5), "m": (3, 5),
        "icon": "💎", "color": "#6366f1",
        "template": "Вы наш особый клиент! Получите {amount} бонусов в подарок 💎",
    },
    "potential_loyalists": {
        "name": "Потенциально лояльные",
        "desc": "Недавние, но ещё не частые",
        "r": (4, 5), "f": (1, 3), "m": (1, 3),
        "icon": "🌱", "color": "#22c55e",
        "template": "Рады видеть вас снова! {amount} бонусов для следующей покупки 🌱",
    },
    "new_customers": {
        "name": "Новые клиенты",
        "desc": "Только зарегистрировались",
        "r": (4, 5), "f": (1, 1), "m": (1, 1),
        "icon": "🆕", "color": "#3b82f6",
        "template": "Добро пожаловать! Вот {amount} бонусов на первые покупки! 🎉",
    },
    "at_risk": {
        "name": "Под угрозой ухода",
        "desc": "Были активны, давно не покупали",
        "r": (1, 2), "f": (3, 5), "m": (3, 5),
        "icon": "⚠️", "color": "#f59e0b",
        "template": "Мы соскучились! Возвращайтесь — {amount} бонусов уже ждут вас! 🤗",
    },
    "need_attention": {
        "name": "Требуют внимания",
        "desc": "Средняя активность, могут уйти",
        "r": (2, 3), "f": (2, 3), "m": (2, 3),
        "icon": "👀", "color": "#f97316",
        "template": "Давно не виделись! {amount} бонусов за визит в Смарт Центр 🛍️",
    },
    "hibernating": {
        "name": "Спящие",
        "desc": "Давно не покупали, низкая активность",
        "r": (1, 2), "f": (1, 2), "m": (1, 2),
        "icon": "😴", "color": "#ef4444",
        "template": "Мы скучаем! {amount} бонусов — отличный повод вернуться! 💫",
    },
    "lost": {
        "name": "Потерянные",
        "desc": "Давно не покупали, единичные покупки",
        "r": (1, 1), "f": (1, 1), "m": (1, 2),
        "icon": "💤", "color": "#dc2626",
        "template": "Мы всё ещё здесь для вас! {amount} бонусов к возвращению 🏪",
    },
}


async def _compute_rfm_scores(db: AsyncSession, days: int = 365) -> list:
    """Compute RFM scores for all customers."""
    tz = timezone(timedelta(hours=6))
    now = datetime.now(tz)
    since = now - timedelta(days=days)

    # Get per-customer metrics
    result = await db.execute(
        select(
            Transaction.customer_id,
            func.max(Transaction.created_at).label("last_purchase"),
            func.count().label("frequency"),
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("monetary"),
        ).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= since,
        ).group_by(Transaction.customer_id)
    )
    rows = result.all()

    if not rows:
        return []

    # Calculate quintiles
    recencies = sorted([float((now - r.last_purchase.replace(tzinfo=tz) if r.last_purchase.tzinfo is None else now - r.last_purchase).days) for r in rows])
    frequencies = sorted([r.frequency for r in rows])
    monetaries = sorted([float(r.monetary) for r in rows])

    def quintile(val, sorted_list):
        if not sorted_list:
            return 3
        idx = 0
        for i, v in enumerate(sorted_list):
            if val <= v:
                idx = i
                break
            idx = i
        pct = idx / max(len(sorted_list) - 1, 1)
        return min(5, max(1, int(pct * 5) + 1))

    customers = []
    for r in rows:
        days_since = float((now - (r.last_purchase.replace(tzinfo=tz) if r.last_purchase.tzinfo is None else r.last_purchase)).days)
        r_score = 6 - quintile(days_since, recencies)  # Invert: recent = higher
        f_score = quintile(r.frequency, frequencies)
        m_score = quintile(float(r.monetary), monetaries)

        # Clamp
        r_score = max(1, min(5, r_score))
        f_score = max(1, min(5, f_score))
        m_score = max(1, min(5, m_score))

        # Determine segment
        segment = _classify_rfm(r_score, f_score, m_score)

        customers.append({
            "customer_id": str(r.customer_id),
            "r": r_score,
            "f": f_score,
            "m": m_score,
            "segment": segment,
            "days_since": int(days_since),
            "purchases": r.frequency,
            "total_spent": round(float(r.monetary), 2),
        })

    return customers


def _classify_rfm(r: int, f: int, m: int) -> str:
    """Classify customer into RFM segment."""
    for seg_id, seg in RFM_SEGMENTS.items():
        r_range = seg["r"]
        f_range = seg["f"]
        m_range = seg["m"]
        if (r_range[0] <= r <= r_range[1] and
            f_range[0] <= f <= f_range[1] and
            m_range[0] <= m <= m_range[1]):
            return seg_id
    return "need_attention"


# ═══════════════════════════════════════════
# API ENDPOINTS
# ═══════════════════════════════════════════

@router.get("/segments")
async def get_segments(
    days: int = Query(365, ge=30, le=730),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Получить все RFM-сегменты с количеством клиентов."""
    customers = await _compute_rfm_scores(db, days)

    # Count per segment
    segment_counts = {}
    for c in customers:
        seg = c["segment"]
        if seg not in segment_counts:
            segment_counts[seg] = {
                "count": 0,
                "total_spent": 0,
                "avg_days_since": 0,
                "customer_ids": [],
            }
        segment_counts[seg]["count"] += 1
        segment_counts[seg]["total_spent"] += c["total_spent"]
        segment_counts[seg]["avg_days_since"] += c["days_since"]
        segment_counts[seg]["customer_ids"].append(c["customer_id"])

    segments = []
    for seg_id, info in RFM_SEGMENTS.items():
        data = segment_counts.get(seg_id, {"count": 0, "total_spent": 0, "avg_days_since": 0, "customer_ids": []})
        cnt = data["count"]
        segments.append({
            "id": seg_id,
            "name": info["name"],
            "desc": info["desc"],
            "icon": info["icon"],
            "color": info["color"],
            "count": cnt,
            "total_spent": round(data["total_spent"], 2),
            "avg_days_since": round(data["avg_days_since"] / cnt) if cnt > 0 else 0,
            "template": info["template"],
            "pct": round(cnt / len(customers) * 100, 1) if customers else 0,
        })

    return {
        "total_customers": len(customers),
        "segments": segments,
    }


@router.get("/segments/{segment_id}/customers")
async def get_segment_customers(
    segment_id: str,
    days: int = Query(365, ge=30, le=730),
    limit: int = Query(50, ge=10, le=200),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Получить список клиентов в сегменте."""
    if segment_id not in RFM_SEGMENTS:
        raise HTTPException(status_code=404, detail="Сегмент не найден")

    customers = await _compute_rfm_scores(db, days)
    segment_customers = [c for c in customers if c["segment"] == segment_id]
    segment_customers.sort(key=lambda x: x["total_spent"], reverse=True)

    # Enrich with customer data
    result = []
    for c in segment_customers[:limit]:
        cust = await db.execute(
            select(Customer.full_name, Customer.phone).where(
                Customer.id == uuid.UUID(c["customer_id"])
            )
        )
        row = cust.one_or_none()
        if row:
            result.append({
                **c,
                "name": row.full_name,
                "phone": row.phone,
            })

    return {
        "segment": RFM_SEGMENTS[segment_id],
        "total": len(segment_customers),
        "customers": result,
    }


class CampaignSuggestion(BaseModel):
    segment_id: str
    bonus_amount: int = 100


@router.post("/suggest")
async def suggest_campaign(
    data: CampaignSuggestion,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Предложить параметры кампании для сегмента."""
    if data.segment_id not in RFM_SEGMENTS:
        raise HTTPException(status_code=404, detail="Сегмент не найден")

    seg = RFM_SEGMENTS[data.segment_id]
    customers = await _compute_rfm_scores(db, 365)
    segment_customers = [c for c in customers if c["segment"] == data.segment_id]

    # Smart bonus recommendation based on segment
    bonus_map = {
        "champions": 200,
        "loyal": 150,
        "potential_loyalists": 100,
        "new_customers": 50,
        "at_risk": 200,
        "need_attention": 100,
        "hibernating": 150,
        "lost": 100,
    }
    recommended_bonus = bonus_map.get(data.segment_id, 100)

    # Estimated ROI
    avg_check = 3000  # Average check assumption
    conversion_rates = {
        "champions": 0.85,
        "loyal": 0.70,
        "potential_loyalists": 0.50,
        "new_customers": 0.40,
        "at_risk": 0.30,
        "need_attention": 0.25,
        "hibernating": 0.15,
        "lost": 0.10,
    }
    conv_rate = conversion_rates.get(data.segment_id, 0.20)
    count = len(segment_customers)
    bonus = data.bonus_amount or recommended_bonus
    cost = count * bonus
    expected_revenue = count * conv_rate * avg_check
    roi = round((expected_revenue - cost) / max(cost, 1) * 100, 1)

    message = seg["template"].replace("{amount}", str(bonus))

    return {
        "segment": {
            "id": data.segment_id,
            "name": seg["name"],
            "icon": seg["icon"],
        },
        "recipients": count,
        "recommended_bonus": recommended_bonus,
        "selected_bonus": bonus,
        "message_template": message,
        "estimated_cost": cost,
        "expected_conversion": round(conv_rate * 100, 1),
        "expected_revenue": round(expected_revenue, 2),
        "estimated_roi": roi,
        "best_time": "10:00-12:00" if data.segment_id in ("champions", "loyal") else "14:00-16:00",
        "best_day": "Понедельник-Среда" if data.segment_id in ("at_risk", "hibernating", "lost") else "Четверг-Суббота",
    }


@router.get("/templates")
async def get_campaign_templates(
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Шаблоны кампаний для разных сценариев."""
    templates = [
        {
            "id": "welcome",
            "name": "Добро пожаловать",
            "icon": "🎉",
            "target": "new_customers",
            "template": "Добро пожаловать в S Bonus! 🎉\nВот {amount} бонусов на первую покупку!\n{link}",
            "recommended_bonus": 100,
        },
        {
            "id": "comeback",
            "name": "Возвращение клиента",
            "icon": "🤗",
            "target": "at_risk,hibernating,lost",
            "template": "Мы соскучились, {name}! 🤗\n{amount} бонусов уже на вашем счёте!\nЖдём в Смарт Центр!\n{link}",
            "recommended_bonus": 200,
        },
        {
            "id": "vip",
            "name": "VIP эксклюзив",
            "icon": "👑",
            "target": "champions,loyal",
            "template": "Эксклюзивно для вас, {name}! 👑\n{amount} бонусов — наша благодарность за лояльность!\n{link}",
            "recommended_bonus": 300,
        },
        {
            "id": "weekend",
            "name": "Выходной бонус",
            "icon": "🎁",
            "target": "all",
            "template": "Отличные выходные с S Bonus! 🎁\n{amount} бонусов к вашему балансу!\nЖдём в Смарт Центр!\n{link}",
            "recommended_bonus": 100,
        },
        {
            "id": "birthday",
            "name": "День рождения",
            "icon": "🎂",
            "target": "birthday",
            "template": "С днём рождения, {name}! 🎂🎉\n{amount} бонусов — наш подарок!\nОтпразднуйте с Смарт Центр!\n{link}",
            "recommended_bonus": 200,
        },
        {
            "id": "flash_sale",
            "name": "Флеш-распродажа",
            "icon": "⚡",
            "target": "all",
            "template": "⚡ FLASH SALE!\nТолько сегодня — {amount} бонусов за любую покупку!\nУспейте!\n{link}",
            "recommended_bonus": 50,
        },
    ]
    return {"templates": templates}


# ═══════════════════════════════════════════
# LAUNCH — создать кампанию из сегмента
# ═══════════════════════════════════════════

class SegmentCampaignLaunch(BaseModel):
    segment_id: str
    bonus_amount: int = 100
    name: Optional[str] = None
    message_template: Optional[str] = None
    days: int = 365


@router.post("/launch")
async def launch_segment_campaign(
    data: SegmentCampaignLaunch,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """
    Создать бонусную кампанию для RFM-сегмента.
    Получатели фиксируются на момент создания. Кампания создаётся в статусе
    PENDING — отправка через страницу «Кампании» (кнопка «Отправить»).
    """
    if data.segment_id not in RFM_SEGMENTS:
        raise HTTPException(status_code=404, detail="Сегмент не найден")
    if data.bonus_amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма бонуса должна быть больше 0")

    seg = RFM_SEGMENTS[data.segment_id]
    customers = await _compute_rfm_scores(db, data.days)
    customer_ids = [
        uuid.UUID(c["customer_id"]) for c in customers if c["segment"] == data.segment_id
    ]
    if not customer_ids:
        raise HTTPException(status_code=400, detail="В сегменте нет клиентов")

    template = data.message_template or (seg["template"] + "\n{link}")
    tz = timezone(timedelta(hours=6))

    campaign = BonusCampaign(
        name=data.name or f"RFM: {seg['name']} ({datetime.now(tz).strftime('%d.%m.%Y')})",
        campaign_type="bonus",
        bonus_date=datetime.now(tz).date(),
        amount=Decimal(str(data.bonus_amount)),
        reason=f"RFM-сегмент: {seg['name']} ({len(customer_ids)} клиентов)",
        message_template=template,
        target_type=CampaignTargetType.INDIVIDUAL,
        status=CampaignStatus.PENDING,
        created_by=uuid.UUID(user["sub"]) if user.get("sub") else None,
    )
    db.add(campaign)
    await db.flush()

    for cid in customer_ids:
        db.add(BonusCampaignRecipient(campaign_id=campaign.id, customer_id=cid))

    await db.commit()

    return {
        "success": True,
        "campaign_id": str(campaign.id),
        "name": campaign.name,
        "recipients": len(customer_ids),
        "message": f"Кампания создана ({len(customer_ids)} получателей). Отправьте её со страницы «Кампании».",
    }
