"""
Sbonus+ — API личного кабинета клиента.
GET /api/v1/customer/me — дашборд (баланс, уровень, задолженность, последние операции)
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_customer
from app.models import Customer, CustomerDebt, Tier, Transaction
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
