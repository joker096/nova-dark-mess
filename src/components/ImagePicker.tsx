import React, { useRef, useState } from 'react';
import { Check, Image as ImageIcon, Upload } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { MEDIA_PRESETS, type MediaPreset } from '../data/mediaPresets';
import { readImageFile } from '../lib/ui/image';
import { LazyMedia } from './LazyMedia';

interface ImagePickerProps {
  value: string | null;
  onChange: (value: string) => void;
  presets?: MediaPreset[];
  aspect?: 'story' | 'banner' | 'square';
  label?: string;
}

const ASPECT_CLASS: Record<string, string> = {
  story: 'aspect-[9/13] max-h-[220px]',
  banner: 'aspect-[16/9] max-h-[200px]',
  square: 'aspect-square max-h-[180px]',
};

export const ImagePicker: React.FC<ImagePickerProps> = ({
  value,
  onChange,
  presets = MEDIA_PRESETS,
  aspect = 'banner',
  label,
}) => {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const dataUrl = await readImageFile(file);
      onChange(dataUrl);
    } catch {
      setError(t('common.imageUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <label className="px-1 text-[11px] font-semibold text-[#868b98]">{label}</label>
      )}

      <div
        className={`relative w-full overflow-hidden rounded-2xl border border-white/10 bg-[#101118] ${ASPECT_CLASS[aspect]}`}
      >
        {value ? (
          <LazyMedia
            src={value}
            alt=""
            eager
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/30">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
              <ImageIcon className="h-5 w-5" />
            </div>
            <span className="text-[11px] font-medium">{t('common.chooseImage')}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-2.5 py-1.5 text-[10px] font-semibold text-white backdrop-blur-md transition hover:bg-black/80 disabled:opacity-60"
        >
          <Upload className="h-3 w-3" />
          {uploading ? t('common.loading') : t('common.upload')}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {error && <p className="px-1 text-[10px] text-red-400">{error}</p>}

      <div className="grid grid-cols-4 gap-1.5">
        {presets.map((preset) => {
          const selected = value === preset.url;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(preset.url)}
              title={preset.label}
              aria-label={preset.label}
              aria-pressed={selected}
              className={`relative aspect-square overflow-hidden rounded-xl border transition active:scale-95 ${
                selected
                  ? 'border-[var(--nova-accent-color)] ring-2 ring-[var(--nova-accent-color)]/30'
                  : 'border-white/5 opacity-70 hover:opacity-100'
              }`}
            >
              <LazyMedia
                src={preset.url}
                alt=""
                eager
                className="h-full w-full object-cover"
              />
              {selected && (
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--nova-accent-color)] text-white shadow">
                  <Check className="h-2.5 w-2.5" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
