"""
Sbonus+ — API Versioning Middleware.

V1 endpointlarga deprecation header qo'shadi.
Klient ilovalar bu headerlarni tekshirib, v2 ga o'tishi kerakligini biladi.

Headerlar:
  - X-API-Version: joriy versiya
  - X-API-Deprecated: "true" agar endpoint deprecated bo'lsa
  - X-API-Sunset: deprecated endpoint o'chirilish sanasi
  - X-API-Migration: v2 ga o'tish uchun URL
"""

import logging
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request

logger = logging.getLogger("sbonus.versioning")

# Deprecated endpointlar ro'yxati (kelajakda to'ldiriladi)
# Format: {"/api/v1/old-endpoint": {"sunset": "2026-12-01", "migration": "/api/v2/new-endpoint"}}
DEPRECATED_ENDPOINTS: dict[str, dict] = {}


class APIVersionMiddleware(BaseHTTPMiddleware):
    """
    API versiya headerlarini qo'shadi.
    - /api/v1/* endpointlarga X-API-Version: 1.0.0
    - /api/v2/* endpointlarga X-API-Version: 2.0.0
    - Deprecated endpointlarga ogohlantirish headerlari
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path

        if path.startswith("/api/v1"):
            response.headers["X-API-Version"] = "1.0.0"

            # Deprecated endpoint tekshirish
            dep_info = DEPRECATED_ENDPOINTS.get(path)
            if dep_info:
                response.headers["X-API-Deprecated"] = "true"
                response.headers["X-API-Sunset"] = dep_info.get("sunset", "")
                response.headers["X-API-Migration"] = dep_info.get("migration", "")
                logger.info("Deprecated endpoint called: %s", path)

        elif path.startswith("/api/v2"):
            response.headers["X-API-Version"] = "2.0.0"

        return response
