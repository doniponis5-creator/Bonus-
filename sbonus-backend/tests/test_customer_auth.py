"""
Тесты аутентификации клиента через magic-link (запрос, верификация, expiry, reuse, rate limit).
"""
import secrets
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, CustomerAuthToken


# ═══════════════════════════════════════════
# Request Magic Link
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_request_magic_link_existing_customer(
    client: AsyncClient, customer: Customer,
):
    """Запрос magic-link для зарегистрированного клиента — всегда 200 (без раскрытия)."""
    resp = await client.post("/api/v1/customer-auth/request-link", json={
        "phone": customer.phone,
    })
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    # Ответ не раскрывает факт существования клиента
    assert "зарегистрирован" in resp.json()["message"]


@pytest.mark.asyncio
async def test_request_magic_link_unknown_phone(client: AsyncClient):
    """Запрос magic-link для незарегистрированного номера — тоже 200 (защита от enumeration)."""
    resp = await client.post("/api/v1/customer-auth/request-link", json={
        "phone": "+996700999111",
    })
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ═══════════════════════════════════════════
# Verify Token
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_verify_valid_token(
    client: AsyncClient, customer: Customer, db: AsyncSession,
):
    """Верификация валидного magic-link токена — JWT выдаётся."""
    token_value = secrets.token_urlsafe(32)[:64]
    auth_token = CustomerAuthToken(
        customer_id=customer.id,
        token=token_value,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        ip_address="127.0.0.1",
    )
    db.add(auth_token)
    await db.commit()

    resp = await client.post("/api/v1/customer-auth/verify", json={
        "token": token_value,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["customer_id"] == str(customer.id)
    assert "expires_in" in data


@pytest.mark.asyncio
async def test_verify_expired_token(
    client: AsyncClient, customer: Customer, db: AsyncSession,
):
    """Верификация просроченного токена — 401."""
    token_value = secrets.token_urlsafe(32)[:64]
    auth_token = CustomerAuthToken(
        customer_id=customer.id,
        token=token_value,
        expires_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        ip_address="127.0.0.1",
    )
    db.add(auth_token)
    await db.commit()

    resp = await client.post("/api/v1/customer-auth/verify", json={
        "token": token_value,
    })
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "TOKEN_EXPIRED"


@pytest.mark.asyncio
async def test_verify_used_token(
    client: AsyncClient, customer: Customer, db: AsyncSession,
):
    """Верификация уже использованного токена — 401."""
    token_value = secrets.token_urlsafe(32)[:64]
    auth_token = CustomerAuthToken(
        customer_id=customer.id,
        token=token_value,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        used_at=datetime.now(timezone.utc),
        ip_address="127.0.0.1",
    )
    db.add(auth_token)
    await db.commit()

    resp = await client.post("/api/v1/customer-auth/verify", json={
        "token": token_value,
    })
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "TOKEN_ALREADY_USED"


@pytest.mark.asyncio
async def test_verify_invalid_token(client: AsyncClient):
    """Верификация несуществующего токена — 401."""
    resp = await client.post("/api/v1/customer-auth/verify", json={
        "token": "a" * 32,
    })
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "INVALID_TOKEN"


@pytest.mark.asyncio
async def test_verify_token_is_one_time_use(
    client: AsyncClient, customer: Customer, db: AsyncSession,
):
    """Токен одноразовый — повторная верификация не проходит."""
    token_value = secrets.token_urlsafe(32)[:64]
    auth_token = CustomerAuthToken(
        customer_id=customer.id,
        token=token_value,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        ip_address="127.0.0.1",
    )
    db.add(auth_token)
    await db.commit()

    # Первый вызов — успех
    resp1 = await client.post("/api/v1/customer-auth/verify", json={
        "token": token_value,
    })
    assert resp1.status_code == 200

    # Второй вызов — уже использован
    resp2 = await client.post("/api/v1/customer-auth/verify", json={
        "token": token_value,
    })
    assert resp2.status_code == 401
    assert resp2.json()["detail"]["code"] == "TOKEN_ALREADY_USED"


# ═══════════════════════════════════════════
# Rate Limiting
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_magic_link_rate_limit(
    client: AsyncClient, customer: Customer,
):
    """Повторный запрос magic-link слишком быстро — 429 (rate limit)."""
    # Первый запрос — ОК
    resp1 = await client.post("/api/v1/customer-auth/request-link", json={
        "phone": customer.phone,
    })
    assert resp1.status_code == 200

    # Второй запрос — rate limited (1 в минуту)
    resp2 = await client.post("/api/v1/customer-auth/request-link", json={
        "phone": customer.phone,
    })
    assert resp2.status_code == 429
    assert resp2.json()["detail"]["code"] == "RATE_LIMIT_EXCEEDED"
