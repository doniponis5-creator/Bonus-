"""
Sbonus+ — Multi-branch Support API.

Filial bo'yicha statistika, kross-filial bonus, filial adminlari.

Endpoints:
  GET  /branches/              — Barcha filiallar ro'yxati
  GET  /branches/{id}/stats    — Filial statistikasi
  GET  /branches/compare       — Filiallarni solishtirish
  POST /branches/              — Yangi filial qo'shish (SUPER_ADMIN)
  PUT  /branches/{id}          — Filial tahrirlash
"""

import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role, UserRole
from app.models import Branch, Transaction, TransactionType, Customer, User

router = APIRouter(prefix="/branches", tags=["Filiallar"])


# ═══════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════

class BranchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool
    created_at: datetime


class BranchCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None


class BranchUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None


class BranchStats(BaseModel):
    branch_id: uuid.UUID
    branch_name: str
    period_days: int
    total_transactions: int
    total_revenue: float
    total_bonus_earned: float
    total_bonus_spent: float
    unique_customers: int
    avg_purchase: float
    cashier_count: int


class BranchComparison(BaseModel):
    branches: list[BranchStats]
    period_days: int
    best_revenue: Optional[str] = None
    best_customers: Optional[str] = None


# ═══════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════

@router.get("/", response_model=list[BranchOut])
async def list_branches(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(UserRole.BRANCH_ADMIN)),
):
    """Barcha filiallar ro'yxati."""
    result = await db.execute(
        select(Branch).order_by(Branch.name)
    )
    return result.scalars().all()


@router.post("/", response_model=BranchOut, status_code=201)
async def create_branch(
    data: BranchCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Yangi filial yaratish (faqat SUPER_ADMIN)."""
    # Dublikat tekshirish
    existing = await db.execute(
        select(Branch).where(Branch.name == data.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Bu nomda filial mavjud")

    branch = Branch(**data.model_dump())
    db.add(branch)
    await db.commit()
    await db.refresh(branch)
    return branch


@router.put("/{branch_id}", response_model=BranchOut)
async def update_branch(
    branch_id: uuid.UUID,
    data: BranchUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Filial tahrirlash."""
    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Filial topilmadi")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(branch, key, value)

    await db.commit()
    await db.refresh(branch)
    return branch


@router.get("/{branch_id}/stats", response_model=BranchStats)
async def branch_stats(
    branch_id: uuid.UUID,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(UserRole.BRANCH_ADMIN)),
):
    """Filial statistikasi."""
    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Filial topilmadi")

    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Transaction stats
    q = await db.execute(
        select(
            func.count(Transaction.id),
            func.coalesce(func.sum(Transaction.purchase_amount).filter(
                Transaction.type == TransactionType.EARN
            ), 0),
            func.coalesce(func.sum(Transaction.amount).filter(
                Transaction.type == TransactionType.EARN
            ), 0),
            func.coalesce(func.sum(Transaction.amount).filter(
                Transaction.type == TransactionType.SPEND
            ), 0),
            func.count(func.distinct(Transaction.customer_id)),
        ).where(
            Transaction.branch_id == branch_id,
            Transaction.created_at >= since,
        )
    )
    txn_count, revenue, earned, spent, unique_customers = q.one()

    # Avg purchase
    avg_q = await db.execute(
        select(func.coalesce(func.avg(Transaction.purchase_amount), 0)).where(
            Transaction.branch_id == branch_id,
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= since,
        )
    )
    avg_purchase = float(avg_q.scalar() or 0)

    # Cashier count
    cashier_count = (await db.execute(
        select(func.count(User.id)).where(
            User.branch_id == branch_id,
            User.is_active == True,
        )
    )).scalar() or 0

    return BranchStats(
        branch_id=branch_id,
        branch_name=branch.name,
        period_days=days,
        total_transactions=txn_count,
        total_revenue=float(revenue),
        total_bonus_earned=float(earned),
        total_bonus_spent=float(spent),
        unique_customers=unique_customers,
        avg_purchase=round(avg_purchase, 2),
        cashier_count=cashier_count,
    )


@router.get("/compare", response_model=BranchComparison)
async def compare_branches(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Barcha filiallarni solishtirish."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(Branch).where(Branch.is_active == True).order_by(Branch.name)
    )
    branches = result.scalars().all()

    stats_list = []
    for branch in branches:
        q = await db.execute(
            select(
                func.count(Transaction.id),
                func.coalesce(func.sum(Transaction.purchase_amount).filter(
                    Transaction.type == TransactionType.EARN
                ), 0),
                func.coalesce(func.sum(Transaction.amount).filter(
                    Transaction.type == TransactionType.EARN
                ), 0),
                func.coalesce(func.sum(Transaction.amount).filter(
                    Transaction.type == TransactionType.SPEND
                ), 0),
                func.count(func.distinct(Transaction.customer_id)),
            ).where(
                Transaction.branch_id == branch.id,
                Transaction.created_at >= since,
            )
        )
        txn_count, revenue, earned, spent, unique_customers = q.one()

        cashier_count = (await db.execute(
            select(func.count(User.id)).where(
                User.branch_id == branch.id, User.is_active == True,
            )
        )).scalar() or 0

        avg_q = await db.execute(
            select(func.coalesce(func.avg(Transaction.purchase_amount), 0)).where(
                Transaction.branch_id == branch.id,
                Transaction.type == TransactionType.EARN,
                Transaction.created_at >= since,
            )
        )

        stats_list.append(BranchStats(
            branch_id=branch.id,
            branch_name=branch.name,
            period_days=days,
            total_transactions=txn_count,
            total_revenue=float(revenue),
            total_bonus_earned=float(earned),
            total_bonus_spent=float(spent),
            unique_customers=unique_customers,
            avg_purchase=round(float(avg_q.scalar() or 0), 2),
            cashier_count=cashier_count,
        ))

    best_revenue = max(stats_list, key=lambda x: x.total_revenue).branch_name if stats_list else None
    best_customers = max(stats_list, key=lambda x: x.unique_customers).branch_name if stats_list else None

    return BranchComparison(
        branches=stats_list,
        period_days=days,
        best_revenue=best_revenue,
        best_customers=best_customers,
    )
