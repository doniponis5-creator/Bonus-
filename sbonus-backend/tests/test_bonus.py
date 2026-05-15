"""
Тесты бонусного движка — earn, spend, check-spend.
"""
import pytest
from decimal import Decimal
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import BonusAccount, Customer, Branch, Tier


@pytest.mark.asyncio
async def test_earn_bonus(client: AsyncClient, auth_headers: dict, customer: Customer, branch: Branch):
    """Начисление бонуса за покупку."""
    resp = await client.post(
        "/api/v1/bonus/earn",
        json={
            "customer_id": str(customer.id),
            "purchase_amount": 1000,
            "branch_id": str(branch.id),
            "receipt_number": "RECEIPT-TEST-001",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["type"] == "earn"
    assert float(data["amount"]) == 30.0  # 1000 × 3% = 30 KGS
    assert "new_balance" in data
    assert "tier_name" in data


@pytest.mark.asyncio
async def test_earn_below_minimum(client: AsyncClient, auth_headers: dict, customer: Customer, branch: Branch):
    """Покупка ниже минимума (500 KGS) — 400."""
    resp = await client.post(
        "/api/v1/bonus/earn",
        json={
            "customer_id": str(customer.id),
            "purchase_amount": 100,
            "branch_id": str(branch.id),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "BONUS_BELOW_MIN_PURCHASE"


@pytest.mark.asyncio
async def test_earn_duplicate_receipt(client: AsyncClient, auth_headers: dict, customer: Customer, branch: Branch):
    """Дубликат номера чека — 409."""
    payload = {
        "customer_id": str(customer.id),
        "purchase_amount": 1000,
        "branch_id": str(branch.id),
        "receipt_number": "RECEIPT-DUPLICATE-999",
    }
    first = await client.post("/api/v1/bonus/earn", json=payload, headers=auth_headers)
    assert first.status_code == 201

    second = await client.post("/api/v1/bonus/earn", json=payload, headers=auth_headers)
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "BONUS_DUPLICATE_RECEIPT"


@pytest.mark.asyncio
async def test_spend_bonus(client: AsyncClient, auth_headers: dict, customer: Customer, branch: Branch):
    """Списание бонусов."""
    resp = await client.post(
        "/api/v1/bonus/spend",
        json={
            "customer_id": str(customer.id),
            "spend_amount": 100,
            "purchase_amount": 1000,
            "branch_id": str(branch.id),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["type"] == "spend"
    assert float(data["amount"]) == 100.0
    assert float(data["new_balance"]) == 400.0  # 500 - 100 = 400


@pytest.mark.asyncio
async def test_spend_exceeds_balance(client: AsyncClient, auth_headers: dict, customer: Customer, branch: Branch):
    """Списание больше баланса — 400."""
    resp = await client.post(
        "/api/v1/bonus/spend",
        json={
            "customer_id": str(customer.id),
            "spend_amount": 9999,
            "purchase_amount": 10000,
            "branch_id": str(branch.id),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "BONUS_INSUFFICIENT_BALANCE"


@pytest.mark.asyncio
async def test_spend_exceeds_30_percent(client: AsyncClient, auth_headers: dict, customer: Customer, branch: Branch):
    """Списание больше 30% от покупки — 400."""
    resp = await client.post(
        "/api/v1/bonus/spend",
        json={
            "customer_id": str(customer.id),
            "spend_amount": 400,   # 400 > 30% от 1000 = 300
            "purchase_amount": 1000,
            "branch_id": str(branch.id),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "BONUS_EXCEED_MAX_SPEND"


@pytest.mark.asyncio
async def test_check_spend(client: AsyncClient, auth_headers: dict, customer: Customer):
    """Проверка доступной суммы для списания."""
    resp = await client.post(
        "/api/v1/bonus/check-spend",
        json={"customer_id": str(customer.id), "purchase_amount": 1000},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "max_spend" in data
    assert "balance" in data
    # max_spend = min(500, 1000 * 30%) = min(500, 300) = 300
    assert float(data["max_spend"]) == 300.0


@pytest.mark.asyncio
async def test_promo_code_apply(client: AsyncClient, auth_headers: dict, customer: Customer, db: AsyncSession):
    """Применение промокода."""
    from app.models import PromoCode
    promo = PromoCode(code="TESTPROMO", bonus_amount=Decimal("150"), max_uses=10)
    db.add(promo)
    await db.commit()

    resp = await client.post(
        "/api/v1/bonus/promo/apply",
        json={"customer_id": str(customer.id), "promo_code": "TESTPROMO"},
        headers=auth_headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["type"] == "promo"
    assert float(data["amount"]) == 150.0


@pytest.mark.asyncio
async def test_promo_code_invalid(client: AsyncClient, auth_headers: dict, customer: Customer):
    """Недействительный промокод — 400."""
    resp = await client.post(
        "/api/v1/bonus/promo/apply",
        json={"customer_id": str(customer.id), "promo_code": "INVALID_CODE"},
        headers=auth_headers,
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "PROMO_CODE_INVALID"
