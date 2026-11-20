# First-Party Proxy Guide — Widget «чат на сайт»

Виджет Mess&Anger загружается в iframe на сайте клиента и общается с шлюзом
(`server/site-gateway`) по REST + WebSocket. По умолчанию все запросы идут
`same-origin` (шлюз обслуживает и виджет, и API на одном домене).

Если сайт хочет прятать шлюз за своим доменом (first-party), чтобы избежать
блокировки сторонних куки / CORS / браузерными расширениями, используйте
forward-прокси.

## 1. Что проксировать

| Путь | Метод | Назначение |
|------|-------|------------|
| `/widget/*` | GET | Статика виджета (chat.js, chat.css, chat.html) |
| `/v1/guest/*` | GET/POST | REST API гостя (сессия, история, handoff, статистика) |
| `/v1/guest/ws` | GET | WebSocket соединение гостя |

## 2. Nginx пример

```nginx
# /etc/nginx/sites-available/mess-widget-proxy

server {
    listen 80;
    server_name chat.mysite.com;

    location /widget/ {
        proxy_pass http://gateway.messanger.local/widget/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /v1/guest/ {
        proxy_pass http://gateway.messanger.local/v1/guest/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /v1/guest/ws {
        proxy_pass http://gateway.messanger.local/v1/guest/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

## 3. Caddy пример

```caddy
chat.mysite.com {
    reverse_proxy /widget/* gateway.messanger.local {
        header_up Host {upstream_hostport}
    }
    reverse_proxy /v1/guest/* gateway.messanger.local {
        header_up Host {upstream_hostport}
        header_up X-Forwarded-For {remote}
    }
    reverse_proxy /v1/guest/ws gateway.messanger.local {
        header_up Host {upstream_hostport}
        header_up Connection "upgrade"
        header_up Upgrade {http.upgrade}
    }
}
```

## 4. Конфигурация виджета

Виджет берёт `SITE_ID` из параметра URL `?site=...`. Вставьте на сайте:

```html
<iframe
  src="https://chat.mysite.com/widget/chat.html?site=YOUR_SITE_ID"
  width="400"
  height="600"
  allow="microphone; camera"
  loading="lazy"
></iframe>
```

Все остальные пути (`/v1/*`, `/v1/guest/ws`) виджета строятся относительно
`location.origin`, поэтому при first-party домене `chat.mysite.com` запросы
уходят на него же — прокси перенаправляет их на шлюз.

## 5. Проверка

1. Откройте `https://chat.mysite.com/widget/chat.html?site=demo` — виджет должен
   инициализироваться, статус «Подключение…», затем «Подключено».
2. Отправьте сообщение — в DevTools Network запрос уходит на
   `chat.mysite.com/v1/guest/ws` (не на сторонний домен).
3. Проверьте, что нет ошибок CORS в консоли браузера.

## 6. Ограничения

- WebSocket требует `Connection: upgrade` на прокси.
- Локальное хранилище (`localStorage`) привязано к домену `chat.mysite.com` —
  ключи гостя и сессия остаются на этом домене.
- Для production используйте HTTPS с валидным сертификатом на `chat.mysite.com`.
