"""
Sbonus+ — Push Notification API.
Klient tomondan FCM device token ro'yxatdan o'tkazish.

POST /api/v1/push/register-token  — Token saqlash
DELETE /api/v1/push/unregister     — Token o'chirish
GET  /api/v1/push/test             — Test push (admin only)
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_customer, get_current_user, UserRole, require_role
from app.models import Setting
from app.services.push_notification import PushNotificationService, PushEvent

router = APIRouter(prefix="/push", tags=["Push Notifications"])


# ─── Schemas ───

class RegisterTokenRequest(BaseModel):
    """FCM device token ro'yxatdan o'tkazish."""
    token: str = Field(..., min_length=10, max_length=500, description="FCM device token")
    platform: str = Field("android", pattern="^(android|ios|web)$", description="Platform: android/ios/web")


class TestPushRequest(BaseModel):
    """Test push yuborish (admin uchun)."""
    customer_id: uuid.UUID
    title: str = "Test Notification"
    body: str = "Bu test push notification"


# ─── Endpoints ───

@router.post("/register-token", status_code=status.HTTP_200_OK)
async def register_fcm_token(
    body: RegisterTokenRequest,
    db: AsyncSession = Depends(get_db),
    current_customer: dict = Depends(get_current_customer),
) -> dict:
    """
    Klient FCM device tokenni ro'yxatdan o'tkazadi.
    Har safar ilovaga kirganda chaqiriladi.
    Eski token yangilanadi (upsert).
    """
    customer_id = current_customer["sub"]
    token_key = f"FCM_TOKEN_{customer_id}"
    platform_key = f"FCM_PLATFORM_{customer_id}"

    # Upsert: token mavjud bo'lsa yangilash, yo'q bo'lsa yaratish
    result = await db.execute(
        select(Setting).where(Setting.key == token_key)
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.value = body.token
    else:
        db.add(Setting(key=token_key, value=body.token))

    # Platform saqlash
    result2 = await db.execute(
        select(Setting).where(Setting.key == platform_key)
    )
    existing2 = result2.scalar_one_or_none()

    if existing2:
        existing2.value = body.platform
    else:
        db.add(Setting(key=platform_key, value=body.platform))

    await db.commit()

    return {
        "status": "ok",
        "message": "FCM token ro'yxatdan o'tkazildi",
    }


@router.delete("/unregister", status_code=status.HTTP_200_OK)
async def unregister_fcm_token(
    db: AsyncSession = Depends(get_db),
    current_customer: dict = Depends(get_current_customer),
) -> dict:
    """
    Klient FCM tokenni o'chirish (logout da).
    """
    customer_id = current_customer["sub"]
    token_key = f"FCM_TOKEN_{customer_id}"
    platform_key = f"FCM_PLATFORM_{customer_id}"

    result = await db.execute(
        select(Setting).where(Setting.key.in_([token_key, platform_key]))
    )
    records = result.scalars().all()
    for record in records:
        await db.delete(record)

    await db.commit()

    return {"status": "ok", "message": "FCM token o'chirildi"}


@router.post(
    "/test",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
    status_code=status.HTTP_200_OK,
)
async def send_test_push(
    body: TestPushRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Admin: test push notification yuborish.
    Faqat SUPER_ADMIN.
    """
    svc = PushNotificationService(db)
    success = await svc.send_to_customer(
        customer_id=str(body.customer_id),
        event=PushEvent.WELCOME,
        title=body.title,
        body=body.body,
        data={"test": "true"},
    )

    if success:
        return {"status": "ok", "message": "Test push yuborildi"}
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "PUSH_FAILED",
                "message": "Push yuborib bo'lmadi. FCM konfiguratsiya yoki klient tokenni tekshiring.",
            },
        )
