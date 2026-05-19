"""
Sbonus+ — JWT RS256 авторизация + RBAC + пароли.
"""

import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from functools import lru_cache
from pathlib import Path
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.redis import is_token_blacklisted

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()


class UserRole(str, Enum):
    """Роли пользователей системы."""
    SUPER_ADMIN = "super_admin"
    BRANCH_ADMIN = "branch_admin"
    CASHIER = "cashier"


# ─── Загрузка RSA ключей ───

def _load_key(path: str) -> str:
    """Загрузить RSA ключ из файла."""
    key_path = Path(path)
    if not key_path.exists():
        raise FileNotFoundError(f"RSA ключ не найден: {path}")
    return key_path.read_text()


@lru_cache
def get_private_key() -> str:
    """Получить приватный RSA ключ для подписи JWT."""
    return _load_key(settings.jwt_private_key_path)


@lru_cache
def get_public_key() -> str:
    """Получить публичный RSA ключ для верификации JWT."""
    return _load_key(settings.jwt_public_key_path)


# ─── Хеширование паролей / PIN ───

def hash_password(password: str) -> str:
    """Захешировать пароль/PIN через bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Проверить пароль/PIN против хеша."""
    return pwd_context.verify(plain, hashed)


# ─── JWT Токены ───

def create_access_token(
    user_id: str,
    role: UserRole,
    branch_id: Optional[str] = None,
) -> str:
    """
    Создать access JWT токен (RS256).
    
    Args:
        user_id: UUID пользователя
        role: роль (super_admin / branch_admin / cashier)
        branch_id: UUID филиала (для RBAC)
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role.value,
        "branch_id": branch_id,
        "type": "access",
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, get_private_key(), algorithm="RS256")


def create_refresh_token(user_id: str) -> str:
    """Создать refresh JWT токен (RS256) — 30 дней."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + timedelta(days=settings.refresh_token_expire_days),
    }
    return jwt.encode(payload, get_private_key(), algorithm="RS256")


def create_customer_token(customer_id: str, days: int = 30) -> str:
    """Создать JWT для клиентского личного кабинета (RS256, по умолчанию 30 дней)."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": customer_id,
        "role": "customer",
        "type": "access",
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + timedelta(days=days),
    }
    return jwt.encode(payload, get_private_key(), algorithm="RS256")


def decode_token(token: str) -> dict:
    """
    Декодировать и верифицировать JWT токен.
    
    Raises:
        HTTPException 401: если токен невалидный или просрочен
    """
    try:
        payload = jwt.decode(token, get_public_key(), algorithms=["RS256"])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_TOKEN_EXPIRED", "message": "Токен недействителен или просрочен"},
        )


# ─── FastAPI Dependencies ───

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """
    Dependency — извлечь текущего пользователя из JWT.
    Проверяет blacklist в Redis.
    """
    token = credentials.credentials
    payload = decode_token(token)

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_INVALID_TOKEN_TYPE", "message": "Требуется access токен"},
        )

    # Блокируем клиентские токены — они не могут использовать admin endpoints
    if payload.get("role") == "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "AUTH_CUSTOMER_NOT_ALLOWED", "message": "Клиентский токен не имеет доступа к админ-панели"},
        )

    # Проверяем blacklist
    jti = payload.get("jti")
    if jti and await is_token_blacklisted(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_TOKEN_REVOKED", "message": "Токен отозван"},
        )

    return payload


async def get_current_customer(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """
    Dependency — извлечь текущего клиента (личный кабинет) из JWT.
    Проверяет роль "customer" и blacklist в Redis.
    """
    token = credentials.credentials
    payload = decode_token(token)

    if payload.get("type") != "access" or payload.get("role") != "customer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_INVALID_TOKEN_TYPE", "message": "Требуется клиентский токен"},
        )

    jti = payload.get("jti")
    if jti and await is_token_blacklisted(jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "AUTH_TOKEN_REVOKED", "message": "Токен отозван"},
        )

    return payload


def require_role(*allowed_roles: UserRole):
    """
    Dependency factory — проверка роли пользователя.
    
    Пример использования:
        @router.get("/admin", dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))])
    """
    async def role_checker(
        current_user: dict = Depends(get_current_user),
    ) -> dict:
        user_role = current_user.get("role")
        if user_role not in [r.value for r in allowed_roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "AUTH_INSUFFICIENT_ROLE",
                    "message": "Недостаточно прав для данного действия",
                },
            )
        return current_user
    return role_checker
