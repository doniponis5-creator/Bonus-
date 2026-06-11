"""
Sbonus+ — Cron задача: напоминания о платежах по рассрочке (WhatsApp).
Запускается ежедневно в 10:40 (Asia/Bishkek).

Этапы напоминаний (по next_payment из 1С):
  1. UPCOMING — за N дней до платежа (DEBT_REMINDER_DAYS_BEFORE, default 3)
  2. DUE      — в день платежа
  3. OVERDUE  — платёж просрочен (повтор не чаще 1 раза в 7 дней)

Защиты:
  - Включается флагом DEBT_REMINDER_ENABLED (default false)
  - Дедуп через Notification.event_type (debt_upcoming / debt_due / debt_overdue):
    одно и то же напоминание клиенту — не чаще 1 раза в 6 дней (overdue — 7)
  - Лимит DEBT_REMINDER_MAX_PER_RUN за запуск (default 50)
  - Интервал 3с между сообщениями (анти-бан WhatsApp)
  - Magic-link в кабинет для каждого клиента

Ручной запуск: POST /api/v1/admin/notifications/debt-reminders/run
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.database import async_session
from app.models import Customer, CustomerDebt, Notification, Setting

logger = logging.getLogger("sbonus.debt_reminders")

# Бишкек = UTC+6, без перехода на летнее время
BISHKEK_OFFSET = timedelta(hours=6)

DEFAULT_UPCOMING = (
    "📅 {name}, напоминаем: {date} — платёж по рассрочке {amount} сом (через {days} дн.).\n"
    "Эслатма: {date} куни бўлиб тўлаш бўйича тўлов {amount} сом.\n\n"
    "График платежей: {link}\n\n"
    "Смарт Центр — S Bonus+"
)
DEFAULT_DUE = (
    "💳 {name}, сегодня день платежа по рассрочке: {amount} сом.\n"
    "Бугун бўлиб тўлаш куни: {amount} сом.\n\n"
    "Ждём вас в Смарт Центр! График: {link}"
)
DEFAULT_OVERDUE = (
    "⚠️ {name}, платёж по рассрочке {amount} сом просрочен на {days} дн.\n"
    "Бўлиб тўлаш {days} кунга кечикди: {amount} сом.\n\n"
    "Пожалуйста, оплатите в ближайшее время. График: {link}\n"
    "Вопросы: 0557 100 505"
)


async def _get_config(db) -> dict:
    keys = [
        "DEBT_REMINDER_ENABLED", "DEBT_REMINDER_DAYS_BEFORE", "DEBT_REMINDER_MAX_PER_RUN",
        "DEBT_REMINDER_TEMPLATE_UPCOMING", "DEBT_REMINDER_TEMPLATE_DUE", "DEBT_REMINDER_TEMPLATE_OVERDUE",
    ]
    result = await db.execute(select(Setting).where(Setting.key.in_(keys)))
    cfg = {s.key: s.value for s in result.scalars().all()}

    def _i(key, default):
        try:
            return int(cfg.get(key) or default)
        except (ValueError, TypeError):
            return default

    return {
        "enabled": (cfg.get("DEBT_REMINDER_ENABLED") or "false").lower() == "true",
        "days_before": _i("DEBT_REMINDER_DAYS_BEFORE", 3),
        "max_per_run": _i("DEBT_REMINDER_MAX_PER_RUN", 50),
        "tpl_upcoming": cfg.get("DEBT_REMINDER_TEMPLATE_UPCOMING") or DEFAULT_UPCOMING,
        "tpl_due": cfg.get("DEBT_REMINDER_TEMPLATE_DUE") or DEFAULT_DUE,
        "tpl_overdue": cfg.get("DEBT_REMINDER_TEMPLATE_OVERDUE") or DEFAULT_OVERDUE,
    }


async def run_debt_reminders() -> None:
    """Основной запуск: пройти по активным рассрочкам и напомнить о платежах."""
    from app.services.smart_notifications import (
        _get_wa_config, _generate_magic_link, _send_and_log,
    )

    async with async_session() as db:
        cfg = await _get_config(db)
        if not cfg["enabled"]:
            logger.info("Debt reminders: выключено (DEBT_REMINDER_ENABLED != true)")
            return

        wa_cfg = await _get_wa_config(db)
        if not wa_cfg:
            logger.info("Debt reminders: WhatsApp не настроен/выключен")
            return

        today_bishkek = (datetime.now(timezone.utc) + BISHKEK_OFFSET).date()

        # Активные рассрочки с графиком следующего платежа
        debts_result = await db.execute(
            select(CustomerDebt).where(
                CustomerDebt.status != "paid",
                CustomerDebt.amount > 0,
                CustomerDebt.next_payment.isnot(None),
            )
        )
        debts = debts_result.scalars().all()
        if not debts:
            logger.info("Debt reminders: активных рассрочек с графиком нет")
            return

        # Дедуп: кому какое напоминание уже отправляли недавно
        cooldown_6d = datetime.now(timezone.utc) - timedelta(days=6)
        cooldown_7d = datetime.now(timezone.utc) - timedelta(days=7)
        recent_result = await db.execute(
            select(Notification.customer_id, Notification.event_type, Notification.created_at).where(
                Notification.event_type.in_(["debt_upcoming", "debt_due", "debt_overdue"]),
                Notification.created_at >= cooldown_7d,
            )
        )
        recent: set[tuple] = set()
        for cid, etype, created in recent_result.all():
            cutoff = cooldown_7d if etype == "debt_overdue" else cooldown_6d
            if created >= cutoff:
                recent.add((cid, etype))

        sent = 0
        for debt in debts:
            if sent >= cfg["max_per_run"]:
                logger.info(f"Debt reminders: достигнут лимит {cfg['max_per_run']}/запуск")
                break
            try:
                np = debt.next_payment or {}
                date_str = str(np.get("date") or "")[:10]
                if not date_str:
                    continue
                try:
                    pay_date = datetime.strptime(date_str, "%Y-%m-%d").date()
                except ValueError:
                    continue
                amount = np.get("amount") or 0

                days_diff = (pay_date - today_bishkek).days
                if days_diff == cfg["days_before"]:
                    stage, template, days_val = "debt_upcoming", cfg["tpl_upcoming"], days_diff
                elif days_diff == 0:
                    stage, template, days_val = "debt_due", cfg["tpl_due"], 0
                elif days_diff < 0:
                    stage, template, days_val = "debt_overdue", cfg["tpl_overdue"], -days_diff
                else:
                    continue

                if (debt.customer_id, stage) in recent:
                    continue

                customer = (await db.execute(
                    select(Customer).where(Customer.id == debt.customer_id)
                )).scalar_one_or_none()
                if not customer or not customer.phone or not customer.is_active:
                    continue

                link = await _generate_magic_link(db, debt.customer_id)
                message = (
                    template
                    .replace("{name}", customer.full_name or "")
                    .replace("{amount}", f"{int(float(amount)):,}".replace(",", " "))
                    .replace("{date}", pay_date.strftime("%d.%m.%Y"))
                    .replace("{days}", str(days_val))
                    .replace("{link}", link)
                )

                await _send_and_log(db, debt.customer_id, customer.phone, message, stage, wa_cfg)
                recent.add((debt.customer_id, stage))
                sent += 1
                await db.commit()
                await asyncio.sleep(3)

            except Exception as e:
                logger.warning(f"Debt reminder error (debt {debt.id}): {e}")

        logger.info(f"Debt reminders: отправлено {sent} напоминаний")
