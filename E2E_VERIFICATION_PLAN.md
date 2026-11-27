# Nova Dark Messenger - E2E Verification Plan

## Overview
Comprehensive end-to-end verification cycle with checkpoints for user review/rollback.

## Checkpoints

### CP1: Dev Server & Basic Load
- [ ] Server starts on http://127.0.0.1:3001
- [ ] HMR WebSocket connects (no console errors)
- [ ] No JS errors on initial load
- [ ] Service worker registers (prod) / clears (dev)
- [ ] CSP headers present

### CP2: Onboarding Flow
- [ ] Fresh install → "Create account" → nickname → seed phrase → backup → PIN → done
- [ ] Fresh install → "Restore from backup" → seed phrase → PIN → done
- [ ] PIN setup: 4-digit, confirm, lock on hide
- [ ] Biometric unavailable state shown correctly
- [ ] Language selection works

### CP3: Main Navigation
- [ ] Bottom nav / sidebar: Chats, Channels, Contacts, Settings
- [ ] Desktop rail: Chats, Channels, Folders, Mesh Map, Settings
- [ ] Tab switching preserves state
- [ ] Deep links: nova://chat/..., nova://channel/...

### CP4: Chat Functionality
- [ ] 1:1 chat: send text, emoji, sticker, GIF
- [ ] Media: photo, video, file, voice memo, location, contact, poll
- [ ] Voice memo: tap/hold, slide to lock/cancel, waveform preview
- [ ] Message actions: reply, forward, copy, edit, delete, pin, react
- [ ] Disappearing messages / view-once / silent send
- [ ] Group chat: add/remove members, admins, join requests
- [ ] Video/voice call: connect, mute, camera, screen share

### CP5: Channel Features
- [ ] Create channel (public/private), invite code
- [ ] New post: title, text, image, schedule
- [ ] Post actions: react, comment, share, forward, save, edit, delete
- [ ] Statistics: views, subscribers, reactions, revenue
- [ ] Discussion group link
- [ ] Admin management

### CP6: Settings
- [ ] General: theme, language, font size, chat colors, wallpaper
- [ ] Notifications: per-chat-type defaults, sounds, vibration, preview
- [ ] Privacy: last seen, profile photo, about, blocked users, metadata minimization
- [ ] Security: PIN, biometric, 2FA, lock on hide, session management
- [ ] Data: storage usage, cache clear, export/import backup, Google Drive
- [ ] Advanced: relay endpoints, TURN servers, Tor, multi-relay

### CP7: Advanced Features
- [ ] Biometric unlock: enable, register, verify, disable
- [ ] P2P: mesh map, live location, direct connect
- [ ] Anonymous mode: create queue, invite, messaging
- [ ] Bots: install, permissions, mini apps
- [ ] Communities: create, channel + discussion group

### CP8: Mobile/Responsive + A11y
- [ ] Viewport 375px / 768px / 1440px
- [ ] Touch targets ≥ 44px
- [ ] Focus visible, skip link, ARIA labels
- [ ] Reduced motion respected
- [ ] Safe area insets (notch, home indicator)

### CP9: Localization
- [ ] Russian (default) - all strings translated
- [ ] English - all strings translated
- [ ] 18 other locales - key namespaces present
- [ ] RTL support (Arabic)
- [ ] Plural forms correct (ru: one/few/many)

---

## Execution Protocol
1. Start at CP1, verify each item
2. At each checkpoint: **PAUSE** → user reviews → `continue` / `fix` / `rollback`
3. Fix issues before proceeding
4. Document all findings

---

## Rollback Points
- `git stash` before each major fix
- Tag: `verify-cp{N}-start`, `verify-cp{N}-fixed`