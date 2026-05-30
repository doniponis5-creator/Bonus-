"""
Sbonus+ — Gamification Engine: Achievements, Streaks, Daily Missions.
Геймификация: достижения, серии, ежедневные задания.
"""

import uuid
from datetime import datetime, timedelta, timezone, date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, case, and_, or_, literal_column, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role, UserRole
from app.models import (
    Customer, BonusAccount, Transaction, TransactionType,
    Setting, Tier,
)

router = APIRouter(prefix="/gamification", tags=["Gamification"])


# ═══════════════════════════════════════════
# ACHIEVEMENT DEFINITIONS (конфигурация)
# ═══════════════════════════════════════════

ACHIEVEMENTS = [
    # Покупки
    {"id": "first_purchase", "icon": "🛒", "name": "Первая покупка", "desc": "Совершите первую покупку", "category": "purchases", "condition": "purchases >= 1"},
    {"id": "regular_10", "icon": "🔄", "name": "Постоянный клиент", "desc": "10 покупок", "category": "purchases", "condition": "purchases >= 10"},
    {"id": "loyal_50", "icon": "💎", "name": "Верный покупатель", "desc": "50 покупок", "category": "purchases", "condition": "purchases >= 50"},
    {"id": "legend_100", "icon": "👑", "name": "Легенда магазина", "desc": "100 покупок", "category": "purchases", "condition": "purchases >= 100"},
    {"id": "mega_200", "icon": "🏆", "name": "Мега-покупатель", "desc": "200 покупок", "category": "purchases", "condition": "purchases >= 200"},

    # Бонусы
    {"id": "saver_1k", "icon": "💰", "name": "Копилка", "desc": "Накопите 1 000 бонусов", "category": "bonuses", "condition": "total_earned >= 1000"},
    {"id": "saver_5k", "icon": "🏦", "name": "Банкир", "desc": "Накопите 5 000 бонусов", "category": "bonuses", "condition": "total_earned >= 5000"},
    {"id": "saver_10k", "icon": "💸", "name": "Миллионер", "desc": "Накопите 10 000 бонусов", "category": "bonuses", "condition": "total_earned >= 10000"},
    {"id": "big_spender", "icon": "🎯", "name": "Щедрая душа", "desc": "Потратьте 5 000 бонусов", "category": "bonuses", "condition": "total_spent >= 5000"},

    # Объём покупок (LTV)
    {"id": "ltv_10k", "icon": "📈", "name": "10К клуб", "desc": "Покупки на 10 000 сом", "category": "spending", "condition": "ltv >= 10000"},
    {"id": "ltv_50k", "icon": "🚀", "name": "50К клуб", "desc": "Покупки на 50 000 сом", "category": "spending", "condition": "ltv >= 50000"},
    {"id": "ltv_100k", "icon": "⭐", "name": "100К клуб", "desc": "Покупки на 100 000 сом", "category": "spending", "condition": "ltv >= 100000"},
    {"id": "ltv_500k", "icon": "🌟", "name": "Полмиллиона!", "desc": "Покупки на 500 000 сом", "category": "spending", "condition": "ltv >= 500000"},

    # Социальные
    {"id": "referrer_1", "icon": "🤝", "name": "Пригласитель", "desc": "Пригласите 1 друга", "category": "social", "condition": "referrals >= 1"},
    {"id": "referrer_5", "icon": "🌐", "name": "Амбассадор", "desc": "Пригласите 5 друзей", "category": "social", "condition": "referrals >= 5"},
    {"id": "referrer_10", "icon": "📢", "name": "Лидер мнений", "desc": "Пригласите 10 друзей", "category": "social", "condition": "referrals >= 10"},
    {"id": "wheel_winner", "icon": "🎡", "name": "Фортуна", "desc": "Выиграйте на колесе", "category": "social", "condition": "wheel_wins >= 1"},

    # Уровни
    {"id": "tier_silver", "icon": "🥈", "name": "Серебряный", "desc": "Достигните Silver уровня", "category": "tiers", "condition": "tier_rank >= 2"},
    {"id": "tier_gold", "icon": "🥇", "name": "Золотой", "desc": "Достигните Gold уровня", "category": "tiers", "condition": "tier_rank >= 3"},
    {"id": "tier_platinum", "icon": "💠", "name": "Платиновый", "desc": "Достигните Platinum уровня", "category": "tiers", "condition": "tier_rank >= 4"},

    # Серии
    {"id": "streak_3", "icon": "🔥", "name": "3 дня подряд!", "desc": "Покупки 3 дня подряд", "category": "streaks", "condition": "streak >= 3"},
    {"id": "streak_7", "icon": "🔥🔥", "name": "Неделя огня!", "desc": "Покупки 7 дней подряд", "category": "streaks", "condition": "streak >= 7"},
    {"id": "streak_14", "icon": "🔥🔥🔥", "name": "Две недели!", "desc": "Покупки 14 дней подряд", "category": "streaks", "condition": "streak >= 14"},
    {"id": "streak_30", "icon": "🌋", "name": "Месяц огня!", "desc": "Покупки 30 дней подряд", "category": "streaks", "condition": "streak >= 30"},
]

ACHIEVEMENT_MAP = {a["id"]: a for a in ACHIEVEMENTS}

# Tier rank mapping
TIER_RANK = {"Bronze": 1, "Silver": 2, "Gold": 3, "Platinum": 4}

# ═══════════════════════════════════════════
# DAILY MISSIONS
# ═══════════════════════════════════════════

DAILY_MISSIONS = [
    {"id": "visit_today", "icon": "🏪", "name": "Загляните в магазин", "desc": "Совершите покупку сегодня", "bonus": 20, "type": "purchase_today"},
    {"id": "spend_3k", "icon": "🛍️", "name": "Крупная покупка", "desc": "Покупка на 3 000+ сом", "bonus": 50, "type": "purchase_amount_3000"},
    {"id": "use_bonus", "icon": "💳", "name": "Используйте бонусы", "desc": "Спишите бонусы при покупке", "bonus": 30, "type": "spend_bonus"},
    {"id": "invite_friend", "icon": "👥", "name": "Друг магазина", "desc": "Пригласите друга по реферальному коду", "bonus": 100, "type": "referral"},
]


async def _get_customer_stats(customer_id: uuid.UUID, db: AsyncSession) -> dict:
    """Собрать все метрики клиента для проверки достижений."""
    tz = timezone(timedelta(hours=6))
    now = datetime.now(tz)

    # Basic stats
    acc = await db.execute(
        select(BonusAccount).where(BonusAccount.customer_id == customer_id)
    )
    account = acc.scalar_one_or_none()

    cust = await db.execute(
        select(Customer).where(Customer.id == customer_id)
    )
    customer = cust.scalar_one_or_none()
    if not customer:
        return {}

    # Purchase count + LTV
    tx_stats = await db.execute(
        select(
            func.count().label("purchases"),
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("ltv"),
        ).where(
            Transaction.customer_id == customer_id,
            Transaction.type == TransactionType.EARN,
        )
    )
    row = tx_stats.one()

    # Referral count
    ref_count = await db.execute(
        select(func.count()).where(Customer.referred_by == customer_id)
    )

    # Wheel wins
    wheel_wins = await db.execute(
        select(func.count()).where(
            Transaction.customer_id == customer_id,
            Transaction.type == TransactionType.CAMPAIGN,
            Transaction.note.ilike("%колесо%"),
        )
    )

    # Tier rank
    tier_name = "Bronze"
    if customer.tier_id:
        tier_q = await db.execute(select(Tier.name).where(Tier.id == customer.tier_id))
        tier_name = tier_q.scalar_one_or_none() or "Bronze"

    # Current streak
    streak = await _calc_streak(customer_id, db)

    return {
        "purchases": row.purchases,
        "ltv": float(row.ltv),
        "total_earned": float(account.total_earned) if account else 0,
        "total_spent": float(account.total_spent) if account else 0,
        "referrals": ref_count.scalar() or 0,
        "wheel_wins": wheel_wins.scalar() or 0,
        "tier_rank": TIER_RANK.get(tier_name, 1),
        "streak": streak,
    }


async def _calc_streak(customer_id: uuid.UUID, db: AsyncSession) -> int:
    """Подсчёт текущей серии дней покупок."""
    tz = timezone(timedelta(hours=6))
    today = datetime.now(tz).date()

    # Get unique purchase dates (last 60 days)
    result = await db.execute(
        select(
            func.date_trunc(literal_column("'day'"), Transaction.created_at).label("d")
        ).where(
            Transaction.customer_id == customer_id,
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= datetime.now(tz) - timedelta(days=60),
        ).group_by("d").order_by(desc("d"))
    )
    dates = [r.d.date() if hasattr(r.d, 'date') else r.d for r in result.all()]
    if not dates:
        return 0

    # Count consecutive days from today (or yesterday)
    streak = 0
    check_date = today
    if dates[0] != today:
        # Allow yesterday as start
        if dates[0] == today - timedelta(days=1):
            check_date = today - timedelta(days=1)
        else:
            return 0

    for d in dates:
        if d == check_date:
            streak += 1
            check_date -= timedelta(days=1)
        elif d < check_date:
            break
    return streak


def _check_achievement(achievement: dict, stats: dict) -> bool:
    """Проверить, выполнено ли условие достижения."""
    cond = achievement["condition"]
    try:
        # Parse condition like "purchases >= 10"
        parts = cond.split()
        if len(parts) == 3:
            metric, op, value = parts
            val = stats.get(metric, 0)
            threshold = float(value)
            if op == ">=":
                return val >= threshold
            elif op == "==":
                return val == threshold
            elif op == ">":
                return val > threshold
    except Exception:
        pass
    return False


def _calc_progress(achievement: dict, stats: dict) -> float:
    """Рассчитать прогресс к достижению (0.0 - 1.0)."""
    cond = achievement["condition"]
    try:
        parts = cond.split()
        if len(parts) == 3:
            metric, _, value = parts
            val = stats.get(metric, 0)
            threshold = float(value)
            if threshold == 0:
                return 1.0
            return min(1.0, val / threshold)
    except Exception:
        return 0.0


# ═══════════════════════════════════════════
# CLIENT ENDPOINTS (for client cabinet)
# ═══════════════════════════════════════════

@router.get("/profile/{customer_id}")
async def get_gamification_profile(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Полный профиль геймификации клиента."""
    stats = await _get_customer_stats(customer_id, db)
    if not stats:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    unlocked = []
    locked = []
    for ach in ACHIEVEMENTS:
        is_done = _check_achievement(ach, stats)
        progress = _calc_progress(ach, stats)
        item = {
            "id": ach["id"],
            "icon": ach["icon"],
            "name": ach["name"],
            "desc": ach["desc"],
            "category": ach["category"],
            "unlocked": is_done,
            "progress": round(progress, 2),
        }
        if is_done:
            unlocked.append(item)
        else:
            locked.append(item)

    # Sort locked by progress (closest to unlock first)
    locked.sort(key=lambda x: x["progress"], reverse=True)

    # XP points = unlocked achievements * 100
    xp = len(unlocked) * 100
    # Level = XP / 300 (every 3 achievements = 1 level)
    level = max(1, xp // 300 + 1)
    xp_for_next = level * 300
    xp_in_level = xp - (level - 1) * 300

    # Missions for today
    tz = timezone(timedelta(hours=6))
    today = datetime.now(tz).date()
    missions = await _get_daily_missions(customer_id, today, stats, db)

    return {
        "level": level,
        "xp": xp,
        "xp_for_next_level": xp_for_next,
        "xp_in_level": xp_in_level,
        "total_achievements": len(ACHIEVEMENTS),
        "unlocked_count": len(unlocked),
        "streak": stats.get("streak", 0),
        "unlocked": unlocked,
        "locked": locked,
        "missions": missions,
        "stats": {
            "purchases": stats["purchases"],
            "ltv": stats["ltv"],
            "total_earned": stats["total_earned"],
            "total_spent": stats["total_spent"],
            "referrals": stats["referrals"],
        },
    }


async def _get_daily_missions(
    customer_id: uuid.UUID,
    today: date,
    stats: dict,
    db: AsyncSession,
) -> list:
    """Получить ежедневные задания с текущим прогрессом."""
    tz = timezone(timedelta(hours=6))
    today_start = datetime.combine(today, datetime.min.time()).replace(tzinfo=tz)
    today_end = today_start + timedelta(days=1)

    # Today's transactions
    today_tx = await db.execute(
        select(Transaction).where(
            Transaction.customer_id == customer_id,
            Transaction.created_at >= today_start,
            Transaction.created_at < today_end,
        )
    )
    txs = today_tx.scalars().all()

    has_purchase = any(t.type == TransactionType.EARN for t in txs)
    max_purchase = max((float(t.purchase_amount or 0) for t in txs if t.type == TransactionType.EARN), default=0)
    has_spend = any(t.type == TransactionType.SPEND for t in txs)
    today_referrals = await db.execute(
        select(func.count()).where(
            Customer.referred_by == customer_id,
            Customer.created_at >= today_start,
            Customer.created_at < today_end,
        )
    )
    has_referral = (today_referrals.scalar() or 0) > 0

    missions = []
    for m in DAILY_MISSIONS:
        completed = False
        if m["type"] == "purchase_today":
            completed = has_purchase
        elif m["type"] == "purchase_amount_3000":
            completed = max_purchase >= 3000
        elif m["type"] == "spend_bonus":
            completed = has_spend
        elif m["type"] == "referral":
            completed = has_referral

        missions.append({
            "id": m["id"],
            "icon": m["icon"],
            "name": m["name"],
            "desc": m["desc"],
            "bonus": m["bonus"],
            "completed": completed,
        })
    return missions


# ═══════════════════════════════════════════
# ADMIN ENDPOINTS — Gamification Analytics
# ═══════════════════════════════════════════

@router.get("/admin/stats")
async def gamification_admin_stats(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Статистика геймификации для админ-панели."""
    tz = timezone(timedelta(hours=6))
    now = datetime.now(tz)

    # Total active customers
    total_q = await db.execute(
        select(func.count()).select_from(Customer).where(Customer.is_active == True)
    )
    total_customers = total_q.scalar() or 0

    # Streak distribution
    # We'll compute streaks for top customers by recent activity
    recent_earners = await db.execute(
        select(Transaction.customer_id).where(
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= now - timedelta(days=30),
        ).group_by(Transaction.customer_id)
    )
    active_ids = [r.customer_id for r in recent_earners.all()]

    streak_counts = {"0": 0, "1-2": 0, "3-6": 0, "7-13": 0, "14-29": 0, "30+": 0}
    for cid in active_ids[:200]:  # Limit for performance
        s = await _calc_streak(cid, db)
        if s == 0:
            streak_counts["0"] += 1
        elif s <= 2:
            streak_counts["1-2"] += 1
        elif s <= 6:
            streak_counts["3-6"] += 1
        elif s <= 13:
            streak_counts["7-13"] += 1
        elif s <= 29:
            streak_counts["14-29"] += 1
        else:
            streak_counts["30+"] += 1

    # Top streakers
    top_streakers = []
    streak_list = []
    for cid in active_ids[:200]:
        s = await _calc_streak(cid, db)
        if s >= 3:
            streak_list.append((cid, s))
    streak_list.sort(key=lambda x: x[1], reverse=True)
    for cid, s in streak_list[:10]:
        c_q = await db.execute(select(Customer.full_name, Customer.phone).where(Customer.id == cid))
        c_row = c_q.one_or_none()
        if c_row:
            top_streakers.append({"name": c_row.full_name, "phone": c_row.phone, "streak": s})

    # Achievement leaderboard
    achievement_leaders = []
    sample_ids = active_ids[:100]
    leader_data = []
    for cid in sample_ids:
        stats = await _get_customer_stats(cid, db)
        if not stats:
            continue
        unlocked = sum(1 for a in ACHIEVEMENTS if _check_achievement(a, stats))
        if unlocked > 0:
            leader_data.append((cid, unlocked, stats))
    leader_data.sort(key=lambda x: x[1], reverse=True)
    for cid, count, stats in leader_data[:10]:
        c_q = await db.execute(select(Customer.full_name, Customer.phone).where(Customer.id == cid))
        c_row = c_q.one_or_none()
        if c_row:
            achievement_leaders.append({
                "name": c_row.full_name,
                "phone": c_row.phone,
                "unlocked": count,
                "total": len(ACHIEVEMENTS),
                "level": max(1, count * 100 // 300 + 1),
            })

    # Most popular achievements
    popular = {}
    for cid in sample_ids:
        stats = await _get_customer_stats(cid, db)
        if not stats:
            continue
        for a in ACHIEVEMENTS:
            if _check_achievement(a, stats):
                popular[a["id"]] = popular.get(a["id"], 0) + 1
    popular_list = [
        {"id": aid, "count": cnt, **ACHIEVEMENT_MAP[aid]}
        for aid, cnt in sorted(popular.items(), key=lambda x: x[1], reverse=True)
    ][:10]

    return {
        "total_customers": total_customers,
        "active_last_30d": len(active_ids),
        "total_achievements": len(ACHIEVEMENTS),
        "streak_distribution": streak_counts,
        "top_streakers": top_streakers,
        "achievement_leaders": achievement_leaders,
        "popular_achievements": popular_list,
        "achievements_config": ACHIEVEMENTS,
    }
