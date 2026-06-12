# HANDOFF — Сессия 12.06.2026 (ночная, "PRO MAX")

> Контекст для следующей сессии. Проект: SBonus+ (см. CLAUDE.md).

## ✅ Сделано и закоммичено
| Commit | Что |
|--------|-----|
| af61da3 | Client cabinet v2 — полный редизайн (4 таба, токены, QR в hero) |
| c448ca4 | Admin v2 (42 файла) + /biz-report + client debts polish |
| 42905f6 | Backend hardening: K1-K4 (expenses защита, greenapi токен, spend идемпотентность, refund cap, campaign per-batch commit + recovery, expiry dedup, auto-coupon cap) |
| 1e97b94 | /profit-lab (скидка-симулятор, комбо, ROI лояльности, автопилот) |
| f1a2b1b | Дашборд PRO (live «Сегодня сейчас», быстрые действия, count-up) + полный sidebar |
| (user)  | profit-lab polish (2 колонки, невалидная себестоимость, спокойные вердикты) |
| b709418 | debt_reminders cron 10:40 + закупка недели + stock-out счётчик + колесо EV + settings карточка |

## ⏳ STAGED, НЕ ЗАКОММИЧЕНО (HEAD.lock!)
- `customer.py` — GET /customer/recommendations (co-occurrence + fallback)
- client `page.tsx` + `lib/api.ts` — карточка «Подобрано для вас» (вкладка Бонусы)
→ tsc/ast чистые. Пользователь: `find .git -name "*.lock" -delete && git commit -m "feat: Подобрано для вас" && git push`

## 🚀 Деплой (после push): api + admin + client
ssh root@145.223.100.16 "cd /opt/sbonus && git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build api admin client"
⚠️ На сервере был локальный edit webhook.py → если pull откажет: git stash && git pull

## 🔧 Включить в проде (admin → Настройки)
- DEBT_REMINDER_ENABLED=true (новое! напоминания рассрочки 10:40)
- BASKET_BONUS_TIERS, AUTO_COUPON_ENABLED (+MAX_BONUS=1000 default), POST_PURCHASE_FOLLOWUP_ENABLED
- GREENAPI_WEBHOOK_TOKEN (новое: защита входящего webhook; тот же токен в консоли GreenAPI)
- 1С: заполнить себестоимость товаров (profit-lab показывает какие невалидны)

## 📋 Очередь идей (одобрены, не сделаны)
4. Flash-sale generator (dead-stock → кампания в 1 клик)
5. Подарочные сертификаты (новая модель)
6. POS карта клиента (VIP/risk бейджи кассиру)
8. (сделано в biz-report) ✅

## ⚠️ Грабли
- .git/*.lock — sandbox не удаляет; лечится в терминале пользователя
- bash в Cowork: фоновые процессы умирают после каждого вызова; tsc гонять синхронно timeout 40
- node_modules кэш: /tmp/buildcheck/{client,admin} готовы для tsc
- Аудит: AUDIT_2026-06-11.md (M-уровни ещё актуальны: M1 send-статусы, M5 GET kill-switch, M8 токены plaintext)
