"""
Sbonus+ — Customer Telegram Bot.
Klientlar uchun Telegram bot: balans, spin, referral link, tarix.

Komandy klienta:
  /start           — registratsiya yoki login (telefon yuborish)
  /balance (/bal)   — joriy balans va daraja
  /history (/hist)  — oxirgi 5 ta tranzaksiya
  /referral (/ref)  — referral code va link
  /spin             — kolesoni aylantirish (agar spin bor bo'lsa)
  /help             — yordam
  /tier             — daraja va keyingi daraja haqida ma'lumot
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.core.config import get_settings
from app.models import (
    Customer, BonusAccount, Transaction, TransactionType,
    Setting, Tier,
)

logger = logging.getLogger("sbonus.customer_tg_bot")
settings = get_settings()

# ═══════════════════════════════════════════
# TELEGRAM CLIENT (reuse pattern from owner bot)
# ═══════════════════════════════════════════

class CustomerTelegramBot:
    """Telegram Bot API client for customer bot."""

    def __init__(self, token: str):
        self.token = token
        self.base_url = f"https://api.telegram.org/bot{token}"

    async def send_message(self, chat_id: str, text: str, parse_mode: str = "HTML",
                           reply_markup: Optional[dict] = None) -> Optional[dict]:
        if not self.token or not chat_id:
            return None
        try:
            payload = {"chat_id": chat_id, "text": text, "parse_mode": parse_mode}
            if reply_markup:
                import json
                payload["reply_markup"] = json.dumps(reply_markup)
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(f"{self.base_url}/sendMessage", json=payload)
                return resp.json()
        except Exception as e:
            logger.error("Customer TG send error: %s", e)
            return None

    async def get_updates(self, offset: int = 0) -> list:
        try:
            async with httpx.AsyncClient(timeout=35) as client:
                resp = await client.get(
                    f"{self.base_url}/getUpdates",
                    params={"offset": offset, "limit": 20, "timeout": 25},
                )
                return resp.json().get("result", [])
        except Exception:
            return []


# ═══════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════

async def _get_customer_bot_config(db: AsyncSession) -> dict:
    """Get customer bot config from DB Settings."""
    result = await db.execute(
        select(Setting).where(Setting.key == "CUSTOMER_TELEGRAM_BOT")
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return {"enabled": False, "bot_token": ""}
    import json
    try:
        return json.loads(row.value)
    except (json.JSONDecodeError, TypeError):
        return {"enabled": False, "bot_token": ""}


async def _get_customer_bot(db: AsyncSession) -> Optional[CustomerTelegramBot]:
    cfg = await _get_customer_bot_config(db)
    if not cfg.get("enabled") or not cfg.get("bot_token"):
        return None
    return CustomerTelegramBot(cfg["bot_token"])


# ═══════════════════════════════════════════
# CUSTOMER LOOKUP (by telegram chat_id)
# ═══════════════════════════════════════════

async def _get_customer_by_tg(db: AsyncSession, chat_id: str) -> Optional[Customer]:
    """Find customer by their linked Telegram chat_id stored in Settings."""
    result = await db.execute(
        select(Setting).where(Setting.key == f"TG_CUSTOMER_{chat_id}")
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return None
    import uuid
    try:
        customer_id = uuid.UUID(row.value)
    except ValueError:
        return None
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    return result.scalar_one_or_none()


async def _link_customer_tg(db: AsyncSession, chat_id: str, customer_id: str):
    """Link customer to Telegram chat_id."""
    key = f"TG_CUSTOMER_{chat_id}"
    result = await db.execute(select(Setting).where(Setting.key == key))
    row = result.scalar_one_or_none()
    if row:
        row.value = customer_id
    else:
        db.add(Setting(key=key, value=customer_id))
    await db.commit()


def _fmt(n) -> str:
    if isinstance(n, (Decimal, float)):
        return f"{n:,.0f}"
    return f"{n:,}"


# ═══════════════════════════════════════════
# COMMAND HANDLERS
# ═══════════════════════════════════════════

_pending_phone: dict[str, bool] = {}  # chat_id -> waiting for phone


async def _handle_start(bot: CustomerTelegramBot, chat_id: str, db: AsyncSession):
    """Start command — check if linked, if not ask for phone."""
    customer = await _get_customer_by_tg(db, chat_id)
    if customer:
        account = (await db.execute(
            select(BonusAccount).where(BonusAccount.customer_id == customer.id)
        )).scalar_one_or_none()
        balance = account.balance if account else Decimal("0")
        await bot.send_message(chat_id, (
            f"\U0001f44b Salom, <b>{customer.full_name}</b>!\n\n"
            f"\U0001f4b0 Balans: <b>{_fmt(balance)} KGS</b>\n\n"
            "Buyruqlar:\n"
            "/balance — balans\n"
            "/history — tranzaksiyalar\n"
            "/referral — referral link\n"
            "/tier — daraja info\n"
            "/help — yordam"
        ))
    else:
        _pending_phone[chat_id] = True
        await bot.send_message(chat_id, (
            f"\U0001f44b <b>{settings.shop_bonus_name}</b> ga xush kelibsiz!\n\n"
            "\U0001f4f1 Telefon raqamingizni yuboring (masalan: 0555123456)\n"
            "Biz sizni tizimda topamiz va ulash mumkin."
        ), reply_markup={
            "keyboard": [[{"text": "\U0001f4f1 Telefon yuborish", "request_contact": True}]],
            "resize_keyboard": True,
            "one_time_keyboard": True,
        })


async def _handle_phone(bot: CustomerTelegramBot, chat_id: str, phone: str, db: AsyncSession):
    """Process phone number — find customer and link."""
    # Normalize phone
    phone = phone.strip().replace(" ", "").replace("-", "")
    if phone.startswith("+"):
        phone = phone[1:]
    if phone.startswith("996"):
        pass
    elif phone.startswith("0"):
        phone = "996" + phone[1:]

    # Try multiple formats
    variants = [phone, f"+{phone}"]
    if not phone.startswith("996"):
        variants.extend([f"996{phone}", f"+996{phone}"])

    customer = None
    for variant in variants:
        result = await db.execute(select(Customer).where(Customer.phone == variant))
        customer = result.scalar_one_or_none()
        if customer:
            break

    if not customer:
        await bot.send_message(chat_id, (
            "❌ Bu telefon raqam tizimda topilmadi.\n\n"
            "Iltimos, do‘konda ro‘yxatdan o‘ting yoki "
            f"<b>{settings.customer_cabinet_base_url}</b> dan ro‘yxatdan o‘ting."
        ), reply_markup={"remove_keyboard": True})
        _pending_phone.pop(chat_id, None)
        return

    await _link_customer_tg(db, chat_id, str(customer.id))
    _pending_phone.pop(chat_id, None)

    account = (await db.execute(
        select(BonusAccount).where(BonusAccount.customer_id == customer.id)
    )).scalar_one_or_none()
    balance = account.balance if account else Decimal("0")

    await bot.send_message(chat_id, (
        f"✅ Muvaffaqiyatli ulandi!\n\n"
        f"\U0001f464 {customer.full_name}\n"
        f"\U0001f4b0 Balans: <b>{_fmt(balance)} KGS</b>\n\n"
        "Endi barcha buyruqlardan foydalanishingiz mumkin! /help"
    ), reply_markup={"remove_keyboard": True})


async def _handle_balance(bot: CustomerTelegramBot, chat_id: str, db: AsyncSession):
    """Show balance and tier."""
    customer = await _get_customer_by_tg(db, chat_id)
    if not customer:
        await bot.send_message(chat_id, "⚠️ Avval /start buyrug‘ini yuboring.")
        return

    account = (await db.execute(
        select(BonusAccount).where(BonusAccount.customer_id == customer.id)
    )).scalar_one_or_none()

    tier = None
    if customer.tier_id:
        tier = (await db.execute(select(Tier).where(Tier.id == customer.tier_id))).scalar_one_or_none()

    balance = account.balance if account else Decimal("0")
    earned = account.total_earned if account else Decimal("0")
    spent = account.total_spent if account else Decimal("0")
    tier_name = tier.name if tier else "Bronze"
    tier_pct = tier.bonus_percent if tier else Decimal("3")

    await bot.send_message(chat_id, (
        f"\U0001f4b0 <b>{customer.full_name}</b>\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"\U0001f4ca Balans: <b>{_fmt(balance)} KGS</b>\n"
        f"⬆️ Jami olindi: {_fmt(earned)} KGS\n"
        f"⬇️ Jami sarflandi: {_fmt(spent)} KGS\n"
        f"\U0001f3c5 Daraja: <b>{tier_name}</b> ({tier_pct}%)\n"
    ))


async def _handle_history(bot: CustomerTelegramBot, chat_id: str, db: AsyncSession):
    """Show last 5 transactions."""
    customer = await _get_customer_by_tg(db, chat_id)
    if not customer:
        await bot.send_message(chat_id, "⚠️ Avval /start buyrug‘ini yuboring.")
        return

    result = await db.execute(
        select(Transaction)
        .where(Transaction.customer_id == customer.id)
        .order_by(Transaction.created_at.desc())
        .limit(5)
    )
    txns = result.scalars().all()

    if not txns:
        await bot.send_message(chat_id, "\U0001f4cb Hozircha tranzaksiyalar yo‘q.")
        return

    type_icons = {
        "earn": "⬆️", "spend": "⬇️", "referral": "\U0001f465",
        "promo": "\U0001f39f", "birthday": "\U0001f382", "expire": "⏰",
        "campaign": "\U0001f389", "refund": "\U0001f504",
    }
    lines = ["<b>Oxirgi 5 tranzaksiya:</b>\n━━━━━━━━━━━━━━━━━━━━"]
    for t in txns:
        icon = type_icons.get(t.type.value, "\U0001f4cb")
        sign = "+" if t.type in (TransactionType.EARN, TransactionType.REFERRAL,
                                  TransactionType.PROMO, TransactionType.BIRTHDAY,
                                  TransactionType.CAMPAIGN) else "-"
        dt = t.created_at.strftime("%d.%m %H:%M") if t.created_at else ""
        lines.append(f"{icon} {sign}{_fmt(t.amount)} KGS — {dt}")

    await bot.send_message(chat_id, "\n".join(lines))


async def _handle_referral(bot: CustomerTelegramBot, chat_id: str, db: AsyncSession):
    """Show referral code and link."""
    customer = await _get_customer_by_tg(db, chat_id)
    if not customer:
        await bot.send_message(chat_id, "⚠️ Avval /start buyrug‘ini yuboring.")
        return

    # Count referrals
    ref_count = (await db.execute(
        select(func.count(Customer.id)).where(Customer.referred_by == customer.id)
    )).scalar() or 0

    reg_url = f"{settings.customer_cabinet_base_url}/register?ref={customer.referral_code}"

    await bot.send_message(chat_id, (
        "\U0001f465 <b>Referral dasturi</b>\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"\U0001f511 Kodingiz: <code>{customer.referral_code}</code>\n"
        f"\U0001f517 Link: {reg_url}\n\n"
        f"\U0001f465 Taklif qilganlar: <b>{ref_count}</b>\n\n"
        "Do‘stlaringizga yuboring va bonus oling! \U0001f381"
    ))


async def _handle_tier(bot: CustomerTelegramBot, chat_id: str, db: AsyncSession):
    """Show tier info and next tier progress."""
    customer = await _get_customer_by_tg(db, chat_id)
    if not customer:
        await bot.send_message(chat_id, "⚠️ Avval /start buyrug‘ini yuboring.")
        return

    account = (await db.execute(
        select(BonusAccount).where(BonusAccount.customer_id == customer.id)
    )).scalar_one_or_none()

    current_tier = None
    if customer.tier_id:
        current_tier = (await db.execute(select(Tier).where(Tier.id == customer.tier_id))).scalar_one_or_none()

    all_tiers = (await db.execute(
        select(Tier).where(Tier.is_active == True).order_by(Tier.sort_order.asc())
    )).scalars().all()

    total_earned = float(account.total_earned) if account else 0
    tier_name = current_tier.name if current_tier else "Bronze"
    tier_pct = float(current_tier.bonus_percent) if current_tier else 3

    lines = [
        f"\U0001f3c5 <b>Sizning darajangiz: {tier_name}</b> ({tier_pct}%)",
        f"\U0001f4ca Jami xaridlar: {_fmt(total_earned)} KGS",
        "━━━━━━━━━━━━━━━━━━━━",
    ]

    # Find next tier
    next_tier = None
    for t in all_tiers:
        if float(t.min_total_kgs) > total_earned:
            next_tier = t
            break

    if next_tier:
        remaining = float(next_tier.min_total_kgs) - total_earned
        progress = (total_earned / float(next_tier.min_total_kgs)) * 100 if float(next_tier.min_total_kgs) > 0 else 0
        bar_filled = int(progress / 10)
        bar = "▓" * bar_filled + "░" * (10 - bar_filled)
        lines.append(
            f"\U0001f3af Keyingi: <b>{next_tier.name}</b> ({next_tier.bonus_percent}%)\n"
            f"[{bar}] {progress:.0f}%\n"
            f"Qoldi: {_fmt(remaining)} KGS xarid"
        )
    else:
        lines.append("\U0001f3c6 Siz eng yuqori darajadasiz!")

    lines.append("\n<b>Barcha darajalar:</b>")
    for t in all_tiers:
        marker = " ← siz" if current_tier and t.id == current_tier.id else ""
        icon = '🔸' if marker else '▪️'
        lines.append(f"  {icon} {t.name} — {t.bonus_percent}% (≥{_fmt(t.min_total_kgs)} KGS){marker}")

    await bot.send_message(chat_id, "\n".join(lines))


async def _handle_help(bot: CustomerTelegramBot, chat_id: str):
    await bot.send_message(chat_id, (
        f"\U0001f4f1 <b>{settings.shop_bonus_name} — Yordam</b>\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        "/balance — balans va daraja\n"
        "/history — oxirgi tranzaksiyalar\n"
        "/referral — referral kod va link\n"
        "/tier — daraja va progress\n"
        "/help — shu yordam\n\n"
        f"\U0001f310 Kabinet: {settings.customer_cabinet_base_url}"
    ))


# ═══════════════════════════════════════════
# MAIN COMMAND ROUTER
# ═══════════════════════════════════════════

async def _handle_customer_message(bot: CustomerTelegramBot, chat_id: str, text: str,
                                    contact_phone: Optional[str], db: AsyncSession):
    """Route message to appropriate handler."""
    # If waiting for phone
    if chat_id in _pending_phone:
        if contact_phone:
            await _handle_phone(bot, chat_id, contact_phone, db)
        elif text and not text.startswith("/"):
            await _handle_phone(bot, chat_id, text, db)
        else:
            await bot.send_message(chat_id, "\U0001f4f1 Iltimos, telefon raqamingizni yuboring.")
        return

    cmd = text.split()[0].split("@")[0].lower() if text else ""

    if cmd == "/start":
        await _handle_start(bot, chat_id, db)
    elif cmd in ("/balance", "/bal"):
        await _handle_balance(bot, chat_id, db)
    elif cmd in ("/history", "/hist"):
        await _handle_history(bot, chat_id, db)
    elif cmd in ("/referral", "/ref"):
        await _handle_referral(bot, chat_id, db)
    elif cmd == "/tier":
        await _handle_tier(bot, chat_id, db)
    elif cmd == "/help":
        await _handle_help(bot, chat_id)
    elif cmd.startswith("/"):
        await bot.send_message(chat_id, "❓ Noma‘lum buyruq. /help — buyruqlar ro‘yxati.")


# ═══════════════════════════════════════════
# POLLING LOOP
# ═══════════════════════════════════════════

_customer_poll_task: Optional[asyncio.Task] = None


async def _customer_poll_loop():
    """Polling loop for customer bot (separate from owner bot)."""
    from app.core.redis import redis_client

    offset = 0
    lock_key = "customer_tg_bot_poll_lock"

    while True:
        try:
            acquired = await redis_client.set(lock_key, "1", nx=True, ex=60)
            if not acquired:
                await asyncio.sleep(10)
                continue

            async with async_session() as db:
                bot = await _get_customer_bot(db)
                if not bot:
                    await redis_client.delete(lock_key)
                    await asyncio.sleep(30)
                    continue

                updates = await bot.get_updates(offset)
                for upd in updates:
                    offset = upd["update_id"] + 1
                    msg = upd.get("message", {})
                    text = msg.get("text", "")
                    chat_id = str(msg.get("chat", {}).get("id", ""))
                    if not chat_id:
                        continue

                    # Extract contact phone if shared
                    contact_phone = None
                    contact = msg.get("contact")
                    if contact:
                        contact_phone = contact.get("phone_number", "")

                    await _handle_customer_message(bot, chat_id, text, contact_phone, db)

            await redis_client.expire(lock_key, 60)
        except Exception as e:
            logger.error("Customer TG poll error: %s", e)
            await asyncio.sleep(5)
            continue

        await asyncio.sleep(1)


def start_customer_bot():
    """Start customer bot polling (called from main.py lifespan)."""
    global _customer_poll_task
    if _customer_poll_task and not _customer_poll_task.done():
        return
    _customer_poll_task = asyncio.create_task(_customer_poll_loop())
    logger.info("Customer Telegram bot polling started")


def stop_customer_bot():
    """Stop customer bot polling."""
    global _customer_poll_task
    if _customer_poll_task and not _customer_poll_task.done():
        _customer_poll_task.cancel()
        logger.info("Customer Telegram bot polling stopped")
