"""
Sbonus+ — Кассир мотивация: ступенчатые бонусы.

Три уровня:
1. Дневные вехи — сброс каждый день
2. Месячные вехи — сброс 1-го числа
3. Стрик-бонус — за N дней подряд с минимум X продажами

Конфиг хранится в Settings (JSON), логи выданных бонусов — CashierMilestoneLog.
"""

import asyncio
import json
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func as sa_func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Setting, Transaction, TransactionType, User


# ═══════════════════════════════════════════
# DEFAULTS
# ═══════════════════════════════════════════

DEFAULT_DAILY = [
    {"sales": 5, "bonus": 200},
    {"sales": 10, "bonus": 500},
    {"sales": 20, "bonus": 1200},
]

DEFAULT_MONTHLY = [
    {"sales": 100, "bonus": 3000},
    {"sales": 200, "bonus": 8000},
    {"sales": 500, "bonus": 25000},
]

DEFAULT_STREAK = [
    {"days": 7, "bonus": 1000},
    {"days": 14, "bonus": 3000},
    {"days": 30, "bonus": 10000},
]


# ═══════════════════════════════════════════
# CONFIG HELPERS
# ═══════════════════════════════════════════

async def get_cashier_bonus_config(db: AsyncSession) -> dict:
    """Получить полный конфиг кассир-бонусов из Settings."""
    keys = [
        "CASHIER_BONUS_ENABLED",
        "CASHIER_DAILY_MILESTONES",
        "CASHIER_MONTHLY_MILESTONES",
        "CASHIER_STREAK_MILESTONES",
        "CASHIER_STREAK_MIN_SALES",
    ]
    result = await db.execute(select(Setting).where(Setting.key.in_(keys)))
    s_map = {s.key: s.value for s in result.scalars().all()}

    return {
        "enabled": s_map.get("CASHIER_BONUS_ENABLED", "true") == "true",
        "daily_milestones": _parse_json(s_map.get("CASHIER_DAILY_MILESTONES"), DEFAULT_DAILY),
        "monthly_milestones": _parse_json(s_map.get("CASHIER_MONTHLY_MILESTONES"), DEFAULT_MONTHLY),
        "streak_milestones": _parse_json(s_map.get("CASHIER_STREAK_MILESTONES"), DEFAULT_STREAK),
        "streak_min_sales": int(s_map.get("CASHIER_STREAK_MIN_SALES", "5")),
    }


async def save_cashier_bonus_config(db: AsyncSession, config: dict) -> None:
    """Сохранить конфиг кассир-бонусов в Settings."""
    pairs = {
        "CASHIER_BONUS_ENABLED": "true" if config.get("enabled", True) else "false",
        "CASHIER_DAILY_MILESTONES": json.dumps(config.get("daily_milestones", DEFAULT_DAILY)),
        "CASHIER_MONTHLY_MILESTONES": json.dumps(config.get("monthly_milestones", DEFAULT_MONTHLY)),
        "CASHIER_STREAK_MILESTONES": json.dumps(config.get("streak_milestones", DEFAULT_STREAK)),
        "CASHIER_STREAK_MIN_SALES": str(config.get("streak_min_sales", 5)),
    }
    for key, value in pairs.items():
        result = await db.execute(select(Setting).where(Setting.key == key))
        record = result.scalar_one_or_none()
        if record:
            record.value = value
        else:
            db.add(Setting(key=key, value=value))
    await db.flush()


def _parse_json(raw: Optional[str], default: list) -> list:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return default


# ═══════════════════════════════════════════
# MILESTONE CHECK (вызывается после earn)
# ═══════════════════════════════════════════

async def check_cashier_milestones(
    db: AsyncSession,
    cashier_id: uuid.UUID,
) -> None:
    """
    Проверить вехи кассира после новой EARN-транзакции.
    Вызывается из BonusService.earn().
    """
    config = await get_cashier_bonus_config(db)
    if not config["enabled"]:
        return

    today = date.today()
    month_start = today.replace(day=1)

    # Подсчёт продаж за сегодня (количество EARN-транзакций этого кассира)
    daily_result = await db.execute(
        select(sa_func.count()).where(
            Transaction.cashier_id == cashier_id,
            Transaction.type == TransactionType.EARN,
            sa_func.date(Transaction.created_at) == today,
        )
    )
    daily_sales = daily_result.scalar() or 0

    # Подсчёт за месяц
    monthly_result = await db.execute(
        select(sa_func.count()).where(
            Transaction.cashier_id == cashier_id,
            Transaction.type == TransactionType.EARN,
            sa_func.date(Transaction.created_at) >= month_start,
        )
    )
    monthly_sales = monthly_result.scalar() or 0

    # Получить лог уже выданных вех
    awarded = await _get_awarded_milestones(db, cashier_id, today, month_start)

    notifications = []

    # === Дневные вехи ===
    for m in sorted(config["daily_milestones"], key=lambda x: x["sales"]):
        milestone_key = f"daily_{today.isoformat()}_{m['sales']}"
        if daily_sales >= m["sales"] and milestone_key not in awarded:
            await _award_milestone(db, cashier_id, milestone_key, m["bonus"], f"Дневная веха: {m['sales']} продаж")
            notifications.append(
                f"Вы достигли {m['sales']} продаж сегодня! Бонус: {m['bonus']} KGS"
            )

    # === Месячные вехи ===
    month_key_prefix = f"monthly_{today.strftime('%Y-%m')}"
    for m in sorted(config["monthly_milestones"], key=lambda x: x["sales"]):
        milestone_key = f"{month_key_prefix}_{m['sales']}"
        if monthly_sales >= m["sales"] and milestone_key not in awarded:
            await _award_milestone(db, cashier_id, milestone_key, m["bonus"], f"Месячная веха: {m['sales']} продаж")
            notifications.append(
                f"Месячный итог: {monthly_sales} продаж! Бонус: {m['bonus']} KGS"
            )

    # === Стрик ===
    streak_days = await _calculate_streak(db, cashier_id, today, config["streak_min_sales"])
    for m in sorted(config["streak_milestones"], key=lambda x: x["days"]):
        milestone_key = f"streak_{today.isoformat()}_{m['days']}"
        if streak_days >= m["days"] and milestone_key not in awarded:
            await _award_milestone(db, cashier_id, milestone_key, m["bonus"], f"Стрик: {m['days']} дней подряд")
            notifications.append(
                f"{m['days']} дней подряд! Стрик-бонус: {m['bonus']} KGS"
            )

    # WhatsApp уведомления
    if notifications:
        await _notify_cashier(db, cashier_id, notifications)


# ═══════════════════════════════════════════
# PROGRESS (для дашборда)
# ═══════════════════════════════════════════

async def get_cashier_progress(db: AsyncSession, cashier_id: uuid.UUID) -> dict:
    """Прогресс кассира: дневной, месячный, стрик."""
    config = await get_cashier_bonus_config(db)
    today = date.today()
    month_start = today.replace(day=1)

    # Дневные продажи
    daily_result = await db.execute(
        select(sa_func.count()).where(
            Transaction.cashier_id == cashier_id,
            Transaction.type == TransactionType.EARN,
            sa_func.date(Transaction.created_at) == today,
        )
    )
    daily_sales = daily_result.scalar() or 0

    # Месячные продажи
    monthly_result = await db.execute(
        select(sa_func.count()).where(
            Transaction.cashier_id == cashier_id,
            Transaction.type == TransactionType.EARN,
            sa_func.date(Transaction.created_at) >= month_start,
        )
    )
    monthly_sales = monthly_result.scalar() or 0

    # Дневная выручка
    daily_revenue_result = await db.execute(
        select(sa_func.coalesce(sa_func.sum(Transaction.purchase_amount), 0)).where(
            Transaction.cashier_id == cashier_id,
            Transaction.type == TransactionType.EARN,
            sa_func.date(Transaction.created_at) == today,
        )
    )
    daily_revenue = float(daily_revenue_result.scalar() or 0)

    # Месячная выручка
    monthly_revenue_result = await db.execute(
        select(sa_func.coalesce(sa_func.sum(Transaction.purchase_amount), 0)).where(
            Transaction.cashier_id == cashier_id,
            Transaction.type == TransactionType.EARN,
            sa_func.date(Transaction.created_at) >= month_start,
        )
    )
    monthly_revenue = float(monthly_revenue_result.scalar() or 0)

    # Стрик
    streak_days = await _calculate_streak(db, cashier_id, today, config["streak_min_sales"])

    # Текущая/следующая дневная веха
    daily_current = None
    daily_next = None
    sorted_daily = sorted(config["daily_milestones"], key=lambda x: x["sales"])
    for m in sorted_daily:
        if daily_sales >= m["sales"]:
            daily_current = m
        elif daily_next is None:
            daily_next = m

    # Текущая/следующая месячная веха
    monthly_current = None
    monthly_next = None
    sorted_monthly = sorted(config["monthly_milestones"], key=lambda x: x["sales"])
    for m in sorted_monthly:
        if monthly_sales >= m["sales"]:
            monthly_current = m
        elif monthly_next is None:
            monthly_next = m

    # Текущий/следующий стрик
    streak_current = None
    streak_next = None
    sorted_streak = sorted(config["streak_milestones"], key=lambda x: x["days"])
    for m in sorted_streak:
        if streak_days >= m["days"]:
            streak_current = m
        elif streak_next is None:
            streak_next = m

    # Итого заработано за период
    awarded_today = await _sum_awarded(db, cashier_id, f"daily_{today.isoformat()}")
    awarded_month = await _sum_awarded(db, cashier_id, f"monthly_{today.strftime('%Y-%m')}")
    awarded_streak = await _sum_awarded(db, cashier_id, f"streak_")

    return {
        "daily": {
            "sales": daily_sales,
            "revenue": daily_revenue,
            "current_milestone": daily_current,
            "next_milestone": daily_next,
            "earned_today": awarded_today,
        },
        "monthly": {
            "sales": monthly_sales,
            "revenue": monthly_revenue,
            "current_milestone": monthly_current,
            "next_milestone": monthly_next,
            "earned_month": awarded_month,
        },
        "streak": {
            "days": streak_days,
            "min_sales": config["streak_min_sales"],
            "current_milestone": streak_current,
            "next_milestone": streak_next,
            "earned_total": awarded_streak,
        },
    }


async def get_all_cashiers_progress(db: AsyncSession) -> list[dict]:
    """Прогресс всех кассиров для админ-дашборда."""
    result = await db.execute(
        select(User).where(User.role == "cashier", User.is_active == True).order_by(User.full_name)
    )
    cashiers = result.scalars().all()

    progress_list = []
    for cashier in cashiers:
        progress = await get_cashier_progress(db, cashier.id)
        progress_list.append({
            "id": str(cashier.id),
            "full_name": cashier.full_name,
            "phone": cashier.phone,
            "branch_id": str(cashier.branch_id) if cashier.branch_id else None,
            **progress,
        })

    return progress_list


# ═══════════════════════════════════════════
# INTERNALS
# ═══════════════════════════════════════════

async def _get_awarded_milestones(
    db: AsyncSession, cashier_id: uuid.UUID, today: date, month_start: date
) -> set:
    """Получить все milestone_key уже выданных вех."""
    result = await db.execute(
        select(Setting.key).where(
            Setting.key.like(f"CASHIER_MILESTONE_{cashier_id}_%")
        )
    )
    return {row[0].replace(f"CASHIER_MILESTONE_{cashier_id}_", "") for row in result.all()}


async def _award_milestone(
    db: AsyncSession,
    cashier_id: uuid.UUID,
    milestone_key: str,
    bonus_amount: int,
    description: str,
) -> None:
    """Записать выданную веху в Settings."""
    full_key = f"CASHIER_MILESTONE_{cashier_id}_{milestone_key}"
    db.add(Setting(
        key=full_key,
        value=json.dumps({
            "bonus": bonus_amount,
            "description": description,
            "awarded_at": datetime.now(timezone.utc).isoformat(),
        }),
    ))
    await db.flush()


async def _sum_awarded(db: AsyncSession, cashier_id: uuid.UUID, prefix: str) -> int:
    """Сумма бонусов по выданным вехам с данным префиксом."""
    result = await db.execute(
        select(Setting.value).where(
            Setting.key.like(f"CASHIER_MILESTONE_{cashier_id}_{prefix}%")
        )
    )
    total = 0
    for (val,) in result.all():
        try:
            data = json.loads(val)
            total += int(data.get("bonus", 0))
        except (json.JSONDecodeError, TypeError):
            pass
    return total


async def _calculate_streak(
    db: AsyncSession, cashier_id: uuid.UUID, today: date, min_sales: int
) -> int:
    """Посчитать стрик: сколько дней подряд (включая сегодня) с >= min_sales."""
    streak = 0
    check_date = today

    for _ in range(90):  # максимум 90 дней назад
        result = await db.execute(
            select(sa_func.count()).where(
                Transaction.cashier_id == cashier_id,
                Transaction.type == TransactionType.EARN,
                sa_func.date(Transaction.created_at) == check_date,
            )
        )
        day_sales = result.scalar() or 0

        if day_sales >= min_sales:
            streak += 1
            check_date -= timedelta(days=1)
        else:
            break

    return streak


async def _notify_cashier(
    db: AsyncSession, cashier_id: uuid.UUID, messages: list[str]
) -> None:
    """Отправить WhatsApp уведомление кассиру."""
    from app.services.whatsapp import send_whatsapp_message

    # Получить кассира
    result = await db.execute(select(User).where(User.id == cashier_id))
    cashier = result.scalar_one_or_none()
    if not cashier or not cashier.phone:
        return

    # WA конфиг
    wa_result = await db.execute(
        select(Setting).where(Setting.key.in_([
            "ENABLE_WHATSAPP_NOTIFICATIONS",
            "GREENAPI_INSTANCE_ID",
            "GREENAPI_API_TOKEN",
        ]))
    )
    wa_cfg = {s.key: s.value for s in wa_result.scalars().all()}

    if wa_cfg.get("ENABLE_WHATSAPP_NOTIFICATIONS") != "true":
        return

    instance_id = wa_cfg.get("GREENAPI_INSTANCE_ID")
    api_token = wa_cfg.get("GREENAPI_API_TOKEN")
    if not instance_id or not api_token:
        return

    # Формируем сообщение
    msg = f"{cashier.full_name}, поздравляем!\n\n"
    for m in messages:
        msg += f"  {m}\n"
    msg += "\nПродолжайте в том же духе!"

    asyncio.create_task(send_whatsapp_message(
        phone=cashier.phone, message=msg,
        instance_id=instance_id, api_token=api_token,
    ))
