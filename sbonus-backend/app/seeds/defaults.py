"""
Sbonus+ — Seed: создание дефолтного супер-админа и филиала.
"""

import os
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.logging import get_logger
from app.core.security import hash_password
from app.models import Branch, Setting, User, UserRoleEnum

settings = get_settings()
logger = get_logger("seeds.defaults")


async def seed_default_data(db: AsyncSession) -> None:
    """Создать дефолтный филиал и супер-админа."""
    # Дефолтный филиал
    result = await db.execute(select(Branch).where(Branch.name == settings.shop_name))
    branch = result.scalar_one_or_none()
    if not branch:
        branch = Branch(
            name=settings.shop_name,
            address=settings.shop_address,
            city="Ош",
            phone=settings.shop_phone,
        )
        db.add(branch)
        await db.flush()
        logger.info("Created branch: %s", settings.shop_name)

    # Дефолтный супер-админ
    result = await db.execute(select(User).where(User.role == UserRoleEnum.SUPER_ADMIN))
    admin = result.scalar_one_or_none()
    if not admin:
        admin_password = os.environ.get("ADMIN_DEFAULT_PASSWORD", None)
        admin_pin = os.environ.get("ADMIN_DEFAULT_PIN", None)
        if not admin_password or not admin_pin:
            logger.warning("ADMIN_DEFAULT_PASSWORD and ADMIN_DEFAULT_PIN not set in ENV. Admin not created.")
            await db.commit()
            return

        admin = User(
            phone="+996557100505",
            full_name="Администратор",
            email="admin@smartcenter.kg",
            role=UserRoleEnum.SUPER_ADMIN,
            branch_id=branch.id,
            password_hash=hash_password(admin_password),
            pin_hash=hash_password(admin_pin),
        )
        db.add(admin)
        logger.info("Created super-admin: admin@smartcenter.kg")

    # WhatsApp шаблоны для expire
    # Телефон для отчётов
    _report_phone_key = "ADMIN_PHONE_FOR_REPORTS"
    result = await db.execute(select(Setting).where(Setting.key == _report_phone_key))
    if not result.scalar_one_or_none():
        db.add(Setting(key=_report_phone_key, value=settings.shop_phone))
        logger.info("Created setting: %s", _report_phone_key)

    _default_settings = {
        "BALANCE_REMINDER_INACTIVE_DAYS": "14",
        "BALANCE_REMINDER_INTERVAL_DAYS": "14",
        "BONUS_EXPIRATION_DAYS": "365",
        "BONUS_EXPIRATION_WARNING_DAYS": "60",
        "BONUS_EXPIRATION_NOTICE_DAYS": "60",
    }
    for key, value in _default_settings.items():
        result = await db.execute(select(Setting).where(Setting.key == key))
        if not result.scalar_one_or_none():
            db.add(Setting(key=key, value=value))
            logger.info("Created setting: %s", key)

    # ── WhatsApp шаблоны (upsert — обновляем если текст изменился) ──
    _wa_templates = {
        "WHATSAPP_TEMPLATE_EARN": (
            "✅ {name}, начислено +{amount} KGS бонусов!\n"
            "Баланс: {balance} KGS\n\n"
            "📱 Личный кабинет: {link}\n"
            "🛒 Смарт Центр"
        ),
        "WHATSAPP_TEMPLATE_SPEND": (
            "💳 {name}, списано {amount} KGS бонусов.\n"
            "Остаток: {balance} KGS\n\n"
            "📱 Личный кабинет: {link}\n"
            "🛒 Смарт Центр"
        ),
        "WHATSAPP_TEMPLATE_EXPIRE": (
            "⏰ {name}, у вас истекли {amount} KGS бонусов (срок хранения 365 дней).\n"
            "Остаток: {balance} KGS.\n\n"
            "📱 Личный кабинет: {link}\n"
            "🛒 Смарт Центр"
        ),
        "WHATSAPP_TEMPLATE_EXPIRE_WARNING": (
            "⚠️ {name}, через {days} дней у вас истечёт {amount} KGS бонусов!\n"
            "Текущий баланс: {balance} KGS.\n\n"
            "📱 Личный кабинет: {link}\n"
            "🛒 Смарт Центр"
        ),
        "WHATSAPP_TEMPLATE_BALANCE_REMINDER": (
            "👋 {name}, у вас {balance} KGS бонусов на счету!\n"
            "Не забудьте использовать при следующей покупке 🛍\n\n"
            "📱 Проверить баланс: {link}\n"
            "🛒 Смарт Центр"
        ),
    }
    for key, value in _wa_templates.items():
        result = await db.execute(select(Setting).where(Setting.key == key))
        existing = result.scalar_one_or_none()
        if not existing:
            db.add(Setting(key=key, value=value))
            logger.info("Created setting: %s", key)
        elif existing.value != value:
            existing.value = value
            logger.info("Updated setting: %s", key)

    await db.commit()
    logger.info("Default data seed completed")
