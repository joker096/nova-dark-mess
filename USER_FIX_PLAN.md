# Nova Dark Messenger — User-Driven Fix Plan

## Sprint 1: Critical UX Fixes (High Impact, Low Effort)

### 1. Onboarding - Add Skip Options & Reduce Steps
- [ ] **Seed phrase check**: Make "I've saved it" button skip the 3-word quiz
- [ ] **Backup step**: Add "Remind me later" option
- [ ] **Nickname paywall**: Show warning *before* user types short name
- [ ] **Progress indicator**: Show "Step X of Y" with time estimate

### 2. Chat List - Add Search & Quick Actions
- [ ] **Mobile**: Add search bar at top of chat list
- [ ] **Swipe actions**: Left swipe = Mark read / Mute / Archive / Delete
- [ ] **Jump to bottom**: Floating button when scrolled up in chat
- [ ] **Relative timestamps**: Hover message time → show "2h ago"

### 3. FAB Menu - Fix Duplication
- [ ] **Remove "Contacts" from FAB** (already in bottom nav)
- [ ] **Reorder**: New Chat, New Group, New Channel, New Contact
- [ ] **Add "New Contact" to bottom nav** as 5th tab option

### 4. Chat - Forward & Media Improvements
- [ ] **Forward modal**: Show "Recent" contacts first, then all
- [ ] **Inline media gallery**: Don't take fullscreen, use bottom sheet
- [ ] **Per-chat search**: Add search icon in chat header

### 5. Settings - Add Search
- [ ] **Settings search bar** at top of modal
- [ ] **Profile accessible** from main nav (desktop rail + mobile bottom)

---

## Sprint 2: Medium Impact Fixes

### 6. Onboarding - Progressive Disclosure
- [ ] **Collapsible sections**: Welcome → Language → Choose path → Details
- [ ] **Time estimates**: "~2 min" per step
- [ ] **Visual progress bar**: Steps with checkmarks

### 7. Unified Navigation
- [ ] **Single list with filter tabs**: All / Chats / Channels / Contacts
- [ ] **Desktop rail labels**: Show on hover instantly (0ms delay)
- [ ] **Mobile**: 5th tab for "More" (Settings, Profile, Mesh Map)

### 8. Voice Memo - Inline Recording
- [ ] **Record in composer**: Don't take over screen
- [ ] **Waveform in chat**: Preview before sending
- [ ] **Cancel by swipe**: Left to cancel, up to lock

### 9. Reaction Picker Speed
- [ ] **Instant show**: No 300ms delay on long-press
- [ ] **Frequent reactions**: Show 6 most used first
- [ ] **Custom reaction**: Quick access

---

## Sprint 3: Polish & Discovery

### 10. Discovery & Empty States
- [ ] **Mesh Map**: First-open overlay explaining purpose
- [ ] **Anonymous mode**: Hint in FAB menu
- [ ] **Empty chat list**: "Start chatting" with FAB pulse animation
- [ ] **Empty channels**: "Create your first channel" CTA

### 11. Notifications & Toasts
- [ ] **Toast stacking**: Queue with 50ms stagger, max 3 visible
- [ ] **Toast actions**: "Undo" for delete/archive
- [ ] **Sound preview**: Play on hover in settings

### 12. Language & Localization
- [ ] **Native names**: Show "Русский" not "Russian" in selector
- [ ] **RTL fixes**: Arabic layout mirroring
- [ ] **Plural forms**: Verify ru/uk plural rules work

### 13. Theme & Visual
- [ ] **No flash**: Pre-compute theme before paint
- [ ] **Haptic on web**: Gamepad API for vibration
- [ ] **Reduced motion**: Respect OS setting everywhere

---

## Dependencies & Blockers

| Task | Depends On | Blocker |
|------|------------|---------|
| Chat search | MessageList refactor | Virtualized list complexity |
| Inline media | VoiceMemoInput rewrite | Composer architecture |
| Unified nav | App.tsx restructure | Screen routing changes |
| Skip onboarding | Identity flow | Recovery phrase verification |

---

## Success Metrics (User-Centric)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Onboarding completion | >80% | Analytics: `onboarding_complete` |
| Time to first message | <3 min | `first_message_sent` timestamp |
| Chat search usage | >40% of users | `chat_search_opened` |
| Settings search usage | >20% | `settings_search_query` |
| Forward from recent | >60% | `forward_contact_source` |
| Jump-to-bottom clicks | >10/day/user | `jump_bottom_click` |

---

## Execution Order (This Session)

1. **Onboarding skips** - phrase check, backup, nickname warning
2. **Chat list search** (mobile) + jump-to-bottom
3. **FAB deduplication** - remove Contacts from FAB
4. **Forward modal** - recent contacts first
5. **Settings search** + Profile in nav
6. **Relative timestamps** on hover
7. **Toast stacking fix**
8. **Language native names**

Let's start.