"""
Sbonus+ — WhatsApp уведомления через Green API.
С трекингом доставки и механизмом retry.
"""

import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, NotificationChannel, NotificationStatus

logger = logging.getLogger(__name__)


def format_phone(phone: str) -> str:
    """Форматирование номера для Green API: +996557100505 -> 996557100505@c.us"""
    clean = phone.replace("+", "").replace(" ", "").replace("-", "")
    return f"{clean}@c.us"


async def send_whatsapp_message(
    phone: str,
    message: str,
    instance_id: str,
    api_token: str,
) -> bool:
    """
    Отправить сообщение через Green API (fire-and-forget, без трекинга).
    Используется для обратной совместимости.
    """
    try:
        chat_id = format_phone(phone)
        instance_id = instance_id.strip()
        api_token = api_token.strip()

        url = f"https://api.green-api.com/waInstance{instance_id}/sendMessage/{api_token}"
        payload = {"chatId": chat_id, "message": message}

        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=10.0)

            if response.status_code == 200:
                logger.info("WhatsApp sent to %s", phone)
                return True
            else:
                logger.error("WhatsApp failed %s: %s %s", phone, response.status_code, response.text)
                return False
    except Exception as e:
        logger.error("WhatsApp error %s: %s", phone, e)
        return False


async def send_whatsapp_button_message(
    phone: str,
    message: str,
    button_text: str,
    button_url: str,
    instance_id: str,
    api_token: str,
) -> tuple[bool, str]:
    """Отправить WhatsApp-сообщение с URL-кнопкой через Green API."""
    try:
        chat_id = format_phone(phone)
        url = f"https://api.green-api.com/waInstance{instance_id.strip()}/sendInteractiveButtons/{api_token.strip()}"
        payload = {
            "chatId": chat_id,
            "body": message,
            "buttons": [
                {
                    "type": "url",
                    "buttonId": "open",
                    "buttonText": button_text,
                    "url": button_url,
                }
            ],
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=10.0)

        if response.status_code == 200:
            data = response.json()
            logger.info("WhatsApp button sent to %s", phone)
            return True, data.get("idMessage", "")

        error = f"HTTP {response.status_code}: {response.text[:500]}"
        logger.error("WhatsApp button failed %s: %s", phone, error)
        return False, error
    except Exception as e:
        logger.error("WhatsApp button error %s: %s", phone, e)
        return False, str(e)[:500]


async def send_tracked_whatsapp(
    db: AsyncSession,
    customer_id,
    phone: str,
    message: str,
    event_type: str,
    instance_id: str,
    api_token: str,
    button_url: str | None = None,
    button_text: str = "\u041b\u0438\u0447\u043d\u044b\u0439 \u043a\u0430\u0431\u0438\u043d\u0435\u0442",
) -> Notification:
    """
    Отправить WhatsApp с трекингом в БД.
    Создаёт запись Notification, отправляет, обновляет статус.
    """
    # Создаём запись
    notification = Notification(
        customer_id=customer_id,
        channel=NotificationChannel.WHATSAPP.value,
        status=NotificationStatus.PENDING.value,
        message=message,
        phone=phone,
        event_type=event_type,
    )
    db.add(notification)
    await db.flush()

    # Отправляем
    try:
        if button_url:
            ok, external_id_or_error = await send_whatsapp_button_message(
                phone=phone,
                message=message,
                button_text=button_text,
                button_url=button_url,
                instance_id=instance_id,
                api_token=api_token,
            )
            if not ok:
                fallback_message = f"{message.rstrip()}\n\n{button_text}: {button_url}"
                ok = await send_whatsapp_message(phone, fallback_message, instance_id, api_token)
                if ok:
                    external_id_or_error = ""

            if ok:
                notification.status = NotificationStatus.SENT.value
                notification.sent_at = datetime.now(timezone.utc)
                notification.external_id = external_id_or_error or ""
                logger.info("WhatsApp tracked button sent to %s [%s]", phone, event_type)
            else:
                notification.status = NotificationStatus.FAILED.value
                notification.error = external_id_or_error
                notification.retry_count += 1
                logger.error("WhatsApp tracked button failed %s: %s", phone, notification.error)
        else:
            chat_id = format_phone(phone)
            url = f"https://api.green-api.com/waInstance{instance_id.strip()}/sendMessage/{api_token.strip()}"
            payload = {"chatId": chat_id, "message": message}

            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, timeout=10.0)

                if response.status_code == 200:
                    data = response.json()
                    notification.status = NotificationStatus.SENT.value
                    notification.sent_at = datetime.now(timezone.utc)
                    notification.external_id = data.get("idMessage", "")
                    logger.info("WhatsApp tracked sent to %s [%s]", phone, event_type)
                else:
                    notification.status = NotificationStatus.FAILED.value
                    notification.error = f"HTTP {response.status_code}: {response.text[:500]}"
                    notification.retry_count += 1
                    logger.error("WhatsApp tracked failed %s: %s", phone, notification.error)

    except Exception as e:
        notification.status = NotificationStatus.FAILED.value
        notification.error = str(e)[:500]
        notification.retry_count += 1
        logger.error("WhatsApp tracked error %s: %s", phone, e)

    return notification


async def retry_failed_notification(
    db: AsyncSession,
    notification: Notification,
    instance_id: str,
    api_token: str,
) -> bool:
    """Повторная попытка отправки failed уведомления."""
    if notification.retry_count >= notification.max_retries:
        logger.warning("Max retries reached for notification %s", notification.id)
        return False

    try:
        chat_id = format_phone(notification.phone)
        url = f"https://api.green-api.com/waInstance{instance_id.strip()}/sendMessage/{api_token.strip()}"
        payload = {"chatId": chat_id, "message": notification.message}

        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=10.0)

            notification.retry_count += 1

            if response.status_code == 200:
                data = response.json()
                notification.status = NotificationStatus.SENT.value
                notification.sent_at = datetime.now(timezone.utc)
                notification.external_id = data.get("idMessage", "")
                logger.info("WhatsApp retry OK for %s (attempt %d)", notification.phone, notification.retry_count)
                return True
            else:
                notification.error = f"HTTP {response.status_code}: {response.text[:500]}"
                logger.error("WhatsApp retry failed %s (attempt %d): %s", notification.phone, notification.retry_count, notification.error)
                return False

    except Exception as e:
        notification.retry_count += 1
        notification.error = str(e)[:500]
        logger.error("WhatsApp retry error %s: %s", notification.phone, e)
        return False
