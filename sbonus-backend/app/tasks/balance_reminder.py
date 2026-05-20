"""
Sbonus+ — Smart Comeback Reminder.
Запускается каждый день в 12:00 (Asia/Bishkek).

Логика:
1. Клиент совершил покупку → 14 дней не вернулся → 1-е напоминание
2. Ещё 14 дней не вернулся → 2-е напоминание
3. После 2-х напоминаний — больше не беспокоим
4. Клиент вернулся и купил → счётчик сброшен, цикл начинается заново

Ограничения:
- Максимум 50 уведомлений за запуск
- Минимум 14 дней между напоминаниями
- Максимум 2 напоминания за "цикл сна" (до следующей покупки)
- 3 секунды задержка между сообщениями (защита от блокировки WhatsApp)
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func as sa_func, and_, case, literal

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

# Defaults
INACTIVE_DAYS = 14        # Дней без покупок для напоминания
REMINDER_INTERVAL = 14    # Минимум дней между напоминаниями
MAX_REMINDERS = 2         # Макс напоминаний за цикл сна
MAX_PER_RUN = 50          # Лимит за один запуск
EVENT_TYPE = "comeback_reminder"


async def send_balance_reminders() -> None:
    """
    Smart Comeback Reminder:
    Отправляет WhatsApp напоминание клиентам, которые давно не покупали.
    Максимум 2 напоминания за цикл. Если клиент вернулся — цикл сброшен.
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
                "WA_MESSAGE_INTERVAL",
                "COMEBACK_MAX_REMINDERS",
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
        max_reminders = int(s.get("COMEBACK_MAX_REMINDERS", MAX_REMINDERS))
        wa_interval = float(s.get("WA_MESSAGE_INTERVAL", "3"))

        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=inactive_days)
        reminder_cooldown = now - timedelta(days=REMINDER_INTERVAL)

        # ── Subquery: последняя покупка (EARN или SPEND) каждого клиента ──
        last_purchase = (
            select(
                Transaction.customer_id,
                sa_func.max(Transaction.created_at).label("last_purchase_at"),
            )
            .where(Transaction.type.in_(["EARN", "SPEND"]))
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

        # ── Subquery: кол-во напоминаний ПОСЛЕ последней покупки ──
        # Это ключ: если клиент вернулся и купил, старые напоминания не считаются
        reminder_count = (
            select(
                Notification.customer_id,
                sa_func.count(Notification.id).label("cnt"),
            )
            .where(Notification.event_type == EVENT_TYPE)
            .join(
                last_purchase,
                last_purchase.c.customer_id == Notification.customer_id,
            )
            .where(Notification.created_at > last_purchase.c.last_purchase_at)
            .group_by(Notification.customer_id)
            .subquery("reminder_count")
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
            .outerjoin(reminder_count, reminder_count.c.customer_id == Customer.id)
            .where(
                # Активный клиент
                Customer.is_active == True,
                # Последняя покупка > N дней назад
                last_purchase.c.last_purchase_at < cutoff,
                # Не отправляли reminder в последние N дней (cooldown)
                (last_reminder.c.last_reminder_at.is_(None))
                | (last_reminder.c.last_reminder_at < reminder_cooldown),
                # Макс 2 напоминания за этот цикл сна
                (reminder_count.c.cnt.is_(None))
                | (reminder_count.c.cnt < max_reminders),
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
