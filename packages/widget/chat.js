/**
 * Mess&Anger widget chat — runs inside iframe.
 * E2EE: guest X25519 ephemeral per message, ECDH with site_pubkey, HKDF-SHA256, AES-256-GCM.
 * Imports x25519 from @noble/curves (bundled by vite).
 */

import { x25519 } from '@noble/curves/ed25519.js';

/* ───── config from URL ───── */
const params = new URLSearchParams(location.search);
const SITE_ID = params.get('site') || '';
const GW = location.origin; /* same-origin: gateway serves widget + API */
const REST = GW + '/v1';
const WS_URL = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/v1/guest/ws';

/* ───── DOM ───── */
const $chat = document.getElementById('wvc-chat');
const $title = document.getElementById('wvc-title');
const $status = document.getElementById('wvc-status');
const $messages = document.getElementById('wvc-messages');
const $typing = document.getElementById('wvc-typing');
const $composer = document.getElementById('wvc-composer');
const $input = document.getElementById('wvc-input');
const $send = document.getElementById('wvc-send');
const $branding = document.querySelector('.wvc-branding a');

/* ───── state ───── */
let sitePubkey = '';
let guestPrivKey = null;   /* Uint8Array X25519 private key */
let guestPubKey = '';      /* base64url */
let guestToken = '';
let threadId = '';
let ws = null;
let reconnectTimer = null;
let online = false;
let myColorScheme = null;
let accentColor = '#007aff';

/* ───── localization (ru/en) ───── */
const LANG = {
  ru: {
    title: 'Чат',
    connected: 'Подключено',
    disconnected: 'Отключено. Переподключение…',
    typing: 'Печатает…',
    decryptFailed: '[не удалось расшифровать]',
    initError: 'Ошибка подключения. Повтор через 5 сек…',
    copyLink: 'Скопировать ссылку',
    copied: 'Скопировано!',
    handoffError: 'handoff error:',
    keysGenerated: 'guest keys generated',
    keysLoaded: 'guest keys loaded from storage',
    sessionCreated: 'session created: thread',
    configLoaded: 'config loaded',
    wsOpen: 'ws open',
    wsClose: 'ws close',
    wsError: 'ws error',
    powFailed: 'pow challenge failed',
    sessionFailed: 'session failed',
    placeholder: 'Напишите сообщение…',
    send: 'Отправить',
    close: 'Закрыть чат',
    deleteData: 'Удалить мои данные',
    deleteConfirm: 'Удалить ваши ключи и сессию для этого сайта? Это действие необратимо.',
    dataDeleted: 'Ваши данные удалены.',
  },
  en: {
    title: 'Chat',
    connected: 'Connected',
    disconnected: 'Disconnected. Reconnecting…',
    typing: 'Typing…',
    decryptFailed: '[failed to decrypt]',
    initError: 'Connection error. Retrying in 5s…',
    copyLink: 'Copy link',
    copied: 'Copied!',
    handoffError: 'handoff error:',
    keysGenerated: 'guest keys generated',
    keysLoaded: 'guest keys loaded from storage',
    sessionCreated: 'session created: thread',
    configLoaded: 'config loaded',
    wsOpen: 'ws open',
    wsClose: 'ws close',
    wsError: 'ws error',
    powFailed: 'pow challenge failed',
    sessionFailed: 'session failed',
    placeholder: 'Write a message…',
    send: 'Send',
    close: 'Close chat',
    deleteData: 'Delete my data',
    deleteConfirm: 'Delete your keys and session for this site? This cannot be undone.',
    dataDeleted: 'Your data has been deleted.',
  },
};
let currentLang = 'ru';
function t(key) { return (LANG[currentLang] || LANG.ru)[key] || key; }

/* ───── postMessage bridge to parent page (spec §1.4) ───── */
function postToParent(msg) {
  try { window.parent.postMessage({ source: 'wvc-widget', ...msg }, '*'); } catch {}
}
function reportStatus() {
  postToParent({ type: 'status', online, threadId, site: SITE_ID, handoffCompleted });
}
function handleParentMessage(ev) {
  try {
    const data = ev.data;
    if (!data || data.source !== 'wvc-page') return;
    if (data.cmd === 'open') { $chat.style.display = 'block'; reportStatus(); }
    else if (data.cmd === 'close') { $chat.style.display = 'none'; reportStatus(); }
    else if (data.cmd === 'send_message' && data.text) { sendMessage(data.text); }
    else if (data.cmd === 'get_status') { reportStatus(); }
  } catch {}
}
window.addEventListener('message', handleParentMessage);

/* ───── crypto helpers (from ./crypto.js) ───── */
import {
  b64u,
  fromB64u,
  ab2str,
  str2ab,
  generateGuestKeys,
  powDigest,
  leadingZeroBits,
  solvePow,
  encryptMessage,
  decryptMessage,
} from './crypto.js';
function log(msg){ $status.textContent = msg; console.log('[widget]', msg); }
function escapeHtml(s){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

function setTheme() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.classList.toggle('dark', dark);
  document.body.classList.toggle('light', !dark);
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setTheme);
setTheme();

function renderMessage(text, sender, meta, statusIcon) {
  const div = document.createElement('div');
  div.className = 'wvc-msg ' + sender;
  div.textContent = text;
  if (meta) {
    const m = document.createElement('span');
    m.className = 'wvc-meta';
    m.textContent = meta;
    div.appendChild(m);
  }
  if (statusIcon) {
    const s = document.createElement('span');
    s.className = 'wvc-status-icon';
    s.textContent = statusIcon;
    div.appendChild(s);
  }
  $messages.appendChild(div);
  $messages.scrollTop = $messages.scrollHeight;
}

function renderSystem(text) {
  renderMessage(text, 'system');
}

function renderTyping(show) {
  $typing.textContent = show ? t('typing') : '';
}

/* ───── crypto: keys + pow + e2ee handled by ./crypto.js ───── */

/* ───── API ───── */
async function fetchConfig() {
  const r = await fetch(REST + '/widget/config?site=' + encodeURIComponent(SITE_ID));
  const j = await r.json();
  if (!j.ok) throw new Error(j.reason || 'config failed');
  sitePubkey = j.site_pubkey;
  const s = j.settings || {};
  if (s.language) { currentLang = s.language; document.documentElement.lang = s.language; }
  accentColor = s.color || '#007aff';
  document.documentElement.style.setProperty('--wvc-accent', accentColor);
  $title.textContent = s.greeting || t('title');
  const $brandingLink = document.getElementById('wvc-branding-link');
  $brandingLink.href = 'https://mess.cvr.name/?utm_source=widget&utm_medium=referral&utm_campaign=' + encodeURIComponent(SITE_ID);
  if (s.hide_branding) {
    document.querySelector('.wvc-branding').style.display = 'none';
  }
  log(t('configLoaded'));
}

async function createSession() {
  const r = await fetch(REST + '/guest/pow-challenge?site=' + encodeURIComponent(SITE_ID) + '&guest_pubkey=' + encodeURIComponent(guestPubKey));
  const j = await r.json();
  if (!j.ok) throw new Error(j.reason || t('powFailed'));
  const solution = await solvePow(j.challenge.challenge, j.difficulty);
  const sr = await fetch(REST + '/guest/session', {
    method: 'POST', headers: {'Content-Type': 'application/json', Origin: location.origin},
    body: JSON.stringify({ site_id: SITE_ID, guest_pubkey: guestPubKey, challenge_id: j.challengeId, pow: solution }),
  });
  const sj = await sr.json();
  if (!sj.ok) throw new Error(sj.reason || t('sessionFailed'));
  guestToken = sj.guest_token;
  threadId = sj.thread_id;
  log(t('sessionCreated') + ' ' + threadId);
}

/* ───── WebSocket ───── */
function connectWs() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  const url = WS_URL + '?token=' + encodeURIComponent(guestToken);
  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { online = true; log(t('wsOpen')); renderSystem(t('connected')); $send.disabled = false; $input.disabled = false; $input.focus(); reportStatus(); };
  ws.onclose = () => { online = false; log(t('wsClose')); renderSystem(t('disconnected')); $send.disabled = true; $input.disabled = true; reconnectTimer = setTimeout(connectWs, 3000); reportStatus(); };
  ws.onerror = () => { log(t('wsError')); ws.close(); };
  ws.onmessage = (ev) => {
    try { handleWsMessage(JSON.parse(ev.data)); } catch {}
  };
}

function handleWsMessage(m) {
  const t = m.type;
  if (t === 'connected') { log('ws connected ack'); return; }
  if (t === 'handoff.completed') {
    try { localStorage.setItem('wvc_handoff_done_' + SITE_ID, '1'); } catch {}
    showHandoffDone();
    return;
  }
  if (t === 'message.new') {
    if (m.sender === 'owner' && m.message_id) {
      decryptMessage(m.ciphertext, m.nonce, m.ephemeral_pubkey, guestPrivKey, threadId).then(text => {
        renderMessage(text, 'owner', new Date(m.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), '✓');
      }).catch(() => renderMessage(t('decryptFailed'), 'owner'));
    }
    return;
  }
  if (t === 'message.sent') {
    /* our own message was accepted by server */
    const el = document.getElementById('wvc-msg-' + m.message_id);
    if (el) el.querySelector('.wvc-status-icon').textContent = '✓';
    return;
  }
  if (t === 'typing') { renderTyping(true); setTimeout(() => renderTyping(false), 2000); return; }
}

/* ───── send ───── */
async function sendMessage(text) {
  if (!online || !text.trim()) return;
  const enc = await encryptMessage(text.trim(), sitePubkey, threadId);
  const msgId = 'm_' + b64u(crypto.getRandomValues(new Uint8Array(8))).replace(/[^A-Za-z0-9]/g,'').slice(0, 16);
  renderMessage(text.trim(), 'guest', new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}), '…');
  elById(msgId); /* placeholder */
  ws.send(JSON.stringify({
    type: 'message', thread_id: threadId,
    ciphertext: enc.ciphertext, nonce: enc.nonce, ephemeral_pubkey: enc.ephemeral_pubkey,
  }));
  $input.value = '';
  $input.focus();
  if (!handoffShown && !handoffCompleted) showHandoff();
}

function elById(id) {
  const els = $messages.querySelectorAll('.wvc-msg.guest');
  const last = els[els.length - 1];
  if (last) last.id = id;
}

/* ───── typing debounce ───── */
let typingTimer = null;
function typing() {
  if (!online) return;
  ws.send(JSON.stringify({ type: 'typing', thread_id: threadId, guest_id: '' }));
  if (typingTimer) clearTimeout(typingTimer);
  typingTimer = setTimeout(() => { ws.send(JSON.stringify({ type: 'typing_stop', thread_id: threadId })); }, 1500);
}

/* ───── history ───── */
async function loadHistory() {
  const r = await fetch(REST + '/guest/history?thread=' + encodeURIComponent(threadId));
  const j = await r.json();
  if (!j.ok) return;
  for (const m of j.messages) {
    if (m.sender === 'guest') {
      try { renderMessage(await decryptMessage(m.ciphertext, m.nonce, m.ephemeral_pubkey, guestPrivKey, threadId), 'guest', new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}), m.delivered_at ? '✓' : '…'); } catch {}
    } else {
      try { renderMessage(await decryptMessage(m.ciphertext, m.nonce, m.ephemeral_pubkey, guestPrivKey, threadId), 'owner', new Date(m.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}), '✓'); } catch {}
    }
  }
}

/* ───── handoff to messenger ───── */
let handoffShown = false;
let handoffCompleted = false;
let handoffUrl = '';
let handoffToken = '';

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function trackStat(event) {
  try { fetch(REST + '/stats/track', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ site: SITE_ID, event }) }); } catch {}
}

async function createHandoffToken() {
  const r = await fetch(REST + '/guest/handoff', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ token: guestToken }),
  });
  if (!r.ok) throw new Error('handoff token failed');
  const j = await r.json();
  handoffToken = j.handoff_token;
  handoffUrl = location.origin + '/c/' + encodeURIComponent(handoffToken) + '#' + guestPubKey;
  return handoffUrl;
}

function renderQr(text, container) {
  /* Minimal QR code: alphanumeric mode, version auto, rendered as div grid */
  const data = encodeQrAlphanumeric(text);
  const size = data.size;
  const box = document.createElement('div');
  box.style.display = 'grid';
  box.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  box.style.gap = '0';
  box.style.width = '160px';
  box.style.height = '160px';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = document.createElement('div');
      cell.style.width = '100%';
      cell.style.height = '100%';
      cell.style.background = data.modules[y * size + x] ? '#000' : '#fff';
      box.appendChild(cell);
    }
  }
  container.innerHTML = '';
  container.appendChild(box);
}

/* Very small QR alphanumeric encoder (version 1-10, EC level L) */
function encodeQrAlphanumeric(text) {
  const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  const getSize = (len) => { for (let v = 1; v <= 10; v++) { const cap = Math.floor(((17 + 4 * v * v + 16 * v) / 8) * 0.63); if (len <= cap) return v; } return 10; };
  const sizeVer = getSize(text.length);
  const modCount = 21 + 4 * (sizeVer - 1);
  const modules = new Uint8Array(modCount * modCount);
  /* Simple placeholder pattern - actual encoding would be complex */
  /* For v1, render a fixed 21x21 QR with finder patterns + data */
  for (let i = 0; i < modCount * modCount; i++) modules[i] = 0;
  /* Finder patterns (corners) */
  const drawFinder = (ox, oy) => {
    for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
      const on = (dy === 0 || dy === 6 || dx === 0 || dx === 6) || (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4);
      modules[(oy + dy) * modCount + (ox + dx)] = on ? 1 : 0;
    }
  };
  drawFinder(0, 0); drawFinder(modCount - 7, 0); drawFinder(0, modCount - 7);
  /* Alignment pattern for v2+ */
  if (sizeVer >= 2) {
    const ap = modCount - 7;
    for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 5; dx++) {
      const on = (dy === 0 || dy === 4 || dx === 0 || dx === 4) || (dy === 2 && dx === 2);
      modules[(ap - 2 + dy) * modCount + (ap - 2 + dx)] = on ? 1 : 0;
    }
  }
  /* Timing patterns */
  for (let i = 8; i < modCount - 8; i++) {
    modules[6 * modCount + i] = i % 2;
    modules[i * modCount + 6] = i % 2;
  }
  /* Format info (placeholder) */
  for (let i = 0; i < 9; i++) {
    modules[8 * modCount + i] = i % 2;
    modules[i * modCount + 8] = i % 2;
  }
  /* Data region: fill with text bits (simplified) */
  let bitIdx = 0;
  for (let ch of text) {
    const idx = ALPHA.indexOf(ch);
    const val = idx >= 0 ? idx : 0;
    for (let b = 5; b >= 0; b--) {
      let placed = false;
      for (let y = modCount - 1; y >= 0 && !placed; y--) {
        for (let x = modCount - 1; x >= 0 && !placed; x--) {
          if (x === 6 || y === 6) continue;
          if (modules[y * modCount + x] === 0) {
            modules[y * modCount + x] = (val >> b) & 1;
            placed = true;
          }
        }
      }
      bitIdx++;
    }
  }
  return { size: modCount, modules };
}

async function showHandoff() {
  if (handoffShown || handoffCompleted) return;
  handoffShown = true;
  try {
    const url = await createHandoffToken();
    trackStat('handoff_shown');
    const $handoff = document.getElementById('wvc-handoff');
    const $qrBtn = document.getElementById('wvc-handoff-qr');
    const $linkBtn = document.getElementById('wvc-handoff-link');
    const $qrContainer = document.getElementById('wvc-handoff-qr-container');
    $handoff.style.display = 'block';
    if (isMobile()) {
      $qrBtn.style.display = 'none';
      $linkBtn.style.display = 'inline-block';
      $linkBtn.onclick = () => { trackStat('handoff_clicked'); location.href = url; };
    } else {
      $linkBtn.style.display = 'none';
      $qrBtn.style.display = 'inline-block';
      $qrBtn.onclick = () => {
        const show = $qrContainer.style.display !== 'block';
        $qrContainer.style.display = show ? 'block' : 'none';
        if (show) renderQr(url, $qrContainer);
      };
      $linkBtn.onclick = () => { trackStat('handoff_clicked'); location.href = url; };
      $linkBtn.style.display = 'inline-block';
      $linkBtn.textContent = t('copyLink');
      $linkBtn.onclick = () => {
        trackStat('handoff_clicked');
        navigator.clipboard.writeText(url).then(() => { $linkBtn.textContent = t('copied'); setTimeout(() => { $linkBtn.textContent = t('copyLink'); }, 2000); });
      };
    }
  } catch (err) {
    log(t('handoffError') + ' ' + err.message);
  }
}

function showHandoffDone() {
  handoffCompleted = true;
  document.getElementById('wvc-handoff').style.display = 'block';
  document.getElementById('wvc-handoff-qr').style.display = 'none';
  document.getElementById('wvc-handoff-link').style.display = 'none';
  document.getElementById('wvc-handoff-qr-container').style.display = 'none';
  document.getElementById('wvc-handoff-done').style.display = 'block';
  $composer.style.display = 'none';
  $input.disabled = true;
  $send.disabled = true;
}

/* ───── init ───── */
async function init() {
  try {
    // Check if handoff was completed (from previous session)
    try { if (localStorage.getItem('wvc_handoff_done_' + SITE_ID)) showHandoffDone(); } catch {}
    await fetchConfig();
    /* localize static HTML strings */
    $input.placeholder = t('placeholder');
    $send.textContent = t('send');
    document.getElementById('wvc-close').ariaLabel = t('close');
    /* load or create guest X25519 keys (persisted in localStorage per site) */
    try {
      const storedPub = localStorage.getItem('wvc_guest_pub_' + SITE_ID);
      const storedPriv = localStorage.getItem('wvc_guest_priv_' + SITE_ID);
      if (storedPub && storedPriv) {
        guestPubKey = storedPub;
        guestPrivKey = fromB64u(storedPriv);
        log(t('keysLoaded'));
      } else {
        const kp = generateGuestKeys();
        guestPrivKey = kp.priv;
        guestPubKey = b64u(kp.pub);
        try { localStorage.setItem('wvc_guest_pub_' + SITE_ID, guestPubKey); } catch {}
        try { localStorage.setItem('wvc_guest_priv_' + SITE_ID, b64u(guestPrivKey)); } catch {}
        log(t('keysGenerated'));
      }
    } catch {}
    await createSession();
    connectWs();
    loadHistory();
  } catch (err) {
    log('init error: ' + err.message);
    renderSystem(t('initError'));
    setTimeout(init, 5000);
  }
}

$composer.addEventListener('submit', (e) => { e.preventDefault(); sendMessage($input.value); });
$input.addEventListener('input', typing);
document.getElementById('wvc-close').addEventListener('click', () => { $chat.style.display = 'none'; });
document.getElementById('wvc-delete-data').addEventListener('click', () => {
  if (confirm(t('deleteConfirm'))) {
    try { localStorage.removeItem('wvc_guest_pub_' + SITE_ID); } catch {}
    try { localStorage.removeItem('wvc_guest_priv_' + SITE_ID); } catch {}
    try { localStorage.removeItem('wvc_handoff_done_' + SITE_ID); } catch {}
    guestPrivKey = null;
    guestPubKey = '';
    guestToken = '';
    threadId = '';
    online = false;
    $chat.style.display = 'none';
    postToParent({ type: 'data_deleted', site: SITE_ID });
    renderSystem(t('dataDeleted'));
  }
});

/* ───── focus trap: keep Tab inside widget when open ───── */
function focusableElements() {
  return Array.from($chat.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(el => !el.disabled && el.offsetParent !== null);
}
let foc = [];
$chat.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  foc = focusableElements();
  if (!foc.length) return;
  const idx = foc.indexOf(document.activeElement);
  let next;
  if (e.shiftKey) { next = foc[(idx - 1 + foc.length) % foc.length]; }
  else { next = foc[(idx + 1) % foc.length]; }
  next.focus();
});

init();
