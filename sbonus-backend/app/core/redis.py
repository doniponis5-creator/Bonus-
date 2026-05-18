"""
Sbonus+ — Redis подключение для кеша, OTP, rate limiting, token blacklist.
"""

import redis.asyncio as aioredis

from app.core.config import get_settings

settings = get_settings()

redis_client = aioredis.from_url(
    settings.redis_url,
    encoding="utf-8",
    decode_responses=True,
)


async def get_redis() -> aioredis.Redis:
    """Dependency — Redis клиент для FastAPI endpoints."""
    return redis_client


async def blacklist_token(jti: str, ttl_seconds: int) -> None:
    """Добавить JWT token ID в чёрный список."""
    await redis_client.setex(f"blacklist:{jti}", ttl_seconds, "1")


async def is_token_blacklisted(jti: str) -> bool:
    """Проверить, заблокирован ли токен."""
    return await redis_client.exists(f"blacklist:{jti}") > 0


async def check_rate_limit(key: str, max_attempts: int, window_seconds: int) -> bool:
    """
    Проверка rate limit. Возвращает True если лимит НЕ превышен.

    Использует атомарный INCR-first паттерн для устранения TOCTOU race condition.

    Args:
        key: уникальный ключ (например, ip:login:192.168.1.1)
        max_attempts: макс. количество попыток
        window_seconds: окно времени в секундах
    """
    full_key = f"rate:{key}"
    current = await redis_client.incr(full_key)
    if current == 1:
        await redis_client.expire(full_key, window_seconds)
    return current <= max_attempts
