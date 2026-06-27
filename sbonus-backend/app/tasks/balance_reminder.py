"""
Sbonus+ — Smart Comeback Reminder.
Запускается каждый день в 12:00 (Asia/Bishkek).

Логика:
1. Клиент совершил покупку → 14 дней не вернулся → 1-е напоминание
2. Если клиент всё ещё не вернулся → повторяем не чаще 1 раза в 14 дней
3. Клиент вернулся и купил → новый отсчёт начинается от последней покупки

Ограничения:
- Максимум 50 уведомлений за запуск
- Минимум 14 дней между напоминаниями
- 3 секунды задержка между сообщениями (защита от блокировки WhatsApp)
"""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, func as sa_func

from app.core.config import get_settings
from app.core.database import async_session
from app.models import (
    BonusAccount,
    Customer,
    Notification,
    Setting,
    Transaction,
    TransactionType,
)

settings = get_settings()

# Defaults
INACTIVE_DAYS = 14        # Дней без покупок для напоминания
REMINDER_INTERVAL = 14    # Минимум дней между напоминаниями
MAX_PER_RUN = 50          # Лимит за один запуск
EVENT_TYPE = "comeback_reminder"
EXPIRY_NOTICE_DAYS = 60

# Типы транзакций, которые создают бонусный остаток
_EARN_TYPES = (
    TransactionType.EARN,
    TransactionType.BIRTHDAY,
    TransactionType.REFERRAL,
    TransactionType.PROMO,
    TransactionType.CAMPAIGN,
)

# Типы транзакций, которые расходуют бонусный остаток по FIFO
_CONSUME_TYPES = (
    TransactionType.SPEND,
    TransactionType.EXPIRE,
    TransactionType.REFUND,
)


def _ensure_aware(value: datetime) -> datetime:
    """Сделать дату timezone-aware для корректного сравнения."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


async def _build_expiry_notice(
    db,
    customer_id,
    balance: Decimal,
    now: datetime,
    expiration_days: int,
    notice_days: int,
) -> str:
    """Вернуть строку о ближайшем сгорании бонусов, если оно попадает в окно предупреждения."""
    tx_result = await db.execute(
        select(Transaction).where(
            Transaction.customer_id == customer_id,
            Transaction.type.in_(_EARN_TYPES + _CONSUME_TYPES),
        ).order_by(Transaction.created_at.asc(), Transaction.id.asc())
    )
    transactions = tx_result.scalars().all()

    consume_left = sum(
        (tx.amount or Decimal("0"))
        for tx in transactions
        if tx.type in _CONSUME_TYPES
    )

    expiring_by_date: dict[date, Decimal] = {}

    for tx in transactions:
        if tx.type not in _EARN_TYPES:
            continue

        remaining = tx.amount or Decimal("0")
        if consume_left > Decimal("0"):
            used = min(remaining, consume_left)
            remaining -= used
            consume_left -= used

        if remaining <= Decimal("0"):
            continue

        expires_at = _ensure_aware(tx.created_at) + timedelta(days=expiration_days)
        days_left = (expires_at.date() - now.date()).days
        if 0 <= days_left <= notice_days:
            expire_date = expires_at.date()
            expiring_by_date[expire_date] = expiring_by_date.get(expire_date, Decimal("0")) + remaining

    if not expiring_by_date:
        return ""

    earliest_date = min(expiring_by_date)
    expiring_amount = min(expiring_by_date[earliest_date], balance or Decimal("0"))
    if expiring_amount <= Decimal("0"):
        return ""

    days_left = max((earliest_date - now.date()).days, 0)
    date_text = earliest_date.strftime("%d.%m.%Y")
    amount_text = str(int(expiring_amount))
    return (
        f"⏳ Важно: {amount_text} сом бонусов сгорят {date_text} "
        f"(через {days_left} дн.), если их не использовать."
    )


async def send_balance_reminders() -> None:
    """
    Smart Comeback Reminder:
    Отправляет WhatsApp напоминание клиентам, которые давно не покупали.
    Отправляет только клиентам с бонусным балансом > 0.
    Повторяет напоминание не чаще одного раза в 14 дней до следующей покупки.
    """
    async with async_session() as db:
        # ── Настройки из БД ──
        wa_settings = await db.execute(
            select(Setting).where(Setting.key.in_([
                "ENABLE_WHATSAPP_NOTIFICATIONS",
                "GREENAPI_INSTANCE_ID",
                "GREENAPI_API_TOKEN",
                "WHATSAPP_TEMPLATE_BALANCE_REMINDER",
                "BALANCE_REMINDER_INACTIVE_DAYS",
                "BALANCE_REMINDER_INTERVAL_DAYS",
                "BONUS_EXPIRATION_DAYS",
                "BONUS_EXPIRATION_NOTICE_DAYS",
                "BONUS_EXPIRATION_WARNING_DAYS",
                "WA_MESSAGE_INTERVAL",
            ]))
        )
        s = {row.key: row.value for row in wa_settings.scalars().all()}

        if s.get("ENABLE_WHATSAPP_NOTIFICATIONS") != "true":
            print("  ℹ️ Comeback reminder: WhatsApp отключен")
            return

        instance_id = s.get("GREENAPI_INSTANCE_ID")
        api_token = s.get("GREENAPI_API_TOKEN")
        if not instance_id or not api_token:
            print("  ℹ️ Comeback reminder: Green API не настроен")
            return

        template = s.get("WHATSAPP_TEMPLATE_BALANCE_REMINDER")
        if not template:
            print("  ℹ️ Comeback reminder: шаблон не найден")
            return

        inactive_days = int(s.get("BALANCE_REMINDER_INACTIVE_DAYS", INACTIVE_DAYS))
        reminder_interval = int(s.get("BALANCE_REMINDER_INTERVAL_DAYS", REMINDER_INTERVAL))
        expiration_days = int(s.get("BONUS_EXPIRATION_DAYS", settings.bonus_expiration_days))
        expiry_notice_days = int(
            s.get("BONUS_EXPIRATION_NOTICE_DAYS")
            or s.get("BONUS_EXPIRATION_WARNING_DAYS", EXPIRY_NOTICE_DAYS)
        )
        wa_interval = float(s.get("WA_MESSAGE_INTERVAL", "3"))

        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=inactive_days)
        reminder_cooldown = now - timedelta(days=reminder_interval)

        # ── Subquery: последняя покупка (EARN или SPEND) каждого клиента ──
        last_purchase = (
            select(
                Transaction.customer_id,
                sa_func.max(Transaction.created_at).label("last_purchase_at"),
            )
            .where(Transaction.type.in_([TransactionType.EARN, TransactionType.SPEND]))
            .group_by(Transaction.customer_id)
            .subquery("last_purchase")
        )

        # ── Subquery: последнее напоминание каждого клиента ──
        last_reminder = (
            select(
                Notification.customer_id,
                sa_func.max(Notification.created_at).label("last_reminder_at"),
            )
            .where(Notification.event_type == EVENT_TYPE)
            .group_by(Notification.customer_id)
            .subquery("last_reminder")
        )

        # ── Основной запрос ──
        query = (
            select(
                Customer,
                BonusAccount.balance,
                last_purchase.c.last_purchase_at,
            )
            .join(BonusAccount, BonusAccount.customer_id == Customer.id)
            # Только клиенты с хотя бы одной покупкой
            .join(last_purchase, last_purchase.c.customer_id == Customer.id)
            .outerjoin(last_reminder, last_reminder.c.customer_id == Customer.id)
            .where(
                # Активный клиент
                Customer.is_active == True,
                # Напоминаем только тем, у кого реально есть бонусы
                BonusAccount.balance > 0,
                # Последняя покупка > N дней назад
                last_purchase.c.last_purchase_at < cutoff,
                # Не отправляли reminder в последние N дней (cooldown)
                (last_reminder.c.last_reminder_at.is_(None))
                | (last_reminder.c.last_reminder_at < reminder_cooldown),
            )
            .order_by(last_purchase.c.last_purchase_at.desc())  # Недавно ушедшие — первые
            .limit(MAX_PER_RUN)
        )

        result = await db.execute(query)
        rows = result.all()

        if not rows:
            print("  ℹ️ Comeback reminder: нет клиентов для напоминания")
            return

        print(f"  📨 Comeback reminder: {len(rows)} клиентов")

        import asyncio
        from app.services.whatsapp import send_tracked_whatsapp

        sent = 0
        for row in rows:
            customer = row[0]
            balance = row[1]

            # ── Magic-link: уникальный auto-login для каждого клиента ──
            cabinet_link = "https://cabinet.smartcentr.store"
            try:
                import secrets
                from datetime import timedelta
                from app.models import CustomerAuthToken

                token_value = secrets.token_urlsafe(32)[:64]
                auth_token = CustomerAuthToken(
                    customer_id=customer.id,
                    token=token_value,
                    expires_at=now + timedelta(days=7),
                )
                db.add(auth_token)
                await db.flush()
                cabinet_link = f"https://cabinet.smartcentr.store?token={token_value}"
            except Exception:
                pass  # fallback to plain link

            msg = (
                template
                .replace("{name}", customer.full_name or "")
                .replace("{balance}", str(int(balance)))
                .replace("{link}", cabinet_link)
            )
            expiry_notice = await _build_expiry_notice(
                db=db,
                customer_id=customer.id,
                balance=balance,
                now=now,
                expiration_days=expiration_days,
                notice_days=expiry_notice_days,
            )
            if "{expiry_notice}" in msg:
                msg = msg.replace("{expiry_notice}", expiry_notice)
            elif expiry_notice:
                msg = f"{msg.rstrip()}\n\n{expiry_notice}"

            try:
                await send_tracked_whatsapp(
                    db=db,
                    customer_id=customer.id,
                    phone=customer.phone,
                    message=msg,
                    event_type=EVENT_TYPE,
                    instance_id=instance_id,
                    api_token=api_token,
                )
                sent += 1
                if wa_interval > 0:
                    await asyncio.sleep(wa_interval)
            except Exception as e:
                print(f"  ❌ Comeback reminder failed for {customer.phone}: {e}")

        await db.commit()
        print(f"  ✅ Comeback reminder: {sent}/{len(rows)} отправлено")
