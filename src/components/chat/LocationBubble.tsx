import React from 'react';
import {IconExternalLink as ExternalLink, IconMapPin as MapPin, IconNavigation as Navigation, IconRadio as Radio} from '@tabler/icons-react';
import { LocationData } from '../../types/messenger';
import { useLanguage } from '../../context/LanguageContext';

interface LocationBubbleProps {
  location: LocationData;

}

export const LocationBubble: React.FC<LocationBubbleProps> = ({ location }) => {
  const { t } = useLanguage();

  const mapUrl = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;

  const isLiveActive = location.isLive && (!location.liveUntil || location.liveUntil > Date.now());

  return (
    <div className="w-full min-w-0 max-w-sm select-none">
      {/* Map Snapshot Visual Canvas */}
      {/* A map is a dark surface in both themes: opt out of the light-theme
          colour remap so the vector streets and the marker stay readable. */}
      <div
        data-theme-preserve="dark"
        className="relative h-32 rounded-xl overflow-hidden bg-[#13141f] border border-white/10 mb-2 group"
      >
        {/* Vector Grid & Map Lines */}
        <div className="absolute inset-0 opacity-25 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:12px_12px]" />
        <svg className="absolute inset-0 w-full h-full opacity-35" xmlns="http://www.w3.org/2000/svg">
          <path d="M-10,30 Q60,50 140,20 T300,40" fill="none" stroke="#38bdf8" strokeWidth="3" />
          <path d="M40,-10 Q80,60 90,140" fill="none" stroke="#ff4e18" strokeWidth="2.5" />
          <path d="M120,-10 L160,140" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="3 3" />
          <circle cx="50%" cy="50%" r="28" fill="none" stroke="#06b6d4" strokeWidth="1" strokeDasharray="2 2" opacity="0.4" />
        </svg>

        {/* Live Badge Overlay */}
        {location.isLive && (
          <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 text-[10px] font-bold shadow-lg backdrop-blur-md">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>
              {isLiveActive
                ? t('location.liveActive', 'LIVE GPS')
                : t('location.liveEnded', 'LIVE ENDED')}
            </span>
          </div>
        )}

        {/* Center Marker */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {location.isLive ? (
            <div className="relative flex items-center justify-center">
              <span className="absolute w-10 h-10 rounded-full bg-emerald-500/30 animate-ping" />
              <div className="w-7 h-7 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-lg shadow-emerald-500/60">
                <Navigation className="w-3.5 h-3.5 text-white transform -rotate-45" />
              </div>
            </div>
          ) : (
            <div className="relative flex flex-col items-center">
              <div className="w-7 h-7 rounded-full bg-[var(--nova-accent-color,#ff4e18)] border-2 border-white flex items-center justify-center shadow-lg shadow-[var(--nova-accent-color,#ff4e18)]/60">
                <MapPin className="w-3.5 h-3.5 text-white" />
              </div>
            </div>
          )}
        </div>

        {/* Hover overlay button to open in maps */}
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white font-semibold text-xs backdrop-blur-xs"
        >
          <ExternalLink className="w-4 h-4 text-white" />
          <span>{t('location.openInMaps', 'Open in Maps')}</span>
        </a>
      </div>

      {/* Place Description & Action */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white truncate">{location.title}</p>
          {location.address && (
            <p className="text-[10.5px] text-white/70 truncate mt-0.5">{location.address}</p>
          )}
          {location.duration && (
            <p className="text-[9.5px] text-emerald-400 font-medium mt-0.5">
              {t('location.broadcastDuration', { duration: location.duration, defaultValue: `Sharing for ${location.duration}` })}
            </p>
          )}
        </div>

        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded-lg border border-[color:var(--nova-border-color,rgba(255,255,255,0.15))] bg-[color:var(--nova-surface-raised,rgba(255,255,255,0.1))] text-[color:var(--nova-text-primary,#ffffff)] hover:brightness-110 transition shrink-0 cursor-pointer"
          title={t('location.openInMaps', 'Open in Maps')}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};










