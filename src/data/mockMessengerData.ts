import { Story, ChatItem, ChatMessage, ChannelPost, ContactProfile } from '../types/messenger';
import { STICKER_PACKS } from './stickers';

export const CURRENT_USER = {
  id: 'joseph',
  name: 'Joseph',
  avatar: '/src/assets/images/joseph_avatar_blond_1793872305362.jpg',
  unreadTotal: 5,
};

export const MOCK_STORIES: Story[] = [
  {
    id: 's1',
    name: 'Melinda',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    coverImage: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500&auto=format&fit=crop&q=80',
    unreadCount: 4,
  },
  {
    id: 's2',
    name: 'Sergey',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    coverImage: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=500&auto=format&fit=crop&q=80',
    unreadCount: 3,
  },
  {
    id: 's3',
    name: 'Veronika',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    coverImage: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=500&auto=format&fit=crop&q=80',
    unreadCount: 5,
  },
  {
    id: 's4',
    name: 'Miles',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    coverImage: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=500&auto=format&fit=crop&q=80',
    unreadCount: 8,
  },
];

export const MOCK_CHATS: ChatItem[] = [
  {
    id: 'katie',
    name: 'Katie Rogers',
    avatar: '/src/assets/images/katie_rogers_portrait_1793872304624.jpg',
    snippet: 'Charlotte : Are they still open at sunday? We can give them a visit.',
    time: '17 mins',
    unreadCount: 1,
    isPinned: true,
    type: 'direct',
    category: 'All',
  },
  {
    id: 'thailand',
    name: 'Thailand Trip',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
    groupAvatars: [
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&auto=format&fit=crop&q=80',
    ],
    snippet: 'Any chance to fo that tomorrow? We going hard, haha',
    time: '24 mins',
    type: 'group',
    category: 'Favorites',
  },
  {
    id: 'kurt',
    name: 'Kurt Williamson',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
    snippet: 'Charlotte : Are they still open at sunday? We can give them a visit.',
    time: '38 mins',
    unreadCount: 3,
    type: 'direct',
    category: 'Work',
  },
  {
    id: 'stacy',
    name: 'Stacy Roberts',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
    snippet: 'Charlotte : Are they still open at sunday? We can give them a visit.',
    time: '40 mins',
    type: 'direct',
    category: 'All',
  },
  {
    id: 'daniel',
    name: 'Daniel Bowey',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
    snippet: 'Charlotte : Are they still open at sunday? We can give them a visit.',
    time: '2 hours',
    type: 'direct',
    category: 'Design',
  },
  {
    id: 'kyiv-channel',
    name: 'Real Kyiv Life',
    avatar: 'ukraine_trident',
    snippet: 'Ukraine keeps changing defense ministers. President Volodymyr Zelensky...',
    time: '10:35',
    unreadCount: 12,
    isChannel: true,
    type: 'channel',
    category: 'All',
  },
];

export const INITIAL_KATIE_MESSAGES: ChatMessage[] = [
  {
    id: 'm1',
    senderId: 'other',
    text: "It's Katie Rogers, hope you do remember me. A couple of years ago, we used to hang out with our mutual friends - John and Rebecca",
    time: '19:34',
  },
  {
    id: 'm2',
    senderId: 'other',
    images: [
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=600&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80',
    ],
    text: 'Remember those days when we all did hang out together?',
    time: '19:34',
    isPinned: true,
    pinnedNote: 'Summer reunion memories & photos',
  },
  {
    id: 'm3',
    senderId: 'me',
    text: 'Yeah, good times. For sure...',
    time: '19:05',
    isRead: true,
  },
  {
    id: 'm4',
    senderId: 'me',
    text: "If you want to, we can meet and hang out at Harry's",
    time: '19:06',
    isRead: true,
    isPinned: true,
    pinnedNote: "Meeting place: Harry's Bar on Sunday",
  },
  {
    id: 'm5',
    senderId: 'other',
    text: 'Are they still open at sunday? We can give them a visit.',
    time: '19:34',
    replyTo: {
      id: 'm4',
      text: "If you want to, we can meet and hang out at Harry's",
      senderName: 'You',
    },
  },
  {
    id: 'm6',
    senderId: 'other',
    text: 'Anyway, waiting for your reply.',
    time: '19:36',
  },
  {
    id: 'm7',
    senderId: 'me',
    text: "Yeah, i'm here. Gonna talk to John and then will get back to you",
    time: '19:38',
    isRead: true,
    replyTo: {
      id: 'm6',
      text: 'Anyway, waiting for your reply.',
      senderName: 'Katie Rogers',
    },
  },
  {
    id: 'm8',
    senderId: 'other',
    voiceNote: {
      duration: '0:18',
      durationSeconds: 18,
      waveform: [25, 35, 55, 75, 90, 60, 40, 70, 85, 100, 80, 55, 45, 65, 90, 95, 70, 50, 40, 60, 75, 45, 30, 20],
    },
    time: '19:40',
    isPinned: true,
    pinnedNote: "Katie's voice note on Sunday plan",
    reactions: [{ emoji: '🔥', count: 1, fromMe: true }],
  },
  {
    id: 'm9',
    senderId: 'other',
    text: "Where should we grab dinner on Sunday? Let's vote!",
    time: '19:42',
    poll: {
      id: 'poll-sunday-dinner',
      question: 'Where should we grab dinner on Sunday? 🍕',
      options: [
        { id: 'opt-1', text: "Harry's Bar & Bistro", votes: 4, votedByMe: true },
        { id: 'opt-2', text: 'Unit.City Terrace Lounge', votes: 2, votedByMe: false },
        { id: 'opt-3', text: 'Golden Gate Italian Piazza', votes: 1, votedByMe: false },
      ],
      totalVotes: 7,
      isAnonymous: true,
      allowsMultiple: false,
    },
  },
  {
    id: 'm10',
    senderId: 'other',
    text: '🐱 Cyber Cat',
    time: '19:43',
    sticker: STICKER_PACKS[0]?.stickers?.[0],
  },
  {
    id: 'm11',
    senderId: 'me',
    text: "📍 Harry's Bar & Bistro, Kyiv",
    time: '19:44',
    isRead: true,
    location: {
      latitude: 50.4501,
      longitude: 30.5234,
      title: "Harry's Bar & Bistro",
      address: '12 Khreshchatyk Street, Kyiv',
      isLive: false,
    },
  },
];

export const CONVERSATION_HISTORIES: Record<string, ChatMessage[]> = {
  katie: INITIAL_KATIE_MESSAGES,
  thailand: [
    { id: 'th1', senderId: 'other', text: 'Hey team, flight tickets are confirmed for Friday!', time: '14:20' },
    { id: 'th2', senderId: 'other', text: 'Hostel near the beach in Phuket is reserved.', time: '14:22' },
    { id: 'th3', senderId: 'me', text: 'Awesome! Did everyone pack their passport and sunglasses?', time: '14:30', isRead: true },
    { id: 'th4', senderId: 'other', text: 'Any chance to fo that tomorrow? We going hard, haha', time: '24 mins' },
  ],
  kurt: [
    { id: 'ku1', senderId: 'other', text: 'Hi Joseph, here is the updated proposal for the Q3 design sprint.', time: 'Yesterday' },
    { id: 'ku2', senderId: 'me', text: 'Thanks Kurt! Reviewing the wireframes and components now.', time: 'Yesterday', isRead: true },
    { id: 'ku3', senderId: 'other', text: 'Charlotte : Are they still open at sunday? We can give them a visit.', time: '38 mins' },
  ],
  stacy: [
    { id: 'st1', senderId: 'other', text: 'Hey Joseph, did you see the new dark mode mockups?', time: 'Yesterday' },
    { id: 'st2', senderId: 'me', text: 'Yes, the electric orange accents look gorgeous!', time: 'Yesterday', isRead: true },
    { id: 'st3', senderId: 'other', text: 'Charlotte : Are they still open at sunday? We can give them a visit.', time: '40 mins' },
  ],
  daniel: [
    { id: 'da1', senderId: 'other', text: 'Sent you the Figma tokens and API specs for the messenger rewrite.', time: '3 hours ago' },
    { id: 'da2', senderId: 'other', text: 'Charlotte : Are they still open at sunday? We can give them a visit.', time: '2 hours' },
  ],
  'kyiv-channel': [
    { id: 'ky1', senderId: 'other', text: "President Volodymyr Zelensky's unexpected dismissal of Ukraine's defense minister triggered protests across the country.", time: '10:30' },
    { id: 'ky2', senderId: 'other', text: "Behind the Scenes: The Kyiv Independent's June Digest. Explore our users photos made on this day.", time: '10:35' },
    { id: 'ky3', senderId: 'other', text: 'New Metro Station Architecture Project Approved in northern districts.', time: '14:20' },
  ],
};

// Test-compatible messages for katie profile (Files, Links, Voice tabs)
export const KATIE_TEST_MESSAGES: ChatMessage[] = [
  {
    id: 'kt-file-1',
    senderId: 'other',
    text: 'Here is the trip schedule',
    time: 'Yesterday',
    file: { name: 'Trip_Schedule_Kyiv.pdf', size: 2516582, mimeType: 'application/pdf' },
  },
  {
    id: 'kt-file-2',
    senderId: 'other',
    text: 'Hotel reservation confirmed',
    time: '3 days ago',
    file: { name: 'Hotel_Reservation.pdf', size: 655360, mimeType: 'application/pdf' },
  },
  {
    id: 'kt-file-3',
    senderId: 'me',
    text: 'All photos from the trip',
    time: 'Oct 28',
    file: { name: 'Photos_Archive.zip', size: 50438144, mimeType: 'application/zip' },
  },
  {
    id: 'kt-link-1',
    senderId: 'other',
    text: "Check out Harry's Bar & Kitchen for reservations https://harrysbar.com",
    time: '2 days ago',
  },
  {
    id: 'kt-link-2',
    senderId: 'me',
    text: 'Kyiv Independent Digest - summer series https://kyivindependent.com',
    time: '3 days ago',
  },
  {
    id: 'kt-voice-1',
    senderId: 'other',
    text: '',
    time: 'Today at 18:20',
    voiceNote: {
      duration: '0:42',
      durationSeconds: 42,
      waveform: [25, 35, 55, 75, 90, 60, 40, 70, 85, 100, 80, 55, 45, 65, 90, 95, 70, 50, 40, 60],
    },
  },
  {
    id: 'kt-voice-2',
    senderId: 'me',
    text: '',
    time: 'Yesterday at 14:10',
    voiceNote: {
      duration: '1:15',
      durationSeconds: 75,
      waveform: [30, 40, 60, 80, 95, 70, 50, 60, 75, 85, 90, 65, 55, 70, 95, 100, 80, 60, 45, 35],
    },
  },
];

// Merge test messages into katie's history for ProfileScreen tests
CONVERSATION_HISTORIES.katie = [...INITIAL_KATIE_MESSAGES, ...KATIE_TEST_MESSAGES];

export const MOCK_CHANNEL_POSTS: ChannelPost[] = [
  {
    id: 'p1',
    time: '10:30',
    dateKey: 24,
    title: 'Ukraine keeps changing defense ministers.',
    text: "President Volodymyr Zelensky's unexpected dismissal of Ukraine's defense minister triggered protests across the country.",
    commentsCount: 44,
    reactions: [
      { emoji: '😱', count: 28 },
      { emoji: '😡', count: 4 },
      { emoji: '😍', count: 36 },
      { emoji: '🥶', count: 10 },
    ],
  },
  {
    id: 'p2',
    time: '10:35',
    dateKey: 24,
    title: "Behind the Scenes: The Kyiv Independent's June Digest",
    text: "Explore our users photos made on this day. We've received over 200 photos.",
    image: '/src/assets/images/kyiv_monument_digest_1793872305499.jpg',
    imageBadge: '1 of 230',
    commentsCount: 63,
    reactions: [
      { emoji: '😱', count: 28 },
      { emoji: '😡', count: 4 },
      { emoji: '😍', count: 36 },
      { emoji: '🥶', count: 10 },
    ],
  },
  {
    id: 'p3',
    time: '14:20',
    dateKey: 24,
    title: 'New Metro Station Architecture Project Approved',
    text: 'Kyiv city administration unveiled the finalized blueprints for the underground extension connecting northern districts.',
    commentsCount: 86,
    reactions: [
      { emoji: '🔥', count: 92 },
      { emoji: '❤️', count: 54 },
      { emoji: '👏', count: 31 },
    ],
  },
  {
    id: 'p4',
    time: '15:40',
    dateKey: 24,
    title: 'Community Poll: Preferred Weekend Spot?',
    text: 'Cast your vote for the best outdoor work and chill spot in central Kyiv:',
    commentsCount: 142,
    reactions: [
      { emoji: '🔥', count: 180 },
      { emoji: '😍', count: 95 },
    ],
    poll: {
      id: 'channel-poll-1',
      question: 'Which Kyiv park is your favorite for weekend walks?',
      options: [
        { id: 'cp-1', text: 'Mariinsky Park & Viewpoint', votes: 245, votedByMe: false },
        { id: 'cp-2', text: 'Botanical Garden (Pechersk)', votes: 312, votedByMe: true },
        { id: 'cp-3', text: 'Taras Shevchenko Park', votes: 128, votedByMe: false },
        { id: 'cp-4', text: 'Podil Waterfront & River Station', votes: 194, votedByMe: false },
      ],
      totalVotes: 879,
      isAnonymous: true,
      allowsMultiple: false,
    },
  },
  {
    id: 'p0',
    time: '18:15',
    dateKey: 21,
    title: 'Evening Sunset Over St. Andrew’s Descent',
    text: 'A panoramic photo taken during the quiet golden hour after the light rainfall.',
    image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&auto=format&fit=crop&q=80',
    imageBadge: '1 of 12',
    commentsCount: 19,
    reactions: [
      { emoji: '😍', count: 114 },
      { emoji: '❤️', count: 78 },
    ],
  },
];

export const KATIE_SHARED_MEDIA: import('../types/messenger').SharedMediaItem[] = [
  {
    id: 'm-photo-1',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800&auto=format&fit=crop&q=80',
    date: 'June 24',
    monthGroup: 'June 2024',
    caption: 'Friends reunion in the park',
    chatMessageSnippet: 'Remember those days when we all did hang out together?',
  },
  {
    id: 'm-photo-2',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&auto=format&fit=crop&q=80',
    date: 'June 24',
    monthGroup: 'June 2024',
    caption: 'Summer fashion portrait',
    chatMessageSnippet: 'Loved this sunny afternoon with Rebecca & John',
  },
  {
    id: 'm-video-1',
    type: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80',
    duration: '1:18',
    date: 'June 22',
    monthGroup: 'June 2024',
    caption: "Live jazz session at Harry's bar",
    chatMessageSnippet: "Look at the atmosphere at Harry's tonight! 🎷",
  },
  {
    id: 'm-photo-3',
    type: 'image',
    url: '/src/assets/images/friends_summer_vibe_1793872305466.jpg',
    date: 'June 20',
    monthGroup: 'June 2024',
    caption: 'Hangout at the lake pier with John & Rebecca',
    chatMessageSnippet: 'Found this polaroid from our lakeside picnic',
  },
  {
    id: 'm-video-2',
    type: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80',
    duration: '0:42',
    date: 'June 17',
    monthGroup: 'June 2024',
    caption: 'Kyiv electronic music stage',
    chatMessageSnippet: 'Check out the sound system here, it shakes the floor!',
  },
  {
    id: 'm-photo-4',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&auto=format&fit=crop&q=80',
    date: 'June 12',
    monthGroup: 'June 2024',
    caption: 'Neon art exhibition opening',
    chatMessageSnippet: 'The lighting in this gallery is pure cyberpunk',
  },
  {
    id: 'm-photo-5',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop&q=80',
    date: 'May 30',
    monthGroup: 'May 2024',
    caption: 'Sunset over Dnipro hills',
    chatMessageSnippet: 'Golden hour view from the bridge today',
  },
  {
    id: 'm-video-3',
    type: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',
    duration: '0:24',
    date: 'May 25',
    monthGroup: 'May 2024',
    caption: 'Dnipro speedboat waves',
    chatMessageSnippet: 'Cruising at 40 knots on the water 🛥️',
  },
  {
    id: 'm-photo-6',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800&auto=format&fit=crop&q=80',
    date: 'May 18',
    monthGroup: 'May 2024',
    caption: 'Podil street architecture and cafe terrace',
    chatMessageSnippet: 'St. Andrew’s descent after light rain',
  },
  {
    id: 'm-video-4',
    type: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&auto=format&fit=crop&q=80',
    duration: '2:04',
    date: 'May 10',
    monthGroup: 'May 2024',
    caption: 'Carpathian mountain road trip timelapse',
    chatMessageSnippet: 'Driving through the mountain pass before sunrise',
  },
  {
    id: 'm-photo-7',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80',
    date: 'April 28',
    monthGroup: 'April 2024',
    caption: 'Katie coffee break portrait',
    chatMessageSnippet: 'Trying the new matcha latte here',
  },
  {
    id: 'm-video-5',
    type: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&auto=format&fit=crop&q=80',
    duration: '0:36',
    date: 'April 15',
    monthGroup: 'April 2024',
    caption: 'Rebecca surprise birthday toast',
    chatMessageSnippet: 'She had no idea we were all waiting inside! 🎂',
  },
];

export const KATIE_PROFILE: ContactProfile = {
  name: 'Katie Rogers',
  avatar: '/src/assets/images/katie_rogers_portrait_1793872304624.jpg',
  status: 'Last seen 2 minutes ago',
  phone: '+38 063 980 20 90',
  nickname: '@Katie_Rogers',
  mediaCount: 256,
  filesCount: 5,
  linksCount: 18,
  voiceCount: 42,
  mediaItems: [
    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80',
    '/src/assets/images/friends_summer_vibe_1793872305466.jpg',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400&auto=format&fit=crop&q=80',
  ],
  sharedMedia: KATIE_SHARED_MEDIA,
};

export const CONTACT_PROFILES: Record<string, ContactProfile> = {
  katie: KATIE_PROFILE,
  thailand: {
    name: 'Thailand Trip',
    avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&auto=format&fit=crop&q=80',
    status: 'Group · 5 members',
    phone: '—',
    nickname: '@thailand_trip',
    mediaCount: 134,
    filesCount: 12,
    linksCount: 7,
    voiceCount: 8,
    mediaItems: [
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80',
    ],
  },
  kurt: {
    name: 'Kurt Williamson',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&auto=format&fit=crop&q=80',
    status: 'Last seen 38 mins ago',
    phone: '+38 093 111 22 33',
    nickname: '@Kurt_Will',
    mediaCount: 67,
    filesCount: 23,
    linksCount: 11,
    voiceCount: 5,
    mediaItems: [
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop&q=80',
    ],
  },
  stacy: {
    name: 'Stacy Roberts',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80',
    status: 'Last seen 40 mins ago',
    phone: '+38 050 444 55 66',
    nickname: '@Stacy_R',
    mediaCount: 89,
    filesCount: 4,
    linksCount: 9,
    voiceCount: 12,
    mediaItems: [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80',
    ],
  },
  daniel: {
    name: 'Daniel Bowey',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80',
    status: 'Last seen 2 hours ago',
    phone: '+38 067 777 88 99',
    nickname: '@Daniel_B',
    mediaCount: 45,
    filesCount: 31,
    linksCount: 15,
    voiceCount: 3,
    mediaItems: [
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&auto=format&fit=crop&q=80',
    ],
  },
  joseph: {
    name: 'Joseph',
    avatar: '/src/assets/images/joseph_avatar_blond_1793872305362.jpg',
    status: 'Online',
    phone: '+38 063 100 20 30',
    nickname: '@joseph_nova',
    mediaCount: 52,
    filesCount: 14,
    linksCount: 6,
    voiceCount: 9,
    mediaItems: [
      '/src/assets/images/joseph_avatar_blond_1793872305362.jpg',
    ],
  },
  'kyiv-channel': {
    name: 'Real Kyiv Life',
    avatar: 'ukraine_trident',
    status: 'Channel · 124K subscribers',
    phone: '—',
    nickname: '@real_kyiv_life',
    mediaCount: 312,
    filesCount: 0,
    linksCount: 45,
    voiceCount: 0,
    mediaItems: [
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400&auto=format&fit=crop&q=80',
      '/src/assets/images/kyiv_monument_digest_1793872305499.jpg',
    ],
  },
};


const CREATED_GROUPS_KEY = 'nova_created_groups';
const CREATED_GROUP_HISTORIES_KEY = 'nova_created_group_histories';

export function loadCreatedGroups(): ChatItem[] {
  try {
    const raw = localStorage.getItem(CREATED_GROUPS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ChatItem =>
      typeof item === 'object' && item !== null && typeof (item as ChatItem).id === 'string',
    );
  } catch {
    return [];
  }
}

export function saveCreatedGroups(groups: ChatItem[]): void {
  try {
    localStorage.setItem(CREATED_GROUPS_KEY, JSON.stringify(groups));
  } catch {
    /* ignore */
  }
}

export function loadCreatedGroupHistories(): Record<string, ChatMessage[]> {
  try {
    const raw = localStorage.getItem(CREATED_GROUP_HISTORIES_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, ChatMessage[]>;
  } catch {
    return {};
  }
}

export function saveCreatedGroupHistories(histories: Record<string, ChatMessage[]>): void {
  try {
    localStorage.setItem(CREATED_GROUP_HISTORIES_KEY, JSON.stringify(histories));
  } catch {
    /* ignore */
  }
}

export function registerCreatedGroups(): void {
  for (const group of loadCreatedGroups()) {
    if (!MOCK_CHATS.some((chat) => chat.id === group.id)) {
      MOCK_CHATS.push(group);
    }
  }
  const histories = loadCreatedGroupHistories();
  for (const [chatId, messages] of Object.entries(histories)) {
    if (!CONVERSATION_HISTORIES[chatId]) {
      CONVERSATION_HISTORIES[chatId] = messages;
    }
  }
}

export function appendConversationHistory(chatId: string, messages: ChatMessage[]): void {
  if (!CONVERSATION_HISTORIES[chatId]) {
    CONVERSATION_HISTORIES[chatId] = [];
  }
  CONVERSATION_HISTORIES[chatId].push(...messages);

  const groups = loadCreatedGroups();
  if (groups.some((group) => group.id === chatId)) {
    const histories = loadCreatedGroupHistories();
    histories[chatId] = CONVERSATION_HISTORIES[chatId];
    saveCreatedGroupHistories(histories);
  }
}
