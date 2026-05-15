"""
Sbonus+ — Seed: заполнение дефолтных уровней.
Bronze 3%, Silver 5%, Gold 7%, Platinum 10%.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tier

DEFAULT_TIERS = [
    {"name": "Bronze", "min_total_kgs": Decimal("0"), "bonus_percent": Decimal("3"), "sort_order": 1},
    {"name": "Silver", "min_total_kgs": Decimal("5000"), "bonus_percent": Decimal("5"), "sort_order": 2},
    {"name": "Gold", "min_total_kgs": Decimal("20000"), "bonus_percent": Decimal("7"), "sort_order": 3},
    {"name": "Platinum", "min_total_kgs": Decimal("50000"), "bonus_percent": Decimal("10"), "sort_order": 4},
]


async def seed_tiers(db: AsyncSession) -> None:
    """
    Создать дефолтные уровни если их ещё нет.
    Вызывается при старте приложения.
    """
    for tier_data in DEFAULT_TIERS:
        result = await db.execute(select(Tier).where(Tier.name == tier_data["name"]))
        existing = result.scalar_one_or_none()
        if not existing:
            tier = Tier(
                name=tier_data["name"],
                min_total_kgs=tier_data["min_total_kgs"],
                bonus_percent=tier_data["bonus_percent"],
                max_spend_pct=Decimal("30"),
                sort_order=tier_data["sort_order"],
            )
            db.add(tier)
            print(f"  ✅ Создан уровень: {tier_data['name']} ({tier_data['bonus_percent']}%)")
    await db.commit()
    print("  🏆 Seed уровней завершён")
