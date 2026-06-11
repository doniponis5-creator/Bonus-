# HANDOFF — Сессия 11.06.2026

> Контекст для следующей сессии (AI или разработчик). Проект: SBonus+ (см. CLAUDE.md).
> Цель сессии: рост среднего чека, retention, PRO-уровень UI клиентского кабинета.

---

## ✅ Состояние на конец сессии

| Что | Статус |
|-----|--------|
| Коммит `3a2fc91` — avg-check growth pack | ✅ запушен, задеплоен |
| Коммит `fc5503b` — client PRO UI + post-purchase followup | ✅ закоммичен; деплой запускался — **проверить визуально** |
| Миграции БД | ❌ не требуются (модели не менялись) |
| Working tree | чистый |

---

## 📦 Коммит 1: `3a2fc91` — Avg-check growth pack

### 1. Threshold Bonus (порог-бонусы за размер чека)
- **Setting:** `BASKET_BONUS_TIERS` — JSON `[{"min":1000,"bonus":30},{"min":2000,"bonus":80},{"min":3000,"bonus":150}]`. Пустой/`[]` = выключено.
- **Логика:** `app/services/bonus.py` → `get_basket_bonus_tiers()`, `calc_basket_bonus()`; применяется в `BonusService.earn()` (значит и POS, и 1С webhook). Доп. бонус добавляется к сумме транзакции, в note пишется «Порог-бонус +X».
- **Admin UI:** Настройки → карточка «Повышение среднего чека» (вкл/выкл, редактор порогов).
- **POS:** `GET /api/v1/cashier/products/basket-tiers` — экран Earn показывает nudge «Ещё +X сом → доп. бонус +Y» и зелёный бейдж при достижении порога.

### 2. POS Upsell (рекомендации кассиру)
- **Endpoint:** `GET /api/v1/cashier/products/upsell/{customer_id}` (файл `app/api/v1/cashier_products.py`) — co-occurrence по чекам клиента (PurchaseItem self-join), fallback: топ-продажи в наличии.
- **POS:** карточка «Предложите клиенту» (3 товара) на экране Earn (`app/(main)/earn.tsx`, `api/client.ts` → `upsellAPI`).

### 3. Auto-Coupon Engine (персональные купоны на повышение чека)
- **Файл:** `app/services/auto_coupon.py` → `run_auto_coupon()`.
- **Cron:** четверг 11:00 (`id="auto_coupon"` в main.py).
- **Логика:** клиенты с ≥3 покупками за 90 дн → купон `min_purchase = avg_check × 1.3` (кратно 50), `bonus = 7% от порога` (кратно 10), код `AUTO-XXXXXXXX`, WA с magic-link. Защиты: cooldown 30 дн (по Notification event_type=`auto_coupon`), пропуск клиентов с активным AUTO-купоном, max 50/запуск.
- **Settings:** `AUTO_COUPON_ENABLED` (default **false** — надо включить!), `AUTO_COUPON_MULTIPLIER`, `AUTO_COUPON_BONUS_PERCENT`, `AUTO_COUPON_VALIDITY_DAYS`, `AUTO_COUPON_MAX_PER_RUN`, `AUTO_COUPON_COOLDOWN_DAYS`, `AUTO_COUPON_MIN_PURCHASES`, `AUTO_COUPON_MESSAGE_TEMPLATE`.
- **Ручной запуск:** `POST /api/v1/admin/coupons/auto-coupon/run` (SUPER_ADMIN).
- **⚠️ Изменение поведения:** активация купона (`POST /customer/coupons/{code}/activate`) теперь **требует покупку ≥ min_purchase, совершённую ПОСЛЕ выдачи купона** (раньше min_purchase игнорировался — это был баг). Касается ВСЕХ купонов с min_purchase > 0.

### 4. RFM Segment Campaigns
- **Endpoint:** `POST /api/v1/smart-campaigns/launch` `{segment_id, bonus_amount, name?, message_template?, days?}` — создаёт BonusCampaign (target_type=INDIVIDUAL, получатели зафиксированы из RFM на момент создания, статус PENDING).
- **Admin UI:** Smart Campaign Builder → зелёная кнопка «Запустить кампанию (N клиентов)» → redirect на /campaigns, оттуда «Отправить».
- campaign_runner НЕ менялся.

### 5. Fix
- `SettingsUpdateRequest` (schemas): добавлены `CAMPAIGN_BATCH_SIZE`, `CAMPAIGN_BATCH_PAUSE`, `BONUS_EXPIRATION_DAYS`, `BONUS_EXPIRATION_WARNING_DAYS` — раньше эти поля настроек молча НЕ сохранялись (Pydantic отбрасывал).

---

## 📦 Коммит 2: `fc5503b` — Post-Purchase Follow-up + Client PRO UI

### Post-Purchase Follow-up («всё ли нравится?», RU+KG)
- **Файл:** `app/services/smart_notifications.py` → `run_post_purchase_followup()` + `POST_PURCHASE_DEFAULT_TEMPLATE` (двуязычный RU+KG, вежливый).
- **Cron:** ежедневно 11:10 (`id="post_purchase_followup"`).
- **Логика:** вчерашние EARN (Бишкек TZ) ≥ min_amount, БЕЗ возврата (проверка `REFUND-{receipt}`), 1 сообщение/клиент/7 дн, max per run, пауза WA_MESSAGE_INTERVAL между отправками. Плейсхолдеры: `{name}`, `{amount}`, `{link}`.
- **Settings:** `POST_PURCHASE_FOLLOWUP_ENABLED` (default **false** — включить!), `POST_PURCHASE_MIN_AMOUNT` (3000), `POST_PURCHASE_MAX_PER_RUN` (50), `POST_PURCHASE_FOLLOWUP_TEMPLATE`.
- **Admin UI:** Настройки → блок «Забота после покупки».
- **Ручной запуск:** `POST /api/v1/admin/notifications/post-purchase/run`.

### Client Cabinet PRO UI (sbonus-client)
- **Backend:** `/customer/me` + `expiring_amount`/`expiring_date` (FIFO-расчёт из `app/tasks/expiration.py::_calculate_expirable`, обёрнут в try/except — не ломает /me). Новый `GET /api/v1/customer/tiers`.
- **Фиксы:** tier badge цвет (был класс-mismatch `tier-bronze` vs `.tier-Bronze` — теперь инлайн-цвета per tier); История доступна («Все →» из «Последние операции»); logout перенесён из header в Профиль.
- **Новое:** карточка 🔥 «X сом сгорит DD.MM» на главной; tier benefits bottom-sheet (тап по бейджу уровня); transaction detail bottom-sheet (тап по операции на главной и в Истории); красная точка на табе «Бонусы» при неиспользованных купонах.
- **Анимации:** count-up баланса (respects prefers-reduced-motion), staggered fade-up карточек (60–220ms), skeleton-экран загрузки вместо спиннера.
- **Файлы:** `app/page.tsx`, `components/BalanceCard.tsx`, `components/TransactionList.tsx`, `lib/api.ts`.

---

## ⏳ НЕ сделано / следующие шаги

1. **Tab bar redesign** — пользователь отклонил 8 вариантов («детский»/«простой»). ЖДЁМ: пользователь пришлёт скриншот-референс понравившегося дизайна → повторить его стиль. Пока tabbar старый (6 табов: Главная/Цели/Удача/Рейтинг/Бонусы/Профиль).
2. **Включить фичи в проде** (admin → Настройки): `BASKET_BONUS_TIERS` (вкл + пороги), `AUTO_COUPON_ENABLED=true` (сначала с MAX_PER_RUN=10 для теста), `POST_PURCHASE_FOLLOWUP_ENABLED=true`. Тест на своём номере через ручные эндпоинты.
3. **RU/KG i18n клиентского кабинета** — обсуждено, пользователь заинтересован, не реализовано. Самый большой кусок.
4. **Admin палитра** — smart-campaigns страница в slate/indigo, остальное navy/yellow. Унифицировать (низкий приоритет).
5. Проверить визуально client PRO UI после деплоя (hard refresh / закрыть PWA — service worker кеширует).

## ⚠️ Грабли этой сессии
- **git lock на Mac:** `.git/index.lock` и `HEAD.lock` зависают; sandbox не может их удалить (Operation not permitted). Лечение: `find .git -name "*.lock" -delete` в терминале пользователя.
- Деплой при «Already up to date» = изменения не запушены, билд пересоберёт старое.
- Файловые тулзы Cowork не достают до папки (trailing space в пути «Проекты ») — все правки через bash `/sessions/.../mnt/Bonus+/`.

## 💬 Предпочтения пользователя (для следующего AI)
- Узбекский язык общения, прямо, код-first, без воды.
- Дизайн: НЕ «детский» (без пульсаций, FAB-цирка), но и не скучный минимализм. Хочет «PRO как у топ-брендов». Перед реализацией UI — показывать визуальные варианты (interactive mockup), ждать одобрения.
- Боится сломать прод: менять минимально, проверять синтаксис (`python3 -c "import ast; ..."`, `npx tsc --noEmit`), деплой только нужных контейнеров.
