"""
Sbonus+ — API маршруты для кассир-бонусов.
GET  /api/v1/admin/cashier-bonuses/config
PUT  /api/v1/admin/cashier-bonuses/config
GET  /api/v1/admin/cashier-bonuses/progress
GET  /api/v1/admin/cashier-bonuses/progress/{cashier_id}
"""

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import UserRole, require_role
from app.services.cashier_bonus import (
    get_cashier_bonus_config,
    save_cashier_bonus_config,
    get_cashier_progress,
    get_all_cashiers_progress,
)

router = APIRouter(prefix="/admin/cashier-bonuses", tags=["Кассир-бонусы"])


# ═══════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════

class MilestoneItem(BaseModel):
    sales: int = Field(..., ge=1)
    bonus: int = Field(..., ge=1)


class StreakItem(BaseModel):
    days: int = Field(..., ge=1)
    bonus: int = Field(..., ge=1)


class CashierBonusConfigRequest(BaseModel):
    enabled: bool = True
    daily_milestones: List[MilestoneItem] = []
    monthly_milestones: List[MilestoneItem] = []
    streak_milestones: List[StreakItem] = []
    streak_min_sales: int = Field(5, ge=1, le=100)


# ═══════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════

@router.get(
    "/config",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def get_config(db: AsyncSession = Depends(get_db)) -> dict:
    """Получить текущий конфиг кассир-бонусов."""
    return await get_cashier_bonus_config(db)


@router.put(
    "/config",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def update_config(
    body: CashierBonusConfigRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Обновить конфиг кассир-бонусов."""
    config = {
        "enabled": body.enabled,
        "daily_milestones": [m.model_dump() for m in body.daily_milestones],
        "monthly_milestones": [m.model_dump() for m in body.monthly_milestones],
        "streak_milestones": [m.model_dump() for m in body.streak_milestones],
        "streak_min_sales": body.streak_min_sales,
    }
    await save_cashier_bonus_config(db, config)
    await db.commit()
    return {"status": "ok", "message": "Конфигурация сохранена"}


# ═══════════════════════════════════════════
# PROGRESS
# ═══════════════════════════════════════════

@router.get(
    "/progress",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def all_cashiers_progress(db: AsyncSession = Depends(get_db)) -> list:
    """Прогресс всех кассиров для админ-дашборда."""
    return await get_all_cashiers_progress(db)


@router.get(
    "/progress/{cashier_id}",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def single_cashier_progress(
    cashier_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Прогресс конкретного кассира."""
    return await get_cashier_progress(db, cashier_id)
