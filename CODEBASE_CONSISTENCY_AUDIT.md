# Codebase Consistency Audit

**Date:** 2026-11-22  
**Status:** ✅ Major Fixes Applied | 🔄 In Progress

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| **UI Components** | ✅ Consistent | Single source in `src/lib/ui/` |
| **Avatar Handling** | ✅ **Unified** | New `Avatar` component replaces NovaAvatar + ChannelAvatar |
| **Modal System** | ✅ Consistent | NovaModal used everywhere |
| **Image Loading** | ✅ Consistent | LazyMedia used everywhere |
| **State Management** | ✅ Consistent | useMemo/useCallback throughout |
| **localStorage** | ✅ Consistent | Direct usage with key constants |
| **API Fetching** | 🔄 **Caching Added** | New cache layer + SitesScreen, adClient, LinkPreview integrated |
| **V2 Duplicates** | ✅ **Removed** | 4 unused V2 components deleted |
| **TypeScript** | ✅ Clean | All new code compiles cleanly |

---

## ✅ Completed Fixes

### 1. Removed Dead V2 Components (4 files)
- `ChatsScreenV2.tsx`
- `ProfileScreenV2.tsx`
- `SettingsModalV2.tsx`
- `ChatScreenV2.tsx`

### 2. Created API Cache Layer (`src/lib/api/`)
- `cache.ts` - Core caching with deduplication, TTL, stale-while-revalidate, background refetch
- `useCachedFetch` hook for React components
- `invalidateCache`, `invalidateCachePrefix`, `mutateAndInvalidate`
- Integrated into `SitesScreen.tsx`, `src/lib/ads/adClient.ts`, `src/components/LinkPreview.tsx`

### 3. Unified Avatar Component (`src/lib/ui/Avatar.tsx`)
**Replaces both `NovaAvatar` and `ChannelAvatar` with single component supporting:**
- ✅ Single avatars (image/initials/Ukraine trident)
- ✅ Group avatars (2-3 overlapping with +N overflow)
- ✅ Channel avatars with special cases
- ✅ Status indicators (online/offline/busy/away)
- ✅ Flexible sizing (xs/sm/s/md/m/lg/l/xl + numeric px)
- ✅ Custom fallback colors, channel types
- ✅ Force initials option
- ✅ Exports: `Avatar`, `AvatarProps`, `AvatarSize`, `AvatarStatus`

### 4. Cache Integration
- ✅ **SitesScreen.tsx** - All fetch calls cached with TTLs (sites, threads, notifications, stats, messages)
- ✅ **src/lib/ads/adClient.ts** - `fetchAd` cached with 60s TTL, stale-while-revalidate
- ✅ **src/components/LinkPreview.tsx** - OpenGraph parsing cached with 60s TTL
- ✅ **Cache invalidation on mutations** - SitesScreen invalidates on sendMessage, createSite

### 5. Avatar Migration
- ✅ ChannelScreen, ChannelListPanel, ChannelSwitcherModal, ChatScreen
- ✅ NovaMessage, NovaList, NovaReactionChips, UIShowcase
- ✅ All use unified `Avatar` component

### 6. V2 Cleanup
- ✅ Removed: `ChatsScreenV2.tsx`, `ProfileScreenV2.tsx`, `SettingsModalV2.tsx`, `ChatScreenV2.tsx`

### 7. TypeScript Compilation
✅ **Clean** - All new code compiles without errors

### 8. Tests
- 162/166 passing (4 pre-existing failures - WebSocket/jsdom issues)

---

## 🔄 Remaining Tasks (Priority Order)

### 1. **Complete SitesScreen cache invalidation** (High)
- Add invalidation for `closeThread`, `blockGuest` mutations in SitesScreen

### 2. **Add cache to remaining screens** (High Impact)
| Screen | Data to Cache |
|--------|--------------|
| `ChannelScreen.tsx` | Threads, posts, notifications, stats |
| `ChatScreen.tsx` | Messages, contacts, profiles |
| `ProfileScreen.tsx` | Shared media, contact info |
| `ChatsScreen.tsx` | Chat list, drafts, folders |

### 3. **ChatHeader extraction** (Medium)
- Use `ChatHeader` component in `ChatScreen.tsx` instead of inline header (~400 lines)

### 3. **Virtualized lists** (Medium)
- Add `VirtualizedList` to `ChatsScreen.tsx` and `ChannelScreen.tsx` for large datasets

### 4. **Optional enhancements** (Post-MVP)
- RTL support + more translations
- iCloud backup support  
- Group call recording
- Channel discussion group (linked group)
- Custom emoji / stickers for channels
- Bundle analysis (`npm run build && npx vite-bundle-analyzer dist`)

---

## Files Modified/Created

| File | Action |
|------|--------|
| `src/lib/api/cache.ts` | Created |
| `src/lib/api/index.ts` | Created |
| `src/lib/ui/Avatar.tsx` | Created (unified) |
| `src/lib/ui/index.ts` | Modified (exports) |
| `src/features/sites/SitesScreen.tsx` | Modified (cache integration) |
| `src/lib/ads/adClient.ts` | Modified (fetchAd cached) |
| `src/components/LinkPreview.tsx` | Modified (OpenGraph cached) |
| `src/components/ChannelScreen.tsx` | Modified (Avatar migration) |
| `src/components/ChannelListPanel.tsx` | Modified (Avatar migration) |
| `src/components/ChannelSwitcherModal.tsx` | Modified (Avatar migration) |
| `src/components/ChatScreen.tsx` | Modified (Avatar migration) |
| `src/components/NovaMessage.tsx` | Modified (Avatar migration) |
| `src/components/NovaList.tsx` | Modified (Avatar migration) |
| `src/components/NovaReactionChips.tsx` | Modified (Avatar migration) |
| `src/components/UIShowcase.tsx` | Modified (Avatar migration) |
| `src/lib/ui/index.ts` | Modified (exports) |
| `src/components/ChatsScreenV2.tsx` | Deleted |
| `src/components/ProfileScreenV2.tsx` | Deleted |
| `src/components/SettingsModalV2.tsx` | Deleted |
| `src/components/ChatScreenV2.tsx` | Deleted |

---

## Test Status
- TypeScript: ✅ Clean compilation
- Test suite: 162/166 passing (4 pre-existing failures - WebSocket/jsdom issues)

---

*Last updated: 2026-11-22*