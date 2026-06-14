"""
Sbonus+ — Сервис кассовых смен (открытие/закрытие, пересчёт наличных).

Бизнес-логика:
- Купюры KGS: 5000/2000/1000/500/200/100/50/20.
- Ожидаемая наличность = opening_balance + cash_sales за период смены.
  cash_sales ≈ SUM(EARN.purchase_amount) − SUM(SPEND.amount) кассира за [opened_at; closed_at].
  (Система не делит нал/карту, поэтому это ориентир; кассир поясняет расхождение.)
- USD — справочный эквивалент по курсу из настройки USD_RATE.
- При |difference| >= SHIFT_DISCREPANCY_ALERT_THRESHOLD — WhatsApp админам.
"""

from __future__ import annotations

import logging
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Setting, Transaction, TransactionType, User
from app.core.security import UserRole

logger = logging.getLogger("sbonus.shift")

# Номиналы купюр KGS (от крупных к мелким)
DENOMINATIONS = [5000, 2000, 1000, 500, 200, 100, 50, 20]

DEFAULT_USD_RATE = Decimal("87.45")
DEFAULT_ALERT_THRESHOLD = Decimal("1000")


def _q2(value: Decimal) -> Decimal:
    """Округление до 2 знаков (деньги)."""
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


async def get_setting(db: AsyncSession, key: str, default: str = "") -> str:
    result = await db.execute(select(Setting).where(Setting.key == key))
    s = result.scalar_one_or_none()
    if not s or s.value in (None, "", "None"):
        return default
    return s.value


async def get_usd_rate(db: AsyncSession) -> Decimal:
    raw = await get_setting(db, "USD_RATE", str(DEFAULT_USD_RATE))
    try:
        rate = Decimal(str(raw).replace(",", "."))
        return rate if rate > 0 else DEFAULT_USD_RATE
    except Exception:
        return DEFAULT_USD_RATE


async def get_alert_threshold(db: AsyncSession) -> Decimal:
    raw = await get_setting(db, "SHIFT_DISCREPANCY_ALERT_THRESHOLD", str(DEFAULT_ALERT_THRESHOLD))
    try:
        return Decimal(str(raw).replace(",", "."))
    except Exception:
        return DEFAULT_ALERT_THRESHOLD


def compute_total(denominations: dict) -> tuple[Decimal, int]:
    """Сумма по купюрам + общее количество банкнот. Игнорирует чужие номиналы."""
    total = Decimal("0")
    count = 0
    for denom in DENOMINATIONS:
        qty = int(denominations.get(str(denom), denominations.get(denom, 0)) or 0)
        if qty < 0:
            qty = 0
        total += Decimal(denom) * qty
        count += qty
    return _q2(total), count


def usd_of(amount: Decimal, rate: Decimal) -> Decimal:
    if not rate or rate <= 0:
        return Decimal("0.00")
    return _q2(Decimal(amount) / rate)


async def compute_cash_sales(
    db: AsyncSession,
    cashier_id,
    opened_at: datetime,
    until: datetime,
) -> Decimal:
    """
    Ориентир наличной выручки кассира за смену:
      SUM(purchase_amount) по EARN − SUM(amount) по SPEND.
    """
    earn_q = await db.execute(
        select(func.coalesce(func.sum(Transaction.purchase_amount), 0)).where(
            Transaction.cashier_id == cashier_id,
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= opened_at,
            Transaction.created_at <= until,
        )
    )
    earned = Decimal(str(earn_q.scalar() or 0))

    spend_q = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.cashier_id == cashier_id,
            Transaction.type == TransactionType.SPEND,
            Transaction.created_at >= opened_at,
            Transaction.created_at <= until,
        )
    )
    spent = Decimal(str(spend_q.scalar() or 0))

    sales = earned - spent
    return _q2(sales if sales > 0 else Decimal("0"))


async def maybe_alert_discrepancy(db: AsyncSession, shift, branch_name: str = "") -> None:
    """
    Если |difference| >= порога и WhatsApp включён — уведомить админов.
    Fire-and-forget: ошибки не пробрасываются.
    """
    try:
        if shift.difference is None:
            return
        threshold = await get_alert_threshold(db)
        if abs(Decimal(shift.difference)) < threshold:
            return

        enabled = await get_setting(db, "ENABLE_WHATSAPP_NOTIFICATIONS", "false")
        instance_id = await get_setting(db, "GREENAPI_INSTANCE_ID", "")
        api_token = await get_setting(db, "GREENAPI_API_TOKEN", "")
        if enabled != "true" or not instance_id or not api_token:
            return

        # Получатели — активные админы с телефоном
        admins_q = await db.execute(
            select(User).where(
                User.role.in_([UserRole.SUPER_ADMIN.value, UserRole.BRANCH_ADMIN.value]),
                User.is_active.is_(True),
            )
        )
        admins = [u for u in admins_q.scalars().all() if u.phone]
        if not admins:
            return

        diff = Decimal(shift.difference)
        kind = "ИЗЛИШЕК" if diff > 0 else "НЕДОСТАЧА"
        cashier_q = await db.execute(select(User).where(User.id == shift.cashier_id))
        cashier = cashier_q.scalar_one_or_none()
        cashier_name = cashier.full_name if cashier else "—"

        msg = (
            f"⚠️ Расхождение при закрытии смены\n"
            f"Магазин: Смарт Центр{(' · ' + branch_name) if branch_name else ''}\n"
            f"Кассир: {cashier_name}\n"
            f"Факт: {shift.total_counted} сом\n"
            f"Ожидалось: {shift.total_expected} сом\n"
            f"{kind}: {abs(diff)} сом\n"
            f"Причина: {shift.note or '—'}"
        )

        # Локальный импорт чтобы избежать циклов
        from app.services.whatsapp import send_whatsapp_message

        for admin in admins:
            try:
                await send_whatsapp_message(admin.phone, msg, instance_id, api_token)
            except Exception as e:  # noqa: BLE001
                logger.warning("Shift alert WA failed for %s: %s", admin.phone, e)
    except Exception as e:  # noqa: BLE001
        logger.warning("maybe_alert_discrepancy error: %s", e)
