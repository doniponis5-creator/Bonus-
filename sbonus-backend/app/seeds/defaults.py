"""
Sbonus+ — Seed: создание дефолтного супер-админа и филиала.
"""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.models import Branch, User, UserRoleEnum

settings = get_settings()


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
        print(f"  🏪 Создан филиал: {settings.shop_name}")

    # Дефолтный супер-админ
    result = await db.execute(select(User).where(User.role == UserRoleEnum.SUPER_ADMIN))
    admin = result.scalar_one_or_none()
    if not admin:
        admin = User(
            phone="+996557100505",
            full_name="Администратор",
            email="admin@smartcenter.kg",
            role=UserRoleEnum.SUPER_ADMIN,
            branch_id=branch.id,
            password_hash=hash_password("admin123"),
            pin_hash=hash_password("0000"),
        )
        db.add(admin)
        print("  👤 Создан супер-админ: admin@smartcenter.kg / admin123")

    await db.commit()
    print("  ✅ Seed дефолтных данных завершён")
