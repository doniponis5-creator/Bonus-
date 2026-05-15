"""
Sbonus+ — Cron задача: бонус ко дню рождения.
Запускается каждый день в 09:00 (Asia/Bishkek).
+200 KGS каждому клиенту у которого сегодня день рождения.
"""

from datetime import date, datetime, timezone

from sqlalchemy import and_, extract, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import async_session
from app.models import Customer, Transaction, TransactionType
from app.services.bonus import BonusService

settings = get_settings()


async def process_birthday_bonuses() -> None:
    """
    Найти всех клиентов с днём рождения сегодня и начислить бонус.
    Проверяет что бонус не был начислен в этом году (дубликат).
    """
    today = date.today()
    year_start = datetime(today.year, 1, 1, tzinfo=timezone.utc)

    async with async_session() as db:
        # Клиенты с днём рождения сегодня
        result = await db.execute(
            select(Customer).where(
                and_(
                    extract("month", Customer.birth_date) == today.month,
                    extract("day", Customer.birth_date) == today.day,
                    Customer.is_active == True,
                    Customer.birth_date.isnot(None),
                )
            )
        )
        birthday_customers = result.scalars().all()

        count = 0
        for customer in birthday_customers:
            # Проверка: не начисляли ли уже в этом году
            existing = await db.execute(
                select(Transaction).where(
                    and_(
                        Transaction.customer_id == customer.id,
                        Transaction.type == TransactionType.BIRTHDAY,
                        Transaction.created_at >= year_start,
                    )
                )
            )
            if existing.scalar_one_or_none():
                continue  # Уже начислен в этом году

            svc = BonusService(db)
            try:
                await svc.birthday_bonus(customer.id)
                count += 1
                print(f"  🎂 +{settings.birthday_bonus} KGS → {customer.full_name} ({customer.phone})")
            except Exception as e:
                print(f"  ❌ Ошибка для {customer.phone}: {e}")

        await db.commit()
        print(f"  ✅ Бонус ко дню рождения: {count} клиент(ов) обработано")
