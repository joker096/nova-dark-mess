# Nova Dark Messenger — User Feedback (Regular User Perspective)

## 🎯 Overall Impression
**Beautiful, feature-rich, but overwhelming for a regular person.** Feels like a developer's dream messenger - lots of power, but the learning curve is steep.

---

## ✅ What I LIKE (The Good)

### 1. **Visual Design - Premium Feel**
- Dark theme is gorgeous - the orange accent, gradients, glassmorphism
- Smooth animations, hover states, micro-interactions feel polished
- Custom chat wallpapers, message bubble colors - actually fun to customize
- Consistent design language throughout

### 2. **Privacy-First Architecture (Actually Works)**
- No phone number, no email required - just works
- Recovery phrase = your account, no server can reset it
- E2E encryption is default, not opt-in
- Biometric unlock works on web (WebAuthn) - impressive

### 3. **Rich Chat Features**
- Voice memos with slide-to-lock, waveform preview - best I've seen
- Reactions, replies, threads, polls, stickers, GIFs - all work
- Message editing/deletion, disappearing messages
- Sticker packs with favorites, categories, premium tiers

### 4. **Channels Are Actually Good**
- Not just a clone of Telegram - has stats, monetization, ads
- Scheduling posts, media gallery, comments
- Revenue sharing (50%) is a real incentive for creators
- Sponsored posts feel native, not spammy

### 5. **Multi-Account Support**
- Can have multiple identities on one device
- Switch instantly, each with own settings
- Great for work/personal separation

### 6. **Settings Depth**
- 6 organized tabs: General, Notifications, Privacy, Data, Advanced, About
- Granular notification controls per chat type
- Privacy scopes (Everyone/Contacts/Nobody) for each data point
- Tor, TURN, multi-relay for advanced users

---

## ❌ What I DON'T LIKE (The Pain Points)

### 🔴 **Critical - First Experience**

| Issue | Impact | Details |
|-------|--------|---------|
| **Onboarding is 7-8 steps** | High | Welcome → Language → Create/Restore → Nickname → Seed phrase display → Phrase check (3 words) → PIN → Backup. Too long for "just trying it out" |
| **No skip option for phrase check** | Medium | Forced to pick 3 words from grid - feels like a test, not verification |
| **Short nickname = $50 paywall** | High | If you pick `@john` (4 chars) you hit a payment screen. Not obvious upfront |
| **Backup is mandatory step** | Medium | Can't finish onboarding without creating backup file. Overwhelming for new users |
| **Language selection on step 2** | Low | Why not on welcome screen with flag icons? |

### 🔴 **Critical - Daily Usage**

| Issue | Impact | Details |
|-------|--------|---------|
| **FAB menu is confusing** | High | The floating action button opens a menu with New Chat, New Group, New Channel, New Contact - but "Contacts" is also a bottom tab. Duplicate, confusing |
| **No search in chat list** | High | On mobile, no way to search conversations. Have to scroll |
| **Message timestamps hard to read** | Medium | "14:32" format, no relative time ("2h ago") on hover |
| **No mark-as-read on swipe** | Medium | Have to open chat, read, go back. No quick action |
| **Voice memo UI is modal** | Medium | Recording takes over screen - can't see chat while recording |
| **Reaction picker too slow** | Low | Long-press → wait → picker appears → pick. Should be instant |

### 🟡 **Annoying - Navigation & UX**

| Issue | Impact | Details |
|-------|--------|---------|
| **Desktop rail: 5 icons, no labels** | Medium | Hover shows tooltip but takes 300ms. Mobile users on desktop = confused |
| **Settings modal is huge** | Medium | 6 tabs, each with 10+ options. No search within settings |
| **Channels vs Chats separation** | Medium | Two separate lists, different UIs. Why not unified? |
| **Anonymous mode hidden in FAB** | Low | Most users won't discover it |
| **Mesh Map in rail but no onboarding** | Low | Opens map with demo nodes - looks cool but "so what?" |
| **Profile screen buried** | Medium | Have to go Settings → Profile or click avatar in rail |

### 🟡 **Annoying - Chat Details**

| Issue | Impact | Details |
|-------|--------|---------|
| **No "jump to bottom" button** | High | In long chats, stuck at top after opening |
| **Media gallery opens fullscreen** | Medium | Can't browse inline, have to close to continue chat |
| **Sticker picker covers chat** | Medium | Bottom sheet takes 80% screen, can't see context |
| **No message search within chat** | High | Only global search, not per-conversation |
| **Forwarding = modal with full contact list** | Medium | Slow, no recent/frequent contacts first |

### 🔵 **Minor Polish**

| Issue | Impact | Details |
|-------|--------|---------|
| **Toast notifications stack weirdly** | Low | Multiple toasts overlap, hard to read |
| **Language names in English** | Low | In Russian UI, "English" shows as "English" not "Английский" |
| **No haptic feedback on web** | Low | Works on mobile/Tauri but not browser |
| **Theme switch flashes** | Low | Switching dark/light causes brief white flash |
| **CSP errors in console** | Dev | `style-src 'unsafe-inline'` - not user-facing but sloppy |

---

## 📊 Priority Matrix (User Impact × Effort)

```
HIGH IMPACT, LOW EFFORT (Do First):
├── Add "Skip" to phrase check / backup step
├── Add jump-to-bottom button in chat
├── Show relative timestamps on hover
├── Add search to chat list (mobile)
├── Fix FAB duplication (Contacts tab vs FAB menu)
├── Make nickname paywall obvious earlier
├── Add "recent contacts" to forward modal
└── Quick mark-as-read on chat swipe

HIGH IMPACT, MEDIUM EFFORT:
├── Collapsible onboarding (progressive disclosure)
├── Unified chat/channels list with filter tabs
├── Inline media gallery (not fullscreen)
├── Per-chat message search
├── Settings search
└── Profile accessible from main nav

MEDIUM IMPACT:
├── Voice memo inline recording
├── Reaction picker speed
├── Better empty states (show actions)
├── Toast stacking fix
├── Language native names
└── Theme switch without flash

LOW IMPACT (Nice to Have):
├── Haptic on web (Gamepad API?)
├── Mesh Map onboarding
├── Anonymous mode discovery
├── Custom reaction emojis
└── Keyboard shortcuts help overlay
```

---

## 🎯 My Verdict as a User

**Would I use this daily?** 
- **Yes, if** I'm privacy-conscious and willing to invest 10 min setup
- **No, if** I just want "WhatsApp but private" - too much friction

**Biggest blocker:** Onboarding length + no chat search + FAB confusion

**Killer feature that keeps me:** Voice memo UX + multi-account + channel monetization

---

## 💡 One-Sentence Summary
*"A Ferrari engine in a car with a confusing dashboard - powerful but needs UX sandpaper."*