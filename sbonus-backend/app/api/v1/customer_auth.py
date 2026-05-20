"""
Sbonus+ — Аутентификация клиента для личного кабинета (magic-link).

Поток:
  1. POST /customer-auth/request-link — клиент вводит телефон, мы отправляем magic-link в WhatsApp
  2. Клиент кликает на ссылку, фронт открывает /auth?token=xxx
  3. POST /customer-auth/verify — token → JWT (30 дней)
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.redis import check_rate_limit
from app.core.security import UserRole, create_customer_token, require_role
from app.models import Customer, CustomerAuthToken, Setting
from app.schemas import (
    CustomerMagicLinkRequest,
    CustomerMagicLinkVerifyRequest,
    CustomerTokenResponse,
    SuccessResponse,
)
from app.services.whatsapp import send_whatsapp_message
from app.utils import normalize_phone

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/customer-auth", tags=["Клиент: Авторизация"])



async def _get_whatsapp_credentials(db: AsyncSession) -> tuple[str | None, str | None, bool]:
    """Вернуть (instance_id, api_token, enabled) из Settings."""
    result = await db.execute(
        select(Setting).where(
            Setting.key.in_(["GREENAPI_INSTANCE_ID", "GREENAPI_API_TOKEN", "ENABLE_WHATSAPP_NOTIFICATIONS"])
        )
    )
    s = {row.key: row.value for row in result.scalars().all()}
    enabled = s.get("ENABLE_WHATSAPP_NOTIFICATIONS") == "true"
    return s.get("GREENAPI_INSTANCE_ID"), s.get("GREENAPI_API_TOKEN"), enabled


@router.post(
    "/request-link",
    response_model=SuccessResponse,
    status_code=status.HTTP_200_OK,
)
async def request_magic_link(
    body: CustomerMagicLinkRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse:
    """
    Отправить magic-link клиенту в WhatsApp.

    Для безопасности возвращает одинаковый ответ независимо от того,
    существует клиент с таким телефоном или нет (защита от phone enumeration).
    """
    phone = normalize_phone(body.phone)
    ip = request.client.host if request.client else "unknown"

    # Rate limit: 1 запрос в минуту с одного IP по одному телефону
    rate_key = f"magic_link:{ip}:{phone}"
    if not await check_rate_limit(rate_key, max_attempts=1, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "RATE_LIMIT_EXCEEDED",
                "message": "Слишком много запросов. Попробуйте через минуту.",
            },
        )

    # Ищем клиента
    result = await db.execute(select(Customer).where(Customer.phone == phone))
    customer = result.scalar_one_or_none()

    generic_response = SuccessResponse(
        message="Если номер зарегистрирован, мы отправили ссылку в WhatsApp"
    )

    if not customer or not customer.is_active:
        # Не раскрываем существование номера
        logger.info(f"Magic link requested for unknown/inactive phone: {phone}")
        return generic_response

    # Создаём одноразовый токен
    token_value = secrets.token_urlsafe(32)[:64]
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.customer_magic_link_expire_minutes
    )

    db.add(
        CustomerAuthToken(
            customer_id=customer.id,
            token=token_value,
            expires_at=expires_at,
            ip_address=ip,
        )
    )
    await db.commit()

    # Формируем ссылку
    cabinet_url = settings.customer_cabinet_base_url.rstrip("/")
    link = f"{cabinet_url}/auth?token={token_value}"

    # Отправляем через WhatsApp
    instance_id, api_token, enabled = await _get_whatsapp_credentials(db)
    if not enabled or not instance_id or not api_token:
        logger.warning(
            f"WhatsApp not configured — magic link for {phone} not sent"
        )
        # В dev режиме это нормально — токен сохранён, можно протестировать вручную
        return generic_response

    message = (
        f"🔐 *{settings.shop_bonus_name}* — вход в личный кабинет\n\n"
        f"Здравствуйте, {customer.full_name}!\n"
        f"Перейдите по ссылке, чтобы войти в свой кабинет:\n\n"
        f"{link}\n\n"
        f"⏱ Ссылка действительна {settings.customer_magic_link_expire_minutes} минут.\n"
        f"Если это были не вы — просто проигнорируйте сообщение."
    )

    success = await send_whatsapp_message(
        phone=phone,
        message=message,
        instance_id=instance_id,
        api_token=api_token,
    )
    if not success:
        logger.error(f"Failed to send magic link to {phone}")

    return generic_response


@router.post(
    "/send-link-by-cashier/{customer_id}",
    response_model=SuccessResponse,
    dependencies=[Depends(require_role(UserRole.CASHIER, UserRole.BRANCH_ADMIN, UserRole.SUPER_ADMIN))],
)
async def send_link_by_cashier(
    customer_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse:
    """
    Кассир отправляет magic-link клиенту, у которого нет аккаунта в WhatsApp,
    либо не получается войти самостоятельно.

    Использует тот же механизм magic-link, но не имеет защиты от phone enumeration
    (кассир уже знает клиента).
    """
    ip = request.client.host if request.client else "unknown"

    # Rate limit: 10 links per hour per IP (prevent WhatsApp spam)
    if not await check_rate_limit(f"cashier_link:{ip}", max_attempts=10, window_seconds=3600):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "RATE_LIMIT", "message": "Слишком много ссылок. Подождите."},
        )

    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer or not customer.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CUSTOMER_NOT_FOUND", "message": "Клиент не найден"},
        )

    # Создаём токен
    token_value = secrets.token_urlsafe(32)[:64]
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.customer_magic_link_expire_minutes
    )

    db.add(
        CustomerAuthToken(
            customer_id=customer.id,
            token=token_value,
            expires_at=expires_at,
            ip_address=ip,
        )
    )
    await db.commit()

    cabinet_url = settings.customer_cabinet_base_url.rstrip("/")
    link = f"{cabinet_url}/auth?token={token_value}"

    instance_id, api_token, enabled = await _get_whatsapp_credentials(db)
    if not enabled or not instance_id or not api_token:
        logger.warning(f"WhatsApp not configured — link for {customer.phone} not sent")
        return SuccessResponse(message="Ссылка создана, но WhatsApp отключён. Включите WhatsApp в настройках.")

    message = (
        f"🔐 *{settings.shop_bonus_name}* — личный кабинет\n\n"
        f"Здравствуйте, {customer.full_name}!\n"
        f"Кассир отправил вам ссылку для входа в личный кабинет:\n\n"
        f"{link}\n\n"
        f"⏱ Ссылка действительна {settings.customer_magic_link_expire_minutes} минут."
    )

    success = await send_whatsapp_message(
        phone=customer.phone,
        message=message,
        instance_id=instance_id,
        api_token=api_token,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "WHATSAPP_FAILED", "message": "Не удалось отправить ссылку через WhatsApp"},
        )

    return SuccessResponse(message=f"Ссылка отправлена в WhatsApp на {customer.phone}")


@router.post(
    "/verify",
    response_model=CustomerTokenResponse,
)
async def verify_magic_link(
    body: CustomerMagicLinkVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> CustomerTokenResponse:
    """
    Верифицировать magic-link токен и выдать JWT для кабинета.

    Токен одноразовый — после использования помечается used_at.
    """
    ip = request.client.host if request.client else "unknown"

    # Rate limit на верификацию: 10 попыток в минуту с IP
    if not await check_rate_limit(f"verify:{ip}", max_attempts=10, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": "Слишком много попыток"},
        )

    result = await db.execute(
        select(CustomerAuthToken).where(CustomerAuthToken.token == body.token)
    )
    auth_token = result.scalar_one_or_none()

    if not auth_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Недействительная ссылка"},
        )

    now = datetime.now(timezone.utc)
    if auth_token.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_ALREADY_USED", "message": "Ссылка уже была использована"},
        )

    if auth_token.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_EXPIRED", "message": "Срок действия ссылки истёк"},
        )

    # Проверяем клиента
    result = await db.execute(select(Customer).where(Customer.id == auth_token.customer_id))
    customer = result.scalar_one_or_none()
    if not customer or not customer.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "CUSTOMER_NOT_FOUND", "message": "Клиент не найден"},
        )

    # Помечаем токен использованным
    auth_token.used_at = now
    await db.commit()

    # Выдаём JWT
    days = settings.customer_token_expire_days
    jwt_token = create_customer_token(str(customer.id), days=days)

    # Set httpOnly cookie (secure token storage, not accessible via JS)
    response.set_cookie(
        key="customer_token",
        value=jwt_token,
        max_age=days * 24 * 3600,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/",
    )

    return CustomerTokenResponse(
        access_token=jwt_token,
        expires_in=days * 24 * 3600,
        customer_id=str(customer.id),
    )
