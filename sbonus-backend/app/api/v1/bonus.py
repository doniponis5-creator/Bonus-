"""
Sbonus+ — API маршруты бонусных операций.
POST /api/v1/bonus/earn, spend, check-spend, birthday, referral/apply, promo/apply
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user


def _validate_branch(current_user: dict, request_branch_id: uuid.UUID | None):
    """Validate cashier operates within their assigned branch."""
    user_branch = current_user.get("branch_id")
    if not user_branch or not request_branch_id:
        return  # no branch constraint (super_admin or legacy)
    if str(request_branch_id) != str(user_branch):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "BRANCH_MISMATCH", "message": "Операция запрещена: неверный филиал."},
        )
from app.schemas import (
    BonusCheckSpendRequest,
    BonusEarnRequest,
    BonusResult,
    BonusSpendRequest,
    PromoApplyRequest,
    ReferralApplyRequest,
)
from app.services.bonus import BonusService

router = APIRouter(prefix="/bonus", tags=["Бонусные операции"])


@router.post("/earn", response_model=BonusResult, status_code=201)
async def earn_bonus(
    body: BonusEarnRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> BonusResult:
    """
    Начислить бонус за покупку.
    Кассир вводит сумму вручную → бонус рассчитывается автоматически.
    """
    _validate_branch(current_user, body.branch_id)
    svc = BonusService(db)
    return await svc.earn(
        customer_id=body.customer_id,
        purchase_amount=body.purchase_amount,
        branch_id=body.branch_id,
        cashier_id=uuid.UUID(current_user["sub"]) if current_user.get("sub") else None,
        receipt_number=body.receipt_number,
        note=body.note,
    )


@router.post("/spend", response_model=BonusResult, status_code=201)
async def spend_bonus(
    body: BonusSpendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> BonusResult:
    """Списать бонус при оплате. Макс 30% от суммы покупки."""
    _validate_branch(current_user, body.branch_id)
    svc = BonusService(db)
    return await svc.spend(
        customer_id=body.customer_id,
        spend_amount=body.spend_amount,
        purchase_amount=body.purchase_amount,
        branch_id=body.branch_id,
        cashier_id=uuid.UUID(current_user["sub"]) if current_user.get("sub") else None,
        note=body.note,
    )


@router.post("/check-spend")
async def check_spend(
    body: BonusCheckSpendRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Проверка максимальной суммы списания перед операцией."""
    svc = BonusService(db)
    return await svc.check_spend(body.customer_id, body.purchase_amount)


@router.post("/birthday", response_model=BonusResult, status_code=201)
async def birthday_bonus(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> BonusResult:
    """Начислить бонус ко дню рождения (+200 KGS)."""
    svc = BonusService(db)
    return await svc.birthday_bonus(customer_id)


@router.post("/referral/apply", response_model=BonusResult, status_code=201)
async def apply_referral(
    body: ReferralApplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> BonusResult:
    """Применить реферальный код. +100 KGS пригласившему, +50 KGS новому."""
    svc = BonusService(db)
    return await svc.apply_referral(body.customer_id, body.referral_code)


@router.post("/promo/apply", response_model=BonusResult, status_code=201)
async def apply_promo(
    body: PromoApplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> BonusResult:
    """Применить промокод."""
    svc = BonusService(db)
    return await svc.apply_promo(body.customer_id, body.promo_code)
