"""
Sbonus+ — API v2 Health & Version Info.

V2 API versiya ma'lumotlari va deprecation boshqaruvi.
"""

from datetime import datetime, timezone
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["V2: Versiya"])


class APIVersionResponse(BaseModel):
    """API versiya ma'lumotlari."""
    api_version: str
    status: str
    supported_versions: list[str]
    deprecated_versions: list[str]
    changelog_url: str
    server_time: str


@router.get("/version")
async def get_api_version() -> APIVersionResponse:
    """
    API versiya ma'lumotlarini olish.
    Klient ilovalar bu endpointdan versiya tekshiradi.
    """
    return APIVersionResponse(
        api_version="2.0.0",
        status="stable",
        supported_versions=["v1", "v2"],
        deprecated_versions=[],
        changelog_url="https://api.smartcentr.store/api/v2/changelog",
        server_time=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/changelog")
async def get_changelog() -> dict:
    """API o'zgarishlar tarixi."""
    return {
        "versions": [
            {
                "version": "2.0.0",
                "date": "2026-05-22",
                "changes": [
                    "Analytics Dashboard API qo'shildi",
                    "Push Notifications (Firebase FCM) qo'shildi",
                    "Global Rate Limiting middleware qo'shildi",
                    "Per-endpoint rate limitlar kuchaytrildi",
                    "API versioning tizimi ishga tushirildi",
                ],
            },
            {
                "version": "1.0.0",
                "date": "2025-01-01",
                "changes": [
                    "Dastlabki versiya",
                    "Bonus earn/spend",
                    "Wheel of Fortune",
                    "WhatsApp notifications",
                    "Referral system",
                    "Campaign system",
                ],
            },
        ]
    }
