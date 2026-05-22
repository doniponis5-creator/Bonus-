"""
Sbonus+ — Cashback Management API.

Admin: kategoriyalar va promo aktsiyalarni boshqarish.
Klient: hozirgi cashback foizlarini ko'rish.

GET  /api/v1/cashback/categories       — Kategoriyalar ro'yxati
PUT  /api/v1/cashback/categories       — Kategoriyalarni yangilash (admin)
GET  /api/v1/cashback/promo            — Aktiv promo
PUT  /api/v1/cashback/promo            — Promo yaratish/yangilash (admin)
DELETE /api/v1/cashback/promo          — Promo o'chirish (admin)
GET  /api/v1/cashback/my-rate          — Klient o'z cashback foizini ko'rish
"""

from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import UserRole, get_current_customer, require_role
from app.models import BonusAccount, Customer, Tier
from app.services.cashback import (
    calculate_cashback_percent,
    get_cashback_categories,
    get_cashback_promo,
    save_cashback_categories,
    save_cashback_promo,
)

router = APIRouter(prefix="/cashback", tags=["Cashback"])


# ─── Schemas ───

class CashbackCategory(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Kategoriya nomi")
    slug: str = Field(..., min_length=1, max_length=50, description="Unikal identifikator (lotin)")
    percent: float = Field(..., gt=0, le=50, description="Cashback foizi")


class CashbackPromo(BaseModel):
    active: bool = True
    title: str = Field(..., min_length=1, max_length=200)
    global_percent: float = Field(..., gt=0, le=50)
    expires_at: Optional[str] = Field(None, description="ISO 8601 format: 2026-06-01T00:00:00Z")


class MyRateResponse(BaseModel):
    percent: float
    source: str  # "tier", "category", "promo"
    promo_title: Optional[str] = None


# ─── Public Endpoints ───

@router.get("/categories", response_model=list[CashbackCategory])
async def list_categories(
    db: AsyncSession = Depends(get_db),
) -> list[CashbackCategory]:
    """Barcha cashback kategoriyalari (public)."""
    cats = await get_cashback_categories(db)
    return [CashbackCategory(**c) for c in cats]


@router.get("/promo")
async def get_promo(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Aktiv global promo (public). Yo'q bo'lsa null."""
    promo = await get_cashback_promo(db)
    return {"promo": promo}


@router.get("/my-rate", response_model=MyRateResponse)
async def get_my_cashback_rate(
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_customer: dict = Depends(get_current_customer),
) -> MyRateResponse:
    """
    Klient o'z hozirgi cashback foizini ko'rish.
    Agar category query param berilsa — shu kategoriya uchun foiz.
    """
    import uuid
    customer_id = uuid.UUID(current_customer["sub"])

    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND"})

    tier_percent = Decimal("3")  # default
    if customer.tier_id:
        tier_result = await db.execute(select(Tier).where(Tier.id == customer.tier_id))
        tier = tier_result.scalar_one_or_none()
        if tier:
            tier_percent = tier.bonus_percent

    percent, source = await calculate_cashback_percent(db, tier_percent, category)

    promo_title = None
    if source == "promo":
        promo = await get_cashback_promo(db)
        promo_title = promo.get("title") if promo else None

    return MyRateResponse(percent=float(percent), source=source, promo_title=promo_title)


# ─── Admin Endpoints ───

@router.put(
    "/categories",
    response_model=list[CashbackCategory],
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def update_categories(
    body: list[CashbackCategory],
    db: AsyncSession = Depends(get_db),
) -> list[CashbackCategory]:
    """Cashback kategoriyalarni yangilash (SUPER_ADMIN)."""
    # Slug uniqueness
    slugs = [c.slug for c in body]
    if len(slugs) != len(set(slugs)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "DUPLICATE_SLUG", "message": "Kategoriya sluglari unikal bo'lishi kerak"},
        )

    await save_cashback_categories(db, [c.model_dump() for c in body])
    return body


@router.put(
    "/promo",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def update_promo(
    body: CashbackPromo,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Global promo aktsiya yaratish/yangilash (SUPER_ADMIN)."""
    await save_cashback_promo(db, body.model_dump())
    return {"status": "ok", "promo": body.model_dump()}


@router.delete(
    "/promo",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def delete_promo(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Global promo o'chirish (SUPER_ADMIN)."""
    await save_cashback_promo(db, {"active": False, "title": "", "global_percent": 0})
    return {"status": "ok", "message": "Promo o'chirildi"}
