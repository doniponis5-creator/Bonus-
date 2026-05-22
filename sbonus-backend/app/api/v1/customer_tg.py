"""
Sbonus+ — Customer Telegram Bot admin API.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User, UserRoleEnum, Setting

router = APIRouter(prefix="/customer-tg-bot", tags=["customer-telegram-bot"])


class CustomerBotConfig(BaseModel):
    enabled: bool = False
    bot_token: str = ""
    bot_username: Optional[str] = None


class CustomerBotStats(BaseModel):
    enabled: bool
    linked_customers: int
    bot_username: Optional[str]


@router.get("/config", response_model=CustomerBotConfig)
async def get_bot_config(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != UserRoleEnum.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Faqat super admin")
    result = await db.execute(select(Setting).where(Setting.key == "CUSTOMER_TELEGRAM_BOT"))
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return CustomerBotConfig()
    import json
    try:
        cfg = json.loads(row.value)
        return CustomerBotConfig(**cfg)
    except Exception:
        return CustomerBotConfig()


@router.put("/config", response_model=CustomerBotConfig)
async def update_bot_config(
    data: CustomerBotConfig,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != UserRoleEnum.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Faqat super admin")
    import json
    value = json.dumps(data.dict())
    result = await db.execute(select(Setting).where(Setting.key == "CUSTOMER_TELEGRAM_BOT"))
    row = result.scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(Setting(key="CUSTOMER_TELEGRAM_BOT", value=value))
    await db.commit()
    return data


@router.get("/stats", response_model=CustomerBotStats)
async def get_bot_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role != UserRoleEnum.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Faqat super admin")

    # Count linked customers
    linked = (await db.execute(
        select(func.count(Setting.key)).where(Setting.key.like("TG_CUSTOMER_%"))
    )).scalar() or 0

    # Get config
    result = await db.execute(select(Setting).where(Setting.key == "CUSTOMER_TELEGRAM_BOT"))
    row = result.scalar_one_or_none()
    enabled = False
    bot_username = None
    if row and row.value:
        import json
        try:
            cfg = json.loads(row.value)
            enabled = cfg.get("enabled", False)
            bot_username = cfg.get("bot_username")
        except Exception:
            pass

    return CustomerBotStats(enabled=enabled, linked_customers=linked, bot_username=bot_username)
