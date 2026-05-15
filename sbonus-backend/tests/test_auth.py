"""
Тесты аутентификации.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


@pytest.mark.asyncio
async def test_cashier_login_success(client: AsyncClient, cashier: User):
    """Успешный вход кассира."""
    resp = await client.post("/api/v1/auth/cashier/login", json={
        "phone": cashier.phone,
        "pin": "1234",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["role"] == "cashier"


@pytest.mark.asyncio
async def test_cashier_login_wrong_pin(client: AsyncClient, cashier: User):
    """Неверный PIN — 401."""
    resp = await client.post("/api/v1/auth/cashier/login", json={
        "phone": cashier.phone,
        "pin": "9999",
    })
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "AUTH_INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_cashier_login_wrong_phone(client: AsyncClient):
    """Несуществующий телефон — 401."""
    resp = await client.post("/api/v1/auth/cashier/login", json={
        "phone": "+996700000000",
        "pin": "1234",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient, cashier: User):
    """Обновление access токена через refresh токен."""
    login = await client.post("/api/v1/auth/cashier/login", json={
        "phone": cashier.phone,
        "pin": "1234",
    })
    refresh_token = login.json()["refresh_token"]

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_logout(client: AsyncClient, cashier: User):
    """Выход из системы."""
    login = await client.post("/api/v1/auth/cashier/login", json={
        "phone": cashier.phone,
        "pin": "1234",
    })
    token = login.json()["access_token"]

    resp = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_protected_route_without_token(client: AsyncClient):
    """Запрос без токена — 401."""
    resp = await client.get("/api/v1/customers/by-phone/+996700111222")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient):
    """Health check endpoint."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["checks"]["api"] == "ok"
