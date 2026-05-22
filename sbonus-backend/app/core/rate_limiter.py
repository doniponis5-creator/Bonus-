"""
Sbonus+ — Rate Limiting Middleware + Decorator.

Sliding window counter orqali Redis-based rate limiting.
Global middleware — barcha endpointlarga umumiy limit.
Per-endpoint decorator — maxsus limitlar (login, bonus, referral).

Arxitektura:
  - GlobalRateLimitMiddleware: har bir IP uchun umumiy limit (200/min default)
  - rate_limit() decorator: endpoint-level aniq limitlar
  - check_rate_limit() — mavjud funksiya (redis.py) dan foydalanadi
"""

import functools
import logging
from typing import Callable, Optional

from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.redis import redis_client

logger = logging.getLogger("sbonus.rate_limiter")


# ═══════════════════════════════════════════
# SLIDING WINDOW RATE LIMITER (Redis)
# ═══════════════════════════════════════════

async def sliding_window_check(
    key: str,
    max_requests: int,
    window_seconds: int,
) -> tuple[bool, int, int]:
    """
    Sliding window rate limit check.

    Returns:
        (allowed, remaining, retry_after_seconds)
    """
    full_key = f"rl:{key}"
    current = await redis_client.incr(full_key)
    if current == 1:
        await redis_client.expire(full_key, window_seconds)

    remaining = max(0, max_requests - current)
    ttl = await redis_client.ttl(full_key)
    retry_after = max(0, ttl) if current > max_requests else 0

    return current <= max_requests, remaining, retry_after


# ═══════════════════════════════════════════
# GLOBAL RATE LIMIT MIDDLEWARE
# ═══════════════════════════════════════════

class GlobalRateLimitMiddleware(BaseHTTPMiddleware):
    """
    Barcha endpointlarga umumiy IP-based rate limit.
    Default: 200 request / minute per IP.
    Health check va docs chiqarib tashlanadi.
    """

    SKIP_PATHS = {"/", "/health", "/docs", "/redoc", "/openapi.json"}

    def __init__(self, app, max_requests: int = 200, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Skip health checks and docs
        if path in self.SKIP_PATHS:
            return await call_next(request)

        client_ip = self._get_client_ip(request)
        key = f"global:{client_ip}"

        allowed, remaining, retry_after = await sliding_window_check(
            key, self.max_requests, self.window_seconds
        )

        if not allowed:
            logger.warning(
                "Global rate limit exceeded: IP=%s, path=%s",
                client_ip, path,
            )
            return JSONResponse(
                status_code=429,
                content={
                    "detail": {
                        "code": "GLOBAL_RATE_LIMIT",
                        "message": "Слишком много запросов. Подождите.",
                    }
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(self.max_requests),
                    "X-RateLimit-Remaining": "0",
                },
            )

        response = await call_next(request)

        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(self.max_requests)
        response.headers["X-RateLimit-Remaining"] = str(remaining)

        return response

    @staticmethod
    def _get_client_ip(request: Request) -> str:
        """Haqiqiy IP olish (proxy ortida bo'lsa X-Forwarded-For)."""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"


# ═══════════════════════════════════════════
# PER-ENDPOINT RATE LIMIT DEPENDENCY
# ═══════════════════════════════════════════

class RateLimitDep:
    """
    FastAPI Dependency — endpoint-level rate limit.

    Usage:
        @router.post("/bonus/earn", dependencies=[Depends(RateLimitDep(30, 60, "bonus_earn"))])
        async def earn_bonus(...):
    """

    def __init__(
        self,
        max_requests: int,
        window_seconds: int,
        scope: str,
        key_func: Optional[Callable] = None,
    ):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.scope = scope
        self.key_func = key_func

    async def __call__(self, request: Request):
        if self.key_func:
            rate_key = self.key_func(request)
        else:
            client_ip = GlobalRateLimitMiddleware._get_client_ip(request)
            rate_key = f"{self.scope}:{client_ip}"

        allowed, remaining, retry_after = await sliding_window_check(
            rate_key, self.max_requests, self.window_seconds
        )

        if not allowed:
            logger.warning(
                "Rate limit [%s]: IP=%s, path=%s",
                self.scope,
                GlobalRateLimitMiddleware._get_client_ip(request),
                request.url.path,
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "RATE_LIMIT",
                    "message": f"Слишком много запросов. Подождите {retry_after} сек.",
                },
            )


# ═══════════════════════════════════════════
# PREDEFINED RATE LIMIT CONFIGS
# ═══════════════════════════════════════════

# Tez-tez ishlatiladigan limitlar (Depends() bilan ishlatish uchun)
RATE_LIMITS = {
    "login":           RateLimitDep(5,  900,  "login"),           # 5 / 15 min
    "bonus_earn":      RateLimitDep(30, 60,   "bonus_earn"),      # 30 / min
    "bonus_spend":     RateLimitDep(20, 60,   "bonus_spend"),     # 20 / min
    "referral_apply":  RateLimitDep(5,  300,  "referral_apply"),  # 5 / 5 min
    "promo_apply":     RateLimitDep(10, 300,  "promo_apply"),     # 10 / 5 min
    "wheel_spin":      RateLimitDep(3,  60,   "wheel_spin"),      # 3 / min
    "self_register":   RateLimitDep(3,  3600, "self_register"),   # 3 / hour
    "magic_link":      RateLimitDep(3,  300,  "magic_link"),      # 3 / 5 min
    "customer_api":    RateLimitDep(60, 60,   "customer_api"),    # 60 / min
    "admin_api":       RateLimitDep(120, 60,  "admin_api"),       # 120 / min
}
