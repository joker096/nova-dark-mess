import React from 'react';
import { Phone, Video, Mic, MicOff, VideoOff, X, Settings, MoreHorizontal } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface CallOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  isVideo: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onEndCall: () => void;
  contactName: string;
  duration: string;
  remoteStream?: MediaStream;
  localStream?: MediaStream;
}

export const CallOverlay: React.FC<CallOverlayProps> = ({
  isOpen,
  onClose,
  isVideo,
  isMuted,
  isCameraOn,
  onToggleMute,
  onToggleCamera,
  onEndCall,
  contactName,
  duration,
  remoteStream,
  localStream,
}) => {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Remote video */}
      <div className="flex-1 relative">
        {remoteStream ? (
          <video
            ref={(el) => { if (el) el.srcObject = remoteStream; }}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-900">
            <div className="text-center text-white">
              <h2 className="text-xl font-semibold">{contactName}</h2>
              <p className="text-gray-400 mt-2">{t('chat.connecting')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Local video preview */}
      {localStream && (
        <div className="absolute top-4 right-4 w-32 h-32 md:w-48 md:h-48 rounded-xl overflow-hidden border-2 border-white/20">
          <video
            ref={(el) => { if (el) el.srcObject = localStream; }}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Call duration */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white text-lg font-mono">
        {duration}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 p-4 pb-6 bg-gradient-to-t from-black/80 to-transparent">
        <button
          onClick={onToggleMute}
          className={`p-3 rounded-full transition ${isMuted ? 'bg-red-500' : 'bg-white/20'}`}
          aria-label={isMuted ? t('chat.unmute') : t('chat.mute')}
        >
          {isMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-black" />}
        </button>

        <button
          onClick={onEndCall}
          className="p-3 rounded-full bg-red-500 hover:bg-red-600 transition"
          aria-label={t('chat.endCall')}
        >
          <Phone className="w-6 h-6 text-white" />
        </button>

        {isVideo && (
          <button
            onClick={onToggleCamera}
            className={`p-3 rounded-full transition ${!isCameraOn ? 'bg-red-500' : 'bg-white/20'}`}
            aria-label={isCameraOn ? t('chat.cameraOff') : t('chat.cameraOn')}
          >
            {!isCameraOn ? <VideoOff className="w-6 h-6 text-white" /> : <Video className="w-6 h-6 text-black" />}
          </button>
        )}
      </div>
    </div>
  );
};

export default CallOverlay;