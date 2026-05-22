"""
Sbonus+ — API v2 Router.

V2 arxitekturasi:
  - V1 bilan parallel ishlaydi (backward compatible)
  - Yangi endpointlar v2 da qo'shiladi
  - V1 deprecated headerlar qaytaradi
  - V2 yangilangan response formatlar ishlatadi

Hozircha v2 v1 ga proxy qiladi — yangi endpointlar 
qo'shilganda v2-specific logika yoziladi.
"""

from fastapi import APIRouter

# V2 yangi endpointlarni shu yerga import qilamiz
# Hozircha bo'sh — v2 endpointlar qo'shilganda to'ldiriladi
from app.api.v2.health import router as health_router

api_v2_router = APIRouter(prefix="/api/v2")

# V2 health check — versiya tekshirish uchun
api_v2_router.include_router(health_router)

# Kelajakda qo'shiladigan v2 endpointlar:
# api_v2_router.include_router(auth_v2_router)
# api_v2_router.include_router(bonus_v2_router)
# api_v2_router.include_router(customers_v2_router)
