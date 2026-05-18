"""
Тесты админ-панели — дашборд, уровни, промокоды, клиенты, кассиры, настройки, экспорт.
"""
import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Branch, Customer, PromoCode, Setting, Tier, User


# ═══════════════════════════════════════════
# Dashboard Stats
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_dashboard_stats(
    client: AsyncClient, admin_headers: dict, customer: Customer,
):
    """Дашборд возвращает корректную статистику."""
    resp = await client.get("/api/v1/admin/dashboard/stats", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_customers"] >= 1
    assert data["active_customers"] >= 1
    assert "total_bonus_issued" in data
    assert "total_bonus_spent" in data
    assert "total_balance" in data
    assert "transactions_today" in data
    assert "transactions_month" in data
    assert isinstance(data["tier_distribution"], dict)


@pytest.mark.asyncio
async def test_dashboard_stats_forbidden_for_cashier(
    client: AsyncClient, auth_headers: dict,
):
    """Кассир не имеет доступа к дашборду — 403."""
    resp = await client.get("/api/v1/admin/dashboard/stats", headers=auth_headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_dashboard_stats_no_auth(client: AsyncClient):
    """Без токена — 401/403."""
    resp = await client.get("/api/v1/admin/dashboard/stats")
    assert resp.status_code in (401, 403)


# ═══════════════════════════════════════════
# Tiers CRUD
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_tiers(client: AsyncClient, admin_headers: dict, tier_bronze: Tier):
    """Получить список уровней."""
    resp = await client.get("/api/v1/admin/tiers", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    tier = data[0]
    assert "id" in tier
    assert "name" in tier
    assert "bonus_percent" in tier


@pytest.mark.asyncio
async def test_create_tier(client: AsyncClient, admin_headers: dict):
    """Создать новый уровень."""
    resp = await client.post("/api/v1/admin/tiers", json={
        "name": "Platinum_Test",
        "min_total_kgs": 5000,
        "bonus_percent": 10,
        "max_spend_pct": 50,
    }, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_update_existing_tier(
    client: AsyncClient, admin_headers: dict, tier_bronze: Tier,
):
    """Обновить существующий уровень по имени."""
    resp = await client.post("/api/v1/admin/tiers", json={
        "name": "Bronze",
        "min_total_kgs": 0,
        "bonus_percent": 5,
        "max_spend_pct": 35,
    }, headers=admin_headers)
    assert resp.status_code == 200
    assert "обновлён" in resp.json()["message"] or "создан" in resp.json()["message"]


# ═══════════════════════════════════════════
# Promo Codes CRUD
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_create_promo_code(client: AsyncClient, admin_headers: dict):
    """Создать промокод."""
    resp = await client.post("/api/v1/admin/promo-codes", json={
        "code": "ADMIN_TEST_PROMO",
        "bonus_amount": 200,
        "max_uses": 50,
    }, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_create_duplicate_promo_code(
    client: AsyncClient, admin_headers: dict, db: AsyncSession,
):
    """Дубликат промокода — 409."""
    promo = PromoCode(code="DUPLICATE_TEST", bonus_amount=Decimal("100"), max_uses=10)
    db.add(promo)
    await db.commit()

    resp = await client.post("/api/v1/admin/promo-codes", json={
        "code": "DUPLICATE_TEST",
        "bonus_amount": 100,
        "max_uses": 10,
    }, headers=admin_headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_get_promo_codes(client: AsyncClient, admin_headers: dict):
    """Список промокодов с пагинацией."""
    resp = await client.get("/api/v1/admin/promo-codes", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "limit" in data


@pytest.mark.asyncio
async def test_get_promo_codes_pagination(client: AsyncClient, admin_headers: dict):
    """Промокоды — пагинация параметры."""
    resp = await client.get(
        "/api/v1/admin/promo-codes?page=1&limit=5", headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 1
    assert data["limit"] == 5


# ═══════════════════════════════════════════
# Customers List
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_customers_list(
    client: AsyncClient, admin_headers: dict, customer: Customer,
):
    """Список клиентов."""
    resp = await client.get("/api/v1/admin/customers", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert len(data["items"]) >= 1


@pytest.mark.asyncio
async def test_get_customers_search_by_phone(
    client: AsyncClient, admin_headers: dict, customer: Customer,
):
    """Поиск клиентов по телефону."""
    resp = await client.get(
        f"/api/v1/admin/customers?search={customer.phone}", headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    assert any(c["phone"] == customer.phone for c in data["items"])


@pytest.mark.asyncio
async def test_get_customers_search_by_name(
    client: AsyncClient, admin_headers: dict, customer: Customer,
):
    """Поиск клиентов по имени."""
    resp = await client.get(
        "/api/v1/admin/customers?search=Тест", headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1


@pytest.mark.asyncio
async def test_get_customers_pagination(
    client: AsyncClient, admin_headers: dict, customer: Customer,
):
    """Пагинация списка клиентов."""
    resp = await client.get(
        "/api/v1/admin/customers?page=1&limit=10", headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["page"] == 1
    assert data["limit"] == 10


@pytest.mark.asyncio
async def test_update_customer(
    client: AsyncClient, admin_headers: dict, customer: Customer,
):
    """Обновить данные клиента."""
    resp = await client.put(
        f"/api/v1/admin/customers/{customer.id}",
        json={"full_name": "Обновлённое Имя"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_update_customer_not_found(
    client: AsyncClient, admin_headers: dict,
):
    """Обновить несуществующего клиента — 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.put(
        f"/api/v1/admin/customers/{fake_id}",
        json={"full_name": "Нет такого"},
        headers=admin_headers,
    )
    assert resp.status_code == 404


# ═══════════════════════════════════════════
# Cashiers CRUD
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_cashiers(client: AsyncClient, admin_headers: dict, cashier: User):
    """Список кассиров."""
    resp = await client.get("/api/v1/admin/cashiers", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert "full_name" in data[0]
    assert "phone" in data[0]
    assert "branch_name" in data[0]


@pytest.mark.asyncio
async def test_create_cashier(
    client: AsyncClient, admin_headers: dict, branch: Branch,
):
    """Создать кассира."""
    resp = await client.post("/api/v1/admin/cashiers", json={
        "phone": "+996700555444",
        "full_name": "Новый Кассир",
        "pin": "5678",
        "branch_id": str(branch.id),
    }, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_create_duplicate_cashier(
    client: AsyncClient, admin_headers: dict, cashier: User,
):
    """Дубликат телефона кассира — 409."""
    resp = await client.post("/api/v1/admin/cashiers", json={
        "phone": cashier.phone,
        "full_name": "Дубль Кассир",
        "pin": "1111",
    }, headers=admin_headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_update_cashier(
    client: AsyncClient, admin_headers: dict, cashier: User,
):
    """Обновить данные кассира."""
    resp = await client.patch(
        f"/api/v1/admin/cashiers/{cashier.id}",
        json={"full_name": "Обновлённый Кассир"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True


@pytest.mark.asyncio
async def test_update_cashier_not_found(
    client: AsyncClient, admin_headers: dict,
):
    """Обновить несуществующего кассира — 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.patch(
        f"/api/v1/admin/cashiers/{fake_id}",
        json={"full_name": "Нет такого"},
        headers=admin_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_deactivate_cashier(
    client: AsyncClient, admin_headers: dict, cashier: User,
):
    """Блокировка кассира."""
    resp = await client.patch(
        f"/api/v1/admin/cashiers/{cashier.id}",
        json={"is_active": False},
        headers=admin_headers,
    )
    assert resp.status_code == 200


# ═══════════════════════════════════════════
# Settings
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_settings(client: AsyncClient, admin_headers: dict):
    """Получить глобальные настройки."""
    resp = await client.get("/api/v1/admin/settings", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict)


@pytest.mark.asyncio
async def test_update_settings(client: AsyncClient, admin_headers: dict):
    """Обновить настройки."""
    resp = await client.post("/api/v1/admin/settings", json={
        "MIN_PURCHASE_FOR_BONUS": "500",
    }, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    # Проверяем что настройка сохранилась
    get_resp = await client.get("/api/v1/admin/settings", headers=admin_headers)
    assert get_resp.status_code == 200
    assert get_resp.json().get("MIN_PURCHASE_FOR_BONUS") == "500"


@pytest.mark.asyncio
async def test_settings_forbidden_for_cashier(
    client: AsyncClient, auth_headers: dict,
):
    """Кассир не имеет доступа к настройкам — 403."""
    resp = await client.get("/api/v1/admin/settings", headers=auth_headers)
    assert resp.status_code == 403


# ═══════════════════════════════════════════
# Export Report
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_export_csv(client: AsyncClient, admin_headers: dict):
    """Экспорт CSV отчёта."""
    resp = await client.get(
        "/api/v1/admin/reports/export?format=csv&days=30", headers=admin_headers,
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers.get("content-type", "")


# ═══════════════════════════════════════════
# Branches
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_branches(
    client: AsyncClient, admin_headers: dict, branch: Branch,
):
    """Список филиалов."""
    resp = await client.get("/api/v1/admin/branches", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_create_branch(client: AsyncClient, admin_headers: dict):
    """Создать филиал."""
    resp = await client.post("/api/v1/admin/branches", json={
        "name": "Новый Филиал",
        "city": "Бишкек",
    }, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ═══════════════════════════════════════════
# Audit Logs
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_audit_logs(client: AsyncClient, admin_headers: dict):
    """Получить журнал аудита."""
    resp = await client.get("/api/v1/admin/audit-logs", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data


# ═══════════════════════════════════════════
# Transactions
# ═══════════════════════════════════════════

@pytest.mark.asyncio
async def test_get_all_transactions(client: AsyncClient, admin_headers: dict):
    """Список всех транзакций."""
    resp = await client.get("/api/v1/admin/transactions", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
