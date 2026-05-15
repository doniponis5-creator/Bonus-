"""
Sbonus+ — Главная точка входа FastAPI.
Магазин: Смарт Центр | Система: S Bonus | Валюта: KGS

Запуск: uvicorn app.main:app --reload
Swagger: http://localhost:8000/docs
"""

from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.database import Base, engine
from app.seeds.defaults import seed_default_data
from app.seeds.tiers import seed_tiers
from app.tasks.birthday import process_birthday_bonuses

settings = get_settings()
scheduler = AsyncIOScheduler(timezone=settings.shop_timezone)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle: startup / shutdown.
    - Создание таблиц (dev mode)
    - Seed дефолтных данных
    - Запуск cron задач
    """
    print("=" * 50)
    print(f"🚀 {settings.shop_name} — {settings.shop_bonus_name}")
    print(f"📍 {settings.shop_address}")
    print(f"📱 {settings.shop_phone}")
    print(f"💰 Валюта: {settings.shop_currency}")
    print("=" * 50)

    # Таблицы создаются через Alembic (entrypoint.sh → alembic upgrade head)
    print("  📦 Таблицы управляются через Alembic миграции")

    # Seed
    from app.core.database import async_session
    async with async_session() as db:
        await seed_tiers(db)
        await seed_default_data(db)

    # Cron: бонус ко дню рождения — каждый день 09:00
    scheduler.add_job(
        process_birthday_bonuses,
        CronTrigger(hour=9, minute=0),
        id="birthday_bonus",
        replace_existing=True,
    )
    scheduler.start()
    print("  ⏰ Cron: бонус ко дню рождения — 09:00 ежедневно")
    print("  ✅ Сервер запущен! Swagger: http://localhost:8000/docs")
    print("=" * 50)

    yield

    # Shutdown
    scheduler.shutdown()
    await engine.dispose()
    print("  🛑 Сервер остановлен")


app = FastAPI(
    title=f"{settings.shop_bonus_name} API — {settings.shop_name}",
    description=(
        f"API бонусной системы лояльности магазина **{settings.shop_name}**.\n\n"
        f"📍 {settings.shop_address}\n"
        f"📱 {settings.shop_phone}\n"
        f"💰 Валюта: {settings.shop_currency}\n\n"
        "**Функции:** начисление/списание бонусов, уровни (Bronze→Platinum), "
        "реферальная программа, промокоды, интеграция 1С, WhatsApp уведомления."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routes
app.include_router(api_router)


@app.get("/", tags=["Здоровье"])
async def root() -> dict:
    """Проверка здоровья сервера."""
    return {
        "status": "ok",
        "service": settings.shop_bonus_name,
        "shop": settings.shop_name,
        "version": "1.0.0",
    }


@app.get("/health", tags=["Здоровье"])
async def health() -> dict:
    """Детальная проверка здоровья (БД + Redis)."""
    from app.core.database import async_session
    from app.core.redis import redis_client

    checks = {"api": "ok", "database": "error", "redis": "error"}

    try:
        async with async_session() as db:
            await db.execute(__import__("sqlalchemy").text("SELECT 1"))
            checks["database"] = "ok"
    except Exception:
        pass

    try:
        await redis_client.ping()
        checks["redis"] = "ok"
    except Exception:
        pass

    status_ok = all(v == "ok" for v in checks.values())
    return {"status": "healthy" if status_ok else "degraded", "checks": checks}
