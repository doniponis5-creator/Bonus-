"""
Sbonus+ — Cron задача: обработка бонусных кампаний.
Запускается каждый день в 09:00 (Asia/Bishkek).

1. Находит PENDING кампании с bonus_date <= сегодня и обрабатывает их.
2. ВОССТАНОВЛЕНИЕ: находит кампании, зависшие в PROCESSING без активности
   30+ минут (крэш/рестарт контейнера), и продолжает их с места остановки.
   Безопасно: process_campaign шлёт только получателей со status != "sent",
   а статусы коммитятся после каждого батча.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.database import async_session
from app.models import BonusCampaign, BonusCampaignRecipient, CampaignStatus
from app.services.campaign_runner import process_campaign


async def process_due_campaigns() -> None:
    today = date.today()
    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(minutes=30)

    async with async_session() as db:
        # 1) Обычные PENDING кампании на сегодня
        result = await db.execute(
            select(BonusCampaign).where(
                BonusCampaign.bonus_date <= today,
                BonusCampaign.status == CampaignStatus.PENDING,
            )
        )
        due = list(result.scalars().all())

        # 2) Зависшие PROCESSING: последняя отправка получателю старше 30 мин
        #    (или отправок не было вовсе, а кампания создана давно)
        stuck_result = await db.execute(
            select(BonusCampaign).where(
                BonusCampaign.status == CampaignStatus.PROCESSING,
                BonusCampaign.created_at < stale_cutoff,
            )
        )
        for camp in stuck_result.scalars().all():
            last_sent = await db.execute(
                select(func.max(BonusCampaignRecipient.sent_at)).where(
                    BonusCampaignRecipient.campaign_id == camp.id
                )
            )
            last = last_sent.scalar()
            if last is None or last < stale_cutoff:
                print(f"  🔁 Восстановление зависшей кампании '{camp.name}' (id={camp.id})")
                due.append(camp)

        total_sent = 0
        for campaign in due:
            try:
                sent = await process_campaign(db, campaign)
                total_sent += sent
                await db.commit()
                print(f"  ✅ Кампания '{campaign.name}' ({campaign.bonus_date}): {sent} получ.")
            except Exception as e:
                await db.rollback()
                print(f"  ❌ Ошибка кампании {campaign.id}: {e}")
        print(f"  📊 Кампаний обработано: {len(due)}, бонусов начислено: {total_sent}")
