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
    CustomerAuthToken,
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


async def _get_campaign_config(db: AsyncSession) -> dict:
    """Загрузить все настройки кампаний + WhatsApp из БД."""
    result = await db.execute(
        select(Setting).where(Setting.key.in_([
            "ENABLE_WHATSAPP_NOTIFICATIONS",
            "GREENAPI_INSTANCE_ID",
            "GREENAPI_API_TOKEN",
            "WA_MESSAGE_INTERVAL",
            "CAMPAIGN_BATCH_SIZE",
            "CAMPAIGN_BATCH_PAUSE",
        ]))
    )
    return {s.key: s.value for s in result.scalars().all()}


async def process_campaign(db: AsyncSession, campaign: BonusCampaign) -> int:
    """
    Обработать кампанию: начислить бонусы всем получателям, отправить WA.
    Возвращает количество успешных отправок.
    Не делает commit — это ответственность вызывающей стороны.
    """
    if campaign.status not in (CampaignStatus.PENDING, CampaignStatus.PROCESSING):
        return 0

    campaign.status = CampaignStatus.PROCESSING
    await db.flush()

    recipients = await _ensure_recipients(db, campaign)
    cfg = await _get_campaign_config(db)
    wa_enabled = cfg.get("ENABLE_WHATSAPP_NOTIFICATIONS") == "true"
    wa_instance = cfg.get("GREENAPI_INSTANCE_ID")
    wa_token = cfg.get("GREENAPI_API_TOKEN")

    # Filter out already-sent recipients (дубликат ҳимояси)
    pending = [r for r in recipients if r.status != "sent"]

    # Интервал между WhatsApp сообщениями (по умолчанию 3 секунды)
    wa_interval = float(cfg.get("WA_MESSAGE_INTERVAL", "3"))

    # Размер батча и пауза между батчами (из DB Settings)
    BATCH_SIZE = int(cfg.get("CAMPAIGN_BATCH_SIZE", "50"))
    BATCH_PAUSE = float(cfg.get("CAMPAIGN_BATCH_PAUSE", "30"))

    import logging
    logger = logging.getLogger("sbonus.campaign")
    logger.info(
        f"Кампания «{campaign.name}»: {len(pending)} получателей, "
        f"batch={BATCH_SIZE}, пауза={BATCH_PAUSE}с, интервал WA={wa_interval}с"
    )

    sent_count = 0
    total_batches = (len(pending) + BATCH_SIZE - 1) // BATCH_SIZE if pending else 0
    txn_note = f"Кампания: {campaign.name}" + (f" — {campaign.reason}" if campaign.reason else "")

    for batch_num, i in enumerate(range(0, len(pending), BATCH_SIZE), 1):
        batch = pending[i : i + BATCH_SIZE]

        logger.info(f"  Батч {batch_num}/{total_batches}: отправка {len(batch)} сообщений...")
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

        is_wheel = getattr(campaign, "campaign_type", "bonus") == "wheel"

        for rec in batch:
            try:
                customer = customers_by_id.get(rec.customer_id)
                if not customer:
                    rec.status = "failed"
                    rec.error = "customer_not_found_or_inactive"
                    continue

                if is_wheel:
                    # Wheel campaign: gift free spins instead of bonus
                    free_key = f"WHEEL_FREE_SPINS_{customer.id}"
                    free_result = await db.execute(
                        select(Setting).where(Setting.key == free_key)
                    )
                    free_record = free_result.scalar_one_or_none()
                    if free_record:
                        try:
                            current = int(free_record.value)
                        except (ValueError, TypeError):
                            current = 0
                        free_record.value = str(current + 1)
                    else:
                        db.add(Setting(key=free_key, value="1"))
                else:
                    # Bonus campaign: add bonus to balance
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
                    import secrets
                    from datetime import timedelta

                    balance_str = "0"
                    acct = accounts_by_cid.get(customer.id)
                    if acct:
                        balance_str = str(acct.balance)

                    from app.core.config import get_settings
                    cfg = get_settings()
                    cabinet_base = cfg.customer_cabinet_base_url.rstrip("/")

                    # Magic-link для прямого доступа (все типы кампаний)
                    token_value = secrets.token_urlsafe(32)[:64]
                    auth_token = CustomerAuthToken(
                        customer_id=customer.id,
                        token=token_value,
                        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
                    )
                    db.add(auth_token)

                    if is_wheel:
                        cabinet_link = f"{cabinet_base}/wheel?token={token_value}"
                    else:
                        cabinet_link = f"{cabinet_base}?token={token_value}"

                    msg = (
                        campaign.message_template
                        .replace("{amount}", str(campaign.amount))
                        .replace("{balance}", balance_str)
                        .replace("{name}", customer.full_name)
                        .replace("{link}", cabinet_link)
                    )
                    from app.services.whatsapp import send_whatsapp_message
                    try:
                        await send_whatsapp_message(
                            phone=customer.phone,
                            message=msg,
                            instance_id=wa_instance,
                            api_token=wa_token,
                        )
                    except Exception as wa_err:
                        logger.warning(f"WhatsApp отправка не удалась для {customer.phone}: {wa_err}")
                    # Задержка между сообщениями (защита от блокировки WhatsApp)
                    if wa_interval > 0:
                        await asyncio.sleep(wa_interval)
            except Exception as e:
                rec.status = "failed"
                rec.error = str(e)[:500]

        # Flush each batch to keep memory usage bounded
        await db.flush()
        logger.info(f"  Батч {batch_num}/{total_batches} завершён: отправлено {sent_count}")

        # Пауза между батчами (защита от блокировки WhatsApp)
        if BATCH_PAUSE > 0 and i + BATCH_SIZE < len(pending):
            logger.info(f"  Пауза {BATCH_PAUSE}с перед следующим батчем...")
            await asyncio.sleep(BATCH_PAUSE)

    logger.info(f"Кампания «{campaign.name}» завершена: {sent_count}/{len(pending)} отправлено")
    campaign.sent_count = sent_count
    campaign.sent_at = datetime.now(timezone.utc)
    campaign.status = CampaignStatus.SENT
    await db.flush()

    return sent_count
