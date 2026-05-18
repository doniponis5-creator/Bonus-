"""
Sbonus+ — Обработчик бонусных кампаний.
Используется и cron-таском, и эндпоинтом "Отправить сейчас".
"""

import asyncio
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    BonusAccount,
    BonusCampaign,
    BonusCampaignRecipient,
    CampaignStatus,
    CampaignTargetType,
    Customer,
    Setting,
    Transaction,
    TransactionType,
)


async def _ensure_recipients(db: AsyncSession, campaign: BonusCampaign) -> list[BonusCampaignRecipient]:
    """Получить или создать получателей в зависимости от target_type."""
    existing_result = await db.execute(
        select(BonusCampaignRecipient).where(BonusCampaignRecipient.campaign_id == campaign.id)
    )
    existing = existing_result.scalars().all()

    if campaign.target_type == CampaignTargetType.INDIVIDUAL:
        return list(existing)

    # ALL: если получателей нет — генерируем из всех активных клиентов
    if existing:
        return list(existing)

    customers_result = await db.execute(
        select(Customer.id).where(Customer.is_active == True)
    )
    customer_ids = [r[0] for r in customers_result.all()]
    for cid in customer_ids:
        db.add(BonusCampaignRecipient(campaign_id=campaign.id, customer_id=cid))
    await db.flush()

    refreshed = await db.execute(
        select(BonusCampaignRecipient).where(BonusCampaignRecipient.campaign_id == campaign.id)
    )
    return list(refreshed.scalars().all())


async def _get_whatsapp_config(db: AsyncSession) -> dict:
    result = await db.execute(
        select(Setting).where(Setting.key.in_([
            "ENABLE_WHATSAPP_NOTIFICATIONS",
            "GREENAPI_INSTANCE_ID",
            "GREENAPI_API_TOKEN",
        ]))
    )
    return {s.key: s.value for s in result.scalars().all()}


async def process_campaign(db: AsyncSession, campaign: BonusCampaign) -> int:
    """
    Обработать кампанию: начислить бонусы всем получателям, отправить WA.
    Возвращает количество успешных отправок.
    Не делает commit — это ответственность вызывающей стороны.
    """
    if campaign.status not in (CampaignStatus.PENDING,):
        return 0

    campaign.status = CampaignStatus.PROCESSING
    await db.flush()

    recipients = await _ensure_recipients(db, campaign)
    wa_cfg = await _get_whatsapp_config(db)
    wa_enabled = wa_cfg.get("ENABLE_WHATSAPP_NOTIFICATIONS") == "true"
    wa_instance = wa_cfg.get("GREENAPI_INSTANCE_ID")
    wa_token = wa_cfg.get("GREENAPI_API_TOKEN")

    # Filter out already-sent recipients
    pending = [r for r in recipients if r.status != "sent"]

    sent_count = 0
    BATCH_SIZE = 100
    txn_note = f"Кампания: {campaign.name}" + (f" — {campaign.reason}" if campaign.reason else "")

    for i in range(0, len(pending), BATCH_SIZE):
        batch = pending[i : i + BATCH_SIZE]
        batch_customer_ids = [r.customer_id for r in batch]

        # Batch-load customers
        cust_result = await db.execute(
            select(Customer).where(
                Customer.id.in_(batch_customer_ids),
                Customer.is_active == True,
            )
        )
        customers_by_id = {c.id: c for c in cust_result.scalars().all()}

        # Batch-load bonus accounts
        acct_result = await db.execute(
            select(BonusAccount).where(
                BonusAccount.customer_id.in_(batch_customer_ids)
            )
        )
        accounts_by_cid = {a.customer_id: a for a in acct_result.scalars().all()}

        for rec in batch:
            try:
                customer = customers_by_id.get(rec.customer_id)
                if not customer:
                    rec.status = "failed"
                    rec.error = "customer_not_found_or_inactive"
                    continue

                account = accounts_by_cid.get(customer.id)
                if not account:
                    account = BonusAccount(customer_id=customer.id)
                    db.add(account)
                    await db.flush()
                    accounts_by_cid[customer.id] = account

                account.balance += campaign.amount
                account.total_earned += campaign.amount

                txn = Transaction(
                    customer_id=customer.id,
                    type=TransactionType.CAMPAIGN,
                    amount=campaign.amount,
                    note=txn_note,
                )
                db.add(txn)

                rec.status = "sent"
                rec.sent_at = datetime.now(timezone.utc)
                sent_count += 1

                if wa_enabled and wa_instance and wa_token and campaign.message_template:
                    msg = (
                        campaign.message_template
                        .replace("{amount}", str(campaign.amount))
                        .replace("{balance}", str(account.balance))
                        .replace("{name}", customer.full_name)
                    )
                    from app.services.whatsapp import send_whatsapp_message
                    asyncio.create_task(send_whatsapp_message(
                        phone=customer.phone,
                        message=msg,
                        instance_id=wa_instance,
                        api_token=wa_token,
                    ))
            except Exception as e:
                rec.status = "failed"
                rec.error = str(e)[:500]

        # Flush each batch to keep memory usage bounded
        await db.flush()

    campaign.sent_count = sent_count
    campaign.sent_at = datetime.now(timezone.utc)
    campaign.status = CampaignStatus.SENT
    await db.flush()

    return sent_count
