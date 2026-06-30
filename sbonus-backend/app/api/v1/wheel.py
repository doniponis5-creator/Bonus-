"""
Sbonus+ — Bonus Wheel (Fortune Wheel) API.
Клиент получает возможность крутить колесо после покупки.
За каждую EARN транзакцию даётся 1 право на спин.

Сегменты и вероятности настраиваются администратором.
"""

import random
import uuid
from datetime import datetime, timezone, timedelta
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
    stock: int | None = None  # None = безлимит; иначе макс. число выигрышей за период
    stock_period: str = "total"  # "day" | "week" | "month" | "total" — окно квоты


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
    {"id": 1, "label": "+50 сом",     "value": 50,   "color": "#FFE600", "probability": 0.25, "prize_type": "bonus"},
    {"id": 2, "label": "+100 сом",    "value": 100,  "color": "#22c55e", "probability": 0.15, "prize_type": "bonus"},
    {"id": 3, "label": "+200 сом",    "value": 200,  "color": "#3b82f6", "probability": 0.08, "prize_type": "bonus"},
    {"id": 4, "label": "+500 сом",    "value": 500,  "color": "#a855f7", "probability": 0.02, "prize_type": "bonus"},
    {"id": 5, "label": "Пылесос",     "value": 0,    "color": "#f97316", "probability": 0.01, "prize_type": "physical"},
    {"id": 6, "label": "Удача!",      "value": 25,   "color": "#06b6d4", "probability": 0.29, "prize_type": "bonus"},
    {"id": 7, "label": "Попробуйте!", "value": 0,    "color": "#64748b", "probability": 0.15, "prize_type": "none"},
    {"id": 8, "label": "+150 сом",    "value": 150,  "color": "#ec4899", "probability": 0.05, "prize_type": "bonus"},
]


def _pick_segment(segments: list[dict]) -> dict:
    """Weighted random pick."""
    weights = [max(0, float(s.get("probability", 0))) for s in segments]
    if not segments or sum(weights) <= 0:
        raise ValueError("No wheel segments with positive probability")
    return random.choices(segments, weights=weights, k=1)[0]


# Asia/Bishkek
_WHEEL_TZ = timezone(timedelta(hours=6))


def _stock_period_key(period: str) -> str:
    """Ключ окна квоты: day/week/month/total."""
    period = (period or "total").lower()
    now = datetime.now(_WHEEL_TZ)
    if period == "day":
        return now.strftime("%Y-%m-%d")
    if period == "week":
        iso = now.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    if period == "month":
        return now.strftime("%Y-%m")
    return "all"


def _stock_setting_key(seg: dict) -> str:
    """Ключ счётчика выигрышей сегмента с учётом периода квоты."""
    return f"WHEEL_WON_{seg['id']}_{_stock_period_key(seg.get('stock_period', 'total'))}"


async def _available_segments(db: AsyncSession, segments: list[dict]) -> list[dict]:
    """
    Исключить сегменты с исчерпанным запасом (stock) в рамках их окна квоты.
    Напр. "миксер: 1/месяц" перестаёт выпадать после 1 выигрыша в текущем месяце.
    """
    limited = [s for s in segments if s.get("stock") is not None]
    if not limited:
        return segments
    keys = [_stock_setting_key(s) for s in limited]
    rows = await db.execute(select(Setting).where(Setting.key.in_(keys)))
    won = {r.key: int(r.value or 0) for r in rows.scalars().all()}
    available = []
    for s in segments:
        stock = s.get("stock")
        if stock is None or won.get(_stock_setting_key(s), 0) < int(stock):
            available.append(s)
    return available


def _fallback_none_segment(segments: list[dict]) -> dict:
    """Вернуть безопасный пустой сегмент, когда призовые сегменты недоступны."""
    for s in segments:
        if s.get("prize_type") == "none":
            return {**s, "probability": 1.0}
    return {"id": 0, "label": "Попробуйте!", "value": 0, "color": "#64748b", "probability": 1.0, "prize_type": "none"}


async def _reserve_stock_if_needed(db: AsyncSession, segment: dict) -> str | None:
    """Зарезервировать лимитированный приз. Возвращает Redis-lock key или None."""
    if segment.get("stock") is None or not segment.get("id"):
        return None

    won_key = _stock_setting_key(segment)
    lock_key = f"wheel:stock:{won_key}"
    acquired = await redis_client.set(lock_key, "1", nx=True, ex=10)
    if not acquired:
        return ""

    won_res = await db.execute(select(Setting).where(Setting.key == won_key).with_for_update())
    won_rec = won_res.scalar_one_or_none()
    won_count = int(won_rec.value or 0) if won_rec else 0
    if won_count >= int(segment["stock"]):
        await redis_client.delete(lock_key)
        return ""

    if won_rec:
        won_rec.value = str(won_count + 1)
    else:
        db.add(Setting(key=won_key, value="1"))
    return lock_key


async def _pick_segment_with_stock_reservation(db: AsyncSession, segments: list[dict]) -> tuple[dict, str | None]:
    """Выбрать сегмент и атомарно зарезервировать stock, если он есть."""
    candidates = [
        s for s in await _available_segments(db, segments)
        if float(s.get("probability", 0)) > 0
    ]
    while candidates:
        winner = _pick_segment(candidates)
        stock_lock_key = await _reserve_stock_if_needed(db, winner)
        if stock_lock_key != "":
            return winner, stock_lock_key
        candidates = [s for s in candidates if s.get("id") != winner.get("id")]

    return _fallback_none_segment(segments), None


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

    # Reserve a valid segment before consuming a spin.
    stock_lock_key = None

    # Выбрать сегмент (с учётом запаса призов)
    segments = await _get_segments(db)
    winner, stock_lock_key = await _pick_segment_with_stock_reservation(db, segments)
    prize_type = winner.get("prize_type", "bonus")

    if spin_record:
        spin_record.value = str(used_spins + 1)
    else:
        db.add(Setting(key=spin_key, value="1"))

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
    if stock_lock_key:
        await redis_client.delete(stock_lock_key)

    # ── Уведомления (fire-and-forget) ──
    customer_name = customer.full_name if customer else "Неизвестный"
    customer_phone = customer.phone if customer else ""

    import asyncio

    # ── Gamification 2.0: событие спина (прогресс квеста wheel_spin) ──
    try:
        from app.core.events import event_bus, Event, EventType
        asyncio.create_task(event_bus.emit(Event(
            type=EventType.WHEEL_WON,
            customer_id=str(customer_id),
            data={
                "prize_label": winner["label"],
                "prize_type": prize_type,
                "amount": float(bonus_amount),
                "new_balance": float(account.balance),
            },
        )))
    except Exception:
        pass

    asyncio.create_task(_notify_wheel_telegram(
        customer_name=customer_name,
        prize_label=winner["label"],
        prize_type=prize_type,
        bonus_amount=float(bonus_amount),
        new_balance=float(account.balance),
    ))

    # Push notification (FCM)
    asyncio.create_task(_notify_wheel_push(
        db_factory=async_session,
        customer_id=str(customer_id),
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

    return max(0, earn_count + free_spins - used_spins)


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
                    f"💰 Баланс: {new_balance:,.0f} сом"
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
        from app.services.whatsapp import send_whatsapp_button_message, send_whatsapp_message

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

        button_msg = msg.replace(f"\n\n👤 Личный кабинет: {cabinet_url}", "").strip()
        ok, _ = await send_whatsapp_button_message(
            phone=phone,
            message=button_msg,
            button_text="Личный кабинет",
            button_url=cabinet_url,
            instance_id=instance_id,
            api_token=api_token,
        )
        if not ok:
            await send_whatsapp_message(phone, msg, instance_id, api_token)
    except Exception:
        pass  # Не ломаем основной flow


async def _notify_wheel_push(
    db_factory,
    customer_id: str,
    prize_label: str,
    prize_type: str,
    bonus_amount: float,
    new_balance: float,
):
    """Push notification klientga koleso yutug'i haqida."""
    try:
        from app.services.push_notification import notify_wheel_win
        await notify_wheel_win(
            db_factory=db_factory,
            customer_id=customer_id,
            prize_label=prize_label,
            prize_type=prize_type,
            bonus_amount=bonus_amount,
            new_balance=new_balance,
        )
    except Exception:
        pass  # fire-and-forget
