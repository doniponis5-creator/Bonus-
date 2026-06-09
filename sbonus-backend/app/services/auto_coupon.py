"""
SBonus+ — Auto-Coupon Engine (повышение среднего чека).

Еженедельный cron:
1. Берём активных клиентов (>= AUTO_COUPON_MIN_PURCHASES покупок за 90 дней)
2. Считаем средний чек клиента
3. Генерируем персональный купон: min_purchase = avg_check × AUTO_COUPON_MULTIPLIER
   bonus = min_purchase × AUTO_COUPON_BONUS_PERCENT%
4. Отправляем WhatsApp с magic-link на кабинет
5. Купон активируется в кабинете ТОЛЬКО после покупки >= min_purchase

Все параметры — из DB Settings:
  AUTO_COUPON_ENABLED        — "true"/"false" (default false)
  AUTO_COUPON_MULTIPLIER     — множитель среднего чека (default 1.3)
  AUTO_COUPON_BONUS_PERCENT  — % бонуса от порога (default 7)
  AUTO_COUPON_VALIDITY_DAYS  — срок купона в днях (default 7)
  AUTO_COUPON_MAX_PER_RUN    — макс. купонов за запуск (default 50)
  AUTO_COUPON_COOLDOWN_DAYS  — пауза между купонами одному клиенту (default 30)
  AUTO_COUPON_MIN_PURCHASES  — мин. покупок за 90 дней (default 3)
"""

import logging
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.models import (
    Coupon, Customer, Notification, Setting, Transaction, TransactionType,
)
from app.services.smart_notifications import (
    _get_wa_config, _generate_magic_link, _send_and_log,
)

logger = logging.getLogger("sbonus.auto_coupon")

EVENT_TYPE = "auto_coupon"

DEFAULT_MESSAGE = (
    "🎟 {name}, сизга махсус таклиф!\n\n"
    "{min_purchase} сомдан ошиқ харид қилинг ва +{bonus} бонус олинг!\n"
    "Муддати: {expires} гача.\n\n"
    "Купон кабинетингизда: {link}\n\n"
    "Смарт Центр — S Bonus+"
)


async def _get_config(db: AsyncSession) -> dict:
    keys = [
        "AUTO_COUPON_ENABLED", "AUTO_COUPON_MULTIPLIER",
        "AUTO_COUPON_BONUS_PERCENT", "AUTO_COUPON_VALIDITY_DAYS",
        "AUTO_COUPON_MAX_PER_RUN", "AUTO_COUPON_COOLDOWN_DAYS",
        "AUTO_COUPON_MIN_PURCHASES", "AUTO_COUPON_MESSAGE_TEMPLATE",
    ]
    result = await db.execute(select(Setting).where(Setting.key.in_(keys)))
    cfg = {s.key: s.value for s in result.scalars().all()}

    def _f(key, default):
        try:
            return float(cfg.get(key) or default)
        except (ValueError, TypeError):
            return default

    return {
        "enabled": (cfg.get("AUTO_COUPON_ENABLED") or "false").lower() == "true",
        "multiplier": Decimal(str(_f("AUTO_COUPON_MULTIPLIER", 1.3))),
        "bonus_percent": Decimal(str(_f("AUTO_COUPON_BONUS_PERCENT", 7))),
        "validity_days": int(_f("AUTO_COUPON_VALIDITY_DAYS", 7)),
        "max_per_run": int(_f("AUTO_COUPON_MAX_PER_RUN", 50)),
        "cooldown_days": int(_f("AUTO_COUPON_COOLDOWN_DAYS", 30)),
        "min_purchases": int(_f("AUTO_COUPON_MIN_PURCHASES", 3)),
        "template": cfg.get("AUTO_COUPON_MESSAGE_TEMPLATE") or DEFAULT_MESSAGE,
    }


def _round_to(value: Decimal, step: int) -> Decimal:
    """Округлить до ближайшего кратного step (50 сом для порога, 10 для бонуса)."""
    return (value / step).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * step


async def run_auto_coupon():
    """Еженедельная генерация персональных купонов на повышение чека."""
    async with async_session() as db:
        cfg = await _get_config(db)
        if not cfg["enabled"]:
            logger.info("Auto-coupon: disabled (AUTO_COUPON_ENABLED != true)")
            return

        wa_cfg = await _get_wa_config(db)
        if not wa_cfg:
            logger.warning("Auto-coupon: WhatsApp not configured, skip")
            return

        now = datetime.now(timezone.utc)
        since = now - timedelta(days=90)
        cooldown_cutoff = now - timedelta(days=cfg["cooldown_days"])

        # Кандидаты: активные клиенты с достаточной историей покупок
        result = await db.execute(
            select(
                Transaction.customer_id,
                func.count().label("cnt"),
                func.avg(Transaction.purchase_amount).label("avg_check"),
            )
            .join(Customer, Customer.id == Transaction.customer_id)
            .where(
                Transaction.type == TransactionType.EARN,
                Transaction.created_at >= since,
                Transaction.purchase_amount != None,
                Customer.is_active == True,
            )
            .group_by(Transaction.customer_id)
            .having(func.count() >= cfg["min_purchases"])
            .order_by(func.avg(Transaction.purchase_amount).desc())
        )
        candidates = result.all()
        if not candidates:
            logger.info("Auto-coupon: no candidates")
            return

        # Клиенты с недавним auto_coupon уведомлением (cooldown)
        notified_result = await db.execute(
            select(Notification.customer_id).where(
                Notification.event_type == EVENT_TYPE,
                Notification.created_at >= cooldown_cutoff,
            )
        )
        recently_notified = {r[0] for r in notified_result.all()}

        # Клиенты с активным неиспользованным авто-купоном
        active_coupon_result = await db.execute(
            select(Coupon.customer_id).where(
                Coupon.code.like("AUTO-%"),
                Coupon.is_used == False,
                Coupon.is_active == True,
                Coupon.expires_at > now,
            )
        )
        has_active_coupon = {r[0] for r in active_coupon_result.all()}

        sent = 0
        for row in candidates:
            if sent >= cfg["max_per_run"]:
                break
            cid = row.customer_id
            if cid in recently_notified or cid in has_active_coupon:
                continue

            customer = (await db.execute(
                select(Customer).where(Customer.id == cid)
            )).scalar_one_or_none()
            if not customer or not customer.phone:
                continue

            avg_check = Decimal(str(row.avg_check))
            min_purchase = _round_to(avg_check * cfg["multiplier"], 50)
            if min_purchase < 500:
                min_purchase = Decimal("500")
            bonus = _round_to(min_purchase * cfg["bonus_percent"] / 100, 10)
            if bonus < 20:
                bonus = Decimal("20")

            expires_at = now + timedelta(days=cfg["validity_days"])
            code = f"AUTO-{secrets.token_hex(4).upper()}"

            coupon = Coupon(
                customer_id=cid,
                code=code,
                title=f"Махсус: {int(min_purchase)}+ сом харидга +{int(bonus)} бонус",
                description=(
                    f"Персональный купон. Покупка от {int(min_purchase)} сом → "
                    f"+{int(bonus)} бонус. Действует до {expires_at.strftime('%d.%m.%Y')}."
                ),
                bonus_amount=bonus,
                min_purchase=min_purchase,
                expires_at=expires_at,
            )
            db.add(coupon)
            await db.flush()

            link = await _generate_magic_link(db, cid)
            message = (
                cfg["template"]
                .replace("{name}", customer.full_name or "")
                .replace("{min_purchase}", str(int(min_purchase)))
                .replace("{bonus}", str(int(bonus)))
                .replace("{expires}", expires_at.strftime("%d.%m.%Y"))
                .replace("{code}", code)
                .replace("{link}", link)
            )

            ok = await _send_and_log(db, cid, customer.phone, message, EVENT_TYPE, wa_cfg)
            if ok:
                sent += 1
            else:
                # WA не ушёл — купон оставляем (клиент увидит в кабинете)
                await db.commit()

        logger.info(f"Auto-coupon: created+sent {sent} coupons (candidates: {len(candidates)})")
