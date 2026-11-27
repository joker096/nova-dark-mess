import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { useSettings } from '../../../context/SettingsContext';
import { useSecurity } from '../../../hooks/useSecurity';
import {
  SettingsSection,
  SettingsTile,
  IconSegmented,
  type IconSegmentOption,
} from '../settingsPrimitives';
import {
  IconSpeakerphone as MegaphoneIcon,
  IconSend as SendIcon,
  IconLock as LockIcon,
  IconShieldExclamation as ShieldExclamationIcon,
  IconChartBar as BarChart3Icon,
  IconGlobe as GlobeIcon,
  IconMapPin as MapPinIcon,
  IconBug as BugIcon,
  IconTrashX as TrashXIcon,
  IconToggleLeft as ToggleLeftIcon,
  IconToggleRight as ToggleRightIcon,
  IconShieldOff as ShieldOffIcon,
  IconShieldCheck as ShieldCheckIcon,
  IconLink as LinkIcon,
  IconFingerprint as FingerprintIcon,
  IconEdit as EditIcon,
  IconExternalLink as ExternalLinkIcon,
  IconEye as EyeIcon,
  IconEyeOff as EyeOffIcon,
  IconX as XIcon,
  IconCheck as CheckIcon,
  IconInfoCircle as InfoCircleIcon,
  IconSettings as SettingsIcon,
} from '@tabler/icons-react';
import { loadJoinOutbox, retryJoinOutboxNow } from '../../../lib/social/joinRequestRelay';
import { clearLocalAdPrefs, loadAdPreferences } from '../../../lib/ads/localAds';
import { useBotSession } from '../../../hooks/useBotSession';
import { type BotPermission, type BotCommand, ALL_BOT_PERMISSIONS } from '../../../lib/bots/types';
import type { InstalledBot } from '../../../lib/bots/runtime';
import {
  IconChevronRight as ChevronRightIcon,
  IconCheck as Check,
  IconX as X,
  IconSparkles as Sparkles,
  IconCopy as CopyIcon,
  IconKey as KeyIcon,
} from '@tabler/icons-react';
const PERMISSION_LABELS: Record<BotPermission, string> = {
  read_messages: 'Read messages',
  send_messages: 'Send messages',
  inline_keyboard: 'Inline keyboards',
  media: 'Media',
  mention_only: 'Mentions only',
  manage_bots: 'Manage bots',
};

const PERMISSION_DESCRIPTIONS: Record<BotPermission, string> = {
  read_messages: 'Read messages in chats the bot participates in',
  send_messages: 'Send messages on behalf of the bot',
  inline_keyboard: 'Attach inline keyboards to its own messages',
  media: 'Send media attachments',
  mention_only: 'Only receive commands and mentions in groups',
  manage_bots: 'Install and manage other bots',
};

export const AdvancedTab = React.memo(function AdvancedTab({
  onOpenAnalytics,
  onOpenSites,
  onOpenMeshMap,
  navigate,
}: {
  onOpenAnalytics?: () => void;
  onOpenSites?: () => void;
  onOpenMeshMap?: () => void;
  navigate?: (screen: string, params?: any) => void;
}) {
  const { t } = useLanguage();
  const { state } = useSettings();
  const { pinEnabled, identity, setPin, removePin } = useSecurity();
  const { session, listBots, installBot, uninstallBot, setBotEnabled, setBotBlocked, setPeerFingerprint, setGatewayUrl } = useBotSession();
  
  const [joinOutbox, setJoinOutbox] = useState(loadJoinOutbox());
  const [isRetryingJoin, setIsRetryingJoin] = useState(false);
  const [adPrefs, setAdPrefs] = useState(loadAdPreferences());
  const [aboutMsg, setAboutMsg] = useState<string | null>(null);
  const [bots, setBots] = useState<InstalledBot[]>([]);
  const [loadingBots, setLoadingBots] = useState(true);
  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const [peerFingerprintInput, setPeerFingerprintInput] = useState('');
  const [gatewayUrlInput, setGatewayUrlInput] = useState('');

  const retryAll = useCallback(async () => {
    setIsRetryingJoin(true);
    await retryJoinOutboxNow();
    setJoinOutbox(loadJoinOutbox());
    setIsRetryingJoin(false);
  }, []);

  const handleClearAdPrefs = useCallback(async () => {
    await clearLocalAdPrefs();
    setAdPrefs(loadAdPreferences());
    setAboutMsg('Ad preferences cleared');
  }, []);

  const handleTogglePin = useCallback(async () => {
    if (pinEnabled) {
      await removePin();
      return;
    }
    const pin = window.prompt('Set a 4-digit PIN');
    if (!pin) return;
    if (!/^\d{4}$/.test(pin)) {
      setAboutMsg('PIN must be 4 digits');
      return;
    }
    await setPin(pin);
  }, [pinEnabled, setPin, removePin]);

  const handleCopySeedPhrase = useCallback(async () => {
    const phrase = identity?.mnemonic ?? '';
    if (!phrase) return;
    try {
      await navigator.clipboard.writeText(phrase);
      setAboutMsg('Seed phrase copied to clipboard');
    } catch {}
  }, [identity]);

  const loadBots = useCallback(async () => {
    try {
      await session.ensureReady();
      const botList = session.listBots();
      setBots([...botList]);
    } catch (e) {
      console.error('Failed to load bots:', e);
    } finally {
      setLoadingBots(false);
    }
  }, [session]);

  useEffect(() => {
    loadBots();
  }, [loadBots]);

  const handleEnableBot = useCallback(async (botId: string, enabled: boolean) => {
    try {
      await setBotEnabled(botId, enabled);
      loadBots();
    } catch (e) {
      console.error('Failed to toggle bot:', e);
      setAboutMsg(`Failed to ${enabled ? 'enable' : 'disable'} bot`);
    }
  }, [setBotEnabled, loadBots]);

  const handleBlockBot = useCallback(async (botId: string, blocked: boolean) => {
    try {
      await setBotBlocked(botId, blocked);
      loadBots();
    } catch (e) {
      console.error('Failed to block bot:', e);
      setAboutMsg(`Failed to ${blocked ? 'block' : 'unblock'} bot`);
    }
  }, [setBotBlocked, loadBots]);

  const handleUninstallBot = useCallback(async (botId: string) => {
    if (!window.confirm('Are you sure you want to uninstall this bot? This action cannot be undone.')) return;
    try {
      await uninstallBot(botId);
      setSelectedBot(null);
      loadBots();
    } catch (e) {
      console.error('Failed to uninstall bot:', e);
      setAboutMsg('Failed to uninstall bot');
    }
  }, [uninstallBot, loadBots]);

  const handleSetPeerFingerprint = useCallback(async (botId: string) => {
    const fingerprint = peerFingerprintInput.trim();
    if (!fingerprint) return;
    try {
      await setPeerFingerprint(botId, fingerprint);
      setPeerFingerprintInput('');
      setSelectedBot(null);
      loadBots();
    } catch (e) {
      console.error('Failed to set peer fingerprint:', e);
      setAboutMsg('Failed to set peer fingerprint');
    }
  }, [setPeerFingerprint, peerFingerprintInput, loadBots]);

  const handleSetGatewayUrl = useCallback(async (botId: string) => {
    const url = gatewayUrlInput.trim();
    try {
      await setGatewayUrl(botId, url || undefined);
      setGatewayUrlInput('');
      setSelectedBot(null);
      loadBots();
    } catch (e) {
      console.error('Failed to set gateway URL:', e);
      setAboutMsg('Failed to set gateway URL');
    }
  }, [setGatewayUrl, gatewayUrlInput, loadBots]);

  const selectedBotData = useMemo(() => bots.find(b => b.manifest.id === selectedBot), [bots, selectedBot]);

  return (
    <>
      <SettingsSection
        title={t('settings.advertising')}
        icon={<MegaphoneIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          <SettingsTile
            icon={<MegaphoneIcon className="w-4 h-4" />}
            label={t('settings.adPreferences')}
            description={t('settings.adPreferencesDesc')}
            onClick={() => { /* TODO */ }}
            badge={<ChevronRightIcon className="w-4 h-4" />}
            testId="settings-ad-preferences"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.joinOutbox')}
        icon={<SendIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          {joinOutbox.length === 0 ? (
            <p className="text-[11px] text-[var(--nova-text-muted)] text-center py-4">
              {t('settings.joinOutboxEmpty')}
            </p>
          ) : (
            joinOutbox.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 rounded-xl bg-[var(--nova-overlay-weak)]"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[var(--nova-accent-color)]">
                    <SendIcon className="w-3 h-3" />
                  </div>
                  <div>
                    <span className="text-[12px] font-medium text-[var(--nova-text-primary)]">
                      {item.name ?? item.groupId}
                    </span>
                    <span className="text-[10px] text-[var(--nova-text-muted)] block">
                      {t('bot.retryPlaceholder', { count: item.attempts ?? 0 })}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-[var(--nova-text-muted)]">
                  {t('bot.nextAttempt', { time: new Date(item.nextAttemptAt ?? item.createdAt).toLocaleTimeString() })}
                </span>
              </div>
            ))
          )}
          <button
            onClick={retryAll}
            disabled={isRetryingJoin}
            className="w-full py-2 rounded-xl border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)] text-xs font-medium transition cursor-pointer disabled:opacity-50"
          >
            {isRetryingJoin ? t('settings.retrying') : t('settings.retryAll')}
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('bot.title')}
        icon={<BugIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          {loadingBots ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-6 h-6 border-2 border-[var(--nova-accent-color)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : bots.length === 0 ? (
            <div className="text-center py-4">
              <BugIcon className="w-8 h-8 mx-auto text-[var(--nova-text-muted)]" />
              <p className="text-[11px] text-[var(--nova-text-muted)] mt-2">
                {t('bot.noBotsInstalled')}
              </p>
              <p className="text-[10px] text-[var(--nova-text-muted)]">
                {t('bot.installViaNovaFather')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {bots.map((bot) => (
                <BotListItem
                  key={bot.manifest.id}
                  bot={bot}
                  isSelected={selectedBot === bot.manifest.id}
                  onSelect={() => setSelectedBot(bot.manifest.id)}
                  onEnable={(enabled) => handleEnableBot(bot.manifest.id, enabled)}
                  onBlock={(blocked) => handleBlockBot(bot.manifest.id, blocked)}
                  onUninstall={() => handleUninstallBot(bot.manifest.id)}
                  onSetPeerFingerprint={() => { setPeerFingerprintInput(bot.peerFingerprint ?? ''); setSelectedBot(bot.manifest.id); }}
                  onSetGatewayUrl={() => { setGatewayUrlInput(bot.manifest.gatewayUrl ?? ''); setSelectedBot(bot.manifest.id); }}
                  t={t}
                />
              ))}
            </div>
          )}

          {/* Bot detail panel */}
          {selectedBotData && (
            <div className="mt-4 p-3 rounded-xl border border-[var(--nova-accent-color)]/30 bg-[var(--nova-accent-color)]/10 animate-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[var(--nova-accent-color)]">
                    <BugIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-[var(--nova-text-primary)]">
                      @{selectedBotData.manifest.username}
                    </span>
                    <span className="text-[11px] text-[var(--nova-text-muted)] block">
                      {selectedBotData.manifest.name}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedBot(null)}
                  className="p-1.5 rounded-lg text-[var(--nova-text-muted)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-weak)] transition"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-[11px]">
                <div>
                  <span className="text-[var(--nova-text-secondary)]">{t('bot.version')}:</span>
                  <span className="text-[var(--nova-text-primary)] ml-2 font-mono">
                    {selectedBotData.manifest.version}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--nova-text-secondary)]">{t('bot.description')}:</span>
                  <p className="text-[var(--nova-text-primary)] mt-1">{selectedBotData.manifest.description || t('bot.noDescription')}</p>
                </div>

                {/* Permissions */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[var(--nova-text-secondary)]">{t('bot.permissions', { count: selectedBotData.grantedPermissions.length })}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedBotData.grantedPermissions.map((perm) => (
                      <span key={perm} className="px-2 py-0.5 rounded-full bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[10px] text-[var(--nova-text-primary)]">
                        {PERMISSION_LABELS[perm as BotPermission] || perm}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Commands */}
                {selectedBotData.manifest.commands?.length > 0 && (
                  <div>
                    <span className="text-[var(--nova-text-secondary)]">{t('bot.commands', { count: selectedBotData.manifest.commands.length })}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedBotData.manifest.commands.map((cmd: BotCommand) => (
                        <span key={cmd.command} className="px-2 py-0.5 rounded-full bg-[var(--nova-accent-color)]/15 border border-[var(--nova-accent-color)]/30 text-[10px] text-[var(--nova-accent-color)] font-mono">
                          /{cmd.command}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Peer Fingerprint */}
                <div className="pt-2 border-t border-[var(--nova-border-subtle)]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[var(--nova-text-secondary)]">
                      <FingerprintIcon className="w-3 h-3 inline mr-1" />
                      {t('bot.meshFingerprint')}
                    </span>
                    {selectedBotData.peerFingerprint ? (
                      <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                        <ShieldCheckIcon className="w-3 h-3" />
                        {t('bot.fingerprintSet')}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--nova-text-muted)]">{t('bot.fingerprintNotSet')}</span>
                    )}
                  </div>
                  {selectedBotData.manifest.gatewayUrl && (
                    <div className="mb-2">
                      <span className="text-[var(--nova-text-secondary)]">{t('bot.gatewayUrl')}: </span>
                      <a href={selectedBotData.manifest.gatewayUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--nova-accent-color)] text-[10px] truncate block">
                        {selectedBotData.manifest.gatewayUrl}
                      </a>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={peerFingerprintInput}
                      onChange={(e) => setPeerFingerprintInput(e.target.value)}
                      placeholder={t('bot.placeholderFingerprint')}
                      className="flex-1 px-2 py-1.5 rounded-lg border border-[var(--nova-border-subtle)] bg-[var(--nova-surface)] text-[var(--nova-text-primary)] text-[11px] focus:border-[var(--nova-accent-color)] focus:outline-none"
                      maxLength={128}
                    />
                    <button
                      onClick={() => handleSetPeerFingerprint(selectedBotData.manifest.id)}
                      disabled={!peerFingerprintInput.trim()}
                      className="px-3 py-1.5 rounded-lg bg-[var(--nova-accent-color)] text-white text-[11px] font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {t('bot.setFingerprint')}
                    </button>
                    <button
                      onClick={() => handleSetGatewayUrl(selectedBotData.manifest.id)}
                      className="px-3 py-1.5 rounded-lg border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] text-[11px] font-medium hover:bg-[var(--nova-overlay-weak)] hover:text-[var(--nova-text-primary)] transition"
                    >
                      {t('bot.setGatewayUrl')}
                    </button>
                  </div>
                  {gatewayUrlInput && (
                    <input
                      type="url"
                      value={gatewayUrlInput}
                      onChange={(e) => setGatewayUrlInput(e.target.value)}
                      placeholder="https://gateway.example.com"
                      className="w-full mt-2 px-2 py-1.5 rounded-lg border border-[var(--nova-border-subtle)] bg-[var(--nova-surface)] text-[var(--nova-text-primary)] text-[11px] focus:border-[var(--nova-accent-color)] focus:outline-none"
                    />
                  )}
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-[var(--nova-border-subtle)] flex gap-2">
                  <button
                    onClick={() => handleEnableBot(selectedBotData.manifest.id, !selectedBotData.enabled)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition ${
                      selectedBotData.enabled
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                        : 'bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'
                    }`}
                  >
                    {selectedBotData.enabled ? <EyeOffIcon className="w-3 h-3 inline mr-1" /> : <EyeIcon className="w-3 h-3 inline mr-1" />}
                    {selectedBotData.enabled ? t('bot.disable') : t('bot.enable')}
                  </button>
                  <button
                    onClick={() => handleBlockBot(selectedBotData.manifest.id, !selectedBotData.blocked)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition ${
                      selectedBotData.blocked
                        ? 'bg-red-500/15 border border-red-500/30 text-red-400'
                        : 'bg-[var(--nova-overlay-weak)] border border-[var(--nova-border-subtle)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'
                    }`}
                  >
                    {selectedBotData.blocked ? <ShieldCheckIcon className="w-3 h-3 inline mr-1" /> : <ShieldOffIcon className="w-3 h-3 inline mr-1" />}
                    {selectedBotData.blocked ? t('bot.unblock') : t('bot.block')}
                  </button>
                  <button
                    onClick={() => handleUninstallBot(selectedBotData.manifest.id)}
                    className="flex-1 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] font-medium hover:bg-red-500/25 transition"
                  >
                    <TrashXIcon className="w-3 h-3 inline mr-1" />
                    {t('bot.uninstall')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('settings.security')}
        icon={<LockIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          <SettingsTile
            icon={<LockIcon className="w-4 h-4" />}
            label={t('settings.pinEnabled')}
            description={t('settings.pinDesc')}
            onClick={handleTogglePin}
            badge={pinEnabled ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            testId="settings-pin-enabled"
          />
          <SettingsTile
            icon={<KeyIcon className="w-4 h-4" />}
            label={t('settings.showSeedPhrase')}
            description={t('settings.showSeedPhraseDesc')}
            onClick={handleCopySeedPhrase}
            badge={<CopyIcon className="w-4 h-4" />}
            testId="settings-show-seed-phrase"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('analytics.title')}
        icon={<BarChart3Icon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          <SettingsTile
            icon={<BarChart3Icon className="w-4 h-4" />}
            label={t('analytics.title')}
            description={t('analytics.openDesc')}
            onClick={onOpenAnalytics}
            badge={<ChevronRightIcon className="w-4 h-4" />}
            testId="settings-analytics"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('sites.title')}
        icon={<GlobeIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          <SettingsTile
            icon={<GlobeIcon className="w-4 h-4" />}
            label={t('sites.title')}
            description={t('sites.openDesc')}
            onClick={onOpenSites}
            badge={<ChevronRightIcon className="w-4 h-4" />}
            testId="settings-sites"
          />
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('meshMap.title')}
        icon={<MapPinIcon className="w-3.5 h-3.5" />}
      >
        <div className="px-1 py-2 space-y-2">
          <SettingsTile
            icon={<MapPinIcon className="w-4 h-4" />}
            label={t('meshMap.title')}
            description={t('meshMap.openDesc')}
            onClick={onOpenMeshMap}
            badge={<ChevronRightIcon className="w-4 h-4" />}
            testId="settings-mesh-map"
          />
        </div>
      </SettingsSection>

      {aboutMsg && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-[var(--nova-surface-high)]/95 border border-[var(--nova-accent-color)]/50 text-[var(--nova-text-primary)] text-xs px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="w-3.5 h-3.5 text-[var(--nova-accent-color)]" />
          <span>{aboutMsg}</span>
        </div>
      )}
    </>
  );
});

function BotListItem({
  bot,
  isSelected,
  onSelect,
  onEnable,
  onBlock,
  onUninstall,
  onSetPeerFingerprint,
  onSetGatewayUrl,
  t,
}: {
  bot: { manifest: any; grantedPermissions: string[]; enabled: boolean; blocked?: boolean; installedAt: number; peerFingerprint?: string };
  isSelected: boolean;
  onSelect: () => void;
  onEnable: (enabled: boolean) => void;
  onBlock: (blocked: boolean) => void;
  onUninstall: () => void;
  onSetPeerFingerprint: () => void;
  onSetGatewayUrl: () => void;
  t: (...args: any[]) => any;
}) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={`w-full p-2 rounded-xl border transition cursor-pointer ${
        isSelected
          ? 'border-[var(--nova-accent-color)] bg-[var(--nova-accent-color)]/10'
          : 'border-transparent hover:border-[var(--nova-border-subtle)] hover:bg-[var(--nova-overlay-weak)]'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
            <BugIcon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate">
              <span className="text-[12px] font-medium text-[var(--nova-text-primary)] truncate">
                @{bot.manifest.username}
              </span>
              <span className="text-[10px] text-[var(--nova-text-muted)]">{bot.manifest.name}</span>
              {bot.blocked && (
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-500/15 text-red-400 border border-red-500/30">
                  {t('bot.blocked')}
                </span>
              )}
              {!bot.enabled && !bot.blocked && (
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-[var(--nova-overlay-weak)] text-[var(--nova-text-muted)] border border-[var(--nova-border-subtle)]">
                  {t('bot.disabled')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--nova-text-muted)]">
              <span className="truncate">{bot.grantedPermissions.length} permissions</span>
              <span>·</span>
              <span>{bot.manifest.commands?.length || 0} commands</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onEnable(!bot.enabled); }}
            className={`p-1.5 rounded-lg transition ${
              bot.enabled
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'
            }}`}
            aria-label={bot.enabled ? t('bot.disable') : t('bot.enable')}
          >
            {bot.enabled ? <EyeOffIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onBlock(!bot.blocked); }}
            className={`p-1.5 rounded-lg transition ${
              bot.blocked
                ? 'bg-red-500/15 text-red-400'
                : 'bg-[var(--nova-overlay-weak)] text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-weak)]'
            }}`}
            aria-label={bot.blocked ? t('bot.unblock') : t('bot.block')}
          >
            {bot.blocked ? <ShieldCheckIcon className="w-3.5 h-3.5" /> : <ShieldOffIcon className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onUninstall(); }}
            className="p-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition"
            aria-label={t('bot.uninstall')}
          >
            <TrashXIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}