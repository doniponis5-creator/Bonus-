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
from app.api.v2 import api_v2_router
from app.core.versioning import APIVersionMiddleware
from app.core.config import get_settings
from app.core.rate_limiter import GlobalRateLimitMiddleware
from app.core.logging import setup_logging, get_logger
from app.core.database import Base, engine
from app.seeds.defaults import seed_default_data
from app.seeds.tiers import seed_tiers
from app.seeds.gamification import seed_gamification
from app.services.gamification import register_handlers as register_gamification_handlers
from app.tasks.campaigns import process_due_campaigns
from app.tasks.expiration import expire_old_bonuses, warn_expiring_bonuses
from app.tasks.notification_retry import retry_failed_notifications
from app.tasks.weekly_report import send_weekly_report
from app.tasks.balance_reminder import send_balance_reminders
from app.services.wa_broadcast import (
    auto_trigger_sleeping_customers,
    auto_trigger_birthday,
)
from app.services.telegram_bot import (
    send_daily_morning_report,
    send_daily_evening_report,
    start_polling as start_tg_polling,
    stop_polling as stop_tg_polling,
)
from app.services.customer_telegram_bot import (
    start_customer_bot,
    stop_customer_bot,
)
from app.services.product_alerts import send_product_daily_digest, check_critical_stock
from app.services.auto_coupon import run_auto_coupon
from app.services.smart_notifications import (
    run_churn_prevention,
    run_birthday_pre_reminder,
    run_expiry_personal_alert,
    run_post_purchase_followup,
)
from app.api.v1.business_intelligence import send_pnl_telegram_report

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
        await seed_gamification(db)

    # Gamification 2.0: подключить обработчики к event_bus
    register_gamification_handlers()

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

    # Cron: Smart Comeback Reminder — каждый день 12:00
    # Макс 2 напоминания за цикл, 14 дней cooldown, 50 за запуск
    scheduler.add_job(
        send_balance_reminders,
        CronTrigger(hour=12, minute=0),
        id="comeback_reminder",
        replace_existing=True,
    )

    # Cron: Smart Churn Prevention — каждый день 11:00
    scheduler.add_job(
        run_churn_prevention,
        CronTrigger(hour=11, minute=0),
        id="smart_churn_prevention",
        replace_existing=True,
    )

    # Cron: Birthday Pre-reminder (за 3 дня) — каждый день 10:30
    scheduler.add_job(
        run_birthday_pre_reminder,
        CronTrigger(hour=10, minute=30),
        id="birthday_pre_reminder",
        replace_existing=True,
    )

    # Cron: Personal Expiry Alert — каждый день 11:30
    scheduler.add_job(
        run_expiry_personal_alert,
        CronTrigger(hour=11, minute=30),
        id="expiry_personal_alert",
        replace_existing=True,
    )

    # ❌ DISABLED: sleeping trigger — spamил 800+ клиентам без лимита
    # Заменён на smart_comeback_reminder (12:00) с лимитом 2 сообщения на клиента
    # scheduler.add_job(
    #     auto_trigger_sleeping_customers,
    #     CronTrigger(hour=11, minute=0),
    #     id="wa_sleeping_trigger",
    #     replace_existing=True,
    # )

    # Cron: WhatsApp авто-триггер ДР — 09:30
    scheduler.add_job(
        auto_trigger_birthday,
        CronTrigger(hour=9, minute=30),
        id="wa_birthday_trigger",
        replace_existing=True,
    )

    # Cron: Telegram утренний отчёт — 09:00
    scheduler.add_job(
        send_daily_morning_report,
        CronTrigger(hour=9, minute=0),
        id="tg_morning_report",
        replace_existing=True,
    )

    # Cron: Telegram вечерний отчёт — 21:00
    scheduler.add_job(
        send_daily_evening_report,
        CronTrigger(hour=21, minute=0),
        id="tg_evening_report",
        replace_existing=True,
    )

    # Cron: Товарный дайджест (WhatsApp) — каждый день 08:00
    scheduler.add_job(
        send_product_daily_digest,
        CronTrigger(hour=8, minute=0),
        id="product_daily_digest",
        replace_existing=True,
    )

    # Cron: Проверка критических остатков — каждые 30 минут
    scheduler.add_job(
        check_critical_stock,
        CronTrigger(minute="*/30"),
        id="product_critical_stock",
        replace_existing=True,
    )

    # Cron: P&L отчёт в Telegram — 21:30
    scheduler.add_job(
        send_pnl_telegram_report,
        CronTrigger(hour=21, minute=30),
        id="tg_pnl_report",
        replace_existing=True,
    )

    # Cron: Auto-Coupon Engine — четверг 11:00 (персональные купоны на повышение чека)
    scheduler.add_job(
        run_auto_coupon,
        CronTrigger(day_of_week="thu", hour=11, minute=0),
        id="auto_coupon",
        replace_existing=True,
    )

    # Cron: Напоминания о платежах по рассрочке — каждый день 10:40
    from app.tasks.debt_reminders import run_debt_reminders
    scheduler.add_job(
        run_debt_reminders,
        CronTrigger(hour=10, minute=40),
        id="debt_reminders",
        replace_existing=True,
    )

    # Cron: Post-Purchase Follow-up — каждый день 11:10
    # «Всё ли нравится? Мы готовы помочь» за вчерашние покупки без возврата (RU+KG)
    scheduler.add_job(
        run_post_purchase_followup,
        CronTrigger(hour=11, minute=10),
        id="post_purchase_followup",
        replace_existing=True,
    )

    # SB FIX: при --workers 2 каждый воркер запускал свой планировщик →
    # ВСЕ cron-задачи дублировались (сообщения уходили 2 раза). Теперь
    # планировщик стартует ТОЛЬКО на одном воркере-лидере (Redis NX + failover).
    import os as _sb_os, asyncio as _sb_aio
    from app.core.redis import redis_client as _sb_rc
    _SB_LEADER_KEY = "sb:scheduler:leader"
    async def _sb_leader_loop():
        started = False
        while True:
            try:
                if not started:
                    got = await _sb_rc.set(_SB_LEADER_KEY, str(_sb_os.getpid()), nx=True, ex=90)
                    if got:
                        scheduler.start()
                        started = True
                        logger.info("Scheduler ЗАПУЩЕН (лидер pid=%s)", _sb_os.getpid())
                else:
                    await _sb_rc.set(_SB_LEADER_KEY, str(_sb_os.getpid()), ex=90)
            except Exception as _sb_e:
                logger.warning("Scheduler leader-loop: %s", _sb_e)
            await _sb_aio.sleep(30)
    _sb_aio.create_task(_sb_leader_loop())

    # Telegram bot polling (обработка команд)
    start_tg_polling()
    start_customer_bot()

    logger.info("Cron: bonus campaigns scheduled at 09:00 daily")
    logger.info("Cron: bonus expiration scheduled at 02:00 daily")
    logger.info("Cron: expiration warnings scheduled at 10:00 daily")
    logger.info("Cron: notification retry scheduled every 15 min")
    logger.info("Cron: weekly report scheduled at Mon 08:00")
    logger.info("Cron: smart comeback reminder at 12:00 daily (max 2 per cycle, 50/run)")
    logger.info("Cron: WA auto-triggers: birthday 09:30 (sleeping DISABLED → smart reminder)")
    logger.info("Cron: Telegram reports at 09:00 & 21:00 daily")
    logger.info("Cron: P&L Telegram report at 21:30 daily")
    logger.info("Cron: Product daily digest at 08:00, critical stock check every 30 min")
    logger.info("Server started! Swagger: http://localhost:8000/docs")
    logger.info("=" * 50)

    yield

    # Shutdown
    stop_tg_polling()
    stop_customer_bot()
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
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.app_env != "production" else None,
    redoc_url="/redoc" if settings.app_env != "production" else None,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-ID"],
)

# Request ID middleware for tracing
import uuid as _uuid
from starlette.middleware.base import BaseHTTPMiddleware

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = request.headers.get("X-Request-ID", str(_uuid.uuid4())[:8])
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

# API Versioning: deprecation headers
app.add_middleware(APIVersionMiddleware)

# Global Rate Limiting: 200 requests / min per IP
app.add_middleware(GlobalRateLimitMiddleware, max_requests=200, window_seconds=60)

app.add_middleware(RequestIDMiddleware)

# API Routes (v1 + v2)
app.include_router(api_router)
from app.contracts import router_public as contracts_public_router
app.include_router(contracts_public_router)

app.include_router(api_v2_router)


# Global exception handler — hide internals in production
import logging as _logging
_logger = _logging.getLogger("sbonus")

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    from fastapi.responses import JSONResponse
    _logger.error(f"Unhandled error: {exc}", exc_info=True)
    if settings.app_env == "production":
        return JSONResponse(status_code=500, content={"detail": {"code": "INTERNAL_ERROR", "message": "Внутренняя ошибка сервера"}})
    raise exc


@app.get("/", tags=["Здоровье"])
async def root() -> dict:
    """Проверка здоровья сервера."""
    return {
        "status": "ok",
        "service": settings.shop_bonus_name,
        "shop": settings.shop_name,
        "version": "2.0.0",
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
