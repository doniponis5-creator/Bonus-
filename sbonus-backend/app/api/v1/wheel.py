"""
Sbonus+ — Bonus Wheel (Fortune Wheel) API.
Клиент получает возможность крутить колесо после покупки.
За каждую EARN транзакцию даётся 1 право на спин.

Сегменты и вероятности настраиваются администратором.
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

from app.core.database import get_db, async_session
from app.core.redis import check_rate_limit, redis_client
from app.core.security import get_current_customer
from app.core.config import get_settings
from app.models import (
    BonusAccount,
    Customer,
    Setting,
    Transaction,
    TransactionType,
    User,
    UserRoleEnum,
)

router = APIRouter(prefix="/wheel", tags=["Bonus Wheel"])


# ─── Schemas ───

class WheelStatusResponse(BaseModel):
    spins_available: int
    last_spin_at: str | None = None


class WheelSegment(BaseModel):
    id: int
    label: str
    value: int          # bonus amount (0 = no prize / physical prize)
    color: str
    probability: float  # 0.0 - 1.0
    prize_type: str = "bonus"  # "bonus" | "physical" | "none"


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
    prize_type: str = "bonus"  # "bonus" | "physical" | "none"


# ─── Default segments ───
DEFAULT_SEGMENTS = [
    {"id": 1, "label": "+50 KGS",     "value": 50,   "color": "#FFE600", "probability": 0.25, "prize_type": "bonus"},
    {"id": 2, "label": "+100 KGS",    "value": 100,  "color": "#22c55e", "probability": 0.15, "prize_type": "bonus"},
    {"id": 3, "label": "+200 KGS",    "value": 200,  "color": "#3b82f6", "probability": 0.08, "prize_type": "bonus"},
    {"id": 4, "label": "+500 KGS",    "value": 500,  "color": "#a855f7", "probability": 0.02, "prize_type": "bonus"},
    {"id": 5, "label": "Пылесос",     "value": 0,    "color": "#f97316", "probability": 0.01, "prize_type": "physical"},
    {"id": 6, "label": "Удача!",      "value": 25,   "color": "#06b6d4", "probability": 0.29, "prize_type": "bonus"},
    {"id": 7, "label": "Попробуйте!", "value": 0,    "color": "#64748b", "probability": 0.15, "prize_type": "none"},
    {"id": 8, "label": "+150 KGS",    "value": 150,  "color": "#ec4899", "probability": 0.05, "prize_type": "bonus"},
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

    # ── Redis distributed lock: prevent concurrent spin for same customer ──
    lock_key = f"wheel:lock:{customer_id}"
    acquired = await redis_client.set(lock_key, "1", nx=True, ex=10)  # 10s TTL
    if not acquired:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "SPIN_IN_PROGRESS", "message": "Спин уже выполняется. Подождите."},
        )
    try:
        return await _do_spin(db, customer_id)
    finally:
        await redis_client.delete(lock_key)


async def _do_spin(db: AsyncSession, customer_id: uuid.UUID) -> SpinResultResponse:
    """Core spin logic — executed under Redis distributed lock."""
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

    # Бесплатные спины клиента
    free_key = f"WHEEL_FREE_SPINS_{customer_id}"
    free_result = await db.execute(
        select(Setting).where(Setting.key == free_key).with_for_update()
    )
    free_record = free_result.scalar_one_or_none()
    free_spins = int(free_record.value) if free_record else 0

    spins = max(0, earn_count + free_spins - used_spins)
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
    prize_type = winner.get("prize_type", "bonus")

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

    # Начислить бонус или обработать приз
    message = ""
    if prize_type == "physical":
        txn = Transaction(
            customer_id=customer_id,
            type=TransactionType.PROMO,
            amount=Decimal("0"),
            note=f"Колесо удачи — приз: {winner['label']}",
        )
        db.add(txn)
        message = f"Поздравляем! Вы выиграли: {winner['label']}! Обратитесь к кассиру для получения приза."
    elif bonus_amount > 0:
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

    # ── Уведомления (fire-and-forget) ──
    customer_name = customer.full_name if customer else "Неизвестный"
    customer_phone = customer.phone if customer else ""

    import asyncio
    asyncio.create_task(_notify_wheel_telegram(
        customer_name=customer_name,
        prize_label=winner["label"],
        prize_type=prize_type,
        bonus_amount=float(bonus_amount),
        new_balance=float(account.balance),
    ))

    if customer_phone:
        asyncio.create_task(_notify_wheel_whatsapp(
            db_factory=async_session,
            phone=customer_phone,
            prize_label=winner["label"],
            prize_type=prize_type,
            bonus_amount=float(bonus_amount),
            new_balance=float(account.balance),
        ))

    return SpinResultResponse(
        segment_id=winner["id"],
        label=winner["label"],
        value=int(bonus_amount),
        message=message,
        new_balance=float(account.balance),
        spins_remaining=spins - 1,
        prize_type=prize_type,
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
    Формула: (EARN транзакции + бесплатные спины) — использованные спины.
    """
    # Всего EARN транзакций
    earn_count = (await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.customer_id == customer_id,
            Transaction.type == TransactionType.EARN,
        )
    )).scalar() or 0

    # Бесплатные спины клиента (начисляются при регистрации/импорте)
    free_key = f"WHEEL_FREE_SPINS_{customer_id}"
    free_result = await db.execute(select(Setting).where(Setting.key == free_key))
    free_record = free_result.scalar_one_or_none()
    free_spins = int(free_record.value) if free_record else 0

    # Использованные спины
    spin_key = f"WHEEL_SPINS_USED_{customer_id}"
    result = await db.execute(select(Setting).where(Setting.key == spin_key))
    spin_record = result.scalar_one_or_none()
    used_spins = int(spin_record.value) if spin_record else 0

    total = max(0, earn_count + free_spins - used_spins)
    return min(total, 1)  # Максимум 1 спин за раз


# ═══════════════════════════════════════════
# WHEEL NOTIFICATIONS (fire-and-forget)
# ═══════════════════════════════════════════

async def _notify_wheel_telegram(
    customer_name: str,
    prize_label: str,
    prize_type: str,
    bonus_amount: float,
    new_balance: float,
):
    """Telegram алерт владельцу о выигрыше на колесе."""
    try:
        from app.services.telegram_bot import _get_bot, _get_chat_id, _get_tg_config
        async with async_session() as db:
            bot = await _get_bot(db)
            chat_id = await _get_chat_id(db)
            if not bot or not chat_id:
                return

            if prize_type == "physical":
                text = (
                    "🎰 <b>Колесо удачи — ПРИЗ!</b>\n"
                    f"👤 {customer_name}\n"
                    f"🎁 Приз: <b>{prize_label}</b>\n"
                    f"📋 Тип: Физический приз\n"
                    "⚠️ Клиент придёт за призом к кассиру!"
                )
            elif bonus_amount > 0:
                text = (
                    "🎰 <b>Колесо удачи — выигрыш!</b>\n"
                    f"👤 {customer_name}\n"
                    f"🏆 Выигрыш: <b>+{bonus_amount:,.0f} KGS</b>\n"
                    f"💰 Баланс: {new_balance:,.0f} KGS"
                )
            else:
                return  # Не уведомляем о пустых спинах

            await bot.send_message(chat_id, text)
    except Exception:
        pass  # Не ломаем основной flow


async def _notify_wheel_whatsapp(
    db_factory,
    phone: str,
    prize_label: str,
    prize_type: str,
    bonus_amount: float,
    new_balance: float,
):
    """WhatsApp уведомление клиенту о выигрыше на колесе."""
    try:
        from app.services.whatsapp import send_whatsapp_message

        # Read credentials from DB Settings (same as all other services)
        async with db_factory() as db:
            result = await db.execute(
                select(Setting).where(Setting.key.in_([
                    "ENABLE_WHATSAPP_NOTIFICATIONS",
                    "GREENAPI_INSTANCE_ID",
                    "GREENAPI_API_TOKEN",
                ]))
            )
            cfg = {s.key: s.value for s in result.scalars().all()}

        if cfg.get("ENABLE_WHATSAPP_NOTIFICATIONS") != "true":
            return

        instance_id = cfg.get("GREENAPI_INSTANCE_ID")
        api_token = cfg.get("GREENAPI_API_TOKEN")
        if not instance_id or not api_token:
            return

        cabinet_url = get_settings().customer_cabinet_base_url.rstrip("/")

        if prize_type == "physical":
            msg = (
                f"🎉 Поздравляем! Вы выиграли на Колесе Удачи: *{prize_label}*!\n\n"
                f"📍 Обратитесь к кассиру в Смарт Центр для получения приза.\n\n"
                f"👤 Личный кабинет: {cabinet_url}\n\n"
                f"Спасибо что вы с нами! 💛"
            )
        elif bonus_amount > 0:
            msg = (
                f"🎉 Поздравляем! Вы выиграли на Колесе Удачи: *+{bonus_amount:,.0f} KGS*!\n\n"
                f"💰 Ваш баланс: *{new_balance:,.0f} KGS*\n\n"
                f"👤 Личный кабинет: {cabinet_url}\n\n"
                f"Спасибо что вы с нами! 💛"
            )
        else:
            return  # Не уведомляем о пустых спинах

        await send_whatsapp_message(phone, msg, instance_id, api_token)
    except Exception:
        pass  # Не ломаем основной flow
