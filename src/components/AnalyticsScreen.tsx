import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  useLanguage } from '../context/LanguageContext';
import { localAnalytics } from '../lib/analytics/localAnalytics';
import {IconChartBar as BarChart,
  IconTrendingUp as TrendingUp,
  IconMessageCircle as MessageCircle,
  IconDeviceFloppy as HardDrive,
  IconShieldCheck as ShieldCheck,
  IconBolt as Zap,
  IconUsers as Users,
  IconMicrophone as Mic,
  IconArrowUpRight as ArrowUpRight,
  IconArrowDownRight as ArrowDownRight,
  IconArrowLeft as ArrowLeft,
  IconRefresh as Refresh,
  IconActivity as Activity,
  IconChartBar as BarChart3,
  IconMessageCircle as MessageSquare,
} from '@tabler/icons-react';

interface AnalyticsScreenProps {
  onBack?: () => void;
}

export const AnalyticsScreen: React.FC<AnalyticsScreenProps> = ({ onBack }) => {
  const { t } = useLanguage();
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'year'>('week');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [events, setEvents] = useState<ReturnType<typeof localAnalytics.getEvents>>(() => localAnalytics.getEvents());

  useEffect(() => {
    setEvents(localAnalytics.getEvents());
  }, []);

  const eventCounts = useMemo(() => localAnalytics.getEventCountsByType(), []);
  const messagesByChat = useMemo(() => localAnalytics.getMessagesByChat(), []);

  const totalMessages = Object.values(messagesByChat).reduce((sum, c) => sum + c.send + c.receive, 0);
  const activeChats = Object.entries(messagesByChat).filter(([, c]) => c.send + c.receive > 0).length;

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      setEvents(localAnalytics.getEvents());
    }, 600);
  }, []);

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const weekEvents = events.filter((e) => e.timestamp >= weekAgo && e.timestamp <= now);

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const activityData = dayLabels.map((day, idx) => {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - (6 - idx));
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const dayMessages = weekEvents.filter(
      (e) =>
        (e.type === 'message_send' || e.type === 'message_receive' || e.type === 'voice_message_send' || e.type === 'voice_message_receive') &&
        e.timestamp >= dayStart.getTime() &&
        e.timestamp < dayEnd.getTime()
    ).length;
    const dayVoice = weekEvents.filter(
      (e) =>
        (e.type === 'voice_message_send' || e.type === 'voice_message_receive') &&
        e.timestamp >= dayStart.getTime() &&
        e.timestamp < dayEnd.getTime()
    ).length;
    return { day, messages: dayMessages, voice: dayVoice };
  });

  const maxMessages = Math.max(1, ...activityData.map(d => d.messages));

  const storageBytes = (() => {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const value = localStorage.getItem(key);
        if (value) total += new TextEncoder().encode(key + value).length;
      }
      return total;
    } catch {
      return 0;
    }
  })();

  const storageMB = (storageBytes / (1024 * 1024)).toFixed(2);

  const statsCards = [
    {
      title: t('analytics.totalMessages'),
      value: String(totalMessages),
      change: `+${eventCounts['message_send'] || 0}`,
      isPositive: true,
      icon: MessageSquare,
      color: 'from-cyan-500 to-blue-600',
    },
    {
      title: t('analytics.activeChats'),
      value: String(activeChats),
      change: `+${eventCounts['chat_open'] || 0}`,
      isPositive: true,
      icon: Users,
      color: 'from-emerald-500 to-teal-600',
    },
    {
      title: t('analytics.voiceMessages'),
      value: String((eventCounts['voice_message_send'] || 0) + (eventCounts['voice_message_receive'] || 0)),
      change: `+${eventCounts['voice_message_send'] || 0}`,
      isPositive: true,
      icon: Mic,
      color: 'from-purple-500 to-indigo-600',
    },
    {
      title: t('analytics.storageUsed'),
      value: `${storageMB} MB`,
      change: '0%',
      isPositive: true,
      icon: HardDrive,
      color: 'from-amber-500 to-orange-600',
    },
  ];

  const topContacts = Object.entries(messagesByChat)
    .map(([chatId, stats]) => ({ name: chatId, messages: stats.send + stats.receive }))
    .sort((a, b) => b.messages - a.messages)
    .slice(0, 3);

  return (
    <div className="flex-1 bg-[var(--nova-canvas)] text-[var(--nova-text-primary)] overflow-y-auto p-6 md:p-8 custom-scrollbar">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="md:hidden flex h-9 w-9 items-center justify-center rounded-full text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] transition active:scale-95 cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--nova-accent-color)]/10 text-[var(--nova-accent-color)] border border-[var(--nova-accent-color)]/20">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h1 className="text-2xl md:text-[28px] font-bold tracking-tight text-[var(--nova-text-primary)]">
              {t('analytics.usageTitle')}
            </h1>
          </div>
          <p className="text-[var(--nova-text-secondary)] text-sm mt-1">
            {t('analytics.usageSubtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className={`flex h-9 w-9 items-center justify-center rounded-full text-[var(--nova-text-secondary)] hover:bg-[var(--nova-overlay-medium)] hover:text-[var(--nova-text-primary)] transition-all ${
              isRefreshing ? 'animate-spin text-[var(--nova-accent-color)]' : ''
            }`}
            title={t('analytics.refresh')}
            aria-label={t('analytics.refresh')}
          >
            <Refresh className="w-4 h-4" />
          </button>

          <div className="flex items-center p-1 rounded-xl bg-[var(--nova-surface-raised)] border border-[var(--nova-border-color)] text-xs font-medium">
            {(['week', 'month', 'year'] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded-lg transition-all capitalize ${
                  timeframe === tf
                    ? 'bg-[var(--nova-accent-color)]/10 text-[var(--nova-accent-color)] shadow-md shadow-[var(--nova-accent-color)]/25 font-semibold'
                    : 'text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)]'
                }`}
                aria-label={t(`analytics.${tf}`)}
              >
                {t(`analytics.${tf}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statsCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="relative p-5 rounded-2xl bg-[var(--nova-surface-raised)] border border-[var(--nova-border-color)] shadow-lg hover:border-[var(--nova-border-color)] transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${card.color} text-[var(--nova-text-primary)] shadow-lg`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className={`flex items-center gap-0.5 text-xs font-semibold ${card.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {card.isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {card.change}
                </div>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold text-[var(--nova-text-primary)]">{card.value}</p>
                <p className="text-xs text-[var(--nova-text-secondary)] font-medium mt-0.5">{card.title}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 p-6 rounded-2xl bg-[var(--nova-surface-raised)] border border-[var(--nova-border-color)] shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-[var(--nova-text-primary)] flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[var(--nova-accent-color)]" />
                {t('analytics.activityDynamics')}
              </h2>
              <p className="text-xs text-[#868b98]">
                {t('analytics.activitySubtitle')}
              </p>
            </div>
          </div>

          <div className="h-64 flex items-end justify-between gap-3 pt-6 px-2">
            {activityData.map((item, idx) => {
              const heightPercent = Math.max(12, Math.round((item.messages / maxMessages) * 100));
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <div className="text-[11px] font-semibold text-[var(--nova-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--nova-surface-high)] px-2 py-0.5 rounded text-[var(--nova-accent-color)]">
                    {item.messages}
                  </div>
                  <div className="w-full bg-[var(--nova-surface-high)] rounded-t-xl overflow-hidden h-full flex items-end p-1">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className="w-full rounded-t-lg bg-gradient-to-t from-[var(--nova-accent-color)] via-[var(--nova-accent-color, ff6b35)] to-[var(--nova-accent-color, ff8c42)] group-hover:from-[var(--nova-accent-color, ff6b35)] group-hover:to-[var(--nova-accent-color, ffa366)] transition-all duration-300"
                    ></div>
                  </div>
                  <span className="text-xs font-medium text-[var(--nova-text-secondary)]">{item.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-[var(--nova-surface-high)] border border-[var(--nova-border-color)] shadow-lg flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--nova-text-primary)] flex items-center gap-2 mb-1">
              <Activity className="w-5 h-5 text-[var(--nova-accent-color)]" />
              {t('analytics.events')}
            </h2>
            <p className="text-xs text-[var(--nova-text-secondary)] mb-6">
              {t('analytics.eventsSubtitle')}
            </p>
            <div className="space-y-2.5">
              {Object.entries(eventCounts).map(([eventType, count]) => (
                <div key={eventType} className="flex items-center justify-between text-xs">
                  <span className="text-[var(--nova-text-secondary)] font-medium">{eventType}</span>
                  <span className="font-semibold text-[var(--nova-accent-color)]">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--nova-border-color)] flex items-center justify-between text-xs text-[var(--nova-text-secondary)]">
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>{t('analytics.localOnlyAnalytics')}</span>
            </div>
            <span className="text-emerald-400 font-medium">{t('analytics.zeroNetwork')}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl bg-[var(--nova-surface-raised)] border border-[var(--nova-border-color)] shadow-lg">
          <h2 className="text-lg font-semibold text-[#e8ebf0] flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-emerald-400" />
            {t('analytics.topContacts')}
          </h2>
          <div className="space-y-4">
            {topContacts.length > 0 ? (
              topContacts.map((contact, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-[var(--nova-canvas)] border border-[var(--nova-border-color)] hover:border-[var(--nova-border-color)]/40 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/30 flex items-center justify-center text-[var(--nova-accent-color)]">
                      {contact.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--nova-text-primary)]">{contact.name}</p>
                      <p className="text-xs text-[var(--nova-text-secondary)]">{t('analytics.contact')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[var(--nova-accent-color)]">{contact.messages}</p>
                    <p className="text-[11px] text-[var(--nova-text-secondary)]">{t('analytics.messagesCount')}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-xs text-[var(--nova-text-secondary)]">{t('analytics.noActivityData')}</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-[var(--nova-surface-high)] border border-[var(--nova-border-color)] shadow-lg flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--nova-text-primary)] flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              {t('analytics.securityStatus')}
            </h2>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--nova-canvas)] border border-[var(--nova-border-color)]">
                <span className="text-[var(--nova-text-secondary)] font-medium">{t('analytics.e2ee')}</span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  {t('analytics.active')}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--nova-canvas)] border border-[var(--nova-border-color)]">
                <span className="text-[var(--nova-text-secondary)] font-medium">{t('analytics.analyticsLocal')}</span>
                <span className="px-2.5 py-1 rounded-lg bg-[var(--nova-accent-color)]/10 text-[var(--nova-accent-color)] border border-[var(--nova-accent-color)]/20 font-semibold">
                  {t('analytics.local')}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--nova-canvas)] border border-[var(--nova-border-color)]">
                <span className="text-[var(--nova-text-secondary)] font-medium">{t('analytics.network')}</span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  {t('analytics.offline')}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--nova-border-color)] flex items-center justify-between text-xs text-[var(--nova-text-secondary)]">
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>{t('analytics.protocol')}</span>
            </div>
            <span className="text-emerald-400 font-medium">{t('analytics.zeroDataSent')}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
























