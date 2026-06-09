# S Bonus — публикация в Google Play (TWA)

Полная инструкция, чтобы пройти ревью **с первого раза**. Приложение —
это TWA-обёртка (Trusted Web Activity) над готовым PWA `cabinet.smartcentr.store`.

- **Package name:** `store.smartcentr.bonus` (нельзя менять после публикации!)
- **Версия:** 1.0.0 (versionCode 1)
- **Privacy Policy URL:** https://cabinet.smartcentr.store/privacy
- **Account deletion URL:** https://cabinet.smartcentr.store/delete-account

---

## 0. Что уже готово в этом репозитории ✅

- `public/manifest.json` — PWA-манифест (id, иконки any+maskable, theme).
- `public/icon-512.png` — иконка приложения 512×512.
- `public/icon-maskable-512.png` — maskable-иконка с safe-zone (для адаптивных иконок Android).
- `public/.well-known/assetlinks.json` — Digital Asset Links (нужно вписать fingerprint, см. шаг 4).
- `twa-manifest.json` — конфиг Bubblewrap.
- `store-assets/feature-graphic.png` — графический баннер 1024×500.
- Страницы `/privacy` и `/delete-account` (публичные, без логина).
- Кнопка «Удалить аккаунт» в приложении (Профиль) + бэкенд `DELETE /api/v1/customer/account`.

> ⚠️ Перед сборкой задеплойте client, чтобы новые страницы и manifest были
> доступны на проде:
> ```bash
> ssh root@145.223.100.16 "cd /opt/sbonus && git pull && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build client api"
> ```
> (api — из-за нового эндпоинта удаления аккаунта.)

---

## 1. Аккаунт разработчика Google Play

1. Зарегистрируйтесь: https://play.google.com/console — разовый взнос **$25**.
2. Включите **Play App Signing** (по умолчанию включён) — Google сам хранит ключ подписи.

---

## 2. Установить инструменты (на Mac)

```bash
# JDK (нужен для сборки)
brew install --cask temurin@17

# Android command line tools (Bubblewrap скачает SDK сам при первом запуске)
brew install bubblewrap   # или: npm i -g @bubblewrap/cli
```

Проверка:
```bash
java -version       # должно показать 17.x
bubblewrap --version
```

---

## 3. Собрать AAB через Bubblewrap

В папке `sbonus-client`:

```bash
# Инициализация из готового конфига (или из manifest URL)
bubblewrap init --manifest=https://cabinet.smartcentr.store/manifest.json
# При вопросах подтверждайте значения из twa-manifest.json:
#   Package name: store.smartcentr.bonus
#   App name: S Bonus
#   Display mode: standalone, Orientation: portrait

# Сборка
bubblewrap build
```

На первом `build` Bubblewrap предложит **создать ключ подписи** (keystore).
Сохраните `android.keystore` и пароли в надёжном месте — они понадобятся для обновлений
(если не используете Play App Signing для всего).

Результат: `app-release-bundle.aab` (это загружаем в Play) и `app-release-signed.apk` (для теста).

---

## 4. Digital Asset Links (убрать адресную строку)

Чтобы TWA открывался **без браузерной адресной строки**, домен должен «подтвердить» приложение.

1. Получите SHA-256 fingerprint **ключа, которым Google подписывает приложение**:
   - Play Console → ваше приложение → **Test and release → Setup → App integrity → App signing**
   - скопируйте **SHA-256 certificate fingerprint** (формат `AB:CD:...`).
   - (Bubblewrap тоже печатает fingerprint вашего upload-ключа — для App Signing нужен именно
     fingerprint из Play Console раздела App signing.)
2. Впишите его в `public/.well-known/assetlinks.json` вместо
   `REPLACE_WITH_SHA256_FINGERPRINT_FROM_PLAY_CONSOLE`.
   > Если используете и upload-, и app-signing ключи — добавьте **оба** fingerprint в массив.
3. Задеплойте client заново (см. шаг 0).
4. Проверка: откройте
   `https://cabinet.smartcentr.store/.well-known/assetlinks.json` — должен отдаваться JSON.
   И валидатор: https://developers.google.com/digital-asset-links/tools/generator

---

## 5. Создать приложение в Play Console

**Create app:**
- App name: **S Bonus**
- Default language: Русский (ru-RU)
- App or game: **App**
- Free or paid: **Free**

### Store listing (Главная карточка)
- **Short description** (до 80 символов):
  `Бонусы и кешбэк магазина Смарт Центр: копите, тратьте, выигрывайте.`
- **Full description**:
  ```
  S Bonus — официальное приложение бонусной программы магазина «Смарт Центр».

  • Бонусы за каждую покупку
  • Списание бонусов при оплате
  • Колесо удачи и розыгрыши
  • Кешбэк по категориям
  • Реферальная программа — приглашай друзей
  • Контроль рассрочки и графика платежей
  • История всех операций и баланс под рукой

  Вход по номеру телефона. Все данные защищены.
  ```
- **App icon:** `public/icon-512.png` (512×512)
- **Feature graphic:** `store-assets/feature-graphic.png` (1024×500)
- **Phone screenshots:** минимум **2** (PNG/JPEG, от 320 до 3840 px по стороне).
  Сделайте скриншоты экранов: Главная (баланс), Колесо, Профиль, Бонусы.
  > Снять можно в Chrome DevTools (режим телефона) или на реальном устройстве после установки APK.

### Категория и контакты
- Category: **Shopping**
- Email: doniponis5@gmail.com
- Phone: +996 557 100 505
- **Privacy Policy:** https://cabinet.smartcentr.store/privacy

---

## 6. App content (обязательные декларации)

### Privacy policy
URL: `https://cabinet.smartcentr.store/privacy`

### Data safety (форма безопасности данных) — ответы
- **Does your app collect or share user data?** → **Yes**
- Собираемые данные:
  - **Personal info → Name** — Collected, не Shared. Назначение: *App functionality, Account management*.
  - **Personal info → Phone number** — Collected, не Shared. Назначение: *App functionality, Account management*. (используется для входа)
  - **Personal info → Other (дата рождения)** — Collected (optional). Назначение: *App functionality*.
  - **App activity → Purchase history / In-app actions** — Collected. Назначение: *App functionality, Analytics*.
- **Is all data encrypted in transit?** → **Yes** (HTTPS/TLS).
- **Can users request data deletion?** → **Yes**, URL: `https://cabinet.smartcentr.store/delete-account`.

### Account deletion (отдельная секция App content)
- **Yes, users can request account deletion**
- URL: `https://cabinet.smartcentr.store/delete-account`
- Что удаляется / что сохраняется — описано на странице.

### Content rating
- Заполните анкету (магазин лояльности, без насилия/контента 18+) → рейтинг **Everyone / 3+**.

### Target audience
- Возраст: **18+** (или 16+). Не отмечайте «для детей».

### Ads
- **No**, приложение не содержит рекламы.

### Government app / Financial features
- Это программа лояльности магазина, не банк. Финансовых лицензий не требуется.

---

## 7. Релиз

1. **Testing → Internal testing** → Create new release → загрузите `app-release-bundle.aab`.
   - Добавьте свой email в тестеры, установите по ссылке, проверьте что:
     - приложение открывается **без адресной строки** (значит assetlinks работает),
     - вход по номеру, баланс, колесо, удаление аккаунта — всё работает.
2. После проверки → **Production** → Create new release → тот же AAB → Rollout.
3. Заполните «Countries / regions» (Кыргызстан и нужные страны).

---

## 8. Финальный чек-лист (чтобы пройти с 1 раза)

- [ ] client + api задеплоены (новый manifest, /privacy, /delete-account, эндпоинт удаления)
- [ ] `https://cabinet.smartcentr.store/.well-known/assetlinks.json` отдаёт JSON с реальным SHA-256
- [ ] TWA открывается без адресной строки на тест-устройстве
- [ ] Privacy Policy URL указан и открывается
- [ ] Account deletion URL указан и открывается
- [ ] Data safety форма заполнена (см. шаг 6)
- [ ] Content rating получен
- [ ] Иконка 512, feature graphic 1024×500, ≥2 скриншота загружены
- [ ] versionCode = 1, versionName = 1.0.0

> При обновлениях увеличивайте `appVersionCode` в `twa-manifest.json` (1 → 2 → 3 …)
> и `appVersionName` (1.0.0 → 1.0.1), затем `bubblewrap build` заново.
```
