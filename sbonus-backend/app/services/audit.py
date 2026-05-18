"""
Sbonus+ — Audit logging service.
"""

import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import AuditLog


async def log_audit(
    db: AsyncSession,
    action: str,
    entity_type: str,
    entity_id: Optional[uuid.UUID] = None,
    user_id: Optional[uuid.UUID] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
) -> None:
    """Record an audit log entry."""
    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
        ip_address=ip_address,
    )
    db.add(entry)
