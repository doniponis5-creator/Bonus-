"""
Sbonus+ — API маршруты для Telegram бот настроек.
GET  /api/v1/admin/telegram/config
PUT  /api/v1/admin/telegram/config
POST /api/v1/admin/telegram/test
"""

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import UserRole, require_role, get_current_user
from app.models import Setting
from app.services.audit import log_audit
from app.services.telegram_bot import TelegramBot

router = APIRouter(prefix="/admin/telegram", tags=["Telegram бот"])


# ═══════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════

class TelegramConfigRequest(BaseModel):
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


# ═══════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════

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
        # Маскируем токен
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
        # Если токен не пришёл (masked), сохраняем старый
        if body.bot_token == "" or body.bot_token.endswith("..."):
            old = json.loads(row.value) if row.value else {}
            config_data["bot_token"] = old.get("bot_token", "")
        row.value = json.dumps(config_data)

    # Audit
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
