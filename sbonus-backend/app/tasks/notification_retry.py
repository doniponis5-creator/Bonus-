"""
Sbonus+ — Cron задача: повтор неотправленных уведомлений.
Запускается каждые 15 минут.
Находит FAILED уведомления с retry_count < max_retries и повторяет.
"""

from sqlalchemy import select

from app.core.database import async_session
from app.models import Notification, NotificationStatus, Setting
from app.services.whatsapp import retry_failed_notification


async def retry_failed_notifications() -> None:
    """Повторная отправка failed WhatsApp уведомлений."""
    async with async_session() as db:
        # Получаем настройки WhatsApp
        result = await db.execute(
            select(Setting).where(Setting.key.in_([
                "ENABLE_WHATSAPP_NOTIFICATIONS",
                "GREENAPI_INSTANCE_ID",
                "GREENAPI_API_TOKEN",
            ]))
        )
        settings_map = {s.key: s.value for s in result.scalars().all()}

        if settings_map.get("ENABLE_WHATSAPP_NOTIFICATIONS") != "true":
            return

        instance_id = settings_map.get("GREENAPI_INSTANCE_ID")
        api_token = settings_map.get("GREENAPI_API_TOKEN")
        if not instance_id or not api_token:
            return

        # Находим FAILED уведомления, которые можно повторить
        result = await db.execute(
            select(Notification).where(
                Notification.status == NotificationStatus.FAILED.value,
                Notification.retry_count < Notification.max_retries,
            ).order_by(Notification.created_at.asc()).limit(50)
        )
        failed = result.scalars().all()

        if not failed:
            return

        success_count = 0
        for notification in failed:
            ok = await retry_failed_notification(db, notification, instance_id, api_token)
            if ok:
                success_count += 1

        await db.commit()
        print(f"  📨 Retry: {success_count}/{len(failed)} уведомлений успешно повторено")
