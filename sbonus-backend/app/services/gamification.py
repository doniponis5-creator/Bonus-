"""
Sbonus+ — Gamification 2.0 Engine.

Markazlashtirilgan o'yin dvigateli: streak (seriya), quest progress (missiya),
achievement unlock (bейджи), XP/level, va bonus berish.

Arxitektura:
  - event_bus orqali sinxron emas — fire-and-forget handlerlar (o'z DB sessiyasi)
  - Asosiy bonus flow ga TEGMAYDI (BonusService o'zgarmaydi)
  - Hamma narsa persistent (DB jadvallar), on-the-fly hisob YO'Q

Quest claim → bonus + XP (foydalanuvchi qo'lda oladi).
Achievement unlock → bonus + XP avtomatik (darhol).
"""

import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Customer, BonusAccount, Transaction, TransactionType, Tier,
    Quest, QuestProgress, CustomerGameStats, Achievement, CustomerAchievement,
)

logger = logging.getLogger("sbonus.gamification")

# Asia/Bishkek = UTC+6
TZ = timezone(timedelta(hours=6))

# Tier rank (для achievement-условий)
TIER_RANK = {"Bronze": 1, "Silver": 2, "Gold": 3, "Platinum": 4}


# ═══════════════════════════════════════════
# LEVEL / XP
# ═══════════════════════════════════════════

def xp_needed_for_level(level: int) -> int:
    """XP, нужный чтобы пройти данный уровень (level → level+1). Растёт линейно."""
    # level 1 → 2: 100, 2 → 3: 150, 3 → 4: 200 ...
    return 100 + (level - 1) * 50


def level_from_xp(xp: int) -> dict:
    """
    По общему XP вернуть: level, xp_in_level (накоплено в текущем уровне),
    xp_for_next (нужно для следующего), total_for_next (порог общий).
    """
    level = 1
    cum = 0
    while True:
        need = xp_needed_for_level(level)
        if xp >= cum + need:
            cum += need
            level += 1
        else:
            break
        if level > 999:  # защита
            break
    need = xp_needed_for_level(level)
    return {
        "level": level,
        "xp": xp,
        "xp_in_level": xp - cum,
        "xp_for_next": need,
        "total_xp_for_next": cum + need,
    }


# ═══════════════════════════════════════════
# PERIOD KEYS
# ═══════════════════════════════════════════

def period_key(period: str, dt: Optional[datetime] = None) -> str:
    """Ключ периода для quest_progress: daily/weekly/monthly/once."""
    now = dt or datetime.now(TZ)
    if period == "daily":
        return now.strftime("%Y-%m-%d")
    if period == "weekly":
        iso = now.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    if period == "monthly":
        return now.strftime("%Y-%m")
    return "once"


# ═══════════════════════════════════════════
# GAME STATS (XP, streak)
# ═══════════════════════════════════════════

async def get_or_create_stats(db: AsyncSession, customer_id: uuid.UUID) -> CustomerGameStats:
    """Получить/создать игровую статистику клиента."""
    res = await db.execute(
        select(CustomerGameStats).where(CustomerGameStats.customer_id == customer_id)
    )
    stats = res.scalar_one_or_none()
    if stats is None:
        stats = CustomerGameStats(customer_id=customer_id, xp=0, level=1)
        db.add(stats)
        await db.flush()
    return stats


def _apply_xp(stats: CustomerGameStats, amount: int) -> None:
    """Добавить XP и пересчитать уровень."""
    if amount <= 0:
        return
    stats.xp = (stats.xp or 0) + amount
    stats.level = level_from_xp(stats.xp)["level"]


async def _update_streak(db: AsyncSession, stats: CustomerGameStats, today: date) -> int:
    """
    Обновить серию дней при покупке.
    Возвращает 0 если день уже засчитан (без изменений), 1 если streak вырос.
    """
    last = stats.last_activity_date
    if last == today:
        return 0  # уже сегодня покупал — серия не растёт
    if last == today - timedelta(days=1):
        stats.current_streak = (stats.current_streak or 0) + 1
    else:
        # пропуск дня — серия сбрасывается (если есть freeze — используем)
        if last is not None and stats.freeze_count and stats.freeze_count > 0 and last == today - timedelta(days=2):
            stats.freeze_count -= 1
            stats.current_streak = (stats.current_streak or 0) + 1
        else:
            stats.current_streak = 1
    stats.last_activity_date = today
    if stats.current_streak > (stats.longest_streak or 0):
        stats.longest_streak = stats.current_streak
    return 1


# ═══════════════════════════════════════════
# BONUS AWARD (для quest claim / achievement unlock)
# ═══════════════════════════════════════════

async def _award_bonus(
    db: AsyncSession,
    customer_id: uuid.UUID,
    amount: Decimal,
    note: str,
) -> Optional[Decimal]:
    """Начислить бонус на счёт + создать PROMO транзакцию. Возвращает новый баланс."""
    if amount is None or amount <= 0:
        return None
    res = await db.execute(
        select(BonusAccount).where(BonusAccount.customer_id == customer_id)
    )
    acc = res.scalar_one_or_none()
    if acc is None:
        acc = BonusAccount(customer_id=customer_id, balance=Decimal("0"), total_earned=Decimal("0"), total_spent=Decimal("0"))
        db.add(acc)
        await db.flush()
    acc.balance = (acc.balance or Decimal("0")) + amount
    acc.total_earned = (acc.total_earned or Decimal("0")) + amount
    db.add(Transaction(
        customer_id=customer_id,
        type=TransactionType.PROMO,
        amount=amount,
        note=note,
    ))
    return acc.balance


# ═══════════════════════════════════════════
# QUEST PROGRESS
# ═══════════════════════════════════════════

async def _get_or_create_progress(
    db: AsyncSession, customer_id: uuid.UUID, quest: Quest
) -> QuestProgress:
    """Получить/создать запись прогресса квеста для текущего периода."""
    pkey = period_key(quest.period)
    res = await db.execute(
        select(QuestProgress).where(
            QuestProgress.customer_id == customer_id,
            QuestProgress.quest_id == quest.id,
            QuestProgress.period_key == pkey,
        )
    )
    prog = res.scalar_one_or_none()
    if prog is None:
        prog = QuestProgress(
            customer_id=customer_id,
            quest_id=quest.id,
            period_key=pkey,
            current_value=Decimal("0"),
            target_value=quest.target_value,
            status="active",
        )
        db.add(prog)
        await db.flush()
    return prog


def _bump_progress(prog: QuestProgress, quest: Quest, value: Decimal, mode: str) -> None:
    """Обновить прогресс: mode='inc' (прибавить) или 'max' (взять максимум) или 'set'."""
    if prog.status in ("completed", "claimed"):
        return
    cur = prog.current_value or Decimal("0")
    if mode == "inc":
        cur = cur + value
    elif mode == "max":
        cur = max(cur, value)
    else:  # set
        cur = value
    prog.current_value = cur
    if cur >= (prog.target_value or quest.target_value):
        prog.status = "completed"
        prog.completed_at = datetime.now(TZ)


async def _progress_quests_of_types(
    db: AsyncSession,
    customer_id: uuid.UUID,
    type_values: dict,  # {quest_type: (value, mode)}
) -> None:
    """Продвинуть все активные квесты указанных типов."""
    res = await db.execute(
        select(Quest).where(Quest.is_active == True, Quest.type.in_(list(type_values.keys())))
    )
    quests = res.scalars().all()
    for q in quests:
        # Проверка окна активности
        now = datetime.now(TZ)
        if q.starts_at and now < q.starts_at:
            continue
        if q.ends_at and now > q.ends_at:
            continue
        value, mode = type_values[q.type]
        prog = await _get_or_create_progress(db, customer_id, q)
        _bump_progress(prog, q, value, mode)


# ═══════════════════════════════════════════
# ACHIEVEMENTS
# ═══════════════════════════════════════════

async def _compute_metrics(db: AsyncSession, customer_id: uuid.UUID, stats: CustomerGameStats) -> dict:
    """Собрать метрики клиента для проверки достижений."""
    acc_res = await db.execute(select(BonusAccount).where(BonusAccount.customer_id == customer_id))
    acc = acc_res.scalar_one_or_none()

    tx_res = await db.execute(
        select(
            func.count().label("purchases"),
            func.coalesce(func.sum(Transaction.purchase_amount), 0).label("ltv"),
        ).where(
            Transaction.customer_id == customer_id,
            Transaction.type == TransactionType.EARN,
        )
    )
    row = tx_res.one()

    ref_res = await db.execute(select(func.count()).where(Customer.referred_by == customer_id))

    cust_res = await db.execute(select(Customer.tier_id).where(Customer.id == customer_id))
    tier_id = cust_res.scalar_one_or_none()
    tier_rank = 1
    if tier_id:
        t_res = await db.execute(select(Tier.name).where(Tier.id == tier_id))
        tier_rank = TIER_RANK.get(t_res.scalar_one_or_none() or "Bronze", 1)

    return {
        "purchases": int(row.purchases or 0),
        "ltv": float(row.ltv or 0),
        "total_earned": float(acc.total_earned) if acc else 0.0,
        "total_spent": float(acc.total_spent) if acc else 0.0,
        "referrals": int(ref_res.scalar() or 0),
        "streak": int(stats.current_streak or 0),
        "longest_streak": int(stats.longest_streak or 0),
        "tier_rank": tier_rank,
    }


async def check_achievements(db: AsyncSession, customer_id: uuid.UUID, stats: CustomerGameStats) -> list:
    """
    Проверить и разблокировать новые достижения.
    Возвращает список разблокированных (dict) для уведомлений.
    """
    metrics = await _compute_metrics(db, customer_id, stats)

    # Уже разблокированные
    unlocked_res = await db.execute(
        select(CustomerAchievement.achievement_id).where(CustomerAchievement.customer_id == customer_id)
    )
    unlocked_ids = {r[0] for r in unlocked_res.all()}

    ach_res = await db.execute(select(Achievement).where(Achievement.is_active == True))
    achievements = ach_res.scalars().all()

    newly = []
    for a in achievements:
        if a.id in unlocked_ids:
            continue
        metric_val = metrics.get(a.metric, 0)
        if metric_val >= float(a.threshold):
            db.add(CustomerAchievement(customer_id=customer_id, achievement_id=a.id, notified=False))
            stats.total_achievements = (stats.total_achievements or 0) + 1
            _apply_xp(stats, a.xp_reward or 0)
            new_balance = None
            if a.bonus_reward and a.bonus_reward > 0:
                new_balance = await _award_bonus(db, customer_id, a.bonus_reward, f"Достижение: {a.title}")
            newly.append({
                "code": a.code,
                "title": a.title,
                "icon": a.icon,
                "grade": a.grade,
                "xp_reward": a.xp_reward,
                "bonus_reward": float(a.bonus_reward or 0),
                "new_balance": float(new_balance) if new_balance is not None else None,
            })
    return newly


# ═══════════════════════════════════════════
# PUBLIC: обработка событий
# ═══════════════════════════════════════════

async def process_purchase(db: AsyncSession, customer_id: uuid.UUID, purchase_amount: float) -> None:
    """Покупка (EARN): streak + квесты + достижения."""
    stats = await get_or_create_stats(db, customer_id)
    today = datetime.now(TZ).date()
    grew = await _update_streak(db, stats, today)
    if grew:
        _apply_xp(stats, 5)  # XP за активность дня
    amt = Decimal(str(purchase_amount or 0))
    await _progress_quests_of_types(db, customer_id, {
        "purchase_count": (Decimal("1"), "inc"),
        "visit": (Decimal("1"), "inc"),
        "purchase_amount": (amt, "max"),
        "spend_sum": (amt, "inc"),
        "streak": (Decimal(str(stats.current_streak or 0)), "max"),
    })
    await check_achievements(db, customer_id, stats)


async def process_spend(db: AsyncSession, customer_id: uuid.UUID) -> None:
    """Списание бонусов: квест spend_bonus."""
    stats = await get_or_create_stats(db, customer_id)
    await _progress_quests_of_types(db, customer_id, {
        "spend_bonus": (Decimal("1"), "inc"),
    })
    await check_achievements(db, customer_id, stats)


async def process_referral(db: AsyncSession, customer_id: uuid.UUID) -> None:
    """Реферал применён (для пригласившего): квест referral."""
    stats = await get_or_create_stats(db, customer_id)
    await _progress_quests_of_types(db, customer_id, {
        "referral": (Decimal("1"), "inc"),
    })
    await check_achievements(db, customer_id, stats)


async def process_wheel(db: AsyncSession, customer_id: uuid.UUID) -> None:
    """Колесо прокручено: квест wheel_spin."""
    await get_or_create_stats(db, customer_id)
    await _progress_quests_of_types(db, customer_id, {
        "wheel_spin": (Decimal("1"), "inc"),
    })


# ═══════════════════════════════════════════
# PUBLIC: claim квеста
# ═══════════════════════════════════════════

async def claim_quest(db: AsyncSession, customer_id: uuid.UUID, progress_id: uuid.UUID) -> dict:
    """Получить награду за выполненный квест."""
    res = await db.execute(
        select(QuestProgress).where(
            QuestProgress.id == progress_id,
            QuestProgress.customer_id == customer_id,
        )
    )
    prog = res.scalar_one_or_none()
    if prog is None:
        return {"ok": False, "error": "not_found"}
    if prog.status == "claimed":
        return {"ok": False, "error": "already_claimed"}
    if prog.status != "completed":
        return {"ok": False, "error": "not_completed"}

    q_res = await db.execute(select(Quest).where(Quest.id == prog.quest_id))
    quest = q_res.scalar_one_or_none()
    if quest is None:
        return {"ok": False, "error": "quest_gone"}

    stats = await get_or_create_stats(db, customer_id)
    _apply_xp(stats, quest.xp_reward or 0)
    stats.total_quests_completed = (stats.total_quests_completed or 0) + 1

    new_balance = None
    if quest.reward_type == "bonus" and quest.reward_amount and quest.reward_amount > 0:
        new_balance = await _award_bonus(db, customer_id, quest.reward_amount, f"Миссия: {quest.title}")
    elif quest.reward_type == "spin":
        # бесплатный спин колеса (Setting WHEEL_FREE_SPINS_{id})
        await _grant_free_spin(db, customer_id, int(quest.reward_amount or 1))

    prog.status = "claimed"
    prog.claimed_at = datetime.now(TZ)

    # достижения могли разблокироваться от XP/уровня — проверим
    await check_achievements(db, customer_id, stats)

    return {
        "ok": True,
        "reward_type": quest.reward_type,
        "reward_amount": float(quest.reward_amount or 0),
        "xp_reward": quest.xp_reward,
        "new_balance": float(new_balance) if new_balance is not None else None,
        "level": stats.level,
        "xp": stats.xp,
    }


async def _grant_free_spin(db: AsyncSession, customer_id: uuid.UUID, count: int) -> None:
    """Добавить бесплатные спины колеса через Setting."""
    from app.models import Setting
    key = f"WHEEL_FREE_SPINS_{customer_id}"
    res = await db.execute(select(Setting).where(Setting.key == key))
    s = res.scalar_one_or_none()
    cur = 0
    try:
        cur = int(s.value) if s and s.value else 0
    except (ValueError, TypeError):
        cur = 0
    if s is None:
        db.add(Setting(key=key, value=str(cur + count)))
    else:
        s.value = str(cur + count)


# ═══════════════════════════════════════════
# EVENT BUS HANDLERS — подключение к существующей шине
# ═══════════════════════════════════════════

def register_handlers() -> None:
    """Зарегистрировать обработчики на event_bus. Вызывается один раз при старте."""
    from app.core.events import event_bus, EventType

    @event_bus.on(EventType.BONUS_EARNED)
    async def _on_earned(event):
        try:
            from app.core.database import async_session
            cid = uuid.UUID(event.customer_id)
            pa = float(event.data.get("purchase_amount") or 0)
            async with async_session() as db:
                await process_purchase(db, cid, pa)
                await db.commit()
        except Exception as e:
            logger.error("gamification on_earned error: %s", e)

    @event_bus.on(EventType.BONUS_SPENT)
    async def _on_spent(event):
        try:
            from app.core.database import async_session
            cid = uuid.UUID(event.customer_id)
            async with async_session() as db:
                await process_spend(db, cid)
                await db.commit()
        except Exception as e:
            logger.error("gamification on_spent error: %s", e)

    @event_bus.on(EventType.REFERRAL_APPLIED)
    async def _on_referral(event):
        try:
            from app.core.database import async_session
            cid = uuid.UUID(event.customer_id)  # inviter
            async with async_session() as db:
                await process_referral(db, cid)
                await db.commit()
        except Exception as e:
            logger.error("gamification on_referral error: %s", e)

    @event_bus.on(EventType.WHEEL_WON)
    async def _on_wheel(event):
        try:
            from app.core.database import async_session
            cid = uuid.UUID(event.customer_id)
            async with async_session() as db:
                await process_wheel(db, cid)
                await db.commit()
        except Exception as e:
            logger.error("gamification on_wheel error: %s", e)

    logger.info("Gamification 2.0 event handlers registered")
