"""
Sbonus+ — API кассовых смен (открытие / закрытие / инкассация).

Кассир:
  POST /api/v1/shifts/open       — открыть смену (начальный остаток)
  POST /api/v1/shifts/close      — закрыть смену (пересчёт купюр)
  GET  /api/v1/shifts/current    — текущая открытая смена кассира
  GET  /api/v1/shifts/rate       — текущий курс USD (для отображения)

Админ:
  GET   /api/v1/shifts                 — журнал смен (фильтры)
  GET   /api/v1/shifts/stats           — сводка по расхождениям
  GET   /api/v1/shifts/export          — экспорт (csv/xlsx)
  GET   /api/v1/shifts/config          — настройки (курс, порог алерта)
  PUT   /api/v1/shifts/config          — сохранить настройки
  GET   /api/v1/shifts/{id}            — карточка смены
  PATCH /api/v1/shifts/{id}            — правка смены (только админ, с аудитом)
"""

import csv
import io
import uuid
from datetime import datetime, timezone, date as date_cls
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import UserRole, require_role, get_current_user
from app.models import Shift, ShiftStatus, User, Branch, Setting
from app.services.audit import log_audit
from app.services.shift import (
    DENOMINATIONS,
    compute_total,
    compute_cash_sales,
    get_usd_rate,
    get_alert_threshold,
    usd_of,
    maybe_alert_discrepancy,
)

router = APIRouter(prefix="/shifts", tags=["Смены / Инкассация"])

CASHIER_ROLES = (UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN, UserRole.CASHIER)
ADMIN_ROLES = (UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)


# ═══════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════

class ShiftOpenRequest(BaseModel):
    opening_balance: Decimal = Field(default=Decimal("0"), ge=0)


class ShiftCloseRequest(BaseModel):
    denominations: dict[str, int] = Field(default_factory=dict)
    note: Optional[str] = None


class ShiftEditRequest(BaseModel):
    denominations: Optional[dict[str, int]] = None
    opening_balance: Optional[Decimal] = Field(default=None, ge=0)
    note: Optional[str] = None


class ShiftConfigRequest(BaseModel):
    usd_rate: Decimal = Field(..., gt=0)
    alert_threshold: Decimal = Field(..., ge=0)


# ═══════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════

def _uid(user: dict) -> uuid.UUID:
    return uuid.UUID(user["sub"])


def _ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _dec(v) -> Optional[str]:
    return None if v is None else str(v)


def serialize(shift: Shift, cashier_name: str = "", branch_name: str = "") -> dict:
    return {
        "id": str(shift.id),
        "branch_id": str(shift.branch_id) if shift.branch_id else None,
        "branch_name": branch_name,
        "cashier_id": str(shift.cashier_id),
        "cashier_name": cashier_name,
        "status": shift.status,
        "opening_balance": _dec(shift.opening_balance),
        "denominations": shift.denominations or {},
        "total_counted": _dec(shift.total_counted),
        "cash_sales": _dec(shift.cash_sales),
        "total_expected": _dec(shift.total_expected),
        "difference": _dec(shift.difference),
        "usd_rate": _dec(shift.usd_rate),
        "usd_equivalent": _dec(shift.usd_equivalent),
        "note": shift.note,
        "opened_at": shift.opened_at.isoformat() if shift.opened_at else None,
        "closed_at": shift.closed_at.isoformat() if shift.closed_at else None,
        "edited_by": str(shift.edited_by) if shift.edited_by else None,
        "edited_at": shift.edited_at.isoformat() if shift.edited_at else None,
        "created_at": shift.created_at.isoformat() if shift.created_at else None,
    }


async def _name(db: AsyncSession, user_id) -> str:
    if not user_id:
        return ""
    r = await db.execute(select(User.full_name).where(User.id == user_id))
    return r.scalar_one_or_none() or ""


async def _branch_name(db: AsyncSession, branch_id) -> str:
    if not branch_id:
        return ""
    r = await db.execute(select(Branch.name).where(Branch.id == branch_id))
    return r.scalar_one_or_none() or ""


# ═══════════════════════════════════════════
# КАССИР
# ═══════════════════════════════════════════

@router.get("/rate", dependencies=[Depends(require_role(*CASHIER_ROLES))])
async def get_rate(db: AsyncSession = Depends(get_db)) -> dict:
    """Текущий курс USD (для отображения эквивалента на POS)."""
    rate = await get_usd_rate(db)
    return {"usd_rate": str(rate), "denominations": DENOMINATIONS}


@router.get("/current", dependencies=[Depends(require_role(*CASHIER_ROLES))])
async def current_shift(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Открытая смена текущего кассира (или null)."""
    cashier_id = _uid(current_user)
    r = await db.execute(
        select(Shift).where(
            Shift.cashier_id == cashier_id,
            Shift.status == ShiftStatus.OPEN.value,
        ).order_by(Shift.opened_at.desc())
    )
    shift = r.scalars().first()
    if not shift:
        return {"shift": None}
    name = await _name(db, cashier_id)
    bname = await _branch_name(db, shift.branch_id)
    return {"shift": serialize(shift, name, bname)}


@router.post("/open", dependencies=[Depends(require_role(*CASHIER_ROLES))])
async def open_shift(
    body: ShiftOpenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Открыть смену. Нельзя открыть, если уже есть открытая."""
    cashier_id = _uid(current_user)
    branch_id = current_user.get("branch_id")
    branch_uuid = uuid.UUID(branch_id) if branch_id else None

    existing = await db.execute(
        select(Shift).where(
            Shift.cashier_id == cashier_id,
            Shift.status == ShiftStatus.OPEN.value,
        )
    )
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail={"message": "Смена уже открыта. Сначала закройте текущую."})

    shift = Shift(
        cashier_id=cashier_id,
        branch_id=branch_uuid,
        status=ShiftStatus.OPEN.value,
        opening_balance=body.opening_balance,
    )
    db.add(shift)
    await log_audit(db, "shift_open", "shift", None, cashier_id,
                    {"opening_balance": str(body.opening_balance)}, _ip(request))
    await db.commit()
    await db.refresh(shift)
    name = await _name(db, cashier_id)
    bname = await _branch_name(db, branch_uuid)
    return {"status": "ok", "message": "Смена открыта", "shift": serialize(shift, name, bname)}


@router.post("/close", dependencies=[Depends(require_role(*CASHIER_ROLES))])
async def close_shift(
    body: ShiftCloseRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Закрыть смену: пересчёт купюр, сверка с ожидаемой суммой."""
    cashier_id = _uid(current_user)
    r = await db.execute(
        select(Shift).where(
            Shift.cashier_id == cashier_id,
            Shift.status == ShiftStatus.OPEN.value,
        ).order_by(Shift.opened_at.desc())
    )
    shift = r.scalars().first()
    if not shift:
        raise HTTPException(status_code=400, detail={"message": "Нет открытой смены."})

    total_counted, bills_count = compute_total(body.denominations or {})
    now = datetime.now(timezone.utc)
    cash_sales = await compute_cash_sales(db, cashier_id, shift.opened_at, now)
    total_expected = (Decimal(shift.opening_balance or 0) + cash_sales).quantize(Decimal("0.01"))
    difference = (total_counted - total_expected).quantize(Decimal("0.01"))

    if difference != 0 and not (body.note and body.note.strip()):
        raise HTTPException(
            status_code=400,
            detail={"message": "При расхождении укажите причину (комментарий)."},
        )

    rate = await get_usd_rate(db)
    shift.denominations = {str(k): int(v) for k, v in (body.denominations or {}).items() if int(v or 0) > 0}
    shift.total_counted = total_counted
    shift.cash_sales = cash_sales
    shift.total_expected = total_expected
    shift.difference = difference
    shift.usd_rate = rate
    shift.usd_equivalent = usd_of(total_counted, rate)
    shift.note = body.note.strip() if body.note else None
    shift.status = ShiftStatus.CLOSED.value
    shift.closed_at = now

    await log_audit(db, "shift_close", "shift", shift.id, cashier_id,
                    {"total_counted": str(total_counted), "difference": str(difference)}, _ip(request))
    await db.commit()
    await db.refresh(shift)

    bname = await _branch_name(db, shift.branch_id)
    await maybe_alert_discrepancy(db, shift, bname)

    name = await _name(db, cashier_id)
    data = serialize(shift, name, bname)
    data["bills_count"] = bills_count
    return {"status": "ok", "message": "Смена закрыта", "shift": data}


# ═══════════════════════════════════════════
# АДМИН — настройки
# ═══════════════════════════════════════════

@router.get("/config", dependencies=[Depends(require_role(*ADMIN_ROLES))])
async def get_config(db: AsyncSession = Depends(get_db)) -> dict:
    rate = await get_usd_rate(db)
    threshold = await get_alert_threshold(db)
    return {"usd_rate": str(rate), "alert_threshold": str(threshold), "denominations": DENOMINATIONS}


@router.put("/config", dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))])
async def update_config(
    body: ShiftConfigRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    for key, value in [("USD_RATE", str(body.usd_rate)),
                       ("SHIFT_DISCREPANCY_ALERT_THRESHOLD", str(body.alert_threshold))]:
        r = await db.execute(select(Setting).where(Setting.key == key))
        s = r.scalar_one_or_none()
        if s:
            s.value = value
        else:
            db.add(Setting(key=key, value=value))
    await log_audit(db, "shift_config", "settings", None, _uid(current_user),
                    {"usd_rate": str(body.usd_rate), "alert_threshold": str(body.alert_threshold)}, _ip(request))
    await db.commit()
    return {"status": "ok", "message": "Настройки сохранены"}


# ═══════════════════════════════════════════
# АДМИН — журнал
# ═══════════════════════════════════════════

def _apply_filters(query, branch_id, cashier_id, status, date_from, date_to, only_discrepancy):
    if branch_id:
        query = query.where(Shift.branch_id == uuid.UUID(branch_id))
    if cashier_id:
        query = query.where(Shift.cashier_id == uuid.UUID(cashier_id))
    if status:
        query = query.where(Shift.status == status)
    if date_from:
        query = query.where(Shift.opened_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to:
        query = query.where(Shift.opened_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=timezone.utc))
    if only_discrepancy:
        query = query.where(and_(Shift.difference.isnot(None), Shift.difference != 0))
    return query


@router.get("", dependencies=[Depends(require_role(*ADMIN_ROLES))])
async def list_shifts(
    db: AsyncSession = Depends(get_db),
    branch_id: Optional[str] = Query(None),
    cashier_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[date_cls] = Query(None),
    date_to: Optional[date_cls] = Query(None),
    only_discrepancy: bool = Query(False),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> dict:
    base = select(Shift, User.full_name, Branch.name).join(
        User, Shift.cashier_id == User.id, isouter=True
    ).join(Branch, Shift.branch_id == Branch.id, isouter=True)
    base = _apply_filters(base, branch_id, cashier_id, status, date_from, date_to, only_discrepancy)

    count_q = _apply_filters(select(func.count()).select_from(Shift),
                             branch_id, cashier_id, status, date_from, date_to, only_discrepancy)
    total = (await db.execute(count_q)).scalar() or 0

    rows = (await db.execute(
        base.order_by(Shift.opened_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )).all()

    items = [serialize(s, cashier_name or "", branch_name or "") for s, cashier_name, branch_name in rows]
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/stats", dependencies=[Depends(require_role(*ADMIN_ROLES))])
async def shift_stats(
    db: AsyncSession = Depends(get_db),
    date_from: Optional[date_cls] = Query(None),
    date_to: Optional[date_cls] = Query(None),
    branch_id: Optional[str] = Query(None),
) -> dict:
    q = select(Shift).where(Shift.status == ShiftStatus.CLOSED.value)
    if branch_id:
        q = q.where(Shift.branch_id == uuid.UUID(branch_id))
    if date_from:
        q = q.where(Shift.opened_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to:
        q = q.where(Shift.opened_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=timezone.utc))
    shifts = (await db.execute(q)).scalars().all()

    closed = len(shifts)
    total_counted = sum((Decimal(s.total_counted or 0) for s in shifts), Decimal("0"))
    shortage = sum((Decimal(s.difference) for s in shifts if s.difference and s.difference < 0), Decimal("0"))
    surplus = sum((Decimal(s.difference) for s in shifts if s.difference and s.difference > 0), Decimal("0"))
    discrepancies = len([s for s in shifts if s.difference and s.difference != 0])
    return {
        "closed_shifts": closed,
        "total_counted": str(total_counted),
        "discrepancy_count": discrepancies,
        "total_shortage": str(shortage),
        "total_surplus": str(surplus),
    }


@router.get("/export", dependencies=[Depends(require_role(*ADMIN_ROLES))])
async def export_shifts(
    db: AsyncSession = Depends(get_db),
    fmt: str = Query("xlsx", pattern="^(csv|xlsx)$"),
    branch_id: Optional[str] = Query(None),
    cashier_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[date_cls] = Query(None),
    date_to: Optional[date_cls] = Query(None),
    only_discrepancy: bool = Query(False),
):
    base = select(Shift, User.full_name, Branch.name).join(
        User, Shift.cashier_id == User.id, isouter=True
    ).join(Branch, Shift.branch_id == Branch.id, isouter=True)
    base = _apply_filters(base, branch_id, cashier_id, status, date_from, date_to, only_discrepancy)
    rows = (await db.execute(base.order_by(Shift.opened_at.desc()).limit(5000))).all()

    headers = ["Дата открытия", "Дата закрытия", "Филиал", "Кассир", "Статус",
               "Нач. остаток", "Продажи (нал.)", "Ожидалось", "Факт", "Расхождение",
               "Курс USD", "Эквивалент USD", "Причина"]

    def row_values(s, cname, bname):
        return [
            s.opened_at.strftime("%d.%m.%Y %H:%M") if s.opened_at else "",
            s.closed_at.strftime("%d.%m.%Y %H:%M") if s.closed_at else "",
            bname or "", cname or "", s.status,
            str(s.opening_balance or 0), str(s.cash_sales or 0),
            str(s.total_expected or ""), str(s.total_counted or ""),
            str(s.difference or ""), str(s.usd_rate or ""),
            str(s.usd_equivalent or ""), s.note or "",
        ]

    if fmt == "csv":
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        w.writerow(headers)
        for s, cname, bname in rows:
            w.writerow(row_values(s, cname, bname))
        data = ("﻿" + buf.getvalue()).encode("utf-8")
        return StreamingResponse(
            io.BytesIO(data), media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=shifts.csv"},
        )

    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Смены"
    ws.append(headers)
    for s, cname, bname in rows:
        ws.append(row_values(s, cname, bname))
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=shifts.xlsx"},
    )


@router.get("/{shift_id}", dependencies=[Depends(require_role(*CASHIER_ROLES))])
async def get_shift(
    shift_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    r = await db.execute(select(Shift).where(Shift.id == shift_id))
    shift = r.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail={"message": "Смена не найдена"})
    # Кассир видит только свои смены
    role = current_user.get("role")
    if role == UserRole.CASHIER.value and str(shift.cashier_id) != current_user["sub"]:
        raise HTTPException(status_code=403, detail={"message": "Нет доступа"})
    name = await _name(db, shift.cashier_id)
    bname = await _branch_name(db, shift.branch_id)
    return {"shift": serialize(shift, name, bname)}


@router.patch("/{shift_id}", dependencies=[Depends(require_role(*ADMIN_ROLES))])
async def edit_shift(
    shift_id: uuid.UUID,
    body: ShiftEditRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Правка закрытой смены админом (с пересчётом и аудитом)."""
    r = await db.execute(select(Shift).where(Shift.id == shift_id))
    shift = r.scalar_one_or_none()
    if not shift:
        raise HTTPException(status_code=404, detail={"message": "Смена не найдена"})

    changes = {}
    if body.opening_balance is not None:
        shift.opening_balance = body.opening_balance
        changes["opening_balance"] = str(body.opening_balance)
    if body.denominations is not None:
        total_counted, _ = compute_total(body.denominations)
        shift.denominations = {str(k): int(v) for k, v in body.denominations.items() if int(v or 0) > 0}
        shift.total_counted = total_counted
        rate = shift.usd_rate or await get_usd_rate(db)
        shift.usd_rate = rate
        shift.usd_equivalent = usd_of(total_counted, rate)
        changes["total_counted"] = str(total_counted)
    if body.note is not None:
        shift.note = body.note.strip() or None
        changes["note"] = shift.note

    # Пересчёт расхождения
    if shift.total_counted is not None and shift.total_expected is not None:
        shift.difference = (Decimal(shift.total_counted) - Decimal(shift.total_expected)).quantize(Decimal("0.01"))

    shift.edited_by = _uid(current_user)
    shift.edited_at = datetime.now(timezone.utc)

    await log_audit(db, "shift_edit", "shift", shift.id, _uid(current_user), changes, _ip(request))
    await db.commit()
    await db.refresh(shift)
    name = await _name(db, shift.cashier_id)
    bname = await _branch_name(db, shift.branch_id)
    return {"status": "ok", "message": "Смена обновлена", "shift": serialize(shift, name, bname)}
