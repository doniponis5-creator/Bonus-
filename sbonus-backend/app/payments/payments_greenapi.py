"""
Green API (WhatsApp) для онлайн-погашения рассрочки.
Сообщения клиенту — на русском (как существующие квитанции Смарт Центра).

Два сообщения:
  1) send_pay_link     — клиенту летит ссылка на оплату O!Bank.
  2) send_payment_receipt — АВТО-квитанция сразу после подтверждения оплаты
     (сумма, дата, остаток, следующий платёж) — не дожидаясь пересинхрона 1С.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Dict, Optional

import httpx

logger = logging.getLogger("sbonus.payments.greenapi")


class GreenAPIError(Exception):
    pass


def _settings():
    from app.core.config import get_settings
    return get_settings()


def _normalize_phone(phone: str) -> str:
    p = phone.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    if p.startswith("+"):
        p = p[1:]
    if not p.isdigit():
        raise ValueError(f"invalid phone: {phone}")
    return f"{p}@c.us"


def _base_url() -> str:
    s = _settings()
    inst = getattr(s, "greenapi_instance_id", "")
    if not inst or not getattr(s, "greenapi_api_token", ""):
        raise GreenAPIError("Green API не настроен")
    host = getattr(s, "greenapi_host", "https://api.green-api.com")
    return f"{host}/waInstance{inst}"


def send_text(phone: str, message: str, timeout: float = 15.0) -> Dict:
    s = _settings()
    url = f"{_base_url()}/sendMessage/{s.greenapi_api_token}"
    payload = {"chatId": _normalize_phone(phone), "message": message}
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"GreenAPI sendMessage to {phone}: id={data.get('idMessage')}")
            return data
    except httpx.HTTPError as e:
        logger.error(f"GreenAPI error {phone}: {e}")
        raise GreenAPIError(str(e)) from e


def _first_name(full_name: Optional[str]) -> str:
    if not full_name:
        return "клиент"
    parts = full_name.split()
    return parts[1] if len(parts) > 1 else parts[0]


def _money(v) -> str:
    try:
        return f"{float(v):,.0f}".replace(",", " ")
    except (TypeError, ValueError):
        return str(v)


# ── 1. Ссылка на оплату ──────────────────────────────────────────────────────

def send_pay_link(phone: str, client_name: Optional[str], amount, pay_url: str,
                  rtu_number: str = "", public_url: str = "", ref: str = "") -> Dict:
    name = _first_name(client_name)
    rtu_line = f"по договору *№{rtu_number}* " if rtu_number else ""
    lines = [
        "🏪 *СМАРТ ЦЕНТР*",
        "━━━━━━━━━━━━━━━━━━━",
        "",
        f"Здравствуйте, *{name}*!",
        "",
        f"💳 Оплата рассрочки {rtu_line}онлайн.",
        f"Сумма к оплате: *{_money(amount)} сом*",
        "",
        "Оплатите по ссылке через *O!Bank*:",
        f"{pay_url}",
    ]
    if ref:
        lines += ["", f"📝 В комментарии к платежу укажите: *{ref}*"]
    if public_url:
        lines += ["", f"ℹ️ Детали и статус: {public_url}"]
    lines += ["", "💚 Спасибо, что выбираете Смарт Центр!"]
    return send_text(phone, "\n".join(lines))


# ── 2. АВТО-квитанция после подтверждения оплаты ─────────────────────────────

def send_payment_receipt(phone: str, client_name: Optional[str], amount,
                         rtu_number: str = "", schedule_ctx: Optional[dict] = None,
                         paid_at: Optional[str] = None) -> Dict:
    """
    schedule_ctx (опц., от 1С): { remaining, next_date, next_amount, paid_count, total_count, overdue }.
    """
    name = _first_name(client_name)
    when = ""
    if paid_at:
        try:
            when = datetime.fromisoformat(paid_at.replace("Z", "")).strftime("%d.%m.%Y %H:%M")
        except ValueError:
            when = paid_at
    else:
        when = datetime.now().strftime("%d.%m.%Y %H:%M")

    lines = [
        "🏪 *СМАРТ ЦЕНТР*",
        "━━━━━━━━━━━━━━━━━━━",
        "",
        f"*{name}*, ваш платёж получен ✅",
        "",
        f"💵 Сумма: *{_money(amount)} сом*",
        f"🗓 Дата: {when}",
    ]
    if rtu_number:
        lines.append(f"📄 Договор: №{rtu_number}")

    ctx = schedule_ctx or {}
    remaining = ctx.get("remaining")
    if remaining is not None:
        try:
            rem = float(remaining)
        except (TypeError, ValueError):
            rem = None
        if rem is not None:
            lines.append("")
            if rem <= 0:
                lines.append("🎉 *Рассрочка погашена полностью!*")
                lines.append("Благодарим за своевременные платежи 💚")
            else:
                lines.append(f"💼 Остаток по рассрочке: *{_money(rem)} сом*")
                if ctx.get("next_date"):
                    nx_amt = f" — {_money(ctx['next_amount'])} сом" if ctx.get("next_amount") else ""
                    lines.append(f"🗓 Следующий платёж: *{ctx['next_date']}*{nx_amt}")
                if ctx.get("paid_count") and ctx.get("total_count"):
                    lines.append(f"📊 Платёж {ctx['paid_count']} из {ctx['total_count']}")
    lines += ["", "💚 Спасибо, что выбираете Смарт Центр!"]
    return send_text(phone, "\n".join(lines))


# ── 3. Уведомление АДМИНУ о поступившей онлайн-оплате ─────────────────────────

def send_admin_notification(admin_phone: str, client_name: Optional[str], amount,
                            rtu_number: str = "", customer_phone: str = "",
                            paid_at: Optional[str] = None,
                            collected_total=None, wallet_balance=None) -> Dict:
    """
    Короткое уведомление администратору в WhatsApp: пришла онлайн-оплата рассрочки.
    Отправляется сразу после подтверждения платежа (O!Bank callback / оператор).
    Ошибка отправки НЕ должна ломать подтверждение — вызывать в try/except на стороне роутера.

    collected_total — всего собрано онлайн (из нашей БД, все подтверждённые платежи).
                      Показываем всегда, если передано.
    wallet_balance  — реальный баланс кошелька O!Dengi (если API его отдаёт; иначе None).
                      Показываем только если передано (не None).
    """
    name = client_name or "клиент"
    when = datetime.now().strftime("%d.%m.%Y %H:%M")
    if paid_at:
        try:
            when = datetime.fromisoformat(paid_at.replace("Z", "")).strftime("%d.%m.%Y %H:%M")
        except ValueError:
            pass
    lines = [
        "🔔 *ОНЛАЙН-ОПЛАТА ПОЛУЧЕНА*",
        "━━━━━━━━━━━━━━━━━━━",
        f"💵 Сумма: *{_money(amount)} сом*",
        f"👤 Клиент: {name}",
    ]
    if customer_phone:
        lines.append(f"📱 Телефон: {customer_phone}")
    if rtu_number:
        lines.append(f"📄 Договор: №{rtu_number}")
    lines.append(f"🗓 {when}")

    # ── Балансы (итоги) ──────────────────────────────────────────────────────
    if collected_total is not None or wallet_balance is not None:
        lines.append("━━━━━━━━━━━━━━━━━━━")
        if collected_total is not None:
            lines.append(f"💰 Собрано онлайн всего: *{_money(collected_total)} сом*")
        if wallet_balance is not None:
            lines.append(f"👛 Баланс кошелька O!Dengi: *{_money(wallet_balance)} сом*")

    lines += [
        "",
        "ПКО в 1С создастся автоматически при ближайшей синхронизации.",
    ]
    return send_text(admin_phone, "\n".join(lines))


# ── 4. Мгновенный ACK клиенту (по приходу денег) ─────────────────────────────

def send_instant_ack(phone: str, client_name: Optional[str], amount) -> Dict:
    """
    Короткое подтверждение клиенту СРАЗУ при поступлении оплаты (с сервера, 24/7).
    Полную ОРИГИНАЛЬНУЮ квитанцию (PDF + график/просрочка) пришлёт 1С при проведении ПКО.
    """
    name = _first_name(client_name)
    lines = [
        "🏪 *Смарт Центр*",
        "",
        f"*{name}*, оплата получена ✅",
        f"💵 Сумма: *{_money(amount)} сом*",
        "",
        "Квитанция придёт в ближайшее время. Спасибо! 💚",
    ]
    return send_text(phone, "\n".join(lines))
