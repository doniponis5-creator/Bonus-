"""
Тесты API клиентов.
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, Tier


@pytest.mark.asyncio
async def test_register_customer(client: AsyncClient, auth_headers: dict, tier_bronze: Tier):
    """Регистрация нового клиента."""
    resp = await client.post(
        "/api/v1/customers/register",
        json={"phone": "+996700333444", "full_name": "Новый Клиент"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["phone"] == "+996700333444"
    assert data["full_name"] == "Новый Клиент"
    assert "qr_code" in data
    assert "referral_code" in data


@pytest.mark.asyncio
async def test_register_duplicate_phone(client: AsyncClient, auth_headers: dict, customer: Customer):
    """Дубликат телефона — 409."""
    resp = await client.post(
        "/api/v1/customers/register",
        json={"phone": customer.phone, "full_name": "Дубликат"},
        headers=auth_headers,
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "CUSTOMER_PHONE_EXISTS"


@pytest.mark.asyncio
async def test_get_by_phone(client: AsyncClient, auth_headers: dict, customer: Customer):
    """Поиск клиента по телефону."""
    resp = await client.get(
        f"/api/v1/customers/by-phone/{customer.phone}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["phone"] == customer.phone
    assert data["full_name"] == customer.full_name


@pytest.mark.asyncio
async def test_get_by_phone_not_found(client: AsyncClient, auth_headers: dict):
    """Клиент не найден — 404."""
    resp = await client.get(
        "/api/v1/customers/by-phone/+996700000001",
        headers=auth_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_by_qr(client: AsyncClient, auth_headers: dict, customer: Customer):
    """Поиск клиента по QR коду."""
    resp = await client.get(
        f"/api/v1/customers/by-qr/{customer.qr_code}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["qr_code"] == customer.qr_code


@pytest.mark.asyncio
async def test_get_balance(client: AsyncClient, auth_headers: dict, customer: Customer):
    """Баланс клиента."""
    resp = await client.get(
        f"/api/v1/customers/{customer.id}/balance",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "balance" in data
    assert "tier_name" in data
    assert "tier_percent" in data
    assert float(data["balance"]) == 500.0


@pytest.mark.asyncio
async def test_get_transactions_empty(client: AsyncClient, auth_headers: dict, customer: Customer):
    """История транзакций — пустая."""
    resp = await client.get(
        f"/api/v1/customers/{customer.id}/transactions",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data


@pytest.mark.asyncio
async def test_phone_normalization(client: AsyncClient, auth_headers: dict, tier_bronze: Tier):
    """Нормализация телефона: 0700... → +996700..."""
    resp = await client.post(
        "/api/v1/customers/register",
        json={"phone": "0700555666", "full_name": "Нормализация"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    assert resp.json()["phone"] == "+996700555666"
