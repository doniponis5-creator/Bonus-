"""
Sbonus+ — WhatsApp рассылки по сегментам + автоматические триггеры.

Сегменты:
  all           — все активные клиенты
  sleeping      — нет покупок 30+ дней
  vip           — уровень Gold/Platinum
  new           — зарегистрированы за последние 7 дней
  birthday      — день рождения сегодня
  high_balance  — баланс > порога
  low_balance   — баланс < порога, но > 0

Авто-триггеры (cron):
  - 30 дней без покупки → мотивационное сообщение
  - День рождения → поздравление
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone, date
from typing import Optional

from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.models import (
    Customer, BonusAccount, Transaction, TransactionType,
    Tier, Setting, Notification, NotificationChannel, NotificationStatus,
)
from app.services.whatsapp import send_whatsapp_message

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════
# SEGMENT QUERIES
# ═══════════════════════════════════════════

async def get_segment_customers(
    db: AsyncSession,
    segment: str,
    threshold: Optional[float] = None,
) -> list[dict]:
    """
    Получить клиентов по сегменту.
    Возвращает list[{id, full_name, phone, balance, tier_name, last_purchase}]
    """
    now = datetime.now(timezone.utc)

    base = (
        select(
            Customer.id, Customer.full_name, Customer.phone, Customer.birth_date,
            func.coalesce(BonusAccount.balance, 0).label("balance"),
            Tier.name.label("tier_name"),
            func.max(Transaction.created_at).label("last_purchase"),
        )
        .outerjoin(BonusAccount, Customer.id == BonusAccount.customer_id)
        .outerjoin(Tier, Customer.tier_id == Tier.id)
        .outerjoin(
            Transaction,
            and_(
                Transaction.customer_id == Customer.id,
                Transaction.type == TransactionType.EARN,
            ),
        )
        .where(Customer.is_active == True)
        .group_by(Customer.id, Customer.full_name, Customer.phone, Customer.birth_date,
                  BonusAccount.balance, Tier.name)
    )

    if segment == "sleeping":
        days = int(threshold) if threshold else 30
        cutoff = now - timedelta(days=days)
        # Клиенты у которых последняя покупка > N дней назад или нет покупок
        base = base.having(
            (func.max(Transaction.created_at) < cutoff) |
            (func.max(Transaction.created_at).is_(None))
        )

    elif segment == "vip":
        base = base.where(Tier.name.in_(["Gold", "Platinum"]))

    elif segment == "new":
        days = int(threshold) if threshold else 7
        cutoff = now - timedelta(days=days)
        base = base.where(Customer.created_at >= cutoff)

    elif segment == "birthday":
        today = now.date()
        base = base.where(
            func.extract("month", Customer.birth_date) == today.month,
            func.extract("day", Customer.birth_date) == today.day,
        )

    elif segment == "high_balance":
        min_bal = float(threshold) if threshold else 1000
        base = base.having(func.coalesce(BonusAccount.balance, 0) >= min_bal)

    elif segment == "low_balance":
        max_bal = float(threshold) if threshold else 500
        base = base.having(
            and_(
                func.coalesce(BonusAccount.balance, 0) > 0,
                func.coalesce(BonusAccount.balance, 0) <= max_bal,
            )
        )
    # else "all" — no extra filter

    result = await db.execute(base)
    rows = result.all()

    return [
        {
            "id": str(r.id),
            "full_name": r.full_name,
            "phone": r.phone,
            "balance": float(r.balance or 0),
            "tier_name": r.tier_name or "—",
            "last_purchase": r.last_purchase.isoformat() if r.last_purchase else None,
        }
        for r in rows
    ]


async def get_segment_count(db: AsyncSession, segment: str, threshold: Optional[float] = None) -> int:
    """Быстрый подсчёт клиентов в сегменте."""
    customers = await get_segment_customers(db, segment, threshold)
    return len(customers)


# ═══════════════════════════════════════════
# BROADCAST
# ═══════════════════════════════════════════

async def send_broadcast(
    db: AsyncSession,
    segment: str,
    message_template: str,
    threshold: Optional[float] = None,
) -> dict:
    """
    Отправить WhatsApp рассылку по сегменту.
    Шаблон поддерживает: {name}, {balance}, {link}
    """
    customers = await get_segment_customers(db, segment, threshold)

    if not customers:
        return {"sent": 0, "failed": 0, "total": 0}

    # Получить WA конфиг
    wa_cfg = await _get_wa_config(db)
    if not wa_cfg.get("enabled"):
        return {"sent": 0, "failed": 0, "total": len(customers), "error": "WhatsApp отключён"}

    instance_id = wa_cfg["instance_id"]
    api_token = wa_cfg["api_token"]
    interval = float(wa_cfg.get("interval", 3))

    from app.core.config import get_settings
    cfg = get_settings()
    cabinet_link = cfg.customer_cabinet_base_url.rstrip("/")

    sent = 0
    failed = 0

    for c in customers:
        msg = (
            message_template
            .replace("{name}", c["full_name"])
            .replace("{balance}", f"{c['balance']:,.0f}")
            .replace("{link}", cabinet_link)
        )

        try:
            ok = await send_whatsapp_message(c["phone"], msg, instance_id, api_token)
            if ok:
                sent += 1
            else:
                failed += 1
        except Exception:
            failed += 1

        if interval > 0:
            await asyncio.sleep(interval)

    return {"sent": sent, "failed": failed, "total": len(customers)}


# ═══════════════════════════════════════════
# AUTO-TRIGGERS (cron tasks)
# ═══════════════════════════════════════════

async def auto_trigger_sleeping_customers():
    """
    Авто-триггер: клиенты без покупок 30+ дней.
    Запускается из cron ежедневно.
    """
    async with async_session() as db:
        cfg = await _get_auto_trigger_config(db)
        if not cfg.get("sleeping_enabled", False):
            return

        sleeping_days = cfg.get("sleeping_days", 30)
        template = cfg.get("sleeping_template", (
            "Привет, {name}! Давно не виделись! "
            "У вас {balance} KGS бонусов. "
            "Ждём вас в Смарт Центр! {link}"
        ))

        result = await send_broadcast(db, "sleeping", template, threshold=sleeping_days)
        logger.info("Auto-trigger sleeping: %s", result)


async def auto_trigger_birthday():
    """
    Авто-триггер: поздравление с днём рождения.
    Запускается из cron ежедневно.
    """
    async with async_session() as db:
        cfg = await _get_auto_trigger_config(db)
        if not cfg.get("birthday_enabled", False):
            return

        template = cfg.get("birthday_template", (
            "С днём рождения, {name}! "
            "Желаем здоровья и счастья! "
            "Ваш бонусный баланс: {balance} KGS. "
            "Приходите за подарком! {link}"
        ))

        result = await send_broadcast(db, "birthday", template)
        logger.info("Auto-trigger birthday: %s", result)


# ═══════════════════════════════════════════
# CONFIG HELPERS
# ═══════════════════════════════════════════

async def _get_wa_config(db: AsyncSession) -> dict:
    """Получить WhatsApp конфиг из Settings."""
    result = await db.execute(
        select(Setting).where(Setting.key.in_([
            "ENABLE_WHATSAPP_NOTIFICATIONS",
            "GREENAPI_INSTANCE_ID",
            "GREENAPI_API_TOKEN",
            "WA_MESSAGE_INTERVAL",
        ]))
    )
    settings = {s.key: s.value for s in result.scalars().all()}
    return {
        "enabled": settings.get("ENABLE_WHATSAPP_NOTIFICATIONS") == "true",
        "instance_id": settings.get("GREENAPI_INSTANCE_ID", ""),
        "api_token": settings.get("GREENAPI_API_TOKEN", ""),
        "interval": settings.get("WA_MESSAGE_INTERVAL", "3"),
    }


async def _get_auto_trigger_config(db: AsyncSession) -> dict:
    """Получить конфиг авто-триггеров."""
    result = await db.execute(
        select(Setting).where(Setting.key == "wa_auto_triggers")
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return {
            "sleeping_enabled": False,
            "sleeping_days": 30,
            "sleeping_template": "Привет, {name}! Давно не виделись! У вас {balance} KGS бонусов. Ждём вас! {link}",
            "birthday_enabled": False,
            "birthday_template": "С днём рождения, {name}! Ваш баланс: {balance} KGS. Приходите за подарком! {link}",
        }
    try:
        return json.loads(row.value)
    except (json.JSONDecodeError, TypeError):
        return {"sleeping_enabled": False, "birthday_enabled": False}
