import { useState } from 'react';
import { MeshRadar } from './MeshRadar';
import { TransportManager } from '../lib/network/TransportManager';
import { MeshRoutingTable } from '../lib/p2p/MeshRoutingTable';
import {
  Video,
  Search,
  Palette,
  Sparkles,
  Pin,
  Mic,
  X,
  Lock,
  Folder,
} from 'lucide-react';
import {
  NovaButton,
  NovaInput,
  NovaToggle,
  NovaCard,
  NovaModal,
  NovaAvatar,
  NovaSelectableButton,
  NovaColorChip,
  NovaNavButton,
  ScrollableRow,
} from '../lib/ui';

export const UIShowcase = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [toggle1, setToggle1] = useState(true);
  const [toggle2, setToggle2] = useState(false);

  return (
    <div className="p-8 md:p-12 space-y-8 max-w-4xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-white">UI Components Showcase</h1>
        <p className="text-[#8c919d]">Все переиспользуемые компоненты системы дизайна Nova</p>
      </div>

      {/* NovaButton */}
      <section className="rounded-2xl bg-[#181921] border border-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">NovaButton</h2>
        <div className="flex flex-wrap gap-3">
          <NovaButton variant="ghost" size="sm" onClick={() => {}}>
            Ghost SM
          </NovaButton>
          <NovaButton variant="ghost" size="md" onClick={() => {}}>
            Ghost MD
          </NovaButton>
          <NovaButton variant="ghost" size="lg" onClick={() => {}}>
            Ghost LG
          </NovaButton>
          <NovaButton variant="accent" size="sm" onClick={() => {}}>
            Accent
          </NovaButton>
          <NovaButton variant="accent-ghost" onClick={() => {}}>
            Accent Ghost
          </NovaButton>
          <NovaButton variant="danger" onClick={() => {}}>
            Danger
          </NovaButton>
          <NovaButton variant="ghost" badge="3" onClick={() => {}}>
            With Badge
          </NovaButton>
          <NovaButton variant="ghost" disabled onClick={() => {}}>
            Disabled
          </NovaButton>
          <NovaButton variant="ghost" onClick={() => setModalOpen(true)} title="Open Modal">
            <Video className="w-3.5 h-3.5 mr-1.5" />
            Open Modal
          </NovaButton>
        </div>
      </section>

      {/* NovaInput */}
      <section className="rounded-2xl bg-[#181921] border border-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">NovaInput</h2>
        <div className="space-y-4 max-w-md">
          <NovaInput label="Username" placeholder="Enter your username" />
          <NovaInput label="Email" placeholder="email@example.com" error="Invalid email address" />
          <NovaInput
            label="Bio"
            placeholder="Tell us about yourself"
            helperText="Max 200 characters"
          />
          <NovaInput label="Disabled Input" placeholder="Cannot edit" disabled />
        </div>
      </section>

      {/* NovaToggle */}
      <section className="rounded-2xl bg-[#181921] border border-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">NovaToggle</h2>
        <div className="space-y-4 max-w-md">
          <NovaToggle label="Notifications" checked={toggle1} onChange={setToggle1} />
          <NovaToggle label="Vibration" checked={toggle2} onChange={setToggle2} />
          <NovaToggle label="Disabled Toggle" disabled />
        </div>
      </section>

      {/* NovaCard */}
      <section className="rounded-2xl bg-[#181921] border border-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">NovaCard</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <NovaCard variant="default" padding="md">
            <div className="text-sm text-[#8c919d]">Default</div>
          </NovaCard>
          <NovaCard variant="elevated" padding="md">
            <div className="text-sm text-[#8c919d]">Elevated</div>
          </NovaCard>
          <NovaCard variant="outline" padding="md">
            <div className="text-sm text-[#8c919d]">Outline</div>
          </NovaCard>
          <NovaCard variant="accent" padding="md">
            <div className="text-sm text-[var(--nova-accent-color,#ff4e18)]">Accent</div>
          </NovaCard>
        </div>
      </section>

      {/* NovaAvatar */}
      <section className="rounded-2xl bg-[#181921] border border-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">NovaAvatar</h2>
        <div className="flex items-center gap-4">
          <NovaAvatar name="Katie Rogers" size="xl" status="online" showStatus />
          <NovaAvatar name="Kurt Cobain" size="lg" status="away" showStatus />
          <NovaAvatar name="Offline User" size="md" status="offline" showStatus />
          <NovaAvatar name="Single" size="sm" />
          <NovaAvatar size="md" />
        </div>
        <div className="mt-4 text-xs text-[#6b7280]">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span>Online</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />
            <span>Away</span>
          </div>
        </div>
      </section>

      {/* NovaColorChip */}
      <section className="rounded-2xl bg-[#181921] border border-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">NovaColorChip</h2>
        <div className="flex gap-2">
          <NovaColorChip gradient="from-[#1E3A8A] to-[#3B82F6]" label="Sapphire" selected onClick={() => {}}>
            Sapphire
          </NovaColorChip>
          <NovaColorChip gradient="from-[#6B21A8] to-[#A855F7]" label="Amethyst" onClick={() => {}}>
            Amethyst
          </NovaColorChip>
          <NovaColorChip gradient="from-[#047857] to-[#10B981]" label="Emerald" locked onClick={() => {}}>
            Emerald
          </NovaColorChip>
        </div>
      </section>
      <section className="rounded-2xl bg-[#181921] border border-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">NovaSelectableButton</h2>
        <div className="flex gap-2">
          <NovaSelectableButton selected icon={<Video className="w-4 h-4" />} label="Video" onClick={() => {}}>
            Video
          </NovaSelectableButton>
          <NovaSelectableButton icon={<Search className="w-4 h-4" />} label="Search" onClick={() => {}}>
            Search
          </NovaSelectableButton>
          <NovaSelectableButton icon={<Palette className="w-4 h-4" />} label="Wallpaper" onClick={() => {}}>
            Wallpaper
          </NovaSelectableButton>
          <NovaSelectableButton disabled icon={<Lock className="w-4 h-4" />} label="Premium" onClick={() => {}}>
            Premium
          </NovaSelectableButton>
        </div>
      </section>
      <section className="rounded-2xl bg-[#181921] border border-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">NovaNavButton</h2>
        <div className="flex gap-4">
          <NovaNavButton active icon={<Video className="w-5 h-5" />} label="Chats" onClick={() => {}}>
            Chats
          </NovaNavButton>
          <NovaNavButton icon={<Search className="w-5 h-5" />} label="Channels" onClick={() => {}}>
            Channels
          </NovaNavButton>
          <NovaNavButton icon={<Folder className="w-5 h-5" />} label="Folders" onClick={() => {}}>
            Folders
          </NovaNavButton>
          <NovaNavButton icon={<Pin className="w-5 h-5" />} label="Profile" onClick={() => {}}>
            Profile
          </NovaNavButton>
        </div>
      </section>
      <section className="rounded-2xl bg-[#181921] border border-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">MeshRadar</h2>
        <p className="text-[#8c919d] text-sm mb-4">
          Визуализация меш-сети: узлы, соединения, маршрутизация, статус в реальном времени.
        </p>
        <MeshRadar className="h-[400px]" />
      </section>
      <NovaButton variant="accent" onClick={() => setModalOpen(true)} title="Open demo modal">
        Open Modal Demo
      </NovaButton>

      {/* NovaModal */}
      <NovaModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Demo Modal"
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-white">Это демонстрационное модальное окноbuilt на основе <code className="bg-white/10 px-1 py-0.5 rounded">NovaModal</code>.</p>
          <div className="flex gap-3 pt-4">
            <NovaButton variant="ghost" onClick={() => setModalOpen(false)}>
              Отмена
            </NovaButton>
            <NovaButton variant="accent" onClick={() => setModalOpen(false)}>
              Сохранить
            </NovaButton>
          </div>
        </div>
      </NovaModal>

      {/* ScrollableRow */}
      <section className="rounded-2xl bg-[#181921] border border-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">ScrollableRow</h2>
        <p className="text-[#8c919d] text-sm mb-4">Горизонтальный скролл без видимого скроллбара:</p>
        <ScrollableRow wheelScroll={true} gap="2" className="border border-white/10 p-2 rounded-xl">
          {['📷', '📍', '📄', '🎤', '❌'].map((icon, i) => (
            <NovaButton
              key={i}
              variant="ghost"
              size="sm"
              onClick={() => {}}
              title={`Item ${i + 1}`}
            >
              <span className="text-lg">{icon}</span>
            </NovaButton>
          ))}
        </ScrollableRow>
      </section>

      {/* TransportManager */}
      <section className="rounded-2xl bg-[#181921] border border-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">TransportManager</h2>
        <p className="text-[#8c919d] text-sm mb-4">
          Переключатель транспорта: WebRTC, WebSocket, Mesh, Tor с авто-фейловером.
        </p>
        <div className="space-y-2">
          <NovaButton variant="ghost" size="sm" onClick={() => {}} disabled>
            WebRTC (priority: 1)
          </NovaButton>
          <NovaButton variant="ghost" size="sm" onClick={() => {}} disabled>
            WebSocket (priority: 2)
          </NovaButton>
          <NovaButton variant="ghost" size="sm" onClick={() => {}} disabled>
            Mesh relay (priority: 3)
          </NovaButton>
          <NovaButton variant="ghost" size="sm" onClick={() => {}} disabled>
            Tor/SOCKS5 (priority: 4)
          </NovaButton>
        </div>
        <div className="mt-3 text-[10px] text-[#8c919d] flex gap-4">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#10b981]" />
            <span>Auto-failover: enabled</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#10b981]" />
            <span>Probe interval: 30s</span>
          </div>
        </div>
      </section>

      {/* MeshRoutingTable */}
      <section className="rounded-2xl bg-[#181921] border border-white/5 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">MeshRoutingTable</h2>
        <p className="text-[#8c919d] text-sm mb-4">
          Таблица маршрутизации меш-сети с TTL-экспирацией и метриками надёжности.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px]">
          <div className="bg-[#14151c] p-3 rounded-xl border border-white/10">
            <div className="text-[#8c919d] text-[9px] mb-1">Active routes</div>
            <div className="text-white font-mono">0</div>
          </div>
          <div className="bg-[#14151c] p-3 rounded-xl border border-white/10">
            <div className="text-[#8c919d] text-[9px] mb-1">Default TTL</div>
            <div className="text-white font-mono">300s</div>
          </div>
          <div className="bg-[#14151c] p-3 rounded-xl border border-white/10">
            <div className="text-[#8c919d] text-[9px] mb-1">Max routes</div>
            <div className="text-white font-mono">1000</div>
          </div>
          <div className="bg-[#14151c] p-3 rounded-xl border border-white/10">
            <div className="text-[#8c919d] text-[9px] mb-1">Expiry interval</div>
            <div className="text-white font-mono">60s</div>
          </div>
        </div>
      </section>
    </div>
  );
};
