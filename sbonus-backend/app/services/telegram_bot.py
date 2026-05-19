"""
Sbonus+ — Telegram бот для владельца.
Уведомления, дневная/ночная статистика, алерты подозрительных действий.

Команды:
  /start   — приветствие + привязка chat_id
  /stats   — полная статистика (клиенты, бонусы, транзакции)
  /today   — сводка за сегодня
  /week    — сводка за неделю
  /top     — TOP-5 клиентов по покупкам за месяц
  /help    — список команд
"""

import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

import httpx

from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.core.config import get_settings
from app.core.logging import get_logger
from app.models import (
    Customer, BonusAccount, Transaction, TransactionType,
    Setting, Tier, User,
)

logger = get_logger("telegram_bot")


# ═══════════════════════════════════════════
# TELEGRAM API CLIENT
# ═══════════════════════════════════════════

class TelegramBot:
    """Лёгкий клиент Telegram Bot API через httpx (без зависимостей)."""

    def __init__(self, token: str):
        self.token = token
        self.base_url = f"https://api.telegram.org/bot{token}"

    async def send_message(
        self, chat_id: str, text: str, parse_mode: str = "HTML"
    ) -> Optional[dict]:
        """Отправить сообщение в чат."""
        if not self.token or not chat_id:
            return None
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{self.base_url}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": text,
                        "parse_mode": parse_mode,
                    },
                )
                data = resp.json()
                if not data.get("ok"):
                    logger.warning("Telegram API error: %s", data)
                return data
        except Exception as e:
            logger.error("Telegram send error: %s", e)
            return None

    async def get_updates(self, offset: int = 0) -> list:
        """Получить обновления (long polling 25 сек)."""
        try:
            async with httpx.AsyncClient(timeout=35) as client:
                resp = await client.get(
                    f"{self.base_url}/getUpdates",
                    params={"offset": offset, "limit": 10, "timeout": 25},
                )
                data = resp.json()
                return data.get("result", [])
        except Exception:
            return []


# ═══════════════════════════════════════════
# CONFIG HELPERS (settings из БД)
# ═══════════════════════════════════════════

async def _get_tg_config(db: AsyncSession) -> dict:
    """Получить Telegram конфиг из таблицы settings."""
    result = await db.execute(
        select(Setting).where(Setting.key == "telegram_bot")
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return {"enabled": False, "bot_token": "", "chat_id": ""}
    import json
    try:
        return json.loads(row.value)
    except (json.JSONDecodeError, TypeError):
        return {"enabled": False, "bot_token": "", "chat_id": ""}


async def _get_bot(db: AsyncSession) -> Optional[TelegramBot]:
    """Создать TelegramBot если настроен и включён."""
    cfg = await _get_tg_config(db)
    if not cfg.get("enabled") or not cfg.get("bot_token"):
        return None
    return TelegramBot(cfg["bot_token"])


async def _get_chat_id(db: AsyncSession) -> Optional[str]:
    """Получить chat_id владельца."""
    cfg = await _get_tg_config(db)
    return cfg.get("chat_id") or None


# ═══════════════════════════════════════════
# STAT BUILDERS
# ═══════════════════════════════════════════

def _fmt(n) -> str:
    """Format number with thousands separator."""
    if isinstance(n, (Decimal, float)):
        return f"{n:,.0f}"
    return f"{n:,}"


async def build_stats_message(db: AsyncSession) -> str:
    """Полная статистика системы."""
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Customers + bonus
    q = await db.execute(
        select(
            func.count(Customer.id),
            func.count(Customer.id).filter(Customer.is_active == True),
            func.coalesce(func.sum(BonusAccount.total_earned), 0),
            func.coalesce(func.sum(BonusAccount.total_spent), 0),
            func.coalesce(func.sum(BonusAccount.balance), 0),
        ).outerjoin(BonusAccount, Customer.id == BonusAccount.customer_id)
    )
    total_c, active_c, earned, spent, balance = q.one()

    # Transactions today / month
    tq = await db.execute(
        select(
            func.count(Transaction.id).filter(Transaction.created_at >= today),
            func.count(Transaction.id).filter(Transaction.created_at >= month),
            func.coalesce(
                func.sum(Transaction.purchase_amount).filter(
                    and_(Transaction.created_at >= today, Transaction.type == TransactionType.EARN)
                ), 0
            ),
            func.coalesce(
                func.sum(Transaction.purchase_amount).filter(
                    and_(Transaction.created_at >= month, Transaction.type == TransactionType.EARN)
                ), 0
            ),
        )
    )
    txn_today, txn_month, revenue_today, revenue_month = tq.one()

    # New customers today
    new_today = (await db.execute(
        select(func.count(Customer.id)).where(Customer.created_at >= today)
    )).scalar() or 0

    return (
        "<b>S Bonus — Полная статистика</b>\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"👥 Клиентов: <b>{_fmt(total_c)}</b> (активных: {_fmt(active_c)})\n"
        f"🆕 Новых сегодня: <b>{new_today}</b>\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"💰 Всего начислено: <b>{_fmt(earned)}</b> KGS\n"
        f"💳 Всего списано: <b>{_fmt(spent)}</b> KGS\n"
        f"📊 Баланс системы: <b>{_fmt(balance)}</b> KGS\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"📋 Транзакций сегодня: <b>{_fmt(txn_today)}</b>\n"
        f"📋 Транзакций за месяц: <b>{_fmt(txn_month)}</b>\n"
        f"🛒 Выручка сегодня: <b>{_fmt(revenue_today)}</b> KGS\n"
        f"🛒 Выручка за месяц: <b>{_fmt(revenue_month)}</b> KGS\n"
    )


async def build_today_message(db: AsyncSession) -> str:
    """Сводка за сегодня."""
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    q = await db.execute(
        select(
            func.count(Transaction.id),
            func.coalesce(func.sum(Transaction.purchase_amount).filter(
                Transaction.type == TransactionType.EARN
            ), 0),
            func.coalesce(func.sum(Transaction.amount).filter(
                Transaction.type == TransactionType.EARN
            ), 0),
            func.coalesce(func.sum(Transaction.amount).filter(
                Transaction.type == TransactionType.SPEND
            ), 0),
        ).where(Transaction.created_at >= today)
    )
    txn_count, revenue, earned, spent = q.one()

    new_customers = (await db.execute(
        select(func.count(Customer.id)).where(Customer.created_at >= today)
    )).scalar() or 0

    return (
        f"<b>Сводка за {now.strftime('%d.%m.%Y')}</b>\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"🛒 Выручка: <b>{_fmt(revenue)}</b> KGS\n"
        f"📋 Транзакций: <b>{_fmt(txn_count)}</b>\n"
        f"💎 Начислено бонусов: <b>{_fmt(earned)}</b> KGS\n"
        f"💳 Списано бонусов: <b>{_fmt(spent)}</b> KGS\n"
        f"🆕 Новых клиентов: <b>{new_customers}</b>\n"
    )


async def build_week_message(db: AsyncSession) -> str:
    """Сводка за неделю."""
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    q = await db.execute(
        select(
            func.count(Transaction.id),
            func.coalesce(func.sum(Transaction.purchase_amount).filter(
                Transaction.type == TransactionType.EARN
            ), 0),
            func.coalesce(func.sum(Transaction.amount).filter(
                Transaction.type == TransactionType.EARN
            ), 0),
            func.coalesce(func.sum(Transaction.amount).filter(
                Transaction.type == TransactionType.SPEND
            ), 0),
        ).where(Transaction.created_at >= week_ago)
    )
    txn_count, revenue, earned, spent = q.one()

    new_customers = (await db.execute(
        select(func.count(Customer.id)).where(Customer.created_at >= week_ago)
    )).scalar() or 0

    return (
        "<b>Сводка за 7 дней</b>\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        f"🛒 Выручка: <b>{_fmt(revenue)}</b> KGS\n"
        f"📋 Транзакций: <b>{_fmt(txn_count)}</b>\n"
        f"💎 Начислено: <b>{_fmt(earned)}</b> KGS\n"
        f"💳 Списано: <b>{_fmt(spent)}</b> KGS\n"
        f"🆕 Новых клиентов: <b>{new_customers}</b>\n"
    )


async def build_top_message(db: AsyncSession) -> str:
    """TOP-5 клиентов по покупкам за месяц."""
    now = datetime.now(timezone.utc)
    month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    q = await db.execute(
        select(
            Customer.full_name,
            func.sum(Transaction.purchase_amount).label("total"),
        )
        .join(Transaction, Transaction.customer_id == Customer.id)
        .where(
            Transaction.created_at >= month,
            Transaction.type == TransactionType.EARN,
        )
        .group_by(Customer.id, Customer.full_name)
        .order_by(func.sum(Transaction.purchase_amount).desc())
        .limit(5)
    )
    rows = q.all()

    if not rows:
        return "Пока нет данных за текущий месяц."

    lines = ["<b>TOP-5 клиентов за месяц</b>\n━━━━━━━━━━━━━━━━━━━━"]
    for i, (name, total) in enumerate(rows, 1):
        medal = ["🥇", "🥈", "🥉", "4.", "5."][i - 1]
        lines.append(f"{medal} {name} — <b>{_fmt(total)}</b> KGS")
    return "\n".join(lines)


# ═══════════════════════════════════════════
# ALERT NOTIFICATIONS (вызываются из сервисов)
# ═══════════════════════════════════════════

async def notify_large_spend(customer_name: str, amount: float, balance_after: float):
    """Алерт: крупное списание бонусов (> 5000)."""
    async with async_session() as db:
        bot = await _get_bot(db)
        chat_id = await _get_chat_id(db)
        if not bot or not chat_id:
            return
        text = (
            "⚠️ <b>Крупное списание!</b>\n"
            f"👤 {customer_name}\n"
            f"➖ Списано: <b>{_fmt(amount)}</b> KGS\n"
            f"💰 Остаток: {_fmt(balance_after)} KGS"
        )
        await bot.send_message(chat_id, text)


async def notify_transaction_reverse(customer_name: str, amount: float, reason: str):
    """Алерт: возврат транзакции."""
    async with async_session() as db:
        bot = await _get_bot(db)
        chat_id = await _get_chat_id(db)
        if not bot or not chat_id:
            return
        text = (
            "🔄 <b>Возврат транзакции!</b>\n"
            f"👤 {customer_name}\n"
            f"💰 Сумма: <b>{_fmt(amount)}</b> KGS\n"
            f"📝 Причина: {reason}"
        )
        await bot.send_message(chat_id, text)


async def notify_new_customer(name: str, phone: str):
    """Уведомление: новый клиент зарегистрирован."""
    async with async_session() as db:
        bot = await _get_bot(db)
        chat_id = await _get_chat_id(db)
        if not bot or not chat_id:
            return
        cfg = await _get_tg_config(db)
        if not cfg.get("notify_new_customers", True):
            return
        text = (
            "🆕 <b>Новый клиент!</b>\n"
            f"👤 {name}\n"
            f"📱 {phone}"
        )
        await bot.send_message(chat_id, text)


async def notify_large_earn(customer_name: str, purchase: float, bonus: float):
    """Алерт: крупная покупка (> 50000)."""
    async with async_session() as db:
        bot = await _get_bot(db)
        chat_id = await _get_chat_id(db)
        if not bot or not chat_id:
            return
        text = (
            "🛒 <b>Крупная покупка!</b>\n"
            f"👤 {customer_name}\n"
            f"🛍 Сумма: <b>{_fmt(purchase)}</b> KGS\n"
            f"💎 Бонус: +{_fmt(bonus)} KGS"
        )
        await bot.send_message(chat_id, text)


# ═══════════════════════════════════════════
# SCHEDULED REPORTS (вызываются из cron)
# ═══════════════════════════════════════════

async def send_daily_morning_report():
    """Утренний отчёт — 09:00 каждый день."""
    async with async_session() as db:
        bot = await _get_bot(db)
        chat_id = await _get_chat_id(db)
        if not bot or not chat_id:
            return
        cfg = await _get_tg_config(db)
        if not cfg.get("daily_report", True):
            return
        text = await build_stats_message(db)
        text = "☀️ " + text
        await bot.send_message(chat_id, text)
    logger.info("Telegram: morning report sent")


async def send_daily_evening_report():
    """Вечерний отчёт — 21:00 каждый день."""
    async with async_session() as db:
        bot = await _get_bot(db)
        chat_id = await _get_chat_id(db)
        if not bot or not chat_id:
            return
        cfg = await _get_tg_config(db)
        if not cfg.get("daily_report", True):
            return
        text = await build_today_message(db)
        text = "🌙 " + text
        await bot.send_message(chat_id, text)
    logger.info("Telegram: evening report sent")


# ═══════════════════════════════════════════
# POLLING LOOP (для обработки команд)
# ═══════════════════════════════════════════

_polling_task: Optional[asyncio.Task] = None


async def _handle_command(bot: TelegramBot, chat_id: str, command: str):
    """Обработать команду от владельца."""
    async with async_session() as db:
        if command == "/start":
            # Сохраняем chat_id
            result = await db.execute(
                select(Setting).where(Setting.key == "telegram_bot")
            )
            row = result.scalar_one_or_none()
            if row and row.value:
                import json
                cfg = json.loads(row.value)
                cfg["chat_id"] = chat_id
                row.value = json.dumps(cfg)
                await db.commit()
            await bot.send_message(chat_id, (
                "✅ <b>S Bonus бот подключён!</b>\n\n"
                "Ваш chat_id сохранён. Теперь вы будете получать уведомления.\n\n"
                "<b>Команды:</b>\n"
                "/stats — полная статистика\n"
                "/today — сводка за сегодня\n"
                "/week — сводка за неделю\n"
                "/top — TOP-5 клиентов\n"
                "/help — помощь"
            ))
        elif command == "/stats":
            text = await build_stats_message(db)
            await bot.send_message(chat_id, text)
        elif command == "/today":
            text = await build_today_message(db)
            await bot.send_message(chat_id, text)
        elif command == "/week":
            text = await build_week_message(db)
            await bot.send_message(chat_id, text)
        elif command == "/top":
            text = await build_top_message(db)
            await bot.send_message(chat_id, text)
        elif command == "/help":
            await bot.send_message(chat_id, (
                "<b>S Bonus — Команды</b>\n"
                "━━━━━━━━━━━━━━━━━━━━\n"
                "/stats — полная статистика\n"
                "/today — сводка за сегодня\n"
                "/week — сводка за неделю\n"
                "/top — TOP-5 клиентов\n"
                "/help — список команд"
            ))


async def _poll_loop():
    """Polling цикл для обработки команд (с Redis lock для single-instance)."""
    from app.core.redis import redis_client

    offset = 0
    lock_key = "tg_bot_poll_lock"

    while True:
        try:
            # Redis lock: только один воркер обрабатывает updates
            acquired = await redis_client.set(lock_key, "1", nx=True, ex=60)
            if not acquired:
                await asyncio.sleep(10)
                continue

            async with async_session() as db:
                bot = await _get_bot(db)
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
                    if text.startswith("/"):
                        cmd = text.split()[0].split("@")[0].lower()
                        await _handle_command(bot, chat_id, cmd)

            # Продлить lock
            await redis_client.expire(lock_key, 60)

        except Exception as e:
            logger.error("Telegram poll error: %s", e)
            await asyncio.sleep(5)
            continue

        await asyncio.sleep(1)


def start_polling():
    """Запустить polling в фоне (вызывается из main.py lifespan)."""
    global _polling_task
    if _polling_task and not _polling_task.done():
        return
    _polling_task = asyncio.create_task(_poll_loop())
    logger.info("Telegram bot polling started")


def stop_polling():
    """Остановить polling."""
    global _polling_task
    if _polling_task and not _polling_task.done():
        _polling_task.cancel()
        logger.info("Telegram bot polling stopped")
