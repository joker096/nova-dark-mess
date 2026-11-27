import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  IconX as X,
  IconPhoto as Photo,
  IconFileText as FileText,
  IconCheck as Check,
  IconUpload as Upload,
  IconPaperclip as Paperclip,
  IconSend as Send,
  IconPhoto as ImageIcon,
} from '@tabler/icons-react';
import { ModalOverlay } from './ModalOverlay';
import { DocumentAttachment } from '../types/messenger';
import { LazyMedia } from './LazyMedia';
import { useLanguage } from '../context/LanguageContext';
import { mediaCache } from '../lib/media/mediaCache';
import { createThumbnail } from '../lib/media/imageThumbnail';
import { compressVideo } from '../lib/media/videoCompress';

interface FileSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendAttachment: (payload: {
    text?: string;
    images?: string[];
    document?: DocumentAttachment;
  }) => void;
  onStageAttachment: (payload: {
    images?: string[];
    document?: DocumentAttachment;
  }) => void;
}

interface SimulatedImage {
  id: string;
  title: string;
  url: string;
  size: string;
  dimensions: string;
}

interface SimulatedDoc {
  id: string;
  name: string;
  size: string;
  type: 'pdf' | 'doc' | 'sheet' | 'zip' | 'other';
  date: string;
}

const SIMULATED_IMAGES: SimulatedImage[] = [
  {
    id: 'img1',
    title: 'Harry\'s Bar Patio',
    url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=80',
    size: '2.1 MB',
    dimensions: '1920 × 1080',
  },
  {
    id: 'img2',
    title: 'Summer Reunion Memories',
    url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=800&q=80',
    size: '1.8 MB',
    dimensions: '1440 × 960',
  },
  {
    id: 'img3',
    title: 'Sunset Beach Gathering',
    url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
    size: '3.4 MB',
    dimensions: '2048 × 1365',
  },
  {
    id: 'img4',
    title: 'Kyiv Downtown Evening',
    url: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=800&q=80',
    size: '2.7 MB',
    dimensions: '1920 × 1280',
  },
  {
    id: 'img5',
    title: 'Coffee & Desserts',
    url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80',
    size: '1.5 MB',
    dimensions: '1280 × 850',
  },
  {
    id: 'img6',
    title: 'Nightclub & Cocktails',
    url: 'https://images.unsplash.com/photo-1543007630-9710e4a00a20?auto=format&fit=crop&w=800&q=80',
    size: '2.9 MB',
    dimensions: '1920 × 1200',
  },
];

const SIMULATED_DOCS: SimulatedDoc[] = [
  {
    id: 'doc1',
    name: 'Harrys_Bar_Reservation_Sunday.pdf',
    size: '1.2 MB',
    type: 'pdf',
    date: 'Today, 14:20',
  },
  {
    id: 'doc2',
    name: 'Summer_Trip_Schedule.pdf',
    size: '2.4 MB',
    type: 'pdf',
    date: 'Yesterday, 19:45',
  },
  {
    id: 'doc3',
    name: 'Kyiv_Sightseeing_Guide.docx',
    size: '860 KB',
    type: 'doc',
    date: 'Oct 28',
  },
  {
    id: 'doc4',
    name: 'Friends_Reunion_Budget.xlsx',
    size: '420 KB',
    type: 'sheet',
    date: 'Oct 24',
  },
  {
    id: 'doc5',
    name: 'Party_Playlist_Archive.zip',
    size: '18.5 MB',
    type: 'zip',
    date: 'Oct 20',
  },
];

export const FileSelectionModal: React.FC<FileSelectionModalProps> = ({
  isOpen,
  onClose,
  onSendAttachment,
  onStageAttachment,
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'images' | 'documents'>('images');
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>(['img1']);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Generated thumbnails keyed by image URL, cached in mediaCache for reuse.
  const thumbnailsRef = useRef<Map<string, string>>(new Map());

  const toggleImageSelect = (id: string) => {
    setSelectedDocId(null);
    setSelectedImageIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleSelectDoc = (id: string) => {
    setSelectedImageIds([]);
    setSelectedDocId((curr) => (curr === id ? null : id));
  };

  // Handle uploading real file from client filesystem
  const handleDeviceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Compress video before it enters the chat so large camera recordings
    // actually finish uploading over slow P2P links. Other file types pass
    // through unchanged.
    const fileToUpload = file.type.startsWith('video/') ? await compressVideo(file) : file;

    if (fileToUpload.type.startsWith('image/')) {
      const blobUrl = URL.createObjectURL(fileToUpload);
      const customId = 'custom-' + Date.now();
      SIMULATED_IMAGES.unshift({
        id: customId,
        title: file.name,
        url: blobUrl,
        size: `${(fileToUpload.size / (1024 * 1024)).toFixed(1)} MB`,
        dimensions: 'Uploaded Image',
      });
      setActiveTab('images');
      setSelectedDocId(null);
      setSelectedImageIds([customId]);
    } else {
      const customId = 'custom-doc-' + Date.now();
      const ext = file.name.split('.').pop()?.toLowerCase();
      let docType: 'pdf' | 'doc' | 'sheet' | 'zip' | 'other' = 'other';
      if (ext === 'pdf') docType = 'pdf';
      else if (ext === 'doc' || ext === 'docx') docType = 'doc';
      else if (ext === 'xls' || ext === 'xlsx') docType = 'sheet';
      else if (ext === 'zip' || ext === 'rar') docType = 'zip';

      SIMULATED_DOCS.unshift({
        id: customId,
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        type: docType,
        date: 'Just now',
      });
      setActiveTab('documents');
      setSelectedImageIds([]);
      setSelectedDocId(customId);
    }
  };

  // Generate and cache thumbnails for images so the picker renders small
  // previews instead of full-resolution photos. Cross-origin images are
  // fetched via mediaCache; decode failures fall back to the full url.
  useEffect(() => {
    let cancelled = false;
    const pending: Promise<void>[] = [];
    for (const img of SIMULATED_IMAGES) {
      if (cancelled) break;
      const cached = mediaCache.get(img.url);
      if (cached) {
        thumbnailsRef.current.set(
          img.url,
          URL.createObjectURL(new Blob([cached.data as unknown as ArrayBuffer], { type: cached.mime }))
        );
        continue;
      }
      if (thumbnailsRef.current.has(img.url)) continue;
      pending.push(
        (async () => {
          try {
            const dataUrl = await createThumbnail(img.url, {
              maxWidth: 160,
              maxHeight: 120,
              quality: 0.5,
            });
            if (!cancelled) thumbnailsRef.current.set(img.url, dataUrl);
          } catch {
            /* decode/fetch failed: fall back to full url */
          }
        })()
      );
    }
    void Promise.all(pending);
    return () => {
      cancelled = true;
    };
  }, []);

  const getThumbnailUrl = useCallback((url: string) => {
    const thumb = thumbnailsRef.current.get(url);
    if (thumb) return thumb;
    return url;
  }, []);

  const hasSelected = selectedImageIds.length > 0 || selectedDocId !== null;

  const handleStage = () => {
    if (!hasSelected) return;

    if (selectedImageIds.length > 0) {
      const chosenImages = SIMULATED_IMAGES.filter((img) =>
        selectedImageIds.includes(img.id)
      ).map((img) => img.url);

      onStageAttachment({
        images: chosenImages,
      });
    } else if (selectedDocId) {
      const chosenDoc = SIMULATED_DOCS.find((d) => d.id === selectedDocId);
      if (chosenDoc) {
        onStageAttachment({
          document: {
            name: chosenDoc.name,
            size: chosenDoc.size,
            type: chosenDoc.type,
          },
        });
      }
    }
    onClose();
  };

  const handleSend = () => {
    if (!hasSelected) return;

    if (selectedImageIds.length > 0) {
      const chosenImages = SIMULATED_IMAGES.filter((img) =>
        selectedImageIds.includes(img.id)
      ).map((img) => img.url);

      onSendAttachment({
        text: caption.trim() || undefined,
        images: chosenImages,
      });
    } else if (selectedDocId) {
      const chosenDoc = SIMULATED_DOCS.find((d) => d.id === selectedDocId);
      if (chosenDoc) {
        onSendAttachment({
          text: caption.trim() || undefined,
          document: {
            name: chosenDoc.name,
            size: chosenDoc.size,
            type: chosenDoc.type,
          },
        });
      }
    }
    setCaption('');
    onClose();
  };

  const getDocTypeBadge = (type: string) => {
    switch (type) {
      case 'pdf':
        return <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">PDF</span>;
      case 'doc':
        return <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">DOC</span>;
      case 'sheet':
        return <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">XLS</span>;
      case 'zip':
        return <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">ZIP</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-zinc-500/20 text-zinc-300 border border-zinc-500/30">FILE</span>;
    }
  };

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose} showCloseButton={false}>
      <div className="bg-[#141520] border border-white/10 rounded-[28px] max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#171824]/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[var(--nova-accent-color)]/20 border border-[var(--nova-accent-color)]/40 flex items-center justify-center text-[var(--nova-accent-color)]">
              <Paperclip className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-tight">{t('fileSelection.attachTitle')}</h3>
              <p className="text-[11px] text-[#8e93a0]">{t('fileSelection.attachSubtitle')}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white flex items-center justify-center transition cursor-pointer"
            title={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Tabs & Device Upload */}
        <div className="p-3 bg-[#11121a] border-b border-white/5 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-[#181926] p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setActiveTab('images')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'images'
                  ? 'bg-[var(--nova-accent-color)] text-white shadow-md shadow-[var(--nova-accent-color)]/25'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>{t('fileSelection.photosTab', { count: SIMULATED_IMAGES.length })}</span>
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'documents'
                  ? 'bg-[var(--nova-accent-color)] text-white shadow-md shadow-[var(--nova-accent-color)]/25'
                  : 'text-white/60 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{t('fileSelection.documentsTab', { count: SIMULATED_DOCS.length })}</span>
            </button>
          </div>

          {/* Hidden input for genuine file uploads */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
            onChange={handleDeviceFileUpload}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[var(--nova-accent-color)]/20 border border-white/10 hover:border-[var(--nova-accent-color)]/40 text-xs font-medium text-white/80 hover:text-white transition cursor-pointer active:scale-95 shrink-0"
            title={t('fileSelection.browseDevice')}
          >
            <Upload className="w-3.5 h-3.5 text-[var(--nova-accent-color)]" />
            <span className="hidden sm:inline">{t('fileSelection.browseDevice')}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeTab === 'images' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {SIMULATED_IMAGES.map((img) => {
                const isSelected = selectedImageIds.includes(img.id);
                return (
                  <div
                    key={img.id}
                    onClick={() => toggleImageSelect(img.id)}
                    className={`group relative rounded-2xl overflow-hidden aspect-[4/3] border cursor-pointer transition duration-150 select-none ${
                      isSelected
                        ? 'border-[var(--nova-accent-color)] ring-2 ring-[var(--nova-accent-color)] shadow-lg shadow-[var(--nova-accent-color)]/30 scale-[0.98]'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                  >
                    <LazyMedia
                      src={getThumbnailUrl(img.url)}
                      alt={img.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-2.5 flex flex-col justify-between">
                      <div className="flex items-center justify-end">
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-[var(--nova-accent-color)] border-[var(--nova-accent-color)] text-white scale-110 shadow-sm'
                              : 'bg-black/40 border-white/40 text-transparent'
                          }`}
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold text-white truncate leading-tight">
                          {img.title}
                        </p>
                        <p className="text-[9.5px] text-white/70 font-mono mt-0.5">
                          {img.size} • {img.dimensions}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {SIMULATED_DOCS.map((doc) => {
                const isSelected = selectedDocId === doc.id;
                return (
                  <div
                    key={doc.id}
                    onClick={() => handleSelectDoc(doc.id)}
                    className={`flex items-center justify-between p-3 rounded-2xl border transition cursor-pointer select-none ${
                      isSelected
                        ? 'bg-[#221820] border-[var(--nova-accent-color)] ring-1 ring-[var(--nova-accent-color)]/60 shadow-md shadow-[var(--nova-accent-color)]/15'
                        : 'bg-[#181926]/90 hover:bg-[#1f2132] border-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-[var(--nova-accent-color)]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-white truncate">
                            {doc.name}
                          </p>
                          {getDocTypeBadge(doc.type)}
                        </div>
                        <p className="text-[10.5px] text-[#868b98] mt-0.5">
                          {doc.size} • Modified {doc.date}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                        isSelected
                          ? 'bg-[var(--nova-accent-color)] border-[var(--nova-accent-color)] text-white scale-105'
                          : 'border-white/30 text-transparent'
                      }`}
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer with Caption & Action Buttons */}
        <div className="p-3.5 bg-[#171824] border-t border-white/10 flex flex-col gap-2.5 shrink-0">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            placeholder={t('a11y.addCaption')}
            className="w-full bg-[#11121a] border border-white/10 focus:border-[var(--nova-accent-color)] rounded-xl px-3.5 py-2 text-xs text-white placeholder-white/35 focus:outline-none transition shadow-inner"
          />

          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-[#8e93a0] truncate">
              {selectedImageIds.length > 0 ? (
                <span className="text-[var(--nova-accent-color)] font-semibold">
                  {t('fileSelection.selectedPhotos', { count: selectedImageIds.length })}
                </span>
              ) : selectedDocId ? (
                <span className="text-[var(--nova-accent-color)] font-semibold">{t('fileSelection.selectedDocument')}</span>
              ) : (
                <span>{t('fileSelection.noFilesSelected')}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleStage}
                disabled={!hasSelected}
                className="px-3.5 py-1.5 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                {t('fileSelection.attach')}
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!hasSelected}
                className="px-4 py-1.5 rounded-xl bg-[var(--nova-accent-color)] hover:bg-[var(--nova-accent-color, ff5d2b)] text-white text-xs font-semibold transition flex items-center gap-1.5 shadow-md shadow-[var(--nova-accent-color)]/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
              >
                <span>{t('fileSelection.send')}</span>
                <Send className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
};












