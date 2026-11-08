import React, { useState } from 'react';
import { ArrowLeft, Search, Paperclip, Volume2, VolumeX, MoreVertical, MessageCircle } from 'lucide-react';
import { MOCK_CHANNEL_POSTS } from '../data/mockMessengerData';
import { ChannelPost } from '../types/messenger';
import { DoodleBackground } from './DoodleBackground';
import { useLanguage } from '../context/LanguageContext';

interface ChannelScreenProps {
  onBack: () => void;
}

export const ChannelScreen: React.FC<ChannelScreenProps> = ({ onBack }) => {
  const { t } = useLanguage();
  const [selectedDate, setSelectedDate] = useState<number>(24);
  const [posts, setPosts] = useState<ChannelPost[]>(MOCK_CHANNEL_POSTS);
  const [isSoundEnabled, setIsSoundEnabled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const dates = [
    { day: 20, hasDot: false },
    { day: 21, hasDot: true },
    { day: 22, hasDot: false },
    { day: 23, hasDot: false },
    { day: 24, hasDot: false },
    { day: 25, hasDot: false },
    { day: 26, hasDot: false },
  ];

  const handleToggleReaction = (postId: string, emoji: string) => {
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post;
        return {
          ...post,
          reactions: post.reactions.map((r) => {
            if (r.emoji === emoji) {
              const userReacted = !r.userReacted;
              return {
                ...r,
                userReacted,
                count: userReacted ? r.count + 1 : r.count - 1,
              };
            }
            return r;
          }),
        };
      })
    );
  };

  const filteredPosts = posts.filter((p) => {
    const matchesDate = selectedDate ? p.dateKey === selectedDate : true;
    const matchesSearch = searchQuery
      ? p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.text.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    return matchesDate && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full bg-[#0b0c10] text-white relative select-none overflow-hidden">
      <DoodleBackground />

      {/* Floating Header Card with Date Scrubber */}
      <div className="p-3 shrink-0 relative z-20">
        <div className="bg-[#14151c]/95 backdrop-blur-xl border border-white/10 rounded-3xl p-3 shadow-xl shadow-black/70">
          {/* Channel Top row */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={onBack}
              className="w-9 h-9 rounded-full bg-[#1e2029]/80 hover:bg-[#282a36] border border-white/5 flex items-center justify-center text-white/90 active:scale-95 transition cursor-pointer md:hidden shrink-0"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="text-center">
              <h2 className="font-bold text-[16px] text-white tracking-tight">
                Real Kyiv Life
              </h2>
              <p className="text-[11px] text-[#868b98]">3,495,530 subscribers</p>
            </div>

            {/* Red trident coat of arms avatar */}
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#e11d48] to-[#ff4e18] flex items-center justify-center shadow-lg shadow-red-950/40 border border-white/15">
              <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
                <path d="M12 2L10 7H14L12 2ZM7 6L9 9H5L7 6ZM17 6L15 9H19L17 6ZM11 11H13V19H15V22H9V19H11V11ZM4 11H7V15C7 16.5 8 17.5 9.5 17.8V15.5C8.8 15.2 8.5 14.5 8.5 13.8V11H4ZM20 11H17V15C17 16.5 16 17.5 14.5 17.8V15.5C15.2 15.2 15.5 14.5 15.5 13.8V11H20Z" />
              </svg>
            </div>
          </div>

          {/* Interactive Date Scrubber / Timeline Ruler */}
          <div className="pt-1 px-1">
            <div className="flex items-center justify-between relative px-2">
              {/* Ruler horizontal line with ticks */}
              <div className="absolute inset-x-4 top-[17px] h-[1px] bg-white/10 z-0 pointer-events-none" />

              {dates.map((item) => {
                const isSelected = selectedDate === item.day;
                return (
                  <button
                    key={item.day}
                    onClick={() => setSelectedDate(item.day)}
                    className="relative z-10 flex flex-col items-center group cursor-pointer focus:outline-none transition active:scale-95"
                  >
                    <div
                      className={`text-[12px] font-semibold transition px-2 py-0.5 rounded-lg ${
                        isSelected
                          ? 'bg-[#22242f] text-white border border-white/15 shadow-sm scale-110'
                          : 'text-[#6e727e] group-hover:text-white/80'
                      }`}
                    >
                      {item.day}
                    </div>

                    {/* Ruler tick mark */}
                    <div
                      className={`w-[1px] transition my-1 ${
                        isSelected
                          ? 'h-3 bg-[#ff4e18]'
                          : 'h-1.5 bg-white/20 group-hover:bg-white/40'
                      }`}
                    />

                    {/* Dot indicator if has unread/special news */}
                    {item.hasDot && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#ff4e18] shadow-sm shadow-[#ff4e18]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar when toggled */}
      {searchOpen && (
        <div className="px-4 pb-2 z-20">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('channel.searchFeed')}
            className="w-full px-4 py-2 bg-[#171820] border border-white/10 rounded-2xl text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#ff4e18]/60"
            autoFocus
          />
        </div>
      )}

      {/* Posts Stream */}
      <div className="flex-1 overflow-y-auto px-4 py-1 space-y-4 relative z-10 pb-20">
        {filteredPosts.length === 0 ? (
          <div className="text-center py-12 text-[#717682] text-sm">
            No posts found for day {selectedDate}. Try selecting another date on the ruler!
          </div>
        ) : (
          filteredPosts.map((post) => (
            <div key={post.id} className="relative flex items-start gap-2.5">
              {/* Left Timestamp Margin */}
              <div className="text-[11px] font-medium text-[#717682] pt-3 shrink-0 w-10 text-right tabular-nums">
                {post.time}
              </div>

              {/* Post Card */}
              <div className="flex-1 bg-[#171820]/95 border border-white/5 rounded-[24px] p-4 text-white shadow-md shadow-black/50 space-y-3">
                {/* Media Image Banner if present */}
                {post.image && (
                  <div className="rounded-[18px] overflow-hidden relative bg-[#22242e] aspect-[16/9] group">
                    <img
                      src={post.image}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    {post.imageBadge && (
                      <div className="absolute bottom-2.5 left-2.5 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-semibold text-white border border-white/10">
                        {post.imageBadge}
                      </div>
                    )}
                    {/* Carousel indicator dots */}
                    <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                      <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                    </div>
                  </div>
                )}

                {/* Title & 3-dots */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-[14.5px] text-white leading-snug">
                    {post.title}
                  </h3>
                  <button
                    onClick={() => showToast('Post link copied to clipboard')}
                    className="text-white/40 hover:text-white p-1 rounded-full transition cursor-pointer"
                    title={t('common.reply')}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>

                {/* Body Text */}
                <p className="text-[13px] text-[#a0a5b2] font-normal leading-relaxed">
                  {post.text}
                </p>

                {/* Reactions & Comments Row */}
                <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                  {/* Comments count pill */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1e2028] text-xs text-[#8c919d] border border-white/5 font-medium">
                    <MessageCircle className="w-3.5 h-3.5 text-[#8c919d]" />
                    <span>{post.commentsCount}</span>
                  </div>

                  {/* Reaction Pills with interactive counters */}
                  {post.reactions.map((reaction, i) => (
                    <button
                      key={i}
                      onClick={() => handleToggleReaction(post.id, reaction.emoji)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition cursor-pointer active:scale-90 ${
                        reaction.userReacted
                          ? 'bg-[#ff4e18]/20 border border-[#ff4e18]/50 text-white font-semibold'
                          : 'bg-[#1e2028] hover:bg-[#252834] text-[#a6abb8] border border-white/5'
                      }`}
                    >
                      <span className="text-[13px]">{reaction.emoji}</span>
                      <span className="text-[11px] font-medium tabular-nums">
                        {reaction.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-[#1e202a]/95 border border-[#ff4e18]/50 text-white text-xs px-3.5 py-1.5 rounded-full shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      {/* Bottom Action Bar */}
      <div className="p-3 relative z-20 shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Share/attach button */}
          <button
            onClick={() => showToast('Channel share link copied')}
            className="w-11 h-11 rounded-full bg-[#181920]/95 hover:bg-[#20222a] border border-white/10 text-white/70 hover:text-white flex items-center justify-center active:scale-95 transition cursor-pointer shadow-md"
            title={t('common.share')}
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Center Sound Toggle Pill */}
          <button
            onClick={() => setIsSoundEnabled(!isSoundEnabled)}
            className={`flex-1 py-2.5 px-4 rounded-full border border-white/10 flex items-center justify-center gap-2 text-xs font-semibold transition active:scale-98 cursor-pointer shadow-md ${
              isSoundEnabled
                ? 'bg-[#ff4e18] text-white shadow-lg shadow-[#ff4e18]/25'
                : 'bg-[#181920]/95 text-white/80 hover:text-white hover:bg-[#20222a]'
            }`}
          >
            {isSoundEnabled ? (
              <>
                <Volume2 className="w-4 h-4 text-white" />
                <span>Sound Enabled</span>
              </>
            ) : (
              <>
                <VolumeX className="w-4 h-4 text-white/70" />
                <span>Enable Sound</span>
              </>
            )}
          </button>

          {/* Search Button */}
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className={`w-11 h-11 rounded-full border border-white/10 flex items-center justify-center active:scale-95 transition cursor-pointer shadow-md ${
              searchOpen
                ? 'bg-[#ff4e18] text-white'
                : 'bg-[#181920]/95 text-white/70 hover:text-white hover:bg-[#20222a]'
            }`}
            title={t('common.search')}
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
