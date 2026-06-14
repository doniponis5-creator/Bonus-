"""
SBonus+ Онлайн Договор — FastAPI router (ASYNC version).

Интеграция с существующим приложением Sbonus+:
  - использует app.core.database.get_db (AsyncSession)
  - использует app.core.config.get_settings()
  - HMAC через settings.webhook_1c_secret
  - Green API через settings.greenapi_*
  - префикс /webhook/1c/contract вкладывается в api_router (/api/v1)
  - публичный роутер /c прикрепляется отдельно в main.py

Эндпоинты:
  POST   /api/v1/webhook/1c/contract/create        (HMAC)
  GET    /api/v1/webhook/1c/contract/{id}/status   (X-Api-Key)
  GET    /api/v1/webhook/1c/contract/pending       (X-Api-Key)
  POST   /api/v1/webhook/1c/contract/{id}/mark-downloaded (HMAC)

  GET    /c/{short_code}                           (public)
  GET    /c/{short_code}/data                      (public)
  POST   /c/{short_code}/send-otp                  (public)
  POST   /c/{short_code}/verify-otp                (public)
  POST   /c/{short_code}/sign                      (public)
  GET    /c/{short_code}/pdf                       (public)
"""
from __future__ import annotations

import hmac
import hashlib
import json as _json
import secrets
import string
import logging
import asyncio
from datetime import datetime, timedelta, date
from decimal import Decimal
from uuid import UUID
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Request, HTTPException, Depends, Header, status
from fastapi.responses import FileResponse, HTMLResponse
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field, validator

from app.core.config import get_settings
from app.core.database import get_db

# Локальные модули контрактов (рядом с этим файлом)
import sys
_THIS_DIR = Path(__file__).parent
if str(_THIS_DIR) not in sys.path:
    sys.path.insert(0, str(_THIS_DIR))

from .contracts_models import Contract, ContractOTP, ContractEvent  # type: ignore
from .num2words_ru import amount_to_words_kgs  # type: ignore
from .schedule_calc import build_schedule  # type: ignore
from .pdf_builder import (  # type: ignore
    ensure_unsigned_pdf, regenerate_signed_pdf, PDF_STORAGE,
    build_schedule_pdf,
)
from . import green_api_service as gapi  # type: ignore

logger = logging.getLogger("sbonus.contracts")
settings = get_settings()

OTP_TTL_SECONDS = 300
OTP_MAX_ATTEMPTS = 5

# ── Два роутера ───────────────────────────────────────────────────────────
# 1C-эндпоинты (HMAC) — попадают в api_router → /api/v1/...
router_1c = APIRouter(prefix="/webhook/1c/contract", tags=["1С Договор"])

# Публичные эндпоинты — клиент открывает по короткой ссылке
router_public = APIRouter(prefix="/c", tags=["Онлайн договор"])


# ── Безопасность ──────────────────────────────────────────────────────────

async def _verify_hmac(request: Request) -> bytes:
    body = await request.body()
    if not settings.enable_1c_webhook:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "1C webhook отключён")
    signature = request.headers.get("X-Signature", "")
    if not signature:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "X-Signature missing")
    expected = hmac.new(
        settings.webhook_1c_secret.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "HMAC invalid")
    return body


def _verify_api_key(x_api_key: str = Header(default="")):
    if not settings.webhook_1c_secret or not hmac.compare_digest(
        x_api_key, settings.webhook_1c_secret
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "X-Api-Key invalid")


def _gen_short_code(n: int = 9) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


def _gen_otp(n: int = 6) -> str:
    return "".join(secrets.choice(string.digits) for _ in range(n))


async def _log_event(
    db: AsyncSession, contract_id, event_type: str,
    data: dict | None = None, ip: str | None = None
):
    db.add(ContractEvent(
        contract_id=contract_id,
        event_type=event_type,
        event_data=data,
        ip_address=ip,
    ))
    await db.commit()


def _public_base_url() -> str:
    """База для публичных URL клиента. Берём из настроек, fallback на shop-домен."""
    return getattr(settings, "contracts_public_base_url", "https://api.smartcentr.store")


# ── Pydantic схемы ────────────────────────────────────────────────────────

class ContractItem(BaseModel):
    name: str
    qty: float
    price: float
    sum: float


class ContractCreateRequest(BaseModel):
    branch_uuid: UUID
    rtu_uuid_1c: str
    rtu_number: str
    rtu_date: datetime
    city: str = "с.Араван"

    seller_fio: str
    seller_inn: Optional[str] = None
    seller_address: Optional[str] = None
    seller_account: Optional[str] = None

    client_phone: str
    client_fio: str
    client_passport_serial: Optional[str] = None
    client_passport_date: Optional[date] = None
    client_passport_issuer: Optional[str] = None
    client_inn: Optional[str] = None
    client_address: Optional[str] = None

    guarantor_fio: Optional[str] = None
    guarantor_phone: Optional[str] = None
    guarantor_passport: Optional[str] = None
    guarantor_inn: Optional[str] = None
    guarantor_address: Optional[str] = None

    items: List[ContractItem]
    total_amount: float
    initial_payment: float = 0
    term_months: int = Field(..., gt=0, le=60)
    first_payment_date: Optional[date] = None
    # Если 1C прислал готовый график — используем его вместо автогенерации
    schedule_from_1c: Optional[List[dict]] = None

    @validator("client_phone", "guarantor_phone", always=False)
    def _phone_norm(cls, v):
        if not v:
            return v
        v = v.strip().replace(" ", "").replace("-", "")
        for sep in ["//", ";", ",", "/"]:
            if sep in v:
                v = v.split(sep)[0]
        v = v.replace("+", "")
        if v.startswith("00"):
            v = v[2:]
        if not v:
            return None
        v = "+" + v
        return v[:32]

    @validator("client_passport_date", "first_payment_date", pre=True, always=False)
    def _empty_date_to_none(cls, v):
        """Пустые строки преобразуем в None (1C может прислать '' вместо null)."""
        if v == "" or v is None:
            return None
        return v


class ContractCreateResponse(BaseModel):
    success: bool
    contract_id: str
    short_code: str
    public_url: str
    pdf_url: str
    message: str


class VerifyOTPRequest(BaseModel):
    code: str


class SignRequest(BaseModel):
    # Имзо ихтиёрий: подпись = согласие + OTP подтверждение через WhatsApp
    signature_b64: Optional[str] = None

    @validator("signature_b64")
    def _check(cls, v):
        if v is None or v == "":
            return None
        if not v.startswith("data:image/"):
            raise ValueError("must be data URL PNG")
        if len(v) > 500_000:
            raise ValueError("signature too large (max 500KB)")
        return v


# ════════════════════════════════════════════════════════════════════════════
# 1С → СЕРВЕР
# ════════════════════════════════════════════════════════════════════════════

@router_1c.post("/create", response_model=ContractCreateResponse)
async def create_contract(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    body = await _verify_hmac(request)
    try:
        data = _json.loads(body)
    except Exception:
        raise HTTPException(400, "invalid json")
    payload = ContractCreateRequest(**data)

    # Проверка дубликата: если для этого РТУ уже есть АКТИВНЫЙ договор — вернуть его
    existing_q = await db.execute(
        select(Contract).where(and_(
            Contract.rtu_uuid_1c == payload.rtu_uuid_1c,
            Contract.status.in_(["pending", "viewed", "signed"]),
        )).order_by(Contract.created_at.desc()).limit(1)
    )
    existing = existing_q.scalar_one_or_none()
    if existing:
        logger.info(f"Duplicate request for RTU {payload.rtu_number} → returning existing contract {existing.id}")
        public_url = f"{_public_base_url()}/c/{existing.short_code}"
        return ContractCreateResponse(
            success=True,
            contract_id=str(existing.id),
            short_code=existing.short_code,
            public_url=public_url,
            pdf_url=f"{public_url}/pdf",
            message=f"Договор уже существует (статус: {existing.status})",
        )

    first_date = payload.first_payment_date or date.today()
    logger.info(f"CREATE RTU={payload.rtu_number} term={payload.term_months} schedule_from_1c={payload.schedule_from_1c}")
    # Если 1C прислал готовый график (РТУ.РасшифровкаПлатежа) — используем его
    if payload.schedule_from_1c and len(payload.schedule_from_1c) > 0:
        schedule = payload.schedule_from_1c
        logger.info(f"Using schedule from 1C: {len(schedule)} payments")
    else:
        logger.warning(f"NO schedule_from_1c for RTU {payload.rtu_number}, using auto-build ({payload.term_months} months)")
        schedule = build_schedule(
            total_amount=payload.total_amount,
            term_months=payload.term_months,
            start_date=first_date,
            initial_payment=payload.initial_payment,
        )
    words = amount_to_words_kgs(payload.total_amount)

    # Уникальный short_code
    short_code = None
    for _ in range(10):
        candidate = _gen_short_code()
        result = await db.execute(select(Contract).where(Contract.short_code == candidate))
        if not result.scalar_one_or_none():
            short_code = candidate
            break
    if short_code is None:
        raise HTTPException(500, "failed to generate short_code")

    contract = Contract(
        short_code=short_code,
        rtu_uuid_1c=payload.rtu_uuid_1c,
        rtu_number=payload.rtu_number,
        rtu_date=payload.rtu_date,
        branch_uuid=payload.branch_uuid,
        city=payload.city,
        seller_fio=payload.seller_fio,
        seller_inn=payload.seller_inn,
        seller_address=payload.seller_address,
        seller_account=payload.seller_account,
        client_phone=payload.client_phone,
        client_fio=payload.client_fio,
        client_passport_serial=payload.client_passport_serial,
        client_passport_date=payload.client_passport_date,
        client_passport_issuer=payload.client_passport_issuer,
        client_inn=payload.client_inn,
        client_address=payload.client_address,
        guarantor_fio=payload.guarantor_fio,
        guarantor_phone=payload.guarantor_phone,
        guarantor_passport=payload.guarantor_passport,
        guarantor_inn=payload.guarantor_inn,
        guarantor_address=payload.guarantor_address,
        items_json=[i.dict() for i in payload.items],
        total_amount=Decimal(str(payload.total_amount)),
        total_amount_words=words,
        initial_payment=Decimal(str(payload.initial_payment)),
        term_months=payload.term_months,
        schedule_json=schedule,
        status="pending",
    )
    db.add(contract)
    await db.commit()
    await db.refresh(contract)

    # PDF в отдельном потоке (WeasyPrint синхронный)
    try:
        await asyncio.to_thread(ensure_unsigned_pdf, contract)
        await db.commit()
    except Exception:
        logger.exception("PDF generation failed (ignored)")

    await _log_event(db, contract.id, "created", {"rtu": payload.rtu_number})

    public_url = f"{_public_base_url()}/c/{short_code}"
    pdf_url = f"{public_url}/pdf"

    # WhatsApp (best-effort)
    if settings.enable_whatsapp_notifications:
        try:
            await asyncio.to_thread(
                gapi.send_contract_link,
                payload.client_phone,
                payload.client_fio.split()[0] if payload.client_fio else "клиент",
                public_url,
                payload.rtu_number,
            )
            await _log_event(db, contract.id, "sent_wa", {"to": payload.client_phone})
        except Exception as e:
            logger.warning(f"WA send failed: {e}")

    return ContractCreateResponse(
        success=True,
        contract_id=str(contract.id),
        short_code=short_code,
        public_url=public_url,
        pdf_url=pdf_url,
        message="Договор создан, ссылка отправлена клиенту",
    )


def _status_response(contract: Contract):
    return {
        "success": True,
        "contract_id": str(contract.id),
        "short_code": contract.short_code,
        "rtu_number": contract.rtu_number,
        "rtu_uuid_1c": contract.rtu_uuid_1c,
        "status": contract.status,
        "signed_at": contract.signed_at.isoformat() if contract.signed_at else None,
        "pdf_url": f"{_public_base_url()}/c/{contract.short_code}/pdf" if contract.status == "signed" else None,
        "public_url": f"{_public_base_url()}/c/{contract.short_code}",
        "viewed_at": contract.viewed_at.isoformat() if contract.viewed_at else None,
    }


@router_1c.get("/{contract_id}/status")
async def get_contract_status(
    contract_id: UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(_verify_api_key),
):
    result = await db.execute(select(Contract).where(Contract.id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(404, "not found")
    return _status_response(contract)


@router_1c.get("/by-rtu/{rtu_uuid}/status")
async def get_contract_status_by_rtu(
    rtu_uuid: str,
    db: AsyncSession = Depends(get_db),
    _=Depends(_verify_api_key),
):
    """Получить статус договора по UUID документа РТУ из 1С (последний созданный)."""
    result = await db.execute(
        select(Contract)
        .where(Contract.rtu_uuid_1c == rtu_uuid)
        .order_by(Contract.created_at.desc())
        .limit(1)
    )
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(404, "not found")
    return _status_response(contract)


@router_1c.get("/pending-download")
async def list_pending_for_1c(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _=Depends(_verify_api_key),
):
    q = (select(Contract)
         .where(and_(Contract.status == "signed", Contract.pdf_sent_to_1c == False))
         .order_by(Contract.signed_at.asc())
         .limit(limit))
    result = await db.execute(q)
    items = result.scalars().all()
    return {
        "success": True,
        "contracts": [
            {
                "contract_id": str(c.id),
                "short_code": c.short_code,
                "rtu_uuid_1c": c.rtu_uuid_1c,
                "rtu_number": c.rtu_number,
                "signed_at": c.signed_at.isoformat(),
                "pdf_url": f"{_public_base_url()}/c/{c.short_code}/pdf",
            }
            for c in items
        ],
    }


@router_1c.post("/{contract_id}/mark-downloaded")
async def mark_downloaded(
    contract_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    await _verify_hmac(request)
    result = await db.execute(select(Contract).where(Contract.id == contract_id))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(404)
    contract.pdf_sent_to_1c = True
    await db.commit()
    await _log_event(db, contract.id, "pdf_downloaded_by_1c")
    return {"success": True}


# ════════════════════════════════════════════════════════════════════════════
# КЛИЕНТ (public, без auth)
# ════════════════════════════════════════════════════════════════════════════

@router_public.get("/{short_code}", response_class=HTMLResponse)
async def sign_page(short_code: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Contract).where(Contract.short_code == short_code))
    contract = result.scalar_one_or_none()
    if not contract:
        return HTMLResponse(_render_error_page("Договор не найден"), status_code=404)
    if contract.status == "cancelled":
        return HTMLResponse(_render_error_page("Договор отменён"), status_code=410)
    if contract.status == "expired":
        return HTMLResponse(_render_error_page("Срок ссылки истёк"), status_code=410)

    if not contract.viewed_at:
        contract.viewed_at = datetime.utcnow()
        if contract.status == "pending":
            contract.status = "viewed"
        await db.commit()
        await _log_event(db, contract.id, "viewed")

    html_path = Path(__file__).parent / "templates" / "sign_page.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


@router_public.get("/{short_code}/data")
async def get_contract_public_data(short_code: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Contract).where(Contract.short_code == short_code))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(404, "not_found")
    return contract.to_public_dict()


@router_public.post("/{short_code}/send-otp")
async def send_otp(short_code: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Contract).where(Contract.short_code == short_code))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(404)
    if contract.status == "signed":
        raise HTTPException(400, "already_signed")

    # Rate-limit: 1 OTP per 60s
    cutoff = datetime.utcnow() - timedelta(seconds=60)
    recent_q = await db.execute(
        select(ContractOTP).where(
            and_(ContractOTP.contract_id == contract.id,
                 ContractOTP.created_at > cutoff)
        )
    )
    if recent_q.scalar_one_or_none():
        raise HTTPException(429, "wait_60s")

    code = _gen_otp(6)
    otp = ContractOTP(
        contract_id=contract.id,
        code=code,
        expires_at=datetime.utcnow() + timedelta(seconds=OTP_TTL_SECONDS),
    )
    db.add(otp)
    await db.commit()

    try:
        await asyncio.to_thread(gapi.send_otp, contract.client_phone, code)
    except gapi.GreenAPIError as e:
        raise HTTPException(502, f"wa_send_failed: {e}")

    await _log_event(db, contract.id, "otp_sent")
    return {"success": True, "ttl_seconds": OTP_TTL_SECONDS}


@router_public.post("/{short_code}/verify-otp")
async def verify_otp(short_code: str, payload: VerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Contract).where(Contract.short_code == short_code))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(404)

    q = (select(ContractOTP)
         .where(and_(
             ContractOTP.contract_id == contract.id,
             ContractOTP.verified == False,
             ContractOTP.expires_at > datetime.utcnow(),
         ))
         .order_by(ContractOTP.created_at.desc()))
    otp_result = await db.execute(q)
    otp = otp_result.scalars().first()
    if not otp:
        raise HTTPException(400, "otp_expired_or_missing")

    otp.attempts += 1
    if otp.attempts > OTP_MAX_ATTEMPTS:
        otp.expires_at = datetime.utcnow()
        await db.commit()
        raise HTTPException(429, "too_many_attempts")

    if not hmac.compare_digest(otp.code, payload.code.strip()):
        await db.commit()
        raise HTTPException(400, "wrong_code")

    otp.verified = True
    contract.otp_verified = True
    await db.commit()
    await _log_event(db, contract.id, "otp_verified")
    return {"success": True}


@router_public.post("/{short_code}/sign")
async def sign_contract(
    short_code: str,
    payload: SignRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Contract).where(Contract.short_code == short_code))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(404)
    if contract.status == "signed":
        return {"success": True, "already_signed": True}
    if not contract.otp_verified:
        raise HTTPException(400, "otp_required")

    contract.signature_b64 = payload.signature_b64
    contract.signature_ip = request.client.host if request.client else None
    contract.signature_user_agent = request.headers.get("user-agent")
    contract.signed_at = datetime.utcnow()
    contract.status = "signed"
    await db.commit()
    await _log_event(db, contract.id, "signed", ip=contract.signature_ip)

    try:
        await asyncio.to_thread(regenerate_signed_pdf, contract)
        await db.commit()
    except Exception:
        logger.exception("Signed PDF gen failed")

    pdf_url = f"{_public_base_url()}/c/{short_code}/pdf"
    if contract.pdf_signed_path and settings.enable_whatsapp_notifications:
        try:
            await asyncio.to_thread(
                gapi.send_signed_pdf,
                contract.client_phone, pdf_url, contract.rtu_number
            )
            contract.pdf_sent_to_client = True
            await db.commit()
            await _log_event(db, contract.id, "pdf_sent_to_client")
        except Exception as e:
            logger.warning(f"send signed pdf failed: {e}")

    return {"success": True, "pdf_url": pdf_url}


@router_public.get("/{short_code}/schedule.pdf")
async def download_schedule_pdf(short_code: str, db: AsyncSession = Depends(get_db)):
    """Печатная форма «График погашения рассрочки» (отдельный PDF)."""
    from fastapi.responses import Response
    result = await db.execute(select(Contract).where(Contract.short_code == short_code))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(404)
    try:
        data = await asyncio.to_thread(build_schedule_pdf, contract)
    except Exception as e:
        logger.exception(f"schedule pdf err: {e}")
        raise HTTPException(500, "Не удалось сформировать график")
    from urllib.parse import quote
    # ASCII-фолбек + UTF-8 (RFC 5987) для кириллических имён
    rtu_ascii = "".join(ch if ord(ch) < 128 else "_" for ch in (contract.rtu_number or "contract"))
    filename_ascii = f"Grafik_{rtu_ascii}.pdf"
    filename_utf8 = quote(f"Grafik_{contract.rtu_number or 'contract'}.pdf")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition":
                f'attachment; filename="{filename_ascii}"; filename*=UTF-8\'\'{filename_utf8}'
        },
    )


@router_public.get("/{short_code}/pdf")
async def download_pdf(short_code: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Contract).where(Contract.short_code == short_code))
    contract = result.scalar_one_or_none()
    if not contract:
        raise HTTPException(404)

    path = contract.pdf_signed_path if contract.status == "signed" else contract.pdf_unsigned_path
    if not path or not Path(path).exists():
        if contract.status == "signed":
            path = await asyncio.to_thread(regenerate_signed_pdf, contract)
        else:
            path = await asyncio.to_thread(ensure_unsigned_pdf, contract)
        await db.commit()
    from urllib.parse import quote as _q
    rtu_ascii = "".join(ch if ord(ch) < 128 else "_" for ch in (contract.rtu_number or "contract"))
    filename_ascii = f"Shartnoma_{rtu_ascii}.pdf"
    filename_utf8 = _q(f"Shartnoma_{contract.rtu_number or 'contract'}.pdf")
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={
            "Content-Disposition":
                f'attachment; filename="{filename_ascii}"; filename*=UTF-8\'\'{filename_utf8}'
        },
    )


def _render_error_page(message: str) -> str:
    return ("<!doctype html><html><head><meta charset=\"utf-8\">"
            "<title>Smart Centr</title></head>"
            "<body style=\"font-family:sans-serif;text-align:center;padding:60px\">"
            f"<h1 style=\"color:#20c997\">!</h1><h2>{message}</h2>"
            "<p style=\"color:#888\">Свяжитесь с продавцом</p></body></html>")


# ════════════════════════════════════════════════════════════════════════════
# CRON: автоматик expired + эслатма (серверда main.py дан чақирилади)
# ════════════════════════════════════════════════════════════════════════════

EXPIRE_DAYS = 7
REMINDER_DAYS = 3


async def cron_expire_and_remind(db: AsyncSession):
    """7 кундан кейин имзоланмаган договорларни expired қилиш.
    3 кундан кейин эслатма юбориш (бир марта)."""
    now = datetime.utcnow()
    expire_cutoff = now - timedelta(days=EXPIRE_DAYS)
    remind_cutoff = now - timedelta(days=REMINDER_DAYS)

    # 1. Expired қилиш (7+ кун, pending/viewed)
    q_expire = (
        select(Contract)
        .where(and_(
            Contract.status.in_(["pending", "viewed"]),
            Contract.created_at < expire_cutoff,
        ))
    )
    result = await db.execute(q_expire)
    expired_contracts = result.scalars().all()
    expired_count = 0
    for c in expired_contracts:
        c.status = "expired"
        expired_count += 1
        await _log_event(db, c.id, "auto_expired")
    if expired_count:
        await db.commit()
        logger.info(f"Cron: expired {expired_count} contracts")

    # 2. Эслатма юбориш (3+ кун, pending/viewed, ҳали эслатилмаган)
    q_remind = (
        select(Contract)
        .where(and_(
            Contract.status.in_(["pending", "viewed"]),
            Contract.created_at < remind_cutoff,
            Contract.created_at >= expire_cutoff,
        ))
    )
    result = await db.execute(q_remind)
    remind_contracts = result.scalars().all()
    reminded_count = 0
    for c in remind_contracts:
        # Эслатма аллақачон юборилганми?
        q_ev = await db.execute(
            select(ContractEvent).where(and_(
                ContractEvent.contract_id == c.id,
                ContractEvent.event_type == "reminder_sent",
            ))
        )
        if q_ev.scalar_one_or_none():
            continue
        # WhatsApp эслатма
        if settings.enable_whatsapp_notifications:
            try:
                days_left = EXPIRE_DAYS - (now - c.created_at).days
                public_url = f"{_public_base_url()}/c/{c.short_code}"
                msg = (
                    f"Ассалому алейкум!\n\n"
                    f"Сизнинг договор рассрочки №{c.rtu_number} "
                    f"ҳали имзоланмаган.\n\n"
                    f"Имзолаш учун: {public_url}\n\n"
                    f"Ссылка яна {days_left} кун ишлайди.\n\n"
                    f"— Смарт Центр"
                )
                await asyncio.to_thread(gapi.send_text, c.client_phone, msg)
                await _log_event(db, c.id, "reminder_sent", {"days_left": days_left})
                reminded_count += 1
            except Exception as e:
                logger.warning(f"Reminder WA failed {c.client_phone}: {e}")
    if reminded_count:
        await db.commit()
        logger.info(f"Cron: reminded {reminded_count} contracts")
