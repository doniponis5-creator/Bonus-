"""
Sbonus+ — Referral Leaderboard & Milestones API.

Reyting taxtasi + bosqichli mukofotlar.
Milestone rewards: 5 ta refer = 500 bonus, 10 = 1500, 20 = 3000, 50 = 10000.

GET  /api/v1/referral/leaderboard     — Top referrallar
GET  /api/v1/referral/my-stats        — Klient o'z referral statistikasi
GET  /api/v1/referral/milestones      — Milestone konfiguratsiyasi
POST /api/v1/referral/claim-milestone — Milestone mukofotni olish
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_customer
from app.models import (
    BonusAccount,
    Customer,
    Setting,
    Transaction,
    TransactionType,
)

router = APIRouter(prefix="/referral", tags=["Referral"])


# ─── Schemas ───

class LeaderboardEntry(BaseModel):
    rank: int
    customer_id: str
    full_name: str
    referral_count: int
    total_bonus_earned: float


class MyReferralStats(BaseModel):
    referral_count: int
    referral_code: str
    total_bonus_earned: float
    next_milestone: Optional[dict] = None
    claimed_milestones: list[int]
    rank: int


class MilestoneConfig(BaseModel):
    referrals_needed: int
    reward_amount: float
    title: str


# ─── Default milestones ───
DEFAULT_MILESTONES = [
    {"referrals_needed": 5,  "reward_amount": 100,  "title": "5 друзей"},
    {"referrals_needed": 10, "reward_amount": 250,  "title": "10 друзей"},
    {"referrals_needed": 20, "reward_amount": 600,  "title": "20 друзей"},
    {"referrals_needed": 50, "reward_amount": 1500, "title": "50 друзей"},
]


async def _get_milestones(db: AsyncSession) -> list[dict]:
    """DB Settings dan milestonlarni olish."""
    import json
    result = await db.execute(
        select(Setting).where(Setting.key == "REFERRAL_MILESTONES")
    )
    record = result.scalar_one_or_none()
    if record and record.value:
        try:
            return json.loads(record.value)
        except Exception:
            pass
    return DEFAULT_MILESTONES


async def _get_claimed_milestones(db: AsyncSession, customer_id: uuid.UUID) -> list[int]:
    """Klient qaysi milestonlarni olganini tekshirish."""
    import json
    key = f"REFERRAL_MILESTONES_CLAIMED_{customer_id}"
    result = await db.execute(select(Setting).where(Setting.key == key))
    record = result.scalar_one_or_none()
    if record and record.value:
        try:
            return json.loads(record.value)
        except Exception:
            pass
    return []


async def _get_referral_count(db: AsyncSession, customer_id: uuid.UUID) -> int:
    """Klient nechta odam taklif qilganini hisoblash."""
    count = (await db.execute(
        select(func.count(Customer.id)).where(
            Customer.referred_by == customer_id,
            Customer.is_active == True,
        )
    )).scalar() or 0
    return count


# ─── Endpoints ───

@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def get_leaderboard(
    limit: int = Query(20, ge=5, le=100),
    db: AsyncSession = Depends(get_db),
) -> list[LeaderboardEntry]:
    """
    Top referrallar reytingi.
    Public — barcha klientlar ko'ra oladi.
    """
    # Count referrals per customer
    referral_subq = (
        select(
            Customer.referred_by.label("inviter_id"),
            func.count(Customer.id).label("ref_count"),
        )
        .where(
            Customer.referred_by.isnot(None),
            Customer.is_active == True,
        )
        .group_by(Customer.referred_by)
        .subquery()
    )

    # Referral bonus sums
    bonus_subq = (
        select(
            Transaction.customer_id,
            func.coalesce(func.sum(Transaction.amount), 0).label("ref_bonus"),
        )
        .where(
            Transaction.note.like("%реферал%"),
            Transaction.type == TransactionType.PROMO,
        )
        .group_by(Transaction.customer_id)
        .subquery()
    )

    query = (
        select(
            Customer.id,
            Customer.full_name,
            referral_subq.c.ref_count,
            func.coalesce(bonus_subq.c.ref_bonus, 0).label("ref_bonus"),
        )
        .join(referral_subq, referral_subq.c.inviter_id == Customer.id)
        .outerjoin(bonus_subq, bonus_subq.c.customer_id == Customer.id)
        .where(Customer.is_active == True)
        .order_by(referral_subq.c.ref_count.desc())
        .limit(limit)
    )

    result = await db.execute(query)
    rows = result.all()

    return [
        LeaderboardEntry(
            rank=i + 1,
            customer_id=str(r.id),
            full_name=r.full_name,
            referral_count=r.ref_count,
            total_bonus_earned=float(r.ref_bonus),
        )
        for i, r in enumerate(rows)
    ]


@router.get("/my-stats", response_model=MyReferralStats)
async def get_my_stats(
    db: AsyncSession = Depends(get_db),
    current_customer: dict = Depends(get_current_customer),
) -> MyReferralStats:
    """Klient o'z referral statistikasini ko'rish."""
    customer_id = uuid.UUID(current_customer["sub"])

    # Klient ma'lumotlari
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND"})

    ref_count = await _get_referral_count(db, customer_id)
    claimed = await _get_claimed_milestones(db, customer_id)
    milestones = await _get_milestones(db)

    # Referral bonus sum
    ref_bonus = (await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.customer_id == customer_id,
            Transaction.note.like("%реферал%"),
            Transaction.type == TransactionType.PROMO,
        )
    )).scalar() or 0

    # Next milestone
    next_ms = None
    for ms in milestones:
        if ms["referrals_needed"] not in claimed and ref_count < ms["referrals_needed"]:
            next_ms = ms
            break

    # Rank
    rank_result = (await db.execute(
        select(func.count(Customer.id)).where(
            Customer.referred_by.isnot(None),
            Customer.is_active == True,
        ).group_by(Customer.referred_by).having(
            func.count(Customer.id) > ref_count
        )
    )).all()
    rank = len(rank_result) + 1

    return MyReferralStats(
        referral_count=ref_count,
        referral_code=customer.referral_code,
        total_bonus_earned=float(ref_bonus),
        next_milestone=next_ms,
        claimed_milestones=claimed,
        rank=rank,
    )


@router.get("/milestones", response_model=list[MilestoneConfig])
async def get_milestones(
    db: AsyncSession = Depends(get_db),
) -> list[MilestoneConfig]:
    """Milestone konfiguratsiyasi (public)."""
    ms = await _get_milestones(db)
    return [MilestoneConfig(**m) for m in ms]


@router.post("/claim-milestone")
async def claim_milestone(
    milestone_referrals: int,
    db: AsyncSession = Depends(get_db),
    current_customer: dict = Depends(get_current_customer),
) -> dict:
    """
    Milestone mukofotni olish.
    Klient yetarli referral to'plagan bo'lsa, bonus oladi.
    """
    import json
    customer_id = uuid.UUID(current_customer["sub"])

    # Milestone tekshirish
    milestones = await _get_milestones(db)
    target_ms = None
    for ms in milestones:
        if ms["referrals_needed"] == milestone_referrals:
            target_ms = ms
            break

    if not target_ms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_MILESTONE", "message": "Bunday milestone topilmadi"},
        )

    # Allaqachon olganni tekshirish
    claimed = await _get_claimed_milestones(db, customer_id)
    if milestone_referrals in claimed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "ALREADY_CLAIMED", "message": "Bu mukofotni allaqachon oldingiz"},
        )

    # Yetarli referral bormi?
    ref_count = await _get_referral_count(db, customer_id)
    if ref_count < milestone_referrals:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "NOT_ENOUGH_REFERRALS",
                "message": f"{milestone_referrals} ta taklif kerak, sizda {ref_count} ta bor",
            },
        )

    # Bonus berish
    reward = Decimal(str(target_ms["reward_amount"]))

    result = await db.execute(
        select(BonusAccount)
        .where(BonusAccount.customer_id == customer_id)
        .with_for_update()
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail={"code": "ACCOUNT_NOT_FOUND"})

    account.balance += reward
    account.total_earned += reward

    # Tranzaksiya
    db.add(Transaction(
        customer_id=customer_id,
        type=TransactionType.PROMO,
        amount=reward,
        note=f"Referral milestone: {target_ms['title']} ({milestone_referrals} ta taklif)",
    ))

    # Claimed saqlash
    claimed.append(milestone_referrals)
    claim_key = f"REFERRAL_MILESTONES_CLAIMED_{customer_id}"
    claim_result = await db.execute(select(Setting).where(Setting.key == claim_key))
    claim_record = claim_result.scalar_one_or_none()
    if claim_record:
        claim_record.value = json.dumps(claimed)
    else:
        db.add(Setting(key=claim_key, value=json.dumps(claimed)))

    await db.commit()

    return {
        "status": "ok",
        "message": f"Tabriklaymiz! +{reward:,.0f} KGS milestone mukofoti olindi!",
        "reward_amount": float(reward),
        "new_balance": float(account.balance),
    }


# ═══════════════════════════════════════════
# ADMIN Referral Analytics
# ═══════════════════════════════════════════

from app.core.security import UserRole, require_role


@router.get("/admin/leaderboard")
async def admin_referral_leaderboard(
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Admin: полный реферальный лидерборд с деталями."""
    # Count referrals per customer
    ref_counts = (
        select(
            Customer.referred_by.label("referrer_id"),
            func.count(Customer.id).label("ref_count"),
        )
        .where(Customer.referred_by.isnot(None))
        .group_by(Customer.referred_by)
    ).subquery()

    # Total referral bonus earned
    ref_bonus = (
        select(
            Transaction.customer_id,
            func.sum(Transaction.amount).label("ref_bonus"),
        )
        .where(Transaction.type == TransactionType.REFERRAL)
        .group_by(Transaction.customer_id)
    ).subquery()

    result = await db.execute(
        select(
            Customer.id,
            Customer.full_name,
            Customer.phone,
            Customer.referral_code,
            Customer.created_at,
            ref_counts.c.ref_count,
            ref_bonus.c.ref_bonus,
        )
        .outerjoin(ref_counts, Customer.id == ref_counts.c.referrer_id)
        .outerjoin(ref_bonus, Customer.id == ref_bonus.c.customer_id)
        .where(ref_counts.c.ref_count > 0)
        .order_by(ref_counts.c.ref_count.desc())
        .limit(limit)
    )

    entries = []
    for i, r in enumerate(result.all(), 1):
        entries.append({
            "rank": i,
            "customer_id": str(r.id),
            "full_name": r.full_name,
            "phone": r.phone,
            "referral_code": r.referral_code,
            "referral_count": r.ref_count or 0,
            "bonus_earned": float(r.ref_bonus or 0),
            "registered": r.created_at.isoformat(),
        })

    # Total stats
    total_referrals = sum(e["referral_count"] for e in entries)
    total_bonus = sum(e["bonus_earned"] for e in entries)

    return {
        "leaderboard": entries,
        "total_referrers": len(entries),
        "total_referrals": total_referrals,
        "total_bonus_paid": total_bonus,
    }


@router.get("/admin/tree/{customer_id}")
async def admin_referral_tree(
    customer_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Admin: дерево рефералов клиента (2 уровня)."""
    # Get the referrer
    cust_result = await db.execute(
        select(Customer).where(Customer.id == customer_id)
    )
    customer = cust_result.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    # Level 1: direct referrals
    level1_result = await db.execute(
        select(Customer.id, Customer.full_name, Customer.phone, Customer.created_at)
        .where(Customer.referred_by == customer_id)
        .order_by(Customer.created_at.desc())
    )

    tree = []
    for r1 in level1_result.all():
        # Level 2: referrals of referrals
        level2_result = await db.execute(
            select(Customer.id, Customer.full_name, Customer.phone, Customer.created_at)
            .where(Customer.referred_by == r1.id)
            .order_by(Customer.created_at.desc())
            .limit(10)
        )
        children = [
            {"id": str(r2.id), "name": r2.full_name, "phone": r2.phone, "joined": r2.created_at.isoformat()}
            for r2 in level2_result.all()
        ]

        tree.append({
            "id": str(r1.id),
            "name": r1.full_name,
            "phone": r1.phone,
            "joined": r1.created_at.isoformat(),
            "referrals": children,
        })

    return {
        "root": {
            "id": str(customer.id),
            "name": customer.full_name,
            "phone": customer.phone,
            "referral_code": customer.referral_code,
        },
        "tree": tree,
        "total_level1": len(tree),
        "total_level2": sum(len(n["referrals"]) for n in tree),
    }


@router.get("/admin/stats")
async def admin_referral_stats(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Admin: общая статистика реферальной программы."""
    now = datetime.now(timezone.utc)

    # Total referrals
    total_ref = await db.execute(
        select(func.count(Customer.id)).where(Customer.referred_by.isnot(None))
    )
    total = total_ref.scalar() or 0

    # This month
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_ref = await db.execute(
        select(func.count(Customer.id)).where(
            and_(
                Customer.referred_by.isnot(None),
                Customer.created_at >= month_start,
            )
        )
    )
    this_month = month_ref.scalar() or 0

    # Total bonus paid
    bonus_result = await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.type == TransactionType.REFERRAL
        )
    )
    total_bonus = float(bonus_result.scalar() or 0)

    # Top referrer
    top_result = await db.execute(
        select(
            Customer.referred_by,
            func.count(Customer.id).label("cnt"),
        )
        .where(Customer.referred_by.isnot(None))
        .group_by(Customer.referred_by)
        .order_by(func.count(Customer.id).desc())
        .limit(1)
    )
    top_row = top_result.first()
    top_referrer = None
    if top_row:
        tr = await db.execute(select(Customer).where(Customer.id == top_row.referred_by))
        tc = tr.scalar_one_or_none()
        if tc:
            top_referrer = {"name": tc.full_name, "count": top_row.cnt}

    # Milestones claimed
    claimed_result = await db.execute(
        select(func.count(Transaction.id)).where(
            and_(
                Transaction.type == TransactionType.REFERRAL,
                Transaction.note.like("%milestone%"),
            )
        )
    )
    milestones_claimed = claimed_result.scalar() or 0

    return {
        "total_referrals": total,
        "this_month": this_month,
        "total_bonus_paid": total_bonus,
        "top_referrer": top_referrer,
        "milestones_claimed": milestones_claimed,
    }
