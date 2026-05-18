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
from app.core.logging import setup_logging, get_logger
from app.core.database import Base, engine
from app.seeds.defaults import seed_default_data
from app.seeds.tiers import seed_tiers
from app.tasks.campaigns import process_due_campaigns
from app.tasks.expiration import expire_old_bonuses, warn_expiring_bonuses
from app.tasks.notification_retry import retry_failed_notifications
from app.tasks.weekly_report import send_weekly_report

settings = get_settings()
logger = get_logger("main")
scheduler = AsyncIOScheduler(timezone=settings.shop_timezone)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle: startup / shutdown.
    - Создание таблиц (dev mode)
    - Seed дефолтных данных
    - Запуск cron задач
    """
    setup_logging()

    logger.info("=" * 50)
    logger.info("%s — %s", settings.shop_name, settings.shop_bonus_name)
    logger.info("Address: %s", settings.shop_address)
    logger.info("Phone: %s", settings.shop_phone)
    logger.info("Currency: %s", settings.shop_currency)
    logger.info("=" * 50)

    # Таблицы создаются через Alembic (entrypoint.sh → alembic upgrade head)
    logger.info("Tables managed via Alembic migrations")

    # Seed
    from app.core.database import async_session
    async with async_session() as db:
        await seed_tiers(db)
        await seed_default_data(db)

    # Cron: обработка бонусных кампаний — каждый день 09:00
    scheduler.add_job(
        process_due_campaigns,
        CronTrigger(hour=9, minute=0),
        id="bonus_campaigns",
        replace_existing=True,
    )

    # Cron: истечение бонусов — каждый день 02:00
    scheduler.add_job(
        expire_old_bonuses,
        CronTrigger(hour=2, minute=0),
        id="bonus_expiration",
        replace_existing=True,
    )

    # Cron: предупреждение об истечении — каждый день 10:00
    scheduler.add_job(
        warn_expiring_bonuses,
        CronTrigger(hour=10, minute=0),
        id="bonus_expiration_warning",
        replace_existing=True,
    )

    # Cron: повтор неотправленных уведомлений — каждые 15 минут
    scheduler.add_job(
        retry_failed_notifications,
        CronTrigger(minute="*/15"),
        id="notification_retry",
        replace_existing=True,
    )

    # Cron: еженедельный отчёт — понедельник 08:00
    scheduler.add_job(
        send_weekly_report,
        CronTrigger(day_of_week="mon", hour=8, minute=0),
        id="weekly_report",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Cron: bonus campaigns scheduled at 09:00 daily")
    logger.info("Cron: bonus expiration scheduled at 02:00 daily")
    logger.info("Cron: expiration warnings scheduled at 10:00 daily")
    logger.info("Cron: notification retry scheduled every 15 min")
    logger.info("Cron: weekly report scheduled at Mon 08:00")
    logger.info("Server started! Swagger: http://localhost:8000/docs")
    logger.info("=" * 50)

    yield

    # Shutdown
    scheduler.shutdown()
    await engine.dispose()
    logger.info("Server stopped")


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
