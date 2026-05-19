"""
Sbonus+ — Bonus Wheel (Fortune Wheel) API.
Mijoz xarid qilgandan keyin g'ildirak aylantirish imkoniyati.
Har bir EARN tranzaksiyasiga 1 ta spin huquqi beriladi.

Segmentlar va ehtimolliklar admin tomonidan sozlanadi.
"""

import random
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.redis import check_rate_limit
from app.core.security import get_current_customer
from app.models import (
    BonusAccount,
    Customer,
    Setting,
    Transaction,
    TransactionType,
)

router = APIRouter(prefix="/wheel", tags=["Bonus Wheel"])


# ─── Schemas ───

class WheelStatusResponse(BaseModel):
    spins_available: int
    last_spin_at: str | None = None


class WheelSegment(BaseModel):
    id: int
    label: str
    value: int          # bonus amount (0 = no prize)
    color: str
    probability: float  # 0.0 - 1.0


class WheelConfigResponse(BaseModel):
    segments: list[WheelSegment]
    spins_available: int


class SpinResultResponse(BaseModel):
    segment_id: int
    label: str
    value: int
    message: str
    new_balance: float
    spins_remaining: int


# ─── Default segments ───
DEFAULT_SEGMENTS = [
    {"id": 1, "label": "+50 KGS",     "value": 50,   "color": "#FFE600", "probability": 0.25},
    {"id": 2, "label": "+100 KGS",    "value": 100,  "color": "#22c55e", "probability": 0.15},
    {"id": 3, "label": "+200 KGS",    "value": 200,  "color": "#3b82f6", "probability": 0.08},
    {"id": 4, "label": "+500 KGS",    "value": 500,  "color": "#a855f7", "probability": 0.02},
    {"id": 5, "label": "x2 Bonus",    "value": 0,    "color": "#f97316", "probability": 0.10},
    {"id": 6, "label": "Удача!",      "value": 25,   "color": "#06b6d4", "probability": 0.20},
    {"id": 7, "label": "Попробуйте!", "value": 0,    "color": "#64748b", "probability": 0.15},
    {"id": 8, "label": "+150 KGS",    "value": 150,  "color": "#ec4899", "probability": 0.05},
]


def _pick_segment(segments: list[dict]) -> dict:
    """Weighted random pick."""
    weights = [s["probability"] for s in segments]
    return random.choices(segments, weights=weights, k=1)[0]


# ─── Endpoints ───

@router.get("/config", response_model=WheelConfigResponse)
async def get_wheel_config(
    db: AsyncSession = Depends(get_db),
    current_customer: dict = Depends(get_current_customer),
):
    """Получить конфигурацию колеса и доступные спины."""
    customer_id = uuid.UUID(current_customer["sub"])

    # Получить segments из settings или default
    segments = await _get_segments(db)

    # Подсчитать доступные спины
    spins = await _get_available_spins(db, customer_id)

    return WheelConfigResponse(
        segments=[WheelSegment(**s) for s in segments],
        spins_available=spins,
    )


@router.post("/spin", response_model=SpinResultResponse)
async def spin_wheel(
    db: AsyncSession = Depends(get_db),
    current_customer: dict = Depends(get_current_customer),
):
    """Крутить колесо — использовать 1 спин."""
    customer_id = uuid.UUID(current_customer["sub"])

    # Rate limit: max 3 спина в минуту на клиента
    if not await check_rate_limit(f"wheel:spin:{customer_id}", max_attempts=3, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "RATE_LIMIT", "message": "Слишком много попыток. Подождите минуту."},
        )

    # ── ATOMIC: Lock spin counter FIRST to prevent race condition ──
    spin_key = f"WHEEL_SPINS_USED_{customer_id}"
    result = await db.execute(
        select(Setting).where(Setting.key == spin_key).with_for_update()
    )
    spin_record = result.scalar_one_or_none()
    used_spins = int(spin_record.value) if spin_record else 0

    # Count total earned spins
    earn_count = (await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.customer_id == customer_id,
            Transaction.type == TransactionType.EARN,
        )
    )).scalar() or 0

    spins = max(0, earn_count - used_spins)
    if spins <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_SPINS", "message": "Нет доступных попыток. Сделайте покупку!"},
        )

    # Increment spin counter IMMEDIATELY (inside lock)
    if spin_record:
        spin_record.value = str(used_spins + 1)
    else:
        db.add(Setting(key=spin_key, value="1"))

    # Выбрать сегмент
    segments = await _get_segments(db)
    winner = _pick_segment(segments)

    # Получить аккаунт (locked)
    result = await db.execute(
        select(BonusAccount)
        .where(BonusAccount.customer_id == customer_id)
        .with_for_update()
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail={"message": "Бонусный аккаунт не найден"})

    # Получить клиента
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    customer = result.scalar_one_or_none()

    bonus_amount = Decimal(str(winner["value"]))

    # Обработка x2 бонуса — удваиваем последний EARN
    if winner["label"] == "x2 Bonus":
        last_earn = await db.execute(
            select(Transaction)
            .where(
                Transaction.customer_id == customer_id,
                Transaction.type == TransactionType.EARN,
            )
            .order_by(Transaction.created_at.desc())
            .limit(1)
        )
        last_earn_txn = last_earn.scalar_one_or_none()
        if last_earn_txn:
            bonus_amount = last_earn_txn.amount
        else:
            bonus_amount = Decimal("50")

    # Начислить бонус если > 0
    message = ""
    if bonus_amount > 0:
        account.balance += bonus_amount
        account.total_earned += bonus_amount

        txn = Transaction(
            customer_id=customer_id,
            type=TransactionType.PROMO,
            amount=bonus_amount,
            note=f"Колесо удачи: {winner['label']}",
        )
        db.add(txn)
        message = f"Поздравляем! Вы выиграли {bonus_amount} KGS!"
    else:
        message = "Не повезло! Попробуйте в следующий раз!"

    await db.commit()

    return SpinResultResponse(
        segment_id=winner["id"],
        label=winner["label"],
        value=int(bonus_amount),
        message=message,
        new_balance=float(account.balance),
        spins_remaining=spins - 1,
    )


@router.get("/status", response_model=WheelStatusResponse)
async def wheel_status(
    db: AsyncSession = Depends(get_db),
    current_customer: dict = Depends(get_current_customer),
):
    """Статус — сколько спинов доступно."""
    customer_id = uuid.UUID(current_customer["sub"])
    spins = await _get_available_spins(db, customer_id)
    return WheelStatusResponse(spins_available=spins)


# ─── Helpers ───

async def _get_segments(db: AsyncSession) -> list[dict]:
    """Получить сегменты из settings или default."""
    result = await db.execute(
        select(Setting).where(Setting.key == "WHEEL_SEGMENTS")
    )
    setting = result.scalar_one_or_none()
    if setting and setting.value:
        import json
        try:
            return json.loads(setting.value)
        except Exception:
            pass
    return DEFAULT_SEGMENTS


async def _get_available_spins(db: AsyncSession, customer_id: uuid.UUID) -> int:
    """
    Подсчёт доступных спинов.
    Формула: кол-во EARN транзакций — кол-во использованных спинов.
    """
    # Всего EARN транзакций
    earn_count = (await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.customer_id == customer_id,
            Transaction.type == TransactionType.EARN,
        )
    )).scalar() or 0

    # Использованные спины
    spin_key = f"WHEEL_SPINS_USED_{customer_id}"
    result = await db.execute(select(Setting).where(Setting.key == spin_key))
    spin_record = result.scalar_one_or_none()
    used_spins = int(spin_record.value) if spin_record else 0

    return max(0, earn_count - used_spins)
