import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import {
  BarChart3,
  TrendingUp,
  MessageSquare,
  HardDrive,
  Clock,
  ShieldCheck,
  Zap,
  Users,
  FileText,
  Image,
  Video,
  Mic,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Calendar,
  Activity
} from 'lucide-react';

export const AnalyticsScreen: React.FC = () => {
  const { t, language } = useLanguage();
  const [timeframe, setTimeframe] = useState<'week' | 'month' | 'year'>('week');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  // Mock data for usage stats
  const activityData = {
    week: [
      { day: language === 'ru' ? 'Пн' : language === 'uk' ? 'Пн' : 'Mon', messages: 142, voice: 18 },
      { day: language === 'ru' ? 'Вт' : language === 'uk' ? 'Вт' : 'Tue', messages: 215, voice: 32 },
      { day: language === 'ru' ? 'Ср' : language === 'uk' ? 'Ср' : 'Wed', messages: 189, voice: 25 },
      { day: language === 'ru' ? 'Чт' : language === 'uk' ? 'Чт' : 'Thu', messages: 290, voice: 45 },
      { day: language === 'ru' ? 'Пт' : language === 'uk' ? 'Пт' : 'Fri', messages: 340, voice: 60 },
      { day: language === 'ru' ? 'Сб' : language === 'uk' ? 'Сб' : 'Sat', messages: 210, voice: 50 },
      { day: language === 'ru' ? 'Вс' : language === 'uk' ? 'Нд' : 'Sun', messages: 175, voice: 40 },
    ],
    month: [
      { day: 'W1', messages: 1200, voice: 180 },
      { day: 'W2', messages: 1450, voice: 210 },
      { day: 'W3', messages: 1680, voice: 290 },
      { day: 'W4', messages: 1950, voice: 310 },
    ],
    year: [
      { day: 'Q1', messages: 4500, voice: 700 },
      { day: 'Q2', messages: 5200, voice: 890 },
      { day: 'Q3', messages: 6100, voice: 1100 },
      { day: 'Q4', messages: 7400, voice: 1350 },
    ]
  };

  const currentChart = activityData[timeframe];
  const maxMessages = Math.max(...currentChart.map(d => d.messages));

  const statsCards = [
    {
      title: language === 'ru' ? 'Всего сообщений' : language === 'uk' ? 'Всього повідомлень' : 'Total Messages',
      value: '1,561',
      change: '+14.2%',
      isPositive: true,
      icon: MessageSquare,
      color: 'from-cyan-500 to-blue-600',
    },
    {
      title: language === 'ru' ? 'Активные чаты' : language === 'uk' ? 'Активні чати' : 'Active Chats',
      value: '24',
      change: '+3',
      isPositive: true,
      icon: Users,
      color: 'from-emerald-500 to-teal-600',
    },
    {
      title: language === 'ru' ? 'Голосовые звонки' : language === 'uk' ? 'Голосові дзвінки' : 'Voice Calls',
      value: '4.8 hrs',
      change: '+22.5%',
      isPositive: true,
      icon: Clock,
      color: 'from-purple-500 to-indigo-600',
    },
    {
      title: language === 'ru' ? 'Использование хранилища' : language === 'uk' ? 'Використання сховища' : 'Storage Used',
      value: '3.4 GB',
      change: '-0.8%',
      isPositive: true,
      icon: HardDrive,
      color: 'from-amber-500 to-orange-600',
    },
  ];

  const storageBreakdown = [
    { type: language === 'ru' ? 'Видео' : language === 'uk' ? 'Відео' : 'Videos', size: '1.8 GB', percent: 53, icon: Video, color: 'bg-indigo-500' },
    { type: language === 'ru' ? 'Фото' : language === 'uk' ? 'Фото' : 'Photos', size: '890 MB', percent: 26, icon: Image, color: 'bg-cyan-500' },
    { type: language === 'ru' ? 'Документы' : language === 'uk' ? 'Документи' : 'Documents', size: '420 MB', percent: 12, icon: FileText, color: 'bg-emerald-500' },
    { type: language === 'ru' ? 'Голосовые' : language === 'uk' ? 'Голосові' : 'Voice Notes', size: '310 MB', percent: 9, icon: Mic, color: 'bg-amber-500' },
  ];

  const topContacts = [
    { name: 'Елена Воронина', role: language === 'ru' ? 'Дизайнер' : language === 'uk' ? 'Дизайнер' : 'Designer', messages: 642, avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80' },
    { name: 'Алексей Смирнов', role: language === 'ru' ? 'Разработчик' : language === 'uk' ? 'Розробник' : 'Developer', messages: 418, avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80' },
    { name: 'Nova Tech Channel', role: language === 'ru' ? 'Канал' : language === 'uk' ? 'Канал' : 'Channel', messages: 295, avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80' },
  ];

  return (
    <div className="flex-1 bg-[#0b0c10] text-[#e8ebf0] overflow-y-auto p-6 md:p-8 custom-scrollbar">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#ff4e18]/10 text-[#ff4e18] border border-[#ff4e18]/20">
              <BarChart3 className="w-6 h-6" />
            </div>
            <h1 className="text-2xl md:text-[28px] font-bold tracking-tight text-[#e8ebf0]">
              {language === 'ru' ? 'Аналитика использования' : language === 'uk' ? 'Аналітика використання' : 'Usage Analytics'}
            </h1>
          </div>
          <p className="text-[#868b98] text-sm mt-1">
            {language === 'ru'
              ? 'Статистика сообщений, активности и ресурсов Nova Messenger'
              : language === 'uk'
              ? 'Статистика повідомлень, активності та ресурсів Nova Messenger'
              : 'Detailed statistics of messages, activity, and storage'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className={`p-2.5 rounded-xl border border-white/5 bg-[#181921] hover:bg-[#20222a] text-[#868b98] transition-all ${
              isRefreshing ? 'animate-spin text-[#ff4e18]' : ''
            }`}
            title="Refresh statistics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <div className="flex items-center p-1 rounded-xl bg-[#181921] border border-white/5 text-xs font-medium">
            {(['week', 'month', 'year'] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-3 py-1.5 rounded-lg transition-all capitalize ${
                  timeframe === tf
                    ? 'bg-[#ff4e18]/10 text-[#ff4e18] shadow-md shadow-[#ff4e18]/25 font-semibold'
                    : 'text-[#868b98] hover:text-[#e8ebf0]'
                }`}
              >
                {tf === 'week'
                  ? language === 'ru' ? 'Неделя' : language === 'uk' ? 'Тиждень' : 'Week'
                  : tf === 'month'
                  ? language === 'ru' ? 'Месяц' : language === 'uk' ? 'Місяць' : 'Month'
                  : language === 'ru' ? 'Год' : language === 'uk' ? 'Рік' : 'Year'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statsCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className="relative p-5 rounded-2xl bg-[#181921] border border-white/5 shadow-lg hover:border-white/10 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${card.color} text-white shadow-lg`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className={`flex items-center gap-0.5 text-xs font-semibold ${card.isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {card.isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  {card.change}
                </div>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold text-[#e8ebf0]">{card.value}</p>
                <p className="text-xs text-[#868b98] font-medium mt-0.5">{card.title}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Activity Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 p-6 rounded-2xl bg-[#181921] border border-white/5 shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-[#e8ebf0] flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#ff4e18]" />
                {language === 'ru' ? 'Динамика активности' : language === 'uk' ? 'Динаміка активності' : 'Activity Dynamics'}
              </h2>
              <p className="text-xs text-[#868b98]">
                {language === 'ru' ? 'Отправлено сообщений по периодам' : language === 'uk' ? 'Надіслано повідомлень по періодах' : 'Messages sent per time period'}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff4e18]"></span>
                <span className="text-[#868b98]">{language === 'ru' ? 'Сообщения' : language === 'uk' ? 'Повідомлення' : 'Messages'}</span>
              </div>
            </div>
          </div>

          {/* Bar Chart Visualization */}
          <div className="h-64 flex items-end justify-between gap-3 pt-6 px-2">
            {currentChart.map((item, idx) => {
              const heightPercent = Math.max(12, Math.round((item.messages / maxMessages) * 100));
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <div className="text-[11px] font-semibold text-[#868b98] opacity-0 group-hover:opacity-100 transition-opacity bg-[#20222a] px-2 py-0.5 rounded text-[#ff4e18]">
                    {item.messages}
                  </div>
                  <div className="w-full bg-[#12131c] rounded-t-xl overflow-hidden h-full flex items-end p-1">
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className="w-full rounded-t-lg bg-gradient-to-t from-[#ff4e18] via-[#ff6b35] to-[#ff8c42] group-hover:from-[#ff6b35] group-hover:to-[#ffa366] transition-all duration-300"
                    ></div>
                  </div>
                  <span className="text-xs font-medium text-[#868b98]">{item.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Storage Breakdown Card */}
        <div className="p-6 rounded-2xl bg-[#181920] border border-white/5 shadow-lg flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e8ebf0] flex items-center gap-2 mb-1">
              <HardDrive className="w-5 h-5 text-[#ff4e18]" />
              {language === 'ru' ? 'Распределение хранилища' : language === 'uk' ? 'Розподіл сховища' : 'Storage Breakdown'}
            </h2>
            <p className="text-xs text-[#868b98] mb-6">
              {language === 'ru' ? 'Занято 3.4 ГБ из 10 ГБ' : language === 'uk' ? 'Зайнято 3.4 ГБ з 10 ГБ' : '3.4 GB of 10 GB used'}
            </p>

            {/* Total Storage Bar */}
            <div className="w-full h-3 bg-[#12131c] rounded-full overflow-hidden flex mb-6 p-0.5">
              {storageBreakdown.map((item, i) => (
                <div
                  key={i}
                  style={{ width: `${item.percent}%` }}
                  className={`h-full ${item.color} ${i === 0 ? 'rounded-l-full' : ''} ${i === storageBreakdown.length - 1 ? 'rounded-r-full' : ''}`}
                ></div>
              ))}
            </div>

            {/* List */}
            <div className="space-y-3.5">
              {storageBreakdown.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-lg ${item.color} bg-opacity-20 text-[#e8ebf0]`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-[#c4c9d4]">{item.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#e8ebf0]">{item.size}</span>
                      <span className="text-[#6a6f7b]">({item.percent}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-white/5 mt-4 flex justify-between items-center text-xs">
            <span className="text-[#868b98]">{language === 'ru' ? 'Кэш сообщений' : language === 'uk' ? 'Кеш повідомлень' : 'Message Cache'}</span>
            <button className="text-[#ff4e18] hover:text-[#ff6b35] font-semibold transition-colors">
              {language === 'ru' ? 'Очистить кэш' : language === 'uk' ? 'Очистити кеш' : 'Clear Cache'}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Row: Top Contacts & Security Shield */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Contacts */}
        <div className="p-6 rounded-2xl bg-[#181921] border border-white/5 shadow-lg">
          <h2 className="text-lg font-semibold text-[#e8ebf0] flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-emerald-400" />
            {language === 'ru' ? 'Частые собеседники' : language === 'uk' ? 'Часті співрозмовники' : 'Top Contacts'}
          </h2>
          <div className="space-y-4">
            {topContacts.map((contact, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-[#0b0c10] border border-white/5 hover:border-white/10 transition-all">
                <div className="flex items-center gap-3">
                  <img src={contact.avatar} alt={contact.name} className="w-10 h-10 rounded-full object-cover border border-white/10" />
                  <div>
                    <p className="text-sm font-semibold text-[#e8ebf0]">{contact.name}</p>
                    <p className="text-xs text-[#868b98]">{contact.role}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-[#ff4e18]">{contact.messages}</p>
                  <p className="text-[11px] text-[#6a6f7b]">{language === 'ru' ? 'сообщений' : language === 'uk' ? 'повідомлень' : 'messages'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security & System Info */}
        <div className="p-6 rounded-2xl bg-[#181920] border border-white/5 shadow-lg flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#e8ebf0] flex items-center gap-2 mb-4">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              {language === 'ru' ? 'Безопасность и Статус' : language === 'uk' ? 'Безпека та Статус' : 'Security & System Status'}
            </h2>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#0b0c10] border border-white/5">
                <span className="text-[#c4c9d4] font-medium">{language === 'ru' ? 'Сквозное шифрование (E2EE)' : language === 'uk' ? 'Наскрізне шифрування (E2EE)' : 'End-to-End Encryption'}</span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  {language === 'ru' ? 'Активно' : language === 'uk' ? 'Активно' : 'Active'}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#0b0c10] border border-white/5">
                <span className="text-[#c4c9d4] font-medium">{language === 'ru' ? 'Активные сессии' : language === 'uk' ? 'Активні сесії' : 'Active Sessions'}</span>
                <span className="text-[#e8ebf0] font-semibold">2 {language === 'ru' ? 'устройства' : language === 'uk' ? 'пристрої' : 'devices'}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#0b0c10] border border-white/5">
                <span className="text-[#c4c9d4] font-medium">{language === 'ru' ? 'Двухфакторная аутентификация' : language === 'uk' ? 'Двофакторна автентифікація' : '2-Factor Authentication'}</span>
                <span className="px-2.5 py-1 rounded-lg bg-[#ff4e18]/10 text-[#ff4e18] border border-[#ff4e18]/20 font-semibold">
                  {language === 'ru' ? 'Включена' : language === 'uk' ? 'Увімкнено' : 'Enabled'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-[#868b98]">
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Nova Protocol v2.4 (TLS 1.3)</span>
            </div>
            <span className="text-emerald-400 font-medium">99.99% Uptime</span>
          </div>
        </div>
      </div>
    </div>
  );
};
