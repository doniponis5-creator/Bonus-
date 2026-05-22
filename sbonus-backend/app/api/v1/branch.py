"""
Sbonus+ — Multi-branch API.
Filiallar bo'yicha statistika, filial admin, cross-branch bonus.
"""

import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role, UserRole
from app.models import (
    Branch, Transaction, TransactionType, Customer, BonusAccount,
    User, UserRoleEnum,
)

router = APIRouter(prefix="/branches", tags=["branches"])


# ─── Schemas ───

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

class BranchResponse(BaseModel):
    id: str
    name: str
    address: Optional[str]
    city: Optional[str]
    phone: Optional[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class BranchStatsResponse(BaseModel):
    branch_id: str
    branch_name: str
    total_transactions: int
    total_revenue: float
    total_bonus_earned: float
    total_bonus_spent: float
    unique_customers: int
    avg_purchase: float
    period_days: int

class BranchComparisonResponse(BaseModel):
    branches: list[BranchStatsResponse]
    period_days: int
    best_revenue_branch: Optional[str]
    best_customers_branch: Optional[str]

class BranchCashierResponse(BaseModel):
    cashier_id: str
    full_name: str
    phone: str
    transactions_count: int
    total_revenue: float
    total_bonus: float
    is_active: bool


# ─── Helpers ───

def _require_admin(user: dict):
    role = user.get("role", "")
    if role not in (UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN, "super_admin", "branch_admin"):
        raise HTTPException(status_code=403, detail="Faqat admin uchun")

def _require_super_admin(user: dict):
    role = user.get("role", "")
    if role not in (UserRole.SUPER_ADMIN, "super_admin"):
        raise HTTPException(status_code=403, detail="Faqat super admin uchun")

def _require_branch_access(user: dict, branch_id: uuid.UUID):
    """Branch admin faqat o'z filialiga kirishi mumkin."""
    role = user.get("role", "")
    if role in (UserRole.SUPER_ADMIN, "super_admin"):
        return
    if role in (UserRole.BRANCH_ADMIN, "branch_admin") and str(user.get("branch_id", "")) == str(branch_id):
        return
    raise HTTPException(status_code=403, detail="Bu filialga ruxsat yo'q")


# ─── CRUD ───

@router.get("", response_model=list[BranchResponse])
async def list_branches(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Barcha filiallar ro'yxati."""
    _require_admin(user)
    if user.get("role") in (UserRole.BRANCH_ADMIN, "branch_admin"):
        result = await db.execute(select(Branch).where(Branch.id == uuid.UUID(str(user.get("branch_id")))))
    else:
        result = await db.execute(select(Branch).order_by(Branch.name))
    branches = result.scalars().all()
    return [BranchResponse(
        id=str(b.id), name=b.name, address=b.address,
        city=b.city, phone=b.phone, is_active=b.is_active,
        created_at=b.created_at,
    ) for b in branches]


@router.post("", response_model=BranchResponse, status_code=201)
async def create_branch(
    data: BranchCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Yangi filial qo'shish (super admin only)."""
    _require_super_admin(user)
    branch = Branch(name=data.name, address=data.address, city=data.city, phone=data.phone)
    db.add(branch)
    await db.flush()
    await db.commit()
    return BranchResponse(
        id=str(branch.id), name=branch.name, address=branch.address,
        city=branch.city, phone=branch.phone, is_active=branch.is_active,
        created_at=branch.created_at,
    )


@router.put("/{branch_id}", response_model=BranchResponse)
async def update_branch(
    branch_id: uuid.UUID,
    data: BranchUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Filial ma'lumotlarini yangilash."""
    _require_super_admin(user)
    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Filial topilmadi")
    if data.name is not None:
        branch.name = data.name
    if data.address is not None:
        branch.address = data.address
    if data.city is not None:
        branch.city = data.city
    if data.phone is not None:
        branch.phone = data.phone
    if data.is_active is not None:
        branch.is_active = data.is_active
    await db.commit()
    return BranchResponse(
        id=str(branch.id), name=branch.name, address=branch.address,
        city=branch.city, phone=branch.phone, is_active=branch.is_active,
        created_at=branch.created_at,
    )


# ─── Branch Stats ───

@router.get("/{branch_id}/stats", response_model=BranchStatsResponse)
async def get_branch_stats(
    branch_id: uuid.UUID,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Filial bo'yicha statistika."""
    _require_admin(user)
    _require_branch_access(user, branch_id)

    result = await db.execute(select(Branch).where(Branch.id == branch_id))
    branch = result.scalar_one_or_none()
    if not branch:
        raise HTTPException(status_code=404, detail="Filial topilmadi")

    since = datetime.now(timezone.utc) - timedelta(days=days)

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
    total_txn, revenue, bonus_earned, bonus_spent, unique_cust = q.one()

    avg_purchase = float(revenue) / max(total_txn, 1)

    return BranchStatsResponse(
        branch_id=str(branch_id),
        branch_name=branch.name,
        total_transactions=total_txn,
        total_revenue=float(revenue),
        total_bonus_earned=float(bonus_earned),
        total_bonus_spent=float(bonus_spent),
        unique_customers=unique_cust,
        avg_purchase=round(avg_purchase, 2),
        period_days=days,
    )


@router.get("/compare/all", response_model=BranchComparisonResponse)
async def compare_branches(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Barcha filiallarni solishtirish."""
    _require_super_admin(user)

    since = datetime.now(timezone.utc) - timedelta(days=days)
    branches_result = await db.execute(select(Branch).where(Branch.is_active == True))
    branches = branches_result.scalars().all()

    stats_list = []
    best_revenue = (None, 0.0)
    best_customers = (None, 0)

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
        total_txn, revenue, bonus_earned, bonus_spent, unique_cust = q.one()
        avg_purchase = float(revenue) / max(total_txn, 1)

        stat = BranchStatsResponse(
            branch_id=str(branch.id),
            branch_name=branch.name,
            total_transactions=total_txn,
            total_revenue=float(revenue),
            total_bonus_earned=float(bonus_earned),
            total_bonus_spent=float(bonus_spent),
            unique_customers=unique_cust,
            avg_purchase=round(avg_purchase, 2),
            period_days=days,
        )
        stats_list.append(stat)

        if float(revenue) > best_revenue[1]:
            best_revenue = (branch.name, float(revenue))
        if unique_cust > best_customers[1]:
            best_customers = (branch.name, unique_cust)

    return BranchComparisonResponse(
        branches=stats_list,
        period_days=days,
        best_revenue_branch=best_revenue[0],
        best_customers_branch=best_customers[0],
    )


# ─── Branch Cashiers ───

@router.get("/{branch_id}/cashiers", response_model=list[BranchCashierResponse])
async def get_branch_cashiers(
    branch_id: uuid.UUID,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Filial kassirlari va ularning statistikasi."""
    _require_admin(user)
    _require_branch_access(user, branch_id)

    since = datetime.now(timezone.utc) - timedelta(days=days)

    cashiers_result = await db.execute(
        select(User).where(
            User.branch_id == branch_id,
            User.role == UserRoleEnum.CASHIER,
        )
    )
    cashiers = cashiers_result.scalars().all()

    result_list = []
    for cashier in cashiers:
        q = await db.execute(
            select(
                func.count(Transaction.id),
                func.coalesce(func.sum(Transaction.purchase_amount).filter(
                    Transaction.type == TransactionType.EARN
                ), 0),
                func.coalesce(func.sum(Transaction.amount).filter(
                    Transaction.type == TransactionType.EARN
                ), 0),
            ).where(
                Transaction.cashier_id == cashier.id,
                Transaction.created_at >= since,
            )
        )
        txn_count, revenue, bonus = q.one()

        result_list.append(BranchCashierResponse(
            cashier_id=str(cashier.id),
            full_name=cashier.full_name,
            phone=cashier.phone,
            transactions_count=txn_count,
            total_revenue=float(revenue),
            total_bonus=float(bonus),
            is_active=cashier.is_active,
        ))

    result_list.sort(key=lambda x: x.total_revenue, reverse=True)
    return result_list


# ─── Top Customers per Branch ───

@router.get("/{branch_id}/top-customers")
async def get_branch_top_customers(
    branch_id: uuid.UUID,
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Filialning eng yaxshi klientlari."""
    _require_admin(user)
    _require_branch_access(user, branch_id)

    since = datetime.now(timezone.utc) - timedelta(days=days)

    q = await db.execute(
        select(
            Customer.id,
            Customer.full_name,
            Customer.phone,
            func.sum(Transaction.purchase_amount).label("total_purchases"),
            func.sum(Transaction.amount).label("total_bonus"),
            func.count(Transaction.id).label("visit_count"),
        )
        .join(Transaction, Transaction.customer_id == Customer.id)
        .where(
            Transaction.branch_id == branch_id,
            Transaction.type == TransactionType.EARN,
            Transaction.created_at >= since,
        )
        .group_by(Customer.id, Customer.full_name, Customer.phone)
        .order_by(func.sum(Transaction.purchase_amount).desc())
        .limit(limit)
    )
    rows = q.all()

    return [
        {
            "customer_id": str(r.id),
            "full_name": r.full_name,
            "phone": r.phone,
            "total_purchases": float(r.total_purchases),
            "total_bonus": float(r.total_bonus),
            "visit_count": r.visit_count,
        }
        for r in rows
    ]
