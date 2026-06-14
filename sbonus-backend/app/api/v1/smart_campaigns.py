"""
Sbonus+ — Smart Campaign Builder with AI Segmentation.
Умное создание кампаний: RFM-сегменты, авто-таргетинг, шаблоны.

Логика RFM:
- R (Recency)   — давность последней покупки (EARN)
- F (Frequency) — число покупок за период
- M (Monetary)  — сумма покупок за период
Каждому 1..5 (квинтиль). Классификация — по полной сетке R × FM (без «дыр»).
Клиенты без покупок берутся из таблицы customers (новые / потерянные).
Филиал-админ видит RFM только по транзакциям своего филиала.
"""

import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role, UserRole
from app.models import (
    Customer, BonusAccount, Transaction, TransactionType,
    Tier, Setting,
    BonusCampaign, BonusCampaignRecipient, CampaignStatus, CampaignTargetType,
)

router = APIRouter(prefix="/smart-campaigns", tags=["Smart Campaigns"])

NEW_CUSTOMER_DAYS = 30  # без покупок, но зарегистрирован недавно → «Новые»


# ═══════════════════════════════════════════
# RFM SEGMENTATION ENGINE
# ═══════════════════════════════════════════

RFM_SEGMENTS = {
    "champions": {
        "name": "Чемпионы", "desc": "Покупали недавно, часто и много",
        "icon": "👑", "color": "#10b981",
        "template": "Спасибо за верность! Вот ваш эксклюзивный бонус — {amount} сом 🎁",
    },
    "loyal": {
        "name": "Лояльные", "desc": "Покупают регулярно, хорошие чеки",
        "icon": "💎", "color": "#6366f1",
        "template": "Вы наш особый клиент! Получите {amount} бонусов в подарок 💎",
    },
    "potential_loyalists": {
        "name": "Потенциально лояльные", "desc": "Недавние, но ещё не частые",
        "icon": "🌱", "color": "#22c55e",
        "template": "Рады видеть вас снова! {amount} бонусов для следующей покупки 🌱",
    },
    "new_customers": {
        "name": "Новые клиенты", "desc": "Недавно зарегистрировались",
        "icon": "🆕", "color": "#3b82f6",
        "template": "Добро пожаловать! Вот {amount} бонусов на первые покупки! 🎉",
    },
    "at_risk": {
        "name": "Под угрозой ухода", "desc": "Были активны, давно не покупали",
        "icon": "⚠️", "color": "#f59e0b",
        "template": "Мы соскучились! Возвращайтесь — {amount} бонусов уже ждут вас! 🤗",
    },
    "need_attention": {
        "name": "Требуют внимания", "desc": "Средняя активность, могут уйти",
        "icon": "👀", "color": "#f97316",
        "template": "Давно не виделись! {amount} бонусов за визит в Смарт Центр 🛍️",
    },
    "hibernating": {
        "name": "Спящие", "desc": "Давно не покупали, низкая активность",
        "icon": "😴", "color": "#ef4444",
        "template": "Мы скучаем! {amount} бонусов — отличный повод вернуться! 💫",
    },
    "lost": {
        "name": "Потерянные", "desc": "Давно не покупали, единичные покупки",
        "icon": "💤", "color": "#dc2626",
        "template": "Мы всё ещё здесь для вас! {amount} бонусов к возвращению 🏪",
    },
}

# Полная сетка классификации: (R, FM) → сегмент. FM = округл. среднее (F+M)/2.
# Покрывает все 25 комбинаций — клиенты не «сваливаются» в один сегмент.
RFM_GRID = {
    (5, 5): "champions", (5, 4): "champions", (4, 5): "champions",
    (4, 4): "loyal", (3, 5): "loyal", (3, 4): "loyal",
    (5, 3): "potential_loyalists", (5, 2): "potential_loyalists",
    (4, 3): "potential_loyalists", (4, 2): "potential_loyalists",
    (5, 1): "new_customers", (4, 1): "new_customers",
    (3, 3): "need_attention", (3, 2): "need_attention", (3, 1): "need_attention",
    (2, 5): "at_risk", (2, 4): "at_risk", (2, 3): "at_risk",
    (1, 5): "at_risk", (1, 4): "at_risk", (1, 3): "at_risk",
    (2, 2): "hibernating", (2, 1): "hibernating", (1, 2): "hibernating",
    (1, 1): "lost",
}


def _classify_rfm(r: int, f: int, m: int) -> str:
    """Классификация по сетке R × FM (полное покрытие)."""
    fm = max(1, min(5, round((f + m) / 2)))
    return RFM_GRID.get((r, fm), "need_attention")


# ── Кэш расчёта (тяжёлый полный скан) ──
_RFM_CACHE: dict = {}
_RFM_TTL = 300  # секунд


def _cache_get(key):
    v = _RFM_CACHE.get(key)
    if v and (time.time() - v[0]) < _RFM_TTL:
        return v[1]
    return None


def _cache_set(key, val):
    _RFM_CACHE[key] = (time.time(), val)


def _cache_clear():
    _RFM_CACHE.clear()


def _quintile(val, sorted_list):
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


async def _compute_rfm_scores(db: AsyncSession, days: int = 365,
                              branch_id: Optional[uuid.UUID] = None) -> list:
    """
    RFM по всем клиентам. branch_id != None — только покупки этого филиала
    (и без клиентов без покупок, т.к. у клиента нет филиала).
    """
    include_no_tx = branch_id is None
    cache_key = (str(branch_id) if branch_id else "all", days)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    tz = timezone(timedelta(hours=6))
    now = datetime.now(tz)
    since = now - timedelta(days=days)

    # ── Покупатели (есть EARN за период) — одним запросом с данными клиента ──
    q = (
        select(
            Customer.id, Customer.full_name, Customer.phone,
            Customer.is_active, Customer.created_at,
            func.max(Transaction.created_at).label("last_purchase"),
            func.count().label("frequency"),
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("monetary"),
        )
        .join(Transaction, Transaction.customer_id == Customer.id)
        .where(Transaction.type == TransactionType.EARN, Transaction.created_at >= since)
        .group_by(Customer.id, Customer.full_name, Customer.phone,
                  Customer.is_active, Customer.created_at)
    )
    if branch_id is not None:
        q = q.where(Transaction.branch_id == branch_id)
    rows = (await db.execute(q)).all()

    def _days_since(dt):
        if dt is None:
            return float(days)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=tz)
        return float((now - dt).days)

    customers = []
    if rows:
        recencies = sorted([_days_since(r.last_purchase) for r in rows])
        frequencies = sorted([r.frequency for r in rows])
        monetaries = sorted([float(r.monetary) for r in rows])
        for r in rows:
            ds = _days_since(r.last_purchase)
            r_score = max(1, min(5, 6 - _quintile(ds, recencies)))  # recent = higher
            f_score = _quintile(r.frequency, frequencies)
            m_score = _quintile(float(r.monetary), monetaries)
            customers.append({
                "customer_id": str(r.id),
                "name": r.full_name,
                "phone": r.phone,
                "is_active": bool(r.is_active),
                "r": r_score, "f": f_score, "m": m_score,
                "segment": _classify_rfm(r_score, f_score, m_score),
                "days_since": int(ds),
                "purchases": int(r.frequency),
                "total_spent": round(float(r.monetary), 2),
            })

    # ── Клиенты без покупок за период (только общий обзор, не по филиалу) ──
    if include_no_tx:
        have_ids = [uuid.UUID(c["customer_id"]) for c in customers]
        qb = select(
            Customer.id, Customer.full_name, Customer.phone, Customer.created_at
        ).where(Customer.is_active.is_(True))
        if have_ids:
            qb = qb.where(Customer.id.notin_(have_ids))
        for c in (await db.execute(qb)).all():
            reg_days = _days_since(c.created_at)
            is_new = reg_days <= NEW_CUSTOMER_DAYS
            customers.append({
                "customer_id": str(c.id),
                "name": c.full_name,
                "phone": c.phone,
                "is_active": True,
                "r": 5 if is_new else 1, "f": 1, "m": 1,
                "segment": "new_customers" if is_new else "lost",
                "days_since": int(reg_days),
                "purchases": 0,
                "total_spent": 0.0,
            })

    _cache_set(cache_key, customers)
    return customers


def _branch_of(user: dict) -> Optional[uuid.UUID]:
    """Филиал для скоупинга: super-admin — все, branch-admin — свой филиал."""
    if user.get("role") == UserRole.BRANCH_ADMIN.value and user.get("branch_id"):
        try:
            return uuid.UUID(str(user["branch_id"]))
        except (ValueError, TypeError):
            return None
    return None


def _avg_check(customers: list) -> float:
    """Реальный средний чек по покупателям (для честного ROI)."""
    tot_spent = sum(c["total_spent"] for c in customers if c["purchases"] > 0)
    tot_purch = sum(c["purchases"] for c in customers if c["purchases"] > 0)
    if tot_purch <= 0:
        return 3000.0
    return round(tot_spent / tot_purch, 2)


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
    customers = await _compute_rfm_scores(db, days, _branch_of(user))

    counts = {}
    for c in customers:
        d = counts.setdefault(c["segment"], {"count": 0, "total_spent": 0.0, "avg_days_since": 0})
        d["count"] += 1
        d["total_spent"] += c["total_spent"]
        d["avg_days_since"] += c["days_since"]

    total = len(customers)
    segments = []
    for seg_id, info in RFM_SEGMENTS.items():
        d = counts.get(seg_id, {"count": 0, "total_spent": 0.0, "avg_days_since": 0})
        cnt = d["count"]
        segments.append({
            "id": seg_id, "name": info["name"], "desc": info["desc"],
            "icon": info["icon"], "color": info["color"],
            "count": cnt,
            "total_spent": round(d["total_spent"], 2),
            "avg_days_since": round(d["avg_days_since"] / cnt) if cnt else 0,
            "template": info["template"],
            "pct": round(cnt / total * 100, 1) if total else 0,
        })

    return {"total_customers": total, "segments": segments}


@router.get("/segments/{segment_id}/customers")
async def get_segment_customers(
    segment_id: str,
    days: int = Query(365, ge=30, le=730),
    limit: int = Query(500, ge=10, le=2000),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Список клиентов в сегменте (только активные с телефоном — для рассылки)."""
    if segment_id not in RFM_SEGMENTS:
        raise HTTPException(status_code=404, detail="Сегмент не найден")

    customers = await _compute_rfm_scores(db, days, _branch_of(user))
    seg = [c for c in customers if c["segment"] == segment_id]
    reachable = [c for c in seg if c.get("is_active") and c.get("phone")]
    reachable.sort(key=lambda x: x["total_spent"], reverse=True)

    return {
        "segment": {
            "id": segment_id,
            "name": RFM_SEGMENTS[segment_id]["name"],
            "icon": RFM_SEGMENTS[segment_id]["icon"],
        },
        "total": len(seg),
        "reachable": len(reachable),
        "customers": reachable[:limit],
    }


class CampaignSuggestion(BaseModel):
    segment_id: str
    bonus_amount: int = 100


# Базовые конверсии по сегментам (эвристика; средний чек — реальный).
_CONV = {
    "champions": 0.35, "loyal": 0.30, "potential_loyalists": 0.22,
    "new_customers": 0.18, "at_risk": 0.12, "need_attention": 0.15,
    "hibernating": 0.08, "lost": 0.05,
}
_BONUS_MAP = {
    "champions": 200, "loyal": 150, "potential_loyalists": 100,
    "new_customers": 50, "at_risk": 200, "need_attention": 100,
    "hibernating": 150, "lost": 100,
}


@router.post("/suggest")
async def suggest_campaign(
    data: CampaignSuggestion,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Предложить параметры кампании для сегмента (ROI на реальном среднем чеке)."""
    if data.segment_id not in RFM_SEGMENTS:
        raise HTTPException(status_code=404, detail="Сегмент не найден")

    seg = RFM_SEGMENTS[data.segment_id]
    customers = await _compute_rfm_scores(db, 365, _branch_of(user))
    seg_customers = [c for c in customers if c["segment"] == data.segment_id]
    reachable = [c for c in seg_customers if c.get("is_active") and c.get("phone")]

    recommended_bonus = _BONUS_MAP.get(data.segment_id, 100)
    conv_rate = _CONV.get(data.segment_id, 0.15)
    count = len(reachable)
    bonus = data.bonus_amount or recommended_bonus
    avg_check = _avg_check(customers)

    cost = count * bonus
    expected_revenue = count * conv_rate * avg_check
    roi = round((expected_revenue - cost) / max(cost, 1) * 100, 1) if cost else 0.0
    message = seg["template"].replace("{amount}", str(bonus))

    return {
        "segment": {"id": data.segment_id, "name": seg["name"], "icon": seg["icon"]},
        "recipients": count,
        "total_in_segment": len(seg_customers),
        "recommended_bonus": recommended_bonus,
        "selected_bonus": bonus,
        "message_template": message,
        "avg_check": round(avg_check),
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
        {"id": "welcome", "name": "Добро пожаловать", "icon": "🎉", "target": "new_customers",
         "template": "Добро пожаловать в S Bonus! 🎉\nВот {amount} бонусов на первую покупку!\n{link}", "recommended_bonus": 100},
        {"id": "comeback", "name": "Возвращение клиента", "icon": "🤗", "target": "at_risk,hibernating,lost",
         "template": "Мы соскучились, {name}! 🤗\n{amount} бонусов уже на вашем счёте!\nЖдём в Смарт Центр!\n{link}", "recommended_bonus": 200},
        {"id": "vip", "name": "VIP эксклюзив", "icon": "👑", "target": "champions,loyal",
         "template": "Эксклюзивно для вас, {name}! 👑\n{amount} бонусов — наша благодарность за лояльность!\n{link}", "recommended_bonus": 300},
        {"id": "weekend", "name": "Выходной бонус", "icon": "🎁", "target": "all",
         "template": "Отличные выходные с S Bonus! 🎁\n{amount} бонусов к вашему балансу!\nЖдём в Смарт Центр!\n{link}", "recommended_bonus": 100},
        {"id": "birthday", "name": "День рождения", "icon": "🎂", "target": "birthday",
         "template": "С днём рождения, {name}! 🎂🎉\n{amount} бонусов — наш подарок!\nОтпразднуйте с Смарт Центр!\n{link}", "recommended_bonus": 200},
        {"id": "flash_sale", "name": "Флеш-распродажа", "icon": "⚡", "target": "all",
         "template": "⚡ FLASH SALE!\nТолько сегодня — {amount} бонусов за любую покупку!\nУспейте!\n{link}", "recommended_bonus": 50},
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
    customer_ids: Optional[list[str]] = None  # выбранные вручную получатели


@router.post("/launch")
async def launch_segment_campaign(
    data: SegmentCampaignLaunch,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """
    Создать бонусную кампанию для RFM-сегмента.
    Если переданы customer_ids — рассылка только выбранным (из этого сегмента).
    Берутся только активные клиенты с телефоном. Кампания создаётся в статусе
    PENDING — отправка со страницы «Кампании» (кнопка «Отправить»).
    """
    if data.segment_id not in RFM_SEGMENTS:
        raise HTTPException(status_code=404, detail="Сегмент не найден")
    if data.bonus_amount <= 0:
        raise HTTPException(status_code=400, detail="Сумма бонуса должна быть больше 0")

    seg = RFM_SEGMENTS[data.segment_id]
    customers = await _compute_rfm_scores(db, data.days, _branch_of(user))
    reachable = {
        c["customer_id"]: c for c in customers
        if c["segment"] == data.segment_id and c.get("is_active") and c.get("phone")
    }

    if data.customer_ids:
        chosen = [cid for cid in data.customer_ids if cid in reachable]
    else:
        chosen = list(reachable.keys())

    if not chosen:
        raise HTTPException(status_code=400, detail="Нет получателей с телефоном для рассылки")

    try:
        customer_uuids = [uuid.UUID(cid) for cid in chosen]
    except ValueError:
        raise HTTPException(status_code=400, detail="Некорректный ID получателя")

    template = data.message_template or (seg["template"] + "\n{link}")
    tz = timezone(timedelta(hours=6))

    campaign = BonusCampaign(
        name=data.name or f"RFM: {seg['name']} ({datetime.now(tz).strftime('%d.%m.%Y')})",
        campaign_type="bonus",
        bonus_date=datetime.now(tz).date(),
        amount=Decimal(str(data.bonus_amount)),
        reason=f"RFM-сегмент: {seg['name']} ({len(customer_uuids)} клиентов)",
        message_template=template,
        target_type=CampaignTargetType.INDIVIDUAL,
        status=CampaignStatus.PENDING,
        created_by=uuid.UUID(user["sub"]) if user.get("sub") else None,
    )
    db.add(campaign)
    await db.flush()

    for cid in customer_uuids:
        db.add(BonusCampaignRecipient(campaign_id=campaign.id, customer_id=cid))

    await db.commit()
    _cache_clear()  # счётчики обновятся при следующем заходе

    return {
        "success": True,
        "campaign_id": str(campaign.id),
        "name": campaign.name,
        "recipients": len(customer_uuids),
        "message": f"Кампания создана ({len(customer_uuids)} получателей). Отправьте её со страницы «Кампании».",
    }
