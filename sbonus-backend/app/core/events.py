"""
Sbonus+ — Internal Event Bus.

Ichki event tizimi — barcha muhim hodisalarni markazlashtirilgan holda boshqarish.
Kelajakda webhook, analytics, notifications hammasini shu eventlarga ulash mumkin.

Eventlar:
  - bonus.earned     — bonus olindi
  - bonus.spent      — bonus sarflandi
  - bonus.expired    — bonus muddati tugadi
  - wheel.won        — kolesoda yutdi
  - referral.applied — referral kod ishlatildi
  - promo.applied    — promokod ishlatildi
  - campaign.sent    — kampaniya yuborildi
  - customer.created — yangi klient ro'yxatdan o'tdi
  - customer.tier_up — klient darajasi ko'tarildi

Arxitektura:
  - Observer pattern (pub/sub)
  - Async handlers (fire-and-forget)
  - Handler registration dekoratori
  - Event logging (audit trail)
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Coroutine, Optional

logger = logging.getLogger("sbonus.events")


class EventType(str, Enum):
    """Barcha event turlari."""
    BONUS_EARNED = "bonus.earned"
    BONUS_SPENT = "bonus.spent"
    BONUS_EXPIRED = "bonus.expired"
    WHEEL_WON = "wheel.won"
    WHEEL_PHYSICAL = "wheel.physical"
    REFERRAL_APPLIED = "referral.applied"
    PROMO_APPLIED = "promo.applied"
    CAMPAIGN_SENT = "campaign.sent"
    CUSTOMER_CREATED = "customer.created"
    CUSTOMER_TIER_UP = "customer.tier_up"
    MILESTONE_CLAIMED = "milestone.claimed"


@dataclass
class Event:
    """Event ma'lumotlari."""
    type: EventType
    data: dict
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    customer_id: Optional[str] = None
    source: str = "system"


# ═══════════════════════════════════════════
# EVENT BUS
# ═══════════════════════════════════════════

class EventBus:
    """
    Markazlashtirilgan event bus.
    Singleton pattern — butun ilova davomida bitta instance.
    """

    def __init__(self):
        self._handlers: dict[EventType, list[Callable]] = {}
        self._global_handlers: list[Callable] = []

    def on(self, event_type: EventType):
        """
        Decorator — event handler ro'yxatdan o'tkazish.

        Usage:
            @event_bus.on(EventType.BONUS_EARNED)
            async def handle_bonus_earned(event: Event):
                print(f"Bonus earned: {event.data}")
        """
        def decorator(func: Callable[..., Coroutine]):
            if event_type not in self._handlers:
                self._handlers[event_type] = []
            self._handlers[event_type].append(func)
            return func
        return decorator

    def on_all(self, func: Callable[..., Coroutine]):
        """Barcha eventlarni tinglaydigan handler."""
        self._global_handlers.append(func)
        return func

    async def emit(self, event: Event) -> None:
        """
        Event yuborish — barcha handlerlarni fire-and-forget qilish.
        Hech bir handler asosiy flow ni bloklamaydi.
        """
        logger.info(
            "Event: %s | customer=%s | data=%s",
            event.type.value,
            event.customer_id or "n/a",
            str(event.data)[:200],
        )

        # Type-specific handlers
        handlers = self._handlers.get(event.type, [])
        for handler in handlers:
            asyncio.create_task(self._safe_call(handler, event))

        # Global handlers
        for handler in self._global_handlers:
            asyncio.create_task(self._safe_call(handler, event))

    @staticmethod
    async def _safe_call(handler: Callable, event: Event) -> None:
        """Handler ni xavfsiz chaqirish — exception tutib qolish."""
        try:
            await handler(event)
        except Exception as e:
            logger.error(
                "Event handler error: %s for event %s: %s",
                handler.__name__, event.type.value, str(e),
            )


# Singleton instance
event_bus = EventBus()


# ═══════════════════════════════════════════
# CONVENIENCE EMIT FUNCTIONS
# ═══════════════════════════════════════════

async def emit_bonus_earned(
    customer_id: str,
    amount: float,
    purchase_amount: float,
    new_balance: float,
    cashier_id: Optional[str] = None,
    category_slug: Optional[str] = None,
):
    """Bonus olindi eventi."""
    await event_bus.emit(Event(
        type=EventType.BONUS_EARNED,
        customer_id=customer_id,
        data={
            "amount": amount,
            "purchase_amount": purchase_amount,
            "new_balance": new_balance,
            "cashier_id": cashier_id,
            "category_slug": category_slug,
        },
    ))


async def emit_bonus_spent(
    customer_id: str,
    amount: float,
    purchase_amount: float,
    new_balance: float,
):
    """Bonus sarflandi eventi."""
    await event_bus.emit(Event(
        type=EventType.BONUS_SPENT,
        customer_id=customer_id,
        data={
            "amount": amount,
            "purchase_amount": purchase_amount,
            "new_balance": new_balance,
        },
    ))


async def emit_wheel_won(
    customer_id: str,
    prize_label: str,
    prize_type: str,
    amount: float,
    new_balance: float,
):
    """Koleso yutug'i eventi."""
    etype = EventType.WHEEL_PHYSICAL if prize_type == "physical" else EventType.WHEEL_WON
    await event_bus.emit(Event(
        type=etype,
        customer_id=customer_id,
        data={
            "prize_label": prize_label,
            "prize_type": prize_type,
            "amount": amount,
            "new_balance": new_balance,
        },
    ))


async def emit_referral_applied(
    inviter_id: str,
    invitee_id: str,
    inviter_bonus: float,
    invitee_bonus: float,
):
    """Referral qo'llanildi eventi."""
    await event_bus.emit(Event(
        type=EventType.REFERRAL_APPLIED,
        customer_id=inviter_id,
        data={
            "invitee_id": invitee_id,
            "inviter_bonus": inviter_bonus,
            "invitee_bonus": invitee_bonus,
        },
    ))


async def emit_customer_created(
    customer_id: str,
    phone: str,
    full_name: str,
    referral_code: Optional[str] = None,
):
    """Yangi klient ro'yxatdan o'tdi."""
    await event_bus.emit(Event(
        type=EventType.CUSTOMER_CREATED,
        customer_id=customer_id,
        data={
            "phone": phone,
            "full_name": full_name,
            "referral_code": referral_code,
        },
    ))


async def emit_customer_tier_up(
    customer_id: str,
    old_tier: str,
    new_tier: str,
):
    """Klient darajasi ko'tarildi."""
    await event_bus.emit(Event(
        type=EventType.CUSTOMER_TIER_UP,
        customer_id=customer_id,
        data={
            "old_tier": old_tier,
            "new_tier": new_tier,
        },
    ))


# ═══════════════════════════════════════════
# DEFAULT HANDLERS (audit logging)
# ═══════════════════════════════════════════

@event_bus.on_all
async def audit_log_handler(event: Event):
    """Barcha eventlarni audit log ga yozish."""
    try:
        import uuid as _uuid
        from app.core.database import async_session
        from app.models import AuditLog

        async with async_session() as db:
            log = AuditLog(
                action=event.type.value,
                entity_type="event",
                entity_id=_uuid.UUID(event.customer_id) if event.customer_id else None,
                details=event.data,
            )
            db.add(log)
            await db.commit()
    except Exception as e:
        logger.error("Audit log handler error: %s", e)
