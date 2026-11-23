import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Copy, Gift, Paperclip, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { toDataURL } from 'qrcode';
import { useLanguage } from '../context/LanguageContext';
import { sanitizeDownloadMime } from '../lib/security/safeUrl';
import { useSecurity } from '../hooks/useSecurity';
import { useAccount } from '../hooks/useAccount';
import { dbInstance } from '../lib/storage/db';
import { LazyMedia } from './LazyMedia';
import {
  ackInboxPackets,
  contactFromOffer,
  createInvitation,
  inviteFromInbox,
  prepareInvitationAcceptance,
  receiveInboxPackets,
  contactIdentity,
  failoverInbox,
  migrateInbox,
  isBlockedContact,
  sendContactOffer,
  sendContactMessage,
  type Contact,
  type LocalInbox,
} from '../lib/anon/pairing';
import { decodeInvite, encodeInvite, isAllowedRelayUrl } from '../lib/anon/session';
import { buildContactInviteUrl, parseDeepLink, parseDeepLinkFromHash } from '../lib/network/deepLinks';
import {
  blockSender,
  createAbuseReportSubmission,
  isAbuseCategory,
  isBlocked,
  markAbuseReportUploaded,
  recordAbuseReport,
  unblockSender,
  type AbuseCategory,
} from '../lib/anon/blocks';
import { queueSigningPublicKey } from '../lib/anon/signing';
import { createAnonTransport } from '../lib/anon/transport';
import { createAutoTransport, LocalAnonTransport } from '../lib/anon/localTransport';
import { createPushHintPoller, pushTokenForQueue, registerPush } from '../lib/anon/push';
import { checkTorRunning, isOnionUrl } from '../lib/anon/tor';
import { uint8ToBase64 } from '../lib/anon/packet';
import {
  assembleFile,
  createFileEnvelopes,
  parseFileEnvelope,
  type FileEnvelope,
} from '../lib/anon/fileTransfer';
import {
  DEFAULT_QUEUE_ROTATION_MS,
  shouldRotateQueue,
  type RelayEndpoint,
} from '../lib/anon/relays';
import {
  noteRelayFailure,
  noteRelaySuccess,
  shouldFailoverRelay,
  type RelayFailureMap,
} from '../lib/anon/relayHealth';
import { DummyTrafficScheduler } from '../lib/anon/jitter';
import { planRelayEndpoints, relayEndpointsFromEnv } from '../lib/anon/relayEndpoints';
import {
  coverTrafficIntervalMs,
  loadPrivacyPrefs,
  readBatteryStatus,
  shouldEmitCoverTraffic,
  type BatteryStatus,
  type PrivacyPrefs,
} from '../lib/network/privacyMode';
import { clearPendingPremiumGiftOrder, purchasePremiumGiftCode } from '../lib/premium';

const STORAGE_KEY = 'anon_messenger_state_v1';
const FAILURES_KEY = 'anon_relay_failures_v1';
const MAX_STORED_MESSAGES = 500;
const DEFAULT_PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || 'https://mess.cvr.name';
/**
 * Build-time relay override; without it the messenger runs local-only.
 *
 * The primary relay is the landing host only when `server.js` there actually
 * serves `/api/anon/*`; every fallback is an independent host of the same
 * relay. With more than one URL an invitation carries a rotation plan, so a
 * blocked or dead host moves new queues to the next one instead of stopping the
 * messenger.
 */
const BUILD_RELAY_URL = (import.meta.env.VITE_ANON_RELAY_URL ?? '').trim();
const BUILD_RELAY_FALLBACK_URLS = relayEndpointsFromEnv(
  BUILD_RELAY_URL,
  ...(
    ((import.meta.env as unknown as { VITE_ANON_RELAY_FALLBACK_URLS?: string })
      .VITE_ANON_RELAY_FALLBACK_URLS ?? '') as string
  ).split(','),
);
/** Marker used inside local invitations; never contacted over the network. */
const LOCAL_RELAY_URL = 'https://local.invalid';

interface RelaySettings {
  relayUrl: string;
  /** Extra relays, one per line or comma-separated; queues rotate across them. */
  extraRelays?: string;
  proxyUrl: string;
  relayId: string;
  relayPublicKey: string;
  /** Optional provider token; registered once per queue with a derived suffix. */
  pushToken: string;
  /** Route relay/proxy traffic through the native Tor SOCKS bridge. */
  tor: boolean;
}

interface StoredFile {
  name: string;
  mime: string;
  size: number;
  /** Base64 of the assembled file; storage is already encrypted at rest. */
  data: string;
}

interface StoredTransfer {
  transferId: string;
  name: string;
  mime: string;
  size: number;
  total: number;
  sha256: string;
  envelopes: FileEnvelope[];
  updatedAt: number;
}

interface StoredMessage {
  id: string;
  body: string;
  fromMe: boolean;
  createdAt: number;
  status?: 'queued' | 'sent' | 'error';
  file?: StoredFile;
}

interface StoredContact {
  id: string;
  contact: Contact;
  messages: StoredMessage[];
  pendingOffer?: boolean;
}

interface PendingPremiumGift {
  contactId: string;
  code: string;
  messageId: string;
  createdAt: number;
}

interface AnonymousMessengerState {
  settings?: RelaySettings;
  pendingInbox?: LocalInbox;
  contacts: StoredContact[];
  pendingPremiumGift?: PendingPremiumGift;
  /** Incomplete inbound file transfers, keyed by transfer id. */
  pendingTransfers?: Record<string, StoredTransfer>;
}

const EMPTY_STATE: AnonymousMessengerState = { contacts: [] };
const EMPTY_SETTINGS: RelaySettings = {
  relayUrl: '',
  proxyUrl: '',
  relayId: '',
  relayPublicKey: '',
  pushToken: '',
  tor: false,
};

function isAllowedProxyUrl(value: string): boolean {
  return isAllowedRelayUrl(value);
}

function isValidRoutingPublicKey(value: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '=';
    return atob(base64).length === 32;
  } catch {
    return false;
  }
}

function splitRelays(value?: string): string[] {
  return (value ?? '')
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Every relay the user configured, primary first and deduped, then the built-in
 * fallback hosts. Each queue keeps its own relay URL, so a contact can live on
 * a relay the user never switched to and rotation has somewhere else to go.
 */
function relayEndpoints(settings: RelaySettings): RelayEndpoint[] {
  const endpoints: RelayEndpoint[] = [...BUILD_RELAY_FALLBACK_URLS];
  for (const url of [settings.relayUrl, ...splitRelays(settings.extraRelays)]) {
    const trimmed = url.trim();
    if (!trimmed || !isAllowedRelayUrl(trimmed)) continue;
    if (endpoints.some((endpoint) => endpoint.url === trimmed)) continue;
    endpoints.push({ id: trimmed, url: trimmed });
  }
  return endpoints;
}

function isValidSettings(settings: RelaySettings): boolean {
  const relayUrl = settings.relayUrl.trim();
  const extraRelays = splitRelays(settings.extraRelays);
  if (extraRelays.some((url) => !isAllowedRelayUrl(url))) return false;

  if (settings.tor) {
    if (
      !relayUrl ||
      !isOnionUrl(relayUrl) ||
      extraRelays.some((url) => !isOnionUrl(url)) ||
      (settings.proxyUrl.trim() !== '' && !isOnionUrl(settings.proxyUrl))
    ) {
      return false;
    }
  }

  const hasProxySettings = Boolean(
    settings.proxyUrl.trim() || settings.relayId.trim() || settings.relayPublicKey.trim(),
  );

  if (hasProxySettings) {
    if (
      !isAllowedProxyUrl(settings.proxyUrl) ||
      !/^[A-Za-z0-9._-]{1,128}$/.test(settings.relayId) ||
      !isValidRoutingPublicKey(settings.relayPublicKey)
    ) {
      return false;
    }
    // Proxy mode still needs the relay URL recorded in invitations: the proxy
    // only routes the hop, the peer must know which relay hosts the queue.
    return isAllowedRelayUrl(relayUrl);
  }

  // No relay and no proxy: local-only mode. This is valid and needs no setup;
  // queues live in this browser until the user provides a relay.
  if (!relayUrl) return extraRelays.length === 0;

  return isAllowedRelayUrl(relayUrl);
}

function defaultRelayUrl(): string {
  return BUILD_RELAY_URL;
}

function publicAppUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (configured) return configured;
  if (typeof window === 'undefined') return DEFAULT_PUBLIC_APP_URL;
  const { hostname, origin, protocol } = window.location;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  ) {
    return origin;
  }
  if (protocol === 'https:' && !hostname.endsWith('.localhost')) return origin;
  return DEFAULT_PUBLIC_APP_URL;
}

function trimmedSettings(settings: RelaySettings): RelaySettings {
  return {
    relayUrl: settings.relayUrl.trim(),
    extraRelays: settings.extraRelays?.trim() ?? '',
    proxyUrl: settings.proxyUrl.trim(),
    relayId: settings.relayId.trim(),
    relayPublicKey: settings.relayPublicKey.trim(),
    pushToken: settings.pushToken.trim(),
    tor: settings.tor,
  };
}

function transportConfigFor(settings: RelaySettings, relayUrl: string) {
  const hasProxySettings = Boolean(
    settings.proxyUrl.trim() || settings.relayId.trim() || settings.relayPublicKey.trim(),
  );
  return {
    relayUrl,
    ...(settings.tor && isOnionUrl(relayUrl) ? { tor: true } : {}),
    ...(hasProxySettings
      ? {
          proxy: {
            proxyUrl: settings.proxyUrl,
            relayId: settings.relayId,
            relayPublicKey: settings.relayPublicKey,
          },
        }
      : {}),
  };
}

function transportFor(settings: RelaySettings, relayUrl: string = settings.relayUrl) {
  const hasProxySettings = Boolean(
    settings.proxyUrl.trim() || settings.relayId.trim() || settings.relayPublicKey.trim(),
  );
  const targetRelay = relayUrl.trim();
  // Local mode (and local invitations) never touch the network: a static
  // landing page cannot answer relay calls, and probing it only delays the UI.
  if (!hasProxySettings && (!targetRelay || targetRelay === LOCAL_RELAY_URL)) {
    return new LocalAnonTransport();
  }
  const transportConfig = transportConfigFor(settings, relayUrl);
  // If the public relay cannot be reached (offline preview, self-hosted build
  // without the relay), invites still work locally instead of failing with a
  // technical "relay unavailable" error.
  return settings.tor || hasProxySettings
    ? createAnonTransport(transportConfig)
    : createAutoTransport(transportConfig);
}

function inviteCodeForInbox(inbox?: LocalInbox): string {
  if (!inbox || inbox.expiresAt <= Date.now()) return '';
  return encodeInvite(inviteFromInbox(inbox));
}

function inviteCodeFromInput(value: string): string {
  const input = value.trim();
  if (!input.includes('://')) return input;
  const directTarget = parseDeepLink(input);
  if (directTarget?.type === 'contact-invite') return directTarget.code;
  try {
    const hashTarget = parseDeepLinkFromHash(new URL(input).hash);
    return hashTarget?.type === 'contact-invite' ? hashTarget.code : '';
  } catch {
    return '';
  }
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const AnonymousMessengerScreen: React.FC<{
  onBack: () => void;
  initialInvite?: string | null;
  onInviteConsumed?: () => void;
}> = ({ onBack, initialInvite, onInviteConsumed }) => {
  const { t, language } = useLanguage();
  const { isInitialized } = useSecurity();
  const { account } = useAccount();
  const isRussian = language === 'ru';
  const labels = isRussian
    ? {
      title: 'Контакты',
      subtitle: 'Добавьте человека по ссылке или QR-коду.',
      setupTitle: 'Как это работает',
      pairingGuide:
        'Создайте приглашение и отправьте ссылку или покажите QR-код. Контакт откроет его и подтвердит добавление; после этого он появится у вас автоматически.',
      privacyNote:
        'Переписка зашифрована между устройствами. Relay видит IP-адрес, но не содержимое сообщений; имя контакта указано им самим.',
      localModeTitle: 'Локальный режим',
      localModeNote:
        'Relay не настроен, поэтому приглашения, QR-код и шаринг недоступны. Переписка работает только на этом устройстве. Укажите relay в дополнительных настройках, чтобы добавлять контакты.',
      configureRelay: 'Настроить relay',
      closeSettings: 'Закрыть настройки',
      localContactsTitle: 'Локальные контакты',
      noLocalContacts: 'Локальных контактов пока нет.',
      localPendingNote: (count: number) => `Ожидают подтверждения: ${count}.`,
      deleteContact: 'Удалить контакт',
      deleteContactConfirm: 'Удалить контакт?',
      deleteContactBody: 'Контакт и его сообщения будут удалены с этого устройства.',
      deleteContactHistory: (count: number) =>
        `Контакт и история сообщений (${count}) будут удалены с этого устройства.`,
      contactDeleted: 'Контакт удалён.',
      localModeBadge: (contacts: number, pending: number) => {
        if (contacts === 0 && pending === 0) return 'Локально';
        if (contacts === 0) return `Локально · ${pending} ждёт`;
        return pending > 0
          ? `Локально · ${contacts} + ${pending} ждёт`
          : `Локально · ${contacts}`;
      },
        relayUrl: 'URL relay',
        extraRelays: 'Дополнительные relay (через запятую или с новой строки)',
        relayMoved: 'Relay не отвечает — очередь перенесена на другой relay.',
        queueRotated: 'Очередь ротирована на следующий relay.',
        proxyUrl: 'URL proxy',
        relayId: 'ID relay для proxy',
        relayKey: 'Закреплённый публичный ключ X25519 relay',
        pushToken: 'Push-токен (необязательно)',
        pushTokenHint:
          'Только токен провайдера. Уведомление пустое («проверьте relay»), без отправителя и текста. Один токен на очередь; с proxy и Tor push отключён.',
        torRouting: 'Подключение через Tor (.onion)',
        torHint:
          'Все адреса relay и proxy должны быть http://…onion. Нужен запущенный Tor (порт 9050) и нативное приложение Tauri.',
        torUnavailable:
          'Tor не отвечает на 127.0.0.1:9050. Запустите Tor (Tor Browser, Orbot или демон) и повторите сохранение.',
        attachFile: 'Отправить файл',
        fileFailed: 'Файл повреждён или не прошёл проверку SHA-256.',
        fileTooLarge: 'Файл слишком большой для анонимной передачи (до 2 МБ).',
      advanced: 'Дополнительные сетевые настройки',
      advancedNote: 'Для собственного relay или proxy. Обычно менять это не нужно.',
        saveSettings: 'Сохранить подключение',
      useDefaultRelay: 'Сбросить на локальный режим',
      createInvite: 'Создать ссылку и QR-код',
      inviteLink: 'Ваша ссылка-приглашение',
      showQr: 'QR-код для добавления',
      importInvite: 'Вставьте ссылку или код приглашения',
      acceptInvite: 'Добавить контакт',
      refreshInbox: 'Проверить сообщения',
      contacts: 'Контакты',
      emptyContacts: 'Контактов пока нет. Создайте ссылку или примите приглашение.',
        messagePlaceholder: 'Сообщение…',
      copyInvite: 'Копировать ссылку',
      shareInvite: 'Поделиться ссылкой',
        loading: 'Загрузка зашифрованного хранилища…',
      saved: 'Контакт добавлен.',
      pollSaved: 'Новый контакт добавлен.',
      ackFailed: 'Контакт добавлен, но подтверждение доставки не прошло.',
      offerNotSent: 'Контакт сохранён, но не удалось отправить подтверждение. Попробуйте позже.',
      emptyInbox: 'Новых приглашений нет.',
      copyFailed: 'Не удалось скопировать ссылку.',
      pending: 'Ожидаем подтверждение — оставьте экран открытым, проверяем автоматически',
      inviteReady: 'Приглашение готово. Отправьте ссылку или покажите QR-код.',
      differentRelay: 'У этого приглашения другой relay. Для текущих контактов смена relay недоступна.',
      relayUnavailable: 'Не удалось подключиться к relay. Попробуйте позже.',
      checkRelay: 'Проверить relay',
      checkingRelay: 'Проверяем relay…',
      relayCheckOk: (ms: number) => `Relay отвечает (${ms} мс).`,
      relayCheckLocal: 'Relay не задан: будет использован локальный режим.',
      relayCheckInvalid: 'Сначала заполните настройки корректно.',
      relayCheckFailed: 'Relay не отвечает.',
      qrFailed: 'Не удалось создать QR-код.',
      qrLoading: 'Создаём QR-код…',
      alreadyAdded: 'Этот контакт уже добавлен.',
        block: 'Заблокировать',
        unblock: 'Разблокировать',
        reportCategory: 'Причина жалобы',
        report: 'Пожаловаться',
        reportSent: 'Хешированная жалоба отправлена relay через proxy.',
        reportUploadFailed: 'Жалоба сохранена на устройстве. Для отправки требуется дополнительная маршрутизация.',
        reportPrivacy: 'Жалобы сохраняются локально; отправка доступна только при настройке proxy.',
        giftPremium: 'Подарить Premium · 30 дней ($3.90)',
        retryGift: 'Повторить отправку подарка',
        finishGiftFirst: 'Сначала завершите доставку предыдущего подарка',
        giftPaymentPending: 'Ожидается подтверждение оплаты подарка.',
        giftPaymentFailed: 'Не удалось создать или проверить оплату подарка.',
        giftPaymentWindow: 'Не удалось открыть окно оплаты. Разрешите всплывающие окна и повторите.',
        giftDeliveryFailed: 'Подарок оплачен, но сообщение не отправлено. Повторите отправку.',
        giftSent: 'Подарочный код отправлен зашифрованным сообщением.',
        giftMessage: (code: string) =>
          `🎁 Вам подарили Nova Premium на 30 дней. Для активации вставьте этот одноразовый код в Настройки → Premium: ${code}`,
      }
    : {
        title: 'Contacts',
        subtitle: 'Add someone with a link or QR code.',
        setupTitle: 'How it works',
        pairingGuide:
          'Create an invite and send the link or show the QR code. The other person opens it and confirms; they will then appear in your contacts automatically.',
        privacyNote:
          'Messages are encrypted between devices. The relay can see your IP address, but not message contents; contact names are self-declared.',
        localModeTitle: 'Local mode',
        localModeNote:
          'No relay configured, so invites, QR codes and sharing are unavailable. Messaging works only on this device. Add a relay under advanced settings to add contacts.',
        configureRelay: 'Configure relay',
        closeSettings: 'Close settings',
        localContactsTitle: 'Local contacts',
        noLocalContacts: 'No local contacts yet.',
        localPendingNote: (count: number) => `${count} invitation pending confirmation.`,
        deleteContact: 'Delete contact',
        deleteContactConfirm: 'Delete this contact?',
        deleteContactBody: 'The contact and its messages will be deleted from this device.',
        deleteContactHistory: (count: number) =>
          `The contact and its ${count} ${count === 1 ? 'message' : 'messages'} will be deleted from this device.`,
        contactDeleted: 'Contact deleted.',
        localModeBadge: (contacts: number, pending: number) => {
          if (contacts === 0 && pending === 0) return 'Local only';
          if (contacts === 0) return `Local only · ${pending} pending`;
          return pending > 0
            ? `Local only · ${contacts} + ${pending} pending`
            : `Local only · ${contacts}`;
        },
        relayUrl: 'Relay URL',
        extraRelays: 'Extra relays (comma-separated or one per line)',
        relayMoved: 'The relay stopped answering, so the queue moved to another relay.',
        queueRotated: 'Queue rotated to the next relay.',
        proxyUrl: 'Proxy URL',
        relayId: 'Relay ID at proxy',
        relayKey: 'Pinned relay X25519 public key',
        pushToken: 'Push token (optional)',
        pushTokenHint:
          'Provider token only. The notification is empty ("check the relay") with no sender or text. One token per queue; disabled with a proxy or Tor.',
        torRouting: 'Route through Tor (.onion)',
        torHint:
          'All relay and proxy URLs must be http://…onion. Requires a running Tor (port 9050) and the native Tauri app.',
        torUnavailable:
          'Tor is not answering on 127.0.0.1:9050. Start Tor (Tor Browser, Orbot, or a local daemon) and retry saving.',
        attachFile: 'Send a file',
        fileFailed: 'The file was corrupted or failed its SHA-256 check.',
        fileTooLarge: 'File is too large for anonymous transfer (2 MB max).',
        advanced: 'Advanced network settings',
        advancedNote: 'For a custom relay or proxy. Most people do not need to change this.',
        saveSettings: 'Save connection',
        useDefaultRelay: 'Reset to local mode',
        createInvite: 'Create link and QR code',
        inviteLink: 'Your invitation link',
        showQr: 'Scan this QR code to add me',
        importInvite: 'Paste an invitation link or code',
        acceptInvite: 'Add contact',
        refreshInbox: 'Check for updates',
        contacts: 'Contacts',
        emptyContacts: 'No contacts yet. Create a link or accept an invitation.',
        messagePlaceholder: 'Message…',
        copyInvite: 'Copy link',
        shareInvite: 'Share link',
        loading: 'Loading encrypted storage…',
        saved: 'Contact added.',
        pollSaved: 'New contact added.',
        ackFailed: 'Contact added, but delivery confirmation failed.',
        offerNotSent: 'Contact saved, but the confirmation could not be sent. Try again later.',
        emptyInbox: 'No new invitations.',
        copyFailed: 'Could not copy the link.',
        pending: 'Waiting for confirmation — keep this screen open while we check automatically',
        inviteReady: 'Invite ready. Send the link or show the QR code.',
        differentRelay: 'This invite uses a different relay. Existing contacts prevent switching relays.',
        relayUnavailable: 'Could not connect to the relay. Try again later.',
        checkRelay: 'Check relay',
        checkingRelay: 'Checking relay…',
        relayCheckOk: (ms: number) => `Relay answered in ${ms} ms.`,
        relayCheckLocal: 'No relay configured — local mode will be used.',
        relayCheckInvalid: 'Fill in valid settings first.',
        relayCheckFailed: 'The relay did not answer.',
        qrFailed: 'Could not create the QR code.',
        qrLoading: 'Creating QR code…',
        alreadyAdded: 'This contact is already added.',
        block: 'Block',
        unblock: 'Unblock',
        reportCategory: 'Report category',
        report: 'Report',
        reportSent: 'Hash-only report sent to the relay through the proxy.',
        reportUploadFailed: 'Report saved on this device. Extra routing is required to send it.',
        reportPrivacy: 'Reports are saved locally; sending is available only when a proxy is configured.',
        giftPremium: 'Gift Premium · 30 days ($3.90)',
        retryGift: 'Retry gift delivery',
        finishGiftFirst: 'Finish delivering the previous gift first',
        giftPaymentPending: 'Waiting for gift payment confirmation.',
        giftPaymentFailed: 'Could not create or verify gift payment.',
        giftPaymentWindow: 'Could not open the payment window. Allow pop-ups and try again.',
        giftDeliveryFailed: 'Gift paid, but the message was not sent. Retry delivery.',
        giftSent: 'Gift code sent in an encrypted message.',
        giftMessage: (code: string) =>
          `🎁 You received Nova Premium for 30 days. To activate, paste this one-time code in Settings → Premium: ${code}`,
      };

  const [state, setState] = useState<AnonymousMessengerState>(EMPTY_STATE);
  const stateRef = useRef(state);
  const [settingsForm, setSettingsForm] = useState<RelaySettings>(EMPTY_SETTINGS);
  const [inviteInput, setInviteInput] = useState('');
  const [inviteQr, setInviteQr] = useState('');
  const [qrError, setQrError] = useState('');
  const [reportCategory, setReportCategory] = useState<AbuseCategory>('spam');
  const [draft, setDraft] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [relayCheck, setRelayCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [localContactsOpen, setLocalContactsOpen] = useState(false);
  const [contactPendingDeleteId, setContactPendingDeleteId] = useState<string | null>(null);
  const [inviteClock, setInviteClock] = useState(() => Date.now());
  const advancedSettingsRef = useRef<HTMLDetailsElement>(null);
  const advancedSummaryRef = useRef<HTMLElement>(null);
  const localModePanelRef = useRef<HTMLDivElement>(null);
  const relayUrlInputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef(false);
  const checkInboxRef = useRef<(() => Promise<void>) | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const relayFailuresRef = useRef<RelayFailureMap>({});
  const [privacyPrefs] = useState<PrivacyPrefs>(loadPrivacyPrefs);
  const [battery, setBattery] = useState<BatteryStatus>({ level: null, charging: true });
  const dummyTrafficRef = useRef<DummyTrafficScheduler | null>(null);
  // Declared before the loading effect below: that effect seeds the baseline
  // used to skip redundant failure-map writes.
  const lastPersistedRef = useRef<RelayFailureMap | null>(null);

  useEffect(() => {
    if (!contactPendingDeleteId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setContactPendingDeleteId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [contactPendingDeleteId]);

  useEffect(() => {
    if (!isInitialized) return;
    let cancelled = false;
    const load = async () => {
      try {
        if (!dbInstance.isReady()) throw new Error('Encrypted local storage is unavailable');
        const stored = await dbInstance.loadSetting<AnonymousMessengerState>(STORAGE_KEY);
        const defaultSettings = { ...EMPTY_SETTINGS, relayUrl: defaultRelayUrl() };
        const storedSettings =
          stored && Array.isArray(stored.contacts) ? stored.settings : undefined;
        let mergedSettings = { ...defaultSettings, ...(storedSettings ?? {}) };
        // Older builds stored the landing origin as the relay. It has no
        // /api/anon endpoints, so drop it instead of retrying it on every
        // action; the user can still enter a real relay in the advanced form.
        if (
          !BUILD_RELAY_URL &&
          mergedSettings.relayUrl.replace(/\/+$/, '') === DEFAULT_PUBLIC_APP_URL
        ) {
          mergedSettings = { ...mergedSettings, relayUrl: '', extraRelays: '' };
        }
        const next =
          stored && Array.isArray(stored.contacts)
            ? { ...stored, settings: mergedSettings }
            : { ...EMPTY_STATE, settings: mergedSettings };
        if (next.pendingTransfers) {
          const cutoff = Date.now() - 24 * 60 * 60 * 1000;
          next.pendingTransfers = Object.fromEntries(
            Object.entries(next.pendingTransfers).filter(
              ([, transfer]) => transfer.updatedAt > cutoff,
            ),
          );
        }
        if (cancelled) return;
        stateRef.current = next;
        setState(next);
        setSettingsForm(next.settings);
        setSelectedContactId(next.contacts[0]?.id ?? null);
        const storedFailures = await dbInstance.loadSetting<RelayFailureMap>(FAILURES_KEY);
        if (storedFailures) {
          relayFailuresRef.current = storedFailures;
          lastPersistedRef.current = storedFailures;
        }
      } catch (loadError) {
        if (!cancelled) setError(friendlyError(loadError));
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isInitialized]);

  useEffect(() => {
    if (!initialInvite) return;
    setInviteInput(initialInvite);
    setError('');
    setStatus('');
  }, [initialInvite]);

  const persist = useCallback(async (next: AnonymousMessengerState) => {
    if (!dbInstance.isReady()) throw new Error('Encrypted local storage is unavailable');
    await dbInstance.saveSetting(STORAGE_KEY, next);
    stateRef.current = next;
    setState(next);
  }, []);

  const persistFailures = useCallback(async (next: RelayFailureMap) => {
    if (!dbInstance.isReady()) return;
    if (
      lastPersistedRef.current &&
      JSON.stringify(lastPersistedRef.current) === JSON.stringify(next)
    ) {
      return;
    }
    lastPersistedRef.current = next;
    await dbInstance.saveSetting(FAILURES_KEY, next);
  }, []);

  const configuredSettings = state.settings;
  const transport = useMemo(
    () => (configuredSettings && isValidSettings(configuredSettings) ? transportFor(configuredSettings) : null),
    [configuredSettings],
  );
  // One transport per relay URL: queues are pinned to the relay that issued
  // them, so anything that talks to a queue has to use that relay's transport.
  const transportCacheRef = useRef(new Map<string, ReturnType<typeof transportFor>>());
  useEffect(() => {
    transportCacheRef.current.clear();
  }, [configuredSettings]);
  const getTransport = (relayUrl: string) => {
    if (!configuredSettings || !isValidSettings(configuredSettings)) return null;
    const cached = transportCacheRef.current.get(relayUrl);
    if (cached) return cached;
    const built = transportFor(configuredSettings, relayUrl);
    transportCacheRef.current.set(relayUrl, built);
    return built;
  };
  const selectedContact = state.contacts.find((entry) => entry.id === selectedContactId) ?? null;
  const contactPendingDelete =
    state.contacts.find((entry) => entry.id === contactPendingDeleteId) ?? null;
  // Blocks follow the contact's identity key, which survives a queue rotation.
  const selectedContactKey = selectedContact
    ? contactIdentity(selectedContact.contact.peerInvite)
    : '';
  const selectedContactBlocked = Boolean(selectedContactKey && isBlocked(selectedContactKey));
  const currentInvite = inviteCodeForInbox(state.pendingInbox);
  const inviteLink = currentInvite
    ? buildContactInviteUrl(currentInvite, publicAppUrl())
    : '';
  const isConfigured = Boolean(configuredSettings && transport);
  const hasProxyRouting = Boolean(
    configuredSettings &&
      (configuredSettings.proxyUrl.trim() ||
        configuredSettings.relayId.trim() ||
        configuredSettings.relayPublicKey.trim()),
  );
  const pushToken = configuredSettings?.pushToken.trim() ?? '';
  const hasTorRouting = Boolean(configuredSettings?.tor);
  // No settings at all means nothing was configured yet, which is the same
  // situation as an empty relay: every invite would fall back to local.
  const usesLocalMode = Boolean(isLoaded) && (
    !configuredSettings ||
    (!configuredSettings.relayUrl.trim() && !hasProxyRouting && !hasTorRouting)
  );
  // Contacts saved with a local invitation have no relay to sync through; a
  // contact accepted from a real relay still works even while this device is
  // in local mode, so it must not be counted here.
  const localOnlyContacts = state.contacts.filter(
    (entry) => entry.contact.peerInvite.relayUrl === LOCAL_RELAY_URL,
  );
  const localPendingInvitesCount =
    state.pendingInbox &&
    state.pendingInbox.expiresAt > inviteClock &&
    state.pendingInbox.relayUrl === LOCAL_RELAY_URL
      ? 1
      : 0;

  // Re-render exactly when the pending invitation expires so the badge count
  // and the "waiting" indicators drop to zero without a manual refresh.
  //
  // Deliberately not keyed on `inviteClock`: recomputing the delay after the
  // tick would just schedule another full timeout for an invite that already
  // expired. A changed expiry or a new invite re-arms it.
  useEffect(() => {
    const pending = state.pendingInbox;
    if (!pending) return;
    const remaining = pending.expiresAt - Date.now();
    if (remaining <= 0) {
      if (inviteClock < pending.expiresAt) setInviteClock(Date.now());
      return;
    }
    const timer = window.setTimeout(
      () => setInviteClock(Date.now()),
      Math.min(remaining + 50, 2_147_483_647),
    );
    return () => window.clearTimeout(timer);
  }, [state.pendingInbox, inviteClock]);

  useEffect(() => {
    if (!inviteLink) {
      setInviteQr('');
      setQrError('');
      return;
    }
    let active = true;
    setQrError('');
    void toDataURL(inviteLink, {
      width: 240,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (active) setInviteQr(dataUrl);
      })
      .catch((qrGenerationError: unknown) => {
        if (active) {
          setInviteQr('');
          setQrError(friendlyError(qrGenerationError));
        }
      });
    return () => {
      active = false;
    };
  }, [inviteLink]);

  const checkRelayConnection = async () => {
    setError('');
    setStatus('');
    setRelayCheck(null);
    const nextSettings = trimmedSettings(settingsForm);
    if (!isValidSettings(nextSettings)) {
      setRelayCheck({ ok: false, message: labels.relayCheckInvalid });
      return;
    }
    const hasProxySettings = Boolean(
      nextSettings.proxyUrl || nextSettings.relayId || nextSettings.relayPublicKey,
    );
    if (!nextSettings.relayUrl && !hasProxySettings) {
      setRelayCheck({ ok: true, message: labels.relayCheckLocal });
      return;
    }
    setIsBusy(true);
    try {
      if (nextSettings.tor) {
        const torCheck = await checkTorRunning({});
        if (!torCheck.ok) throw new Error(labels.torUnavailable);
      }
      // Probe with a direct transport, never createAutoTransport: its local
      // fallback would report success for a relay that is actually unreachable.
      const checkTransport = createAnonTransport(
        transportConfigFor(nextSettings, nextSettings.relayUrl),
      );
      const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const queue = await checkTransport.createQueue(60_000);
      if (!queue) throw new Error(labels.relayCheckFailed);
      // The probe queue is not an invite; drop it so repeated checks do not
      // leave garbage queues behind (and burn the relay's create rate limit).
      void Promise.resolve(
        checkTransport.deleteQueue?.(queue.queueId, queue.recipientToken, queue.signingKey),
      ).catch(() => undefined);
      const elapsed =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
      setRelayCheck({
        ok: true,
        message: labels.relayCheckOk(Math.max(0, Math.round(elapsed))),
      });
    } catch (checkError) {
      setRelayCheck({
        ok: false,
        message: `${labels.relayCheckFailed} ${friendlyError(checkError)}`,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setStatus('');
    const nextSettings = trimmedSettings(settingsForm);
    if (!isValidSettings(nextSettings)) {
      setError(
        'Enter a valid HTTPS relay URL, or leave it empty for local mode. If using a proxy, also enter its URL, relay ID, and 32-byte base64url key.',
      );
      return;
    }
    if (nextSettings.tor) {
      const torCheck = await checkTorRunning({});
      if (!torCheck.ok) {
        setError(labels.torUnavailable);
        return;
      }
    }
    setIsBusy(true);
    try {
      const current = stateRef.current;
      const pendingInbox =
        current.pendingInbox && current.pendingInbox.expiresAt > Date.now()
          ? current.pendingInbox
          : undefined;
      await persist({ ...current, pendingInbox, settings: nextSettings });
      setSettingsForm(nextSettings);
      setStatus(labels.saved);
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setIsBusy(false);
    }
  };

  const createInvite = async () => {
    if (!configuredSettings || !transport) {
      setError(labels.relayUnavailable);
      return;
    }
    setIsBusy(true);
    setError('');
    setStatus('');
    try {
      // `createInvitation` requires a syntactically valid relay URL. In local
      // mode we pass the marker instead of a real endpoint; the transport never
      // contacts it and the generated invite stays on this device.
      const primaryRelay = configuredSettings.relayUrl.trim() || LOCAL_RELAY_URL;
      const backupEndpoint = primaryRelay === LOCAL_RELAY_URL
        ? undefined
        : relayEndpoints(configuredSettings).find((relay) => relay.url !== primaryRelay);
      // Never let the auto transport turn a dead relay into a "successful"
      // local invite: the UI would offer a link/QR that can never reach another
      // device. Local mode keeps using the local transport; remote invites use
      // the direct transport so a connection failure is surfaced instead.
      const inviteTransport = primaryRelay === LOCAL_RELAY_URL
        ? transport
        : createAnonTransport(transportConfigFor(configuredSettings, primaryRelay));
      const backupTransport = backupEndpoint
        ? createAnonTransport(transportConfigFor(configuredSettings, backupEndpoint.url))
        : null;
      const standby = backupEndpoint && backupTransport
        ? { transport: backupTransport, relayUrl: backupEndpoint.url }
        : undefined;
      const invitation = await createInvitation(
        inviteTransport,
        primaryRelay,
        undefined,
        undefined,
        account.nickname,
        standby,
      );
      if (!invitation) throw new Error(labels.relayUnavailable);
      const inbox = {
        ...invitation.inbox,
        displayName: account.nickname,
        relays: planRelayEndpoints(
          configuredSettings.relayUrl,
          configuredSettings.relayUrl,
          relayEndpoints(configuredSettings),
        ),
      };
      await persist({
        ...stateRef.current,
        settings: configuredSettings,
        pendingInbox: inbox,
      });
      setStatus(labels.inviteReady);
    } catch (createError) {
      setError(friendlyError(createError));
    } finally {
      setIsBusy(false);
    }
  };

  const acceptInvite = async () => {
    setIsBusy(true);
    setError('');
    setStatus('');
    try {
      const invite = decodeInvite(inviteCodeFromInput(inviteInput));
      if (!invite) throw new Error('Invite is invalid or expired.');
      const current = stateRef.current;
      if (current.contacts.some((entry) => entry.id === invite.queueId)) {
        throw new Error(labels.alreadyAdded);
      }
      let settings = current.settings ?? {
        ...EMPTY_SETTINGS,
        relayUrl: defaultRelayUrl(),
      };
      if (!isValidSettings(settings)) throw new Error(labels.relayUnavailable);
      // The invite's queue lives on its own relay, so accepting it never
      // switches the relay used for the user's own invite and existing queues.
      const inviteTransport = transportFor(settings, invite.relayUrl);
      const backupEndpoint = relayEndpoints(settings).find(
        (relay) => relay.url !== invite.relayUrl,
      );
      const backupTransport = backupEndpoint ? getTransport(backupEndpoint.url) : null;
      const prepared = await prepareInvitationAcceptance(
        inviteTransport,
        invite,
        account.nickname,
        backupEndpoint && backupTransport
          ? { transport: backupTransport, relayUrl: backupEndpoint.url }
          : undefined,
      );
      if (!prepared) throw new Error('Could not accept this invite.');
      const contact: Contact = {
        ...prepared,
        inbox: {
          ...prepared.inbox,
          relays: planRelayEndpoints(settings.relayUrl, invite.relayUrl, relayEndpoints(settings)),
        },
      };
      const contactRelays = contact.inbox.relays ?? [];
      if (contactRelays.length > 1 && !contactRelays.some((relay) => relay.url === invite.relayUrl)) {
        // These built-in relays are new for the user: record them as the
        // configured ones, so the peer's queue can rotate off its old host.
        const primary = contactRelays[0]?.url;
        if (primary) {
          const extras = contactRelays
            .slice(1)
            .map((relay) => relay.url)
            .join(', ');
          const nextSettings: RelaySettings = {
            ...settings,
            relayUrl: primary,
            extraRelays: [settings.extraRelays, extras].filter(Boolean).join(', '),
          };
          if (isValidSettings(nextSettings)) {
            settings = nextSettings;
            setSettingsForm(nextSettings);
          }
        }
      }
      const id = contact.peerInvite.queueId;
      await persist({
        ...current,
        settings,
        contacts: [...current.contacts, { id, contact, messages: [], pendingOffer: true }],
      });
      setSelectedContactId(id);
      setInviteInput('');
      onInviteConsumed?.();
      const offerSent = await sendContactOffer(inviteTransport, invite, contact.inbox);
      if (offerSent) {
        const latest = stateRef.current;
        await persist({
          ...latest,
          contacts: latest.contacts.map((entry) =>
            entry.id === id ? { ...entry, pendingOffer: false } : entry,
          ),
        });
      }
      setStatus(offerSent ? labels.saved : labels.offerNotSent);
    } catch (acceptError) {
      setError(friendlyError(acceptError));
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * Recreates one of our queues on the next relay once its relay stopped
   * answering, and tells the contacts that write to it where it went. Only the
   * queues of that inbox move: contacts on other relays keep their own.
   */
  const failoverQueue = async (queueId: string): Promise<boolean> => {
    const current = stateRef.current;
    const owners = current.contacts.filter((entry) => entry.contact.inbox.queueId === queueId);
    const inbox =
      owners[0]?.contact.inbox ??
      (current.pendingInbox?.queueId === queueId ? current.pendingInbox : undefined);
    if (!inbox || (inbox.relays?.length ?? 0) < 2) return false;
    let migration: Awaited<ReturnType<typeof failoverInbox>> = null;
    try {
      migration = await failoverInbox(
        (relayUrl) => {
          const relayTransport = getTransport(relayUrl);
          if (!relayTransport) throw new Error(labels.relayUnavailable);
          return relayTransport;
        },
        inbox,
        owners.map((entry) => entry.contact),
      );
    } catch (failoverError) {
      setError(friendlyError(failoverError));
      return false;
    }
    if (!migration) return false;
    relayFailuresRef.current = noteRelaySuccess(relayFailuresRef.current, inbox.relayUrl);
    const latest = stateRef.current;
    await persist({
      ...latest,
      pendingInbox:
        latest.pendingInbox?.queueId === queueId ? migration.inbox : latest.pendingInbox,
      contacts: latest.contacts.map((entry) =>
        entry.contact.inbox.queueId === queueId
          ? { ...entry, contact: { ...entry.contact, inbox: migration.inbox } }
          : entry,
      ),
    });
    await persistFailures(relayFailuresRef.current);
    return true;
  };

  const checkInbox = async () => {
    if (!configuredSettings || pollingRef.current) return;
    const current = stateRef.current;
    type InboxBatch = {
      inbox: LocalInbox;
      /** Primary inbox the queue belongs to; standby batches receive on it. */
      owner: LocalInbox;
      contactId?: string;
      standby: boolean;
    };
    const batches = new Map<string, InboxBatch>();
    const addBatch = (owner: LocalInbox, contactId?: string) => {
      batches.set(owner.queueId, { inbox: owner, owner, contactId, standby: false });
      if (owner.standby) {
        batches.set(owner.standby.queueId, {
          inbox: owner.standby,
          owner,
          contactId,
          standby: true,
        });
      }
    };
    if (current.pendingInbox) addBatch(current.pendingInbox);
    for (const entry of current.contacts) {
      if (!isBlocked(contactIdentity(entry.contact.peerInvite))) {
        addBatch(entry.contact.inbox, entry.id);
      }
    }
    if (batches.size === 0) return;

    pollingRef.current = true;
    setIsBusy(true);
    setError('');
    setStatus('');
    const stalledQueues = new Set<string>();
    // One entry per primary inbox: it is cleared when either the primary or its
    // standby answers, so a healthy fallback does not surface a red error.
    const relayErrors = new Map<string, string>();
    try {
      let next = current;
      let changed = false;
      for (const entry of current.contacts) {
        if (!entry.pendingOffer) continue;
        const peerTransport = getTransport(entry.contact.peerInvite.relayUrl);
        const standbyRelay = entry.contact.peerInvite.standby?.relayUrl;
        const standbyTransport = standbyRelay ? getTransport(standbyRelay) : null;
        const offerSent = Boolean(
          (peerTransport || standbyTransport) &&
            (await sendContactOffer(
              peerTransport,
              entry.contact.peerInvite,
              entry.contact.inbox,
              standbyTransport,
            )),
        );
        if (!offerSent) continue;
        next = {
          ...next,
          contacts: next.contacts.map((contact) =>
            contact.id === entry.id ? { ...contact, pendingOffer: false } : contact,
          ),
        };
        changed = true;
      }
      const acknowledgements = new Map<string, { inbox: LocalInbox; packetIds: string[] }>();
      for (const { inbox, owner, contactId, standby } of batches.values()) {
        const inboxTransport = getTransport(inbox.relayUrl);
        if (!inboxTransport) {
          setError(labels.relayUnavailable);
          continue;
        }
        let packets: Awaited<ReturnType<typeof receiveInboxPackets>>;
        try {
          packets = await receiveInboxPackets(inboxTransport, inbox);
        } catch (receiveError) {
          relayFailuresRef.current = noteRelayFailure(
            relayFailuresRef.current,
            inbox.relayUrl,
          );
          if (!standby) relayErrors.set(owner.queueId, friendlyError(receiveError));
          if (!standby && shouldFailoverRelay(relayFailuresRef.current, inbox.relayUrl)) {
            stalledQueues.add(inbox.queueId);
          }
          continue;
        }
        relayFailuresRef.current = noteRelaySuccess(relayFailuresRef.current, inbox.relayUrl);
        relayErrors.delete(owner.queueId);
        for (const packet of packets) {
          if (contactId) {
            if (packet.offer) {
              // A queue rotation arrives as a contact offer on our own queue.
              // Adopt the new inbox only when the offer proves the same contact
              // identity this conversation started with (the peer signed the
              // new queue key with its identity key), so neither a stranger nor
              // a replayed offer can redirect the conversation.
              const bucket = acknowledgements.get(inbox.queueId) ?? { inbox, packetIds: [] };
              bucket.packetIds.push(packet.packetId);
              acknowledgements.set(inbox.queueId, bucket);
              const existing = next.contacts.find((entry) => entry.id === contactId);
              const rotated = packet.offer;
              const trustedIdentity = existing?.contact.identityKey;
              if (
                existing &&
                trustedIdentity &&
                !isBlockedContact(rotated) &&
                rotated.queueId !== existing.contact.peerInvite.queueId &&
                contactIdentity(rotated) === trustedIdentity
              ) {
                changed = true;
                next = {
                  ...next,
                  contacts: next.contacts.map((entry) =>
                    entry.id === contactId
                      ? { ...entry, contact: { ...entry.contact, peerInvite: rotated } }
                      : entry,
                  ),
                };
              }
              continue;
            }
            const existing = next.contacts.find((entry) => entry.id === contactId);
            if (!existing) continue;
            const fileEnvelope = parseFileEnvelope(packet.body);
            if (fileEnvelope) {
              const previous = next.pendingTransfers?.[fileEnvelope.transferId];
              const envelopes = previous ? [...previous.envelopes] : [];
              if (!envelopes.some((entry) => entry.index === fileEnvelope.index)) {
                envelopes.push(fileEnvelope);
              }
              if (previous && previous.total !== fileEnvelope.total) {
                setError(labels.fileFailed);
                continue;
              }
              const pendingTransfers = { ...(next.pendingTransfers ?? {}) };
              if (envelopes.length >= fileEnvelope.total) {
                const assembled = await assembleFile(envelopes);
                delete pendingTransfers[fileEnvelope.transferId];
                if (assembled) {
                  next = {
                    ...next,
                    pendingTransfers,
                    contacts: next.contacts.map((entry) =>
                      entry.id === contactId
                        ? {
                            ...entry,
                            messages: [
                              ...entry.messages,
                              {
                                id: packet.packetId,
                                body: '',
                                fromMe: false,
                                createdAt: Date.now(),
                                file: {
                                  name: assembled.name,
                                  mime: assembled.mime,
                                  size: assembled.bytes.length,
                                  data: uint8ToBase64(assembled.bytes),
                                },
                              },
                            ].slice(-MAX_STORED_MESSAGES),
                          }
                        : entry,
                    ),
                  };
                } else {
                  next = { ...next, pendingTransfers };
                  setError(labels.fileFailed);
                }
              } else {
                pendingTransfers[fileEnvelope.transferId] = {
                  transferId: fileEnvelope.transferId,
                  name: fileEnvelope.name,
                  mime: fileEnvelope.mime,
                  size: fileEnvelope.size,
                  total: fileEnvelope.total,
                  sha256: fileEnvelope.sha256,
                  envelopes,
                  updatedAt: Date.now(),
                };
                next = { ...next, pendingTransfers };
              }
              changed = true;
              const bucket = acknowledgements.get(inbox.queueId) ?? { inbox, packetIds: [] };
              bucket.packetIds.push(packet.packetId);
              acknowledgements.set(inbox.queueId, bucket);
              continue;
            }
            if (existing.messages.some((message) => message.id === packet.packetId)) {
              const bucket = acknowledgements.get(inbox.queueId) ?? { inbox, packetIds: [] };
              bucket.packetIds.push(packet.packetId);
              acknowledgements.set(inbox.queueId, bucket);
              continue;
            }
            next = {
              ...next,
              contacts: next.contacts.map((entry) =>
                entry.id === contactId
                  ? {
                      ...entry,
                      messages: [
                        ...entry.messages,
                        {
                          id: packet.packetId,
                          body: packet.body,
                          fromMe: false,
                          createdAt: Date.now(),
                        },
                      ].slice(-MAX_STORED_MESSAGES),
                    }
                  : entry,
              ),
            };
            changed = true;
            const bucket = acknowledgements.get(inbox.queueId) ?? { inbox, packetIds: [] };
            bucket.packetIds.push(packet.packetId);
            acknowledgements.set(inbox.queueId, bucket);
            continue;
          }

          if (!packet.offer) {
            setError('Unexpected message in a pending invite inbox; it was left unacknowledged.');
            continue;
          }
          if (isBlockedContact(packet.offer)) {
            const bucket = acknowledgements.get(inbox.queueId) ?? { inbox, packetIds: [] };
            bucket.packetIds.push(packet.packetId);
            acknowledgements.set(inbox.queueId, bucket);
            continue;
          }
          const contact = contactFromOffer(owner, packet.offer);
          if (!contact) continue;
          const id = contact.peerInvite.queueId;
          if (!next.contacts.some((entry) => entry.id === id)) {
            next = {
              ...next,
              pendingInbox: undefined,
              contacts: [...next.contacts, { id, contact, messages: [] }],
            };
            setSelectedContactId(id);
            changed = true;
          } else if (next.pendingInbox?.queueId === owner.queueId) {
            next = { ...next, pendingInbox: undefined };
            changed = true;
          }
          const bucket = acknowledgements.get(inbox.queueId) ?? { inbox, packetIds: [] };
          bucket.packetIds.push(packet.packetId);
          acknowledgements.set(inbox.queueId, bucket);
        }
      }

      if (changed) await persist(next);
      let ackSucceeded = true;
      for (const { inbox, packetIds } of acknowledgements.values()) {
        const inboxTransport = getTransport(inbox.relayUrl);
        if (!inboxTransport) {
          ackSucceeded = false;
          continue;
        }
        ackSucceeded = (await ackInboxPackets(inboxTransport, inbox, packetIds)) && ackSucceeded;
      }
      const firstRelayError = relayErrors.values().next().value;
      if (firstRelayError) setError(firstRelayError);
      let moved = false;
      for (const queueId of stalledQueues) {
        if (await failoverQueue(queueId)) moved = true;
      }
      const rotated = await rotateQueuesIfDue(Date.now());
      await persistFailures(relayFailuresRef.current);
      if (rotated) setStatus(labels.queueRotated);
      else if (moved) setStatus(labels.relayMoved);
      else if (!ackSucceeded) setStatus(labels.ackFailed);
      else if (changed) setStatus(labels.pollSaved);
      else setStatus(labels.emptyInbox);
    } catch (pollError) {
      setError(friendlyError(pollError));
    } finally {
      pollingRef.current = false;
      setIsBusy(false);
    }
  };

  /**
   * Rotates every one of our queues whose rotation window passed onto the next
   * configured relay, announcing the move to the contacts that write to it.
   * Runs on each inbox check so queues are re-created on a schedule instead of
   * only when a relay dies (failover covers outages).
   */
  const rotateQueuesIfDue = async (now: number = Date.now()): Promise<boolean> => {
    if (!configuredSettings || !transport) return false;
    const current = stateRef.current;
    const queues = new Map<string, { inbox: LocalInbox; owners: Contact[] }>();
    const register = (inbox: LocalInbox | undefined, owner?: Contact) => {
      if (!inbox || inbox.expiresAt <= now || (inbox.relays?.length ?? 0) < 2) return;
      const bucket = queues.get(inbox.queueId);
      if (bucket) {
        if (owner) bucket.owners.push(owner);
      } else {
        queues.set(inbox.queueId, { inbox, owners: owner ? [owner] : [] });
      }
    };
    register(current.pendingInbox);
    for (const entry of current.contacts) register(entry.contact.inbox, entry.contact);

    let changed = false;
    let latest = current;
    for (const { inbox, owners } of queues.values()) {
      if (!shouldRotateQueue(inbox.createdAt, now, DEFAULT_QUEUE_ROTATION_MS)) continue;
      const migration = await migrateInbox(
        (relayUrl) => {
          const relayTransport = getTransport(relayUrl);
          if (!relayTransport) throw new Error(labels.relayUnavailable);
          return relayTransport;
        },
        inbox,
        owners,
        now,
      );
      if (!migration) continue;
      changed = true;
      latest = {
        ...latest,
        pendingInbox:
          latest.pendingInbox?.queueId === inbox.queueId ? migration.inbox : latest.pendingInbox,
        contacts: latest.contacts.map((entry) =>
          entry.contact.inbox.queueId === inbox.queueId
            ? { ...entry, contact: { ...entry.contact, inbox: migration.inbox } }
            : entry,
        ),
      };
    }
    if (changed) await persist(latest);
    return changed;
  };

  useEffect(() => {
    checkInboxRef.current = checkInbox;
  });

  const pendingInboxForPolling = state.pendingInbox;
  useEffect(() => {
    const inbox = pendingInboxForPolling;
    if (!transport || !inbox || inbox.expiresAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      if (isBusy || pollingRef.current) return;
      void checkInboxRef.current?.();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [isBusy, pendingInboxForPolling, transport]);

  // Push split (phase F): register an opaque token per queue so the relay can
  // send an empty wake-up. Disabled with a proxy: the registration would leak
  // the direct IP the proxy exists to hide.
  const pushTargets = useMemo(() => {
    const targets: Array<{ queueId: string; relayUrl: string }> = [];
    const add = (inbox?: LocalInbox) => {
      if (inbox) targets.push({ queueId: inbox.queueId, relayUrl: inbox.relayUrl });
    };
    add(state.pendingInbox);
    for (const entry of state.contacts) add(entry.contact.inbox);
    return targets;
  }, [state.pendingInbox, state.contacts]);
  const registeredPushRef = useRef(new Map<string, string>());
  useEffect(() => {
    if (!isLoaded || !pushToken || hasProxyRouting || hasTorRouting) {
      registeredPushRef.current.clear();
      return;
    }
    for (const target of pushTargets) {
      const key = `${target.queueId}@${target.relayUrl}`;
      if (registeredPushRef.current.get(key) === pushToken) continue;
      registeredPushRef.current.set(key, pushToken);
      void registerPush(
        { baseUrl: target.relayUrl },
        pushTokenForQueue(pushToken, target.queueId),
        target.queueId,
      ).then((ok) => {
        if (!ok) registeredPushRef.current.delete(key);
      });
    }
  }, [isLoaded, pushToken, hasProxyRouting, hasTorRouting, pushTargets]);
  useEffect(() => {
    if (
      !isLoaded ||
      !configuredSettings ||
      !transport ||
      !pushToken ||
      hasProxyRouting ||
      hasTorRouting
    ) {
      return;
    }
    const poller = createPushHintPoller({
      config: { baseUrl: configuredSettings.relayUrl },
      subscriptions: () => {
        const current = stateRef.current;
        const queues = new Map<string, { queueId: string; baseUrl: string }>();
        const add = (inbox?: LocalInbox) => {
          if (inbox && !queues.has(inbox.queueId)) {
            queues.set(inbox.queueId, { queueId: inbox.queueId, baseUrl: inbox.relayUrl });
          }
        };
        add(current.pendingInbox);
        for (const entry of current.contacts) add(entry.contact.inbox);
        return [...queues.values()].map(({ queueId, baseUrl }) => ({
          pushToken: pushTokenForQueue(pushToken, queueId),
          queueId,
          baseUrl,
        }));
      },
      onHint: () => checkInboxRef.current?.(),
    });
    return poller.start();
  }, [isLoaded, configuredSettings, transport, pushToken, hasProxyRouting, hasTorRouting]);

  useEffect(() => {
    let cancelled = false;
    void readBatteryStatus().then((status) => {
      if (!cancelled) setBattery(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const activeCoverTraffic = shouldEmitCoverTraffic(privacyPrefs, battery);
    const interval = activeCoverTraffic ? coverTrafficIntervalMs(privacyPrefs, battery) : null;

    if (dummyTrafficRef.current) {
      dummyTrafficRef.current.stop();
      dummyTrafficRef.current = null;
    }

    if (!interval || !transport) return;

    const queueIds: string[] = [];
    const senderTokens: Record<string, string> = {};
    const addQueue = (inbox: LocalInbox) => {
      if (!queueIds.includes(inbox.queueId)) {
        queueIds.push(inbox.queueId);
        senderTokens[inbox.queueId] = inbox.senderToken;
      }
    };
    if (state.pendingInbox) addQueue(state.pendingInbox);
    for (const entry of state.contacts) addQueue(entry.contact.inbox);

    if (queueIds.length === 0) return;

    const scheduler = new DummyTrafficScheduler({
      queueIds,
      senderTokens,
      intervalMs: interval,
      enabled: true,
    });
    scheduler.start(transport);
    dummyTrafficRef.current = scheduler;

    return () => {
      scheduler.stop();
      dummyTrafficRef.current = null;
    };
  }, [privacyPrefs, battery, transport, state.pendingInbox, state.contacts]);

  const toggleSelectedContactBlock = () => {
    if (!selectedContactKey) return;
    const changed = selectedContactBlocked
      ? unblockSender(selectedContactKey)
      : blockSender(selectedContactKey);
    if (!changed) {
      setError('Could not update the local block list.');
      return;
    }
    setError('');
    setStatus(selectedContactBlocked ? labels.unblock : labels.block);
  };

  const reportSelectedContact = async () => {
    if (!selectedContact) return;
    // The relay verifies reports against the key that created the queue, which
    // rotation replaces, so this one deliberately is not the contact identity.
    const queueSigningKey = queueSigningPublicKey(selectedContact.contact.peerInvite.signingKey);
    if (!queueSigningKey) return;
    setIsBusy(true);
    setError('');
    setStatus('');
    try {
      const report = await recordAbuseReport({
        queueId: selectedContact.contact.peerInvite.queueId,
        signingPublicKey: queueSigningKey,
        category: reportCategory,
      });
      if (!report) throw new Error('Could not create an anonymous abuse report.');
      if (!report.reportId || !transport?.submitAbuseReport) {
        setStatus(labels.reportUploadFailed);
        return;
      }
      const submission = await createAbuseReportSubmission(report);
      if (!submission) {
        setStatus(labels.reportUploadFailed);
        return;
      }
      const uploaded = await transport.submitAbuseReport(submission);
      if (!uploaded) {
        setStatus(labels.reportUploadFailed);
        return;
      }
      markAbuseReportUploaded(report.reportId);
      setStatus(labels.reportSent);
    } catch (reportError) {
      setError(friendlyError(reportError));
    } finally {
      setIsBusy(false);
    }
  };

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedContact || selectedContactBlocked || !draft.trim()) return;
    const peerTransport = getTransport(selectedContact.contact.peerInvite.relayUrl);
    if (!peerTransport) {
      setError(labels.relayUnavailable);
      return;
    }
    const body = draft.trim();
    const id = crypto.randomUUID();
    const queued: StoredMessage = { id, body, fromMe: true, createdAt: Date.now(), status: 'queued' };
    const beforeSend = {
      ...stateRef.current,
      contacts: stateRef.current.contacts.map((entry) =>
        entry.id === selectedContact.id
          ? {
              ...entry,
              messages: [...entry.messages, queued].slice(-MAX_STORED_MESSAGES),
            }
          : entry,
      ),
    };
    setError('');
    setStatus('');
    setIsBusy(true);
    try {
      await persist(beforeSend);
    } catch (persistError) {
      setError(friendlyError(persistError));
      setIsBusy(false);
      return;
    }

    setDraft('');
    let result: Awaited<ReturnType<typeof sendContactMessage>> = null;
    let sendError: unknown;
    const standbyRelay = selectedContact.contact.peerInvite.standby?.relayUrl;
    const standbyTransport = standbyRelay ? getTransport(standbyRelay) : null;
    try {
      result = await sendContactMessage(peerTransport, selectedContact.contact, body, {
        standbyTransport,
      });
    } catch (error) {
      sendError = error;
    }

    const deliveryStatus: StoredMessage['status'] = result ? 'sent' : 'error';
    const sentState: AnonymousMessengerState = {
      ...stateRef.current,
      contacts: stateRef.current.contacts.map((entry) =>
        entry.id === selectedContact.id
          ? {
              ...entry,
              messages: entry.messages.map((message) =>
                message.id === id ? { ...message, status: deliveryStatus } : message,
              ),
            }
          : entry,
      ),
    };
    try {
      await persist(sentState);
    } catch (persistError) {
      setError(
        sendError
          ? `${friendlyError(sendError)}; ${friendlyError(persistError)}`
          : `Message may have been sent, but its status could not be saved: ${friendlyError(persistError)}`,
      );
      setIsBusy(false);
      return;
    }
    if (!result && !sendError) setError('Message could not be sent. It remains saved locally for retry.');
    else if (!result && sendError) setError(friendlyError(sendError));
    setIsBusy(false);
  };

  const sendFile = async (file: File | undefined) => {
    if (!file || !selectedContact || selectedContactBlocked || isBusy) return;
    const peerTransport = getTransport(selectedContact.contact.peerInvite.relayUrl);
    if (!peerTransport) {
      setError(labels.relayUnavailable);
      return;
    }
    setError('');
    setStatus('');
    setIsBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const envelopes = await createFileEnvelopes(bytes, file.name, file.type);
      const id = crypto.randomUUID();
      const queued: StoredMessage = {
        id,
        body: '',
        fromMe: true,
        createdAt: Date.now(),
        status: 'queued',
        file: {
          name: file.name,
          mime: file.type || 'application/octet-stream',
          size: bytes.length,
          data: uint8ToBase64(bytes),
        },
      };
      await persist({
        ...stateRef.current,
        contacts: stateRef.current.contacts.map((entry) =>
          entry.id === selectedContact.id
            ? { ...entry, messages: [...entry.messages, queued].slice(-MAX_STORED_MESSAGES) }
            : entry,
        ),
      });

      const standbyRelay = selectedContact.contact.peerInvite.standby?.relayUrl;
      const standbyTransport = standbyRelay ? getTransport(standbyRelay) : null;
      let sentAll = true;
      for (const envelope of envelopes) {
        const result = await sendContactMessage(
          peerTransport,
          selectedContact.contact,
          JSON.stringify(envelope),
          { standbyTransport, profile: 'large' },
        );
        if (!result) {
          sentAll = false;
          break;
        }
      }

      await persist({
        ...stateRef.current,
        contacts: stateRef.current.contacts.map((entry) =>
          entry.id === selectedContact.id
            ? {
                ...entry,
                messages: entry.messages.map((message) =>
                  message.id === id
                    ? { ...message, status: sentAll ? 'sent' : 'error' }
                    : message,
                ),
              }
            : entry,
        ),
      });
      if (!sentAll) setError(labels.fileFailed);
    } catch (error) {
      setError(
        error instanceof Error && error.message.includes('too large')
          ? labels.fileTooLarge
          : friendlyError(error),
      );
    } finally {
      setIsBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deliverPremiumGift = async (gift: PendingPremiumGift) => {
    const entry = stateRef.current.contacts.find((contact) => contact.id === gift.contactId);
    const peerTransport = entry
      ? getTransport(entry.contact.peerInvite.relayUrl)
      : null;
    if (!entry || !peerTransport) {
      setError(labels.giftDeliveryFailed);
      return;
    }

    const body = labels.giftMessage(gift.code);
    const existing = entry.messages.find((message) => message.id === gift.messageId);
    const queued: StoredMessage = existing
      ? { ...existing, status: 'queued' }
      : { id: gift.messageId, body, fromMe: true, createdAt: gift.createdAt, status: 'queued' };
    const queuedState: AnonymousMessengerState = {
      ...stateRef.current,
      contacts: stateRef.current.contacts.map((contact) =>
        contact.id === gift.contactId
          ? {
              ...contact,
              messages: [
                ...contact.messages.filter((message) => message.id !== gift.messageId),
                queued,
              ].slice(-MAX_STORED_MESSAGES),
            }
          : contact,
      ),
      pendingPremiumGift: gift,
    };
    await persist(queuedState);

    let sent = false;
    let sendError: unknown;
    const standbyRelay = entry.contact.peerInvite.standby?.relayUrl;
    const standbyTransport = standbyRelay ? getTransport(standbyRelay) : null;
    try {
      sent = Boolean(
        await sendContactMessage(peerTransport, entry.contact, body, { standbyTransport }),
      );
    } catch (error) {
      sendError = error;
    }

    const updatedState: AnonymousMessengerState = {
      ...stateRef.current,
      contacts: stateRef.current.contacts.map((contact) =>
        contact.id === gift.contactId
          ? {
              ...contact,
              messages: contact.messages.map((message) =>
                message.id === gift.messageId
                  ? { ...message, status: sent ? 'sent' : 'error' }
                  : message,
              ),
            }
          : contact,
      ),
      pendingPremiumGift: sent ? undefined : gift,
    };
    try {
      await persist(updatedState);
    } catch (persistError) {
      setError(
        sendError
          ? `${friendlyError(sendError)}; ${friendlyError(persistError)}`
          : `Gift may have been sent, but its status could not be saved: ${friendlyError(persistError)}`,
      );
      return;
    }
    if (sent) setStatus(labels.giftSent);
    else setError(sendError ? friendlyError(sendError) : labels.giftDeliveryFailed);
  };

  const giftPremiumToSelectedContact = async () => {
    if (!selectedContact || selectedContactBlocked || !transport || isBusy) return;
    setError('');
    setStatus('');
    setIsBusy(true);
    try {
      const pendingGift = stateRef.current.pendingPremiumGift;
      if (pendingGift) {
        if (pendingGift.contactId !== selectedContact.id) {
          setError(labels.finishGiftFirst);
          return;
        }
        await deliverPremiumGift(pendingGift);
        return;
      }

      const result = await purchasePremiumGiftCode(selectedContact.id);
      if (!result.ok || !result.giftCode) {
        if (result.error === 'payment window blocked') setError(labels.giftPaymentWindow);
        else if (result.error === 'waiting for payment') setStatus(labels.giftPaymentPending);
        else if (result.error === 'another gift pending') setError(labels.finishGiftFirst);
        else setError(labels.giftPaymentFailed);
        return;
      }

      const pending: PendingPremiumGift = {
        contactId: selectedContact.id,
        code: result.giftCode,
        messageId: crypto.randomUUID(),
        createdAt: Date.now(),
      };
      await persist({ ...stateRef.current, pendingPremiumGift: pending });
      clearPendingPremiumGiftOrder();
      await deliverPremiumGift(pending);
    } catch (giftError) {
      setError(friendlyError(giftError));
    } finally {
      setIsBusy(false);
    }
  };

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setStatus(labels.copyInvite);
    } catch {
      setError(labels.copyFailed);
    }
  };

  const shareInvite = async () => {
    if (!inviteLink) return;
    if (!navigator.share) {
      await copyInvite();
      return;
    }
    try {
      await navigator.share({ title: 'Nova contact invitation', url: inviteLink });
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === 'AbortError') return;
      setError(friendlyError(shareError));
    }
  };

  const deleteContact = async (contactId: string) => {
    setIsBusy(true);
    setError('');
    setStatus('');
    try {
      const current = stateRef.current;
      const entry = current.contacts.find((item) => item.id === contactId);
      if (!entry) return;
      const contacts = current.contacts.filter((item) => item.id !== contactId);
      const pendingPremiumGift =
        current.pendingPremiumGift?.contactId === contactId
          ? undefined
          : current.pendingPremiumGift;
      await persist({ ...current, contacts, pendingPremiumGift });
      if (selectedContactId === contactId) setSelectedContactId(contacts[0]?.id ?? null);
      setContactPendingDeleteId(null);
      setStatus(labels.contactDeleted);
      // Drop the mailbox after the contact is gone: local queues live in
      // localStorage, relay queues are removed through the same relay (or
      // proxy/Tor route) the contact was using, so no direct IP leak.
      const dropQueue = (inbox: LocalInbox) => {
        if (inbox.relayUrl === LOCAL_RELAY_URL) {
          void new LocalAnonTransport()
            .deleteQueue(inbox.queueId, inbox.recipientToken)
            .catch(() => undefined);
        } else if (inbox.relayUrl) {
          const relayTransport = createAnonTransport(
            transportConfigFor(configuredSettings ?? EMPTY_SETTINGS, inbox.relayUrl),
          );
          void Promise.resolve(
            relayTransport.deleteQueue?.(inbox.queueId, inbox.recipientToken, inbox.signingKey),
          ).catch(() => undefined);
        }
      };
      dropQueue(entry.contact.inbox);
      if (entry.contact.inbox.standby) dropQueue(entry.contact.inbox.standby);
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    } finally {
      setIsBusy(false);
    }
  };

  if (!isLoaded) {
    return <div className="flex h-full items-center justify-center bg-[#090a0e] text-sm text-white/60" data-theme-preserve="dark">{labels.loading}</div>;
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-[#090a0e] text-white" data-theme-preserve="dark">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.08] px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('common.back')}
          className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <ShieldCheck className="h-5 w-5 text-[var(--nova-accent-color)]" />
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{labels.title}</h1>
          <p className="text-xs text-white/50">{labels.subtitle}</p>
        </div>
        {usesLocalMode && (
          <button
            type="button"
            onClick={() => setLocalContactsOpen((open) => !open)}
            aria-expanded={localContactsOpen}
            aria-controls="local-contacts-panel"
            // The badge text only says "Local only"; the title carries the full
            // explanation, so name the control after the mode itself.
            aria-label={labels.localModeTitle}
            title={labels.localModeNote}
            className="ml-auto shrink-0 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-[10px] font-medium text-sky-200 hover:bg-sky-400/20"
          >
            {labels.localModeBadge(localOnlyContacts.length, localPendingInvitesCount)}
          </button>
        )}
      </header>

      {usesLocalMode && localContactsOpen && (
        <section
          id="local-contacts-panel"
          aria-label={labels.localContactsTitle}
          data-testid="local-contacts-panel"
          className="shrink-0 border-b border-white/10 bg-[#0d0f15] px-4 py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-white/80">
              {labels.localContactsTitle}
            </h2>
            <button
              type="button"
              onClick={() => setLocalContactsOpen(false)}
              aria-label={t('common.close')}
              className="rounded-full px-2 text-sm text-white/50 hover:text-white"
            >
              ×
            </button>
          </div>
          {localOnlyContacts.length === 0 ? (
            <p className="pt-2 text-[11px] text-white/45">{labels.noLocalContacts}</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {localOnlyContacts.map((entry) => {
                const name =
                  entry.contact.peerInvite.displayName?.trim() ||
                  `Contact ${entry.id.slice(-6)}`;
                return (
                  <li key={entry.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedContactId(entry.id);
                        setLocalContactsOpen(false);
                      }}
                      className="min-w-0 flex-1 truncate rounded-xl px-2 py-1.5 text-left text-xs text-white/70 hover:bg-white/10"
                    >
                      {name}
                    </button>
                    <button
                      type="button"
                      onClick={() => setContactPendingDeleteId(entry.id)}
                      aria-label={`${labels.deleteContact}: ${name}`}
                      className="rounded-lg p-1.5 text-white/35 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {localPendingInvitesCount > 0 && (
            <p className="pt-2 text-[11px] text-sky-200/70">
              {labels.localPendingNote(localPendingInvitesCount)}
            </p>
          )}
        </section>
      )}

      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 xl:grid-cols-[minmax(280px,360px)_1fr]">
        <section className="space-y-3">
          <div className="space-y-1 rounded-2xl border border-[var(--nova-accent-color)]/25 bg-[var(--nova-accent-color)]/[0.06] p-3">
            <h2 className="text-xs font-semibold text-white">{labels.setupTitle}</h2>
            <p className="text-xs leading-relaxed text-white/60">{labels.pairingGuide}</p>
            <p className="pt-1 text-[11px] leading-relaxed text-amber-200/75">{labels.privacyNote}</p>
          </div>
          <div className="space-y-3 rounded-2xl border border-white/10 bg-[#11131a] p-3">
            {usesLocalMode ? (
              <div
                ref={localModePanelRef}
                role="status"
                tabIndex={-1}
                className="rounded-xl border border-sky-400/25 bg-sky-400/10 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
              >
                <h2 className="text-xs font-semibold text-sky-100">{labels.localModeTitle}</h2>
                <p className="pt-1 text-[11px] leading-relaxed text-sky-100/80">
                  {labels.localModeNote}
                </p>
                {!advancedOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      const details = advancedSettingsRef.current;
                      if (!details) return;
                      details.open = true;
                      setAdvancedOpen(true);
                      details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                      window.setTimeout(() => relayUrlInputRef.current?.focus(), 0);
                    }}
                    className="mt-2 w-full rounded-lg border border-sky-300/30 bg-sky-300/10 px-3 py-2 text-xs font-medium text-sky-100 hover:bg-sky-300/20"
                  >
                    {labels.configureRelay}
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void createInvite()}
                disabled={
                  isBusy ||
                  !isConfigured ||
                  Boolean(state.pendingInbox && state.pendingInbox.expiresAt > Date.now())
                }
                className="w-full rounded-xl bg-[var(--nova-accent-color)] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {labels.createInvite}
              </button>
            )}
            {inviteLink && !usesLocalMode && (
              <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
                <label className="block space-y-1 text-xs text-white/60">
                  <span>{labels.inviteLink}</span>
                  <textarea
                    readOnly
                    value={inviteLink}
                    rows={2}
                    className="w-full resize-y rounded-xl border border-white/10 bg-black/30 p-2 font-mono text-xs text-white/80"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void shareInvite()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium hover:bg-white/15"
                  >
                    {labels.shareInvite}
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyInvite()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium hover:bg-white/15"
                  >
                    <Copy className="h-4 w-4" />
                    {labels.copyInvite}
                  </button>
                </div>
                <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-3">
                {inviteQr ? (
                  <LazyMedia
                    src={inviteQr}
                    alt={labels.showQr}
                    eager
                    className="h-48 w-48 max-w-full"
                  />
                ) : (
                    <p role={qrError ? 'alert' : 'status'} className="text-center text-xs text-red-600">
                      {qrError ? labels.qrFailed : labels.qrLoading}
                    </p>
                  )}
                  {qrError && <p className="text-center text-[10px] text-red-600">{qrError}</p>}
                  <p className="text-center text-xs text-black/70">{labels.showQr}</p>
                </div>
              </div>
            )}
            {state.pendingInbox && state.pendingInbox.expiresAt > Date.now() && (
              <p role="status" className="text-center text-xs text-amber-200/80">
                {labels.pending}
              </p>
            )}
            <label className="block space-y-1 text-xs text-white/60">
              <span>{labels.importInvite}</span>
              <textarea
                value={inviteInput}
                onChange={(event) => setInviteInput(event.target.value)}
                rows={2}
                className="w-full resize-y rounded-xl border border-white/10 bg-black/30 p-2 font-mono text-xs text-white"
              />
            </label>
            <button
              type="button"
              onClick={() => void acceptInvite()}
              disabled={isBusy || !inviteInput.trim()}
              className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-50"
            >
              {labels.acceptInvite}
            </button>
            {(state.pendingInbox || state.contacts.length > 0) && (
              <button
                type="button"
                onClick={() => void checkInbox()}
                disabled={isBusy}
                className="w-full rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/10 disabled:opacity-50"
              >
                {labels.refreshInbox}
              </button>
            )}
          </div>

          <details
            ref={advancedSettingsRef}
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
            className="rounded-2xl border border-white/10 bg-[#11131a] p-3"
          >
            <summary
              ref={advancedSummaryRef}
              className="min-h-6 cursor-pointer py-1 text-xs font-medium text-white/70"
            >
              {labels.advanced}
            </summary>
            <form onSubmit={saveSettings} className="mt-3 space-y-2">
              <p className="text-xs leading-relaxed text-white/50">{labels.advancedNote}</p>
              <button
                type="button"
                onClick={() => {
                  setRelayCheck(null);
                  setSettingsForm((current) => ({
                    ...current,
                    relayUrl: defaultRelayUrl(),
                    extraRelays: '',
                    proxyUrl: '',
                    relayId: '',
                    relayPublicKey: '',
                    pushToken: '',
                    tor: false,
                  }));
                }}
                className="w-full rounded-xl border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/10 px-3 py-2 text-xs font-medium text-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color)]/20"
              >
                {labels.useDefaultRelay}
              </button>
              {([
                ['relayUrl', labels.relayUrl, 'https://relay.example'],
                ['extraRelays', labels.extraRelays, 'https://relay2.example, https://relay3.example'],
                ['proxyUrl', labels.proxyUrl, 'https://proxy.example'],
                ['relayId', labels.relayId, 'relay-main'],
                ['relayPublicKey', labels.relayKey, 'base64url X25519 key'],
                ['pushToken', labels.pushToken, 'unifiedpush-endpoint-or-token'],
              ] as const).map(([field, label, placeholder]) => (
                <label key={field} className="block space-y-1 text-xs text-white/60">
                  <span>{label}</span>
                  <input
                    ref={field === 'relayUrl' ? relayUrlInputRef : undefined}
                    value={settingsForm[field]}
                    onChange={(event) => {
                      setRelayCheck(null);
                      setSettingsForm((current) => ({ ...current, [field]: event.target.value }));
                    }}
                    placeholder={placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[var(--nova-accent-color)]"
                  />
                </label>
              ))}
              <p className="text-[11px] leading-relaxed text-white/45">{labels.pushTokenHint}</p>
              <label className="flex items-center gap-2 text-xs text-white/60">
                <input
                  type="checkbox"
                  checked={settingsForm.tor}
                  onChange={(event) => {
                    setRelayCheck(null);
                    setSettingsForm((current) => ({ ...current, tor: event.target.checked }));
                  }}
                  className="h-4 w-4 rounded border-white/20 bg-black/30"
                />
                <span>{labels.torRouting}</span>
              </label>
              <p className="text-[11px] leading-relaxed text-white/45">{labels.torHint}</p>
              <button
                type="button"
                onClick={() => void checkRelayConnection()}
                disabled={isBusy}
                className="w-full rounded-xl border border-white/15 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-50"
              >
                {isBusy ? labels.checkingRelay : labels.checkRelay}
              </button>
              {relayCheck && (
                <p
                  role="status"
                  className={`break-words text-xs ${relayCheck.ok ? 'text-emerald-300' : 'text-red-300'}`}
                >
                  {relayCheck.message}
                </p>
              )}
              <button
                type="submit"
                disabled={isBusy}
                className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-50"
              >
                {labels.saveSettings}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdvancedOpen(false);
                  if (advancedSettingsRef.current) advancedSettingsRef.current.open = false;
                  window.setTimeout(() => {
                    const target = localModePanelRef.current ?? advancedSummaryRef.current;
                    target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    target?.focus();
                  }, 0);
                }}
                className="w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-medium text-white/60 hover:bg-white/5"
              >
                {labels.closeSettings}
              </button>
            </form>
          </details>

          {status && <p role="status" className="text-xs text-emerald-300">{status}</p>}
          {error && <p role="alert" className="break-words text-xs text-red-300">{error}</p>}
        </section>

        <section className="flex min-h-[360px] min-w-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#11131a]">
          <div className="border-b border-white/10 px-3 py-2 text-xs font-semibold text-white/70">
            {labels.contacts}
          </div>
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <div className="max-h-36 shrink-0 overflow-y-auto border-b border-white/10 md:max-h-none md:w-56 md:border-b-0 md:border-r">
              {state.contacts.map((entry) => {
                const name =
                  entry.contact.peerInvite.displayName?.trim() ||
                  `Contact ${entry.id.slice(-6)}`;
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-1 ${
                      selectedContactId === entry.id ? 'bg-white/10' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedContactId(entry.id)}
                      className={`min-w-0 flex-1 truncate px-3 py-3 text-left text-sm ${
                        selectedContactId === entry.id
                          ? 'text-white'
                          : 'text-white/60 hover:bg-white/5'
                      }`}
                    >
                      {name}
                    </button>
                    <button
                      type="button"
                      onClick={() => setContactPendingDeleteId(entry.id)}
                      aria-label={`${labels.deleteContact}: ${name}`}
                      className="mr-1 shrink-0 rounded-lg p-1.5 text-white/30 hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
              {state.pendingInbox && (
                <div className="px-3 py-3 text-xs text-amber-200/70">{labels.pending}</div>
              )}
              {state.contacts.length === 0 && !state.pendingInbox && (
                <p className="p-3 text-xs leading-relaxed text-white/40">{labels.emptyContacts}</p>
              )}
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {selectedContact && (
                <div className="space-y-2 border-b border-white/10 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void giftPremiumToSelectedContact()}
                      disabled={isBusy || selectedContactBlocked || !isConfigured}
                      className="flex items-center gap-1.5 rounded-xl border border-[var(--nova-accent-color)]/40 px-3 py-2 text-xs text-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color)]/10 disabled:opacity-40"
                    >
                      <Gift className="h-4 w-4" />
                      {state.pendingPremiumGift?.contactId === selectedContact.id
                        ? labels.retryGift
                        : state.pendingPremiumGift
                          ? labels.finishGiftFirst
                          : labels.giftPremium}
                    </button>
                    <select
                      aria-label={labels.reportCategory}
                      value={reportCategory}
                      onChange={(event) => {
                        if (isAbuseCategory(event.target.value)) {
                          setReportCategory(event.target.value);
                        }
                      }}
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#181a22] px-2 py-2 text-xs text-white"
                    >
                      <option value="spam">Spam</option>
                      <option value="harassment">Harassment</option>
                      <option value="illegal">Illegal content</option>
                    </select>
                    <button
                      type="button"
                      onClick={toggleSelectedContactBlock}
                      className="rounded-xl border border-white/10 px-3 py-2 text-xs hover:bg-white/10"
                    >
                      {selectedContactBlocked ? labels.unblock : labels.block}
                    </button>
                    <button
                      type="button"
                      onClick={() => void reportSelectedContact()}
                      disabled={isBusy}
                      className="rounded-xl border border-white/10 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-50"
                    >
                      {labels.report}
                    </button>
                  </div>
                  <p className="text-[10px] text-white/40">{labels.reportPrivacy}</p>
                </div>
              )}
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {selectedContact?.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      message.fromMe
                        ? 'ml-auto bg-[var(--nova-accent-color)] text-white'
                        : 'mr-auto bg-white/10 text-white/90'
                    }`}
                  >
                    {message.file ? (
                      <a
                        href={`data:${sanitizeDownloadMime(message.file.mime)};base64,${message.file.data}`}
                        download={message.file.name}
                        className="flex items-center gap-2 break-all underline decoration-white/40"
                      >
                        <Paperclip className="h-4 w-4 shrink-0" />
                        <span>{message.file.name}</span>
                        <span className="shrink-0 text-[10px] opacity-70">
                          {Math.max(1, Math.ceil(message.file.size / 1024))} KB
                        </span>
                      </a>
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    )}
                    <p className="mt-1 text-right text-[10px] opacity-60">
                      {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {message.status === 'error' ? ' · error' : ''}
                    </p>
                  </div>
                ))}
                {!selectedContact && (
                  <p className="pt-4 text-center text-xs text-white/35">{labels.emptyContacts}</p>
                )}
              </div>
              <form onSubmit={sendMessage} className="flex gap-2 border-t border-white/10 p-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(event) => void sendFile(event.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label={labels.attachFile}
                  title={labels.attachFile}
                  disabled={!selectedContact || selectedContactBlocked || isBusy}
                  className="rounded-full bg-white/10 p-2.5 text-white/80 hover:bg-white/15 disabled:opacity-40"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={!selectedContact || selectedContactBlocked || isBusy}
                  placeholder={labels.messagePlaceholder}
                  className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-4 py-2 text-sm text-white outline-none focus:border-[var(--nova-accent-color)] disabled:opacity-40"
                />
                <button
                  type="submit"
                  aria-label={t('common.send')}
                  disabled={!selectedContact || selectedContactBlocked || isBusy || !draft.trim()}
                  className="rounded-full bg-[var(--nova-accent-color)] p-2.5 text-white disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>

      {contactPendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-contact-title"
          onClick={() => setContactPendingDeleteId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#11131a] p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-contact-title" className="text-sm font-semibold text-white">
              {labels.deleteContactConfirm}
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-white/60">
              {contactPendingDelete.messages.length > 0
                ? labels.deleteContactHistory(contactPendingDelete.messages.length)
                : labels.deleteContactBody}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setContactPendingDeleteId(null)}
                className="flex-1 rounded-xl border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/5"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void deleteContact(contactPendingDelete.id)}
                disabled={isBusy}
                className="flex-1 rounded-xl bg-red-500/20 px-3 py-2 text-xs font-medium text-red-200 hover:bg-red-500/30 disabled:opacity-50"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
