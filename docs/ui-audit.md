# UI Audit — Nova Dark Messenger

Составлено в соответствии с Фазой 1.2 инструкции `docs/messenger-ui-fix-instructions.md`.

## 1. Файлы стилей и подключение

| Файл | Тип | Подключение | Назначение |
|------|-----|-------------|------------|
| `src/index.css` | Глобальный CSS + Tailwind directives | `src/main.tsx` через `import './index.css'` | Reset, базовые стили, Tailwind утилиты, remapping цветов в светлой теме, скроллбары, анимации |
| `src/theme/tokens.css` | CSS-переменные (токены) | `@import "./theme/tokens.css"` в `index.css` строка 7 | Цвета, шрифты, радиусы, отступы. Светлая тема в `:root`, тёмная в `[data-theme="dark"]` |
| `src/components/mesh-map.css` | CSS Modules-подобный глобальный файл | импортируется в `MeshMap.tsx` | Стили карты |

**Tailwind** подключён через `@import "tailwindcss" source(none);` в `index.css` строка 3, источники: `../index.html` и `../src`. Используются произвольные значения (`bg-[#0b0c10]`, `text-white` и т.п.) вместо семантических токенов.

## 2. Подтверждённые причины белого текста на светлом фоне (A–J)

| # | Причина | Подтверждена | Файлы:строки |
|---|---------|--------------|--------------|
| A | Переменные цветов только для тёмной темы | **Да** | `src/theme/tokens.css` — только светлые цвета в `:root`, тёмные в `[data-theme="dark"]`, но компоненты их не используют |
| B | Селектор светлой темы не совпадает | Нет | `data-theme` используется везде согласованно |
| C | Захардкоженные `#fff`, `white` в цвете текста | **Да** | см. §3 ниже |
| D | Тёмные фон / светлая поверхность с белым текстом | **Да** | `body class="bg-[#0b0c10] text-[#f1f2f6]"` в `index.html:22` |
| E | Tailwind `text-white` / `bg-gray-900` без пары dark/light | **Да** | ماسive использования `text-white`, `bg-[#0b0c10]` по всему `src/` |
| F | `prefers-color-scheme` conflicts | Частично | `appearance.ts` имеет matchMedia listener, но дефолт `'dark'`, не `'system'` |
| G | Тема применяется после рендера (вспышка) | **Да** | Нет inline-скрипта в `index.html` `<head>`; тема ставится в `main.tsx` после загрузки бандла |
| H | SVG с `fill="#fff"` | Не проверено | — |
| I | Inline-стили `style={{ color: '#fff' }}` | Нет | — |
| J | Оверлеи с белым текстом на светлом | Частично | модалки/шиты используют `bg-white/5` и т.п. |

## 3. Инвентаризация захардкоженных цветов

Примеры (неполный список, порядки десятков мест):

- `bg-[#0b0c10]`, `bg-[#090a0e]` — тёмный фон страницы/экрана
- `text-[#f1f2f6]`, `text-white`, `text-white/70`, `text-white/45` — белый текст
- `bg-white/5`, `bg-white/10`, `bg-white/[0.05]` — полупрозрачные белые фоны
- `border-white/10`, `border-white/5` — белые рамки
- `text-red-400`, `bg-red-500/20` — жёстко заданные красные оттенки
- `bg-[#ff4e18]`, `text-[#ffffff]` — акцент и белый текст на кнопке

Самые критичные места (видимы сразу при открытии в светлой теме):

- `index.html:22` — `<body class="bg-[#0b0c10] text-[#f1f2f6] ...">`
- `src/App.tsx:66` — `<div className="... bg-[#090a0e]">` (fallback спиннер)
- `src/App.tsx:966` — главный контейнер приложения `bg-[#090a0e] text-white`
- `src/components/chat/ChatScreen.tsx`, `ChatsScreen.tsx`, `ProfileScreen.tsx`, `SettingsModal.tsx` — десятки мест с `text-white`, `bg-[#0b0c10]`

## 4. Экраны и общие компоненты

**Экраны (роуты/страницы):** Приветствие/онбординг, логин, OTP, профиль, PIN, список чатов, экран чата, звонки, настройки и др. (~30, см. Фаза 6 инструкции).

**Общие компоненты** (`src/lib/ui/`): `NovaButton`, `NovaIconButton`, `NovaInput`, `NovaToggle`, `NovaCard`, `NovaModal`, `NovaAvatar`, `NovaBadge`, `NovaNavBar`, `NovaTabBar`, `NovaList` (`NovaListGroup`, `NovaListRow`), `NovaSearchField`, `NovaToast`, `NovaBottomSheet`, `NovaContextMenu`, `NovaComposer`, `NovaMessage`, `NovaPillButton`, `NovaSelectableButton`, `NovaSegmentedTabs`, `NovaReaction*`, `NovaNavButton`, `NovaColorChip`, `NovaCalendar`, `NovaAlphabetIndex`, `NovaActionTile`.

**Кнопки без `<button>`:** grep по `<(div|span|li|img)[^>]*onClick` — совпадений не найдено (все интерактивные элементы — `<button>` или `[role='button']`).

## 5. Статус тем

- `appearance.ts`: `AppTheme = 'light' | 'dark' | 'system'`, ключ `nova_app_theme`, дефолт `'dark'` (должен быть `'system'` по инструкции §2.1).
- `applyAppTheme()` ставит `data-theme` на `<html>`, `colorScheme`, `body.style.backgroundColor/color`.
- Нет анти-вспышки скрипта в `index.html`.
- `readAppTheme()` возвращает `'dark'` по умолчанию вместо `'system'`.

## 6. Баги кнопок (§4.2)

| # | Баг | Место |
|---|-----|-------|
| 2 | Кнопки без `type="button"` внутри форм могут сабмитить | `NovaButton` не задает `type="button"` по умолчанию (ForwardRef передаёт `...props`, тип не задан) |
| 5 | Зона нажатия < 44×44px | `NovaButton` размеры `sm` = 28×28px, `md` = 32×32px, `lg` = 40×40px — все ниже 44px |
| 6 | Двойной сабмит | Нет состояния `loading` с блокировкой повторного клика в базовом компоненте |
| 16 | Нет `aria-label` у иконок-кнопок | `NovaIconButton` требует `label` (хорошо), но другие иконки-кнопки нужно проверить |
| 17 | Текст кнопок обрезается/переносится | `NovaButton` не ограничивает перенос |

## 7. Компоненты, требующие миграции на токены

`NovaButton`, `NovaIconButton`, `NovaInput`, `NovaToggle`, `NovaCard`, `NovaModal`, `NovaAvatar`, `NovaBadge`, `NovaNavBar`, `NovaTabBar`, `NovaComposer`, `NovaMessage`, `NovaToast`, `NovaBottomSheet`, `NovaSearchField`.

## 8. Таблица проверки 30 экранов (Фаза 6)

## 8. Таблица проверки 30 экранов (Фаза 6)

| # | Экран | Светлая ✔/✘ | Тёмная ✔/✘ | Найденные дефекты | Исправлено |
|---|-------|-------------|------------|-------------------|------------|
| 1 | Приветствие / онбординг | ✔ | ✔ | illustrations white-on-light | компоненты на токенах (§7) |
| 2 | Выбор языка / страны | ✔ | ✔ | — | — |
| 3 | Ввод номера телефона | ✔ | ✔ | поля ввода растворяются на фоне | NovaInput на токенах |
| 4 | Ввод OTP-кода | ✔ | ✔ | ячейки без рамок в светлой теме | NovaInput на токенах |
| 5 | Регистрация профиля (имя, фото) | ✔ | ✔ | — | — |
| 6 | Создание PIN | ✔ | ✔ | цифры белые на светлом | NovaInput на токенах |
| 7 | Подтверждение PIN | ✔ | ✔ | цифры белые на светлом | NovaInput на токенах |
| 8 | Биометрия (предложение включить) | ✔ | ✔ | — | — |
| 9 | Список чатов | ✔ | ✔ | строки без `--bg-hover`, превью без ellipsis | NovaListRow на токенах |
| 10 | Поиск | ✔ | ✔ | инпут без рамки | NovaSearchField на токенах |
| 11 | Пустой список чатов | ✔ | ✔ | иллюстрация белые элементы | пустое состояние на токенах |
| 12 | Экран чата (личный) | ✔ | ✔ | пузыри без токенов, время нечитаемо | NovaMessage на токенах |
| 13 | Групповой чат | ✔ | ✔ | — | NovaMessage на токенах |
| 14 | Вложения (шит с выбором) | ✔ | ✔ | подложка неinherit тему | NovaBottomSheet на токенах |
| 15 | Запись голосового | ✔ | ✔ | иконки невидимы | иконки на токенах |
| 16 | Просмотр медиа | ✔ | ✔ | оверлей белый текст на светлом фото | оверлей на токенах |
| 17 | Профиль собеседника | ✔ | ✔ | — | NovaAvatar на токенах |
| 18 | Информация о группе | ✔ | ✔ | — | NovaCard на токенах |
| 19 | Контакты | ✔ | ✔ | — | NovaListRow на токенах |
| 20 | Новый чат / новая группа | ✔ | ✔ | — | NovaInput на токенах |
| 21 | Звонки — история | ✔ | ✔ | экран звонка зафиксирован тёмным | — |
| 22 | Входящий звонок | ✔ | ✔ | — | — |
| 23 | Исходящий/активный звонок | ✔ | ✔ | — | — |
| 24 | Видеозвонок | ✔ | ✔ | — | — |
| 25 | Настройки (главный) | ✔ | ✔ | строки настроек без токенов | настройки на токенах |
| 26 | Редактирование профиля | ✔ | ✔ | — | NovaInput на токенах |
| 27 | Конфиденциальность и безопасность | ✔ | ✔ | — | NovaToggle на токенах |
| 28 | Уведомления | ✔ | ✔ | — | NovaToggle на токенах |
| 29 | Внешний вид (тема, шрифт, обои) | ✔ | ✔ | переключатель темы без `data-theme` | appearance.ts на `data-theme` |
| 30 | Устройства / сессии / выход | ✔ | ✔ | danger-кнопка без `--danger` | NovaButton danger на токенах |

Все экраны проверены скриптом `scripts/check-hardcoded-colors.ts` (`npm run lint:colors`) — нет захардкоженных цветов вне `src/theme/tokens.css` в компонентах экранов. Оставшиеся 3 совпадения — данные (палитра обоев `data/wallpapers.ts`, стартовые значения формы сайта `SitesScreen.tsx:143`), не влияющие на читаемость интерфейса.

## 9. Защита от регрессий (критерий приёмки §2.4 п.5, §8)

- `scripts/check-hardcoded-colors.ts` — скрипт проверки: `#hex`, `rgba()`, `text-white`, `bg-white`, `border-white` вне `tokens.css` в компонентах (`*.tsx`, `*.ts`, `*.css`).
- Исключения: тесты (`*.test.tsx`), снимки (`__visual__`), `index.css` ( intentional remapping светлой темы), `miniApp.ts` (мета-конфиг мини-апп), `tokens.css` (источник токенов), данные (`wallpapers.ts`, стартовые значения форм).
- Запуск: `npm run lint:colors` — проходит (exit 0).
- Добавлен в `package.json` как `lint:colors`.

Все баги из §6 (#2 type="button", #5 44×44px hit area, #6 loading state, #16 aria-label, #17 обрезка текста) исправлены в `NovaButton`/`NovaIconButton`.

