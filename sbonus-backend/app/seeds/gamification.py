"""
Sbonus+ — Сиды для Геймификации 2.0: квесты и достижения по умолчанию.
Идемпотентно: добавляет только отсутствующие (по code).
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models import Achievement, Quest

logger = get_logger("seeds.gamification")


# ── ДОСТИЖЕНИЯ (бейджи) ──  icon = Lucide-имя
DEFAULT_ACHIEVEMENTS = [
    # Покупки
    {"code": "first_purchase", "icon": "ShoppingCart", "title": "Первая покупка", "description": "Совершите первую покупку", "category": "purchases", "grade": "bronze", "metric": "purchases", "threshold": 1, "xp_reward": 50, "bonus_reward": 0, "sort_order": 1},
    {"code": "regular_10", "icon": "Repeat", "title": "Постоянный клиент", "description": "10 покупок", "category": "purchases", "grade": "bronze", "metric": "purchases", "threshold": 10, "xp_reward": 100, "bonus_reward": 50, "sort_order": 2},
    {"code": "loyal_50", "icon": "Gem", "title": "Верный покупатель", "description": "50 покупок", "category": "purchases", "grade": "silver", "metric": "purchases", "threshold": 50, "xp_reward": 250, "bonus_reward": 150, "sort_order": 3},
    {"code": "legend_100", "icon": "Crown", "title": "Легенда магазина", "description": "100 покупок", "category": "purchases", "grade": "gold", "metric": "purchases", "threshold": 100, "xp_reward": 500, "bonus_reward": 300, "sort_order": 4},
    {"code": "mega_200", "icon": "Trophy", "title": "Мега-покупатель", "description": "200 покупок", "category": "purchases", "grade": "platinum", "metric": "purchases", "threshold": 200, "xp_reward": 1000, "bonus_reward": 500, "sort_order": 5},
    # Бонусы
    {"code": "saver_1k", "icon": "PiggyBank", "title": "Копилка", "description": "Накопите 1 000 бонусов", "category": "bonuses", "grade": "bronze", "metric": "total_earned", "threshold": 1000, "xp_reward": 100, "bonus_reward": 0, "sort_order": 10},
    {"code": "saver_5k", "icon": "Landmark", "title": "Банкир", "description": "Накопите 5 000 бонусов", "category": "bonuses", "grade": "silver", "metric": "total_earned", "threshold": 5000, "xp_reward": 250, "bonus_reward": 100, "sort_order": 11},
    {"code": "saver_10k", "icon": "Banknote", "title": "Миллионер", "description": "Накопите 10 000 бонусов", "category": "bonuses", "grade": "gold", "metric": "total_earned", "threshold": 10000, "xp_reward": 500, "bonus_reward": 250, "sort_order": 12},
    {"code": "big_spender", "icon": "Target", "title": "Щедрая душа", "description": "Потратьте 5 000 бонусов", "category": "bonuses", "grade": "silver", "metric": "total_spent", "threshold": 5000, "xp_reward": 250, "bonus_reward": 0, "sort_order": 13},
    # Объём покупок (LTV)
    {"code": "ltv_10k", "icon": "TrendingUp", "title": "10К клуб", "description": "Покупки на 10 000 сом", "category": "spending", "grade": "bronze", "metric": "ltv", "threshold": 10000, "xp_reward": 100, "bonus_reward": 50, "sort_order": 20},
    {"code": "ltv_50k", "icon": "Rocket", "title": "50К клуб", "description": "Покупки на 50 000 сом", "category": "spending", "grade": "silver", "metric": "ltv", "threshold": 50000, "xp_reward": 300, "bonus_reward": 200, "sort_order": 21},
    {"code": "ltv_100k", "icon": "Star", "title": "100К клуб", "description": "Покупки на 100 000 сом", "category": "spending", "grade": "gold", "metric": "ltv", "threshold": 100000, "xp_reward": 600, "bonus_reward": 400, "sort_order": 22},
    {"code": "ltv_500k", "icon": "Sparkles", "title": "Полмиллиона!", "description": "Покупки на 500 000 сом", "category": "spending", "grade": "platinum", "metric": "ltv", "threshold": 500000, "xp_reward": 1500, "bonus_reward": 1000, "sort_order": 23},
    # Социальные
    {"code": "referrer_1", "icon": "Handshake", "title": "Пригласитель", "description": "Пригласите 1 друга", "category": "social", "grade": "bronze", "metric": "referrals", "threshold": 1, "xp_reward": 100, "bonus_reward": 0, "sort_order": 30},
    {"code": "referrer_5", "icon": "Users", "title": "Амбассадор", "description": "Пригласите 5 друзей", "category": "social", "grade": "silver", "metric": "referrals", "threshold": 5, "xp_reward": 300, "bonus_reward": 200, "sort_order": 31},
    {"code": "referrer_10", "icon": "Megaphone", "title": "Лидер мнений", "description": "Пригласите 10 друзей", "category": "social", "grade": "gold", "metric": "referrals", "threshold": 10, "xp_reward": 600, "bonus_reward": 500, "sort_order": 32},
    # Уровни лояльности
    {"code": "tier_silver", "icon": "Medal", "title": "Серебряный", "description": "Достигните уровня Silver", "category": "tiers", "grade": "silver", "metric": "tier_rank", "threshold": 2, "xp_reward": 150, "bonus_reward": 0, "sort_order": 40},
    {"code": "tier_gold", "icon": "Medal", "title": "Золотой", "description": "Достигните уровня Gold", "category": "tiers", "grade": "gold", "metric": "tier_rank", "threshold": 3, "xp_reward": 400, "bonus_reward": 0, "sort_order": 41},
    {"code": "tier_platinum", "icon": "Medal", "title": "Платиновый", "description": "Достигните уровня Platinum", "category": "tiers", "grade": "platinum", "metric": "tier_rank", "threshold": 4, "xp_reward": 800, "bonus_reward": 0, "sort_order": 42},
    # Серии (по рекорду)
    {"code": "streak_3", "icon": "Flame", "title": "3 дня подряд!", "description": "Покупки 3 дня подряд", "category": "streaks", "grade": "bronze", "metric": "longest_streak", "threshold": 3, "xp_reward": 100, "bonus_reward": 30, "sort_order": 50},
    {"code": "streak_7", "icon": "Flame", "title": "Неделя огня!", "description": "Покупки 7 дней подряд", "category": "streaks", "grade": "silver", "metric": "longest_streak", "threshold": 7, "xp_reward": 250, "bonus_reward": 100, "sort_order": 51},
    {"code": "streak_14", "icon": "Flame", "title": "Две недели!", "description": "Покупки 14 дней подряд", "category": "streaks", "grade": "gold", "metric": "longest_streak", "threshold": 14, "xp_reward": 500, "bonus_reward": 250, "sort_order": 52},
    {"code": "streak_30", "icon": "Flame", "title": "Месяц огня!", "description": "Покупки 30 дней подряд", "category": "streaks", "grade": "platinum", "metric": "longest_streak", "threshold": 30, "xp_reward": 1200, "bonus_reward": 500, "sort_order": 53},
]


# ── КВЕСТЫ (миссии) ──
DEFAULT_QUESTS = [
    # Ежедневные
    {"code": "daily_visit", "icon": "Store", "title": "Загляните в магазин", "description": "Совершите покупку сегодня", "type": "visit", "target_value": 1, "reward_type": "bonus", "reward_amount": 20, "xp_reward": 10, "period": "daily", "sort_order": 1},
    {"code": "daily_big", "icon": "ShoppingBag", "title": "Крупная покупка", "description": "Покупка на 3 000+ сом", "type": "purchase_amount", "target_value": 3000, "reward_type": "bonus", "reward_amount": 50, "xp_reward": 20, "period": "daily", "sort_order": 2},
    {"code": "daily_spend", "icon": "CreditCard", "title": "Используйте бонусы", "description": "Спишите бонусы при покупке", "type": "spend_bonus", "target_value": 1, "reward_type": "bonus", "reward_amount": 30, "xp_reward": 15, "period": "daily", "sort_order": 3},
    # Еженедельные
    {"code": "weekly_3buys", "icon": "Repeat", "title": "Активная неделя", "description": "Сделайте 3 покупки за неделю", "type": "purchase_count", "target_value": 3, "reward_type": "bonus", "reward_amount": 100, "xp_reward": 50, "period": "weekly", "sort_order": 10},
    {"code": "weekly_referral", "icon": "UserPlus", "title": "Друг магазина", "description": "Пригласите друга за неделю", "type": "referral", "target_value": 1, "reward_type": "bonus", "reward_amount": 100, "xp_reward": 50, "period": "weekly", "sort_order": 11},
    {"code": "weekly_wheel", "icon": "Disc3", "title": "Испытай удачу", "description": "Крутите колесо 3 раза за неделю", "type": "wheel_spin", "target_value": 3, "reward_type": "bonus", "reward_amount": 30, "xp_reward": 20, "period": "weekly", "sort_order": 12},
    # Месячные
    {"code": "monthly_streak", "icon": "Flame", "title": "Огненный месяц", "description": "Серия 10 дней подряд", "type": "streak", "target_value": 10, "reward_type": "bonus", "reward_amount": 200, "xp_reward": 100, "period": "monthly", "sort_order": 20},
]


async def seed_gamification(db: AsyncSession) -> None:
    """Создать дефолтные достижения и квесты, если их ещё нет."""
    # Achievements
    existing_ach = await db.execute(select(Achievement.code))
    have_ach = {r[0] for r in existing_ach.all()}
    added_a = 0
    for a in DEFAULT_ACHIEVEMENTS:
        if a["code"] in have_ach:
            continue
        db.add(Achievement(
            code=a["code"], icon=a["icon"], title=a["title"], description=a["description"],
            category=a["category"], grade=a["grade"], metric=a["metric"],
            threshold=Decimal(str(a["threshold"])), xp_reward=a["xp_reward"],
            bonus_reward=Decimal(str(a["bonus_reward"])), sort_order=a["sort_order"], is_active=True,
        ))
        added_a += 1

    # Quests
    existing_q = await db.execute(select(Quest.code))
    have_q = {r[0] for r in existing_q.all()}
    added_q = 0
    for q in DEFAULT_QUESTS:
        if q["code"] in have_q:
            continue
        db.add(Quest(
            code=q["code"], icon=q["icon"], title=q["title"], description=q["description"],
            type=q["type"], target_value=Decimal(str(q["target_value"])),
            reward_type=q["reward_type"], reward_amount=Decimal(str(q["reward_amount"])),
            xp_reward=q["xp_reward"], period=q["period"], sort_order=q["sort_order"], is_active=True,
        ))
        added_q += 1

    if added_a or added_q:
        await db.commit()
        logger.info("Gamification seeded: +%d achievements, +%d quests", added_a, added_q)
