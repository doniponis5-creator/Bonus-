"""
Sbonus+ — Автоматические алерты по товарам.

Cron задачи:
  - 08:00 — ежедневный дайджест по товарам (WhatsApp/Telegram)
  - */30 min — проверка критических остатков (мгновенные алерты)

Добавить в main.py:
  from app.services.product_alerts import send_product_daily_digest, check_critical_stock
  scheduler.add_job(send_product_daily_digest, 'cron', hour=8, minute=0)
  scheduler.add_job(check_critical_stock, 'interval', minutes=30)
"""

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select

from app.core.database import async_session
from app.models import Product, PurchaseItem, Setting

logger = logging.getLogger(__name__)


async def _get_settings(db) -> dict:
    """Получить настройки товарных алертов."""
    keys = [
        "PRODUCT_LOW_STOCK_ALERT_ENABLED",
        "PRODUCT_DAILY_DIGEST_ENABLED",
        "PRODUCT_ALERT_PHONE",
        "PRODUCT_ALERT_CHANNEL",
        "GREENAPI_INSTANCE_ID",
        "GREENAPI_API_TOKEN",
        "ENABLE_WHATSAPP_NOTIFICATIONS",
    ]
    result = await db.execute(select(Setting).where(Setting.key.in_(keys)))
    return {s.key: s.value for s in result.scalars().all()}


async def send_product_daily_digest():
    """
    Ежедневный дайджест по товарам — отправка в WhatsApp/Telegram.
    Запускается cron'ом в 08:00.
    """
    async with async_session() as db:
        try:
            cfg = await _get_settings(db)

            if cfg.get("PRODUCT_DAILY_DIGEST_ENABLED") != "true":
                return

            phone = cfg.get("PRODUCT_ALERT_PHONE")
            if not phone:
                logger.warning("PRODUCT_ALERT_PHONE не настроен")
                return

            now = datetime.now(timezone.utc)
            yesterday = now - timedelta(days=1)

            # Продажи за вчера
            sales = await db.execute(
                select(
                    func.count(func.distinct(PurchaseItem.receipt_number)).label("receipts"),
                    func.coalesce(func.sum(PurchaseItem.total), 0).label("revenue"),
                    func.coalesce(func.sum(PurchaseItem.quantity), 0).label("items"),
                )
                .where(PurchaseItem.created_at >= yesterday)
            )
            s = sales.one()

            # Критические остатки
            critical = await db.execute(
                select(Product.name, Product.current_stock, Product.sku)
                .where(Product.is_active == True, Product.current_stock <= 0)
                .limit(10)
            )
            critical_items = critical.all()

            low = await db.execute(
                select(func.count()).select_from(Product)
                .where(
                    Product.is_active == True,
                    Product.current_stock > 0,
                    Product.current_stock <= Product.min_stock_level,
                )
            )
            low_count = low.scalar() or 0

            # Формирование сообщения
            lines = [
                "📊 *ДАЙДЖЕСТ ТОВАРОВ*",
                f"📅 {now.strftime('%d.%m.%Y')}",
                "",
                f"🛒 Чеков: *{s.receipts}*",
                f"💰 Выручка: *{float(s.revenue):,.0f} сом*",
                f"📦 Позиций: *{float(s.items):,.0f}*",
            ]

            if critical_items or low_count > 0:
                lines.append("")
                lines.append("⚠️ *ОСТАТКИ:*")
                if critical_items:
                    lines.append(f"🔴 Нет в наличии: *{len(critical_items)}*")
                    for c in critical_items[:5]:
                        lines.append(f"  • {c.name} ({c.sku})")
                if low_count:
                    lines.append(f"🟡 Мало на складе: *{low_count}*")

            lines.append("")
            lines.append("📍 Смарт Центр | S Bonus+")

            message = "\n".join(lines)

            # Отправка
            channel = cfg.get("PRODUCT_ALERT_CHANNEL", "whatsapp")
            if channel == "whatsapp" and cfg.get("ENABLE_WHATSAPP_NOTIFICATIONS") == "true":
                instance_id = cfg.get("GREENAPI_INSTANCE_ID")
                api_token = cfg.get("GREENAPI_API_TOKEN")
                if instance_id and api_token:
                    from app.services.whatsapp import send_whatsapp_message
                    await send_whatsapp_message(
                        phone=phone,
                        message=message,
                        instance_id=instance_id,
                        api_token=api_token,
                    )
                    logger.info(f"Товарный дайджест отправлен на {phone} (WhatsApp)")

            logger.info("Product daily digest completed")

        except Exception as e:
            logger.error(f"Product daily digest error: {e}", exc_info=True)


async def check_critical_stock():
    """
    Проверка критических остатков — мгновенные алерты.
    Запускается каждые 30 минут.
    Отправляет алерт только если товар ТОЛЬКО ЧТО стал критичным (0 остаток).
    """
    async with async_session() as db:
        try:
            cfg = await _get_settings(db)

            if cfg.get("PRODUCT_LOW_STOCK_ALERT_ENABLED") != "true":
                return

            phone = cfg.get("PRODUCT_ALERT_PHONE")
            if not phone:
                return

            # Найти товары которые ТОЛЬКО ЧТО стали с нулевым остатком
            # (updated_at за последние 30 минут + current_stock <= 0)
            thirty_min_ago = datetime.now(timezone.utc) - timedelta(minutes=30)

            result = await db.execute(
                select(Product)
                .where(
                    Product.is_active == True,
                    Product.current_stock <= 0,
                    Product.updated_at >= thirty_min_ago,
                )
                .limit(10)
            )
            newly_zero = result.scalars().all()

            if not newly_zero:
                return

            lines = [
                "🚨 *СРОЧНО: Товар закончился!*",
                "",
            ]
            for p in newly_zero:
                lines.append(f"❌ *{p.name}* ({p.sku})")
                if p.category:
                    lines.append(f"   Категория: {p.category}")

            lines.append("")
            lines.append("Закажите у поставщика!")
            lines.append("📍 Смарт Центр | S Bonus+")

            message = "\n".join(lines)

            channel = cfg.get("PRODUCT_ALERT_CHANNEL", "whatsapp")
            if channel == "whatsapp" and cfg.get("ENABLE_WHATSAPP_NOTIFICATIONS") == "true":
                instance_id = cfg.get("GREENAPI_INSTANCE_ID")
                api_token = cfg.get("GREENAPI_API_TOKEN")
                if instance_id and api_token:
                    from app.services.whatsapp import send_whatsapp_message
                    await send_whatsapp_message(
                        phone=phone,
                        message=message,
                        instance_id=instance_id,
                        api_token=api_token,
                    )
                    logger.info(f"Critical stock alert sent: {len(newly_zero)} products")

        except Exception as e:
            logger.error(f"Critical stock check error: {e}", exc_info=True)
