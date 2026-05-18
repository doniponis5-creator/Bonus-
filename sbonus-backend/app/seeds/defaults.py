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
from app.models import Branch, User, UserRoleEnum

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

    await db.commit()
    logger.info("Default data seed completed")
