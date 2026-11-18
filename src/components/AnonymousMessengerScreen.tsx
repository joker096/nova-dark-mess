import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Copy, Gift, Send, ShieldCheck } from 'lucide-react';
import { toDataURL } from 'qrcode';
import { useLanguage } from '../context/LanguageContext';
import { useSecurity } from '../hooks/useSecurity';
import { useAccount } from '../hooks/useAccount';
import { dbInstance } from '../lib/storage/db';
import {
  ackInboxPackets,
  contactFromOffer,
  createInvitation,
  inviteFromInbox,
  prepareInvitationAcceptance,
  receiveInboxPackets,
  contactIdentity,
  failoverInbox,
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
  isAbuseCategory,
  isBlocked,
  markAbuseReportUploaded,
  recordAbuseReport,
  unblockSender,
  type AbuseCategory,
} from '../lib/anon/blocks';
import { queueSigningPublicKey } from '../lib/anon/signing';
import { createAnonTransport } from '../lib/anon/transport';
import type { RelayEndpoint } from '../lib/anon/relays';
import {
  noteRelayFailure,
  noteRelaySuccess,
  shouldFailoverRelay,
  type RelayFailureMap,
} from '../lib/anon/relayHealth';
import { clearPendingPremiumGiftOrder, purchasePremiumGiftCode } from '../lib/premium';

const STORAGE_KEY = 'anon_messenger_state_v1';
const MAX_STORED_MESSAGES = 500;
const DEFAULT_PUBLIC_APP_URL = 'https://mess.cvr.name';

interface RelaySettings {
  relayUrl: string;
  /** Extra relays, one per line or comma-separated; queues rotate across them. */
  extraRelays?: string;
  proxyUrl: string;
  relayId: string;
  relayPublicKey: string;
}

interface StoredMessage {
  id: string;
  body: string;
  fromMe: boolean;
  createdAt: number;
  status?: 'queued' | 'sent' | 'error';
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
}

const EMPTY_STATE: AnonymousMessengerState = { contacts: [] };
const EMPTY_SETTINGS: RelaySettings = {
  relayUrl: '',
  proxyUrl: '',
  relayId: '',
  relayPublicKey: '',
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
 * Every relay the user configured, primary first and deduped. Each queue keeps
 * its own relay URL, so a contact can live on a relay the user never switched
 * to and rotation has somewhere else to go.
 */
function relayEndpoints(settings: RelaySettings): RelayEndpoint[] {
  const endpoints: RelayEndpoint[] = [];
  for (const url of [settings.relayUrl, ...splitRelays(settings.extraRelays)]) {
    const trimmed = url.trim();
    if (!trimmed || !isAllowedRelayUrl(trimmed)) continue;
    if (endpoints.some((endpoint) => endpoint.url === trimmed)) continue;
    endpoints.push({ id: trimmed, url: trimmed });
  }
  return endpoints;
}

function isValidSettings(settings: RelaySettings): boolean {
  if (!isAllowedRelayUrl(settings.relayUrl)) return false;
  if (splitRelays(settings.extraRelays).some((url) => !isAllowedRelayUrl(url))) return false;
  const hasProxySettings = Boolean(
    settings.proxyUrl.trim() || settings.relayId.trim() || settings.relayPublicKey.trim(),
  );
  return (
    !hasProxySettings ||
    (isAllowedProxyUrl(settings.proxyUrl) &&
      /^[A-Za-z0-9._-]{1,128}$/.test(settings.relayId) &&
      isValidRoutingPublicKey(settings.relayPublicKey))
  );
}

function defaultRelayUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_PUBLIC_APP_URL;
  const { hostname, origin } = window.location;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  ) {
    return origin;
  }
  if (window.location.protocol === 'https:' && !hostname.endsWith('.localhost')) return origin;
  return DEFAULT_PUBLIC_APP_URL;
}

function publicAppUrl(): string {
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

function transportFor(settings: RelaySettings, relayUrl: string = settings.relayUrl) {
  const hasProxySettings = Boolean(
    settings.proxyUrl.trim() || settings.relayId.trim() || settings.relayPublicKey.trim(),
  );
  return createAnonTransport({
    relayUrl,
    ...(hasProxySettings
      ? {
          proxy: {
            proxyUrl: settings.proxyUrl,
            relayId: settings.relayId,
            relayPublicKey: settings.relayPublicKey,
          },
        }
      : {}),
  });
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
        relayUrl: 'URL relay',
        extraRelays: 'Дополнительные relay (через запятую или с новой строки)',
        relayMoved: 'Relay не отвечает — очередь перенесена на другой relay.',
        proxyUrl: 'URL proxy',
        relayId: 'ID relay для proxy',
        relayKey: 'Закреплённый публичный ключ X25519 relay',
      advanced: 'Дополнительные сетевые настройки',
      advancedNote: 'Для собственного relay или proxy. Обычно менять это не нужно.',
        saveSettings: 'Сохранить подключение',
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
        relayUrl: 'Relay URL',
        extraRelays: 'Extra relays (comma-separated or one per line)',
        relayMoved: 'The relay stopped answering, so the queue moved to another relay.',
        proxyUrl: 'Proxy URL',
        relayId: 'Relay ID at proxy',
        relayKey: 'Pinned relay X25519 public key',
        advanced: 'Advanced network settings',
        advancedNote: 'For a custom relay or proxy. Most people do not need to change this.',
        saveSettings: 'Save connection',
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
  const pollingRef = useRef(false);
  const checkInboxRef = useRef<(() => Promise<void>) | null>(null);
  const relayFailuresRef = useRef<RelayFailureMap>({});

  useEffect(() => {
    if (!isInitialized) return;
    let cancelled = false;
    const load = async () => {
      try {
        if (!dbInstance.isReady()) throw new Error('Encrypted local storage is unavailable');
        const stored = await dbInstance.loadSetting<AnonymousMessengerState>(STORAGE_KEY);
        const defaultSettings = { ...EMPTY_SETTINGS, relayUrl: defaultRelayUrl() };
        const next =
          stored && Array.isArray(stored.contacts)
            ? { ...stored, settings: stored.settings ?? defaultSettings }
            : { ...EMPTY_STATE, settings: defaultSettings };
        if (cancelled) return;
        stateRef.current = next;
        setState(next);
        setSettingsForm(next.settings);
        setSelectedContactId(next.contacts[0]?.id ?? null);
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

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setStatus('');
    const nextSettings = {
      relayUrl: settingsForm.relayUrl.trim(),
      extraRelays: settingsForm.extraRelays?.trim() ?? '',
      proxyUrl: settingsForm.proxyUrl.trim(),
      relayId: settingsForm.relayId.trim(),
      relayPublicKey: settingsForm.relayPublicKey.trim(),
    };
    if (!isValidSettings(nextSettings)) {
      setError(
        'Enter a valid HTTPS relay URL. If using a proxy, also enter its URL, relay ID, and 32-byte base64url key.',
      );
      return;
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
      const invitation = await createInvitation(
        transport,
        configuredSettings.relayUrl,
        undefined,
        undefined,
        account.nickname,
      );
      if (!invitation) throw new Error(labels.relayUnavailable);
      const inbox = {
        ...invitation.inbox,
        displayName: account.nickname,
        relays: relayEndpoints(configuredSettings),
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
      const settings = current.settings ?? {
        ...EMPTY_SETTINGS,
        relayUrl: defaultRelayUrl(),
      };
      if (!isValidSettings(settings)) throw new Error(labels.relayUnavailable);
      // The invite's queue lives on its own relay, so accepting it never
      // switches the relay used for the user's own invite and existing queues.
      const inviteTransport = transportFor(settings, invite.relayUrl);
      const prepared = await prepareInvitationAcceptance(
        inviteTransport,
        invite,
        account.nickname,
      );
      if (!prepared) throw new Error('Could not accept this invite.');
      const contact: Contact = {
        ...prepared,
        inbox: { ...prepared.inbox, relays: relayEndpoints(settings) },
      };
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
    return true;
  };

  const checkInbox = async () => {
    if (!configuredSettings || pollingRef.current) return;
    const current = stateRef.current;
    const batches = new Map<string, { inbox: LocalInbox; contactId?: string }>();
    if (current.pendingInbox) {
      batches.set(current.pendingInbox.queueId, { inbox: current.pendingInbox });
    }
    for (const entry of current.contacts) {
      if (!isBlocked(contactIdentity(entry.contact.peerInvite))) {
        batches.set(entry.contact.inbox.queueId, { inbox: entry.contact.inbox, contactId: entry.id });
      }
    }
    if (batches.size === 0) return;

    pollingRef.current = true;
    setIsBusy(true);
    setError('');
    setStatus('');
    const stalledQueues = new Set<string>();
    let relayError = '';
    try {
      let next = current;
      let changed = false;
      for (const entry of current.contacts) {
        if (!entry.pendingOffer) continue;
        const peerTransport = getTransport(entry.contact.peerInvite.relayUrl);
        const offerSent = Boolean(
          peerTransport &&
            (await sendContactOffer(peerTransport, entry.contact.peerInvite, entry.contact.inbox)),
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
      for (const { inbox, contactId } of batches.values()) {
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
          relayError = friendlyError(receiveError);
          if (shouldFailoverRelay(relayFailuresRef.current, inbox.relayUrl)) {
            stalledQueues.add(inbox.queueId);
          }
          continue;
        }
        relayFailuresRef.current = noteRelaySuccess(relayFailuresRef.current, inbox.relayUrl);
        for (const packet of packets) {
          if (contactId) {
            if (packet.offer) {
              // Offers on an established inbox are not authenticated as queue
              // rotations, so never replace the saved peer invite implicitly.
              const bucket = acknowledgements.get(inbox.queueId) ?? { inbox, packetIds: [] };
              bucket.packetIds.push(packet.packetId);
              acknowledgements.set(inbox.queueId, bucket);
              continue;
            }
            const existing = next.contacts.find((entry) => entry.id === contactId);
            if (!existing) continue;
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
          const contact = contactFromOffer(inbox, packet.offer);
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
          } else if (next.pendingInbox?.queueId === inbox.queueId) {
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
      if (relayError) setError(relayError);
      let moved = false;
      for (const queueId of stalledQueues) {
        if (await failoverQueue(queueId)) moved = true;
      }
      if (moved) setStatus(labels.relayMoved);
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
      const uploaded = await transport.submitAbuseReport({
        v: 1,
        reportId: report.reportId,
        queueIdHash: report.queueIdHash,
        signingKeyHash: report.signingKeyHash,
        category: report.category,
      });
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
    try {
      result = await sendContactMessage(peerTransport, selectedContact.contact, body);
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
    try {
      sent = Boolean(await sendContactMessage(peerTransport, entry.contact, body));
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

  if (!isLoaded) {
    return <div className="flex h-full items-center justify-center bg-[#090a0e] text-sm text-white/60">{labels.loading}</div>;
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-[#090a0e] text-white">
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
      </header>

      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <section className="space-y-3">
          <div className="space-y-1 rounded-2xl border border-[var(--nova-accent-color)]/25 bg-[var(--nova-accent-color)]/[0.06] p-3">
            <h2 className="text-xs font-semibold text-white">{labels.setupTitle}</h2>
            <p className="text-xs leading-relaxed text-white/60">{labels.pairingGuide}</p>
            <p className="pt-1 text-[11px] leading-relaxed text-amber-200/75">{labels.privacyNote}</p>
          </div>
          <div className="space-y-3 rounded-2xl border border-white/10 bg-[#11131a] p-3">
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
            {inviteLink && (
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
                    <img
                      src={inviteQr}
                      alt={labels.showQr}
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

          <details className="rounded-2xl border border-white/10 bg-[#11131a] p-3">
            <summary className="cursor-pointer text-xs font-medium text-white/70">
              {labels.advanced}
            </summary>
            <form onSubmit={saveSettings} className="mt-3 space-y-2">
              <p className="text-xs leading-relaxed text-white/50">{labels.advancedNote}</p>
              {([
                ['relayUrl', labels.relayUrl, 'https://relay.example'],
                ['extraRelays', labels.extraRelays, 'https://relay2.example, https://relay3.example'],
                ['proxyUrl', labels.proxyUrl, 'https://proxy.example'],
                ['relayId', labels.relayId, 'relay-main'],
                ['relayPublicKey', labels.relayKey, 'base64url X25519 key'],
              ] as const).map(([field, label, placeholder]) => (
                <label key={field} className="block space-y-1 text-xs text-white/60">
                  <span>{label}</span>
                  <input
                    value={settingsForm[field]}
                    onChange={(event) =>
                      setSettingsForm((current) => ({ ...current, [field]: event.target.value }))
                    }
                    placeholder={placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[var(--nova-accent-color)]"
                  />
                </label>
              ))}
              <button
                type="submit"
                disabled={isBusy}
                className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-50"
              >
                {labels.saveSettings}
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
              {state.contacts.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedContactId(entry.id)}
                  className={`w-full truncate px-3 py-3 text-left text-sm ${
                    selectedContactId === entry.id ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  {entry.contact.peerInvite.displayName?.trim() ||
                    `Contact ${entry.id.slice(-6)}`}
                </button>
              ))}
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
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
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
    </main>
  );
};
