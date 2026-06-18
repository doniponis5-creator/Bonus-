"""
NASIYA DAFTAR — eslatma cron'i.
Yangi fayl sifatida saqlang: app/tasks/nasiya_reminders.py

Har kuni (masalan 09:00) ishlaydi:
  - Qarzdorga: srok yaqinlashganda WhatsApp eslatma
    (necha kun oldin — Settings: NASIYA_REMINDER_DAYS_BEFORE = "3,1,0")
  - Egasiga (DonLee): bugun/kechikkan to'lovlar ro'yxati (kim qancha)

⚠️ IMPORTLARNI TEKSHIRING:
  - async_session         -> app.core.database (CLAUDE.md: campaign_runner shuni ishlatadi)
  - send_whatsapp_message -> app.services.whatsapp  (signature pastda _send_wa da)
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select

from app.core.database import async_session           # ⚠️ moslang agar kerak bo'lsa
from app.models import Setting, NasiyaDebt
from app.services.whatsapp import send_whatsapp_message  # ⚠️ moslang

logger = logging.getLogger(__name__)

# ── default qiymatlar (Settings'da bo'lmasa shular ishlaydi) ──
DEFAULT_DAYS_BEFORE = "3,1,0"     # 3 kun oldin, 1 kun oldin, srok kuni
DEFAULT_DEBTOR_TEMPLATE = (
    "Здравствуйте, {name}!\n"
    "Напоминание: срок оплаты {due_date}. К оплате: {remaining} сом.\n"
    "Пожалуйста, оплатите вовремя. Спасибо!\n"
    "— Смарт Центр"
)


# ─────────────────────────── settings helper ───────────────────────────
async def _get_setting(db, key: str, default: str | None = None) -> str | None:
    row = await db.get(Setting, key)
    if row and row.value is not None and str(row.value).strip() != "":
        return str(row.value)
    return default


def _fmt(amount) -> str:
    """12000 -> '12 000'."""
    try:
        return f"{float(amount):,.0f}".replace(",", " ")
    except (TypeError, ValueError):
        return str(amount)


# ─────────────────────────── WhatsApp adapter ───────────────────────────
async def _send_wa(phone: str, text: str) -> bool:
    """
    GreenAPI orqali yuborish. send_whatsapp_message signaturasi loyihada
    boshqacha bo'lsa (masalan to=/message=), faqat shu yerni moslang.
    """
    if not phone:
        return False
    try:
        result = await send_whatsapp_message(phone, text)
        return True if result is None else bool(result)
    except TypeError:
        # nomli argument bo'lsa
        try:
            result = await send_whatsapp_message(phone=phone, message=text)
            return True if result is None else bool(result)
        except Exception as e:  # noqa
            logger.warning("nasiya: WA signature mos emas: %s", e)
            return False
    except Exception as e:  # noqa
        logger.warning("nasiya: WA yuborilmadi (%s): %s", phone, e)
        return False


# ─────────────────────────── message builders ───────────────────────────
async def send_debtor_reminder(db, debt: NasiyaDebt) -> bool:
    """Bitta qarzdorga eslatma. (commit qilmaydi — chaqiruvchi commit qiladi.)"""
    template = await _get_setting(db, "NASIYA_WA_TEMPLATE_DEBTOR", DEFAULT_DEBTOR_TEMPLATE)
    today = date.today()
    days_left = (debt.due_date - today).days if debt.due_date else 0
    text = template.format(
        name=debt.debtor_name or "",
        amount=_fmt(debt.principal_amount),
        remaining=_fmt(debt.remaining),
        due_date=debt.due_date.isoformat() if debt.due_date else "",
        days_left=days_left,
    )
    return await _send_wa(debt.debtor_phone, text)


def _build_owner_message(debts: list[NasiyaDebt], today: date) -> str:
    lines = []
    total = Decimal("0.00")
    for d in debts:
        rem = d.remaining
        total += rem
        overdue = " ⚠️ KECHIKKAN" if d.due_date and d.due_date < today else ""
        lines.append(
            f"• {d.debtor_name} ({d.debtor_phone}) — {_fmt(rem)} som | srok {d.due_date.isoformat()}{overdue}"
        )
    body = "\n".join(lines) if lines else "Bugun to'lov yo'q."
    return (
        f"📒 Nasiya eslatma — {today.isoformat()}\n\n"
        f"Bugun / kechikkan to'lovlar:\n{body}\n\n"
        f"Jami qoldiq: {_fmt(total)} som"
    )


# ─────────────────────────── cron entry ───────────────────────────
async def run_nasiya_reminders() -> None:
    """APScheduler chaqiradi (kuniga bir marta)."""
    async with async_session() as db:
        enabled = (await _get_setting(db, "NASIYA_REMINDER_ENABLED", "true")).lower() == "true"
        if not enabled:
            logger.info("nasiya: eslatmalar o'chirilgan")
            return

        notify_debtor = (await _get_setting(db, "NASIYA_NOTIFY_DEBTOR", "true")).lower() == "true"
        notify_owner = (await _get_setting(db, "NASIYA_NOTIFY_OWNER", "true")).lower() == "true"
        owner_phone = await _get_setting(db, "NASIYA_OWNER_PHONE", "")

        days_raw = await _get_setting(db, "NASIYA_REMINDER_DAYS_BEFORE", DEFAULT_DAYS_BEFORE)
        try:
            offsets = {int(x.strip()) for x in days_raw.split(",") if x.strip() != ""}
        except ValueError:
            offsets = {0}

        today = date.today()

        # faol + qoldig'i bor nasiyalar
        rows = (await db.execute(
            select(NasiyaDebt).where(
                NasiyaDebt.status == "active",
                NasiyaDebt.principal_amount > NasiyaDebt.paid_amount,
            )
        )).scalars().all()

        sent_debtor = 0
        for debt in rows:
            if not debt.due_date:
                continue
            days_left = (debt.due_date - today).days
            if days_left not in offsets:
                continue

            dedupe_key = f"{today.isoformat()}:{days_left}"
            log = list(debt.reminder_log or [])
            if dedupe_key in log:
                continue  # bugun shu offset uchun allaqachon yuborilgan

            if notify_debtor:
                ok = await send_debtor_reminder(db, debt)
                if ok:
                    log.append(dedupe_key)
                    debt.reminder_log = log
                    debt.last_reminder_at = datetime.utcnow()
                    sent_debtor += 1
                    await asyncio.sleep(2)  # GreenAPI rate xavfsizligi

        # egasiga umumiy ro'yxat: bugun va kechikkan to'lovlar
        if notify_owner and owner_phone:
            due_or_overdue = [d for d in rows if d.due_date and d.due_date <= today]
            if due_or_overdue:
                msg = _build_owner_message(due_or_overdue, today)
                await _send_wa(owner_phone, msg)

        await db.commit()
        logger.info("nasiya: tugadi — qarzdorga %s ta eslatma", sent_debtor)
