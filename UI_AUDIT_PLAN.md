# Nova Dark Messenger — Comprehensive UI Audit Plan

**Goal:** Press every button, verify logical layout of buttons in windows and on screen, and validate the logic of button placement and subsequent button presses. Everything must be maximally logical — no extra buttons, no missing ones. Logic is everything.

---

## 1. App-Level Navigation Structure (App.tsx)

### 1.1 Desktop Layout (≥768px)
| Area | Element | Action | Expected Behavior | Logical Grouping |
|------|---------|--------|-------------------|------------------|
| **Left Rail** | Chats icon (MessageSquare) | Click | Switch to `chat` screen, set activeChatId='katie' | Primary nav — top |
| | Channels icon (Radio) | Click | Open Channel list via `openChannel()` | Primary nav — second |
| | Folders icon (Folder) | Click | Open FolderModal via `foldersRef.current.openFolderModal()` | Primary nav — third |
| | Settings icon (Settings) | Click | Open SettingsModal (`setIsSettingsOpen(true)`) | Secondary nav — bottom |
| | User Avatar | Click | Open own ProfileScreen (`openProfile(account.id)`) | Secondary nav — bottom |

| **Left Column** (320-360px) | ChatsScreen (always mounted) | — | Chat list, folders, stories, search | Persistent sidebar |
| | ChannelListPanel (overlay when `isDesktopChannelActive`) | — | Channel list, create, toggle popular, delete | Overlay on sidebar |

| **Main Stage** (flex-1) | `channel` → ChannelScreen | — | Channel feed, header, date scrubber | Content |
| | `profile` → ProfileScreen | — | Profile details, media/files/links/voice tabs | Content |
| | `analytics` → AnalyticsScreen | — | Charts, stats | Content |
| | `sites` → SitesScreen | — | Widget sites management | Content |
| | `mesh-map` → MeshMapScreen | — | Map with nodes/links, back button | Content |
| | `anonymous` → AnonymousMessengerScreen | — | Anonymous chat, invite handling | Content |
| | `chat`/`chats` → ChatScreen | — | Messages, composer, header actions | Content |

| **Thread Sidebar** (conditional) | ThreadSidebar | — | Opens when `activeThreadRootId` set in chat | Right panel |

### 1.2 Mobile Layout (<768px)
| Area | Element | Action | Expected Behavior |
|------|---------|--------|-------------------|
| **BottomNav** | Chats tab (MessageSquare) | Tap | `setActiveBottomTab('chats')` → ChatsScreen |
| | Contacts tab (Users) | Tap | `setActiveBottomTab('contacts')` → AnonymousMessengerScreen |
| | Channels tab (Radio) | Tap | `setActiveBottomTab('channels')` → ChannelListPanel → ChannelScreen |
| | Profile tab (User) | Tap | `setActiveBottomTab('profile')` → ProfileScreen |
| | Premium tab (Sparkles) | Tap | `setActiveBottomTab('premium')` → CryptoCheckoutModal |
| **FAB** (floating) | Plus button | Tap | Open FAB menu (New Chat, New Group, Import VCF, Move FAB side) |
| | FAB menu item | Tap | Execute action, close menu |

### 1.3 Modals/Overlays (Both)
| Modal | Trigger | Close Action |
|-------|---------|--------------|
| SettingsModal | Settings icon (rail), Header menu (mobile), Profile "More" | `setIsSettingsOpen(false)`, backdrop click, Escape |
| CryptoCheckoutModal | Premium tab, Premium chip in Settings, Settings → Premium | `setIsPremiumOpen(false)` |
| OnboardingWizard | First launch (`!onboardingDone`) | `setOnboardingDone(true)` |
| PinLockScreen | App locked (`isLocked && pinHash`) | `unlock()` |
| SanctionGate | Sanctioned account | — |
| JoinRequestNotice | Incoming join request (relay) | Auto-dismiss 8s, or "Open" → navigate to chat |
| Pending Invite Dialog | Deep link with `?invite=` | Decline / Accept (markJoinPending + navigate) |

---

## 2. ChatsScreen (src/components/ChatsScreen.tsx)

### 2.1 Header Bar
| Button | Location | Action | Logic Check |
|--------|----------|--------|-------------|
| Search icon (mobile) | Top-right | Focus search input | Mobile only — correct |
| Menu icon (MoreVertical, mobile) | Top-right | Open header menu | Mobile only — correct |
| Settings icon (desktop) | Top-right | `onOpenSettings()` | Desktop only — correct |

### 2.2 Search Bar (Prominent)
| Element | Action | Logic |
|---------|--------|-------|
| Search input | Type → real-time filter chats + messages | Debounced? No — instant |
| Clear (X) | Click → clear query | Shows only when query exists |
| ⌘K hint | Keyboard shortcut | Cmd/Ctrl+K focuses input |

### 2.3 Quick Search Chips
| Chip | Action | Logic |
|------|--------|-------|
| Each chip (Katie, Harry's, Sunday, Thailand, dinner, photos, flight) | Click → setSearchQuery(chip) | Predefined queries, highlight active |
| Reset button | Click → clear search | Shows only when search active |

### 2.4 Search Results View (when searching)
| Filter Pill | Action | Logic |
|-------------|--------|-------|
| All (totalResults) | Click → setSearchFilter('all') | Shows chats + messages count |
| Chats (matchedChats.length) | Click → setSearchFilter('chats') | Contact name / snippet match |
| Messages (matchedMessages.length) | Click → setSearchFilter('messages') | Deep history search via index |

### 2.5 Normal View — Stories Row
| Button | Action | Logic |
|--------|--------|-------|
| Add Story (+) | Click → `setIsStoryComposerOpen(true)` | First in row |
| Story card | Click → `setStoryViewerIndex(index)` | View story, mark read |

### 2.6 Chat List (Filtered by Active Folder)
| Element | Action | Logic |
|---------|--------|-------|
| Pull-to-refresh | Drag down >60px → trigger refresh | Haptic at 60px, refresh at release |
| Folder swipe | Horizontal swipe ≥64px → switch folder | Left = next, Right = prev |
| Chat row | Click → `handleChatClick` (mark read, navigate) | Channel → openChannel, else selectChat |
| Chat row long-press (500ms) | Open context menu at touch position | Haptic feedback |
| Select Mode toggle (header menu) | Toggle checkboxes on all rows | Bulk actions appear at bottom |
| Checkbox (select mode) | Toggle individual selection | Updates selectedChatIds |
| Archive button (per row) | Click → `handleArchiveToggle` | Toggle archivedChatIds, auto-switch folder |
| Pin button (per row) | Click → `handlePinToggle` | Toggle pinnedChatIds |
| Join request approve/reject (admin) | Click → `handleJoinDecision` | Updates relay, shows toast |

### 2.7 Empty Folder State
| Button | Action |
|--------|--------|
| Manage Folder Chats | Open FolderModal for current folder |
| Create New Chat | Open newChatModal |
| Invite Contact | `onOpenAnonymous()` |

### 2.8 Select Mode (Bulk Actions Bar)
| Button | Action |
|--------|--------|
| Select All | Select all visible chats |
| Archive | Bulk archive selected |
| Delete | Bulk delete + archive selected |
| Mute (1hr) | Bulk mute selected |
| Pin | Bulk pin selected |

### 2.9 Modals (triggered from ChatsScreen)
| Modal | Trigger | Key Buttons Inside |
|-------|---------|-------------------|
| StoryComposerModal | Add Story button, New Chat → Story | Publish, Cancel |
| New Chat Modal | Header menu → New Chat, Empty folder → Create | Add Contact, Katie Rogers, Create Group, Import VCF, Cancel |
| GroupModal | New Chat → Create Group | Create, Cancel, member management |
| FolderModal | Folders icon (rail), Header menu → Folders, Empty folder | Save, Delete, Cancel, chat assignment |
| Context Menu (long-press) | Chat row long-press | Pin/Unpin, Archive/Unarchive, Mute, Delete |

---

## 3. ChatScreen (src/components/ChatScreen.tsx) — Most Complex

### 3.1 Header (ChatHeader component)
| Button | Action | Logic |
|--------|--------|-------|
| Back (ArrowLeft) | `onBack()` | Navigate back in history |
| Avatar/Name | `onOpenProfile()` | Open ProfileScreen |
| Search icon | `setIsSearchOpen(true)` | In-chat search |
| Video Call | `handleStartVideoCall()` | WebRTC call via signaling |
| Voice Call | `handleStartVoiceCall()` | WebRTC audio call |
| Group Call (group) | `handleStartGroupCall()` | GroupCallManager |
| More (MoreVertical) | Open `isMoreMenuOpen` menu | Contextual menu |
| Wallpaper | `setIsWallpaperModalOpen(true)` | WallpaperSettingsModal |
| Pinned messages | `setIsPinnedCarouselOpen(true)` | Carousel of pinned |
| Protection (Lock) | `handleOpenProtection()` | E2EE verification card |

### 3.2 More Menu (NovaMenu)
| Item | Action | Condition |
|------|--------|-----------|
| Search in chat | `setIsSearchOpen(true)` | Always |
| Shared Media | `setActiveHeaderTab('gallery')` | Always |
| Pinned Messages | `setIsPinnedCarouselOpen(true)` | Has pinned |
| Wallpaper | `setIsWallpaperModalOpen(true)` | Always |
| Chat Theme (cycle) | `handleCycleChatTheme()` | Premium gates non-default |
| Notifications | `toggleChatNotifications()` | Toggle bell icon |
| Disappearing Messages | Cycle: Off → 24h → 7d → 1m | `setDisappearAfter` |
| View Once Mode | Toggle `viewOnceMode` | Self-destruct after view |
| Clear History | Confirm → wipe messages | Destructive |
| Block / Report (bot) | `setIsBlockBotConfirm` / `setIsReportBotOpen` | Bot chats only |
| Unblock Bot | `setBotBlocked(false)` | Blocked bots |

### 3.3 In-Chat Search Bar (when open)
| Element | Action |
|---------|--------|
| Search input | Filter messages in real-time |
| Filter: Context / Filtered | Toggle `searchFilterMode` |
| Prev/Next match | `handlePrevMatch` / `handleNextMatch` |
| Quick chips | Suggested search terms |
| Close (X) | `handleCloseSearch` |

### 3.4 Message List Interactions
| Gesture | Action | Threshold |
|---------|--------|-----------|
| Long press (400ms) | Open reaction picker at touch pos | Haptic |
| Swipe right ≥42px | Reply to message | Haptic at 42px |
| Double tap (320ms) | Quick ❤️ reaction | `handleSelectReaction` |
| Tap (forward mode) | Toggle forward selection | `handleToggleForwardSelect` |

### 3.5 Reaction Picker (NovaReactionPicker)
| Button | Action |
|--------|--------|
| 8 emoji options | `handleSelectReaction(msgId, emoji)` |
| + (more) | Open full emoji picker? |

### 3.6 Message Context Menu (Long press → NovaContextMenu)
| Item | Action | Condition |
|------|--------|-----------|
| Reply | `handleReplyMessage` | Always |
| Forward | `handleStartForward` | Always |
| Copy | `handleCopyMessage` | Has text |
| Translate | `handleTranslateMessage` | Has text |
| Pin/Unpin | `handleTogglePinMessage` | Always |
| Edit | `handleStartEdit` | Own message |
| Delete | `handleDeleteMessage` | Always (forEveryone default) |

### 3.7 Forward Selection Mode
| Element | Action |
|---------|--------|
| Checkboxes on messages | Toggle selection |
| Forward button (bottom) | `handleOpenForwardModal` |
| Cancel | `handleCancelForward` |
| Forward Modal → Select chat | `handleForwardToChat(targetChatId)` |

### 3.8 Composer Bar (Bottom)
| Button | Action | Long Press |
|--------|--------|------------|
| Attachment (Paperclip) | Toggle `isAttachmentMenuOpen` | — |
| Emoji (Smile) | Toggle `isEmojiPickerOpen` | — |
| Mic / Send | Hold 450ms → Send Options sheet | `handleSendPointerDown/Up` |
| Send (tap) | `handleSendMessage()` | — |

### 3.9 Attachment Menu
| Item | Action | Modal Opened |
|------|--------|--------------|
| Photo/Video (ImageIcon) | `setIsFileModalOpen(true)` | FileSelectionModal |
| Document (FileText) | `setIsFileModalOpen(true)` | FileSelectionModal |
| Poll (BarChart2) | `setIsPollModalOpen(true)` | PollCreateModal |
| Location (MapPin) | `setIsLocationModalOpen(true)` | LocationPickerModal |
| Sticker (Sparkles) | `setIsStickerDrawerOpen(true)` | StickerPickerDrawer |
| Voice (Mic) | `voiceMemoRef.startRecording()` | VoiceMemoInput (inline) |

### 3.10 Send Options Sheet (Long-press Send)
| Option | State | Action |
|--------|-------|--------|
| Send Silently | `sendSilently` toggle | No notification sound |
| Schedule Message | — | `setIsScheduleModalOpen(true)` → ScheduleMessageModal |
| Disappearing | Cycle Off/24h/7d/1m | `setDisappearAfter` |
| View Once | `viewOnceMode` toggle | Self-destruct |

### 3.11 Modals/Sheets (from ChatScreen)
| Modal | Trigger | Key Buttons |
|-------|---------|-------------|
| WallpaperSettingsModal | Header → Wallpaper, More → Wallpaper | Select, Intensity slider, Cycle, Close |
| ScheduleMessageModal | Send Options → Schedule | Date/time picker, Schedule, Cancel |
| VideoCallOverlay | Header → Video Call, Incoming call | Accept, Decline, Minimize, End, Mute, Camera toggle |
| GroupVideoCallOverlay | Header → Group Call | Similar + participants |
| FileSelectionModal | Attachment → Photo/Document | Select files, Send, Cancel |
| PollCreateModal | Attachment → Poll | Create poll options, Publish, Cancel |
| LocationPickerModal | Attachment → Location | Pick on map, Send, Cancel |
| StickerPickerDrawer | Attachment → Sticker, Emoji → Stickers tab | Send sticker, Insert as text, Close |
| MiniAppIframe | Bot web_app button | Open, Close |
| CommandMenu | Type `/` in composer | Select command, Execute |
| SharedMediaSection | Header → Shared Media | Grid view, Jump to message |
| Pinned Messages Carousel | Header → Pinned, Message menu → Pin | Prev/Next, Jump, Close, Unpin |
| Protection Card (E2EE) | Header → Protection, More → Encryption | Verify, Copy safety number, Close |
| Bot Report Sheet | More → Report Bot | Select reason, Submit, Cancel |
| Bot Block Confirm | More → Block Bot | Confirm, Cancel |
| Media Lightbox | Tap media in chat | Prev/Next, Zoom, Download, Close |
| VoiceMemoInput | Attachment → Voice, Mic long-press | Record, Cancel, Send, Delete |

---

## 4. SettingsModal (src/components/SettingsModal.tsx) — 6 Tabs

### 4.1 Header
| Button | Action |
|--------|--------|
| Premium chip | `setPremiumSheetOpen(true)` |
| Close (X) | `onClose()` |

### 4.2 Tabs (SettingsTabs)
| Tab | Icon | Key Sections |
|-----|------|--------------|
| General | SlidersHorizontal | Language, Theme, Font Size, Hand, Sound Mode, Privacy Preset, Chat Colors |
| Notifications | Bell | Notification Matrix (4 rows), Apply All, Global Toggles (Preview, Vibration, Push), Muted/Priority counts |
| Privacy | Shield | Privacy Preset (Segmented), Who Sees (5 rows), Network Grid (Metadata, Hide IP, Tor, Relays, TURN, Presence), Mesh Map, Blocked Users |
| Security | Lock | Secure Storage warning, Passcode Lock, Biometric, 2FA, Seed Phrase, Accounts |
| Data | Database | Auto-download, Storage Usage (bar + expand), Clear Cache, Export Data, Backup (Export/Import/Google Drive), Danger Zone (Delete All) |
| More | LayoutGrid | Join Requests, Bots, Analytics, Widgets, Ads, Moderation, Footer (Terms, Privacy, Rerun Setup) |

### 4.3 General Tab — Cycle Buttons (IconCycleButton)
| Button | Cycles | Premium Gate |
|--------|--------|--------------|
| Theme | Light → Dark → System | No |
| Font Size | Small → Medium → Large | No |
| Hand (FAB side) | Right ↔ Left | No |
| Sound Mode | Sound → Vibration → Silent | Long-press opens Melody Sheet |

### 4.4 General Tab — Tiles
| Tile | Action | Sheet/Modal |
|------|--------|-------------|
| Language | `setLanguageSheetOpen(true)` | LanguageSheet (3 langs) |
| Privacy Preset | `setPrivacyPresetSheetOpen(true)` | PrivacyPresetSheet (Basic/Enhanced/Maximum/Custom) |
| Chat Colors | Radio buttons (4) | Default free, Sapphire/Amethyst/Emerald = Premium |

### 4.5 Notifications Tab
| Element | Action |
|---------|--------|
| 4 IconCycleButtons (Private, Groups, Channels, Bots) | Cycle: All → Mentions → None |
| Apply All button | Set all 4 to "All" |
| IconToggles (Preview, Vibration, Push) | Toggle boolean prefs |
| Muted Contacts tile | Show count, click → toast |
| Priority Contacts tile | Show count, click → toast |

### 4.6 Privacy Tab
| Element | Action |
|---------|--------|
| IconSegmented (Basic/Enhanced/Maximum) | `applyPrivacyPreset()` |
| 5 IconCycleButtons (Last Seen, Profile Photo, Calls, Groups, Phone) | Cycle: Everyone → Contacts → Nobody |
| IconToggles (Metadata Minimization, Hide IP, Tor, Presence) | Toggle privacyPrefs |
| Relays tile | `setRelaysSheetOpen(true)` → RelaysSheet (add/remove) |
| TURN Servers tile | `setTurnSheetOpen(true)` → TurnSheet (add/remove) |
| Mesh Map tile | `onOpenMeshMap()` + close settings |
| Blocked Users tile | `setBlockedUsersOpen(true)` |

### 4.7 Security Tab
| Element | Action | Condition |
|---------|--------|-----------|
| Passcode Lock (IconToggle) | `handleTogglePin()` + `setPinSheetOpen(true)` | — |
| Biometric (IconToggle) | `handleToggleBiometric()` | Requires PIN + hardware support |
| 2FA (IconToggle) | `setTwoFactorSheetOpen(true)` | — |
| Seed Phrase tile | `setRecoveryGateOpen(true)` | Requires identity |
| Accounts tile | `setAccountSwitcherOpen(true)` | — |

### 4.8 Data Tab
| Element | Action |
|---------|--------|
| Auto-download (IconToggle) | Toggle `prefs.autoDownload` |
| Storage bar | Visual breakdown, expand for details |
| Clear Cache | `handleClearCache()` → toast |
| Export Data | `handleExportMyData()` → downloads JSON |
| Export Backup | Open backup modal (export mode) |
| Import Backup | Open backup modal (import mode) |
| Google Drive | `setDriveSheetOpen(true)` → DriveSheet (connect/backup/restore) |
| Delete All | `setDeleteSheetOpen(true)` → HoldToConfirm + PIN |

### 4.9 More Tab
| Tile | Action | Condition |
|------|--------|-----------|
| Bots | `setBotsOpen(true)` | `getBotSession` exists |
| Analytics | `setAnalyticsSheetOpen(true)` | — |
| Widgets | `onOpenSites()` + close | `onOpenSites` prop |
| Ads | `setAdsSheetOpen(true)` | — |
| Join Requests | Retry outbox | `joinOutboxCount > 0` |
| Moderation | `setModerationOpen(true)` | — |

### 4.10 Sheets/Modals (from Settings)
| Sheet | Trigger | Key Buttons |
|-------|---------|-------------|
| LanguageSheet | Language tile | Select language (3), Close |
| MelodySheet | Sound Mode long-press | 12 sounds + preview, Select |
| PremiumSheet | Premium chip, Premium tile | Upgrade (checkout), Crypto, Close |
| PrivacyPresetSheet | Privacy Preset tile/segmented | Basic/Enhanced/Maximum buttons |
| WhoSeesSheet | Who Sees rows (5) | Everyone/Contacts/Nobody radios |
| RelaysSheet | Relays tile | Add relay (URL + operator), Remove |
| TurnSheet | TURN tile | Add TURN (url, user, pass), Remove |
| TorSheet | Tor toggle | Check Tor, Toggle |
| PresenceSheet | Presence toggle | Sharing + Hashing + TTL |
| AnalyticsSheet | Analytics tile | Event counts, Export crashes, Clear crashes |
| AdsSheet | Ads tile | Hidden campaigns, Blocked advertisers |
| DriveSheet | Google Drive tile | Connect, Backup, Refresh, Restore, Delete |
| PinSheet | Passcode toggle | Create/Verify/Remove PIN, Length, Lock on hide |
| TwoFactorSheet | 2FA toggle | Setup TOTP, Activate, Disable |
| RecoveryGate | Seed Phrase tile | Show phrase, Copy, Close |
| DeleteSheet | Delete All tile | HoldToConfirm (3s), PIN verify, Erase |
| AccountSwitcher | Accounts tile | Switch account, Add account, Remove |
| BotsModal | Bots tile | List installed, Toggle enable, Block, Uninstall, Install (builtin/file/dev) |
| InstallModal | Install bot | Permissions checklist, Confirm, Cancel |
| DevRegistryModal | Bots → Create Local Bot | Name, Username, Desc, Create |
| LegalModal | Footer Terms/Privacy | Scroll, Close |
| ModerationModal | Moderation tile | Report review, actions |

---

## 5. BottomNav (src/components/BottomNav.tsx) — Mobile Only

### 5.1 Tab Bar (5 tabs)
| Tab | Icon | Label | Badge | Action |
|-----|------|-------|-------|--------|
| Chats | MessageSquare | Chats | unreadChats | `onTabChange('chats')` |
| Contacts | Users | Contacts | unreadContacts | `onTabChange('contacts')` |
| Channels | Radio | Channels | unreadChannels | `onTabChange('channels')` |
| Profile | User | Profile | — | `onTabChange('profile')` |
| Premium | Sparkles | Premium | — | `onTabChange('premium')` |

### 5.2 Folder Strip (when activeTab === 'chats')
| Element | Action |
|---------|--------|
| Folder chips | `selectChatFolder(folder.id)` + switch to chats tab |
| Folder + button | `requestFolderManager()` → FolderModal |
| Edge fades (ChevronLeft/Right) | Visual only — indicate scroll |

### 5.3 FAB (Floating Action Button)
| State | Button | Menu Items (on tap) |
|-------|--------|---------------------|
| Closed | Plus (rotates 45° when open) | — |
| Open | New Chat (UserPlus) | `onNewChat()` → close |
| | New Group (Users) | `onNewChat()` → close |
| | Import VCF (Upload) | Trigger hidden file input |
| | Move FAB Side (Hand) | `moveFabToOtherSide()` → saveFabSide |

---

## 6. ChannelScreen (src/components/ChannelScreen.tsx)

### 6.1 Header Card (collapsible)
| Element | Action |
|---------|--------|
| Back (mobile) | `onBack()` |
| Channel avatar/name | `setSwitcherOpen(true)` → ChannelSwitcherModal |
| Search | `setSearchOpen(true)` |
| Subscribe/Bell | Toggle subscription → then notifications |
| Discussion Group | `openDiscussionGroup()` → dispatch `nova:open-chat` |
| More (MoreVertical) | NovaMenu with contextual items |

### 6.2 More Menu (NovaMenu)
| Item | Action | Condition |
|------|--------|-----------|
| Share Channel | `handleShareChannel()` | Always |
| Switch Channel | `setSwitcherOpen(true)` | Always |
| Sound On/Off | `toggleSound()` | `onToggleSound` prop |
| Show/Hide Calendar | `toggleHeader()` | Premium (`date_picker`) |
| Show/Hide Subscriber Count | `onToggleSubscriberPrivacy()` | Owned channel |
| Statistics | `openStats()` → `setStatsPanelOpen(true)` | Owned + `onOpenStats` |
| Manage Admins | `openAdmins()` → `setAdminsPanelOpen(true)` | Owned + `onManageAdmins` |
| Discussion Group | Set/Edit linked group | Owned + `onSetDiscussionGroup` |
| Unsubscribe/Subscribe | `toggleSubscription()` | Separator, destructive |

### 6.3 Date Scrubber (when header expanded)
| Element | Action |
|---------|--------|
| Prev Month (ChevronLeft) | `shiftMonth(-1)` |
| Month Label (button) | `handleJumpToMonth()` → MonthPicker (Premium) |
| Today button | `goToday()` → set selectedDay=now |
| Next Month (ChevronRight) | `shiftMonth(1)` |
| MonthPicker | Year nav, Month grid, Close |

### 6.4 Search Bar (when open)
| Element | Action |
|---------|--------|
| Search input | Filter posts by title/text |
| Filter pills (All/Photos/Videos/Links/Files) | `setSearchFilter()` |
| Date From/To inputs | `setSearchDateFrom/To` |
| Close (X) | `closeSearch()` |

### 6.5 Post List
| Interaction | Action |
|-------------|--------|
| Tap post | Open PostCommentsSheet (`setCommentingPostId`) |
| Double-tap | Quick ❤️ reaction (`handleToggleReaction`) |
| Long-press | Post menu (NovaMenu) |
| Reaction pill | `handleToggleReaction(postId, emoji)` |
| Share post | `handleSharePost(postId)` → copy deep link |
| Post Menu (MoreVertical) | Pin/Unpin, Edit, Delete, Report, Share, Copy link |

### 6.6 Post Composer Modal
| Button | Action |
|--------|--------|
| Publish | `handlePublishPost(draft)` → `onCreatePost`/`onEditPost` |
| Schedule | Set `scheduledFor` timestamp |
| Attach media | FileSelectionModal |
| Poll | PollCreateModal |
| Cancel | Close |

### 6.7 Stats Panel (Owned channels)
| Element | Action |
|---------|--------|
| Period selector (7d/30d/all) | `setStatsPeriod` → refetch ad stats |
| Ad stats | `fetchAdStats` → impressions, clicks, revenue |
| Close | `setStatsPanelOpen(false)` |

### 6.8 Admins Panel (Owned channels)
| Element | Action |
|---------|--------|
| Add admin | `onAddAdmin(adminId, isOwner)` |
| Remove admin | `onRemoveAdmin(adminId)` |
| Toggle admin | `onToggleAdmin(memberId, makeAdmin)` |
| Close | `setAdminsPanelOpen(false)` |

### 6.9 Modals
| Modal | Trigger |
|-------|---------|
| ChannelSwitcherModal | Header avatar/name, More → Switch |
| ChannelCreateModal | Bottom "Create Channel", Empty state |
| PostCommentsSheet | Tap post, Deep link with comments |
| ReportSheet | Post menu → Report |
| SponsoredPostCard | Auto-inserted every 5 posts (non-premium) |

---

## 7. ChannelListPanel (src/components/ChannelListPanel.tsx)

### 7.1 Header
| Button | Action |
|--------|--------|
| Back (mobile) | `onBack()` |
| Delete (Trash2) | Toggle selection mode (owned channels only) |

### 7.2 Search
| Element | Action |
|---------|--------|
| Search input | Filter all three sections |

### 7.3 Sections (Private / Following / Recommended)
| Element | Action |
|---------|--------|
| Channel row | `onSelectChannel(channel.id)` |
| Active indicator | Green dot |
| Popular star (Recommended) | `onTogglePopular(channel.id)` |
| Unread badge | NovaBadge |

### 7.4 Selection Mode (owned only)
| Element | Action |
|---------|--------|
| Select All / Deselect All | Toggle all owned |
| Cancel | Exit selection mode |
| Delete (confirm) | Confirm → `onDeleteChannels(selectedIds)` |

### 7.5 Bottom
| State | Button |
|-------|--------|
| Normal | Create Channel (dashed border) → ChannelCreateModal |
| Selection confirming | Yes (count) / No |
| Selection active | Delete (count) / Cancel |

---

## 8. ProfileScreen (src/components/ProfileScreen.tsx)

### 8.1 Header
| Button | Action |
|--------|--------|
| Back | `onBack()` |
| Edit (own) / Edit Contact (other) | `setEditingName(true)` / `openContactEdit()` |
| Share | `setShareContactOpen(true)` → ContactShareModal |

### 8.2 Avatar
| Action | Trigger |
|--------|---------|
| Tap (view) | `setAvatarLightboxOpen(true)` |
| Change (own) | Hidden file input → `handleAvatarFileChange` |
| Remove (own) | `handleRemoveAvatar()` |

### 8.3 Quick Actions Grid (4 cols other, 1 col own)
| Button | Label | Action | Condition |
|--------|-------|--------|-----------|
| MessageSquare | Message | `onOpenChat()` | Other only |
| Phone | Audio | `setShowCallModal('audio')` | Other only |
| Video | Video | `setShowVideoCall(true)` | Other only |
| MoreHorizontal | More/Settings | NovaMenu / `onOpenSettings()` | Other: menu, Own: settings |

### 8.4 Contact Details Card (editable rows)
| Row | Edit Action | Copy Action |
|-----|-------------|-------------|
| Nickname | Inline input → save | Copy to clipboard |
| Handle (nova://) | — | Copy to clipboard |
| Crypto ID (own) | — | Copy fingerprint |
| Linked Devices (own) | `setShowDeviceLinkModal(true)` | — |
| Safety Number (own) | `setShowSafetyModal(true)` | — |
| Additional Phone | Inline input → save | Double-click to reveal/hide |

### 8.5 Tabs (Media / Files / Links / Voice)
| Tab | Content | Filter (Media) |
|-----|---------|----------------|
| Media | Grid from conversation history + sharedMedia | All / Photos / Videos |
| Files | List of documents | — |
| Links | Extracted URLs with titles | — |
| Voice | Voice notes with playback | — |

### 8.6 Media Lightbox (tap media)
| Button | Action |
|--------|--------|
| Prev / Next | Navigate filtered media |
| Play/Pause | Video toggle |
| Mute/Unmute | Video volume |
| Share | `navigator.share` or copy URL |
| Download | Save via anchor download |
| Close | `setSelectedMediaIndex(null)` |

### 8.7 Modals/Sheets
| Modal | Trigger | Key Buttons |
|-------|---------|-------------|
| ContactShareModal | Header Share, More → Share | Share via system, Copy link, Close |
| ContactEditModal | Header Edit, More → Edit | Save, Cancel |
| DeviceLinkModal | Linked Devices row | Primary: Show QR + code, Join: Scan/Paste offer, Reply, Sync History |
| SafetyModal | Safety Number row | QR code, Verify, Close |
| AvatarLightbox | Tap avatar | Zoom, Close |
| CallModal (audio) | Audio button | Start call, Cancel |
| VideoCallOverlay | Video button | Full call UI |

---

## 9. AnonymousMessengerScreen (referenced but not read — infer from usage)

### 9.1 Expected Structure (from App.tsx props)
| Element | Action |
|---------|--------|
| Back | `onBack()` |
| Initial invite | Auto-show join dialog if `initialInvite` prop |
| New contact creation | Generate link/QR |
| Contact list | Select to chat |

---

## 10. Cross-Cutting Patterns to Verify

### 10.1 Navigation Logic
- [ ] Back button always goes to previous screen in history stack (not fixed destination)
- [ ] Deep links navigate correctly and don't break history
- [ ] Tab switches on mobile update `activeBottomTab` and screen correctly
- [ ] Desktop rail selection updates both `currentScreen` and `activeBottomTab` sync

### 10.2 Modal Stacking
- [ ] Only one modal open at a time (Escape closes topmost)
- [ ] Backdrop click closes modal
- [ ] Focus trap works (Tab cycles within modal)
- [ ] Modals portal to body for z-index

### 10.3 Button Affordances
- [ ] All buttons have `aria-label` or visible text
- [ ] Touch targets ≥44×44px (check `min-h-[44px] min-w-[44px]`)
- [ ] Active/pressed states visible (`active:scale-90`, `active:bg-...`)
- [ ] Disabled state visually distinct (`opacity-50`, `cursor-not-allowed`)

### 10.4 Haptic Feedback
- [ ] Long press (400ms) → light haptic
- [ ] Swipe threshold (42px) → medium haptic
- [ ] Pull-to-refresh (60px) → light, release → medium
- [ ] Send long-press (450ms) → light

### 10.5 Premium Gates
- [ ] Chat themes (Sapphire/Amethyst/Emerald) → `canUse('chat_themes')` → checkout
- [ ] Date picker (Channel calendar) → `canUse('date_picker')` → checkout
- [ ] Ads free → `canUse('ads_free')` hides sponsored cards
- [ ] Premium chat colors in Settings → locked with Lock icon

### 10.6 Toast/Feedback System
- [ ] All actions show toast confirmation (pinned, copied, saved, deleted, etc.)
- [ ] Toasts auto-dismiss ~2200ms
- [ ] Undo toast for deletions (5s window)

### 10.7 Keyboard Shortcuts
- [ ] Cmd/Ctrl+K → Focus search (ChatsScreen, ChatScreen, ChannelScreen)
- [ ] Escape → Close modal/search/overlay
- [ ] Arrow keys in lightbox → Prev/Next
- [ ] Enter in composer → Send (Shift+Enter = newline)

### 10.8 Responsive Breakpoints
- [ ] Desktop (≥768px): Rail + Sidebar + Main + ThreadSidebar
- [ ] Mobile (<768px): BottomNav + FAB + Single pane
- [ ] Tablet: Verify no broken layouts at 768-1024px

---

## 11. Audit Execution Checklist

### Phase 1: Static Analysis (Code Review)
- [ ] Enumerate every `<button>`, `onClick`, `onTouchStart`, `role="button"` in all components
- [ ] Map each to its handler function
- [ ] Verify handler exists and is wired correctly
- [ ] Check for duplicate/unused handlers

### Phase 2: Interactive Testing (Browser Automation)
- [ ] Launch app in headless browser
- [ ] For each screen/modal:
  - [ ] Click every button
  - [ ] Verify visual feedback (pressed state, toast, navigation)
  - [ ] Verify logical outcome (state change, modal open, navigation)
  - [ ] Test Escape/backdrop close
  - [ ] Test keyboard navigation (Tab, Enter, Escape)
  - [ ] Test touch gestures (long press, swipe, pull-to-refresh)

### Phase 3: Logic Validation
- [ ] No orphan buttons (buttons that do nothing)
- [ ] No missing actions (user intent not achievable)
- [ ] Consistent placement: destructive actions red, primary actions accent, secondary subtle
- [ ] Progressive disclosure: advanced settings in sheets, not main tabs
- [ ] Mobile-first: FAB for create actions, bottom nav for primary nav

### Phase 4: Edge Cases
- [ ] Empty states (no chats, no channels, no search results)
- [ ] Loading states (skeletons, spinners)
- [ ] Error states (toast with retry)
- [ ] Permission denials (camera, mic, clipboard, notifications)
- [ ] Offline indicator
- [ ] Demo peer vs real peer distinctions

---

## 12. Deliverable

**Output:** `UI_AUDIT_REPORT.md` with:
1. **Button Inventory** — every button, location, action, logical grouping
2. **Issues Found** — categorized: Missing, Redundant, Misplaced, Broken, Inconsistent
3. **Logic Violations** — where user flow doesn't match mental model
4. **Recommendations** — specific fixes with priority
5. **Accessibility Gaps** — missing labels, focus traps, contrast issues

---

**Principle:** Every button must earn its place. If removing it doesn't break a user flow, it shouldn't exist. If a user flow requires 3+ clicks that could be 1, the intermediate buttons are the problem.