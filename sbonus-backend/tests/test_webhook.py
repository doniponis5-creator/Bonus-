"""
Тесты 1С webhook.
"""
import pytest
from httpx import AsyncClient
from unittest.mock import patch

from app.models import Branch, Customer, Tier


@pytest.fixture(autouse=True)
def enable_webhook(monkeypatch):
    """Включить webhook для всех тестов в этом модуле."""
    monkeypatch.setattr("app.api.v1.webhook.settings.enable_1c_webhook", True)
    monkeypatch.setattr(
        "app.api.v1.webhook.settings.webhook_1c_allowed_ips",
        property(lambda self: ["127.0.0.1", "testclient"]),
    )


@pytest.mark.asyncio
async def test_webhook_purchase(client: AsyncClient, customer: Customer, branch: Branch, tier_bronze: Tier):
    """1С webhook — начисление бонуса."""
    with patch("app.api.v1.webhook._check_ip_whitelist", return_value=True):
        resp = await client.post(
            "/api/v1/webhook/1c/purchase",
            json={
                "customer_phone": customer.phone,
                "purchase_amount": 2000,
                "branch_id": str(branch.id),
                "receipt_number": "WH-RECEIPT-001",
            },
        )
    assert resp.status_code == 201
    data = resp.json()
    assert data["success"] is True
    assert data["event"] == "purchase"
    assert float(data["bonus_earned"]) == 60.0  # 2000 × 3% = 60


@pytest.mark.asyncio
async def test_webhook_get_customer(client: AsyncClient, customer: Customer):
    """1С webhook — баланс клиента."""
    with patch("app.api.v1.webhook._check_ip_whitelist", return_value=True):
        resp = await client.get(f"/api/v1/webhook/1c/customer/{customer.phone}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["registered"] is True
    assert data["phone"] == customer.phone
    assert "balance" in data
    assert "tier" in data


@pytest.mark.asyncio
async def test_webhook_customer_not_found(client: AsyncClient):
    """1С webhook — клиент не найден."""
    with patch("app.api.v1.webhook._check_ip_whitelist", return_value=True):
        resp = await client.get("/api/v1/webhook/1c/customer/+996700000000")
    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "CUSTOMER_NOT_FOUND"


@pytest.mark.asyncio
async def test_webhook_check_spend(client: AsyncClient, customer: Customer):
    """1С webhook — проверка доступной суммы списания."""
    with patch("app.api.v1.webhook._check_ip_whitelist", return_value=True):
        resp = await client.get(
            f"/api/v1/webhook/1c/check-spend/{customer.phone}",
            params={"purchase_amount": 2000},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "max_spend" in data
    assert "can_spend" in data
    # balance=500, 30% from 2000=600, max_spend=min(500,600)=500
    assert float(data["max_spend"]) == 500.0
    assert data["can_spend"] is True


@pytest.mark.asyncio
async def test_webhook_register_new(client: AsyncClient, tier_bronze: Tier):
    """1С webhook — регистрация нового клиента."""
    with patch("app.api.v1.webhook._check_ip_whitelist", return_value=True):
        resp = await client.post(
            "/api/v1/webhook/1c/register",
            json={"phone": "+996700777888", "full_name": "Webhook Клиент"},
        )
    assert resp.status_code == 201
    data = resp.json()
    assert data["success"] is True
    assert data["already_exists"] is False
    assert data["phone"] == "+996700777888"


@pytest.mark.asyncio
async def test_webhook_register_existing(client: AsyncClient, customer: Customer, tier_bronze: Tier):
    """1С webhook — регистрация уже существующего клиента (идемпотентно)."""
    with patch("app.api.v1.webhook._check_ip_whitelist", return_value=True):
        resp = await client.post(
            "/api/v1/webhook/1c/register",
            json={"phone": customer.phone, "full_name": customer.full_name},
        )
    assert resp.status_code == 201
    data = resp.json()
    assert data["already_exists"] is True
    assert data["customer_id"] == str(customer.id)


@pytest.mark.asyncio
async def test_webhook_disabled(client: AsyncClient, monkeypatch):
    """Webhook отключён — 503."""
    monkeypatch.setattr("app.api.v1.webhook.settings.enable_1c_webhook", False)
    resp = await client.get("/api/v1/webhook/1c/customer/+996700111222")
    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "WEBHOOK_DISABLED"
