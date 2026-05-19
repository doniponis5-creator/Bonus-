"""
Sbonus+ — WhatsApp рассылки API.
GET  /api/v1/admin/wa-broadcast/segments       — список сегментов с количеством
POST /api/v1/admin/wa-broadcast/preview         — предпросмотр сегмента
POST /api/v1/admin/wa-broadcast/send            — отправить рассылку
GET  /api/v1/admin/wa-broadcast/triggers        — конфиг авто-триггеров
PUT  /api/v1/admin/wa-broadcast/triggers        — обновить авто-триггеры
"""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import UserRole, require_role, get_current_user
from app.models import Setting
from app.services.audit import log_audit
from app.services.wa_broadcast import (
    get_segment_customers,
    get_segment_count,
    send_broadcast,
)

router = APIRouter(prefix="/admin/wa-broadcast", tags=["WhatsApp рассылки"])

SEGMENTS = [
    {"id": "all", "name": "Все клиенты", "description": "Все активные клиенты"},
    {"id": "sleeping", "name": "Спящие", "description": "Нет покупок 30+ дней"},
    {"id": "vip", "name": "VIP", "description": "Gold и Platinum уровни"},
    {"id": "new", "name": "Новички", "description": "Зарегистрированы за 7 дней"},
    {"id": "birthday", "name": "Именинники", "description": "День рождения сегодня"},
    {"id": "high_balance", "name": "Богатые бонусами", "description": "Баланс > порога"},
    {"id": "low_balance", "name": "Мало бонусов", "description": "Баланс < порога, но > 0"},
]


# ═══════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════

class BroadcastRequest(BaseModel):
    segment: str
    message: str = Field(..., min_length=5, max_length=2000)
    threshold: Optional[float] = None


class AutoTriggerConfig(BaseModel):
    sleeping_enabled: bool = False
    sleeping_days: int = Field(30, ge=7, le=365)
    sleeping_template: str = "Привет, {name}! Давно не виделись! У вас {balance} KGS бонусов. Ждём вас! {link}"
    birthday_enabled: bool = False
    birthday_template: str = "С днём рождения, {name}! Ваш баланс: {balance} KGS. Приходите за подарком! {link}"


# ═══════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════

@router.get(
    "/segments",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def list_segments(db: AsyncSession = Depends(get_db)) -> list:
    """Список сегментов с количеством клиентов."""
    result = []
    for seg in SEGMENTS:
        count = await get_segment_count(db, seg["id"])
        result.append({**seg, "count": count})
    return result


@router.post(
    "/preview",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def preview_segment(
    body: BroadcastRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Предпросмотр: список клиентов в сегменте + пример сообщения."""
    customers = await get_segment_customers(db, body.segment, body.threshold)
    # Показываем первых 10
    preview_list = customers[:10]

    # Пример сообщения для первого клиента
    example = ""
    if preview_list:
        c = preview_list[0]
        from app.core.config import get_settings
        cfg = get_settings()
        example = (
            body.message
            .replace("{name}", c["full_name"])
            .replace("{balance}", f"{c['balance']:,.0f}")
            .replace("{link}", cfg.customer_cabinet_base_url.rstrip("/"))
        )

    return {
        "total": len(customers),
        "preview": preview_list,
        "example_message": example,
    }


@router.post(
    "/send",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def send_broadcast_endpoint(
    body: BroadcastRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Отправить WhatsApp рассылку по сегменту."""
    result = await send_broadcast(db, body.segment, body.message, body.threshold)

    # Audit
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    await log_audit(
        db, "wa_broadcast", "broadcast", None,
        uuid.UUID(current_user["sub"]),
        {"segment": body.segment, "sent": result.get("sent", 0), "total": result.get("total", 0)},
        ip,
    )
    await db.commit()

    return result


@router.get(
    "/triggers",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def get_triggers(db: AsyncSession = Depends(get_db)) -> dict:
    """Получить конфигурацию авто-триггеров."""
    result = await db.execute(
        select(Setting).where(Setting.key == "wa_auto_triggers")
    )
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return AutoTriggerConfig().model_dump()
    try:
        return json.loads(row.value)
    except (json.JSONDecodeError, TypeError):
        return AutoTriggerConfig().model_dump()


@router.put(
    "/triggers",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def update_triggers(
    body: AutoTriggerConfig,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Обновить конфигурацию авто-триггеров."""
    result = await db.execute(
        select(Setting).where(Setting.key == "wa_auto_triggers")
    )
    row = result.scalar_one_or_none()
    data = body.model_dump()

    if not row:
        row = Setting(key="wa_auto_triggers", value=json.dumps(data))
        db.add(row)
    else:
        row.value = json.dumps(data)

    # Audit
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    await log_audit(
        db, "wa_triggers_config", "settings", None,
        uuid.UUID(current_user["sub"]),
        {"sleeping_enabled": body.sleeping_enabled, "birthday_enabled": body.birthday_enabled},
        ip,
    )

    await db.commit()
    return {"status": "ok", "message": "Авто-триггеры сохранены"}
