"""
Тесты бонусных кампаний — создание, отправка, отмена, детали, фильтр.
"""
import uuid
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    BonusCampaign,
    BonusCampaignRecipient,
    CampaignStatus,
    CampaignTargetType,
    Customer,
    User,
)


# ═══════════════════════════════════════════
# Create Campaign
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_create_campaign_all(
    client: AsyncClient, admin_headers: dict,
):
    """Создать кампанию target_type=all."""
    resp = await client.post("/api/v1/admin/campaigns", json={
        "name": "Тест кампания ALL",
        "bonus_date": str(date.today() + timedelta(days=1)),
        "amount": 100,
        "reason": "Тестовый повод",
        "target_type": "all",
    }, headers=admin_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Тест кампания ALL"
    assert data["target_type"] == "all"
    assert data["status"] == "pending"
    assert "id" in data


@pytest.mark.asyncio
async def test_create_campaign_individual(
    client: AsyncClient, admin_headers: dict, customer: Customer,
):
    """Создать кампанию target_type=individual с конкретными клиентами."""
    resp = await client.post("/api/v1/admin/campaigns", json={
        "name": "Тест кампания Individual",
        "bonus_date": str(date.today() + timedelta(days=1)),
        "amount": 50,
        "target_type": "individual",
        "customer_ids": [str(customer.id)],
    }, headers=admin_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["target_type"] == "individual"
    assert data["recipients_count"] == 1


@pytest.mark.asyncio
async def test_create_campaign_individual_no_customers(
    client: AsyncClient, admin_headers: dict,
):
    """Individual кампания без customer_ids — 400."""
    resp = await client.post("/api/v1/admin/campaigns", json={
        "name": "Кампания без клиентов",
        "bonus_date": str(date.today() + timedelta(days=1)),
        "amount": 50,
        "target_type": "individual",
        "customer_ids": [],
    }, headers=admin_headers)
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "MISSING_CUSTOMERS"


@pytest.mark.asyncio
async def test_create_campaign_invalid_target_type(
    client: AsyncClient, admin_headers: dict,
):
    """Неизвестный target_type — 400."""
    resp = await client.post("/api/v1/admin/campaigns", json={
        "name": "Невалидный тип",
        "bonus_date": str(date.today() + timedelta(days=1)),
        "amount": 50,
        "target_type": "unknown",
    }, headers=admin_headers)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_campaign_forbidden_for_cashier(
    client: AsyncClient, auth_headers: dict,
):
    """Кассир не может создавать кампании — 403."""
    resp = await client.post("/api/v1/admin/campaigns", json={
        "name": "Запрещено",
        "bonus_date": str(date.today()),
        "amount": 100,
        "target_type": "all",
    }, headers=auth_headers)
    assert resp.status_code == 403


# ═══════════════════════════════════════════
# List Campaigns
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_list_campaigns(
    client: AsyncClient, admin_headers: dict,
):
    """Список кампаний."""
    # Сначала создадим кампанию
    await client.post("/api/v1/admin/campaigns", json={
        "name": "Для списка",
        "bonus_date": str(date.today()),
        "amount": 10,
        "target_type": "all",
    }, headers=admin_headers)

    resp = await client.get("/api/v1/admin/campaigns", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_list_campaigns_filter_by_status(
    client: AsyncClient, admin_headers: dict,
):
    """Список кампаний с фильтром по статусу."""
    resp = await client.get(
        "/api/v1/admin/campaigns?status=pending", headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    for c in data:
        assert c["status"] == "pending"


# ═══════════════════════════════════════════
# Get Campaign Details
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_campaign_details(
    client: AsyncClient, admin_headers: dict, customer: Customer,
):
    """Детали кампании с получателями."""
    # Создаём individual кампанию с получателем
    create_resp = await client.post("/api/v1/admin/campaigns", json={
        "name": "Детали кампании",
        "bonus_date": str(date.today() + timedelta(days=2)),
        "amount": 75,
        "target_type": "individual",
        "customer_ids": [str(customer.id)],
    }, headers=admin_headers)
    assert create_resp.status_code == 201
    campaign_id = create_resp.json()["id"]

    resp = await client.get(
        f"/api/v1/admin/campaigns/{campaign_id}", headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "campaign" in data
    assert "recipients" in data
    assert data["campaign"]["id"] == campaign_id
    assert len(data["recipients"]) == 1


@pytest.mark.asyncio
async def test_get_campaign_not_found(
    client: AsyncClient, admin_headers: dict,
):
    """Несуществующая кампания — 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.get(
        f"/api/v1/admin/campaigns/{fake_id}", headers=admin_headers,
    )
    assert resp.status_code == 404


# ═══════════════════════════════════════════
# Send Campaign
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_send_campaign(
    client: AsyncClient, admin_headers: dict, customer: Customer,
):
    """Отправить pending кампанию."""
    create_resp = await client.post("/api/v1/admin/campaigns", json={
        "name": "Кампания для отправки",
        "bonus_date": str(date.today()),
        "amount": 25,
        "target_type": "individual",
        "customer_ids": [str(customer.id)],
    }, headers=admin_headers)
    assert create_resp.status_code == 201
    campaign_id = create_resp.json()["id"]

    with patch("app.api.v1.campaigns.process_campaign", new_callable=AsyncMock) as mock_proc:
        mock_proc.return_value = 1
        resp = await client.post(
            f"/api/v1/admin/campaigns/{campaign_id}/send", headers=admin_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["sent_count"] == 1


@pytest.mark.asyncio
async def test_send_campaign_not_found(
    client: AsyncClient, admin_headers: dict,
):
    """Отправить несуществующую кампанию — 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.post(
        f"/api/v1/admin/campaigns/{fake_id}/send", headers=admin_headers,
    )
    assert resp.status_code == 404


# ═══════════════════════════════════════════
# Cancel Campaign
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_cancel_campaign(
    client: AsyncClient, admin_headers: dict,
):
    """Отменить pending кампанию."""
    create_resp = await client.post("/api/v1/admin/campaigns", json={
        "name": "Кампания для отмены",
        "bonus_date": str(date.today() + timedelta(days=5)),
        "amount": 10,
        "target_type": "all",
    }, headers=admin_headers)
    assert create_resp.status_code == 201
    campaign_id = create_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/admin/campaigns/{campaign_id}/cancel", headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    # Повторная отмена — уже не pending → 400
    resp2 = await client.post(
        f"/api/v1/admin/campaigns/{campaign_id}/cancel", headers=admin_headers,
    )
    assert resp2.status_code == 400


@pytest.mark.asyncio
async def test_cancel_campaign_not_found(
    client: AsyncClient, admin_headers: dict,
):
    """Отменить несуществующую кампанию — 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.post(
        f"/api/v1/admin/campaigns/{fake_id}/cancel", headers=admin_headers,
    )
    assert resp.status_code == 404


# ═══════════════════════════════════════════
# Delete Campaign
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_delete_pending_campaign(
    client: AsyncClient, admin_headers: dict,
):
    """Удалить pending кампанию."""
    create_resp = await client.post("/api/v1/admin/campaigns", json={
        "name": "Для удаления",
        "bonus_date": str(date.today()),
        "amount": 5,
        "target_type": "all",
    }, headers=admin_headers)
    assert create_resp.status_code == 201
    campaign_id = create_resp.json()["id"]

    resp = await client.delete(
        f"/api/v1/admin/campaigns/{campaign_id}", headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    # После удаления — 404
    resp2 = await client.get(
        f"/api/v1/admin/campaigns/{campaign_id}", headers=admin_headers,
    )
    assert resp2.status_code == 404


@pytest.mark.asyncio
async def test_delete_cancelled_campaign(
    client: AsyncClient, admin_headers: dict,
):
    """Удалить cancelled кампанию (допустимо)."""
    create_resp = await client.post("/api/v1/admin/campaigns", json={
        "name": "Cancel then Delete",
        "bonus_date": str(date.today()),
        "amount": 5,
        "target_type": "all",
    }, headers=admin_headers)
    campaign_id = create_resp.json()["id"]

    # Сначала отменяем
    await client.post(
        f"/api/v1/admin/campaigns/{campaign_id}/cancel", headers=admin_headers,
    )

    # Затем удаляем
    resp = await client.delete(
        f"/api/v1/admin/campaigns/{campaign_id}", headers=admin_headers,
    )
    assert resp.status_code == 200
