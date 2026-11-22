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

## 8. Блокеры

Нет. Архитектура тем уже частично реализована (`data-theme`, `appearance.ts`), но компоненты жёстко завязаны на Tailwind arbitrary values, а дефолт темы — `'dark'` вместо `'system'`, и нет анти-вспышки.
