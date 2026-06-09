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
from decimal import Decimal
from app.models import Customer, CustomerAuthToken, Setting, Transaction, TransactionType, BonusAccount
from pydantic import BaseModel
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


class SelfRegisterRequest(BaseModel):
    """Запрос на самостоятельную регистрацию клиента через реферальную ссылку."""
    phone: str
    full_name: str
    referral_code: str | None = None


@router.post("/self-register", status_code=status.HTTP_201_CREATED)
async def self_register(
    body: SelfRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> SuccessResponse:
    """
    Самостоятельная регистрация клиента (без авторизации).
    
    Поток:
    1. Клиент переходит по реферальной ссылке → /register?ref=REF-XXXXX
    2. Вводит телефон и имя
    3. Система создаёт клиента + начисляет реферальный бонус
    4. Отправляет magic-link в WhatsApp для входа в кабинет
    """
    from app.models import Tier

    phone = normalize_phone(body.phone)
    if not phone or len(phone) < 12 or not phone.startswith("+996"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_PHONE", "message": "Укажите корректный номер +996XXXXXXXXX"},
        )
    ip = request.client.host if request.client else "unknown"

    # Rate limit: 3 регистрации в час с одного IP
    if not await check_rate_limit(f"self_register:{ip}", max_attempts=3, window_seconds=3600):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "RATE_LIMIT", "message": "Слишком много попыток регистрации. Подождите."},
        )

    # Проверка: телефон уже зарегистрирован?
    existing = await db.execute(select(Customer).where(Customer.phone == phone))
    if existing.scalar_one_or_none():
        # Не раскрываем — просто отправляем magic-link для входа
        customer = (await db.execute(select(Customer).where(Customer.phone == phone))).scalar_one()
        if customer.is_active:
            await _send_magic_link(db, customer, ip)
        return SuccessResponse(
            message="Если номер зарегистрирован, мы отправили ссылку для входа в WhatsApp. Если вы новый клиент — проверьте WhatsApp для подтверждения."
        )

    # Валидация имени
    full_name = body.full_name.strip()
    if len(full_name) < 2 or len(full_name) > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_NAME", "message": "Укажите корректное имя (от 2 до 100 символов)"},
        )

    # Дефолтный tier (Bronze)
    import uuid as _uuid
    tier_result = await db.execute(select(Tier).order_by(Tier.sort_order.asc()).limit(1))
    default_tier = tier_result.scalar_one_or_none()

    referral_code_value = body.referral_code.strip().upper() if body.referral_code else None

    # Создаём клиента (referred_by=None — apply_referral sets it)
    customer = Customer(
        phone=phone,
        full_name=full_name,
        qr_code=f"SB-{_uuid.uuid4().hex[:10].upper()}",
        tier_id=default_tier.id if default_tier else None,
        referral_code=f"REF-{_uuid.uuid4().hex[:8].upper()}",
        referred_by=None,
    )
    db.add(customer)
    await db.flush()

    # Бонусный счёт
    account = BonusAccount(customer_id=customer.id)
    db.add(account)
    await db.flush()

    # ─── Welcome bonus (100 сом по умолчанию) ───
    welcome_amount = Decimal("0")
    try:
        wb_result = await db.execute(
            select(Setting).where(Setting.key == "WELCOME_BONUS_AMOUNT")
        )
        wb_setting = wb_result.scalar_one_or_none()
        welcome_amount = Decimal(wb_setting.value) if wb_setting else Decimal("100")

        if welcome_amount > 0:
            account.balance += welcome_amount
            account.total_earned += welcome_amount
            db.add(Transaction(
                customer_id=customer.id,
                type=TransactionType.PROMO,
                amount=welcome_amount,
                note="🎁 Приветственный бонус за регистрацию",
            ))
            await db.flush()
            logger.info(f"Welcome bonus {welcome_amount} KGS → {customer.phone}")
    except Exception as e:
        logger.warning(f"Welcome bonus failed for {customer.phone}: {e}")

    # Автоматический реферальный бонус
    if referral_code_value:
        try:
            from app.services.bonus import BonusService
            svc = BonusService(db)
            await svc.apply_referral(customer.id, referral_code_value)
        except Exception as e:
            logger.warning(f"Self-register referral bonus failed: {e}")

    # Отправляем magic-link для входа (flush inside)
    await _send_magic_link(db, customer, ip, welcome_bonus=welcome_amount if welcome_amount > 0 else None)
    await db.commit()  # single atomic commit

    return SuccessResponse(
        message="Регистрация успешна! Мы отправили ссылку для входа в WhatsApp."
    )


async def _send_magic_link(db: AsyncSession, customer: Customer, ip: str, welcome_bonus: Decimal | None = None):
    """Вспомогательная функция: создать magic-link и отправить в WhatsApp."""
    token_value = secrets.token_urlsafe(32)[:64]
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.customer_magic_link_expire_minutes
    )
    db.add(CustomerAuthToken(
        customer_id=customer.id,
        token=token_value,
        expires_at=expires_at,
        ip_address=ip,
    ))
    await db.flush()  # flush only — caller commits

    cabinet_url = settings.customer_cabinet_base_url.rstrip("/")
    link = f"{cabinet_url}/auth?token={token_value}"

    instance_id, api_token, enabled = await _get_whatsapp_credentials(db)
    if not enabled or not instance_id or not api_token:
        logger.warning(f"WhatsApp not configured — magic link for {customer.phone} not sent")
        return

    bonus_line = ""
    if welcome_bonus:
        bonus_line = f"\n🎁 Вам начислен приветственный бонус: *{welcome_bonus} сом*!\n"

    message = (
        f"🎉 *{settings.shop_bonus_name}* — добро пожаловать!\n\n"
        f"Здравствуйте, {customer.full_name}!\n"
        f"Вы успешно зарегистрированы в бонусной программе.\n"
        f"{bonus_line}\n"
        f"Войдите в личный кабинет по ссылке:\n"
        f"{link}\n\n"
        f"⏱ Ссылка действительна {settings.customer_magic_link_expire_minutes} минут."
    )
    await send_whatsapp_message(
        phone=customer.phone, message=message,
        instance_id=instance_id, api_token=api_token,
    )


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


# ═══════════════════════════════════════════════════════════════
# OTP — Одноразовый код для входа (вместо magic-link)
# ═══════════════════════════════════════════════════════════════

class OTPRequest(BaseModel):
    phone: str


class OTPVerifyRequest(BaseModel):
    phone: str
    code: str


@router.post("/send-otp", status_code=200)
async def send_otp(
    body: OTPRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Отправить 4-значный OTP код + magic-link клиенту в WhatsApp.

    Безопасность:
    - OTP генерируется через secrets (криптостойкий)
    - В Redis хранится HMAC-SHA256 хеш, НЕ открытый код
    - Rate limit: 3 попытки в 2 минуты
    - Код действует 5 минут
    - Generic response (без phone enumeration)
    """
    import hashlib
    import hmac
    from app.core.redis import redis_client

    phone = normalize_phone(body.phone.strip())

    # Rate limit: 3 попытки за 2 минуты
    ip = request.client.host if request.client else "unknown"
    rate_key = f"otp_send:{ip}:{phone}"
    allowed = await check_rate_limit(rate_key, max_attempts=3, window_seconds=120)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail={"code": "RATE_LIMIT_EXCEEDED", "message": "Слишком много запросов. Подождите 2 минуты."},
        )

    generic = {"success": True, "message": "Если номер зарегистрирован, код отправлен в WhatsApp"}

    # Проверить что клиент существует
    result = await db.execute(select(Customer).where(Customer.phone == phone))
    customer = result.scalar_one_or_none()
    if not customer or not customer.is_active:
        return generic

    # ── Генерация OTP (криптостойкий) ──
    code = f"{secrets.randbelow(9000) + 1000}"

    # HMAC хеш для Redis (не храним открытый код)
    otp_secret = (settings.webhook_1c_secret or "sbonus-otp-default").encode()
    code_hash = hmac.new(otp_secret, code.encode(), hashlib.sha256).hexdigest()

    otp_key = f"otp:{phone}"
    await redis_client.setex(otp_key, 300, code_hash)  # 5 минут, хеш

    # Сбросить счётчик попыток
    attempts_key = f"otp_attempts:{phone}"
    await redis_client.delete(attempts_key)

    # ── Magic-link (для быстрого входа) ──
    token_value = secrets.token_urlsafe(32)[:64]
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    db.add(CustomerAuthToken(
        customer_id=customer.id,
        token=token_value,
        expires_at=expires_at,
        ip_address=ip,
    ))
    await db.commit()

    cabinet_url = settings.customer_cabinet_base_url.rstrip("/")
    link = f"{cabinet_url}/auth?token={token_value}"

    # ── Отправить в WhatsApp: код + ссылка ──
    instance_id, api_token, wa_enabled = await _get_whatsapp_credentials(db)
    if wa_enabled and instance_id and api_token:
        try:
            message = (
                f"\U0001f512 *S Bonus — Вход в кабинет*\n\n"
                f"Ваш код: *{code}*\n\n"
                f"Или войдите по ссылке:\n{link}\n\n"
                f"\u23f1 Код и ссылка действуют 5 минут.\n"
                f"\u26a0\ufe0f Никому не сообщайте код!"
            )
            await send_whatsapp_message(
                phone=phone, message=message,
                instance_id=instance_id, api_token=api_token,
            )
            logger.info(f"OTP+link sent to ...{phone[-4:]}")
        except Exception as e:
            logger.error(f"OTP WhatsApp send error: {e}")
    else:
        logger.warning("WhatsApp disabled — OTP not sent")

    return generic


@router.post("/verify-otp", status_code=200)
async def verify_otp(
    body: OTPVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> CustomerTokenResponse:
    """
    Проверить OTP код и выдать JWT.

    Безопасность:
    - Constant-time HMAC сравнение (защита от timing attack)
    - Максимум 5 попыток, после — код аннулируется
    - Код удаляется после успешной верификации
    """
    import hashlib
    import hmac as hmac_mod
    from app.core.redis import redis_client

    phone = normalize_phone(body.phone.strip())
    code = body.code.strip()

    if len(code) != 4 or not code.isdigit():
        raise HTTPException(status_code=400, detail="Код должен быть 4 цифры")

    # Brute-force protection: макс 5 попыток
    attempts_key = f"otp_attempts:{phone}"
    attempts = await redis_client.incr(attempts_key)
    if attempts == 1:
        await redis_client.expire(attempts_key, 300)
    if attempts > 5:
        await redis_client.delete(f"otp:{phone}")
        await redis_client.delete(attempts_key)
        raise HTTPException(status_code=429, detail="Слишком много попыток. Запросите новый код.")

    # Получить хеш из Redis
    otp_key = f"otp:{phone}"
    stored_hash = await redis_client.get(otp_key)

    if not stored_hash:
        raise HTTPException(status_code=401, detail="Код истёк или не запрашивался. Запросите новый.")

    # Constant-time HMAC сравнение
    otp_secret = (settings.webhook_1c_secret or "sbonus-otp-default").encode()
    code_hash = hmac_mod.new(otp_secret, code.encode(), hashlib.sha256).hexdigest()

    if not hmac_mod.compare_digest(stored_hash, code_hash):
        remaining = 5 - attempts
        raise HTTPException(
            status_code=401,
            detail=f"Неверный код. Осталось попыток: {remaining}",
        )

    # Код верный — удалить из Redis
    await redis_client.delete(otp_key)
    await redis_client.delete(attempts_key)

    # Найти клиента
    result = await db.execute(select(Customer).where(Customer.phone == phone))
    customer = result.scalar_one_or_none()
    if not customer or not customer.is_active:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    # Выдать JWT
    days = settings.customer_token_expire_days
    jwt_token = create_customer_token(str(customer.id), days=days)

    # httpOnly cookie
    response.set_cookie(
        key="customer_token",
        value=jwt_token,
        max_age=days * 24 * 3600,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/",
    )

    logger.info(f"OTP login success: ...{phone[-4:]}")

    return CustomerTokenResponse(
        access_token=jwt_token,
        expires_in=days * 24 * 3600,
        customer_id=str(customer.id),
    )
