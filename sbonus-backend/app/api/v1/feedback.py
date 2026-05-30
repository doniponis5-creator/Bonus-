"""
Sbonus+ — NPS & Feedback System.
Опросы NPS, отзывы, сентимент-анализ.
"""

import uuid
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func, case, and_, literal_column, desc, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_role, UserRole
from app.models import (
    Customer, BonusAccount, Transaction, TransactionType,
    Setting, Notification,
)

router = APIRouter(prefix="/feedback", tags=["Feedback & NPS"])


# ═══════════════════════════════════════════
# NPS Settings key
# ═══════════════════════════════════════════
# NPS_FEEDBACK_DATA — JSON stored in settings table:
# [{"customer_id": "...", "score": 9, "comment": "...", "created_at": "..."}]
# We store feedback in settings as JSON since we don't want to add migration.

FEEDBACK_KEY = "NPS_FEEDBACK_DATA"
NPS_SETTINGS_KEY = "NPS_CONFIG"


async def _get_feedbacks(db: AsyncSession) -> list:
    """Получить все отзывы из настроек."""
    import json
    result = await db.execute(select(Setting.value).where(Setting.key == FEEDBACK_KEY))
    raw = result.scalar_one_or_none()
    if not raw:
        return []
    try:
        return json.loads(raw)
    except Exception:
        return []


async def _save_feedbacks(feedbacks: list, db: AsyncSession):
    """Сохранить отзывы в настройки."""
    import json
    existing = await db.execute(select(Setting).where(Setting.key == FEEDBACK_KEY))
    setting = existing.scalar_one_or_none()
    data = json.dumps(feedbacks, ensure_ascii=False, default=str)
    if setting:
        setting.value = data
    else:
        db.add(Setting(key=FEEDBACK_KEY, value=data))
    await db.flush()


# ═══════════════════════════════════════════
# SENTIMENT ANALYSIS (rule-based)
# ═══════════════════════════════════════════

POSITIVE_WORDS = {
    "отлично", "класс", "супер", "хорошо", "прекрасно", "замечательно",
    "лучший", "нравится", "рекомендую", "доволен", "довольна", "спасибо",
    "быстро", "удобно", "качественно", "чисто", "вежливо", "приятно",
    "зўр", "яхши", "жуда", "рахмат", "ажойиб", "баракалла",
    "cool", "great", "awesome", "perfect", "excellent", "love", "best",
    "amazing", "wonderful", "fantastic", "good", "nice", "thank",
}

NEGATIVE_WORDS = {
    "плохо", "ужас", "отвратительно", "грубо", "долго", "дорого",
    "хам", "грязно", "обман", "не рекомендую", "разочарован", "жалоба",
    "ёмон", "қимат", "секин", "ноласан",
    "bad", "terrible", "awful", "worst", "hate", "slow", "rude",
    "expensive", "dirty", "scam", "disappointed", "complaint",
}


def analyze_sentiment(text: str) -> dict:
    """Простой сентимент-анализ на основе ключевых слов."""
    if not text:
        return {"sentiment": "neutral", "score": 0.5, "positive_words": [], "negative_words": []}

    words = set(re.findall(r'\w+', text.lower()))
    pos = words & POSITIVE_WORDS
    neg = words & NEGATIVE_WORDS

    total = len(pos) + len(neg)
    if total == 0:
        return {"sentiment": "neutral", "score": 0.5, "positive_words": [], "negative_words": []}

    score = len(pos) / total
    if score >= 0.6:
        sentiment = "positive"
    elif score <= 0.4:
        sentiment = "negative"
    else:
        sentiment = "neutral"

    return {
        "sentiment": sentiment,
        "score": round(score, 2),
        "positive_words": list(pos),
        "negative_words": list(neg),
    }


# ═══════════════════════════════════════════
# CLIENT ENDPOINTS — Submit feedback
# ═══════════════════════════════════════════

class FeedbackSubmit(BaseModel):
    customer_id: str
    score: int  # 0-10 NPS
    comment: str = ""
    source: str = "cabinet"  # cabinet | whatsapp | qr


@router.post("/submit")
async def submit_feedback(
    data: FeedbackSubmit,
    db: AsyncSession = Depends(get_db),
):
    """Отправить отзыв / NPS оценку."""
    if data.score < 0 or data.score > 10:
        raise HTTPException(status_code=400, detail="Оценка должна быть от 0 до 10")

    # Verify customer exists
    cust = await db.execute(
        select(Customer.id, Customer.full_name, Customer.phone).where(
            Customer.id == uuid.UUID(data.customer_id)
        )
    )
    customer = cust.one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="Клиент не найден")

    sentiment = analyze_sentiment(data.comment)

    # NPS category
    if data.score >= 9:
        nps_category = "promoter"
    elif data.score >= 7:
        nps_category = "passive"
    else:
        nps_category = "detractor"

    feedback = {
        "id": str(uuid.uuid4()),
        "customer_id": data.customer_id,
        "customer_name": customer.full_name,
        "customer_phone": customer.phone,
        "score": data.score,
        "comment": data.comment,
        "source": data.source,
        "nps_category": nps_category,
        "sentiment": sentiment,
        "created_at": datetime.now(timezone(timedelta(hours=6))).isoformat(),
    }

    feedbacks = await _get_feedbacks(db)
    feedbacks.append(feedback)
    await _save_feedbacks(feedbacks, db)

    return {"success": True, "message": "Спасибо за отзыв!", "nps_category": nps_category}


# ═══════════════════════════════════════════
# ADMIN ENDPOINTS — Analytics
# ═══════════════════════════════════════════

@router.get("/admin/dashboard")
async def feedback_dashboard(
    days: int = Query(90, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.BRANCH_ADMIN)),
):
    """Дашборд NPS и обратной связи."""
    feedbacks = await _get_feedbacks(db)

    tz = timezone(timedelta(hours=6))
    cutoff = datetime.now(tz) - timedelta(days=days)

    # Filter by period
    period_fb = []
    for fb in feedbacks:
        try:
            created = datetime.fromisoformat(fb["created_at"])
            if created >= cutoff:
                period_fb.append(fb)
        except Exception:
            period_fb.append(fb)

    total = len(period_fb)
    if total == 0:
        return {
            "nps_score": 0,
            "total_responses": 0,
            "promoters": 0,
            "passives": 0,
            "detractors": 0,
            "promoter_pct": 0,
            "passive_pct": 0,
            "detractor_pct": 0,
            "avg_score": 0,
            "sentiment_breakdown": {"positive": 0, "neutral": 0, "negative": 0},
            "recent_feedbacks": [],
            "score_distribution": {str(i): 0 for i in range(11)},
            "monthly_trend": [],
            "top_positive_words": [],
            "top_negative_words": [],
            "source_breakdown": {},
        }

    # NPS calculation
    promoters = sum(1 for f in period_fb if f.get("score", 0) >= 9)
    passives = sum(1 for f in period_fb if 7 <= f.get("score", 0) <= 8)
    detractors = sum(1 for f in period_fb if f.get("score", 0) <= 6)

    nps = round((promoters / total - detractors / total) * 100)

    # Sentiment
    sentiments = {"positive": 0, "neutral": 0, "negative": 0}
    pos_words_count = {}
    neg_words_count = {}
    for f in period_fb:
        s = f.get("sentiment", {})
        sentiments[s.get("sentiment", "neutral")] += 1
        for w in s.get("positive_words", []):
            pos_words_count[w] = pos_words_count.get(w, 0) + 1
        for w in s.get("negative_words", []):
            neg_words_count[w] = neg_words_count.get(w, 0) + 1

    # Score distribution
    score_dist = {str(i): 0 for i in range(11)}
    for f in period_fb:
        score_dist[str(f.get("score", 0))] += 1

    # Source breakdown
    sources = {}
    for f in period_fb:
        src = f.get("source", "unknown")
        sources[src] = sources.get(src, 0) + 1

    # Monthly trend
    monthly = {}
    for f in period_fb:
        try:
            month = f["created_at"][:7]
            if month not in monthly:
                monthly[month] = {"promoters": 0, "detractors": 0, "total": 0, "sum_score": 0}
            monthly[month]["total"] += 1
            monthly[month]["sum_score"] += f.get("score", 0)
            if f.get("score", 0) >= 9:
                monthly[month]["promoters"] += 1
            elif f.get("score", 0) <= 6:
                monthly[month]["detractors"] += 1
        except Exception:
            pass

    trend = []
    for month in sorted(monthly.keys()):
        m = monthly[month]
        t = m["total"]
        nps_m = round((m["promoters"] / t - m["detractors"] / t) * 100) if t else 0
        trend.append({
            "month": month,
            "nps": nps_m,
            "avg_score": round(m["sum_score"] / t, 1) if t else 0,
            "responses": t,
        })

    # Recent feedbacks (last 20)
    recent = sorted(period_fb, key=lambda x: x.get("created_at", ""), reverse=True)[:20]

    return {
        "nps_score": nps,
        "total_responses": total,
        "promoters": promoters,
        "passives": passives,
        "detractors": detractors,
        "promoter_pct": round(promoters / total * 100, 1),
        "passive_pct": round(passives / total * 100, 1),
        "detractor_pct": round(detractors / total * 100, 1),
        "avg_score": round(sum(f.get("score", 0) for f in period_fb) / total, 1),
        "sentiment_breakdown": sentiments,
        "recent_feedbacks": recent,
        "score_distribution": score_dist,
        "monthly_trend": trend,
        "top_positive_words": sorted(pos_words_count.items(), key=lambda x: x[1], reverse=True)[:10],
        "top_negative_words": sorted(neg_words_count.items(), key=lambda x: x[1], reverse=True)[:10],
        "source_breakdown": sources,
    }


@router.delete("/admin/{feedback_id}")
async def delete_feedback(
    feedback_id: str,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(UserRole.SUPER_ADMIN)),
):
    """Удалить отзыв."""
    feedbacks = await _get_feedbacks(db)
    feedbacks = [f for f in feedbacks if f.get("id") != feedback_id]
    await _save_feedbacks(feedbacks, db)
    return {"success": True}
