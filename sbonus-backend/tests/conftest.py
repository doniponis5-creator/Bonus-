"""
Sbonus+ — Pytest конфигурация и фикстуры.
Использует SQLite in-memory для изоляции тестов.
"""

import asyncio
import uuid
from decimal import Decimal
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.main import app
from app.models import BonusAccount, Branch, Customer, Tier, User, UserRoleEnum

# SQLite in-memory для тестов
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(TEST_DB_URL, echo=False)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)


async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_database():
    """Создать таблицы перед тестами, удалить после."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    """Сессия БД для каждого теста с rollback."""
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP клиент для тестирования API."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac


# ─── Seed фикстуры ───────────────────────────────────────────────

@pytest_asyncio.fixture
async def branch(db: AsyncSession) -> Branch:
    """Тестовый филиал."""
    b = Branch(name="Тестовый Филиал", city="Ош", phone="+996557000000")
    db.add(b)
    await db.commit()
    await db.refresh(b)
    return b


@pytest_asyncio.fixture
async def tier_bronze(db: AsyncSession) -> Tier:
    """Уровень Bronze для тестов."""
    t = Tier(
        name="Bronze",
        min_total_kgs=Decimal("0"),
        bonus_percent=Decimal("3"),
        max_spend_pct=Decimal("30"),
        sort_order=0,
    )
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@pytest_asyncio.fixture
async def customer(db: AsyncSession, tier_bronze: Tier) -> Customer:
    """Тестовый клиент с бонусным счётом."""
    c = Customer(
        phone="+996700111222",
        full_name="Тест Клиент",
        qr_code=f"SB-TEST{uuid.uuid4().hex[:6].upper()}",
        referral_code=f"REF-TEST{uuid.uuid4().hex[:4].upper()}",
        tier_id=tier_bronze.id,
    )
    db.add(c)
    await db.flush()

    acc = BonusAccount(customer_id=c.id, balance=Decimal("500"))
    db.add(acc)
    await db.commit()
    await db.refresh(c)
    return c


@pytest_asyncio.fixture
async def cashier(db: AsyncSession, branch: Branch) -> User:
    """Тестовый кассир."""
    from app.core.security import hash_password
    u = User(
        phone="+996700999888",
        full_name="Тест Кассир",
        role=UserRoleEnum.CASHIER,
        branch_id=branch.id,
        pin_hash=hash_password("1234"),
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@pytest_asyncio.fixture
async def cashier_token(client: AsyncClient, cashier: User) -> str:
    """JWT access token кассира."""
    resp = await client.post("/api/v1/auth/cashier/login", json={
        "phone": cashier.phone,
        "pin": "1234",
    })
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest_asyncio.fixture
def auth_headers(cashier_token: str) -> dict:
    return {"Authorization": f"Bearer {cashier_token}"}


# ─── Admin фикстуры ───────────────────────────────────────────────

@pytest_asyncio.fixture
async def super_admin(db: AsyncSession, branch: Branch) -> User:
    """Тестовый суперадмин."""
    from app.core.security import hash_password
    u = User(
        phone="+996700888777",
        full_name="Тест Суперадмин",
        email="admin@sbonus.kg",
        role=UserRoleEnum.SUPER_ADMIN,
        branch_id=branch.id,
        password_hash=hash_password("secret123"),
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@pytest_asyncio.fixture
async def admin_token(client: AsyncClient, super_admin: User) -> str:
    """JWT access token суперадмина."""
    resp = await client.post("/api/v1/auth/admin/login", json={
        "email": super_admin.email,
        "password": "secret123",
    })
    assert resp.status_code == 200
    return resp.json()["access_token"]


@pytest_asyncio.fixture
def admin_headers(admin_token: str) -> dict:
    return {"Authorization": f"Bearer {admin_token}"}
