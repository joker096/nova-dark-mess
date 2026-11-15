import React from 'react';
import { X, ExternalLink, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { getLegalDocument, type LegalDocId } from '../lib/legal';

interface LegalModalProps {
  docId: LegalDocId;
  onClose: () => void;
}

/**
 * Offline copy of the hosted legal page. Works with no network so the links in
 * Settings never fall through to a "coming soon" message.
 */
export const LegalModal: React.FC<LegalModalProps> = ({ docId, onClose }) => {
  const { t } = useLanguage();
  const doc = getLegalDocument(docId);

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-200"
      onClick={onClose}
      data-testid={`legal-modal-${docId}`}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="bg-[#151621] border border-white/10 rounded-3xl w-full max-w-lg text-white shadow-2xl flex flex-col max-h-[88vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label={doc.title}
      >
        <div className="flex items-center justify-between border-b border-white/5 p-4 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[var(--nova-accent-color)]/20 flex items-center justify-center text-[var(--nova-accent-color)] shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-white leading-tight truncate">{doc.title}</h3>
              <p className="text-[10px] text-[#828795]">
                {t('legal.lastUpdated')}: {doc.updated}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 flex items-center justify-center text-white/70 hover:text-white transition cursor-pointer shrink-0"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto no-scrollbar text-[12px] leading-relaxed text-white/80">
          <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-white/85">
            {doc.summary}
          </p>
          {doc.sections.map((section) => (
            <section key={section.heading} className="space-y-1.5">
              <h4 className="text-[12.5px] font-semibold text-white">{section.heading}</h4>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets && (
                <ul className="list-disc pl-5 space-y-1">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="border-t border-white/5 p-3 flex items-center justify-between gap-2 shrink-0">
          <a
            href={doc.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--nova-accent-color)] hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t('legal.openOnline')}
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/80 transition cursor-pointer"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalModal;
