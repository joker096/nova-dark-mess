# Nova Dark Messenger vs Telegram — Screen-by-Screen Comparison & Improvement Plan

Generated: 2026-11-22

---

## Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented & matches Telegram |
| ⚠️ | Implemented but incomplete / different UX |
| ❌ | Missing vs Telegram |
| 🆕 | Nova-only (no Telegram equivalent) |
| 🔴 | Critical gap |
| 🟡 | Medium gap |
| 🟢 | Nice-to-have |

---

## 1. Chat List — `ChatsScreen` ↔ Telegram **Chats Tab**

| Area | Telegram | Nova | Status | Gap / Improvement |
|------|----------|------|--------|-------------------|
| **Layout** | Two-pane on tablet/desktop; single-pane mobile | ✅ Two-pane desktop, single-pane mobile | ✅ | Good |
| **Story bar** | Top horizontal scroll (rounded rect, avatar ring = unread) | ✅ Horizontal scroll, add-story button, unread badge on avatar ring | ✅ | Good |
| **Search** | Persistent top search bar; Cmd/Ctrl+K focus | ✅ Prominent search bar, Cmd+K, quick-search chips | ✅ | **Nova better** (chips, real-time highlight) |
| **Filter tabs** | All / Unread / Groups / Channels / Bots (bottom on mobile, top on desktop) | ✅ Custom folders (All, Personal, Work, Favorites, Archive) as scrollable pills | ⚠️ | Telegram has fixed semantic tabs; Nova has user-defined folders — **more powerful but less discoverable** |
| **Chat row** | Avatar, name, preview, time, unread badge, mute/pin icons | ✅ All present + bot badge, join-request indicator, group multi-avatar | ✅ | Nova adds join-request badge for admins |
| **Pin / Archive** | Swipe actions (pin, archive, mute, delete) | ✅ Full swipe actions: Pin, Archive, Mute, Delete | ✅ | Implemented |
| **Unread divider** | "Unread" label between read/unread | ✅ In search results & chat list | ✅ | Good |
| **Draft sync** | Draft text shown in preview, persists across devices | ✅ Draft stored per-chat, synced via localStorage | ⚠️ | **No cross-device sync** (Telegram uses cloud drafts) |
| **Folders** | Built-in + custom; per-folder notifications | ✅ Custom folders with per-folder notification settings (level + mute) | ✅ | Implemented |
| **New chat FAB** | Floating action button (bottom-right) | ✅ FAB with left/right handed option | ✅ | Nova adds handedness |
| **Context menu** | Long-press → pin, archive, mute, delete, mark read, select | ✅ Long-press context menu with Pin, Archive, Mute, Delete | ✅ | Implemented |
| **Select mode** | Multi-select for bulk archive/delete/mute | ✅ Select mode with bulk Pin, Archive, Mute, Delete | ✅ | Implemented |

### Improvement Plan — Chat List
1. ~~**Add swipe gestures** on chat rows (pin, archive, mute, delete) — high impact, low effort~~ ✅ **DONE**
2. ~~**Hook `NovaContextMenu`** to long-press on chat rows — medium effort~~ ✅ **DONE**
3. ~~**Add select mode** (multi-select toolbar) — medium effort~~ ✅ **DONE**
4. ~~**Per-folder notification settings** — low effort (extend folder model)~~ ✅ **DONE**
5. **Cross-device draft sync** — requires backend / encrypted sync (post-MVP)

---

## 2. Individual Chat — `ChatScreen` ↔ Telegram **Chat**

| Area | Telegram | Nova | Status | Gap / Improvement |
|------|----------|------|--------|-------------------|
| **Bubbles** | Tailored outgoing/incoming, grouped by sender, date separators | ✅ Grouped, date separators, unread divider | ✅ | Good |
| **Reactions** | Double-tap ❤️, long-press picker (8 default + custom), animation | ✅ Long-press picker (8 emoji), double-tap not implemented | ⚠️ | **Missing double-tap quick reaction** |
| **Reply** | Swipe right on bubble → reply bar | ⚠️ Swipe-to-reply gesture implemented (`swipingMsgId`) but visual reply bar missing | 🟡 | **Swipe gesture works but no reply preview bar** |
| **Thread / Quote** | Tap reply → opens thread panel (mobile) or inline (desktop) | ✅ `threadRootId` + `threadRef` focus trap, but UI minimal | ⚠️ | **Thread UI bare-bones** vs Telegram's rich thread view |
| **Forward** | Long-press → forward → multi-select → choose chats | ✅ Forward select mode (`isForwardSelecting`, `forwardSelectedIds`) | ✅ | Good |
| **Copy / Select text** | Long-press text → selection handles, copy | ❌ No text selection in bubbles | 🔴 | **Missing text selection** — critical for usability |
| **Edit** | Long-press own → edit, "edited" tag | ✅ `editingMsgId`, `editingText`, saves via `editMessage` | ✅ | Good |
| **Delete** | Delete for me / for everyone; undo toast | ✅ `deletingMsgId` animation, `deletedUndo` with toast timer | ✅ | Good |
| **Pin** | Pin message → carousel at top | ✅ `isPinnedCarouselOpen`, `pinnedMessages` filter | ✅ | Good |
| **Search in chat** | Magnifier icon → inline search, next/prev, filter chips | ✅ `isSearchOpen`, `matchingMessages`, `activeMatchIndex`, context/filtered modes | ✅ | **Nova better** (context vs filtered toggle) |
| **Media gallery** | Tap image → full-screen carousel, swipe, zoom, share, save | ⚠️ `mediaLightbox` exists but no zoom, no video scrubber | 🟡 | **Missing pinch-zoom, video controls** |
| **Voice messages** | Waveform, playback speed, piped playback, draft recording | ✅ `VoiceMemoInput` with waveform, `AudioWaveformPlayer`, `recordedVoiceNote` staging | ✅ | Good |
| **Video messages** | Round video, tap to expand, pip | ❌ Not implemented | 🟡 | **Missing round video messages** |
| **Stickers** | Sticker panel, recent, packs, search, suggestions | ✅ `StickerPickerDrawer`, `StickerMedia`, size preference sync | ✅ | Good |
| **GIFs** | Giphy/Tenor search inline | ✅ Real API search (Giphy/Tenor) with categories & infinite scroll | ✅ | Implemented |
| **Polls** | Create poll (quiz/multiple), vote, results | ✅ `PollCreateModal`, `PollBubble`, vote handling | ✅ | Good |
| **Location** | Live location, static pin, map preview | ✅ `LocationPickerModal`, `LocationBubble` | ✅ | Good |
| **Files** | Document picker, preview, download, share | ✅ `FileSelectionModal`, `LazyMedia`, download button | ✅ | Good |
| **Scheduled send** | Long-press send → schedule, recurring | ✅ `ScheduleMessageModal`, `sendOptionsOpen`, `scheduledMessages` delivery loop | ✅ | **Nova has recurring? No — only one-time** |
| **Silent send** | Long-press send → send without notification | ✅ `sendSilently` toggle in send options | ✅ | Good |
| **Disappearing messages** | Timer per-chat (1d/1w/1m/custom) | ✅ `disappearAfter`, `viewOnceMode`, `expiresAt` on messages | ✅ | Good |
| **Wallpaper** | Per-chat wallpaper, motion, intensity, default/global | ✅ `WallpaperSettingsModal`, `WALLPAPER_OPTIONS`, intensity slider | ✅ | **Nova: per-chat only; Telegram has global default too** |
| **Chat themes** | Premium: gradient bubble colors | ✅ `PREMIUM_THEMES` (sapphire/amethyst/emerald) | ✅ | Good |
| **Call buttons** | Voice / Video call top-right | ✅ Header buttons + `VideoCallOverlay`, `P2PMediaCall` | ✅ | Good |
| **Encryption badge** | Lock icon, "End-to-end encrypted" | ✅ `peerKeyChanges` journal, safety number in profile | ✅ | **Nova: key rotation journal visible in chat** |
| **Bot commands** | Slash menu, inline keyboard, web app button | ✅ `CommandMenu`, `MessageInlineKeyboard`, `MiniAppIframe` | ✅ | **Nova: Mini Apps via web_app button** |
| **Typing indicator** | "typing…" / "recording audio…" | ✅ `isTyping`, `typingActivity`, receipt manager | ✅ | Good |
| **Read receipts** | Single check (sent), double check (delivered), blue (read) | ✅ `Check` / `CheckCheck` / `Clock` icons, `ReceiptManager` | ✅ | Good |
| **Unread counter** | Badge on scroll-to-bottom button | ✅ `showScrollToBottom`, `unreadCount` | ✅ | Good |
| **Edge swipe back** | iOS: swipe from left edge | ✅ `edgeSwipeOffset`, `isEdgeSwiping` gesture | ✅ | **Nova implements custom gesture** |
| **Reply in thread (desktop)** | Right sidebar | ❌ Desktop two-pane but no thread sidebar | 🟡 | **Missing desktop thread panel** |
| **Message translation** | Long-press → translate | ✅ LibreTranslate/MyMemory API, dismissible inline result | ✅ | Implemented |
| **Message links preview** | Rich link cards (title, image, description) | ⚠️ `renderMarkdown` but no dedicated link preview component | 🟡 | **Missing rich link previews** |

### Improvement Plan — Chat Screen
| Priority | Task | Effort |
|----------|------|--------|
| 🔴 | Add text selection in bubbles (copy, select all, translate) | Medium |
| 🔴 | Implement double-tap ❤️ quick reaction | Low |
| 🔴 | Add reply preview bar (swipe right shows inline reply composer) | Medium |
| 🟡 | Enhance media lightbox: pinch-zoom, video scrubber, share/save buttons | Medium |
| 🟡 | Add round video messages (Telegram-style) | High |
| 🟡 | Add GIF search (Giphy/Tenor integration) | Medium |
| 🟡 | Add rich link previews (OpenGraph parsing) | Medium |
| 🟡 | Desktop thread sidebar (right panel) | High |
| 🟢 | Recurring scheduled messages | Low |
| 🟢 | Global default wallpaper + per-chat override | Low |
| 🟢 | Message translation (client-side or API) | High |

---

## 3. Channels — `ChannelScreen` + `ChannelListPanel` ↔ Telegram **Channels Tab**

| Area | Telegram | Nova | Status | Gap / Improvement |
|------|----------|------|--------|-------------------|
| **Channel list** | Separate tab, unread badges, search, create button | ✅ `ChannelListPanel` in folders "channels" filter, create modal | ✅ | Good |
| **Channel feed** | Reverse chronological, date headers, pull-to-refresh | ✅ Date scrubber (calendar ruler), auto-collapse header | ✅ | **Nova: calendar ruler is unique & better** |
| **Posts** | Title, text, media, poll, reactions, comments, views, forward, share | ✅ All + scheduled indicator, sponsored card slot | ✅ | Good |
| **Reactions** | Tap reaction pill → picker, double-tap ❤️ | ✅ `NovaReactionPill` + `NovaReactionPicker` | ⚠️ | **Missing double-tap** |
| **Comments** | Bottom sheet, threaded replies, reactions | ✅ `PostCommentsSheet` | ✅ | Good |
| **Polls** | Vote, see results, multiple choice, quiz | ✅ `PollBubble` + `onVotePoll` | ✅ | Good |
| **Media gallery** | Tap image → gallery per channel | ⚠️ `lightbox` exists but per-post not per-channel | 🟡 | **Missing channel media gallery** |
| **Search in channel** | Filter: all / photos / videos / links / files + date range | ✅ `searchOpen`, `searchFilter`, `searchDateFrom/To` | ✅ | **Nova better** (date range) |
| **Calendar ruler** | None (only date headers) | ✅ Month/week/day scrubber with post count dots | ✅ | **Nova unique & superior** |
| **Notifications** | Per-channel: all / mentions / none | ✅ `notificationsEnabled` toggle + sound toggle | ✅ | Good |
| **Subscriber privacy** | Hide subscriber count | ✅ `hideSubscriberCount` toggle in menu | ✅ | Good |
| **Admin tools** | Edit/delete post, pin, statistics, manage admins | ⚠️ Edit/delete own posts only; no pin, no stats, no admin management | 🟡 | **Missing: pin post, channel stats, admin management** |
| **Discussion group** | Linked group for comments | ❌ Not implemented | 🟡 | **Missing linked discussion group** |
| **Channel description / bio** | Expandable header | ❌ Header shows name + subscriber count only | 🟡 | **Missing description/bio in header** |
| **Join request** | Approve/deny join requests for private channels | ❌ Channels are public or invite-only; no join requests | 🟡 | **Nova has group join requests but not for channels** |
| **Sponsored posts** | Telegram Ad Platform | ✅ `SponsoredPostCard` + ad client | ✅ | **Nova has own ad system** |
| **Boost / Premium perks** | Custom emoji, stories, colors | ❌ Not implemented | 🟢 | **Missing boost features** |

### Improvement Plan — Channels
| Priority | Task | Effort |
|----------|------|--------|
| 🟡 | Add pin message in channel (admin) | Low |
| 🟡 | Channel statistics panel (views, growth, engagement) | Medium |
| 🟡 | Admin management (add/remove admins, permissions) | Medium |
| 🟡 | Linked discussion group for comments | High |
| 🟡 | Channel description/bio in header | Low |
| 🟢 | Channel media gallery (all photos/videos/files) | Medium |
| 🟢 | Channel boost / custom emoji support | High |

---

## 4. Profile — `ProfileScreen` ↔ Telegram **Profile / User Info**

| Area | Telegram | Nova | Status | Gap / Improvement |
|------|----------|------|--------|-------------------|
| **Avatar** | Large, tap → fullscreen, edit (own) | ✅ Large avatar, tap → lightbox, edit button (own) | ✅ | Good |
| **Name / Username** | Editable (own), copy username | ✅ Editable inline, copy handle button | ✅ | Good |
| **Bio / Status** | Editable (own), "Last seen" / "Online" | ✅ Status line, editable nickname/phone | ⚠️ | **No bio/about field** |
| **Phone** | Visible per privacy settings | ✅ Additional phone field (editable) | ✅ | Good |
| **Quick actions** | Message, Call, Video, Search, Media, Files, Links, Voice | ✅ Message, Audio, Video, More menu (edit/share/copy) | ⚠️ | **Missing: Search, Media, Files, Links, Voice tabs in quick actions** |
| **Tabs** | Media / Files / Links / Voice (shared content) | ✅ Media (photos/videos), Files, Links, Voice tabs with counts | ✅ | **Nova has all 4 tabs** |
| **Media grid** | Month-grouped, tap → carousel | ✅ Month-grouped grid, tap → lightbox with nav | ✅ | Good |
| **Shared files** | List with type icons, download | ⚠️ Files tab exists but UI minimal | 🟡 | **Files/Links/Voice tabs are stubs** |
| **Safety number** | Encryption verification (QR + emoji) | ✅ Safety number (emoji), QR modal | ✅ | Good |
| **Device linking** | Active sessions, link new device | ✅ `DeviceLinkManager`, QR + code, history sync | ✅ | **Nova: E2EE history sync across devices** |
| **Block / Report** | Block user, report spam | ✅ Block/unblock, abuse report with categories | ✅ | Good |
| **Premium badge** | Star/crown | ✅ Crown icon | ✅ | Good |
| **Contact QR** | QR code with @username | ✅ `openQr` generates profile URL QR | ✅ | Good |
| **Edit contact (not own)** | Rename, add phone, custom name | ✅ `openContactEdit`, `saveContactOverride` | ✅ | **Nova: contact overrides stored locally** |
| **Notifications** | Per-contact mute/custom | ❌ Not in profile (in chat header menu) | 🟡 | **Missing per-contact notification settings in profile** |

### Improvement Plan — Profile
| Priority | Task | Effort |
|----------|------|--------|
| 🟡 | Add bio/about field (editable for own profile) | Low |
| 🟡 | Flesh out Files / Links / Voice tabs (list shared content) | Medium |
| 🟢 | Per-contact notification settings in profile | Low |
| 🟢 | "Last seen" / "Online" status with privacy options | Low |

---

## 5. Settings — `SettingsModal` ↔ Telegram **Settings**

| Area | Telegram | Nova | Status | Gap / Improvement |
|------|----------|------|--------|-------------------|
| **Structure** | Sections: Account, Chat Settings, Notifications, Privacy, Data, Appearance, Devices, Language, Premium | ✅ Similar sections via `SectionHeader` | ✅ | Good |
| **Language** | In-app language switcher | ✅ `LanguageSwitcher` component | ✅ | Good |
| **Theme** | Light / Dark / System | ✅ Light / Dark / System pills | ✅ | Good |
| **Font size** | Small / Medium / Large | ✅ Small / Medium / Large pills with live preview | ✅ | **Nova: live preview of "A"** |
| **Chat colors** | Premium: 4 gradients | ✅ Default + 3 premium (sapphire/amethyst/emerald) | ✅ | Good |
| **FAB handedness** | No (fixed right) | ✅ Left / Right toggle | ✅ | **Nova unique** |
| **Notifications** | Per-chat, per-channel, groups, contacts, events | ⚠️ Global toggles only (sound, vibration, preview, auto-download) | 🔴 | **Missing granular notification settings** |
| **Privacy** | Last seen, profile photo, calls, groups, forwards, phone, blocked users | ✅ `PrivacyPrefs`: metadata minimization, Tor, relay, TURN, cover traffic, presence sharing, analytics consent | ⚠️ | **Nova: network-level privacy (Tor, relays); missing Telegram-style social privacy (last seen, photo, calls, groups)** |
| **Passcode / FaceID** | Passcode lock, Face/Touch ID, auto-lock timer | ✅ PIN (4/6 digit), biometric, lock on hide, PIN length | ✅ | Good |
| **Two-factor auth** | Cloud password + hint + recovery email | ✅ TOTP 2FA (enable/disable) | ⚠️ | **Nova: TOTP only; no cloud password / recovery email** |
| **Data & Storage** | Cache size, auto-download, keep media, clear cache | ✅ Storage usage by category, clear cache, auto-download toggle | ✅ | **Nova: detailed breakdown by category** |
| **Backup** | Cloud backup (Google Drive / iCloud), local export | ✅ Encrypted backup export/import, Google Drive stub, cloud URL | ⚠️ | **Google Drive stub only; no iCloud, no auto-backup** |
| **Devices** | Active sessions, link desktop, log out | ✅ Device linking (QR + code), history sync, linked count | ✅ | **Nova: E2EE history sync** |
| **Bots** | BotFather, bot tokens, privacy mode | ✅ Full bot management (install, permissions, block, dev registry, manifest file) | ✅ | **Nova: much richer bot platform** |
| **Advanced / Experimental** | None | ✅ Relay endpoints, proxy, Tor, TURN, push token, cover traffic | ✅ | **Nova unique: P2P network config** |
| **Ads** | Telegram Ad Platform (disable with Premium) | ✅ Local ad prefs, hide/block advertisers, reset | ✅ | **Nova: local ad control** |
| **Sounds** | Notification sound picker | ✅ `loadSoundId`, `SOUNDS` array, picker | ✅ | Good |
| **Legal** | Terms, Privacy Policy | ✅ `LegalModal` (terms/privacy) | ✅ | Good |
| **Analytics** | None (Telegram has none) | ✅ `AnalyticsScreen` (local analytics) | 🆕 | **Nova unique** |
| **Mesh Map** | None | ✅ `MeshMapScreen` | 🆕 | **Nova unique** |
| **Sites (Mess&Anger)** | None | ✅ `SitesScreen` | 🆕 | **Nova unique** |
| **Anonymous Messenger** | None | ✅ `AnonymousMessengerScreen` | 🆕 | **Nova unique** |

### Improvement Plan — Settings
| Priority | Task | Effort |
|----------|------|--------|
| 🔴 | Add Telegram-style social privacy: Last seen, Profile photo, Calls, Groups & Channels, Phone number, Blocked users | High |
| 🔴 | Granular notification settings (per chat type, per contact, exceptions) | High |
| 🟡 | Implement Google Drive backup fully (OAuth, auto-backup schedule) | High |
| 🟡 | Add iCloud backup support (iOS) | High |
| 🟡 | Cloud password + recovery email (2FA enhancement) | Medium |
| 🟢 | Auto-backup toggle & schedule | Medium |

---

## 6. Onboarding — `OnboardingWizard` ↔ Telegram **First Launch**

| Area | Telegram | Nova | Status | Gap / Improvement |
|------|----------|------|--------|-------------------|
| **Language** | First screen | ✅ Step 1: language picker with flags | ✅ | Good |
| **Create / Restore** | Enter phone → SMS code | ✅ Two paths: Create (nickname → phrase → PIN → backup) / Restore (phrase or backup file) | ✅ | **Nova: no phone/SMS; uses recovery phrase + optional backup file** |
| **Nickname** | First/Last name | ✅ Nickname (normalized @handle) | ✅ | Good |
| **Recovery phrase** | None (Telegram uses cloud + 2FA) | ✅ 12-word mnemonic, copy/download, phrase check quiz | ✅ | **Nova: self-custody, phrase verification quiz** |
| **PIN** | Optional passcode later | ✅ Optional 4/6 digit PIN, confirm, length persisted | ✅ | Good |
| **Backup** | Cloud backup prompt | ✅ Encrypted backup file creation (passphrase) | ✅ | Good |
| **Progress** | None (linear) | ✅ Progress bar with step labels | ✅ | **Nova better** |
| **Skip options** | Skip passcode | ✅ Skip PIN, skip backup | ✅ | Good |
| **Restore from backup** | Cloud restore | ✅ Restore from `.nova-backup` file + passphrase | ✅ | **Nova: local file restore** |
| **Accessibility** | System fonts, VoiceOver | ⚠️ Basic ARIA labels, no dynamic type scaling beyond font size setting | 🟡 | **Missing full accessibility audit** |

### Improvement Plan — Onboarding
| Priority | Task | Effort |
|----------|------|--------|
| 🟡 | Full accessibility audit (ARIA, focus management, screen readers) | Medium |
| 🟢 | Animated transitions between steps | Low |

---

## 7. Anonymous Messenger — `AnonymousMessengerScreen` ↔ **No Telegram Equivalent** 🆕

| Feature | Nova Implementation |
|---------|---------------------|
| **Pairing** | Invite link / QR code with ephemeral X25519 keys, relay rotation |
| **Transport** | Local-only, relay (HTTPS), proxy, Tor (.onion) |
| **Messages** | E2EE, file transfer (2MB max, SHA-256), dummy traffic |
| **Contacts** | Local contacts list, pending offers, block/report |
| **Premium gifts** | Send 30-day Premium code via encrypted message |
| **Push** | Empty notification via provider token |

### Improvement Plan — Anonymous Messenger
| Priority | Task | Effort |
|----------|------|--------|
| 🟡 | Add contact search / filter | Low |
| 🟡 | Group anonymous chats | High |
| 🟢 | Message reactions | Low |

---

## 8. Sites (Mess&Anger) — `SitesScreen` ↔ **No Telegram Equivalent** 🆕

| Feature | Nova Implementation |
|---------|---------------------|
| **Views** | Sites list → Threads → Chat |
| **E2EE** | X25519 per-site, per-thread, per-message |
| **Widgets** | Embeddable chat widget for websites |
| **Bots** | Webhook + secret, OAuth tokens |
| **Analytics** | Daily stats (loaded, opened, first msg, owner replied, handoff) |
| **Handoff** | Transfer widget chat to messenger |

### Improvement Plan — Sites
| Priority | Task | Effort |
|----------|------|--------|
| 🟡 | Widget customization preview in settings | Medium |
| 🟡 | Canned responses / quick replies for owners | Medium |
| 🟢 | Visitor info (location, referrer, user agent) | Low |

---

## 9. Mesh Map — `MeshMapScreen` ↔ **No Telegram Equivalent** 🆕

| Feature | Nova Implementation |
|---------|---------------------|
| **Nodes** | Local + peer GPS, relay hops |
| **Links** | Mesh connections, latency |
| **Presence** | Opt-in heartbeat, online peers |
| **Privacy** | Hashing, TTL, disable |

---

## 10. Video Call — `VideoCallOverlay` + `P2PMediaCall` ↔ Telegram **Video Call**

| Area | Telegram | Nova | Status | Gap |
|------|----------|------|--------|-----|
| **1:1 call** | Voice / Video, switch camera, mute, flip, minimize pip | ✅ `VideoCallOverlay`, `P2PMediaCall`, mic/cam toggle, minimize | ✅ | Good |
| **Group call** | Up to 30/1000, screen share, raise hand | ❌ Not implemented | 🔴 | **Missing group calls** |
| **Screen share** | Share screen / window | ❌ Not implemented | 🔴 | **Missing screen share** |
| **Encryption** | E2EE (DTLS-SRTP) | ✅ WebRTC DTLS-SRTP via signaling | ✅ | Good |
| **Relay/TURN** | Automatic | ✅ TURN config in privacy settings | ✅ | Good |
| **Background blur** | Yes | ❌ Not implemented | 🟡 | **Missing background effects** |

---

## 11. Cross-Cutting Concerns

| Area | Telegram | Nova | Status | Gap |
|------|----------|------|--------|-----|
| **iOS/Android native** | Native apps | Web app (Tauri wrapper) | ⚠️ | **No true native iOS/Android yet** |
| **Push notifications** | Native APNs/FCM | Web Push + service worker (stub) | 🔴 | **No reliable native push** |
| **Background sync** | Yes | Service worker (limited) | 🔴 | **Messages don't arrive when closed** |
| **Multi-device** | Cloud sync (except secret chats) | Device linking + E2EE history sync | ⚠️ | **No cloud sync; manual linking only** |
| **Secret chats** | Device-specific, no cloud, self-destruct | All chats are E2EE + local-first | ✅ | **Nova: everything is "secret chat" equivalent** |
| **Data export** | JSON + HTML | Encrypted backup only | 🟡 | **No human-readable export** |
| **Account deletion** | Self-service | `clearLocalEncryptedData` in settings | ✅ | Good |
| **Accessibility** | Excellent | Basic ARIA, needs audit | 🔴 | **Major accessibility gaps** |
| **RTL support** | Full | CSS logical properties, but untested | 🟡 | **Needs RTL testing** |
| **Localization** | 20+ languages | en/ru only (i18n ready) | 🟡 | **Needs more translations** |

---

## Summary: Top 10 Critical Gaps vs Telegram

| # | Gap | Screen(s) | Effort | Impact |
|---|-----|-----------|--------|--------|
| 1 | **Text selection in chat bubbles** (copy, translate, select) | ChatScreen | Medium | 🔴 High — basic usability |
| 2 | **Granular notification settings** (per chat, per contact, exceptions) | SettingsModal | High | 🔴 High — power users |
| 3 | **Social privacy controls** (last seen, photo, calls, groups, phone, blocked) | SettingsModal + ProfileScreen | High | 🔴 High — privacy parity |
| 4 | **Swipe actions on chat rows** (pin, archive, mute, delete) | ChatsScreen | Low | 🔴 High — speed UX |
| 5 | **Long-press context menu on chat rows** | ChatsScreen | Low | 🔴 High — discoverability |
| 6 | **Select mode / bulk actions** (archive, delete, mute multiple) | ChatsScreen | Medium | 🔴 High — management |
| 7 | **Native push notifications** (APNs/FCM via Tauri) | App-wide | High | 🔴 High — background delivery |
| 8 | **Group video calls + screen share** | VideoCallOverlay | High | 🟡 Medium — feature parity |
| 9 | **Rich link previews** (OpenGraph cards) | ChatScreen | Medium | 🟡 Medium — content sharing |
| 10 | **Accessibility audit** (ARIA, focus, screen readers, dynamic type) | All screens | Medium | 🔴 High — inclusivity |

---

## Nova Advantages (Features Telegram Lacks)

| Feature | Screen | Value |
|---------|--------|-------|
| **Calendar ruler for channels** | ChannelScreen | Unique navigation, post density visualization |
| **P2P mesh map** | MeshMapScreen | Visualize mesh network topology |
| **Anonymous messenger** | AnonymousMessengerScreen | Metadata-resistant contacts |
| **Self-custody identity** | Onboarding + Security | No phone number, recovery phrase |
| **Device linking with E2EE history sync** | ProfileScreen | Encrypted history transfer |
| **Bot platform (L1/L2/L3, Mini Apps)** | SettingsModal + ChatScreen | Extensible bots with permissions |
| **Custom folders with badges** | ChatsScreen | User-defined organization |
| **One-handed FAB side toggle** | ChatsScreen + SettingsModal | Accessibility |
| **Local ad preferences + block advertisers** | SettingsModal | User-controlled ads |
| **Cover traffic / Tor / relay config** | SettingsModal | Network-level privacy |
| **Scheduled + silent send** | ChatScreen | Power user messaging |
| **Per-chat wallpaper + themes** | ChatScreen | Personalization |
| **Key rotation journal in chat** | ChatScreen | Transparency |
| **Mess&Anger widget platform** | SitesScreen | Website chat integration |

---

## Suggested Implementation Order

### Phase 1: Usability Polish (2-3 weeks)
1. Swipe actions on chat rows
2. Long-press context menu on chat rows
3. Text selection in chat bubbles
4. Double-tap ❤️ reaction
5. Reply preview bar (swipe-to-reply)

### Phase 2: Privacy & Notifications Parity (3-4 weeks)
6. Social privacy controls (last seen, photo, calls, groups, phone, blocked)
7. Granular notification settings
8. Per-contact notification settings in profile

### Phase 3: Native Capabilities (4-6 weeks)
9. Tauri mobile build + native push (APNs/FCM)
10. Background fetch / sync

### Phase 4: Advanced Features (ongoing)
11. Group calls + screen share
12. Rich link previews
13. Channel admin tools (pin, stats, admin management)
14. Accessibility audit
15. RTL + more languages

---

*This comparison is based on code review of Nova Dark Messenger (React/TypeScript/Tauri) vs Telegram behavior as of 2026. Telegram features referenced from public documentation and common knowledge.*