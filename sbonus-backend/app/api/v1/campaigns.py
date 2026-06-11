"""
Sbonus+ — Бонусные кампании.
Админ создаёт кампанию на конкретную дату, в указанный день cron-таск
начисляет бонусы выбранным клиентам и отправляет WhatsApp.

POST   /api/v1/admin/campaigns           — создать
GET    /api/v1/admin/campaigns           — список
GET    /api/v1/admin/campaigns/{id}      — детали + получатели
POST   /api/v1/admin/campaigns/{id}/send — отправить вручную (без ожидания cron)
POST   /api/v1/admin/campaigns/{id}/cancel — отменить pending
DELETE /api/v1/admin/campaigns/{id}      — удалить (только pending/cancelled)
"""

import asyncio
import logging
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db, async_session
from app.core.security import UserRole, get_current_user, require_role
from app.models import (
    BonusCampaign,
    BonusCampaignRecipient,
    CampaignStatus,
    CampaignTargetType,
    Customer,
)
from app.schemas import (
    BonusCampaignCreateRequest,
    BonusCampaignRecipientResponse,
    BonusCampaignResponse,
)
from app.services.campaign_runner import process_campaign

router = APIRouter(prefix="/admin/campaigns", tags=["Бонусные кампании"])


def _campaign_to_response(c: BonusCampaign, recipients_count: int = 0) -> BonusCampaignResponse:
    return BonusCampaignResponse(
        id=c.id,
        name=c.name,
        campaign_type=getattr(c, "campaign_type", "bonus") or "bonus",
        bonus_date=c.bonus_date,
        amount=c.amount,
        reason=c.reason,
        message_template=c.message_template,
        target_type=c.target_type.value,
        status=c.status.value,
        sent_count=c.sent_count,
        recipients_count=recipients_count,
        created_at=c.created_at,
        sent_at=c.sent_at,
    )


@router.post(
    "",
    response_model=BonusCampaignResponse,
    status_code=201,
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def create_campaign(
    body: BonusCampaignCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> BonusCampaignResponse:
    """Создать новую бонусную кампанию."""
    if body.target_type not in ("all", "individual"):
        raise HTTPException(status_code=400, detail={"code": "INVALID_TARGET_TYPE", "message": "target_type должен быть 'all' или 'individual'"})

    if body.target_type == "individual" and not body.customer_ids:
        raise HTTPException(status_code=400, detail={"code": "MISSING_CUSTOMERS", "message": "Для individual необходимо передать customer_ids"})

    c_type = body.campaign_type if body.campaign_type in ("bonus", "wheel") else "bonus"

    # Для бонусных кампаний сумма обязательна
    if c_type == "bonus" and (not body.amount or body.amount <= 0):
        raise HTTPException(status_code=400, detail={"code": "INVALID_AMOUNT", "message": "Сумма бонуса должна быть больше 0"})

    campaign = BonusCampaign(
        name=body.name,
        campaign_type=c_type,
        bonus_date=body.bonus_date,
        amount=body.amount or 0,
        reason=body.reason,
        message_template=body.message_template,
        target_type=CampaignTargetType(body.target_type),
        status=CampaignStatus.PENDING,
        created_by=uuid.UUID(current_user["sub"]) if current_user.get("sub") else None,
    )
    db.add(campaign)
    await db.flush()

    # Заранее создаём получателей для individual; для all — формируем при отправке
    recipients_count = 0
    if body.target_type == "individual" and body.customer_ids:
        # Проверка существования клиентов
        result = await db.execute(
            select(Customer.id).where(Customer.id.in_(body.customer_ids), Customer.is_active == True)
        )
        valid_ids = [r[0] for r in result.all()]
        for cid in valid_ids:
            db.add(BonusCampaignRecipient(campaign_id=campaign.id, customer_id=cid))
        recipients_count = len(valid_ids)
        await db.flush()

    await db.commit()
    return _campaign_to_response(campaign, recipients_count=recipients_count)


@router.get(
    "",
    response_model=list[BonusCampaignResponse],
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def list_campaigns(
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
) -> list[BonusCampaignResponse]:
    """Список всех кампаний."""
    q = select(BonusCampaign).order_by(BonusCampaign.bonus_date.desc(), BonusCampaign.created_at.desc())
    if status_filter:
        q = q.where(BonusCampaign.status == CampaignStatus(status_filter))
    result = await db.execute(q)
    campaigns = result.scalars().all()

    # Подсчёт получателей одной выборкой
    counts_result = await db.execute(
        select(BonusCampaignRecipient.campaign_id, func.count())
        .group_by(BonusCampaignRecipient.campaign_id)
    )
    counts = {cid: cnt for cid, cnt in counts_result.all()}

    return [_campaign_to_response(c, recipients_count=counts.get(c.id, 0)) for c in campaigns]


@router.get(
    "/{campaign_id}",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def get_campaign(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Детали кампании + список получателей."""
    result = await db.execute(
        select(BonusCampaign).where(BonusCampaign.id == campaign_id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail={"code": "CAMPAIGN_NOT_FOUND"})

    # Получатели + клиент
    rec_result = await db.execute(
        select(BonusCampaignRecipient)
        .options(selectinload(BonusCampaignRecipient.customer))
        .where(BonusCampaignRecipient.campaign_id == campaign_id)
        .order_by(BonusCampaignRecipient.created_at.asc())
    )
    recipients = rec_result.scalars().all()

    return {
        "campaign": _campaign_to_response(campaign, recipients_count=len(recipients)).model_dump(mode="json"),
        "recipients": [
            BonusCampaignRecipientResponse(
                customer_id=r.customer_id,
                customer_name=r.customer.full_name if r.customer else "—",
                customer_phone=r.customer.phone if r.customer else "—",
                status=r.status,
                sent_at=r.sent_at,
                error=r.error,
            ).model_dump(mode="json")
            for r in recipients
        ],
    }


logger = logging.getLogger("sbonus.campaign")


async def _run_campaign_in_background(campaign_id: uuid.UUID):
    """Фоновая задача: отправка кампании без блокировки HTTP запроса."""
    async with async_session() as db:
        try:
            result = await db.execute(
                select(BonusCampaign).where(BonusCampaign.id == campaign_id)
            )
            campaign = result.scalar_one_or_none()
            if not campaign or campaign.status != CampaignStatus.PROCESSING:
                return
            sent = await process_campaign(db, campaign)
            await db.commit()
            logger.info(f"Фоновая отправка кампании «{campaign.name}» завершена: {sent} отправлено")
        except Exception as e:
            await db.rollback()
            logger.error(f"Ошибка фоновой отправки кампании {campaign_id}: {e}")
            # НЕ возвращаем в PENDING (раньше это вызывало авто-переотправку утром).
            # Кампания остаётся PROCESSING; отправленные получатели уже закоммичены,
            # cron-восстановление продолжит с места остановки (только не-sent).
            logger.error(
                f"Кампания {campaign_id} остановлена с ошибкой — будет продолжена "
                f"cron-восстановлением (только неотправленные получатели)"
            )


@router.post(
    "/{campaign_id}/send",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def send_campaign_now(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Запустить отправку кампании немедленно (фоновая задача, без ожидания)."""
    result = await db.execute(select(BonusCampaign).where(BonusCampaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail={"code": "CAMPAIGN_NOT_FOUND"})
    if campaign.status not in (CampaignStatus.PENDING,):
        raise HTTPException(status_code=400, detail={"code": "CAMPAIGN_NOT_PENDING", "message": f"Статус: {campaign.status.value}"})

    # АТОМАРНЫЙ claim: UPDATE ... WHERE status='pending'.
    # Двойной клик / гонка с cron не запустят кампанию дважды.
    from sqlalchemy import update as sa_update
    claim = await db.execute(
        sa_update(BonusCampaign)
        .where(
            BonusCampaign.id == campaign_id,
            BonusCampaign.status == CampaignStatus.PENDING,
        )
        .values(status=CampaignStatus.PROCESSING)
    )
    await db.commit()
    if claim.rowcount == 0:
        raise HTTPException(
            status_code=409,
            detail={"code": "CAMPAIGN_ALREADY_RUNNING", "message": "Кампания уже запущена"},
        )

    # Запускаем в фоне — HTTP ответ возвращается мгновенно
    asyncio.create_task(_run_campaign_in_background(campaign_id))

    return {"success": True, "message": "Кампания запущена в фоновом режиме", "status": "processing"}


@router.post(
    "/{campaign_id}/cancel",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))],
)
async def cancel_campaign(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Отменить pending кампанию."""
    result = await db.execute(select(BonusCampaign).where(BonusCampaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail={"code": "CAMPAIGN_NOT_FOUND"})
    if campaign.status != CampaignStatus.PENDING:
        raise HTTPException(status_code=400, detail={"code": "CAMPAIGN_NOT_PENDING"})

    campaign.status = CampaignStatus.CANCELLED
    await db.commit()
    return {"success": True}


@router.delete(
    "/{campaign_id}",
    dependencies=[Depends(require_role(UserRole.SUPER_ADMIN))],
)
async def delete_campaign(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Удалить кампанию (только pending или cancelled)."""
    result = await db.execute(select(BonusCampaign).where(BonusCampaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail={"code": "CAMPAIGN_NOT_FOUND"})
    if campaign.status not in (CampaignStatus.PENDING, CampaignStatus.CANCELLED):
        raise HTTPException(status_code=400, detail={"code": "CAMPAIGN_ALREADY_PROCESSED"})

    await db.delete(campaign)
    await db.commit()
    return {"success": True}
