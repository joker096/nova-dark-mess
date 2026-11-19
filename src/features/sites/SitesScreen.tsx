/**
 * Mess&Anger — Sites feature.
 * Single screen managing three views: sites list → threads → chat.
 * E2EE via X25519 (same as widget). Site private key stored in localStorage.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useAccount } from '../../hooks/useAccount';
import { ArrowLeft, Plus, Lock, ShieldAlert, CheckCheck, Clock, MessageSquare, MoreVertical, X, Ban, Bell, BarChart3, Bot, Link2 } from 'lucide-react';
import {
  fetchSites, createSite, fetchThreads, fetchMessages, sendMessage, closeThread, blockGuest,
  fetchNotifications, fetchUnreadNotifications, markNotificationRead, type Notification,
  fetchStats, type DailyStat,
  createBotTokenApi, fetchBotTokens, deleteBotTokenApi, updateSiteSettings, type BotToken,
  buildOAuthAuthorizeUrl, generateCodeVerifier,
  connectWs, subscribeSites,
  type Site, type Thread, type Message,
} from './sitesApi';
import { x25519 } from '@noble/curves/ed25519.js';

function b64u(bytes: Uint8Array): string {
  return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64u(s: string): Uint8Array {
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
function ab2str(buf: ArrayBuffer): string { return new TextDecoder().decode(buf); }
function str2ab(str: string): Uint8Array { return new TextEncoder().encode(str); }
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

type View = 'sites' | 'threads' | 'chat';

interface DecryptedMessage extends Message {
  plainText?: string;
  decryptError?: boolean;
}

const wizardModal = (
  step: 1 | 2,
  wizardSite: { site_id: string; site_pubkey: string; snippet: string } | null,
  wizardForm: { name: string; domains: string; greeting: string; color: string; language: string; position: string; dnd: boolean; dndStart: string; dndEnd: string },
  setWizardForm: (f: { name: string; domains: string; greeting: string; color: string; language: string; position: string; dnd: boolean; dndStart: string; dndEnd: string }) => void,
  onClose: () => void,
  onSubmit: (e: React.FormEvent) => void,
  t: any
) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
    <div className="w-full max-w-md bg-[#151621] border border-white/15 rounded-3xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
      {step === 1 ? (
        <>
          <h2 className="font-semibold text-white text-lg">{t('sites.wizard.title')}</h2>
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <div>
              <label className="text-[11px] text-[#8c919d] block mb-1">{t('sites.wizard.name')}</label>
              <input value={wizardForm.name} onChange={(e) => setWizardForm({ ...wizardForm, name: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white focus:outline-none focus:border-[var(--nova-accent-color,#ff4e18)] text-sm" />
            </div>
            <div>
              <label className="text-[11px] text-[#8c919d] block mb-1">{t('sites.wizard.domains')}</label>
              <input value={wizardForm.domains} onChange={(e) => setWizardForm({ ...wizardForm, domains: e.target.value })} placeholder="http://localhost:3000, https://example.com" className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white focus:outline-none focus:border-[var(--nova-accent-color,#ff4e18)] text-sm" />
              <p className="text-[10px] text-[#8c919d] mt-1">{t('sites.wizard.domainsHint')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#8c919d] block mb-1">{t('sites.wizard.color')}</label>
                <input type="color" value={wizardForm.color} onChange={(e) => setWizardForm({ ...wizardForm, color: e.target.value })} className="w-full h-10 rounded-lg border-none bg-transparent cursor-pointer" />
              </div>
              <div>
                <label className="text-[11px] text-[#8c919d] block mb-1">{t('sites.wizard.language')}</label>
                <select value={wizardForm.language} onChange={(e) => setWizardForm({ ...wizardForm, language: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white focus:outline-none focus:border-[var(--nova-accent-color,#ff4e18)] text-sm">
                  <option value="en">English</option>
                  <option value="ru">Русский</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-white/[0.1]">
              <input type="checkbox" checked={wizardForm.dnd} onChange={(e) => setWizardForm({ ...wizardForm, dnd: e.target.checked })} className="rounded bg-white/[0.05] border-white/[0.2] text-[#ff4e18] focus:ring-0" />
              <label className="text-[11px] text-[#8c919d] cursor-pointer">{t('sites.wizard.dnd')}</label>
            </div>
            <div className="flex justify-between">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[#8c919d] hover:text-white text-sm">{t('common.cancel')}</button>
              <button type="submit" disabled={!wizardForm.name.trim()} className="px-4 py-2 rounded-lg bg-[var(--nova-accent-color,#ff4e18)] text-white text-xs font-semibold disabled:opacity-50">{t('sites.wizard.create')}</button>
            </div>
          </form>
        </>
      ) : (
        <>
          <h2 className="font-semibold text-white text-lg">{t('sites.wizard.created')}</h2>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[#8c919d] text-xs">{t('sites.wizard.siteId')}:</span>
              <code className="text-xs text-[#8c919d] truncate">{wizardSite?.site_id}</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#8c919d] text-xs">{t('sites.wizard.pubkey')}:</span>
              <code className="text-xs text-[#8c919d] truncate">{wizardSite?.site_pubkey}</code>
            </div>
          </div>
          <div className="mt-3">
            <label className="text-[11px] text-[#8c919d] block mb-1">{t('sites.wizard.snippet')}</label>
            <div className="flex gap-2">
              <input value={wizardSite?.snippet} readOnly className="flex-1 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white text-xs focus:outline-none" />
              <button onClick={() => { navigator.clipboard.writeText(wizardSite?.snippet || ''); }} className="px-4 py-2 rounded-lg bg-[var(--nova-accent-color,#ff4e18)] text-white text-xs font-semibold">{t('common.copy')}</button>
            </div>
          </div>
          <button onClick={onClose} className="w-full px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white text-xs font-semibold hover:bg-white/[0.1]">{t('common.close')}</button>
        </>
      )}
    </div>
  </div>
);

export default function SitesScreen({
  onBack,
}: { onBack: () => void }) {
  const { t } = useLanguage();
  const { account } = useAccount();

  const [view, setView] = useState<View>('sites');
  const [sites, setSites] = useState<Site[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [wizardForm, setWizardForm] = useState({
    name: '', domains: '', greeting: 'Hello! How can I help?', color: '#007aff', language: 'en', position: 'bottom-right',
    dnd: false, dndStart: '22:00', dndEnd: '08:00',
  });
  const [wizardSite, setWizardSite] = useState<{ site_id: string; site_pubkey: string; snippet: string } | null>(null);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [mutating, setMutating] = useState(false);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);

  const [stats, setStats] = useState<DailyStat[]>([]);
  const [statsDays, setStatsDays] = useState<7 | 30>(7);
  const [statsPanelOpen, setStatsPanelOpen] = useState(false);

  const [botPanelOpen, setBotPanelOpen] = useState(false);
  const [botSiteId, setBotSiteId] = useState('');
  const [botWebhookUrl, setBotWebhookUrl] = useState('');
  const [botSecret, setBotSecret] = useState('');
  const [botTokens, setBotTokens] = useState<BotToken[]>([]);
  const [oauthUrl, setOauthUrl] = useState('');
  const [oauthShowing, setOauthShowing] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const sitePrivKeyRef = useRef<Uint8Array | null>(null);

  /* ───── load sites ───── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await fetchSites();
        if (!cancelled) setSites(list);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load sites');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ───── threads for selected site ───── */
  useEffect(() => {
    if (!selectedSite) { setThreads([]); setNotifications([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchThreads(selectedSite.id);
        if (!cancelled) setThreads(list);
        const notes = await fetchNotifications(selectedSite.id);
        if (!cancelled) setNotifications(notes);
        if (!cancelled) setUnreadCount(notes.filter((n) => !n.read).length);
        const st = await fetchStats(selectedSite.id);
        if (!cancelled) setStats(st);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [selectedSite]);

  /* ───── crypto ───── */
  async function ensureSiteKey(site: Site): Promise<Uint8Array> {
    if (sitePrivKeyRef.current) return sitePrivKeyRef.current;
    const stored = localStorage.getItem('mwa_site_priv_' + site.id);
    if (stored) {
      sitePrivKeyRef.current = fromB64u(stored);
      return sitePrivKeyRef.current;
    }
    const pair = x25519.utils.randomSecretKey();
    sitePrivKeyRef.current = pair;
    try { localStorage.setItem('mwa_site_priv_' + site.id, b64u(pair)); } catch { /* ignore */ }
    return pair;
  }

  async function decryptMessage(m: Message): Promise<string> {
    const priv = await ensureSiteKey(selectedSite!);
    const shared = x25519.getSharedSecret(priv, fromB64u(m.ephemeral_pubkey)) as BufferSource;
    const keyMaterial = await crypto.subtle.importKey('raw', shared, 'HKDF-SHA256', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'HKDF-SHA256', salt: str2ab('site-gateway-v1') as BufferSource, info: str2ab(selectedThread!.id) as BufferSource, hash: 'SHA-256' },
      keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    const iv = fromB64u(m.nonce) as BufferSource;
    const ct = fromB64u(m.ciphertext) as BufferSource;
    return ab2str(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
  }

  /* ───── unread count (all sites) ───── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const j = await fetchUnreadNotifications();
        if (!cancelled) setUnreadCount(j.count);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ───── messages + WS for selected thread ───── */
  useEffect(() => {
    if (!selectedThread) { setMessages([]); sitePrivKeyRef.current = null; return; }
    let cancelled = false;
    const load = async () => {
      try {
        const list = await fetchMessages(selectedThread.id);
        const decrypted: DecryptedMessage[] = [];
        for (const m of list) {
          const dm = m as DecryptedMessage;
          try {
            dm.plainText = await decryptMessage(m);
          } catch {
            dm.decryptError = true;
            dm.plainText = '[не удалось расшифровать]';
          }
          decrypted.push(dm);
        }
        if (!cancelled) setMessages(decrypted);
        const stored = localStorage.getItem('mwa_site_priv_' + selectedSite!.id);
        if (stored && !sitePrivKeyRef.current) sitePrivKeyRef.current = fromB64u(stored);
      } catch { /* ignore */ }
    };
    load();

    const token = (import.meta.env.VITE_SITE_OWNER_TOKEN || 'dev-token-123');
    const ws = connectWs(token, (data) => {
      if (data.type === 'notification') {
        if (!cancelled) setNotifications(prev => [data as Notification, ...prev]);
        if (!cancelled) setUnreadCount(prev => prev + 1);
        return;
      }
      if (data.type === 'thread.closed' && data.thread_id === selectedThread!.id) {
        if (!cancelled) { setSelectedThread(null); setView('threads'); }
        return;
      }
      if (data.type === 'thread.new' && view === 'threads') {
        if (!cancelled) setNotifications(prev => [data as Notification, ...prev]);
        if (!cancelled) setUnreadCount(prev => prev + 1);
        return;
      }
      if (data.type === 'message.new' && data.thread_id === selectedThread!.id) {
        const dm: DecryptedMessage = { ...data, plainText: undefined, decryptError: false };
        if (!cancelled) setMessages(prev => [...prev, dm]);
        if (!cancelled) setThreads(prev => prev.map(t => t.id === selectedThread!.id ? { ...t, last_message_at: data.created_at } : t));
      }
      if (data.type === 'connected') {
        if (!cancelled) setOnline(true);
        subscribeSites(ws, [selectedSite!.id]);
      }
    });
    wsRef.current = ws;
    return () => { cancelled = true; ws.close(); };
  }, [selectedThread]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !selectedThread || !online) return;
    setSending(true);
    try {
      const pair = x25519.utils.randomSecretKey();
      const shared = x25519.getSharedSecret(pair, fromB64u(selectedSite!.site_pubkey)) as BufferSource;
      const keyMaterial = await crypto.subtle.importKey('raw', shared, 'HKDF-SHA256', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey(
        { name: 'HKDF-SHA256', salt: str2ab('site-gateway-v1') as BufferSource, info: str2ab(selectedThread.id) as BufferSource, hash: 'SHA-256' },
        keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, str2ab(input.trim()) as BufferSource);
      const ctArr = new Uint8Array(ct);
      const ephemPub = new Uint8Array(x25519.getPublicKey(pair));
      await sendMessage(selectedThread.id, b64u(ctArr), b64u(iv), b64u(ephemPub));
      setInput('');
    } catch (err: any) {
      setError(err.message || 'Send failed');
    } finally {
      setSending(false);
    }
  }

  function openWizard() {
    setWizardStep(1);
    setWizardSite(null);
    setWizardOpen(true);
  }

  function closeWizard() {
    setWizardOpen(false);
    setWizardStep(1);
    setWizardSite(null);
  }

  async function handleWizardSubmit(e: React.FormEvent) {
    e.preventDefault();
    const domains = wizardForm.domains.split(',').map((d) => d.trim()).filter(Boolean);
    if (!wizardForm.name.trim() || domains.length === 0) return;
    try {
      const created = await createSite({
        name: wizardForm.name.trim(),
        domains,
        owner_user_id: account.id,
        settings: { color: wizardForm.color, greeting: wizardForm.greeting, language: wizardForm.language, position: wizardForm.position, dnd: { enabled: wizardForm.dnd, start: wizardForm.dndStart, end: wizardForm.dndEnd } },
      });
      setWizardSite(created);
      setWizardStep(2);
    } catch (err: any) {
      setError(err.message || 'Failed to create site');
    }
  }

  async function doCloseThread() {
    if (!selectedThread) return;
    setMutating(true);
    try {
      await closeThread(selectedThread.id);
      setCloseConfirm(false);
      setSelectedThread(null);
      setView('threads');
    } catch (err: any) {
      setError(err.message || 'Failed to close thread');
    } finally {
      setMutating(false);
    }
  }

  async function doBlockGuest() {
    if (!selectedThread) return;
    setMutating(true);
    try {
      await blockGuest(selectedThread.guest_id);
      setBlockConfirm(false);
      setSelectedThread(null);
      setView('threads');
    } catch (err: any) {
      setError(err.message || 'Failed to block guest');
    } finally {
      setMutating(false);
    }
  }

  async function markAsRead(id: string) {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  }

  async function openBotPanel(site: Site) {
    setBotSiteId(site.id);
    setBotWebhookUrl((site.settings && site.settings.bot_webhook_url) || '');
    setBotSecret((site.settings && site.settings.bot_secret) || '');
    try {
      const tokens = await fetchBotTokens(site.id);
      setBotTokens(tokens);
    } catch { /* ignore */ }
    setBotPanelOpen(true);
  }

  async function saveBotConfig() {
    if (!botSiteId) return;
    try {
      await updateSiteSettings(botSiteId, { bot_webhook_url: botWebhookUrl, bot_secret: botSecret });
      setBotPanelOpen(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save bot config');
    }
  }

  async function revokeBotToken(token: string) {
    try {
      await deleteBotTokenApi(token);
      setBotTokens(botTokens.filter((t) => t.token !== token));
    } catch { /* ignore */ }
  }

  async function createOAuthLink() {
    if (!selectedSite) return;
    const verifier = await generateCodeVerifier();
    const state = await generateCodeVerifier();
    const redirectUri = window.location.origin + '/oauth-callback';
    const url = await buildOAuthAuthorizeUrl(selectedSite.id, redirectUri, state, verifier, 'notify');
    setOauthUrl(url);
    setOauthShowing(true);
  }

  const wizardContent = wizardModal(
    wizardStep, wizardSite, wizardForm, setWizardForm, closeWizard, handleWizardSubmit, t
  );

  /* ───── render ───── */
  if (view === 'sites') {
    return (
      <>
        <div className="h-full flex flex-col bg-[#0c0d11] text-white">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] shrink-0">
            <button onClick={onBack} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08]" aria-label={t('common.back')}>
              <ArrowLeft size={18} />
            </button>
            <h1 className="font-semibold text-[15px]">{t('sites.title')}</h1>
            <button onClick={() => setNotifPanelOpen(!notifPanelOpen)} className={`w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] relative ${unreadCount > 0 ? 'text-[#ff4e18]' : ''}`} aria-label={t('sites.notifications')}>
              <Bell size={18} />
              {unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#ff4e18]" aria-hidden="true" />}
            </button>
          </header>
          <main className="flex-1 overflow-y-auto p-4">
            {loading && <div className="text-center py-10 text-[#8c919d] text-xs">{t('common.loading')}</div>}
            {error && <div className="p-4 rounded-xl bg-red/10 border border-red/30 text-red text-xs">{error}</div>}
            {!loading && !error && sites.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Lock className="w-12 h-12 text-[#8c919d] mb-3" />
                <h3 className="font-semibold text-white mb-2">{t('sites.noSites')}</h3>
                <p className="text-[#8c919d] text-xs max-w-xs">{t('sites.noSitesDesc')}</p>
                <button onClick={openWizard} className="mt-4 px-4 py-2 rounded-xl bg-[var(--nova-accent-color,#ff4e18)] text-white text-xs font-semibold hover:opacity-90">
                  {t('sites.connectSite')}
                </button>
              </div>
            )}
            {!loading && !error && sites.length > 0 && sites.some((s) => s.confirmed) && (
              <div className="space-y-2">
                {sites.map((site) => (
                  <button
                    key={site.id}
                    onClick={() => { setSelectedSite(site); setView('threads'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-left transition"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{site.name}</div>
                      <div className="text-[11px] text-[#8c919d] truncate">{site.domains.join(', ')}</div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
                    <button onClick={(e) => { e.stopPropagation(); openBotPanel(site); }} className="w-6 h-6 rounded-lg flex items-center justify-center text-[#8c919d] hover:text-white hover:bg-white/[0.1]" aria-label={t('sites.manageBot')}>
                      <Bot size={16} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); createOAuthLink(); }} className="w-6 h-6 rounded-lg flex items-center justify-center text-[#8c919d] hover:text-[#ff4e18] hover:bg-white/[0.1]" aria-label={t('sites.createOAuthLink')}>
                      <Link2 size={16} />
                    </button>
                  </button>
                ))}
              </div>
            )}
            {!loading && !error && sites.length > 0 && !sites.some((s) => s.confirmed) && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <ShieldAlert className="w-12 h-12 text-[#ff4e18] mb-3" />
                <h3 className="font-semibold text-white mb-2">{t('sites.notConfirmed')}</h3>
                <p className="text-[#8c919d] text-xs max-w-xs text-center">{t('sites.notConfirmedDesc')}</p>
                <button onClick={openWizard} className="mt-4 px-4 py-2 rounded-xl bg-[var(--nova-accent-color,#ff4e18)] text-white text-xs font-semibold hover:opacity-90">
                  {t('sites.connectSite')}
                </button>
              </div>
            )}
          </main>
        </div>
        {wizardOpen && wizardContent}
      </>
    );
  }

  if (view === 'threads') {
    return (
      <>
        <div className="h-full flex flex-col bg-[#0c0d11] text-white">
          <header className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] shrink-0">
            <button onClick={() => { setSelectedSite(null); setView('sites'); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08]" aria-label={t('common.back')}>
              <ArrowLeft size={18} />
            </button>
            <h1 className="font-semibold text-[15px] truncate flex-1">{selectedSite?.name}</h1>
            <button onClick={openWizard} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08]" aria-label={t('sites.connectSite')}>
              <Plus size={16} />
            </button>
            <button onClick={() => setNotifPanelOpen(!notifPanelOpen)} className={`w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08] relative ${unreadCount > 0 ? 'text-[#ff4e18]' : ''}`} aria-label={t('sites.notifications')}>
              <Bell size={18} />
              {unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#ff4e18]" aria-hidden="true" />}
            </button>
            <button onClick={() => { setStatsPanelOpen(!statsPanelOpen); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08]" aria-label={t('sites.analytics')}>
              <BarChart3 size={18} />
            </button>
          </header>
          <main className="flex-1 overflow-y-auto p-4">
            {threads.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <MessageSquare className="w-12 h-12 text-[#8c919d] mb-3" />
                <h3 className="font-semibold text-white mb-2">{t('sites.noThreads')}</h3>
                <p className="text-[#8c919d] text-xs">{t('sites.noThreadsDesc')}</p>
              </div>
            )}
            <div className="space-y-2">
              {threads.map((th) => (
                <button
                  key={th.id}
                  onClick={() => { setSelectedThread(th); setView('chat'); }}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] text-left transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white truncate">{t('sites.guestChat', { site: selectedSite!.name })}</div>
                    <div className="text-[11px] text-[#8c919d] truncate">{fmtTime(th.last_message_at || th.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
                    {th.status === 'open' ? null : <Lock size={14} className="text-[#8c919d]" />}
                  </div>
                </button>
              ))}
            </div>
          </main>
        </div>
        {wizardOpen && wizardContent}
        {notifPanelOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setNotifPanelOpen(false)}>
            <div className="w-full max-w-md bg-[#151621] border border-white/15 rounded-3xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-semibold text-white text-lg">{t('sites.notificationsTitle')}</h2>
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-[#8c919d] text-xs">{t('sites.notificationsEmpty')}</div>
              ) : (
                <div className="space-y-2">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => { markAsRead(n.id); setNotifPanelOpen(false); }}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl ${!n.read ? 'bg-white/[0.05] border border-white/[0.1]' : 'bg-white/[0.02]'} cursor-pointer hover:bg-white/[0.05] transition`}
                    >
                      <div className="w-2 h-2 rounded-full bg-[#ff4e18]" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-white truncate">{n.preview || t('sites.notificationNew')}</div>
                        <div className="text-[10px] text-[#8c919d]">{new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => setNotifPanelOpen(false)} className="w-full px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white text-xs font-semibold hover:bg-white/[0.1]">{t('common.close')}</button>
            </div>
          </div>
        )}
        {statsPanelOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setStatsPanelOpen(false)}>
            <div className="w-full max-w-md bg-[#151621] border border-white/15 rounded-3xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-white text-lg">{t('sites.statsTitle')}</h2>
                <div className="flex gap-2">
                  <button onClick={() => setStatsDays(7)} className={`px-3 py-1 rounded-lg text-xs ${statsDays === 7 ? 'bg-[#ff4e18] text-white' : 'bg-white/[0.05] text-[#8c919d] border border-white/[0.1]'}`}>7 {t('sites.statsDays')}</button>
                  <button onClick={() => setStatsDays(30)} className={`px-3 py-1 rounded-lg text-xs ${statsDays === 30 ? 'bg-[#ff4e18] text-white' : 'bg-white/[0.05] text-[#8c919d] border border-white/[0.1]'}`}>30 {t('sites.statsDays')}</button>
                </div>
              </div>
              {stats.length === 0 ? (
                <div className="text-center py-8 text-[#8c919d] text-xs">{t('sites.statsEmpty')}</div>
              ) : (
                <div className="space-y-2">
                  {stats.slice(0, statsDays).map((s) => (
                    <div key={s.date} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                      <div>
                        <div className="text-xs text-[#8c919d]">{s.date}</div>
                        <div className="text-xs font-medium text-white">{t('sites.statsLoaded', { count: s.loaded })}</div>
                      </div>
                      <div className="flex gap-2 text-[10px] text-[#8c919d]">
                        <span>{t('sites.statsOpened', { count: s.opened })}</span>
                        <span>{t('sites.statsFirstMsg', { count: s.first_message })}</span>
                        <span>{t('sites.statsOwnerReplied', { count: s.owner_replied })}</span>
                        <span>{t('sites.statsHandoffCompleted', { count: s.handoff_completed })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => setStatsPanelOpen(false)} className="w-full px-4 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white text-xs font-semibold hover:bg-white/[0.1]">{t('common.close')}</button>
            </div>
          </div>
        )}
        {botPanelOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setBotPanelOpen(false)}>
            <div className="w-full max-w-md bg-[#151621] border border-white/15 rounded-3xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-semibold text-white text-lg">{t('sites.botTitle')}</h2>
              <form onSubmit={(e) => { e.preventDefault(); saveBotConfig(); }} className="mt-4 space-y-3">
                <div>
                  <label className="text-[11px] text-[#8c919d] block mb-1">{t('sites.botWebhookUrl')}</label>
                  <input value={botWebhookUrl} onChange={(e) => setBotWebhookUrl(e.target.value)} placeholder="https://your-server.com/webhook" className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white focus:outline-none focus:border-[var(--nova-accent-color,#ff4e18)] text-sm" />
                </div>
                <div>
                  <label className="text-[11px] text-[#8c919d] block mb-1">{t('sites.botSecret')}</label>
                  <input value={botSecret} onChange={(e) => setBotSecret(e.target.value)} placeholder="random-secret" className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.1] text-white focus:outline-none focus:border-[var(--nova-accent-color,#ff4e18)] text-sm" />
                  <p className="text-[10px] text-[#8c919d] mt-1">{t('sites.botSecretHint')}</p>
                </div>
                <div className="flex justify-between">
                  <button type="button" onClick={() => setBotPanelOpen(false)} className="px-4 py-2 rounded-lg text-[#8c919d] hover:text-white text-sm">{t('common.cancel')}</button>
                  <button type="submit" className="px-4 py-2 rounded-lg bg-[var(--nova-accent-color,#ff4e18)] text-white text-xs font-semibold">{t('sites.botSave')}</button>
                </div>
              </form>
              <div className="mt-4 border-t border-white/[0.1] pt-3 space-y-2">
                <h3 className="text-xs text-[#8c919d]">{t('sites.botTokens')}</h3>
                {botTokens.length === 0 ? (
                  <div className="text-center py-4 text-[#8c919d] text-xs">{t('sites.botTokensEmpty')}</div>
                ) : (
                  <div className="space-y-1">
                    {botTokens.map((bt) => (
                      <div key={bt.token} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                        <span className="text-[10px] text-[#8c919d] truncate">{bt.token}</span>
                        <button onClick={(e) => { e.stopPropagation(); revokeBotToken(bt.token); }} className="text-[#ff4e18] text-[10px] hover:underline">{t('sites.botRevoke')}</button>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={async () => {
                  try {
                    const t = await createBotTokenApi(botSiteId);
                    setBotTokens([...botTokens, t]);
                  } catch { /* ignore */ }
                }} className="w-full px-4 py-2 rounded-lg border border-white/[0.1] text-[#8c919d] text-xs hover:bg-white/[0.05]">{t('sites.botCreateToken')}</button>
              </div>
            </div>
          </div>
        )}
        {oauthShowing && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setOauthShowing(false)}>
            <div className="w-full max-w-md bg-[#151621] border border-white/15 rounded-3xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-semibold text-white text-lg">{t('sites.oauthTitle')}</h2>
              <p className="text-[#8c919d] text-xs">{t('sites.oauthDesc')}</p>
              <div className="bg-[#0c0d11] border border-white/[0.1] rounded-lg p-3 text-[11px] text-[#8c919d] break-all mb-3">{oauthUrl}</div>
              <div className="flex gap-2">
                <button onClick={() => { navigator.clipboard.writeText(oauthUrl); setOauthShowing(false); }} className="flex-1 px-4 py-2 rounded-lg bg-[var(--nova-accent-color,#ff4e18)] text-white text-xs font-semibold">{t('sites.oauthCopy')}</button>
                <button onClick={() => setOauthShowing(false)} className="px-4 py-2 rounded-lg text-[#8c919d] hover:text-white text-sm">{t('common.close')}</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  /* view === 'chat' */
  return (
    <>
      <div className="h-full flex flex-col bg-[#090a0e] text-white">
        <header className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] shrink-0">
          <button onClick={() => { setSelectedThread(null); setView('threads'); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08]" aria-label={t('common.back')}>
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[15px] truncate">{t('sites.guestChat', { site: selectedSite!.name })}</div>
            <div className="text-[11px] text-[#8c919d]">{online ? t('sites.online') : t('sites.offline')}</div>
          </div>
          {!online && <ShieldAlert className="w-5 h-5 text-[#8c919d]" />}
          <button onClick={() => setActionsOpen(!actionsOpen)} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[0.08]" aria-label={t('sites.threadActions')}>
            <MoreVertical size={18} />
          </button>
          {actionsOpen && (
            <div className="absolute right-4 top-14 w-48 bg-[#151621] border border-white/15 rounded-xl shadow-2xl p-2">
              <button onClick={() => { setActionsOpen(false); setCloseConfirm(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-[#8c919d] hover:bg-white/[0.05] rounded-lg">
                <Ban size={14} className="shrink-0" />
                {t('sites.actionCloseThread')}
              </button>
              <button onClick={() => { setActionsOpen(false); setBlockConfirm(true); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-[#8c919d] hover:bg-white/[0.05] rounded-lg">
                <X size={14} className="shrink-0" />
                {t('sites.actionBlockGuest')}
              </button>
            </div>
          )}
        </header>
        <main className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            {messages.map((m) => {
              const mine = m.sender === 'owner';
              const text = m.plainText ?? (m.decryptError ? '[не удалось расшифровать]' : '…');
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${mine ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white rounded-tr-none' : 'bg-white/[0.08] text-white rounded-tl-none'}`}>
                    {text}
                    <div className="text-[10px] opacity-60 mt-1">{fmtTime(m.created_at)} {m.delivered_at ? <CheckCheck size={10} className="ml-1 inline" /> : <Clock size={10} className="ml-1 inline text-[#8c919d]" />}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {!online && <div className="text-center py-4 text-[#8c919d] text-xs">{t('sites.ownerOffline')}</div>}
        </main>
        <form onSubmit={handleSend} className="p-4 border-t border-white/[0.06] bg-[#0c0d11] shrink-0">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('sites.typeMessage')}
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white placeholder-[#8c919d] focus:outline-none focus:border-[var(--nova-accent-color,#ff4e18)] text-sm"
              disabled={!online}
            />
            <button type="submit" disabled={!input.trim() || sending || !online} className="px-4 py-2.5 rounded-xl bg-[var(--nova-accent-color,#ff4e18)] text-white text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90">
              {t('common.send') || 'Send'}
            </button>
          </div>
        </form>
      </div>
      {wizardOpen && wizardContent}
      {closeConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setCloseConfirm(false)}>
          <div className="bg-[#151621] border border-white/15 rounded-3xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-white">{t('sites.confirmCloseTitle')}</h3>
            <p className="text-[#8c919d] text-xs">{t('sites.confirmCloseBody')}</p>
            <div className="flex gap-2">
              <button onClick={() => setCloseConfirm(false)} className="px-4 py-2 rounded-lg text-[#8c919d] hover:text-white text-xs">{t('common.cancel')}</button>
              <button onClick={doCloseThread} disabled={mutating} className="px-4 py-2 rounded-lg bg-red/20 border border-red/30 text-red text-xs font-semibold disabled:opacity-50">{t('sites.actionCloseThread')}</button>
            </div>
          </div>
        </div>
      )}
      {blockConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setBlockConfirm(false)}>
          <div className="bg-[#151621] border border-white/15 rounded-3xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-white">{t('sites.confirmBlockTitle')}</h3>
            <p className="text-[#8c919d] text-xs">{t('sites.confirmBlockBody')}</p>
            <div className="flex gap-2">
              <button onClick={() => setBlockConfirm(false)} className="px-4 py-2 rounded-lg text-[#8c919d] hover:text-white text-xs">{t('common.cancel')}</button>
              <button onClick={doBlockGuest} disabled={mutating} className="px-4 py-2 rounded-lg bg-red/20 border border-red/30 text-red text-xs font-semibold disabled:opacity-50">{t('sites.actionBlockGuest')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
