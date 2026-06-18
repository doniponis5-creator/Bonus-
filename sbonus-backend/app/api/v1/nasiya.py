"""
NASIYA DAFTAR — admin API.
Yangi fayl sifatida saqlang: app/api/v1/nasiya.py

Marshrut prefiksi: /api/v1/admin/nasiya
Faqat admin (SUPER_ADMIN). 1C / customer_debts / contracts — tegmaymiz.

⚠️ IMPORTLARNI TEKSHIRING (loyihangizdagi nomlar bilan moslang):
  - get_db          -> DB sessiya dependency (sizda get_session bo'lsa, almashtiring)
  - get_current_user, require_role, UserRole  -> auth (CLAUDE.md: dict qaytaradi)
  - Setting, NasiyaDebt, NasiyaPayment         -> app.models
"""
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db                     # ⚠️ moslang agar kerak bo'lsa
from app.core.security import get_current_user, require_role  # ⚠️ moslang
from app.core.security import UserRole
from app.models import NasiyaDebt, NasiyaPayment

# Nasiya eslatma matnlari/yordamchilari — bitta manbadan (cron fayli):
from app.tasks.nasiya_reminders import send_debtor_reminder

router = APIRouter(
    prefix="/admin/nasiya",
    tags=["nasiya"],
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],  # faqat egasi
)


# ─────────────────────────── helpers ───────────────────────────
def _q2(value) -> Decimal:
    """Decimal -> 2 kasrli som."""
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _normalize_phone(raw: str) -> str:
    """+996XXXXXXXXX formatiga keltirish."""
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if digits.startswith("996"):
        pass
    elif digits.startswith("0"):
        digits = "996" + digits[1:]
    elif len(digits) == 9:
        digits = "996" + digits
    return "+" + digits if digits else ""


def _uid(user: dict) -> Optional[uuid.UUID]:
    raw = user.get("sub") if user else None
    try:
        return uuid.UUID(str(raw)) if raw else None
    except (ValueError, TypeError):
        return None


def _serialize(d: NasiyaDebt, today: date) -> dict:
    remaining = d.remaining
    eff_status = d.status
    if d.status == "active" and d.due_date and d.due_date < today:
        eff_status = "overdue"
    days_left = (d.due_date - today).days if d.due_date else None
    return {
        "id": str(d.id),
        "debtor_name": d.debtor_name,
        "debtor_phone": d.debtor_phone,
        "principal_amount": float(d.principal_amount or 0),
        "paid_amount": float(d.paid_amount or 0),
        "remaining": float(remaining),
        "lent_date": d.lent_date.isoformat() if d.lent_date else None,
        "due_date": d.due_date.isoformat() if d.due_date else None,
        "status": eff_status,                       # active | overdue | paid
        "days_left": days_left,                     # manfiy = kechikkan kun
        "note": d.note,
        "last_reminder_at": d.last_reminder_at.isoformat() if d.last_reminder_at else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


def _serialize_payment(p: NasiyaPayment) -> dict:
    return {
        "id": str(p.id),
        "amount": float(p.amount or 0),
        "paid_at": p.paid_at.isoformat() if p.paid_at else None,
        "note": p.note,
    }


# ─────────────────────────── schemas ───────────────────────────
class DebtCreate(BaseModel):
    debtor_name: str = Field(..., min_length=1, max_length=255)
    debtor_phone: str = Field(..., min_length=4, max_length=20)
    principal_amount: Decimal = Field(..., gt=0)
    due_date: date
    lent_date: Optional[date] = None
    note: Optional[str] = None

    @field_validator("debtor_name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Ism bo'sh bo'lishi mumkin emas")
        return v


class DebtUpdate(BaseModel):
    debtor_name: Optional[str] = Field(None, min_length=1, max_length=255)
    debtor_phone: Optional[str] = Field(None, min_length=4, max_length=20)
    principal_amount: Optional[Decimal] = Field(None, gt=0)
    due_date: Optional[date] = None
    lent_date: Optional[date] = None
    note: Optional[str] = None


class PaymentCreate(BaseModel):
    amount: Decimal = Field(..., gt=0)
    paid_at: Optional[datetime] = None
    note: Optional[str] = None


# ─────────────────────────── endpoints ───────────────────────────
@router.get("")
async def list_debts(
    status: str = Query("active", pattern="^(active|paid|overdue|all)$"),
    q: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    conds = []
    if status == "active":
        conds.append(NasiyaDebt.status == "active")
    elif status == "paid":
        conds.append(NasiyaDebt.status == "paid")
    elif status == "overdue":
        conds.append(NasiyaDebt.status == "active")
        conds.append(NasiyaDebt.due_date < today)
    if q:
        like = f"%{q.strip()}%"
        conds.append(or_(NasiyaDebt.debtor_name.ilike(like), NasiyaDebt.debtor_phone.ilike(like)))

    stmt = select(NasiyaDebt)
    if conds:
        stmt = stmt.where(*conds)
    stmt = stmt.order_by(NasiyaDebt.due_date.asc()).limit(limit).offset(offset)

    rows = (await db.execute(stmt)).scalars().all()

    count_stmt = select(func.count(NasiyaDebt.id))
    if conds:
        count_stmt = count_stmt.where(*conds)
    total = (await db.execute(count_stmt)).scalar() or 0

    return {"items": [_serialize(d, today) for d in rows], "total": int(total)}


@router.get("/summary")
async def summary(db: AsyncSession = Depends(get_db)):
    today = date.today()
    remaining_expr = NasiyaDebt.principal_amount - NasiyaDebt.paid_amount

    outstanding = (await db.execute(
        select(func.coalesce(func.sum(remaining_expr), 0)).where(NasiyaDebt.status == "active")
    )).scalar() or 0

    active_count = (await db.execute(
        select(func.count(NasiyaDebt.id)).where(NasiyaDebt.status == "active")
    )).scalar() or 0

    overdue_count = (await db.execute(
        select(func.count(NasiyaDebt.id)).where(
            NasiyaDebt.status == "active", NasiyaDebt.due_date < today
        )
    )).scalar() or 0

    overdue_amount = (await db.execute(
        select(func.coalesce(func.sum(remaining_expr), 0)).where(
            NasiyaDebt.status == "active", NasiyaDebt.due_date < today
        )
    )).scalar() or 0

    total_lent = (await db.execute(
        select(func.coalesce(func.sum(NasiyaDebt.principal_amount), 0))
    )).scalar() or 0

    total_collected = (await db.execute(
        select(func.coalesce(func.sum(NasiyaDebt.paid_amount), 0))
    )).scalar() or 0

    return {
        "outstanding": float(outstanding),        # hozir qancha pulim odamlarda
        "active_count": int(active_count),
        "overdue_count": int(overdue_count),
        "overdue_amount": float(overdue_amount),
        "total_lent": float(total_lent),
        "total_collected": float(total_collected),
    }


@router.get("/{debt_id}")
async def get_debt(debt_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    stmt = select(NasiyaDebt).options(selectinload(NasiyaDebt.payments)).where(NasiyaDebt.id == debt_id)
    debt = (await db.execute(stmt)).scalar_one_or_none()
    if not debt:
        raise HTTPException(404, "Nasiya topilmadi")
    data = _serialize(debt, date.today())
    data["payments"] = [_serialize_payment(p) for p in debt.payments]
    return data


@router.post("", status_code=201)
async def create_debt(
    body: DebtCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    phone = _normalize_phone(body.debtor_phone)
    if not phone:
        raise HTTPException(400, "Telefon raqami noto'g'ri")
    debt = NasiyaDebt(
        debtor_name=body.debtor_name,
        debtor_phone=phone,
        principal_amount=_q2(body.principal_amount),
        paid_amount=Decimal("0.00"),
        lent_date=body.lent_date or date.today(),
        due_date=body.due_date,
        status="active",
        note=body.note,
        created_by=_uid(user),
    )
    db.add(debt)
    await db.commit()
    await db.refresh(debt)
    data = _serialize(debt, date.today())
    data["payments"] = []
    return data


@router.patch("/{debt_id}")
async def update_debt(
    debt_id: uuid.UUID,
    body: DebtUpdate,
    db: AsyncSession = Depends(get_db),
):
    debt = (await db.execute(select(NasiyaDebt).where(NasiyaDebt.id == debt_id))).scalar_one_or_none()
    if not debt:
        raise HTTPException(404, "Nasiya topilmadi")

    if body.debtor_name is not None:
        debt.debtor_name = body.debtor_name.strip()
    if body.debtor_phone is not None:
        ph = _normalize_phone(body.debtor_phone)
        if not ph:
            raise HTTPException(400, "Telefon raqami noto'g'ri")
        debt.debtor_phone = ph
    if body.principal_amount is not None:
        debt.principal_amount = _q2(body.principal_amount)
    if body.due_date is not None:
        debt.due_date = body.due_date
    if body.lent_date is not None:
        debt.lent_date = body.lent_date
    if body.note is not None:
        debt.note = body.note

    # qoldiqqa qarab statusni yangilash
    debt.status = "paid" if _q2(debt.principal_amount) - _q2(debt.paid_amount) <= 0 else "active"

    await db.commit()
    await db.refresh(debt)
    return _serialize(debt, date.today())


@router.delete("/{debt_id}", status_code=204)
async def delete_debt(debt_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    debt = (await db.execute(select(NasiyaDebt).where(NasiyaDebt.id == debt_id))).scalar_one_or_none()
    if not debt:
        raise HTTPException(404, "Nasiya topilmadi")
    await db.delete(debt)   # payments — cascade
    await db.commit()
    return None


@router.post("/{debt_id}/payments", status_code=201)
async def add_payment(
    debt_id: uuid.UUID,
    body: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    stmt = select(NasiyaDebt).options(selectinload(NasiyaDebt.payments)).where(NasiyaDebt.id == debt_id)
    debt = (await db.execute(stmt)).scalar_one_or_none()
    if not debt:
        raise HTTPException(404, "Nasiya topilmadi")

    amount = _q2(body.amount)
    remaining = _q2(debt.principal_amount) - _q2(debt.paid_amount)
    if amount > remaining:
        raise HTTPException(400, f"To'lov qoldiqdan ko'p ({float(remaining)} som qoldi)")

    pay = NasiyaPayment(
        debt_id=debt.id,
        amount=amount,
        paid_at=body.paid_at or datetime.utcnow(),
        note=body.note,
        created_by=_uid(user),
    )
    db.add(pay)
    debt.paid_amount = _q2(debt.paid_amount) + amount
    if _q2(debt.principal_amount) - debt.paid_amount <= 0:
        debt.status = "paid"
    await db.commit()

    refreshed = (await db.execute(stmt)).scalar_one()
    data = _serialize(refreshed, date.today())
    data["payments"] = [_serialize_payment(p) for p in refreshed.payments]
    return data


@router.delete("/{debt_id}/payments/{payment_id}")
async def delete_payment(
    debt_id: uuid.UUID,
    payment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    pay = (await db.execute(
        select(NasiyaPayment).where(NasiyaPayment.id == payment_id, NasiyaPayment.debt_id == debt_id)
    )).scalar_one_or_none()
    if not pay:
        raise HTTPException(404, "To'lov topilmadi")

    debt = (await db.execute(select(NasiyaDebt).where(NasiyaDebt.id == debt_id))).scalar_one()
    debt.paid_amount = _q2(debt.paid_amount) - _q2(pay.amount)
    if debt.paid_amount < 0:
        debt.paid_amount = Decimal("0.00")
    debt.status = "paid" if _q2(debt.principal_amount) - debt.paid_amount <= 0 else "active"
    await db.delete(pay)
    await db.commit()

    stmt = select(NasiyaDebt).options(selectinload(NasiyaDebt.payments)).where(NasiyaDebt.id == debt_id)
    refreshed = (await db.execute(stmt)).scalar_one()
    data = _serialize(refreshed, date.today())
    data["payments"] = [_serialize_payment(p) for p in refreshed.payments]
    return data


@router.post("/{debt_id}/remind")
async def remind_now(debt_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Qarzdorga hoziroq WhatsApp eslatma yuborish (qo'lda)."""
    debt = (await db.execute(select(NasiyaDebt).where(NasiyaDebt.id == debt_id))).scalar_one_or_none()
    if not debt:
        raise HTTPException(404, "Nasiya topilmadi")
    if debt.status == "paid":
        raise HTTPException(400, "Bu nasiya allaqachon yopilgan")
    ok = await send_debtor_reminder(db, debt)
    if not ok:
        raise HTTPException(502, "WhatsApp yuborilmadi (GreenAPI sozlamasini tekshiring)")
    debt.last_reminder_at = datetime.utcnow()
    await db.commit()
    return {"sent": True}
