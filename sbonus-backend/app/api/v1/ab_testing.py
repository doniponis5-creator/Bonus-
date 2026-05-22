"""
Sbonus+ — A/B Testing for Campaigns.
Kampaniya xabarlari uchun A/B test — ikki variant, qaysi biri yaxshiroq ishlashini kuzatish.

Har bir kampaniyaga 2 ta xabar varianti (A va B) beriladi.
Klientlar 50/50 bo'linadi.
Natijalar: qaysi variant ko'proq bonus ishlatilishiga olib keldi.
"""

import json
import random
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role, UserRole
from app.models import Setting, User, UserRoleEnum, Transaction, TransactionType

router = APIRouter(prefix="/ab-testing", tags=["ab-testing"])


# ─── Schemas ───

class ABTestCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    campaign_id: Optional[str] = None
    variant_a_message: str = Field(..., min_length=5)
    variant_b_message: str = Field(..., min_length=5)
    description: Optional[str] = None

class ABTestResponse(BaseModel):
    id: str
    name: str
    campaign_id: Optional[str]
    variant_a_message: str
    variant_b_message: str
    description: Optional[str]
    status: str  # active, completed, cancelled
    created_at: str
    # Metrics
    variant_a_sent: int
    variant_b_sent: int
    variant_a_conversions: int
    variant_b_conversions: int
    variant_a_rate: float
    variant_b_rate: float
    winner: Optional[str]  # "A", "B", or None

class ABTestAssignment(BaseModel):
    test_id: str
    customer_id: str
    variant: str  # "A" or "B"
    message: str


# ─── Setting key pattern ───

def _test_key(test_id: str) -> str:
    return f"AB_TEST_{test_id}"

def _assignment_key(test_id: str) -> str:
    return f"AB_ASSIGN_{test_id}"

def _conversion_key(test_id: str) -> str:
    return f"AB_CONV_{test_id}"


# ─── Helpers ───



async def _get_test(db: AsyncSession, test_id: str) -> dict:
    result = await db.execute(select(Setting).where(Setting.key == _test_key(test_id)))
    row = result.scalar_one_or_none()
    if not row or not row.value:
        raise HTTPException(status_code=404, detail="A/B test topilmadi")
    return json.loads(row.value)


# ─── Endpoints ───

@router.post("", response_model=ABTestResponse, status_code=201, dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def create_ab_test(
    data: ABTestCreate,
    db: AsyncSession = Depends(get_db),
):
    """Yangi A/B test yaratish."""

    test_id = uuid.uuid4().hex[:12]
    test_data = {
        "id": test_id,
        "name": data.name,
        "campaign_id": data.campaign_id,
        "variant_a_message": data.variant_a_message,
        "variant_b_message": data.variant_b_message,
        "description": data.description,
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    db.add(Setting(key=_test_key(test_id), value=json.dumps(test_data)))
    db.add(Setting(key=_assignment_key(test_id), value=json.dumps({"A": [], "B": []})))
    db.add(Setting(key=_conversion_key(test_id), value=json.dumps({"A": 0, "B": 0})))
    await db.commit()

    return ABTestResponse(
        id=test_id, name=data.name, campaign_id=data.campaign_id,
        variant_a_message=data.variant_a_message,
        variant_b_message=data.variant_b_message,
        description=data.description, status="active",
        created_at=test_data["created_at"],
        variant_a_sent=0, variant_b_sent=0,
        variant_a_conversions=0, variant_b_conversions=0,
        variant_a_rate=0.0, variant_b_rate=0.0, winner=None,
    )


@router.get("", response_model=list[ABTestResponse], dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def list_ab_tests(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
):
    """Barcha A/B testlar ro'yxati."""

    result = await db.execute(
        select(Setting).where(Setting.key.like("AB_TEST_%"))
    )
    rows = result.scalars().all()

    tests = []
    for row in rows:
        try:
            test = json.loads(row.value)
        except Exception:
            continue
        if status_filter and test.get("status") != status_filter:
            continue

        test_id = test["id"]

        # Get assignments
        assign_row = await db.execute(select(Setting).where(Setting.key == _assignment_key(test_id)))
        assign = assign_row.scalar_one_or_none()
        assignments = json.loads(assign.value) if assign and assign.value else {"A": [], "B": []}

        # Get conversions
        conv_row = await db.execute(select(Setting).where(Setting.key == _conversion_key(test_id)))
        conv = conv_row.scalar_one_or_none()
        conversions = json.loads(conv.value) if conv and conv.value else {"A": 0, "B": 0}

        a_sent = len(assignments.get("A", []))
        b_sent = len(assignments.get("B", []))
        a_conv = conversions.get("A", 0)
        b_conv = conversions.get("B", 0)
        a_rate = round(a_conv / max(a_sent, 1) * 100, 1)
        b_rate = round(b_conv / max(b_sent, 1) * 100, 1)

        winner = None
        if test.get("status") == "completed":
            if a_rate > b_rate:
                winner = "A"
            elif b_rate > a_rate:
                winner = "B"

        tests.append(ABTestResponse(
            id=test_id, name=test["name"],
            campaign_id=test.get("campaign_id"),
            variant_a_message=test["variant_a_message"],
            variant_b_message=test["variant_b_message"],
            description=test.get("description"),
            status=test.get("status", "active"),
            created_at=test["created_at"],
            variant_a_sent=a_sent, variant_b_sent=b_sent,
            variant_a_conversions=a_conv, variant_b_conversions=b_conv,
            variant_a_rate=a_rate, variant_b_rate=b_rate, winner=winner,
        ))

    return tests


@router.get("/{test_id}", response_model=ABTestResponse, dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def get_ab_test(
    test_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Bitta A/B test tafsilotlari."""
    test = await _get_test(db, test_id)

    assign_row = await db.execute(select(Setting).where(Setting.key == _assignment_key(test_id)))
    assign = assign_row.scalar_one_or_none()
    assignments = json.loads(assign.value) if assign and assign.value else {"A": [], "B": []}

    conv_row = await db.execute(select(Setting).where(Setting.key == _conversion_key(test_id)))
    conv = conv_row.scalar_one_or_none()
    conversions = json.loads(conv.value) if conv and conv.value else {"A": 0, "B": 0}

    a_sent = len(assignments.get("A", []))
    b_sent = len(assignments.get("B", []))
    a_conv = conversions.get("A", 0)
    b_conv = conversions.get("B", 0)
    a_rate = round(a_conv / max(a_sent, 1) * 100, 1)
    b_rate = round(b_conv / max(b_sent, 1) * 100, 1)

    winner = None
    if test.get("status") == "completed":
        if a_rate > b_rate:
            winner = "A"
        elif b_rate > a_rate:
            winner = "B"

    return ABTestResponse(
        id=test_id, name=test["name"],
        campaign_id=test.get("campaign_id"),
        variant_a_message=test["variant_a_message"],
        variant_b_message=test["variant_b_message"],
        description=test.get("description"),
        status=test.get("status", "active"),
        created_at=test["created_at"],
        variant_a_sent=a_sent, variant_b_sent=b_sent,
        variant_a_conversions=a_conv, variant_b_conversions=b_conv,
        variant_a_rate=a_rate, variant_b_rate=b_rate, winner=winner,
    )


@router.post("/{test_id}/assign", response_model=ABTestAssignment, dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def assign_customer(
    test_id: str,
    customer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Klientni A yoki B variantga tayinlash (50/50)."""
    test = await _get_test(db, test_id)
    if test.get("status") != "active":
        raise HTTPException(status_code=400, detail="Test aktiv emas")

    assign_row = await db.execute(select(Setting).where(Setting.key == _assignment_key(test_id)))
    assign = assign_row.scalar_one_or_none()
    assignments = json.loads(assign.value) if assign and assign.value else {"A": [], "B": []}

    # Check if already assigned
    if customer_id in assignments.get("A", []):
        return ABTestAssignment(
            test_id=test_id, customer_id=customer_id,
            variant="A", message=test["variant_a_message"],
        )
    if customer_id in assignments.get("B", []):
        return ABTestAssignment(
            test_id=test_id, customer_id=customer_id,
            variant="B", message=test["variant_b_message"],
        )

    # Assign 50/50
    a_count = len(assignments.get("A", []))
    b_count = len(assignments.get("B", []))

    if a_count <= b_count:
        variant = "A"
    else:
        variant = "B"

    assignments.setdefault(variant, []).append(customer_id)
    assign.value = json.dumps(assignments)
    await db.commit()

    message = test["variant_a_message"] if variant == "A" else test["variant_b_message"]

    return ABTestAssignment(
        test_id=test_id, customer_id=customer_id,
        variant=variant, message=message,
    )


@router.post("/{test_id}/convert", dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def record_conversion(
    test_id: str,
    customer_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Konversiya qayd qilish (klient xabar olgandan so'ng sotib oldi)."""

    assign_row = await db.execute(select(Setting).where(Setting.key == _assignment_key(test_id)))
    assign = assign_row.scalar_one_or_none()
    if not assign or not assign.value:
        raise HTTPException(status_code=404, detail="Assignment topilmadi")

    assignments = json.loads(assign.value)

    variant = None
    if customer_id in assignments.get("A", []):
        variant = "A"
    elif customer_id in assignments.get("B", []):
        variant = "B"

    if not variant:
        raise HTTPException(status_code=400, detail="Klient bu testga tayinlanmagan")

    conv_row = await db.execute(select(Setting).where(Setting.key == _conversion_key(test_id)))
    conv = conv_row.scalar_one_or_none()
    conversions = json.loads(conv.value) if conv and conv.value else {"A": 0, "B": 0}

    conversions[variant] = conversions.get(variant, 0) + 1
    conv.value = json.dumps(conversions)
    await db.commit()

    return {"status": "ok", "variant": variant, "total_conversions": conversions[variant]}


@router.put("/{test_id}/complete", dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def complete_test(
    test_id: str,
    db: AsyncSession = Depends(get_db),
):
    """A/B testni yakunlash va g'olibni aniqlash."""

    row = await db.execute(select(Setting).where(Setting.key == _test_key(test_id)))
    setting = row.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="Test topilmadi")

    test = json.loads(setting.value)
    test["status"] = "completed"
    test["completed_at"] = datetime.now(timezone.utc).isoformat()
    setting.value = json.dumps(test)
    await db.commit()

    return {"status": "completed", "test_id": test_id}


@router.delete("/{test_id}", dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def cancel_test(
    test_id: str,
    db: AsyncSession = Depends(get_db),
):
    """A/B testni bekor qilish."""

    row = await db.execute(select(Setting).where(Setting.key == _test_key(test_id)))
    setting = row.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="Test topilmadi")

    test = json.loads(setting.value)
    test["status"] = "cancelled"
    setting.value = json.dumps(test)
    await db.commit()

    return {"status": "cancelled", "test_id": test_id}
