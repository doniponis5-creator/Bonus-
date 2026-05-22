"""
Sbonus+ — Telegram API marshrutlari.

1) Owner bot sozlamalari (admin):
   GET  /api/v1/admin/telegram/config
   PUT  /api/v1/admin/telegram/config
   POST /api/v1/admin/telegram/test

2) Customer bot — webhook + admin:
   POST /api/v1/telegram/webhook        (Telegram -> server)
   GET  /api/v1/telegram/bot/config
   PUT  /api/v1/telegram/bot/config
   POST /api/v1/telegram/bot/set-webhook
   GET  /api/v1/telegram/bot/stats
"""

import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, async_session
from app.core.security import UserRole, require_role, get_current_user
from app.core.logging import get_logger
from app.models import (
    Customer, BonusAccount, Transaction, TransactionType,
    Setting, User, Tier,
)
from app.services.audit import log_audit
from app.services.telegram_bot import TelegramBot

logger = get_logger("telegram_customer_bot")


# ═══════════════════════════════════════════════════════════════
# OWNER BOT — Admin настройки (существующий функционал)
# ═══════════════════════════════════════════════════════════════

router = APIRouter(prefix="/admin/telegram", tags=["Telegram бот"])


class TelegramConfigRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    enabled: bool = False
    bot_token: str = ""
    chat_id: str = ""
    daily_report: bool = True
    notify_new_customers: bool = True
    notify_large_spend: bool = True
    notify_large_spend_threshold: int = Field(5000, ge=1000)
    notify_large_purchase: bool = True
    notify_large_purchase_threshold: int = Field(50000, ge=5000)
    notify_reversals: bool = True


@router.get(
    "/config",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def get_telegram_config(db: AsyncSession = Depends(get_db)) -> dict:
    """Получить конфигурацию Telegram бота."""
    result = await db.execute(
        select(Setting).where(Setting.key == "telegram_bot")
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return {
            "enabled": False,
            "bot_token": "",
            "chat_id": "",
            "daily_report": True,
            "notify_new_customers": True,
            "notify_large_spend": True,
            "notify_large_spend_threshold": 5000,
            "notify_large_purchase": True,
            "notify_large_purchase_threshold": 50000,
            "notify_reversals": True,
        }
    try:
        cfg = json.loads(row.value)
        if cfg.get("bot_token"):
            token = cfg["bot_token"]
            cfg["bot_token_masked"] = token[:10] + "..." + token[-5:] if len(token) > 15 else "***"
        return cfg
    except (json.JSONDecodeError, TypeError):
        return {"enabled": False}


@router.put(
    "/config",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def update_telegram_config(
    body: TelegramConfigRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Обновить конфигурацию Telegram бота."""
    result = await db.execute(
        select(Setting).where(Setting.key == "telegram_bot")
    )
    row = result.scalar_one_or_none()

    config_data = body.model_dump()

    if not row:
        row = Setting(key="telegram_bot", value=json.dumps(config_data))
        db.add(row)
    else:
        if body.bot_token == "" or body.bot_token.endswith("..."):
            old = json.loads(row.value) if row.value else {}
            config_data["bot_token"] = old.get("bot_token", "")
        row.value = json.dumps(config_data)

    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    await log_audit(db, "telegram_config", "settings", None,
                    uuid.UUID(current_user["sub"]), {"enabled": body.enabled}, ip)

    await db.commit()
    return {"status": "ok", "message": "Конфигурация Telegram сохранена"}


@router.post(
    "/test",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def test_telegram(db: AsyncSession = Depends(get_db)) -> dict:
    """Отправить тестовое сообщение в Telegram."""
    result = await db.execute(
        select(Setting).where(Setting.key == "telegram_bot")
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        raise HTTPException(400, "Telegram бот не настроен")

    cfg = json.loads(row.value)
    if not cfg.get("bot_token") or not cfg.get("chat_id"):
        raise HTTPException(400, "Не указан bot_token или chat_id. Отправьте /start боту в Telegram")

    bot = TelegramBot(cfg["bot_token"])
    resp = await bot.send_message(
        cfg["chat_id"],
        "✅ <b>Тестовое сообщение</b>\n\nS Bonus Telegram бот подключён и работает!"
    )
    if resp and resp.get("ok"):
        return {"status": "ok", "message": "Тестовое сообщение отправлено"}
    raise HTTPException(500, f"Ошибка отправки: {resp}")


# ═══════════════════════════════════════════════════════════════
# CUSTOMER BOT — Webhook + klient buyruqlari
# ═══════════════════════════════════════════════════════════════

customer_bot_router = APIRouter(prefix="/telegram", tags=["telegram-bot"])


# ─── Schemas ───

class TelegramBotConfig(BaseModel):
    enabled: bool = False
    bot_token: str = ""
    bot_username: str = ""
    welcome_message: str = "Assalomu alaykum! S Bonus botiga xush kelibsiz!"


class TelegramBotConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    bot_token: Optional[str] = None
    bot_username: Optional[str] = None
    welcome_message: Optional[str] = None


class TelegramLinkRequest(BaseModel):
    telegram_chat_id: str


# ─── Config helpers ───

CUSTOMER_BOT_KEY = "TELEGRAM_CUSTOMER_BOT"


async def _get_config(db: AsyncSession) -> TelegramBotConfig:
    result = await db.execute(select(Setting).where(Setting.key == CUSTOMER_BOT_KEY))
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return TelegramBotConfig()
    try:
        return TelegramBotConfig(**json.loads(row.value))
    except Exception:
        return TelegramBotConfig()


async def _save_config(db: AsyncSession, config: TelegramBotConfig):
    result = await db.execute(select(Setting).where(Setting.key == CUSTOMER_BOT_KEY))
    row = result.scalar_one_or_none()
    value = json.dumps(config.dict())
    if row:
        row.value = value
    else:
        db.add(Setting(key=CUSTOMER_BOT_KEY, value=value))
    await db.commit()


# ─── Telegram API helper ───

async def _send_tg(token: str, chat_id: str, text: str, parse_mode: str = "HTML"):
    """Send message via Telegram Bot API."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text, "parse_mode": parse_mode},
            )
    except Exception as e:
        logger.error("Telegram send error: %s", e)


async def _send_with_keyboard(token: str, chat_id: str, text: str, keyboard: list):
    """Send message with inline keyboard."""
    import httpx
    reply_markup = {"inline_keyboard": keyboard}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "HTML",
                    "reply_markup": reply_markup,
                },
            )
    except Exception as e:
        logger.error("Telegram keyboard send error: %s", e)


# ─── Customer lookup by chat_id ───

async def _find_customer_by_chat(db: AsyncSession, chat_id: str) -> Optional[Customer]:
    """Find customer linked to this Telegram chat_id."""
    result = await db.execute(
        select(Setting).where(Setting.key == f"TG_LINK_{chat_id}")
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return None
    try:
        customer_id = uuid.UUID(row.value)
    except ValueError:
        return None
    result = await db.execute(select(Customer).where(Customer.id == customer_id))
    return result.scalar_one_or_none()


# ─── Command Handlers ───

async def _handle_start(token: str, chat_id: str, db: AsyncSession, args: str = ""):
    """Handle /start command. If args has phone, try linking."""
    customer = await _find_customer_by_chat(db, chat_id)

    if customer:
        await _send_tg(token, chat_id, (
            f"Salom, <b>{customer.full_name}</b>!\n\n"
            "Siz allaqachon ulangansiz. Buyruqlar:\n"
            "/balance - Balans ko'rish\n"
            "/history - Oxirgi operatsiyalar\n"
            "/referral - Referral havolangiz\n"
            "/profile - Profil ma'lumotlari\n"
            "/help - Yordam"
        ))
        return

    # If /start with phone arg: /start +996XXXXXXXXX
    if args:
        phone = args.strip().replace(" ", "")
        result = await db.execute(select(Customer).where(Customer.phone == phone))
        cust = result.scalar_one_or_none()
        if cust:
            link_setting = Setting(key=f"TG_LINK_{chat_id}", value=str(cust.id))
            db.add(link_setting)
            reverse = Setting(key=f"TG_CUSTOMER_{cust.id}", value=chat_id)
            db.add(reverse)
            await db.commit()
            await _send_tg(token, chat_id, (
                f"Salom, <b>{cust.full_name}</b>!\n\n"
                "Telegram hisobingiz muvaffaqiyatli ulandi!\n\n"
                "/balance - Balans\n"
                "/history - Tarix\n"
                "/referral - Referral\n"
                "/help - Yordam"
            ))
            return

    await _send_tg(token, chat_id, (
        "<b>S Bonus botiga xush kelibsiz!</b>\n\n"
        "Hisobingizni ulash uchun telefon raqamingizni yuboring:\n"
        "Masalan: <code>+996700123456</code>\n\n"
        "Yoki /link +996XXXXXXXXX buyrug'ini ishlating."
    ))


async def _handle_link(token: str, chat_id: str, db: AsyncSession, phone: str):
    """Link Telegram to customer account by phone."""
    if not phone:
        await _send_tg(token, chat_id, "Telefon raqam kiriting: /link +996700123456")
        return

    phone = phone.strip().replace(" ", "")
    result = await db.execute(select(Customer).where(Customer.phone == phone))
    customer = result.scalar_one_or_none()
    if not customer:
        await _send_tg(token, chat_id, "Bu raqam bilan ro'yxatdan o'tgan klient topilmadi.")
        return

    # Check if already linked to another chat
    existing = await db.execute(
        select(Setting).where(Setting.key == f"TG_CUSTOMER_{customer.id}")
    )
    existing_link = existing.scalar_one_or_none()
    if existing_link and existing_link.value != chat_id:
        # Remove old link
        old_chat = existing_link.value
        old_link = await db.execute(select(Setting).where(Setting.key == f"TG_LINK_{old_chat}"))
        old = old_link.scalar_one_or_none()
        if old:
            await db.delete(old)
        existing_link.value = chat_id
    elif not existing_link:
        db.add(Setting(key=f"TG_CUSTOMER_{customer.id}", value=chat_id))

    # Set or update forward link
    fwd = await db.execute(select(Setting).where(Setting.key == f"TG_LINK_{chat_id}"))
    fwd_row = fwd.scalar_one_or_none()
    if fwd_row:
        fwd_row.value = str(customer.id)
    else:
        db.add(Setting(key=f"TG_LINK_{chat_id}", value=str(customer.id)))

    await db.commit()
    await _send_tg(token, chat_id, (
        f"<b>{customer.full_name}</b>, hisobingiz ulandi!\n\n"
        "/balance - Balans ko'rish\n"
        "/referral - Do'stlarni taklif qilish\n"
        "/help - Barcha buyruqlar"
    ))


async def _handle_balance(token: str, chat_id: str, db: AsyncSession):
    """Show customer balance."""
    customer = await _find_customer_by_chat(db, chat_id)
    if not customer:
        await _send_tg(token, chat_id, "Avval hisobni ulang: /link +996XXXXXXXXX")
        return

    account = (await db.execute(
        select(BonusAccount).where(BonusAccount.customer_id == customer.id)
    )).scalar_one_or_none()

    balance = account.balance if account else Decimal("0")
    earned = account.total_earned if account else Decimal("0")
    spent = account.total_spent if account else Decimal("0")

    tier = None
    if customer.tier_id:
        tier = (await db.execute(select(Tier).where(Tier.id == customer.tier_id))).scalar_one_or_none()

    tier_name = tier.name if tier else "Bronze"
    tier_pct = tier.bonus_percent if tier else Decimal("3")

    await _send_tg(token, chat_id, (
        f"<b>{customer.full_name}</b>\n"
        "--------------------\n"
        f"Balans: <b>{balance:,.0f}</b> KGS\n"
        f"Jami olgan: <b>{earned:,.0f}</b> KGS\n"
        f"Jami sarflagan: <b>{spent:,.0f}</b> KGS\n"
        f"Daraja: <b>{tier_name}</b> ({tier_pct}%)\n"
        "--------------------\n"
        f"Kabinet: https://cabinet.smartcentr.store"
    ))


async def _handle_history(token: str, chat_id: str, db: AsyncSession):
    """Show last 10 transactions."""
    customer = await _find_customer_by_chat(db, chat_id)
    if not customer:
        await _send_tg(token, chat_id, "Avval hisobni ulang: /link +996XXXXXXXXX")
        return

    result = await db.execute(
        select(Transaction)
        .where(Transaction.customer_id == customer.id)
        .order_by(Transaction.created_at.desc())
        .limit(10)
    )
    txns = result.scalars().all()

    if not txns:
        await _send_tg(token, chat_id, "Hozircha operatsiyalar yo'q.")
        return

    type_label = {
        TransactionType.EARN: "+ ",
        TransactionType.SPEND: "- ",
        TransactionType.REFERRAL: "+ ",
        TransactionType.PROMO: "+ ",
        TransactionType.EXPIRE: "- ",
        TransactionType.BIRTHDAY: "+ ",
        TransactionType.CAMPAIGN: "+ ",
        TransactionType.REFUND: "+ ",
    }

    lines = ["<b>Oxirgi operatsiyalar</b>\n--------------------"]
    for t in txns:
        prefix = type_label.get(t.type, "")
        dt = t.created_at.strftime("%d.%m %H:%M")
        lines.append(f"{prefix}<b>{t.amount:,.0f}</b> KGS - {dt}")

    await _send_tg(token, chat_id, "\n".join(lines))


async def _handle_referral(token: str, chat_id: str, db: AsyncSession):
    """Show referral code and link."""
    customer = await _find_customer_by_chat(db, chat_id)
    if not customer:
        await _send_tg(token, chat_id, "Avval hisobni ulang: /link +996XXXXXXXXX")
        return

    ref_count = (await db.execute(
        select(func.count(Customer.id)).where(Customer.referred_by == customer.id)
    )).scalar() or 0

    ref_bonus = (await db.execute(
        select(Setting).where(Setting.key == "REFERRAL_BONUS_INVITER")
    )).scalar_one_or_none()
    bonus_amount = ref_bonus.value if ref_bonus else "100"

    ref_link = f"https://cabinet.smartcentr.store/register?ref={customer.referral_code}"

    await _send_tg(token, chat_id, (
        f"<b>Referral dastur</b>\n"
        "--------------------\n"
        f"Sizning kodingiz: <code>{customer.referral_code}</code>\n"
        f"Taklif qilganlar: <b>{ref_count}</b> kishi\n"
        f"Har bir taklif uchun: <b>{bonus_amount}</b> KGS\n"
        "--------------------\n"
        f"Havola: {ref_link}\n\n"
        "Do'stlaringizga yuboring va bonus oling!"
    ))


async def _handle_profile(token: str, chat_id: str, db: AsyncSession):
    """Show customer profile."""
    customer = await _find_customer_by_chat(db, chat_id)
    if not customer:
        await _send_tg(token, chat_id, "Avval hisobni ulang: /link +996XXXXXXXXX")
        return

    tier = None
    if customer.tier_id:
        tier = (await db.execute(select(Tier).where(Tier.id == customer.tier_id))).scalar_one_or_none()

    await _send_tg(token, chat_id, (
        f"<b>Profil</b>\n"
        "--------------------\n"
        f"Ism: <b>{customer.full_name}</b>\n"
        f"Telefon: <code>{customer.phone}</code>\n"
        f"Daraja: <b>{tier.name if tier else 'Bronze'}</b>\n"
        f"Referral kod: <code>{customer.referral_code}</code>\n"
        f"Ro'yxatdan: {customer.created_at.strftime('%d.%m.%Y')}\n"
        f"QR: <code>{customer.qr_code}</code>"
    ))


async def _handle_help(token: str, chat_id: str):
    """Show help message."""
    await _send_tg(token, chat_id, (
        "<b>S Bonus Bot - Buyruqlar</b>\n"
        "--------------------\n"
        "/balance - Balans ko'rish\n"
        "/history - Oxirgi operatsiyalar\n"
        "/referral - Referral havola\n"
        "/profile - Profil ma'lumotlari\n"
        "/link - Hisobni ulash\n"
        "/help - Yordam\n"
        "--------------------\n"
        "Kabinet: https://cabinet.smartcentr.store"
    ))


# ═══════════════════════════════════════════
# WEBHOOK ENDPOINT
# ═══════════════════════════════════════════

@customer_bot_router.post("/webhook", include_in_schema=False)
async def telegram_webhook(request: Request):
    """Telegram webhook - handles all incoming messages."""
    try:
        body = await request.json()
    except Exception:
        return {"ok": True}

    # Get bot config
    async with async_session() as db:
        config = await _get_config(db)

    if not config.enabled or not config.bot_token:
        return {"ok": True}

    token = config.bot_token

    # Handle message
    message = body.get("message") or body.get("edited_message")
    if not message:
        # Handle callback_query (inline button presses)
        callback = body.get("callback_query")
        if callback:
            chat_id = str(callback.get("message", {}).get("chat", {}).get("id", ""))
            data = callback.get("data", "")
            if data.startswith("/"):
                async with async_session() as db:
                    await _route_command(token, chat_id, data, db)
        return {"ok": True}

    chat_id = str(message.get("chat", {}).get("id", ""))
    text = (message.get("text") or "").strip()

    if not chat_id or not text:
        return {"ok": True}

    # Handle commands
    if text.startswith("/"):
        async with async_session() as db:
            await _route_command(token, chat_id, text, db)
    else:
        # Plain text - try to interpret as phone number for linking
        phone = text.strip().replace(" ", "").replace("-", "")
        if phone.startswith("+") and len(phone) >= 10:
            async with async_session() as db:
                await _handle_link(token, chat_id, db, phone)
        else:
            await _send_tg(token, chat_id, "Buyruqlar ro'yxati: /help")

    return {"ok": True}


async def _route_command(token: str, chat_id: str, text: str, db: AsyncSession):
    """Route command to handler."""
    parts = text.split(maxsplit=1)
    cmd = parts[0].split("@")[0].lower()
    args = parts[1] if len(parts) > 1 else ""

    if cmd == "/start":
        await _handle_start(token, chat_id, db, args)
    elif cmd == "/link":
        await _handle_link(token, chat_id, db, args)
    elif cmd in ("/balance", "/bal"):
        await _handle_balance(token, chat_id, db)
    elif cmd in ("/history", "/txn"):
        await _handle_history(token, chat_id, db)
    elif cmd in ("/referral", "/ref"):
        await _handle_referral(token, chat_id, db)
    elif cmd == "/profile":
        await _handle_profile(token, chat_id, db)
    elif cmd == "/help":
        await _handle_help(token, chat_id)
    else:
        await _send_tg(token, chat_id, "Noma'lum buyruq. /help - yordam")


# ═══════════════════════════════════════════
# ADMIN ENDPOINTS (Customer Bot)
# ═══════════════════════════════════════════

@customer_bot_router.get("/bot/config", response_model=TelegramBotConfig)
async def get_customer_bot_config(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get customer bot config."""
    config = await _get_config(db)
    # Mask token
    if config.bot_token:
        config.bot_token = config.bot_token[:10] + "..." + config.bot_token[-5:]
    return config


@customer_bot_router.put("/bot/config", response_model=TelegramBotConfig)
async def update_customer_bot_config(
    data: TelegramBotConfigUpdate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Update customer bot config."""
    config = await _get_config(db)
    if data.enabled is not None:
        config.enabled = data.enabled
    if data.bot_token is not None:
        config.bot_token = data.bot_token
    if data.bot_username is not None:
        config.bot_username = data.bot_username
    if data.welcome_message is not None:
        config.welcome_message = data.welcome_message
    await _save_config(db, config)
    return config


@customer_bot_router.post("/bot/set-webhook")
async def set_customer_bot_webhook(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Set Telegram webhook URL."""
    config = await _get_config(db)
    if not config.bot_token:
        raise HTTPException(status_code=400, detail="Bot token sozlanmagan")

    webhook_url = "https://api.smartcentr.store/api/v1/telegram/webhook"
    import httpx
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"https://api.telegram.org/bot{config.bot_token}/setWebhook",
            json={"url": webhook_url, "allowed_updates": ["message", "callback_query"]},
        )
        result = resp.json()

    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=f"Webhook o'rnatishda xato: {result}")

    return {"status": "ok", "webhook_url": webhook_url, "result": result}


@customer_bot_router.get("/bot/stats")
async def get_customer_bot_stats(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Bot statistikasi - nechta klient ulangan."""
    linked_count = (await db.execute(
        select(func.count(Setting.key)).where(Setting.key.like("TG_LINK_%"))
    )).scalar() or 0

    return {
        "linked_customers": linked_count,
    }
