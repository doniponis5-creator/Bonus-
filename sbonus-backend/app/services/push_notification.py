"""
Sbonus+ — Firebase Cloud Messaging (FCM) Push Notification Service.

Klientlarga real-time bildirishnomalar yuborish:
  - Bonus olindi / sarflandi
  - Koleso yutug'i
  - Yangi promo / kampaniya
  - Bonus muddati tugashi ogohlantirishlari
  - Referral bonus

Arxitektura:
  - FCM HTTP v1 API (google-auth orqali)
  - Device token saqlash (Setting jadvalida per-customer)
  - Batch sending (kampaniyalar uchun)
  - Retry logic (3 marta urinish)
  - fire-and-forget pattern (async task)
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional
from enum import Enum

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, Setting

logger = logging.getLogger("sbonus.push")


class PushEvent(str, Enum):
    """Push notification event turlari."""
    BONUS_EARNED = "bonus_earned"
    BONUS_SPENT = "bonus_spent"
    WHEEL_WIN = "wheel_win"
    WHEEL_PHYSICAL = "wheel_physical"
    REFERRAL_BONUS = "referral_bonus"
    PROMO_APPLIED = "promo_applied"
    CAMPAIGN_BONUS = "campaign_bonus"
    BONUS_EXPIRING = "bonus_expiring"
    BONUS_EXPIRED = "bonus_expired"
    WELCOME = "welcome"


# ═══════════════════════════════════════════
# FCM SERVICE
# ═══════════════════════════════════════════

class PushNotificationService:
    """Firebase Cloud Messaging service."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._credentials = None

    async def _get_fcm_config(self) -> dict:
        """FCM konfiguratsiyasini DB Settings dan olish."""
        keys = [
            "FCM_PROJECT_ID",
            "FCM_SERVICE_ACCOUNT_JSON",
            "ENABLE_PUSH_NOTIFICATIONS",
        ]
        result = await self.db.execute(
            select(Setting).where(Setting.key.in_(keys))
        )
        return {s.key: s.value for s in result.scalars().all()}

    async def _get_access_token(self, service_account_json: str) -> Optional[str]:
        """
        Google OAuth2 access token olish FCM uchun.
        google-auth kutubxonasi orqali.
        """
        try:
            from google.oauth2 import service_account
            from google.auth.transport.requests import Request as GoogleRequest

            info = json.loads(service_account_json)
            credentials = service_account.Credentials.from_service_account_info(
                info,
                scopes=["https://www.googleapis.com/auth/firebase.messaging"],
            )
            credentials.refresh(GoogleRequest())
            return credentials.token
        except ImportError:
            logger.error("google-auth package not installed. Run: pip install google-auth")
            return None
        except Exception as e:
            logger.error("FCM auth error: %s", e)
            return None

    async def send_to_customer(
        self,
        customer_id: str,
        event: PushEvent,
        title: str,
        body: str,
        data: Optional[dict] = None,
    ) -> bool:
        """
        Bitta klientga push notification yuborish.

        Args:
            customer_id: Klient UUID
            event: Notification turi
            title: Notification sarlavhasi
            body: Notification matni
            data: Qo'shimcha ma'lumotlar (app da ishlatish uchun)

        Returns:
            True agar muvaffaqiyatli yuborilgan bo'lsa
        """
        config = await self._get_fcm_config()

        if config.get("ENABLE_PUSH_NOTIFICATIONS") != "true":
            return False

        project_id = config.get("FCM_PROJECT_ID")
        sa_json = config.get("FCM_SERVICE_ACCOUNT_JSON")

        if not project_id or not sa_json:
            logger.warning("FCM not configured: missing PROJECT_ID or SERVICE_ACCOUNT")
            return False

        # Klient device token'ini olish
        token_key = f"FCM_TOKEN_{customer_id}"
        result = await self.db.execute(
            select(Setting).where(Setting.key == token_key)
        )
        token_record = result.scalar_one_or_none()
        if not token_record or not token_record.value:
            logger.debug("No FCM token for customer %s", customer_id)
            return False

        device_token = token_record.value

        # Access token olish
        access_token = await self._get_access_token(sa_json)
        if not access_token:
            return False

        # FCM HTTP v1 API ga yuborish
        url = f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send"

        message_data = data or {}
        message_data["event"] = event.value
        message_data["timestamp"] = datetime.now(timezone.utc).isoformat()

        payload = {
            "message": {
                "token": device_token,
                "notification": {
                    "title": title,
                    "body": body,
                },
                "data": {k: str(v) for k, v in message_data.items()},
                "android": {
                    "priority": "high",
                    "notification": {
                        "channel_id": "sbonus_main",
                        "sound": "default",
                    },
                },
                "apns": {
                    "payload": {
                        "aps": {
                            "sound": "default",
                            "badge": 1,
                        }
                    }
                },
            }
        }

        # Retry logic: 3 urinish
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    resp = await client.post(
                        url,
                        json=payload,
                        headers={
                            "Authorization": f"Bearer {access_token}",
                            "Content-Type": "application/json",
                        },
                    )

                if resp.status_code == 200:
                    logger.info(
                        "Push sent: customer=%s, event=%s",
                        customer_id, event.value,
                    )
                    return True

                # Token expired — o'chirish
                if resp.status_code == 404 or (
                    resp.status_code == 400
                    and "UNREGISTERED" in resp.text
                ):
                    logger.info(
                        "FCM token expired for customer %s, removing",
                        customer_id,
                    )
                    await self.db.delete(token_record)
                    await self.db.commit()
                    return False

                logger.warning(
                    "FCM send failed (attempt %d): status=%d, body=%s",
                    attempt + 1, resp.status_code, resp.text[:200],
                )

            except Exception as e:
                logger.warning(
                    "FCM send error (attempt %d): %s",
                    attempt + 1, str(e),
                )

        return False

    async def send_to_multiple(
        self,
        customer_ids: list[str],
        event: PushEvent,
        title: str,
        body: str,
        data: Optional[dict] = None,
    ) -> dict:
        """
        Bir nechta klientga push yuborish.

        Returns:
            {"sent": int, "failed": int, "skipped": int}
        """
        stats = {"sent": 0, "failed": 0, "skipped": 0}

        for cid in customer_ids:
            result = await self.send_to_customer(cid, event, title, body, data)
            if result:
                stats["sent"] += 1
            else:
                stats["failed"] += 1

        return stats


# ═══════════════════════════════════════════
# CONVENIENCE FUNCTIONS (fire-and-forget)
# ═══════════════════════════════════════════

async def notify_bonus_earned(
    db_factory,
    customer_id: str,
    amount: float,
    new_balance: float,
    purchase_amount: float,
):
    """Bonus olganini klientga push yuborish."""
    try:
        async with db_factory() as db:
            svc = PushNotificationService(db)
            await svc.send_to_customer(
                customer_id=customer_id,
                event=PushEvent.BONUS_EARNED,
                title="Bonus olindi! 🎉",
                body=f"+{amount:,.0f} KGS bonus oldiniz! Balansingiz: {new_balance:,.0f} KGS",
                data={
                    "amount": amount,
                    "balance": new_balance,
                    "purchase_amount": purchase_amount,
                },
            )
    except Exception as e:
        logger.error("Push notify_bonus_earned error: %s", e)


async def notify_bonus_spent(
    db_factory,
    customer_id: str,
    amount: float,
    new_balance: float,
):
    """Bonus sarflanganini klientga push yuborish."""
    try:
        async with db_factory() as db:
            svc = PushNotificationService(db)
            await svc.send_to_customer(
                customer_id=customer_id,
                event=PushEvent.BONUS_SPENT,
                title="Bonus sarflandi",
                body=f"-{amount:,.0f} KGS ishlatildi. Qoldiq: {new_balance:,.0f} KGS",
                data={"amount": amount, "balance": new_balance},
            )
    except Exception as e:
        logger.error("Push notify_bonus_spent error: %s", e)


async def notify_wheel_win(
    db_factory,
    customer_id: str,
    prize_label: str,
    prize_type: str,
    bonus_amount: float,
    new_balance: float,
):
    """Koleso yutug'ini klientga push yuborish."""
    try:
        async with db_factory() as db:
            svc = PushNotificationService(db)

            if prize_type == "physical":
                title = "Koleso Udachi — Sovg'a! 🎁"
                body = f"Tabriklaymiz! Siz {prize_label} yutdingiz! Kassirga murojaat qiling."
                event = PushEvent.WHEEL_PHYSICAL
            elif bonus_amount > 0:
                title = "Koleso Udachi — Yutdingiz! 🎰"
                body = f"+{bonus_amount:,.0f} KGS yutdingiz! Balans: {new_balance:,.0f} KGS"
                event = PushEvent.WHEEL_WIN
            else:
                return  # Bo'sh spinni bildirmaymiz

            await svc.send_to_customer(
                customer_id=customer_id,
                event=event,
                title=title,
                body=body,
                data={
                    "prize_label": prize_label,
                    "prize_type": prize_type,
                    "amount": bonus_amount,
                    "balance": new_balance,
                },
            )
    except Exception as e:
        logger.error("Push notify_wheel_win error: %s", e)


async def notify_referral_bonus(
    db_factory,
    customer_id: str,
    amount: float,
    referred_name: str,
):
    """Referral bonus olganini klientga push yuborish."""
    try:
        async with db_factory() as db:
            svc = PushNotificationService(db)
            await svc.send_to_customer(
                customer_id=customer_id,
                event=PushEvent.REFERRAL_BONUS,
                title="Referral bonus! 👥",
                body=f"{referred_name} sizning taklif kodingiz bilan ro'yxatdan o'tdi. +{amount:,.0f} KGS!",
                data={"amount": amount, "referred_name": referred_name},
            )
    except Exception as e:
        logger.error("Push notify_referral_bonus error: %s", e)


async def notify_bonus_expiring(
    db_factory,
    customer_id: str,
    days_left: int,
    expiring_amount: float,
):
    """Bonus muddati tugashidan ogohlantirish."""
    try:
        async with db_factory() as db:
            svc = PushNotificationService(db)
            await svc.send_to_customer(
                customer_id=customer_id,
                event=PushEvent.BONUS_EXPIRING,
                title="Bonusingiz tugamoqda! ⏰",
                body=f"{expiring_amount:,.0f} KGS bonusingiz {days_left} kundan keyin o'chadi. Ishlatib qo'ying!",
                data={
                    "days_left": days_left,
                    "expiring_amount": expiring_amount,
                },
            )
    except Exception as e:
        logger.error("Push notify_bonus_expiring error: %s", e)
