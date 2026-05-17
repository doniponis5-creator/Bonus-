"""
Sbonus+ — Cron задача: обработка бонусных кампаний.
Запускается каждый день в 09:00 (Asia/Bishkek).
Находит pending кампании с bonus_date == сегодня и обрабатывает их.
"""

from datetime import date

from sqlalchemy import select

from app.core.database import async_session
from app.models import BonusCampaign, CampaignStatus
from app.services.campaign_runner import process_campaign


async def process_due_campaigns() -> None:
    today = date.today()
    async with async_session() as db:
        result = await db.execute(
            select(BonusCampaign).where(
                BonusCampaign.bonus_date <= today,
                BonusCampaign.status == CampaignStatus.PENDING,
            )
        )
        due = result.scalars().all()
        total_sent = 0
        for campaign in due:
            try:
                sent = await process_campaign(db, campaign)
                total_sent += sent
                print(f"  ✅ Кампания '{campaign.name}' ({campaign.bonus_date}): {sent} получ.")
            except Exception as e:
                print(f"  ❌ Ошибка кампании {campaign.id}: {e}")
        await db.commit()
        print(f"  📊 Кампаний обработано: {len(due)}, бонусов начислено: {total_sent}")
