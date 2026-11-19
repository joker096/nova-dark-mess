# Visual QA pass (2026-11-18 / 19)

Manual look at the running app: `npm run dev`, headless Chromium, screenshots at
390×844 (phone) and 757×398 (narrow desktop), in both the dark and light theme.
Screens reviewed: onboarding (language, nickname), chats list, chat with a
sticker/poll/location history, Settings, Profile, Mesh Map.

## Fixed in this pass

| Symptom | Cause | Fix |
|---|---|---|
| Chat text invisible in the light theme (contact name, status, own and incoming bubbles, timestamps) | Dark hex utilities are remapped to light surfaces, but the text stayed `text-white`; three incoming bubbles hardcoded `text-[#e5e7eb]` | Light-theme remap covers the chat surface; the hardcoded hex replaced with `text-[color:var(--nova-text-primary)]` |
| Disabled primary button read as a pale live button with an unreadable label (onboarding "Continue") | `disabled:opacity-50` over the accent fill | Disabled accent buttons get a neutral surface, muted label and no shadow (`src/index.css`) |
| Primary buttons turned into dark ink on the accent fill in the light theme | The colour remap rewrites `text-white`, and its accent-fill exception only matched the class without the `, #ff4e18` fallback that most components use | Explicit `text-[#ffffff]` in `NovaButton` and the onboarding primary button, plus a disabled-accent rule that keeps labels muted |
| "Premium Active" (a disabled accent button) showed white text on the neutral disabled surface, ~1.1:1 | The accent-fill rule forces white labels with `!important` and matches labels inside the fill too, while the disabled rule set only the button's own colour | Disabled accent buttons and white labels inside them keep the muted ink (`src/index.css`) |
| Chat header overflowed at 390 px: name clipped, status wrapped to two lines | Too many controls next to the name block | Chat/Gallery tabs, `P2P · N` chip and the E2EE badge are `hidden sm:*`; the status truncates at 140 px |
| Composer had no visible focus state and merged with the light background | Transparent border, no `focus-within` styling | Theme border plus accent `focus-within` ring; `data-inline-focus` keeps the inner input from drawing a second rectangular ring |
| Buttons/inputs had inconsistent press, hover and focus feedback | Per-component ad-hoc classes | Shared interaction layer: press scale, motion-safe transitions, hover only on real pointers, accent caret, focus rings, disabled styling |
| `NovaButton`/`NovaInput` had no keyboard focus ring and a washed-out accent hover | Component classes only | `focus-visible` ring with offset, accent hover brightness, disabled cursor, hover border on `NovaInput` |
| Voice-memo recording beacon showed two overlapping pulse animations | `animate-ping` plus a static dot | Single `.nova-rec-pulse` ring |
| Story-card labels were dim over bright covers | One scrim for the whole card | Extra bottom band behind avatar and name, solid white label with a shadow |
| Location bubble's "Open in Maps" button disappeared in the light theme, and its icon was clipped by the bubble edge | `bg-white/10 text-white` on a card with a hard `min-w-[240px]` inside a narrower bubble | Theme surface/text tokens, `min-w-0` so the card fits the bubble |
| Location map preview turned white with invisible streets in the light theme | The preview is a dark surface, but the remap rewrote its `bg-[#13141f]` and `border-white/10` | `data-theme-preserve="dark"` on the map canvas |

The dead `src/components/chat/ChatHeader.tsx` (the live header moved into
`ChatScreen.tsx`, no imports left) was removed.

## Contrast audit

Settings, Profile, Mesh Map and the chats list were checked by script rather
than by eye: every leaf text node's computed colour is compared against its
first opaque ancestor background, and anything under a 2.6:1 ratio is reported.
Both themes report nothing. The chat transcript and its cards were checked by
screenshot in both themes.

Checked by measurement, not by eye: the label on a live accent button is
`#ffffff`, the same label on a disabled accent button is `--nova-text-muted`
(~4.4:1 on the neutral surface), and the onboarding primary button keeps white
text in both themes.

## Checks

- `npx tsc --noEmit` — clean
- `npx eslint src/ --ext .ts,.tsx` — 0 errors, 3 auto-fixable warnings
- `npx vitest run` — 1056 tests / 134 files pass
- `npm run build` — pass (main chunk warning unchanged, tracked as F4.4)

## Known visual gaps (not fixed)

- Header density at `sm`–`md` widths: the secondary controls appear at 640 px,
  which is tight on a small tablet in portrait.
- Placeholder text relies on the design's muted opacity: legible, but dim, and
  the audit does not cover `::placeholder` pseudo-elements.
- The voice-memo recording bar could not be reached in the headless browser: it
  starts on pointer-down plus a 300 ms hold, and a mocked `getUserMedia` stream
  did not put the composer into its recording state. The idle mic button, its
  hover styling and the permission-error toast were reviewed; the active
  recording, slide-to-cancel and preview states need a real device.
- `src/components/chat/LocationBubble.tsx` is being edited by another author at
  the same time; the card-overflow fix had to be re-applied because their
  writes kept restoring the old markup.
