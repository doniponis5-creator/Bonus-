"""
Sbonus+ — QR Code Scan Analytics.
QR kod skanerlash statistikasi, UTM parametrlari bilan tracking.

Har bir QR skanerlash qayd qilinadi:
- Qaysi klient skanladi
- Qachon
- UTM source/medium/campaign
- Device info
"""

import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role, UserRole
from app.models import Setting, User, UserRoleEnum, Customer

router = APIRouter(prefix="/qr-analytics", tags=["qr-analytics"])


# ─── Schemas ───

class QRScanEvent(BaseModel):
    qr_code: str
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    device_type: Optional[str] = None  # mobile, desktop, tablet
    referrer: Optional[str] = None

class QRScanResponse(BaseModel):
    scan_id: str
    qr_code: str
    customer_id: Optional[str]
    customer_name: Optional[str]
    scanned_at: str
    utm_source: Optional[str]
    utm_medium: Optional[str]
    utm_campaign: Optional[str]
    device_type: Optional[str]
    ip_address: Optional[str]

class QRAnalyticsOverview(BaseModel):
    total_scans: int
    unique_qr_codes: int
    scans_today: int
    scans_this_week: int
    scans_this_month: int
    top_sources: list[dict]
    top_campaigns: list[dict]
    device_breakdown: dict
    hourly_distribution: list[dict]

class QRCodeStats(BaseModel):
    qr_code: str
    customer_id: Optional[str]
    customer_name: Optional[str]
    total_scans: int
    first_scan: Optional[str]
    last_scan: Optional[str]
    sources: list[dict]


# ─── Setting key for scan storage ───

SCANS_KEY_PREFIX = "QR_SCANS_"  # QR_SCANS_YYYY_MM — monthly partitioned
SCAN_COUNTER_KEY = "QR_SCAN_COUNTER"


def _month_key() -> str:
    now = datetime.now(timezone.utc)
    return f"{SCANS_KEY_PREFIX}{now.strftime('%Y_%m')}"




# ─── Endpoints ───

@router.post("/scan", response_model=QRScanResponse)
async def record_scan(
    data: QRScanEvent,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    QR kod skanerlashni qayd qilish (public endpoint).
    Frontend QR skaner sahifasidan chaqiriladi.
    """
    # Find customer by QR code
    result = await db.execute(select(Customer).where(Customer.qr_code == data.qr_code))
    customer = result.scalar_one_or_none()

    ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "unknown")
    if "," in ip:
        ip = ip.split(",")[0].strip()

    scan_id = uuid.uuid4().hex[:16]
    scan_record = {
        "scan_id": scan_id,
        "qr_code": data.qr_code,
        "customer_id": str(customer.id) if customer else None,
        "customer_name": customer.full_name if customer else None,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "utm_source": data.utm_source,
        "utm_medium": data.utm_medium,
        "utm_campaign": data.utm_campaign,
        "device_type": data.device_type,
        "referrer": data.referrer,
        "ip_address": ip,
    }

    # Store in monthly partition
    month_key = _month_key()
    row = await db.execute(select(Setting).where(Setting.key == month_key))
    setting = row.scalar_one_or_none()

    if setting and setting.value:
        scans = json.loads(setting.value)
    else:
        scans = []

    scans.append(scan_record)

    if setting:
        setting.value = json.dumps(scans)
    else:
        db.add(Setting(key=month_key, value=json.dumps(scans)))

    # Update counter
    counter_row = await db.execute(select(Setting).where(Setting.key == SCAN_COUNTER_KEY))
    counter = counter_row.scalar_one_or_none()
    if counter:
        counter.value = str(int(counter.value or "0") + 1)
    else:
        db.add(Setting(key=SCAN_COUNTER_KEY, value="1"))

    await db.commit()

    return QRScanResponse(**scan_record)


@router.get("/overview", response_model=QRAnalyticsOverview, dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def get_overview(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """QR skanerlash umumiy statistikasi."""

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=7)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Collect all scans from relevant months
    all_scans = []
    result = await db.execute(
        select(Setting).where(Setting.key.like(f"{SCANS_KEY_PREFIX}%"))
    )
    for row in result.scalars().all():
        try:
            scans = json.loads(row.value)
            all_scans.extend(scans)
        except Exception:
            continue

    # Filter by date range
    filtered = []
    for s in all_scans:
        try:
            scan_dt = datetime.fromisoformat(s["scanned_at"])
            if scan_dt >= since:
                filtered.append({**s, "_dt": scan_dt})
        except Exception:
            continue

    total_scans = len(filtered)
    unique_qrs = len(set(s["qr_code"] for s in filtered))

    scans_today = sum(1 for s in filtered if s["_dt"] >= today_start)
    scans_week = sum(1 for s in filtered if s["_dt"] >= week_start)
    scans_month = sum(1 for s in filtered if s["_dt"] >= month_start)

    # Top sources
    source_counts = {}
    for s in filtered:
        src = s.get("utm_source") or "direct"
        source_counts[src] = source_counts.get(src, 0) + 1
    top_sources = sorted(
        [{"source": k, "count": v} for k, v in source_counts.items()],
        key=lambda x: x["count"], reverse=True
    )[:10]

    # Top campaigns
    campaign_counts = {}
    for s in filtered:
        camp = s.get("utm_campaign")
        if camp:
            campaign_counts[camp] = campaign_counts.get(camp, 0) + 1
    top_campaigns = sorted(
        [{"campaign": k, "count": v} for k, v in campaign_counts.items()],
        key=lambda x: x["count"], reverse=True
    )[:10]

    # Device breakdown
    device_counts = {"mobile": 0, "desktop": 0, "tablet": 0, "unknown": 0}
    for s in filtered:
        dt = s.get("device_type") or "unknown"
        device_counts[dt] = device_counts.get(dt, 0) + 1

    # Hourly distribution
    hourly = [0] * 24
    for s in filtered:
        hourly[s["_dt"].hour] += 1
    hourly_dist = [{"hour": h, "count": c} for h, c in enumerate(hourly)]

    return QRAnalyticsOverview(
        total_scans=total_scans,
        unique_qr_codes=unique_qrs,
        scans_today=scans_today,
        scans_this_week=scans_week,
        scans_this_month=scans_month,
        top_sources=top_sources,
        top_campaigns=top_campaigns,
        device_breakdown=device_counts,
        hourly_distribution=hourly_dist,
    )


@router.get("/by-qr/{qr_code}", response_model=QRCodeStats, dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def get_qr_stats(
    qr_code: str,
    db: AsyncSession = Depends(get_db),
):
    """Bitta QR kod bo'yicha statistika."""

    # Find customer
    result = await db.execute(select(Customer).where(Customer.qr_code == qr_code))
    customer = result.scalar_one_or_none()

    # Collect scans for this QR
    all_scans = []
    result = await db.execute(
        select(Setting).where(Setting.key.like(f"{SCANS_KEY_PREFIX}%"))
    )
    for row in result.scalars().all():
        try:
            scans = json.loads(row.value)
            for s in scans:
                if s.get("qr_code") == qr_code:
                    all_scans.append(s)
        except Exception:
            continue

    if not all_scans:
        return QRCodeStats(
            qr_code=qr_code,
            customer_id=str(customer.id) if customer else None,
            customer_name=customer.full_name if customer else None,
            total_scans=0,
            first_scan=None, last_scan=None, sources=[],
        )

    all_scans.sort(key=lambda x: x.get("scanned_at", ""))

    source_counts = {}
    for s in all_scans:
        src = s.get("utm_source") or "direct"
        source_counts[src] = source_counts.get(src, 0) + 1
    sources = [{"source": k, "count": v} for k, v in source_counts.items()]

    return QRCodeStats(
        qr_code=qr_code,
        customer_id=str(customer.id) if customer else None,
        customer_name=customer.full_name if customer else None,
        total_scans=len(all_scans),
        first_scan=all_scans[0].get("scanned_at"),
        last_scan=all_scans[-1].get("scanned_at"),
        sources=sources,
    )


@router.get("/scans", response_model=list[QRScanResponse], dependencies=[Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN))])
async def list_recent_scans(
    limit: int = Query(50, ge=1, le=200),
    qr_code: Optional[str] = None,
    utm_source: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Oxirgi skanerlashlar ro'yxati."""

    all_scans = []
    result = await db.execute(
        select(Setting).where(Setting.key.like(f"{SCANS_KEY_PREFIX}%"))
    )
    for row in result.scalars().all():
        try:
            scans = json.loads(row.value)
            all_scans.extend(scans)
        except Exception:
            continue

    # Filter
    if qr_code:
        all_scans = [s for s in all_scans if s.get("qr_code") == qr_code]
    if utm_source:
        all_scans = [s for s in all_scans if s.get("utm_source") == utm_source]

    # Sort by date desc
    all_scans.sort(key=lambda x: x.get("scanned_at", ""), reverse=True)

    return [QRScanResponse(**s) for s in all_scans[:limit]]
