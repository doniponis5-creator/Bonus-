"""
Sbonus+ — Агрегатор всех API v1 маршрутов.
"""

from fastapi import APIRouter

from app.api.v1.admin import router as admin_router
from app.api.v1.auth import router as auth_router
from app.api.v1.bonus import router as bonus_router
from app.api.v1.customers import router as customers_router
from app.api.v1.webhook import router as webhook_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth_router)
api_router.include_router(customers_router)
api_router.include_router(bonus_router)
api_router.include_router(webhook_router)
api_router.include_router(admin_router)
