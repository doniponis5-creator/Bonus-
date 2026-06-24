"""
SBonus+ Онлайн погашение рассрочки (O!Bank) — FastAPI router (ASYNC).

Интеграция с приложением Sbonus+:
  - app.core.database.get_db (AsyncSession), app.core.config.get_settings()
  - HMAC через settings.webhook_1c_secret, X-Api-Key через тот же секрет
  - Green API через settings.greenapi_* (payments_greenapi)
  - префиксы /webhook/1c/payment и /webhook/obank вкладываются в api_router (/api/v1)
  - публичный роутер /pay и админ /admin/payments — отдельно в main.py

Эндпоинты:
  POST /api/v1/webhook/1c/payment/create               (HMAC)  1С/POS создаёт платёж → ссылка
  GET  /api/v1/webhook/1c/payment/pending              (X-Api-Key)  1С забирает подтверждённые
  POST /api/v1/webhook/1c/payment/{pid}/mark-done      (HMAC)  1С вернул номер ПКО
  POST /api/v1/webhook/1c/payment/{pid}/mark-failed    (HMAC)  ошибка 1С (не блокирует)
  POST /api/v1/webhook/1c/payment/{pid}/confirm        (X-Api-Key)  ручное подтверждение прихода

  POST /api/v1/webhook/obank/callback                  (подпись O!Bank)  авто-подтверждение

  GET  /pay/{short_code}                               (public)  моб. страница оплаты
  GET  /pay/{short_code}/data                          (public)
  POST /pay/{short_code}/start                         (public)  открыть ссылку O!Bank
  POST /pay/{short_code}/i-paid                        (public)  «Я оплатил» → оператору

  GET  /admin/payments                                 (HTML)   панель оператора
  GET  /admin/payments/list                            (X-Api-Key)
"""
from __future__ import annotations

import hmac
import hashlib
import secrets
import string
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Request, HTTPException, Depends, Header, status
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field, validator

from app.core.config import get_settings
from app.core.database import get_db

import sys
_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from .payments_models import InstallmentPayment, PaymentEvent  # type: ignore
from . import obank_service as obank  # type: ignore
from . import payments_greenapi as wa  # type: ignore

logger = logging.getLogger("sbonus.payments")
settings = get_settings()

DEFAULT_LINK_TTL_DAYS = 7

# ── Роутеры ──────────────────────────────────────────────────────────────────
router_1c = APIRouter(prefix="/webhook/1c/payment", tags=["1С Платежи"])
router_obank = APIRouter(prefix="/webhook/obank", tags=["O!Bank callback"])
router_public = APIRouter(prefix="/pay", tags=["Онлайн оплата"])
router_admin = APIRouter(prefix="/admin/payments", tags=["Админ платежи"])


# ── Безопасность ─────────────────────────────────────────────────────────────

async def _verify_hmac(request: Request) -> bytes:
    body = await request.body()
    if not getattr(settings, "enable_1c_webhook", True):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "1C webhook отключён")
    signature = request.headers.get("X-Signature", "")
    if not signature:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "X-Signature missing")
    expected = hmac.new(settings.webhook_1c_secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "HMAC invalid")
    return body


def _verify_api_key(x_api_key: str = Header(default="")):
    if not settings.webhook_1c_secret or not hmac.compare_digest(x_api_key, settings.webhook_1c_secret):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "X-Api-Key invalid")


def _gen_short_code(n: int = 9) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


def _gen_payment_id() -> str:
    return "SBP-" + "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(10))


def _public_base_url() -> str:
    return getattr(settings, "contracts_public_base_url", "https://api.smartcentr.store")


async def _log(db: AsyncSession, payment_uuid, event_type: str, data: dict | None = None, ip: str | None = None):
    db.add(PaymentEvent(payment_uuid=payment_uuid, event_type=event_type, event_data=data, ip_address=ip))
    await db.commit()


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


# ── Pydantic ─────────────────────────────────────────────────────────────────

class ScheduleCtx(BaseModel):
    remaining: Optional[float] = None
    next_date: Optional[str] = None
    next_amount: Optional[float] = None
    paid_count: Optional[int] = None
    total_count: Optional[int] = None
    overdue: Optional[bool] = None


class PaymentCreateRequest(BaseModel):
    payment_id: Optional[str] = None          # ключ идемпотентности (1С может задать детерминированно)
    rtu_uuid: Optional[str] = None
    rtu_number: Optional[str] = None
    rtu_date: Optional[str] = None
    installment_n: Optional[int] = None
    customer_phone: str
    customer_fio: Optional[str] = None
    amount: float
    currency: str = "сом"
    account: str = "obank"
    branch_uuid: Optional[str] = None
    schedule_ctx: Optional[ScheduleCtx] = None
    send_whatsapp: bool = True
    expires_days: int = DEFAULT_LINK_TTL_DAYS

    @validator("customer_phone")
    def _norm_phone(cls, v):
        p = (v or "").strip().replace(" ", "").replace("-", "")
        if not p:
            raise ValueError("customer_phone required")
        if not p.startswith("+"):
            p = "+" + p
        return p

    @validator("amount")
    def _amount_positive(cls, v):
        if v is None or float(v) <= 0:
            raise ValueError("amount must be > 0")
        return float(v)


class PaymentCreateResponse(BaseModel):
    ok: bool = True
    payment_id: str
    short_code: str
    public_url: str
    pay_url: str
    whatsapp_sent: bool = False


class MarkDoneRequest(BaseModel):
    onec_doc_number: str


class MarkFailedRequest(BaseModel):
    note: Optional[str] = ""


class ConfirmRequest(BaseModel):
    note: Optional[str] = ""
    obank_order_id: Optional[str] = None


# ── Общая логика подтверждения + АВТО-квитанция ──────────────────────────────

async def _confirm_payment(db: AsyncSession, p: InstallmentPayment, by: str,
                           order_id: str | None = None, raw: dict | None = None) -> bool:
    """
    Пометить платёж подтверждённым (приход реально пришёл) и отправить авто-квитанцию.
    Идемпотентно: повторный вызов не шлёт вторую квитанцию.
    Возврат: True если это первое подтверждение (квитанция отправлена).
    """
    if p.confirmed:
        return False
    p.confirmed = True
    p.confirmed_by = by
    p.confirmed_at = datetime.utcnow()
    p.paid_at = datetime.utcnow()
    if p.status not in ("synced",):
        p.status = "confirmed"
    if order_id:
        p.obank_order_id = order_id
    if raw is not None:
        p.obank_raw = raw
    await db.commit()
    await _log(db, p.id, "confirmed", {"by": by, "order_id": order_id})

    # МГНОВЕННЫЙ ACK клиенту (по приходу денег, с сервера 24/7): "оплата получена, квитанция придёт".
    # ПОЛНУЮ оригинальную квитанцию (PDF + график/просрочка) пришлёт 1С при проведении ПКО.
    try:
        wa.send_instant_ack(phone=p.customer_phone, client_name=p.customer_fio, amount=p.amount)
        await _log(db, p.id, "instant_ack_sent", None)
    except Exception as e:
        logger.error(f"instant ack failed for {p.payment_id}: {e}")
        await _log(db, p.id, "instant_ack_failed", {"error": str(e)})

    # ── Итоги для админа ─────────────────────────────────────────────────────
    # 1) Всего собрано онлайн — сумма ВСЕХ подтверждённых платежей из нашей БД (включая текущий).
    collected_total = None
    try:
        res_sum = await db.execute(
            select(func.coalesce(func.sum(InstallmentPayment.amount), 0)).where(
                and_(InstallmentPayment.confirmed == True,  # noqa: E712
                     InstallmentPayment.account.in_(("obank", "online")))
            )
        )
        collected_total = res_sum.scalar() or 0
    except Exception as e:
        logger.error(f"collected_total calc failed for {p.payment_id}: {e}")

    # 2) Реальный баланс кошелька O!Dengi — только если команда баланса настроена (env OBANK_BALANCE_CMD).
    #    Иначе None → в уведомлении эта строка просто не показывается.
    wallet_balance = None
    try:
        wallet_balance = obank.get_wallet_balance()
    except Exception as e:
        logger.error(f"wallet balance fetch failed for {p.payment_id}: {e}")

    # Уведомление АДМИНУ в WhatsApp (новое). Ошибка не ломает подтверждение.
    try:
        admin_phone = getattr(settings, "admin_notify_phone", "") or "996557100505"
        if admin_phone:
            wa.send_admin_notification(
                admin_phone=admin_phone,
                client_name=p.customer_fio,
                amount=p.amount,
                rtu_number=p.rtu_number or "",
                customer_phone=p.customer_phone or "",
                paid_at=p.paid_at.isoformat() if p.paid_at else None,
                collected_total=collected_total,
                wallet_balance=wallet_balance,
            )
            await _log(db, p.id, "admin_notified", {
                "to": admin_phone,
                "collected_total": float(collected_total) if collected_total is not None else None,
                "wallet_balance": float(wallet_balance) if wallet_balance is not None else None,
            })
    except Exception as e:
        logger.error(f"admin notify failed for {p.payment_id}: {e}")
        await _log(db, p.id, "admin_notify_failed", {"error": str(e)})
    return True


# ════════════════════════════════════════════════════════════════════════════
# 1С эндпоинты
# ════════════════════════════════════════════════════════════════════════════

@router_1c.post("/create", response_model=PaymentCreateResponse)
async def create_payment(request: Request, db: AsyncSession = Depends(get_db)):
    body = await _verify_hmac(request)
    import json as _json
    data = PaymentCreateRequest(**_json.loads(body))

    # Идемпотентность: если payment_id задан и уже есть — вернуть существующий
    if data.payment_id:
        res = await db.execute(select(InstallmentPayment).where(InstallmentPayment.payment_id == data.payment_id))
        ex = res.scalar_one_or_none()
        if ex:
            return PaymentCreateResponse(
                payment_id=ex.payment_id, short_code=ex.short_code,
                public_url=f"{_public_base_url()}/pay/{ex.short_code}",
                pay_url=ex.pay_url or "", whatsapp_sent=False,
            )

    payment_id = data.payment_id or _gen_payment_id()
    # уникальный short_code
    short_code = None
    for _ in range(10):
        cand = _gen_short_code()
        r = await db.execute(select(InstallmentPayment).where(InstallmentPayment.short_code == cand))
        if r.scalar_one_or_none() is None:
            short_code = cand
            break
    if short_code is None:
        raise HTTPException(500, "failed to generate short_code")

    rtu_date = None
    if data.rtu_date:
        try:
            rtu_date = datetime.fromisoformat(data.rtu_date.replace("Z", ""))
        except ValueError:
            rtu_date = None

    p = InstallmentPayment(
        payment_id=payment_id,
        short_code=short_code,
        branch_uuid=data.branch_uuid,
        rtu_uuid_1c=data.rtu_uuid,
        rtu_number=data.rtu_number,
        rtu_date=rtu_date,
        installment_n=data.installment_n,
        customer_phone=data.customer_phone,
        customer_fio=data.customer_fio,
        amount=Decimal(str(data.amount)),
        currency=data.currency,
        account=data.account,
        schedule_ctx=(data.schedule_ctx.dict(exclude_none=True) if data.schedule_ctx else None),
        status="pending",
        expires_at=datetime.utcnow() + timedelta(days=max(1, data.expires_days)),
    )
    # ссылка O!Bank (адаптер). Никогда не валим create из-за O!Bank.
    try:
        p.pay_url = obank.build_pay_url(p)
    except Exception as e:
        logger.error(f"build_pay_url failed: {e}")
        p.pay_url = obank._cfg("obank_pay_link")

    db.add(p)
    await db.commit()
    await _log(db, p.id, "created", {"amount": float(p.amount), "rtu": p.rtu_number})

    whatsapp_sent = False
    if data.send_whatsapp:
        try:
            wa.send_pay_link(
                phone=p.customer_phone, client_name=p.customer_fio, amount=p.amount,
                pay_url=p.pay_url or "", rtu_number=p.rtu_number or "",
                public_url=f"{_public_base_url()}/pay/{p.short_code}", ref=p.payment_id,
            )
            whatsapp_sent = True
            await _log(db, p.id, "sent_wa", None)
        except Exception as e:
            logger.error(f"send_pay_link failed: {e}")

    return PaymentCreateResponse(
        payment_id=p.payment_id, short_code=p.short_code,
        public_url=f"{_public_base_url()}/pay/{p.short_code}",
        pay_url=p.pay_url or "", whatsapp_sent=whatsapp_sent,
    )


@router_1c.get("/pending")
async def list_pending(_=Depends(_verify_api_key), limit: int = 50, db: AsyncSession = Depends(get_db)):
    """Подтверждённые платежи, для которых 1С ещё не создал ПКО."""
    res = await db.execute(
        select(InstallmentPayment).where(
            and_(InstallmentPayment.confirmed == True,  # noqa: E712
                 InstallmentPayment.status != "synced",
                 InstallmentPayment.status != "reversed")
        ).order_by(InstallmentPayment.confirmed_at.asc()).limit(min(limit, 200))
    )
    items = res.scalars().all()
    return {"ok": True, "count": len(items), "payments": [p.to_1c_dict() | {"schedule_ctx": p.schedule_ctx} for p in items]}


@router_1c.post("/{payment_id}/mark-done")
async def mark_done(payment_id: str, payload: MarkDoneRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await _verify_hmac(request)
    res = await db.execute(select(InstallmentPayment).where(InstallmentPayment.payment_id == payment_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "payment not found")
    p.status = "synced"
    p.onec_doc_number = payload.onec_doc_number
    p.synced_at = datetime.utcnow()
    await db.commit()
    await _log(db, p.id, "synced", {"pko": payload.onec_doc_number})
    return {"ok": True}


@router_1c.post("/{payment_id}/mark-failed")
async def mark_failed(payment_id: str, payload: MarkFailedRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await _verify_hmac(request)
    res = await db.execute(select(InstallmentPayment).where(InstallmentPayment.payment_id == payment_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "payment not found")
    p.sync_attempts = (p.sync_attempts or 0) + 1
    p.note = (payload.note or "")[:1000]
    if p.sync_attempts >= 5:
        p.status = "failed"  # хватит ретраить, оператор разберётся вручную
    await db.commit()
    await _log(db, p.id, "failed", {"note": payload.note, "attempts": p.sync_attempts})
    return {"ok": True, "attempts": p.sync_attempts}


@router_1c.post("/{payment_id}/confirm")
async def operator_confirm(payment_id: str, payload: ConfirmRequest, _=Depends(_verify_api_key), db: AsyncSession = Depends(get_db)):
    """Ручное подтверждение прихода оператором (для STATIC LINK кейса)."""
    res = await db.execute(select(InstallmentPayment).where(InstallmentPayment.payment_id == payment_id))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "payment not found")
    if payload.note:
        p.note = payload.note[:1000]
    first = await _confirm_payment(db, p, by="operator", order_id=payload.obank_order_id)
    return {"ok": True, "first_confirm": first, "status": p.status}


# ════════════════════════════════════════════════════════════════════════════
# O!Bank callback (авто-подтверждение)
# ════════════════════════════════════════════════════════════════════════════

async def _collect_params(request: Request) -> dict:
    params = dict(request.query_params)
    try:
        ctype = request.headers.get("content-type", "")
        if "application/json" in ctype:
            j = await request.json()
            if isinstance(j, dict):
                params.update(j)
        else:
            form = await request.form()
            params.update({k: str(v) for k, v in form.items()})
    except Exception:
        pass
    return params


@router_obank.api_route("/callback", methods=["POST", "GET"])
async def obank_callback(request: Request, db: AsyncSession = Depends(get_db)):
    raw = await request.body()
    params = await _collect_params(request)
    ip = _client_ip(request)

    if not obank.verify_callback(raw, params, dict(request.headers)):
        logger.warning(f"O!Bank callback подпись не прошла. ip={ip} params={params}")
        return JSONResponse(obank.callback_ack(False), status_code=400)

    info = obank.parse_callback(params)
    ref = info.get("ref")
    res = await db.execute(select(InstallmentPayment).where(InstallmentPayment.payment_id == ref))
    p = res.scalar_one_or_none()
    if not p:
        logger.warning(f"O!Bank callback: платёж {ref} не найден")
        return JSONResponse(obank.callback_ack(False), status_code=404)

    p.obank_status = info.get("status")
    await db.commit()
    await _log(db, p.id, "callback", {"info": info, "ip": ip})

    if not info.get("success"):
        return JSONResponse(obank.callback_ack(True))  # принято, но не успешный статус

    # ЗАЩИТА: перепроверяем статус напрямую у O!Dengi (не доверяем телу колбэка вслепую)
    if getattr(settings, "obank_verify_via_status", True) and obank.is_api_mode():
        st = obank.check_status(order_id=p.payment_id, invoice_id=p.obank_invoice_id or "")
        if not st.get("approved"):
            await _log(db, p.id, "callback_unconfirmed", {"status_check": st})
            return JSONResponse(obank.callback_ack(True))  # ещё не approved — ждём
        if st.get("trans_id"):
            info["order_id"] = st["trans_id"]

    # проверка суммы (мягкая): расхождение логируем, но приход признаём
    try:
        cb_amt = Decimal(str(info.get("amount")))
        if abs(cb_amt - Decimal(str(p.amount))) > Decimal("1"):
            p.note = f"⚠ сумма колбэка {cb_amt} ≠ {p.amount}"
            await db.commit()
    except (TypeError, ValueError):
        pass

    await _confirm_payment(db, p, by="obank_callback", order_id=info.get("order_id"), raw=params)
    return JSONResponse(obank.callback_ack(True))


# ════════════════════════════════════════════════════════════════════════════
# Публичная страница оплаты
# ════════════════════════════════════════════════════════════════════════════

async def _get_by_code(db: AsyncSession, short_code: str) -> InstallmentPayment:
    res = await db.execute(select(InstallmentPayment).where(InstallmentPayment.short_code == short_code))
    p = res.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "payment not found")
    return p


@router_public.get("/{short_code}", response_class=HTMLResponse)
async def pay_page(short_code: str, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(InstallmentPayment).where(InstallmentPayment.short_code == short_code))
    p = res.scalar_one_or_none()
    if not p:
        return HTMLResponse(_render_error("Платёж не найден"), status_code=404)
    if p.expires_at and datetime.utcnow() > p.expires_at and not p.confirmed:
        return HTMLResponse(_render_error("Срок ссылки истёк. Обратитесь в магазин."), status_code=410)
    html_path = _THIS_DIR / "templates" / "pay_page.html"
    if html_path.exists():
        return HTMLResponse(html_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>pay_page.html not found</h1>", status_code=500)


@router_public.get("/{short_code}/data")
async def pay_data(short_code: str, request: Request, db: AsyncSession = Depends(get_db)):
    p = await _get_by_code(db, short_code)
    await _log(db, p.id, "viewed", None, ip=_client_ip(request))
    return p.to_public_dict()


@router_public.post("/{short_code}/start")
async def pay_start(short_code: str, request: Request, db: AsyncSession = Depends(get_db)):
    p = await _get_by_code(db, short_code)
    await _log(db, p.id, "pay_started", None, ip=_client_ip(request))
    return {"ok": True, "pay_url": p.pay_url}


@router_public.post("/{short_code}/i-paid")
async def i_paid(short_code: str, request: Request, db: AsyncSession = Depends(get_db)):
    p = await _get_by_code(db, short_code)
    if not p.confirmed:
        p.client_claimed_paid = True
        await db.commit()
        await _log(db, p.id, "client_claimed", None, ip=_client_ip(request))
    return {"ok": True, "confirmed": p.confirmed}


# ════════════════════════════════════════════════════════════════════════════
# Админ-панель оператора
# ════════════════════════════════════════════════════════════════════════════

@router_admin.get("", response_class=HTMLResponse)
async def admin_page():
    html_path = _THIS_DIR / "templates" / "admin_payments.html"
    if html_path.exists():
        return HTMLResponse(html_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>admin_payments.html not found</h1>", status_code=500)


@router_admin.get("/list")
async def admin_list(_=Depends(_verify_api_key), limit: int = 100, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(InstallmentPayment).order_by(InstallmentPayment.created_at.desc()).limit(min(limit, 300)))
    items = res.scalars().all()
    return {
        "ok": True,
        "payments": [{
            "payment_id": p.payment_id, "short_code": p.short_code,
            "rtu_number": p.rtu_number, "customer_phone": p.customer_phone,
            "customer_fio": p.customer_fio, "amount": float(p.amount),
            "status": p.status, "confirmed": p.confirmed, "confirmed_by": p.confirmed_by,
            "client_claimed_paid": p.client_claimed_paid,
            "onec_doc_number": p.onec_doc_number, "pay_url": p.pay_url,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "public_url": f"{_public_base_url()}/pay/{p.short_code}",
        } for p in items],
    }


# ── error page ───────────────────────────────────────────────────────────────

def _render_error(message: str) -> str:
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Смарт Центр</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
<div><div style="font-size:48px">🏪</div><h2>Смарт Центр</h2>
<p style="color:#94a3b8">{message}</p></div></body></html>"""
