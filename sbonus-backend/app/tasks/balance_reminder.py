"""
Sbonus+ — Cron задача: напоминание о бонусах неактивным клиентам.
Запускается каждый день в 12:00 (Asia/Bishkek).

Логика:
1. Находим клиентов с балансом > 0
2. У которых последняя транзакция была более N дней назад (по умолчанию 14)
3. Которым не отправляли reminder в последние N дней
4. Отправляем WhatsApp уведомление с ссылкой на кабинет

Ограничения:
- Максимум 50 уведомлений за запуск (чтобы не спамить API)
- Не чаще 1 раза в reminder_interval_days на клиента
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func as sa_func, and_

from app.core.config import get_settings
from app.core.database import async_session
from app.models import (
    BonusAccount,
    Customer,
    Notification,
    Setting,
    Transaction,
)

settings = get_settings()

# Настройки по умолчанию
INACTIVE_DAYS = 14        # Дни без покупок для напоминания
REMINDER_INTERVAL = 14    # Минимум дней между напоминаниями
MAX_PER_RUN = 50          # Лимит уведомлений за запуск
MIN_BALANCE = 100         # Минимальный баланс для напоминания (KGS)


async def send_balance_reminders() -> None:
    """Отправить напоминания о бонусах неактивным клиентам."""
    async with async_session() as db:
        # ── Настройки из БД ──
        wa_settings = await db.execute(
            select(Setting).where(Setting.key.in_([
                "ENABLE_WHATSAPP_NOTIFICATIONS",
                "GREENAPI_INSTANCE_ID",
                "GREENAPI_API_TOKEN",
                "WHATSAPP_TEMPLATE_BALANCE_REMINDER",
                "BALANCE_REMINDER_INACTIVE_DAYS",
                "BALANCE_REMINDER_MIN_BALANCE",
            ]))
        )
        settings_map = {s.key: s.value for s in wa_settings.scalars().all()}

        if settings_map.get("ENABLE_WHATSAPP_NOTIFICATIONS") != "true":
            print("  ℹ️ Balance reminder: WhatsApp отключен")
            return

        instance_id = settings_map.get("GREENAPI_INSTANCE_ID")
        api_token = settings_map.get("GREENAPI_API_TOKEN")
        if not instance_id or not api_token:
            print("  ℹ️ Balance reminder: Green API не настроен")
            return

        template = settings_map.get("WHATSAPP_TEMPLATE_BALANCE_REMINDER")
        if not template:
            print("  ℹ️ Balance reminder: шаблон не найден")
            return

        inactive_days = int(settings_map.get("BALANCE_REMINDER_INACTIVE_DAYS", INACTIVE_DAYS))
        min_balance = int(settings_map.get("BALANCE_REMINDER_MIN_BALANCE", MIN_BALANCE))

        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=inactive_days)
        reminder_cutoff = now - timedelta(days=REMINDER_INTERVAL)

        # ── Находим последнюю транзакцию каждого клиента ──
        last_txn_sub = (
            select(
                Transaction.customer_id,
                sa_func.max(Transaction.created_at).label("last_txn_at"),
            )
            .group_by(Transaction.customer_id)
            .subquery()
        )

        # ── Находим последнее напоминание ──
        last_reminder_sub = (
            select(
                Notification.customer_id,
                sa_func.max(Notification.created_at).label("last_reminder_at"),
            )
            .where(Notification.event_type == "balance_reminder")
            .group_by(Notification.customer_id)
            .subquery()
        )

        # ── Основной запрос ──
        query = (
            select(Customer, BonusAccount.balance)
            .join(BonusAccount, BonusAccount.customer_id == Customer.id)
            .outerjoin(last_txn_sub, last_txn_sub.c.customer_id == Customer.id)
            .outerjoin(last_reminder_sub, last_reminder_sub.c.customer_id == Customer.id)
            .where(
                Customer.is_active == True,
                BonusAccount.balance >= min_balance,
                # Нет транзакций или последняя > inactive_days назад
                (last_txn_sub.c.last_txn_at.is_(None)) | (last_txn_sub.c.last_txn_at < cutoff),
                # Не отправляли reminder недавно
                (last_reminder_sub.c.last_reminder_at.is_(None)) | (last_reminder_sub.c.last_reminder_at < reminder_cutoff),
            )
            .order_by(BonusAccount.balance.desc())
            .limit(MAX_PER_RUN)
        )

        result = await db.execute(query)
        rows = result.all()

        if not rows:
            print("  ℹ️ Balance reminder: нет клиентов для напоминания")
            return

        print(f"  📨 Balance reminder: {len(rows)} клиентов")

        from app.services.whatsapp import send_tracked_whatsapp

        sent = 0
        for row in rows:
            customer = row[0]
            balance = row[1]

            msg = (
                template
                .replace("{name}", customer.full_name or "")
                .replace("{balance}", str(int(balance)))
                .replace("{link}", "https://cabinet.smartcentr.store")
            )

            try:
                await send_tracked_whatsapp(
                    db=db,
                    customer_id=customer.id,
                    phone=customer.phone,
                    message=msg,
                    event_type="balance_reminder",
                    instance_id=instance_id,
                    api_token=api_token,
                )
                sent += 1
            except Exception as e:
                print(f"  ❌ Reminder failed for {customer.phone}: {e}")

        await db.commit()
        print(f"  ✅ Balance reminder: {sent}/{len(rows)} отправлено")
