# План исправлений и улучшений

Обновлено: 2026-11-23

## Уже сделано

- [x] Relay на VPS обновлён, health и CORS для `app.130.49.175.224.nip.io` проверены.
- [x] Web-клиент выкачен на `https://app.130.49.175.224.nip.io`.
- [x] `VITE_PUBLIC_APP_URL` переключён с лендинга на приложение: invite-ссылки открывают app.
- [x] Исправлен `modulePreload`, из-за которого production грузил `/react` и `/ChatScreen` как HTML.
- [x] Входящие сообщения приходят автоматически без push-токена (fallback-опрос).
- [x] Deep links принимают и `app.*`, и старый хост `mess.cvr.name`.
- [x] Полный набор тестов, typecheck и production build зелёные.

## Приоритет 1 — стабильность и мелкие дефекты

- [x] **1.1 Пустой `src` у аватаров/медиа.** `LazyMedia` больше не рендерит `<img src="">`; предупреждения убраны.
- [x] **1.2 Безопасный опрос при 429.** `httpRelay` запоминает `429` и включает минутный cooldown; опрос пропускается до его окончания.
- [x] **1.3 Проверка TURN.** Реальный Chromium `RTCPeerConnection` с `iceTransportPolicy: relay` получил relay-кандидата. Логин/пароль в `.env` приведены в соответствие с `coturn`.
- [x] **1.4 Криптография групповых приглашений.** В `GroupModal` `privateKey` и `recipientPublicKey` — пара от одного `secret`; тест на соответствие добавлен.

## Приоритет 2 — звонки для приглашённых контактов

Сейчас звонки есть только в `ChatScreen` и требуют fingerprint-based signaling. Anonymous-контакты живут в отдельном экране без call UI.

- [x] **2.1 Протокол signaling для anonymous-звонков.** `invite` / `accept` / `decline` / `end` / `signal` с `offer` / `answer` / `candidate`, версионирование и валидация в `callProtocol`.
- [x] **2.2 Адаптер signaling.** `AnonCallSignaling` передаёт SDP/ICE через зашифрованную очередь контакта; identity fingerprint не используется.
- [x] **2.3 UI звонка.** Кнопки voice/video, входящий диалог accept/decline, overlay с локальным/удалённым потоком, mute/camera и завершением.
- [x] **2.4 Тесты и проверка.** Юнит-тесты протокола и state-machine; реальный двухпрофильный Chromium-звонок с fake media: входящий, accept, connected, 2 remote video tracks, 0 ошибок. TURN-режим включён при наличии `VITE_TURN_URLS`.

## Приоритет 3 — эксплуатация

- [x] **3.1 Лимиты relay.** Проверено: создание очередей ограничено `20/час/IP`, poll/enqueue — `100/мин`. Это анти-спам; для офисного NAT может стать тесно, но менять без решения по безопасности не стал. Клиент получил cooldown после `429`.
- [x] **3.2 Production smoke.** Вручную прогнан сценарий invite → accept → message на `app.*`: 0 ошибок консоли, сообщение доставлено автоматически.
- [x] **3.3 Коммит.** Сделан коммит `feat: add anonymous contact calls over encrypted queues`; в него вошли только файлы этого среза, чужие `orders/`, `licenses/` и theme-WIP не тронуты.

## Критерии готовности

- `npm test`, `npm run lint`, `npm run build` зелёные.
- Production-страница загружается без ошибок консоли.
- Invite-ссылка открывает приложение, контакт появляется у обеих сторон.
- Текст и файлы доходят автоматически.
- Голосовой и видео-звонок между двумя anonymous-контактами соединяется через relay/TURN.
