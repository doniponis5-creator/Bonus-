"""
SBonus+ — Smart Notifications Engine.

Автоматические уведомления:
1. Churn Prevention — клиенты, которые уходят (14/30/60 дней без покупки)
2. Win-back — персональные предложения для потерянных клиентов  
3. Birthday Pre-reminder — напоминание за 3 дня до ДР
4. Bonus Expiry Alert — индивидуальное предупреждение о сгорании
5. Milestone Celebration — поздравление при достижении уровня/суммы
6. Post-Purchase Thank You — благодарность после крупной покупки

Все уведомления через WhatsApp с magic-link.
Защита от спама: max 1 уведомление каждого типа за 7 дней per customer.
"""

import logging
import secrets
from datetime import datetime, timedelta, date
from decimal import Decimal

from sqlalchemy import select, func, and_, or_, desc, not_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import async_session
from app.models import (
    BonusAccount, Customer, CustomerAuthToken, Notification,
    Setting, Tier, Transaction, TransactionType,
)
from app.services.whatsapp import send_whatsapp_message

logger = logging.getLogger(__name__)

# ── Helpers ──────────────────

async def _get_wa_config(db: AsyncSession) -> dict | None:
    """Get WhatsApp config from DB settings."""
    result = await db.execute(
        select(Setting).where(Setting.key.in_([
            "GREENAPI_INSTANCE_ID", "GREENAPI_API_TOKEN",
            "ENABLE_WHATSAPP_NOTIFICATIONS",
        ]))
    )
    cfg = {s.key: s.value for s in result.scalars().all()}
    if cfg.get("ENABLE_WHATSAPP_NOTIFICATIONS") != "true":
        return None
    iid = cfg.get("GREENAPI_INSTANCE_ID")
    tok = cfg.get("GREENAPI_API_TOKEN")
    if not iid or not tok:
        return None
    return {"instance_id": iid, "api_token": tok}


async def _generate_magic_link(db: AsyncSession, customer_id, path: str = "") -> str:
    """Generate a magic-link token for cabinet auto-login."""
    token = secrets.token_urlsafe(32)[:64]
    auth = CustomerAuthToken(
        customer_id=customer_id,
        token=token,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(auth)
    await db.flush()
    base = "https://cabinet.smartcentr.store"
    return f"{base}/{path}?token={token}" if path else f"{base}?token={token}"


async def _was_recently_notified(db: AsyncSession, customer_id, event_type: str, days: int = 7) -> bool:
    """Check if customer was notified with this event type in last N days."""
    cutoff = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(
        select(func.count(Notification.id)).where(
            and_(
                Notification.customer_id == customer_id,
                Notification.event_type == event_type,
                Notification.created_at >= cutoff,
            )
        )
    )
    return (result.scalar() or 0) > 0


async def _send_and_log(
    db: AsyncSession, customer_id, phone: str, message: str,
    event_type: str, wa_cfg: dict,
):
    """Send WA message and log notification."""
    try:
        notif = Notification(
            customer_id=customer_id,
            channel="whatsapp",
            status="pending",
            message=message[:500],
            phone=phone,
            event_type=event_type,
        )
        db.add(notif)
        await db.flush()

        await send_whatsapp_message(
            phone=phone,
            message=message,
            instance_id=wa_cfg["instance_id"],
            api_token=wa_cfg["api_token"],
        )

        notif.status = "sent"
        notif.sent_at = datetime.utcnow()
        await db.commit()
        return True
    except Exception as e:
        logger.error(f"Smart notification error for {phone}: {e}")
        try:
            notif.status = "failed"
            notif.error = str(e)[:200]
            await db.commit()
        except Exception:
            pass
        return False


# ═══════════════════════════════════════════
# 1. CHURN PREVENTION
# ═══════════════════════════════════════════

async def run_churn_prevention():
    """
    Находит клиентов, которые давно не покупали, и отправляет
    персонализированное уведомление.

    Уровни:
    - 14 дней → мягкое напоминание
    - 30 дней → предложение бонуса
    - 60 дней → win-back с ссылкой
    """
    async with async_session() as db:
        wa_cfg = await _get_wa_config(db)
        if not wa_cfg:
            return

        # Get setting for inactive days threshold
        setting = await db.execute(
            select(Setting).where(Setting.key == "SMART_CHURN_DAYS")
        )
        s = setting.scalar_one_or_none()
        # Default levels: 14, 30, 60
        levels = [
            {"days": 14, "type": "churn_soft", "max_per_run": 30},
            {"days": 30, "type": "churn_medium", "max_per_run": 20},
            {"days": 60, "type": "churn_hard", "max_per_run": 10},
        ]

        now = datetime.utcnow()
        total_sent = 0

        for level in levels:
            cutoff_start = now - timedelta(days=level["days"] + 7)
            cutoff_end = now - timedelta(days=level["days"])

            # Find customers whose last purchase was in the window
            subq = (
                select(
                    Transaction.customer_id,
                    func.max(Transaction.created_at).label("last_purchase"),
                )
                .where(Transaction.type == TransactionType.EARN)
                .group_by(Transaction.customer_id)
            ).subquery()

            result = await db.execute(
                select(Customer, subq.c.last_purchase)
                .join(subq, Customer.id == subq.c.customer_id)
                .options(selectinload(Customer.tier))
                .where(
                    and_(
                        Customer.is_active == True,
                        subq.c.last_purchase >= cutoff_start,
                        subq.c.last_purchase <= cutoff_end,
                    )
                )
                .limit(level["max_per_run"])
            )

            sent = 0
            for row in result.all():
                customer = row[0]
                last_purchase = row[1]

                if await _was_recently_notified(db, customer.id, level["type"], days=14):
                    continue

                # Get balance
                acc = await db.execute(
                    select(BonusAccount).where(BonusAccount.customer_id == customer.id)
                )
                account = acc.scalar_one_or_none()
                balance = int(account.balance) if account else 0

                name = (customer.full_name or "").split()[0] or "Дорогой клиент"
                days_ago = (now - last_purchase).days
                link = await _generate_magic_link(db, customer.id)

                if level["days"] == 14:
                    msg = (
                        f"👋 {name}, давно вас не видели!\n\n"
                        f"Прошло уже {days_ago} дней с вашего последнего визита "
                        f"в Смарт Центр.\n\n"
                        f"💰 На вашем счету: *{balance} бонусов*\n"
                        f"Не забудьте использовать их!\n\n"
                        f"🔗 Ваш кабинет: {link}"
                    )
                elif level["days"] == 30:
                    msg = (
                        f"😊 {name}, мы скучаем!\n\n"
                        f"Вас не было уже {days_ago} дней. "
                        f"У вас *{balance} бонусов* на счету — "
                        f"они ждут вас!\n\n"
                        f"Загляните к нам и получите приятный сюрприз 🎁\n\n"
                        f"🔗 {link}"
                    )
                else:
                    msg = (
                        f"🌟 {name}, мы помним о вас!\n\n"
                        f"Прошло {days_ago} дней... Мы подготовили "
                        f"для вас специальные условия!\n\n"
                        f"💰 Ваш баланс: *{balance} бонусов*\n"
                        f"Покрутите колесо удачи — может повезти! 🎡\n\n"
                        f"🔗 {link}"
                    )

                import asyncio
                await asyncio.sleep(3)  # Rate limit
                if await _send_and_log(db, customer.id, customer.phone, msg, level["type"], wa_cfg):
                    sent += 1
                    total_sent += 1

            logger.info(f"Churn prevention [{level['type']}]: sent {sent}")

        logger.info(f"Churn prevention total: {total_sent} messages")


# ═══════════════════════════════════════════
# 2. BIRTHDAY PRE-REMINDER (3 дня до ДР)
# ═══════════════════════════════════════════

async def run_birthday_pre_reminder():
    """
    Напоминание за 3 дня до дня рождения.
    Основной ДР-бонус отправляется в день ДР (existing cron).
    """
    async with async_session() as db:
        wa_cfg = await _get_wa_config(db)
        if not wa_cfg:
            return

        today = date.today()
        target_date = today + timedelta(days=3)

        result = await db.execute(
            select(Customer).where(
                and_(
                    Customer.is_active == True,
                    Customer.birth_date.isnot(None),
                    func.extract("month", Customer.birth_date) == target_date.month,
                    func.extract("day", Customer.birth_date) == target_date.day,
                )
            )
        )

        sent = 0
        for customer in result.scalars().all():
            if await _was_recently_notified(db, customer.id, "birthday_pre", days=30):
                continue

            name = (customer.full_name or "").split()[0] or "Дорогой клиент"
            link = await _generate_magic_link(db, customer.id)

            msg = (
                f"🎂 {name}, через 3 дня ваш День рождения!\n\n"
                f"Смарт Центр приготовил для вас подарок — "
                f"*бонусы на ваш счёт* в день рождения! 🎁\n\n"
                f"Не забудьте заглянуть к нам!\n\n"
                f"🔗 {link}"
            )

            import asyncio
            await asyncio.sleep(3)
            if await _send_and_log(db, customer.id, customer.phone, msg, "birthday_pre", wa_cfg):
                sent += 1

        logger.info(f"Birthday pre-reminder: sent {sent}")


# ═══════════════════════════════════════════
# 3. INDIVIDUAL BONUS EXPIRY ALERT
# ═══════════════════════════════════════════

async def run_expiry_personal_alert():
    """
    Персональное уведомление о сгорающих бонусах.
    Находит клиентов, у которых бонусы сгорят через 7 дней.
    """
    async with async_session() as db:
        wa_cfg = await _get_wa_config(db)
        if not wa_cfg:
            return

        now = datetime.utcnow()
        # Бонусы, заработанные 358-365 дней назад (сгорят через 0-7 дней)
        earned_before = now - timedelta(days=358)
        earned_after = now - timedelta(days=365)

        # Find customers with expiring bonuses
        result = await db.execute(
            select(
                Transaction.customer_id,
                func.sum(Transaction.amount).label("expiring_amount"),
            )
            .where(
                and_(
                    Transaction.type == TransactionType.EARN,
                    Transaction.created_at <= earned_before,
                    Transaction.created_at >= earned_after,
                )
            )
            .group_by(Transaction.customer_id)
            .having(func.sum(Transaction.amount) >= 50)  # min 50 bonus
        )

        sent = 0
        for row in result.all():
            cid = row.customer_id
            expiring = int(row.expiring_amount)

            if await _was_recently_notified(db, cid, "expiry_personal", days=7):
                continue

            cust_result = await db.execute(
                select(Customer).where(Customer.id == cid, Customer.is_active == True)
            )
            customer = cust_result.scalar_one_or_none()
            if not customer:
                continue

            name = (customer.full_name or "").split()[0] or "Дорогой клиент"
            link = await _generate_magic_link(db, cid)

            msg = (
                f"⚠️ {name}, ваши бонусы сгорают!\n\n"
                f"Через 7 дней *{expiring} бонусов* будут аннулированы.\n\n"
                f"Успейте потратить их при покупке "
                f"в Смарт Центр!\n\n"
                f"🔗 Проверить баланс: {link}"
            )

            import asyncio
            await asyncio.sleep(3)
            if await _send_and_log(db, cid, customer.phone, msg, "expiry_personal", wa_cfg):
                sent += 1

            if sent >= 50:
                break

        logger.info(f"Expiry personal alert: sent {sent}")


# ═══════════════════════════════════════════
# 4. POST-PURCHASE THANK YOU
# ═══════════════════════════════════════════

async def send_post_purchase_thanks(customer_id, purchase_amount: float, bonus_earned: float, db: AsyncSession):
    """
    Отправить благодарность после крупной покупки (>5000 сом).
    Вызывается из bonus.earn() после начисления.
    """
    if purchase_amount < 5000:
        return

    wa_cfg = await _get_wa_config(db)
    if not wa_cfg:
        return

    if await _was_recently_notified(db, customer_id, "post_purchase_thanks", days=3):
        return

    cust_result = await db.execute(
        select(Customer).where(Customer.id == customer_id)
    )
    customer = cust_result.scalar_one_or_none()
    if not customer:
        return

    name = (customer.full_name or "").split()[0] or "Дорогой клиент"
    link = await _generate_magic_link(db, customer_id)

    msg = (
        f"🙏 {name}, спасибо за покупку!\n\n"
        f"Сумма: *{int(purchase_amount)} сом*\n"
        f"Начислено: *+{int(bonus_earned)} бонусов*\n\n"
        f"Спасибо, что выбираете Смарт Центр! 💛\n\n"
        f"🔗 Ваш кабинет: {link}"
    )

    await _send_and_log(db, customer_id, customer.phone, msg, "post_purchase_thanks", wa_cfg)


# ═══════════════════════════════════════════
# 5. MILESTONE CELEBRATION
# ═══════════════════════════════════════════

async def check_milestone(customer_id, new_total_purchases: float, db: AsyncSession):
    """
    Проверить достижение вехи и отправить поздравление.
    Вехи: 10k, 25k, 50k, 100k, 250k, 500k сом.
    """
    milestones = [10000, 25000, 50000, 100000, 250000, 500000]

    milestone_hit = None
    for m in milestones:
        if new_total_purchases >= m:
            milestone_hit = m

    if not milestone_hit:
        return

    event_type = f"milestone_{milestone_hit}"
    if await _was_recently_notified(db, customer_id, event_type, days=365):
        return

    wa_cfg = await _get_wa_config(db)
    if not wa_cfg:
        return

    cust_result = await db.execute(
        select(Customer).options(selectinload(Customer.tier)).where(Customer.id == customer_id)
    )
    customer = cust_result.scalar_one_or_none()
    if not customer:
        return

    name = (customer.full_name or "").split()[0] or "Дорогой клиент"
    tier_name = customer.tier.name if customer.tier else "Bronze"
    link = await _generate_magic_link(db, customer_id)

    milestone_fmt = f"{milestone_hit // 1000}k" if milestone_hit >= 1000 else str(milestone_hit)

    msg = (
        f"🏆 {name}, поздравляем!\n\n"
        f"Вы потратили *{int(new_total_purchases)} сом* в Смарт Центр!\n"
        f"Достижение: *{milestone_fmt} сом* 🎉\n\n"
        f"Ваш уровень: *{tier_name}*\n"
        f"Продолжайте копить бонусы!\n\n"
        f"🔗 {link}"
    )

    await _send_and_log(db, customer_id, customer.phone, msg, event_type, wa_cfg)


# ═══════════════════════════════════════════
# 6. NEW TIER CONGRATULATION
# ═══════════════════════════════════════════

async def notify_tier_upgrade(customer_id, new_tier_name: str, bonus_percent: float, db: AsyncSession):
    """
    Поздравление при переходе на новый уровень.
    Вызывается из _check_tier_upgrade() в BonusService.
    """
    wa_cfg = await _get_wa_config(db)
    if not wa_cfg:
        return

    if await _was_recently_notified(db, customer_id, "tier_upgrade", days=30):
        return

    cust_result = await db.execute(
        select(Customer).where(Customer.id == customer_id)
    )
    customer = cust_result.scalar_one_or_none()
    if not customer:
        return

    name = (customer.full_name or "").split()[0] or "Дорогой клиент"
    link = await _generate_magic_link(db, customer_id)

    tier_emoji = {"Silver": "🥈", "Gold": "🥇", "Platinum": "💎"}.get(new_tier_name, "⭐")

    msg = (
        f"{tier_emoji} {name}, вы достигли уровня *{new_tier_name}*!\n\n"
        f"Теперь ваш кешбэк: *{bonus_percent}%* с каждой покупки!\n\n"
        f"Спасибо за вашу лояльность! 🙌\n\n"
        f"🔗 {link}"
    )

    await _send_and_log(db, customer_id, customer.phone, msg, "tier_upgrade", wa_cfg)


# ═══════════════════════════════════════════
# ADMIN API — Smart Notification Stats
# ═══════════════════════════════════════════

async def get_smart_notification_stats(db: AsyncSession, days: int = 30) -> dict:
    """
    Статистика smart уведомлений для admin panel.
    """
    cutoff = datetime.utcnow() - timedelta(days=days)

    # By event_type
    result = await db.execute(
        select(
            Notification.event_type,
            Notification.status,
            func.count(Notification.id).label("cnt"),
        ).where(
            and_(
                Notification.created_at >= cutoff,
                Notification.event_type.isnot(None),
            )
        ).group_by(Notification.event_type, Notification.status)
    )

    stats = {}
    for r in result.all():
        et = r.event_type or "unknown"
        if et not in stats:
            stats[et] = {"sent": 0, "failed": 0, "pending": 0, "total": 0}
        stats[et][r.status] = r.cnt
        stats[et]["total"] += r.cnt

    # Total sent today
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_result = await db.execute(
        select(func.count(Notification.id)).where(
            and_(
                Notification.created_at >= today_start,
                Notification.status == "sent",
            )
        )
    )
    today_sent = today_result.scalar() or 0

    return {
        "by_type": stats,
        "today_sent": today_sent,
        "period_days": days,
    }
