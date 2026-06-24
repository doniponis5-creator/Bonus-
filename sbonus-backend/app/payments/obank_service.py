"""
O!Dengi (dengi.kg / mWallet) — адаптер приёма платежей. ВСЯ специфика O!Dengi здесь.

Документация: Sandbox dengi.kg. Все запросы — POST JSON на ОДИН endpoint (json.php).
Конверт запроса:  { cmd, version, sid, mktime, lang, data:{...}, hash }
Полностью АВТОМАТИЧЕСКИЙ режим (оператор не нужен):
  • createInvoice → выставляем счёт (order_id = наш payment_id, сумма в КОПЕЙКАХ) →
    ответ: paylink_url / site_pay / qr — ссылку отдаём клиенту.
  • result_url    → O!Dengi сам шлёт нам статус (status_pay: 3=успех, 2=аннулирован).
  • statusPayment → перепроверка статуса (защита от фейкового колбэка).

⚠️ ОСТАЛОСЬ СВЕРИТЬ ОДНО: правило формирования hash (вкладка sandbox
   «Формирование hash для подписи запроса»). Hash — MD5 (32 hex). Реализовано в _make_hash()
   с пометкой  # << HASH ПРАВИЛО. Пароль API и боевой URL — в .env.

Настройки (.env / app.core.config):
  OBANK_API_URL     боевой endpoint, напр. https://mw-api.dengi.kg/api/json/json.php
  OBANK_SID         SID мерчанта (напр. 8028400465 = «СМАРТ центр»)
  OBANK_SECRET      пароль API мерчанта (из админки mwallet) — только .env!
  OBANK_VERSION     версия API (обычно 1005)
  OBANK_TEST        1 = тестовый платёж, 0 = боевой
  OBANK_RESULT_URL  наш колбэк, напр. https://api.smartcentr.store/api/v1/webhook/obank/callback
  OBANK_PAY_LINK    запасная статичная ссылка (если API недоступен)
  OBANK_LINK_FIELD  какое поле ответа отдавать клиенту: paylink_url|site_pay|qr_url|link_app
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime, timedelta
from typing import Optional

import httpx

logger = logging.getLogger("sbonus.payments.obank")

DEFAULT_API_URL = "https://api.dengi.o.kg/api/json/json.php"


def _s():
    from app.core.config import get_settings
    return get_settings()


def _cfg(name: str, default: str = "") -> str:
    return str(getattr(_s(), name, default) or default)


def is_api_mode() -> bool:
    """True, если есть SID и пароль → можем выставлять счета и ловить колбэк."""
    return bool(_cfg("obank_sid")) and bool(_cfg("obank_secret"))


def is_callback_enabled() -> bool:
    return bool(_cfg("obank_secret"))


def _to_kopecks(amount) -> int:
    """сом → копейки (тийины). 9700 сом → 970000."""
    return int((Decimal(str(amount)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _from_kopecks(kop) -> Decimal:
    try:
        return (Decimal(str(kop)) / 100).quantize(Decimal("0.01"))
    except Exception:
        return Decimal("0")


# ── HASH (подпись запроса/колбэка) ───────────────────────────────────────────

def _make_hash(envelope: dict) -> str:
    """
    Сформировать hash запроса O!Dengi.
    Формула: HMAC-MD5(ключ = пароль API, сообщение = компактный JSON конверта БЕЗ поля hash).
    Конверт: {cmd, version, sid, mktime, lang, data}. Подтверждено на api.dengi.o.kg (SID 8028400465).
    """
    secret = _cfg("obank_secret")
    msg = json.dumps(envelope, separators=(",", ":"), ensure_ascii=False)
    return hmac.new(secret.encode("utf-8"), msg.encode("utf-8"), hashlib.md5).hexdigest()


def _mktime() -> str:
    # примеры в доке 10-значные (секунды). Если потребуется мс — заменить на int(time.time()*1000)
    return str(int(time.time()))


def _request(cmd: str, data: dict) -> dict:
    """Отправить запрос O!Dengi и вернуть тело data ответа. Бросает при ошибке."""
    envelope = {
        "cmd": cmd,
        "version": int(_cfg("obank_version", "1005")),
        "sid": _cfg("obank_sid"),
        "mktime": _mktime(),
        "lang": "ru",
        "data": data,
    }
    envelope["hash"] = _make_hash(envelope)
    url = _cfg("obank_api_url") or DEFAULT_API_URL
    with httpx.Client(timeout=20.0) as client:
        # ВАЖНО: тело шлём СВОЕЙ сериализацией (compact, ensure_ascii=False) — байты ДОЛЖНЫ
        # совпадать с подписанными в _make_hash. Иначе httpx эскейпит кириллицу (\uXXXX) и HMAC не сходится.
        _body = json.dumps(envelope, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        resp = client.post(url, content=_body, headers={"Content-Type": "application/json"})
        resp.raise_for_status()
        body = resp.json()
    d = body.get("data", body) if isinstance(body, dict) else {}
    if isinstance(d, dict) and d.get("error"):
        raise ValueError(f"O!Dengi error {d.get('error')}: {d.get('desc')}")
    return d


# ── 1. Ссылка на оплату (createInvoice) ──────────────────────────────────────

def build_pay_url(payment) -> str:
    """
    Выставить счёт в O!Dengi и вернуть ссылку для клиента.
    order_id = payment_id (идемпотентно: повтор вернёт тот же счёт).
    """
    if not is_api_mode():
        return _cfg("obank_pay_link")  # запасной статичный режим

    try:
        phone = (payment.customer_phone or "").lstrip("+")
        data = {
            "order_id": payment.payment_id,
            "desc": (f"Рассрочка {payment.rtu_number or ''}".strip())[:1000],
            "amount": _to_kopecks(payment.amount),          # КОПЕЙКИ
            "currency": "KGS",
            "test": int(_cfg("obank_test", "0") or "0"),
            "long_term": 0,                                  # одноразовый счёт на этот платёж
            "user_to": None,                                 # НЕ задаём: иначе O!Dengi error 26 "Пользователь не найден"
            "send_push": 0,                                   #   для не-абонентов O!Dengi. Ссылку шлём сами (WhatsApp).
            "send_sms": 0,                                   # смс не шлём — у нас WhatsApp
            "date_life": (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S"),
            "result_url": _cfg("obank_result_url") or None,  # наш колбэк
        }
        d = _request("createInvoice", {k: v for k, v in data.items() if v is not None})
        if d.get("invoice_id"):
            payment.obank_invoice_id = str(d["invoice_id"])
        field = _cfg("obank_link_field", "paylink_url")
        pay_url = d.get(field) or d.get("paylink_url") or d.get("site_pay") or d.get("qr_url") or d.get("qr") or ""
        if not pay_url:
            raise ValueError(f"createInvoice: нет ссылки в ответе: {d}")
        return pay_url
    except Exception as e:
        logger.error(f"O!Dengi createInvoice failed, fallback to static link: {e}")
        return _cfg("obank_pay_link")


# ── 2. Колбэк result_url (O!Dengi шлёт статус) ────────────────────────────────

def verify_callback(raw_body: bytes, params: dict, headers: dict) -> bool:
    """
    Проверить колбэк result_url.   # << HASH ПРАВИЛО — СВЕРИТЬ

    Колбэк содержит своё поле hash. Точную проверку включим по правилу из sandbox.
    Защита по умолчанию: если включён obank_verify_via_status — подтверждаем платёж
    ТОЛЬКО после перепроверки statusPayment (не доверяем телу колбэка вслепую).
    """
    if not _cfg("obank_secret"):
        logger.warning("O!Dengi secret не настроен — колбэк не доверяем")
        return False
    # При наличии правила hash — раскомментировать строгую проверку:
    #   expected = _make_callback_hash(params); return hmac.compare_digest(...)
    return True


def parse_callback(params: dict) -> dict:
    """
    Разобрать тело result_url.
    Поля: trans_id, status_pay (2=аннулирован, 3=успех), order_id, amount(копейки),
          mobile, fname, lname.
    Возврат: { ref(=order_id), order_id(=trans_id), amount(в СОМ), status, success }.
    """
    status_pay = str(params.get("status_pay", ""))
    success = status_pay == "3"
    amount_sum = _from_kopecks(params.get("amount")) if params.get("amount") is not None else None
    return {
        "ref": str(params.get("order_id") or ""),
        "order_id": str(params.get("trans_id") or ""),
        "amount": float(amount_sum) if amount_sum is not None else None,
        "status": status_pay,
        "success": success,
    }


def callback_ack(ok: bool = True) -> dict:
    """O!Dengi не обрабатывает наш ответ — отдаём 200 OK."""
    return {"status": "ok"} if ok else {"status": "error"}


# ── 3. Перепроверка статуса (statusPayment) — защита от фейков ───────────────

def check_status(order_id: str = "", invoice_id: str = "") -> dict:
    """
    Запросить актуальный статус у O!Dengi.
    Возврат: { found, approved, amount(СОМ), trans_id, mobile, fname, lname, raw }.
    """
    out = {"found": False, "approved": False, "amount": None, "trans_id": "",
           "mobile": "", "fname": "", "lname": "", "raw": None}
    if not is_api_mode():
        return out
    try:
        data = {}
        if invoice_id:
            data["invoice_id"] = invoice_id
        if order_id:
            data["order_id"] = order_id
        d = _request("statusPayment", data)
        out["raw"] = d
        pays = d.get("payments")
        if isinstance(pays, list) and pays:
            p = pays[-1]
            out["found"] = True
            out["approved"] = str(p.get("status", "")).lower() == "approved"
            out["amount"] = float(_from_kopecks(p.get("amount"))) if p.get("amount") is not None else None
            out["trans_id"] = str(p.get("trans_id") or "")
            out["mobile"] = str(p.get("mobile") or "")
            out["fname"] = str(p.get("fname") or "")
            out["lname"] = str(p.get("lname") or "")
        elif d.get("status"):
            out["found"] = True
            out["approved"] = str(d.get("status")).lower() == "approved"
    except Exception as e:
        logger.error(f"statusPayment failed for order={order_id}: {e}")
    return out


# ── 4. Баланс кошелька мерчанта (если O!Dengi API поддерживает) ──────────────

def _env(name: str, default: str = "") -> str:
    """env напрямую (на случай, если поля нет в Settings/config.py)."""
    val = _cfg(name.lower())            # сначала из Settings, если поле объявлено
    if val:
        return val
    return os.environ.get(name.upper(), default)  # иначе — прямо из окружения


def get_wallet_balance() -> Optional[Decimal]:
    """
    Баланс кошелька мерчанта в O!Dengi (сом). Возврат: Decimal или None.

    ⚠️ Команды баланса В SANDBOX-ДОКЕ O!Dengi НЕТ. Поэтому имя команды НЕ зашито,
       а берётся из env OBANK_BALANCE_CMD (напр. "getBalance" / "balance" / "getMerchantBalance"),
       когда O!Dengi (Ренат) подтвердит точное имя. До этого функция возвращает None —
       и в уведомлении баланс кошелька просто не показывается (собранное из БД — показывается).

    env:
      OBANK_BALANCE_CMD     имя команды баланса (без него → None).
      OBANK_BALANCE_FIELD   имя поля суммы в ответе (необяз.; по умолчанию пробуем balance/amount/sum/value).
      OBANK_BALANCE_IN_SUM  "1" если ответ уже в сомах (по умолчанию считаем КОПЕЙКИ, как везде в O!Dengi).

    НИКОГДА не бросает: любая ошибка / нет настройки → None (не ломаем подтверждение платежа).
    """
    try:
        if not is_api_mode():
            return None
        cmd = _env("OBANK_BALANCE_CMD")
        if not cmd:
            return None  # команда баланса ещё не настроена — реальный баланс недоступен
        d = _request(cmd, {})
        if not isinstance(d, dict):
            return None
        field = _env("OBANK_BALANCE_FIELD")
        candidates = ([field] if field else []) + ["balance", "amount", "sum", "value", "total"]
        raw = None
        for f in candidates:
            if f and d.get(f) is not None:
                raw = d.get(f)
                break
        # некоторые API кладут баланс во вложенный объект (data.wallet.balance и т.п.)
        if raw is None:
            for sub in ("wallet", "account", "merchant"):
                node = d.get(sub)
                if isinstance(node, dict):
                    for f in candidates:
                        if f and node.get(f) is not None:
                            raw = node.get(f)
                            break
                if raw is not None:
                    break
        if raw is None:
            logger.warning(f"O!Dengi balance: поле суммы не найдено в ответе ({cmd}): {d}")
            return None
        if _env("OBANK_BALANCE_IN_SUM") == "1":
            return Decimal(str(raw)).quantize(Decimal("0.01"))
        return _from_kopecks(raw)   # по умолчанию — копейки → сомы
    except Exception as e:
        logger.error(f"O!Dengi get_wallet_balance failed: {e}")
        return None
