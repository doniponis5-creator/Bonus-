"""
Sbonus+ — API личного кабинета клиента.
GET  /api/v1/customer/me — дашборд
GET  /api/v1/customer/transactions — полная история
PATCH /api/v1/customer/profile — редактирование профиля
POST /api/v1/customer/promo — ввод промокода
GET  /api/v1/customer/referral — реферальная информация
"""

import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_customer
from app.models import Customer, CustomerDebt, Tier, Transaction, TransactionType
from app.schemas import (
    CustomerCabinetMe,
    CustomerCabinetTransaction,
)

router = APIRouter(prefix="/customer", tags=["Клиент: Кабинет"])


@router.get("/me", response_model=CustomerCabinetMe)
async def get_me(
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> CustomerCabinetMe:
    """Полный дашборд клиента: баланс, уровень, задолженность из 1C, последние 5 операций."""
    customer_id = current["sub"]

    result = await db.execute(
        select(Customer)
        .options(selectinload(Customer.tier), selectinload(Customer.bonus_account))
        .where(Customer.id == customer_id)
    )
    customer = result.scalar_one_or_none()
    if not customer or not customer.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CUSTOMER_NOT_FOUND", "message": "Клиент не найден"},
        )

    account = customer.bonus_account
    tier = customer.tier

    # ── Следующий уровень и прогресс ──
    next_tier_name = None
    next_remaining: Decimal | None = None
    progress_percent = Decimal("0")

    total_earned = account.total_earned if account else Decimal("0")

    if tier:
        nt_result = await db.execute(
            select(Tier)
            .where(Tier.min_total_kgs > tier.min_total_kgs, Tier.is_active == True)
            .order_by(Tier.min_total_kgs.asc())
            .limit(1)
        )
        next_tier_obj = nt_result.scalar_one_or_none()
        if next_tier_obj:
            next_tier_name = next_tier_obj.name
            gap = next_tier_obj.min_total_kgs - tier.min_total_kgs
            done = total_earned - tier.min_total_kgs
            next_remaining = max(next_tier_obj.min_total_kgs - total_earned, Decimal("0"))
            if gap > 0:
                progress_percent = max(
                    Decimal("0"), min(Decimal("100"), (done / gap * Decimal("100")).quantize(Decimal("0.01")))
                )

    # ── Последняя задолженность из 1C ──
    debt_amount = Decimal("0")
    debt_updated_at = None
    debt_result = await db.execute(
        select(CustomerDebt)
        .where(CustomerDebt.customer_id == customer.id)
        .order_by(CustomerDebt.created_at.desc())
        .limit(1)
    )
    last_debt = debt_result.scalar_one_or_none()
    if last_debt:
        debt_amount = last_debt.amount
        debt_updated_at = last_debt.created_at

    # ── Последние 5 транзакций ──
    tx_result = await db.execute(
        select(Transaction)
        .where(Transaction.customer_id == customer.id)
        .order_by(Transaction.created_at.desc())
        .limit(5)
    )
    transactions = [
        CustomerCabinetTransaction(
            id=t.id,
            type=t.type.value if hasattr(t.type, "value") else str(t.type),
            amount=t.amount,
            purchase_amount=t.purchase_amount,
            note=t.note,
            created_at=t.created_at,
        )
        for t in tx_result.scalars().all()
    ]

    return CustomerCabinetMe(
        customer_id=customer.id,
        full_name=customer.full_name,
        phone=customer.phone,
        qr_code=customer.qr_code,
        referral_code=customer.referral_code,
        birth_date=customer.birth_date,
        balance=account.balance if account else Decimal("0"),
        total_earned=total_earned,
        total_spent=account.total_spent if account else Decimal("0"),
        tier_name=tier.name if tier else "Bronze",
        tier_percent=tier.bonus_percent if tier else Decimal("3"),
        next_tier_name=next_tier_name,
        next_tier_remaining=next_remaining,
        tier_progress_percent=progress_percent,
        debt_amount=debt_amount,
        debt_updated_at=debt_updated_at,
        recent_transactions=transactions,
    )


@router.get("/transactions")
async def get_transactions(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    tx_type: str = Query(None, description="Фильтр: earn/spend/expire/referral/promo/campaign"),
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Полная история транзакций с пагинацией и фильтром по типу."""
    customer_id = current["sub"]

    query = select(Transaction).where(Transaction.customer_id == customer_id)
    if tx_type:
        try:
            query = query.where(Transaction.type == TransactionType(tx_type))
        except ValueError:
            pass

    total = (await db.execute(
        select(func.count()).select_from(query.subquery())
    )).scalar() or 0

    result = await db.execute(
        query.order_by(Transaction.created_at.desc())
        .offset((page - 1) * limit).limit(limit)
    )
    txns = result.scalars().all()

    return {
        "items": [
            {
                "id": str(t.id),
                "type": t.type.value,
                "amount": float(t.amount),
                "purchase_amount": float(t.purchase_amount) if t.purchase_amount else None,
                "note": t.note,
                "created_at": t.created_at.isoformat(),
            }
            for t in txns
        ],
        "total": total,
        "page": page,
        "limit": limit,
    }


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = None
    birth_date: date | None = None


@router.patch("/profile")
async def update_profile(
    body: ProfileUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Клиент обновляет своё имя и дату рождения."""
    customer_id = current["sub"]
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail={"message": "Клиент не найден"})

    if body.full_name is not None:
        customer.full_name = body.full_name
    if body.birth_date is not None:
        customer.birth_date = body.birth_date

    await db.commit()
    return {"message": "Профиль обновлён"}


class PromoApplyRequest(BaseModel):
    code: str


@router.post("/promo")
async def apply_promo_code(
    body: PromoApplyRequest,
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Клиент вводит промокод из кабинета."""
    from app.services.bonus import BonusService
    svc = BonusService(db)
    result = await svc.apply_promo(uuid.UUID(current["sub"]), body.code.strip().upper())
    await db.commit()
    return {
        "message": result.message_ru,
        "amount": float(result.amount),
        "new_balance": float(result.new_balance),
    }


class ReferralApplyRequest(BaseModel):
    code: str


@router.post("/referral")
async def apply_referral_code(
    body: ReferralApplyRequest,
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Клиент вводит реферальный код друга."""
    from app.services.bonus import BonusService
    svc = BonusService(db)
    result = await svc.apply_referral(uuid.UUID(current["sub"]), body.code.strip().upper())
    await db.commit()
    return {
        "message": result.message_ru,
        "amount": float(result.amount),
        "new_balance": float(result.new_balance),
    }


@router.get("/referral")
async def get_referral_info(
    db: AsyncSession = Depends(get_db),
    current: dict = Depends(get_current_customer),
) -> dict:
    """Информация о реферальной программе клиента."""
    customer_id = current["sub"]
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail={"message": "Клиент не найден"})

    # Количество приглашённых
    invited_count = (await db.execute(
        select(func.count()).select_from(Customer).where(Customer.referred_by == customer.id)
    )).scalar() or 0

    return {
        "referral_code": customer.referral_code,
        "invited_count": invited_count,
        "bonus_per_invite": float(Decimal("100")),
    }
