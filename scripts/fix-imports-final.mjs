import fs from 'fs';
import path from 'path';
import * as tablerIcons from '@tabler/icons-react';

const available = new Set(Object.keys(tablerIcons));

function walk(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(walk(full));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) results.push(full);
  }
  return results;
}

const files = walk('src').filter(f => {
  const c = fs.readFileSync(f, 'utf8');
  return c.includes("from '@tabler/icons-react'");
});

// Lucide name -> Tabler icon (with Icon prefix)
// Only names that genuinely don't exist as Icon<Name> in Tabler
const LUCIDE_TO_TABLER = {
  // Communication
  MessageSquare: 'IconMessageCircle',
  IconMessageSquare: 'IconMessageCircle',
  MessagesSquare: 'IconMessageShare',
  IconMessagesSquare: 'IconMessageShare',
  
  // Actions
  CheckCheck: 'IconCheckCheck2',
  IconCheckCheck: 'IconCheckCheck2',
  CheckCheck2: 'IconCheckCheck2',
  IconCheckCheck2: 'IconCheckCheck2',
  Trash2: 'IconTrash',
  IconTrash2: 'IconTrash',
  Edit2: 'IconEdit',
  IconEdit2: 'IconEdit',
  Link2: 'IconLink',
  IconLink2: 'IconLink',
  FileCode2: 'IconFileCode',
  IconFileCode2: 'IconFileCode',
  BarChart2: 'IconBarChart',
  IconBarChart2: 'IconBarChart',
  BarChart3: 'IconBarChart',
  IconBarChart3: 'IconBarChart',
  Volume2: 'IconVolume',
  IconVolume2: 'IconVolume',
  
  // Users
  UserRound: 'IconUser',
  IconUserRound: 'IconUser',
  
  // Navigation
  RefreshCw: 'IconRefresh',
  IconRefreshCw: 'IconRefresh',
  ArrowUpRight: 'IconArrowUpRight',
  IconArrowUpRight: 'IconArrowUpRight',
  ArrowDownRight: 'IconArrowDownRight',
  IconArrowDownRight: 'IconArrowDownRight',
  ChevronsUpDown: 'IconChevronsDown',
  IconChevronsUpDown: 'IconChevronsDown',
  
  // Media
  MicOff: 'IconMicOff',
  IconMicOff: 'IconMicOff',
  VideoOff: 'IconVideoOff',
  IconVideoOff: 'IconVideoOff',
  PinOff: 'IconPinOff',
  IconPinOff: 'IconPinOff',
  
  // Security
  ShieldCheck: 'IconShieldCheck',
  IconShieldCheck: 'IconShieldCheck',
  ShieldAlert: 'IconShieldHeart',
  IconShieldAlert: 'IconShieldHeart',
  AlertCircle: 'IconAlertCircle',
  IconAlertCircle: 'IconAlertCircle',
  AlertTriangle: 'IconAlertTriangle',
  IconAlertTriangle: 'IconAlertTriangle',
  LogOut: 'IconLogout',
  IconLogOut: 'IconLogout',
  UserCheck: 'IconUserCheck',
  IconUserCheck: 'IconUserCheck',
  
  // Time
  CalendarClock: 'IconCalendarClock',
  IconCalendarClock: 'IconCalendarClock',
  FileText: 'IconFileText',
  IconFileText: 'IconFileText',
  
  // Misc
  Image: 'IconImage',
  IconImage: 'IconImage',
  MapPin: 'IconMapPin',
  IconMapPin: 'IconMapPin',
  Navigation: 'IconNavigation',
  IconNavigation: 'IconNavigation',
  Palette: 'IconPalette',
  IconPalette: 'IconPalette',
  PenSquare: 'IconPenSquare',
  IconPenSquare: 'IconPenSquare',
  Pencil: 'IconPencil',
  IconPencil: 'IconPencil',
  Smile: 'IconSmile',
  IconSmile: 'IconSmile',
  Sparkles: 'IconSparkles',
  IconSparkles: 'IconSparkles',
  Star: 'IconStar',
  IconStar: 'IconStar',
  Sun: 'IconSun',
  IconSun: 'IconSun',
  Moon: 'IconMoon',
  IconMoon: 'IconMoon',
  Cloud: 'IconCloud',
  IconCloud: 'IconCloud',
  Wifi: 'IconWifi',
  IconWifi: 'IconWifi',
  LayoutDashboard: 'IconLayoutDashboard',
  IconLayoutDashboard: 'IconLayoutDashboard',
  LayoutGrid: 'IconLayoutGrid',
  IconLayoutGrid: 'IconLayoutGrid',
  GitBranch: 'IconGitBranch',
  IconGitBranch: 'IconGitBranch',
  Terminal: 'IconTerminal',
  IconTerminal: 'IconTerminal',
  Database: 'IconDatabase',
  IconDatabase: 'IconDatabase',
  Archive: 'IconArchive',
  IconArchive: 'IconArchive',
  Clock: 'IconClock',
  IconClock: 'IconClock',
  Calendar: 'IconCalendar',
  IconCalendar: 'IconCalendar',
  Check: 'IconCheck',
  IconCheck: 'IconCheck',
  Copy: 'IconCopy',
  IconCopy: 'IconCopy',
  X: 'IconX',
  IconX: 'IconX',
  Plus: 'IconPlus',
  IconPlus: 'IconPlus',
  Minus: 'IconMinus',
  IconMinus: 'IconMinus',
  ArrowLeft: 'IconArrowLeft',
  IconArrowLeft: 'IconArrowLeft',
  ArrowRight: 'IconArrowRight',
  IconArrowRight: 'IconArrowRight',
  ArrowUp: 'IconArrowUp',
  IconArrowUp: 'IconArrowUp',
  ArrowDown: 'IconArrowDown',
  IconArrowDown: 'IconArrowDown',
  ChevronLeft: 'IconChevronLeft',
  IconChevronLeft: 'IconChevronLeft',
  ChevronRight: 'IconChevronRight',
  IconChevronRight: 'IconChevronRight',
  ChevronUp: 'IconChevronUp',
  IconChevronUp: 'IconChevronUp',
  ChevronDown: 'IconChevronDown',
  IconChevronDown: 'IconChevronDown',
  Search: 'IconSearch',
  IconSearch: 'IconSearch',
  Info: 'IconInfo',
  IconInfo: 'IconInfo',
  Languages: 'IconLanguage',
  IconLanguages: 'IconLanguage',
  Hand: 'IconHand',
  IconHand: 'IconHand',
  HardDrive: 'IconHardDrive',
  IconHardDrive: 'IconHardDrive',
  Megaphone: 'IconMegaphone',
  IconMegaphone: 'IconMegaphone',
  Bot: 'IconBot',
  IconBot: 'IconBot',
  Delete: 'IconDelete',
  IconDelete: 'IconDelete',
  DollarSign: 'IconDollarSign',
  IconDollarSign: 'IconDollarSign',
  Film: 'IconFilm',
  IconFilm: 'IconFilm',
  Forward: 'IconForward',
  IconForward: 'IconForward',
  HeartCrack: 'IconHeartCheck',
  IconHeartCrack: 'IconHeartCheck',
  KeyRound: 'IconKeyRound',
  IconKeyRound: 'IconKeyRound',
  Layers: 'IconLayersOff',
  IconLayers: 'IconLayersOff',
  LifeBuoy: 'IconLifebuoy',
  IconLifeBuoy: 'IconLifebuoy',
  Maximize2: 'IconMaximize',
  IconMaximize2: 'IconMaximize',
  Minimize2: 'IconMinimize',
  IconMinimize2: 'IconMinimize',
  Monitor: 'IconMonitor',
  IconMonitor: 'IconMonitor',
  MonitorOff: 'IconMonitorOff',
  IconMonitorOff: 'IconMonitorOff',
  MoreHorizontal: 'IconBorderHorizontal',
  IconMoreHorizontal: 'IconBorderHorizontal',
  MoreVertical: 'IconBorderVertical',
  IconMoreVertical: 'IconBorderVertical',
  MousePointerClick: 'IconMouse',
  IconMousePointerClick: 'IconMouse',
  Pause: 'IconPause',
  IconPause: 'IconPause',
  Play: 'IconPlayCircle',
  IconPlay: 'IconPlayCircle',
  QrCode: 'IconQrcode',
  IconQrCode: 'IconQrcode',
  Reply: 'IconReply',
  IconReply: 'IconReply',
  RotateCcw: 'IconRotate',
  IconRotateCcw: 'IconRotate',
  RotateCw: 'IconRotate',
  IconRotateCw: 'IconRotate',
  Signal: 'IconSignal',
  IconSignal: 'IconSignal',
  Siren: 'IconSend',
  IconSiren: 'IconSend',
  Sliders: 'IconSpider',
  IconSliders: 'IconSpider',
  SlidersHorizontal: 'IconSlidersHorizontal',
  IconSlidersHorizontal: 'IconSlidersHorizontal',
  SmilePlus: 'IconSmilePlus',
  IconSmilePlus: 'IconSmilePlus',
  Trash2: 'IconTrash',
  Type: 'IconType',
  IconType: 'IconType',
  Unlock: 'IconUnlock',
  IconUnlock: 'IconUnlock',
  UserRoundX: 'IconUserRound',
  IconUserRoundX: 'IconUserRound',
  Vibrate: 'IconVibrate',
  IconVibrate: 'IconVibrate',
  VolumeX: 'IconVolumeX',
  IconVolumeX: 'IconVolumeX',
  Zap: 'IconZap',
  IconZap: 'IconZap',
};

let fixed = 0;

for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  const original = c;

  c = c.replace(
    /(import\s*\{)([^}]*)(\} from '@tabler\/icons-react'?)/g,
    (match, open, names, close) => {
      const newNames = names.split(',').map(n => {
        n = n.trim();
        if (!n) return n;

        // Удаляем существующий alias " as X"
        const base = n.replace(/\s+as\s+\w+$/, '').trim();

        // Нормализуем двойной IconIcon префикс -> Icon
        let normalized = base;
        if (normalized.startsWith('IconIcon')) {
          normalized = 'Icon' + normalized.slice(8);
        }
        // Если нет Icon префикса вообще - добавляем
        else if (!normalized.startsWith('Icon')) {
          normalized = 'Icon' + normalized;
        }

        // Извлекаем Lucide имя (убираем Icon префикс для поиска в маппинге)
        const lucideName = normalized.startsWith('Icon') ? normalized.slice(4) : normalized;

        // Определяем Tabler имя
        let tablerName;
        if (available.has(normalized)) {
          tablerName = normalized;
        } else if (LUCIDE_TO_TABLER[lucideName]) {
          tablerName = LUCIDE_TO_TABLER[lucideName];
        } else {
          tablerName = normalized; // оставить как есть
        }

        return tablerName + ' as ' + lucideName;
      }).join(', ');
      return open + newNames + close;
    }
  );

  if (c !== original) {
    fs.writeFileSync(f, c, 'utf8');
    fixed++;
  }
}

console.log('Fixed imports in:', fixed, 'files');

// Проверяем оставшиеся неопознанные
const missing = [];
for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  const lines = c.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("from '@tabler/icons-react'")) {
      let block = lines[i];
      let j = i;
      while (!block.includes(';') && j < lines.length - 1) {
        j++;
        block += lines[j];
      }
      const inner = block.match(/\{([^}]*)\}/);
      if (inner) {
        inner[1].split(',').forEach(n => {
          const clean = n.trim().replace(/\s+as\s+\w+$/, '').trim();
          if (clean && !available.has(clean)) {
            missing.push(clean + ' (in ' + f + ')');
          }
        });
      }
    }
  }
}
if (missing.length > 0) {
  console.log('\nStill missing from Tabler:');
  missing.forEach(m => console.log('  ' + m));
} else {
  console.log('\nAll imports resolved to existing Tabler icons.');
}
