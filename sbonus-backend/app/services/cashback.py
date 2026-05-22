"""
Sbonus+ — Category-based Cashback System.

Tovar kategoriyasi bo'yicha bonus foizini oshirish/kamaytirish.
Admin Settings dan boshqariladi (CASHBACK_CATEGORIES key).

Format (JSON):
[
  {"name": "Электроника", "slug": "electronics", "percent": 3.0},
  {"name": "Продукты", "slug": "food", "percent": 5.0},
  {"name": "Одежда", "slug": "clothing", "percent": 2.0},
  {"name": "Бытовая техника", "slug": "appliances", "percent": 4.0}
]

Maxsus aktsiyalar (CASHBACK_PROMO key):
{
  "active": true,
  "title": "Bugun barcha tovarlarga 10% cashback!",
  "global_percent": 10.0,
  "expires_at": "2026-06-01T00:00:00Z"
}

Logika:
  1. Agar global promo aktiv va muddati tugamagan → global_percent ishlatiladi
  2. Agar kategoriya ko'rsatilgan → shu kategoriya foizi ishlatiladi
  3. Aks holda → tier-based standart foiz (mavjud logika)
"""

import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Setting

logger = logging.getLogger("sbonus.cashback")

# Cache
_cashback_cache: dict = {}
_cashback_cache_ts: float = 0
_CACHE_TTL = 60  # 1 minut


async def get_cashback_categories(db: AsyncSession) -> list[dict]:
    """DB Settings dan kategoriyalar ro'yxatini olish."""
    result = await db.execute(
        select(Setting).where(Setting.key == "CASHBACK_CATEGORIES")
    )
    record = result.scalar_one_or_none()
    if record and record.value:
        try:
            return json.loads(record.value)
        except Exception:
            pass
    return []


async def get_cashback_promo(db: AsyncSession) -> Optional[dict]:
    """DB Settings dan aktiv global promo olish."""
    result = await db.execute(
        select(Setting).where(Setting.key == "CASHBACK_PROMO")
    )
    record = result.scalar_one_or_none()
    if record and record.value:
        try:
            promo = json.loads(record.value)
            if not promo.get("active"):
                return None
            # Muddatini tekshirish
            expires = promo.get("expires_at")
            if expires:
                exp_dt = datetime.fromisoformat(expires.replace("Z", "+00:00"))
                if exp_dt < datetime.now(timezone.utc):
                    return None
            return promo
        except Exception:
            pass
    return None


async def calculate_cashback_percent(
    db: AsyncSession,
    tier_percent: Decimal,
    category_slug: Optional[str] = None,
) -> tuple[Decimal, str]:
    """
    Yakuniy cashback foizini hisoblash.

    Args:
        db: DB session
        tier_percent: Klient tier foizi (standart)
        category_slug: Tovar kategoriyasi (ixtiyoriy)

    Returns:
        (percent, source) — foiz va qayerdan olinganligi
        source: "tier", "category", "promo"
    """
    # 1. Global promo tekshirish
    promo = await get_cashback_promo(db)
    if promo:
        return Decimal(str(promo["global_percent"])), "promo"

    # 2. Kategoriya tekshirish
    if category_slug:
        categories = await get_cashback_categories(db)
        for cat in categories:
            if cat.get("slug") == category_slug:
                return Decimal(str(cat["percent"])), "category"

    # 3. Standart tier-based
    return tier_percent, "tier"


async def save_cashback_categories(db: AsyncSession, categories: list[dict]) -> None:
    """Kategoriyalarni DB Settings ga saqlash."""
    result = await db.execute(
        select(Setting).where(Setting.key == "CASHBACK_CATEGORIES")
    )
    record = result.scalar_one_or_none()
    value = json.dumps(categories, ensure_ascii=False)

    if record:
        record.value = value
    else:
        db.add(Setting(key="CASHBACK_CATEGORIES", value=value))
    await db.commit()


async def save_cashback_promo(db: AsyncSession, promo: dict) -> None:
    """Global promo ni DB Settings ga saqlash."""
    result = await db.execute(
        select(Setting).where(Setting.key == "CASHBACK_PROMO")
    )
    record = result.scalar_one_or_none()
    value = json.dumps(promo, ensure_ascii=False)

    if record:
        record.value = value
    else:
        db.add(Setting(key="CASHBACK_PROMO", value=value))
    await db.commit()
