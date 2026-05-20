"""
Sbonus+ — API маршруты аутентификации.
POST /api/v1/auth/cashier/login
POST /api/v1/auth/admin/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import blacklist_token, check_rate_limit
from app.core.security import (
    UserRole,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
)
from pydantic import BaseModel, Field
from app.models import Branch, User
from app.schemas import (
    AdminLoginRequest,
    CashierLoginRequest,
    RefreshRequest,
    SuccessResponse,
    TokenResponse,
)

router = APIRouter(prefix="/auth", tags=["Аутентификация"])


@router.post("/cashier/login", response_model=TokenResponse)
async def cashier_login(
    body: CashierLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Вход кассира по телефону + PIN."""
    client_ip = request.client.host if request.client else "unknown"

    # Rate limiting: 5 попыток / 15 минут
    if not await check_rate_limit(f"login:{client_ip}", 5, 900):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "AUTH_RATE_LIMITED", "message": "Превышен лимит попыток. Подождите 15 минут."},
        )

    result = await db.execute(
        select(User).where(User.phone == body.phone, User.is_active == True)
    )
    user = result.scalar_one_or_none()

    if not user or not user.pin_hash or not verify_password(body.pin, user.pin_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_INVALID_CREDENTIALS", "message": "Неверный телефон или PIN"},
        )

    if user.role not in (UserRole.CASHIER.value, "cashier"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "AUTH_INSUFFICIENT_ROLE", "message": "Этот вход только для кассиров"},
        )

    # Branch name
    branch_name = None
    if user.branch_id:
        branch_result = await db.execute(select(Branch).where(Branch.id == user.branch_id))
        branch = branch_result.scalar_one_or_none()
        if branch:
            branch_name = branch.name

    access = create_access_token(str(user.id), UserRole(user.role.value), str(user.branch_id) if user.branch_id else None)
    refresh = create_refresh_token(str(user.id))

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=900,
        user_id=str(user.id),
        role=user.role.value,
        branch_id=str(user.branch_id) if user.branch_id else None,
        branch_name=branch_name,
    )


@router.post("/admin/login", response_model=TokenResponse)
async def admin_login(
    body: AdminLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Вход админа по email + пароль."""
    client_ip = request.client.host if request.client else "unknown"

    if not await check_rate_limit(f"login:{client_ip}", 5, 900):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "AUTH_RATE_LIMITED", "message": "Превышен лимит попыток. Подождите 15 минут."},
        )

    result = await db.execute(
        select(User).where(User.email == body.email, User.is_active == True)
    )
    user = result.scalar_one_or_none()

    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_INVALID_CREDENTIALS", "message": "Неверный email или пароль"},
        )

    access = create_access_token(str(user.id), UserRole(user.role.value), str(user.branch_id) if user.branch_id else None)
    refresh = create_refresh_token(str(user.id))

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=900,
        user_id=str(user.id),
        role=user.role.value,
        branch_id=str(user.branch_id) if user.branch_id else None,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Обновление access токена через refresh токен с ротацией."""
    # Rate limit: 5 refresh per minute per IP
    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(f"auth:refresh:{client_ip}", max_attempts=5, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "RATE_LIMIT", "message": "Слишком много попыток. Подождите минуту."},
        )

    payload = decode_token(body.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_INVALID_TOKEN_TYPE", "message": "Требуется refresh токен"},
        )

    # Check blacklist BEFORE issuing new tokens (prevent reuse)
    old_jti = payload.get("jti")
    if old_jti:
        from app.core.redis import is_token_blacklisted
        if await is_token_blacklisted(old_jti):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"code": "AUTH_TOKEN_REVOKED", "message": "Refresh токен уже использован"},
            )
        await blacklist_token(old_jti, 30 * 24 * 3600)

    user_id = payload["sub"]
    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "AUTH_USER_NOT_FOUND"})

    access = create_access_token(str(user.id), UserRole(user.role.value), str(user.branch_id) if user.branch_id else None)
    refresh = create_refresh_token(str(user.id))

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=900,
        user_id=str(user.id),
        role=user.role.value,
        branch_id=str(user.branch_id) if user.branch_id else None,
    )


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Смена пароля текущим пользователем."""
    # Rate limit: 5 attempts per 15 min
    client_ip = request.client.host if request.client else "unknown"
    if not await check_rate_limit(f"change_pwd:{current_user['sub']}", 5, 900):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "RATE_LIMIT", "message": "Слишком много попыток. Подождите 15 минут."},
        )

    result = await db.execute(
        select(User).where(User.id == current_user["sub"], User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND"})

    # Verify current password
    if not user.password_hash or not verify_password(body.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "WRONG_PASSWORD", "message": "Текущий пароль неверен"},
        )

    # Prevent same password
    if verify_password(body.new_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "SAME_PASSWORD", "message": "Новый пароль совпадает с текущим"},
        )

    user.password_hash = hash_password(body.new_password)
    await db.commit()

    return {"status": "ok", "message": "Пароль успешно изменён"}


@router.post("/logout", response_model=SuccessResponse)
async def logout(current_user: dict = Depends(get_current_user)) -> SuccessResponse:
    """Выход — добавление токена в чёрный список Redis."""
    jti = current_user.get("jti")
    if jti:
        await blacklist_token(jti, 15 * 60)
    return SuccessResponse(message="Успешный выход из системы")
