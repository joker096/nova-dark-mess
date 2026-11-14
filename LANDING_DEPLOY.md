# Лендинг Mess&Anger — требования и деплой

## 1. Что это

Статичный промо-лендинг + минимальный Express-сервер (`server.js`), который:
- раздаёт `landing/` на корень сайта `https://mess.cvr.name/`
- принимает PaymentO IPN callback: `POST /api/paymento/ipn`
- хранит PII-free чеки платежей в `receipts/` (один JSON per payment)
- отдаёт health check и audit-список чеков

---

## 2. Требования

### 2.1 Хост

| Что | Версия / значение | Зачем |
|-----|-------------------|-------|
| Node.js | ≥ 18 | Express, `fetch` API, ESM в `publish-landing.js` |
| PM2 (или systemd) | 5+ | Запуск и auto-restart `server.js` |
| Nginx (или Caddy/APISIX) | 1.18+ | Reverse proxy + TLS для `mess.cvr.name` |
| SSL-сертификат | Let's Encrypt / любой | TLS обязателен (PaymentO шлёт IPN по HTTPS) |
| Диск | ≥ 100 MB | `receipts/` — один файл ~200 байт за платёж |

### 2.2 Переменные окружения (`/var/www/mess-anger/.env`)

```
# ── Обязательные ──────────────────────────────────────────────────────────
# Секрет из PaymentO admin → store "Mess&Anger user" → IPN → Signing secret.
# Без него server.js принимает unsigned IPN и логирует warning (dev mode).
PAYMENTO_SECRET="вставь_секрет_из_paymento"

# Порт, на котором слушает Node-процесс (Nginx проксирует 443 → сюда).
PORT="8080"

# ── Опциональные ───────────────────────────────────────────────────────────
# Перекрыть URL верификации PaymentO (дефолт: https://api.paymento.io/v2/verify)
# PAYMENTO_VERIFY_URL=""

# Путь для файлов чеков (дефолт: ./receipts рядом с server.js)
# RECEIPTS_DIR=""
```

### 2.3 PaymentO store settings

Настроено в PaymentO admin → store **"Mess&Anger user"**:

| Поле | Значение |
|------|----------|
| Store name | Mess&Anger user |
| IPN URL | `https://mess.cvr.name/api/paymento/ipn` |
| IPN method | HTTP POST |
| Signing secret | тот же `PAYMENTO_SECRET`, что в `.env` |
| Plan id | `premium` |
| Plan amount | `49` (=$0.49) |
| Plan currency | `usd` |

### 2.4 Структура deploy-пакета

`scripts/publish-landing.js` собирает `landing-deploy/`:

```
landing-deploy/
├── index.html          # лендинг (hero, features, pricing, footer)
├── styles.css
├── app.js              # i18n, download links, lang switcher
├── paymento.js         # PaymentO widget integration, localStorage premium
├── releaseUrls.js      # URLs для релизов (base: https://mess.cvr.name)
├── manifest.json       # PWA manifest
├── favicon.svg
├── lang/               # 8 языков (ru, en, de, fr, es, zh, ja, ko) + .br/.gz
│   ├── ru.json
│   ├── en.json
│   └── ...
├── data/
│   └── ticker.json     # (и .br/.gz)
├── releases/
│   └── releases.json   # манифест ссылок на загрузки (files[] схема)
├── server.js           # Express: static + IPN + receipts + health
├── package.json        # name: mess-anger-landing, deps: express + dotenv
└── .env.example        # шаблон для production .env
```

---

## 3. Деплой

### 3.1 Сборка бандла (локально)

```bash
# Из корня репозитория:
npm run deploy:landing
# = npm run build && node scripts/publish-landing.js
```

Скрипт:
1. Проверяет, что все asset-ссылки в `index.html` существуют.
2. Валидирует JSON: `lang/*.json` + `releases/releases.json`.
3. Стадирует `landing-deploy/` (копия `landing/` + `server.js` + `package.json` + `.env.example`).
4. Печатает команду для scp (если `--deploy` не задан).

### 3.2 Копирование на хост

```bash
# Вариант A: вручную
scp -r landing-deploy/ <user>@mess.cvr.name:/var/www/mess-anger

# Вариант B: через скрипт
LANDING_HOST="deploy@mess.cvr.name" node scripts/publish-landing.js --deploy dry-run
# (dry-run печатает команду без выполнения; уберите dry-run для реального scp)
```

### 3.3 На хосте: установка и запуск

```bash
ssh <user>@mess.cvr.name

# 1. Переместить бандл
sudo mkdir -p /var/www/mess-anger
sudo cp -r /path/to/landing-deploy/* /var/www/mess-anger/
cd /var/www/mess-anger

# 2. Зависимости
npm install --omit=dev

# 3. Конфиг
cat > .env <<EOF
PAYMENTO_SECRET="ваш_секрет_из_paymento"
PORT="8080"
EOF
chmod 600 .env

# 4. Запуск через PM2
pm2 start server.js --name mess-anger-landing
pm2 save
pm2 startup    # автозапуск после reboot

# Или systemd (если PM2 недоступен):
# см. § 3.4 ниже
```

### 3.4 systemd (альтернатива PM2)

`/etc/systemd/system/mess-anger-landing.service`:
```ini
[Unit]
Description=Mess&Anger landing server
After=network.target

[Service]
Type=simple
User=www
WorkingDirectory=/var/www/mess-anger
ExecStart=/usr/bin/node server.js
Environment=NODE_ENV=production
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable mess-anger-landing
sudo systemctl start mess-anger-landing
```

### 3.5 Nginx reverse proxy (обязательно — PaymentO шлёт по HTTPS)

```nginx
# /etc/nginx/sites-available/mess.cvr.name
server {
    listen 443 ssl http2;
    server_name mess.cvr.name;

    # Let's Encrypt
    ssl_certificate     /etc/letsencrypt/live/mess.cvr.name/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mess.cvr.name/privkey.pem;

    # Redirect HTTP → HTTPS
    # (в отдельном server-блоке: listen 80; return 301 https://$host$request_uri;)

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # IPN от PaymentO (должен работать даже если основной сайт лёг)
    location /api/paymento/ipn {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 10s;
    }
}
```

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 3.6 Проверка после деплоя

```bash
# Health
curl -s https://mess.cvr.name/api/health
# → {"ok":true,"ts":"..."}

# Лендинг на корне
curl -s https://mess.cvr.name/ | head -5
# → <!DOCTYPE html> ... Mess&Anger

# Releases manifest
curl -s https://mess.cvr.name/releases/releases.json | head -5

# Favicon
curl -s -o /dev/null -w "%{http_code}" https://mess.cvr.name/favicon.svg
# → 200

# IPN (тест — PaymentO должен ответить 200)
curl -s -X POST https://mess.cvr.name/api/paymento/ipn \
  -H "Content-Type: application/json" \
  -d '{"payment_id":"test","plan":"premium","amount":49,"currency":"usd","status":"paid"}'
# → {"ok":true,"id":"test"}
# (в production с PAYMENTO_SECRET подпись обязательна; без подписи → 400)

# Чек в receipts
curl -s https://mess.cvr.name/api/paymento/receipts
# → {"receipts":[...]}
```

---

## 4. Обновление (redeploy)

```bash
# 1. Локально — собрать новый бандл
npm run deploy:landing

# 2. Скопировать (только изменившиеся файлы)
scp -r landing-deploy/ <user>@mess.cvr.name:/var/www/mess-anger-new/

# 3. На хосте
ssh <user>@mess.cvr.name
sudo rsync -av /var/www/mess-anger-new/ /var/www/mess-anger/
cd /var/www/mess-anger
pm2 restart mess-anger-landing

# 4. Проверить
curl -s https://mess.cvr.name/api/health
```

---

## 5. Логи и мониторинг

| Что | Где смотреть |
|-----|-------------|
| Логи server.js | `pm2 logs mess-anger-landing` или `journalctl -u mess-anger-landing -f` |
| IPN события | `[paymento] IPN accepted` / `[paymento] IPN signature mismatch` в логах |
| Чеки | `ls -lt /var/www/mess-anger/receipts/` (или `GET /api/paymento/receipts`) |
| Упал ли сервер | `pm2 status` / `systemctl status mess-anger-landing` |
| Nginx access log | `/var/log/nginx/mess.cvr.name.access.log` |

---

## 6. Чек-лист перед продакшеном

- [ ] `PAYMENTO_SECRET` в `.env` совпадает с секретом в PaymentO admin
- [ ] `PAYMENTO_SECRET` не публичный (`.env` chmod 600, не в git)
- [ ] `https://mess.cvr.name/` отдаёт `index.html` (не `404` / `403`)
- [ ] `https://mess.cvr.name/api/health` → `{"ok":true}`
- [ ] `https://mess.cvr.name/releases/releases.json` → валидный JSON
- [ ] PaymentO IPN: тестовый платёж → чек появляется в `receipts/`
- [ ] Nginx TLS: сертификат активен, HTTP → 301 → HTTPS
- [ ] PM2 / systemd: auto-restart настроен (`pm2 startup` / `systemctl enable`)
- [ ] `landing/releases/releases.json` — SHA-256 для Windows/Mac/Linux заполнены
- [ ] `landing/data/ticker.json` — актуальные данные (если есть)

---

## 7. Структура IPN (PaymentO → server.js)

PaymentO шлёт:
```
POST /api/paymento/ipn
Content-Type: application/json   (или application/x-www-form-urlencoded)

{
  "payment_id": "...",
  "plan": "premium",
  "amount": 49,
  "currency": "usd",
  "status": "paid",
  "timestamp": "2026-11-13T12:00:00Z",
  "signature": "<hex HMAC-SHA256 of raw body with PAYMENTO_SECRET>"
}
```

Ответ server.js:
```json
{"ok": true, "id": "payment_id"}
```

При ошибке подписи (production, `PAYMENTO_SECRET` задан):
```json
{"ok": false, "reason": "bad signature"}   // HTTP 400
```

> **Важно:** сервер **не выдаёт доступ** к Premium. Premium активируется на
> устройстве пользователя через `localStorage` (см. `src/lib/premium.ts`).
> Server.js — только ledger (аудит + подтверждение PaymentO, что платёж прошёл).

---

## 8. Файлы, которые нужно держать в синхронности

| Файл | Что синхронизировать |
|------|----------------------|
| `landing/paymento.js` | `STORE_ID`, `PLAN.amount`, `PLAN.currency` — как в PaymentO admin |
| `src/lib/premium.ts` | `MIN_SUBSCRIPTION_COST` — как `PLAN.amount` в `paymento.js` |
| `landing/index.html` | `<script src="https://widget.paymento.io/v2/paymento.js">` — домен PaymentO |
| `server.js` | HMAC secret — как `PAYMENTO_SECRET` в `.env` и в PaymentO admin |
| `landing/releases/releases.json` | SHA-256 и URL — как в `deploy-android.ps1` / `deploy-ios.ps1` |
