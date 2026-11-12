import React, { useState } from 'react';
import { MapPin, Navigation, Radio, Clock, Search, Check } from 'lucide-react';
import { NovaModal } from '../lib/ui/NovaModal';
import { NovaButton } from '../lib/ui/NovaButton';
import { LocationData } from '../types/messenger';
import { useLanguage } from '../context/LanguageContext';

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendLocation: (location: LocationData) => void;
}

const PRESET_PLACES = [
  {
    title: "Harry's Bar & Bistro",
    address: '12 Khreshchatyk Street, Kyiv',
    latitude: 50.4501,
    longitude: 30.5234,
  },
  {
    title: 'Unit.City Innovation District',
    address: '3 Dorohozhytska St, Kyiv',
    latitude: 50.4682,
    longitude: 30.4623,
  },
  {
    title: 'Golden Gate Plaza',
    address: '40A Volodymyrska St, Kyiv',
    latitude: 50.4488,
    longitude: 30.5133,
  },
  {
    title: 'Bessarabska Market & Cafe',
    address: '2 Bessarabska Square, Kyiv',
    latitude: 50.4422,
    longitude: 30.5218,
  },
];

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  onSendLocation,
}) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<'place' | 'live'>('place');
  const [selectedPlace, setSelectedPlace] = useState(PRESET_PLACES[0]);
  const [customSearch, setCustomSearch] = useState('');
  const [liveDuration, setLiveDuration] = useState<'15m' | '1h' | '8h'>('1h');

  const filteredPlaces = PRESET_PLACES.filter(
    (p) =>
      p.title.toLowerCase().includes(customSearch.toLowerCase()) ||
      p.address.toLowerCase().includes(customSearch.toLowerCase())
  );

  const handleSend = () => {
    if (mode === 'live') {
      const durationMs =
        liveDuration === '15m'
          ? 15 * 60 * 1000
          : liveDuration === '1h'
          ? 60 * 60 * 1000
          : 8 * 60 * 60 * 1000;

      onSendLocation({
        latitude: selectedPlace.latitude,
        longitude: selectedPlace.longitude,
        title: t('location.liveLocationTitle', 'Live Location (GPS Broadcast)'),
        address: selectedPlace.address,
        isLive: true,
        liveUntil: Date.now() + durationMs,
        duration: liveDuration,
      });
    } else {
      onSendLocation({
        latitude: selectedPlace.latitude,
        longitude: selectedPlace.longitude,
        title: selectedPlace.title,
        address: selectedPlace.address,
        isLive: false,
      });
    }
    onClose();
  };

  return (
    <NovaModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('location.sendLocation', 'Send Location')}
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Mode Selector */}
        <div className="flex items-center gap-1.5 p-1 bg-[#10111a] rounded-2xl border border-white/5">
          <button
            type="button"
            onClick={() => setMode('place')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
              mode === 'place'
                ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white shadow-md shadow-[var(--nova-accent-color,#ff4e18)]/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <MapPin className="w-4 h-4" />
            <span>{t('location.currentOrPlace', 'Current Location & Places')}</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('live')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
              mode === 'live'
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4 animate-pulse" />
            <span>{t('location.shareLive', 'Share Live Location')}</span>
          </button>
        </div>

        {/* Map Preview Graphic */}
        <div className="relative h-44 rounded-2xl overflow-hidden bg-[#151722] border border-white/10 flex items-center justify-center">
          {/* Stylized Vector Grid Lines */}
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]" />
          <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg">
            <line x1="0" y1="40" x2="100%" y2="40" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 4" />
            <line x1="0" y1="110" x2="100%" y2="110" stroke="#ff4e18" strokeWidth="3" />
            <line x1="30%" y1="0" x2="30%" y2="100%" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 4" />
            <line x1="75%" y1="0" x2="75%" y2="100%" stroke="#ffffff" strokeWidth="1.5" />
          </svg>

          {/* Glowing Beacon Marker in Center */}
          <div className="relative z-10 flex flex-col items-center">
            {mode === 'live' ? (
              <div className="relative flex items-center justify-center">
                <span className="absolute w-12 h-12 rounded-full bg-emerald-500/30 animate-ping" />
                <span className="absolute w-8 h-8 rounded-full bg-emerald-500/50 animate-pulse" />
                <div className="w-6 h-6 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-lg shadow-emerald-500/50">
                  <Radio className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
            ) : (
              <div className="relative flex flex-col items-center animate-bounce">
                <div className="w-8 h-8 rounded-full bg-[var(--nova-accent-color,#ff4e18)] border-2 border-white flex items-center justify-center shadow-lg shadow-[var(--nova-accent-color,#ff4e18)]/60">
                  <MapPin className="w-4 h-4 text-white" />
                </div>
                <div className="w-2 h-2 rounded-full bg-[var(--nova-accent-color,#ff4e18)] mt-0.5" />
              </div>
            )}

            <div className="mt-2 px-3 py-1 rounded-full bg-[#10111a]/95 border border-white/20 backdrop-blur-md shadow-xl text-center">
              <p className="text-xs font-semibold text-white truncate max-w-[200px]">
                {mode === 'live' ? 'Broadcasting live location' : selectedPlace.title}
              </p>
              <p className="text-[10px] text-white/50">{selectedPlace.address}</p>
            </div>
          </div>
        </div>

        {/* Live Duration Selector */}
        {mode === 'live' ? (
          <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
              <Clock className="w-4 h-4" />
              <span>{t('location.shareDuration', 'Share live location for:')}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: '15m', label: '15 minutes' },
                { id: '1h', label: '1 hour' },
                { id: '8h', label: '8 hours' },
              ].map((dur) => (
                <button
                  key={dur.id}
                  type="button"
                  onClick={() => setLiveDuration(dur.id as any)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    liveDuration === dur.id
                      ? 'border-emerald-400 bg-emerald-500 text-white shadow-md'
                      : 'border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {dur.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-emerald-300/70 pt-1">
              {t(
                'location.liveSecurityNote',
                'Participants in this chat will be able to see your real-time GPS coordinates until the timer expires.'
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Search Input */}
            <div className="flex items-center gap-2 bg-[#11121a] px-3 py-2 rounded-xl border border-white/10">
              <Search className="w-4 h-4 text-white/40" />
              <input
                type="text"
                value={customSearch}
                onChange={(e) => setCustomSearch(e.target.value)}
                placeholder={t('location.searchNearby', 'Search nearby places...')}
                className="w-full bg-transparent text-xs text-white placeholder-white/30 focus:outline-none"
              />
            </div>

            {/* Places List */}
            <div className="max-h-40 overflow-y-auto no-scrollbar space-y-1.5">
              {filteredPlaces.map((place, idx) => {
                const isSelected = selectedPlace.title === place.title;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedPlace(place)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border transition text-left cursor-pointer ${
                      isSelected
                        ? 'border-[var(--nova-accent-color,#ff4e18)]/70 bg-[var(--nova-accent-color,#ff4e18)]/15 text-white'
                        : 'border-white/5 bg-white/5 hover:bg-white/10 text-white/80'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-[var(--nova-accent-color,#ff4e18)] text-white'
                            : 'bg-white/10 text-white/60'
                        }`}
                      >
                        <Navigation className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{place.title}</p>
                        <p className="text-[10px] text-white/50 truncate">{place.address}</p>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[var(--nova-accent-color,#ff4e18)] stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Modal Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
          <NovaButton variant="ghost" size="md" type="button" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </NovaButton>
          <NovaButton
            variant="accent"
            size="md"
            type="button"
            onClick={handleSend}
            className={mode === 'live' ? '!bg-emerald-600 hover:!bg-emerald-500' : ''}
          >
            <MapPin className="w-4 h-4 mr-1.5" />
            {mode === 'live'
              ? t('location.sendLiveButton', 'Start Sharing Live')
              : t('location.sendLocationButton', 'Send This Location')}
          </NovaButton>
        </div>
      </div>
    </NovaModal>
  );
};
