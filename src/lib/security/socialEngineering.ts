/**
 * Social engineering protection helpers.
 *
 * These utilities help detect and warn about common social engineering tactics:
 * - First contact from unknown senders
 * - Messages requesting credentials, codes, or money
 * - Suspicious links (URL shorteners, mismatched domains)
 * - Impersonation attempts (similar names/avatars)
 * - Unverified contact interactions
 */

import { CONTACT_PROFILES } from '../../data/mockMessengerData';
import { getSocialPrivacy, isPhoneAccessGranted } from '../../lib/social/socialPrivacy';
import { loadContactOverrides } from '../../lib/contacts/contactOverrides';

const SOCIAL_ENGINEERING_KEY = 'nova_social_eng_v1';

export interface SocialEngineeringSettings {
  /** Show first-contact warning banner */
  firstContactWarning: boolean;
  /** Show verification reminder for unverified contacts */
  verificationReminder: boolean;
  /** Analyze messages for phishing patterns */
  phishingDetection: boolean;
  /** Warn about links from unverified contacts */
  linkWarnings: boolean;
  /** Show safety number verification prompt */
  safetyNumberPrompt: boolean;
  /** Dismissed first-contact warnings (contactId -> timestamp) */
  dismissedFirstContact: Record<string, number>;
  /** Dismissed verification reminders (contactId -> timestamp) */
  dismissedVerificationReminder: Record<string, number>;
}

const DEFAULT_SETTINGS: SocialEngineeringSettings = {
  firstContactWarning: true,
  verificationReminder: true,
  phishingDetection: true,
  linkWarnings: true,
  safetyNumberPrompt: true,
  dismissedFirstContact: {},
  dismissedVerificationReminder: {},
};

function readSettings(): SocialEngineeringSettings {
  try {
    const raw = localStorage.getItem(SOCIAL_ENGINEERING_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<SocialEngineeringSettings>;
    return {
      firstContactWarning: parsed.firstContactWarning ?? DEFAULT_SETTINGS.firstContactWarning,
      verificationReminder: parsed.verificationReminder ?? DEFAULT_SETTINGS.verificationReminder,
      phishingDetection: parsed.phishingDetection ?? DEFAULT_SETTINGS.phishingDetection,
      linkWarnings: parsed.linkWarnings ?? DEFAULT_SETTINGS.linkWarnings,
      safetyNumberPrompt: parsed.safetyNumberPrompt ?? DEFAULT_SETTINGS.safetyNumberPrompt,
      dismissedFirstContact: parsed.dismissedFirstContact && typeof parsed.dismissedFirstContact === 'object'
        ? parsed.dismissedFirstContact
        : {},
      dismissedVerificationReminder: parsed.dismissedVerificationReminder && typeof parsed.dismissedVerificationReminder === 'object'
        ? parsed.dismissedVerificationReminder
        : {},
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings: SocialEngineeringSettings): void {
  try {
    localStorage.setItem(SOCIAL_ENGINEERING_KEY, JSON.stringify(settings));
  } catch {
    void 0;
  }
}

export function getSocialEngineeringSettings(): SocialEngineeringSettings {
  return readSettings();
}

export function setSocialEngineeringSetting<K extends keyof SocialEngineeringSettings>(
  key: K,
  value: SocialEngineeringSettings[K]
): void {
  const current = readSettings();
  const next = { ...current, [key]: value };
  writeSettings(next);
}

/** Check if a contact is "known" (has been messaged before or is in contacts with phone access) */
export function isKnownContact(contactId: string): boolean {
  const privacy = getSocialPrivacy();
  const contactOverrides = loadContactOverrides();
  const contactOverride = contactOverrides[contactId];
  
  // Contact is known if:
  // 1. They have explicit phone access (user granted access)
  // 2. They are in blocked list (user explicitly blocked them)
  // 3. They have a contact override with name/nickname set
  if (isPhoneAccessGranted(contactId)) return true;
  if (privacy.blockedUsers.includes(contactId)) return true;
  if (contactOverride?.name || contactOverride?.nickname) return true;
  
  // Check if there's conversation history
  try {
    const { CONVERSATION_HISTORIES } = require('../../data/mockMessengerData');
    if (CONVERSATION_HISTORIES[contactId]?.length) return true;
  } catch {
    // ignore
  }
  
  return false;
}

/** Check if first-contact warning should be shown for a contact */
export function shouldShowFirstContactWarning(contactId: string): boolean {
  const settings = readSettings();
  if (!settings.firstContactWarning) return false;
  if (isKnownContact(contactId)) return false;
  const dismissed = settings.dismissedFirstContact[contactId];
  if (dismissed && Date.now() - dismissed < 30 * 24 * 60 * 60 * 1000) return false; // 30 days
  return true;
}

/** Dismiss first-contact warning for a contact */
export function dismissFirstContactWarning(contactId: string): void {
  const settings = readSettings();
  settings.dismissedFirstContact[contactId] = Date.now();
  writeSettings(settings);
}

/** Check if verification reminder should be shown for a contact */
export function shouldShowVerificationReminder(contactId: string, isVerified: boolean): boolean {
  const settings = readSettings();
  if (!settings.verificationReminder) return false;
  if (isVerified) return false;
  if (isKnownContact(contactId)) return false; // Known contacts don't need reminder
  const dismissed = settings.dismissedVerificationReminder[contactId];
  if (dismissed && Date.now() - dismissed < 7 * 24 * 60 * 60 * 1000) return false; // 7 days
  return true;
}

/** Dismiss verification reminder for a contact */
export function dismissVerificationReminder(contactId: string): void {
  const settings = readSettings();
  settings.dismissedVerificationReminder[contactId] = Date.now();
  writeSettings(settings);
}

/** Phishing pattern detection */
export interface PhishingAnalysis {
  isSuspicious: boolean;
  reasons: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

const CREDENTIAL_KEYWORDS = [
  'password', 'passcode', 'pin', 'code', 'verification code', 'auth code',
  '2fa', 'two factor', 'otp', 'one time', 'backup', 'recovery', 'seed',
  'phrase', 'mnemonic', 'private key', 'secret', 'token', 'session',
  'пароль', 'пин', 'код', 'верификация', 'двухфакторн', 'отп', 'одноразов',
  'бэкап', 'восстановлен', 'сид', 'фраз', 'мнемоник', 'приватн', 'секрет',
  'токен', 'сесси', 'пароль', 'пін', 'код', 'верифікац', 'двохфакторн',
];

const URGENCY_KEYWORDS = [
  'urgent', 'immediately', 'right now', 'asap', 'emergency', 'critical',
  'expires', 'expiring', 'limited time', 'act now', 'hurry',
  'срочно', 'немедленно', 'прямо сейчас', 'экстренно', 'критично',
  'истекает', 'ограниченное время', 'действуй', 'поспеши',
  'терміново', 'негайно', 'прямо зараз', 'екстренно', 'критично',
];

const MONEY_KEYWORDS = [
  'send money', 'transfer', 'payment', 'pay', 'crypto', 'bitcoin', 'btc',
  'ethereum', 'eth', 'usdt', 'wallet', 'address', 'deposit', 'withdraw',
  'invest', 'investment', 'profit', 'return', 'guaranteed', 'opportunity',
  'перевод', 'оплата', 'платеж', 'крипта', 'биткоин', 'кошелек', 'адрес',
  'депозит', 'вывод', 'инвестиц', 'прибыль', 'гарантирован', 'возможность',
];

const URL_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'adf.ly', 'bc.vc', 'shorte.st', 'cutt.ly', 'rb.gy', 'shorturl.at',
  'v.gd', 'tr.im', 'u.nu', 'tiny.cc', 'lnkd.in', 'db.tt', 'qr.ae',
];

export function analyzeMessageForPhishing(text: string, senderId: string, isVerified: boolean): PhishingAnalysis {
  const settings = readSettings();
  if (!settings.phishingDetection) {
    return { isSuspicious: false, reasons: [], riskLevel: 'low' };
  }

  const reasons: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  const lowerText = text.toLowerCase();

  // Check for credential requests
  for (const keyword of CREDENTIAL_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      reasons.push('Requests credentials or authentication codes');
      riskLevel = 'high';
      break;
    }
  }

  // Check for urgency tactics
  for (const keyword of URGENCY_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      reasons.push('Uses urgency pressure tactics');
      if (riskLevel === 'low') riskLevel = 'medium';
      break;
    }
  }

  // Check for money/crypto requests
  for (const keyword of MONEY_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      reasons.push('Requests money or cryptocurrency');
      riskLevel = 'high';
      break;
    }
  }

  // Check for suspicious links
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex) || [];
  for (const url of urls) {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      
      // Check for URL shorteners
      if (URL_SHORTENERS.some(s => hostname.includes(s))) {
        reasons.push('Contains URL shortener (hides real destination)');
        if (riskLevel === 'low') riskLevel = 'medium';
      }
      
      // Check for suspicious TLDs
      const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.club', '.work', '.click'];
      if (suspiciousTlds.some(tld => hostname.endsWith(tld))) {
        reasons.push('Uses suspicious top-level domain');
        if (riskLevel === 'low') riskLevel = 'medium';
      }
      
      // Check for IP address instead of domain
      if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        reasons.push('Links to raw IP address (not a domain)');
        riskLevel = 'high';
      }
    } catch {
      // Invalid URL
    }
  }

  // Higher risk if sender is not verified
  if (!isVerified && (riskLevel === 'medium' || riskLevel === 'high')) {
    riskLevel = 'high';
  }

  // First contact from unknown sender with any risk
  if (!isKnownContact(senderId) && reasons.length > 0) {
    riskLevel = 'high';
  }

  return {
    isSuspicious: reasons.length > 0,
    reasons,
    riskLevel,
  };
}

/** Get display name for a contact (with override) */
export function getContactDisplayName(contactId: string): string {
  const override = loadContactOverrides()[contactId];
  const profile = CONTACT_PROFILES[contactId];
  return override?.name ?? profile?.name ?? contactId;
}

/** Check if contact might be impersonating another (similar name) */
export function checkImpersonationRisk(contactId: string): { isRisk: boolean; similarTo?: string } {
  const displayName = getContactDisplayName(contactId).toLowerCase();
  const knownNames = Object.values(CONTACT_PROFILES)
    .map(p => p.name.toLowerCase())
    .filter(n => n !== displayName);
  
  for (const known of knownNames) {
    // Simple similarity check: common substrings or edit distance
    if (displayName.length > 3 && known.length > 3) {
      if (displayName.includes(known) || known.includes(displayName)) {
        return { isRisk: true, similarTo: known };
      }
      // Check for common prefixes/suffixes
      if (displayName.startsWith(known.slice(0, 3)) && known.startsWith(displayName.slice(0, 3))) {
        return { isRisk: true, similarTo: known };
      }
    }
  }
  return { isRisk: false };
}