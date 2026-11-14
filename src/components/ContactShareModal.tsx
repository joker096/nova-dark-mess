import React, { useEffect, useState } from 'react';
import { Check, Copy, ShieldCheck } from 'lucide-react';
import { NovaModal } from '../lib/ui/NovaModal';
import { useLanguage } from '../context/LanguageContext';

interface ContactShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactName: string;
  contactId: string;
  onShared?: (contactId: string) => void;
}

export const ContactShareModal: React.FC<ContactShareModalProps> = ({
  isOpen,
  onClose,
  contactId,
  onShared,
}) => {
  const { t } = useLanguage();
  const [consentGiven, setConsentGiven] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConsentGiven(false);
      setCopied(false);
    }
  }, [isOpen]);

  const copyContactId = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(contactId);
      }
    } catch {
      void 0;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleShare = async () => {
    await copyContactId();
    onShared?.(contactId);
    onClose();
  };

  return (
    <NovaModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('contact.shareTitle', 'Share contact')}
      maxWidth="sm"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
          <ShieldCheck className="w-5 h-5 text-[var(--nova-accent-color)] shrink-0" />
          <div>
            <p className="text-xs font-semibold text-white">{t('contact.idOnly', 'ID only')}</p>
            <p className="text-[11px] text-[#868b98]">
              {t('contact.idOnlyDesc', 'Only the contact ID is shared. No phone, email, or other personal data is revealed.')}
            </p>
          </div>
        </div>

        <div className="bg-[#171820]/90 border border-white/5 rounded-xl p-3">
          <p className="text-[11px] font-semibold text-[#6a6f7b] uppercase tracking-wider mb-1">
            {t('contact.contactId', 'Contact ID')}
          </p>
          <div className="flex items-center gap-2">
            <span className="flex-1 truncate text-xs text-white font-mono bg-[#101118] px-2.5 py-1.5 rounded border border-white/10">
              {contactId}
            </span>
            <button
              type="button"
              onClick={() => void copyContactId()}
              className="w-11 h-11 rounded-lg flex items-center justify-center border border-white/10 bg-white/5 text-[10px] font-semibold text-white transition hover:bg-white/10 active:scale-95 cursor-pointer"
              title={t('common.copy')}
              aria-label={t('common.copy')}
            >
              {copied ? (
                <Check className="w-4 h-4 text-[var(--nova-accent-color)]" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <label
          htmlFor="contact-share-consent"
          className="flex items-center gap-3 min-h-[44px] cursor-pointer select-none"
        >
          <input
            id="contact-share-consent"
            type="checkbox"
            checked={consentGiven}
            onChange={(e) => setConsentGiven(e.target.checked)}
            className="w-5 h-5 rounded border border-white/10 bg-[#101118] text-[var(--nova-accent-color)] focus:ring-0 cursor-pointer accent-[var(--nova-accent-color)]"
          />
          <span className="text-[11px] text-white/80">
            {t('contact.consent', 'I agree to share only this contact ID')}
          </span>
        </label>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-white/10 text-xs font-semibold text-white/70 transition hover:bg-white/[0.03] cursor-pointer"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={!consentGiven}
            className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-[var(--nova-accent-color)] text-xs font-semibold text-white disabled:opacity-40 disabled:pointer-events-none transition hover:brightness-110 active:scale-95 cursor-pointer"
          >
            {t('contact.share', 'Share ID')}
          </button>
        </div>
      </div>
    </NovaModal>
  );
};

ContactShareModal.displayName = 'ContactShareModal';
