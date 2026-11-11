import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { X } from 'lucide-react';
import { ModalOverlay } from '../../components/ModalOverlay';
interface NovaModalProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onClose'> {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  maxWidth?: 'sm' | 'md' | 'lg' | 'full';
}

const MAX_WIDTH_CONFIG: Record<string, string> = {
  sm: 'max-w-[500px]',
  md: 'max-w-[700px]',
  lg: 'max-w-[900px]',
  full: 'max-w-[95vw]',
};

const MODAL_CONTENT =
  'bg-[#14151c]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/80 flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200';

const MODAL_HEADER =
  'flex items-center justify-between px-6 py-4 border-b border-white/10';

const MODAL_TITLE =
  'text-lg font-semibold text-white';

const MODAL_CLOSE =
  'w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition focus:outline-none focus:ring-2 focus:ring-[var(--nova-accent-color)]';

const MODAL_BODY = 'flex-1 overflow-y-auto p-6';

export const NovaModal = forwardRef<HTMLDivElement, NovaModalProps>(
  ({
    isOpen,
    onClose,
    title,
    showCloseButton = true,
    closeOnOverlayClick = true,
    closeOnEscape = true,
    maxWidth = 'md',
    className,
    children,
  }, ref) => {
    return (
      <ModalOverlay
        isOpen={isOpen}
        onClose={onClose}
        showCloseButton={false}
        closeOnOverlayClick={closeOnOverlayClick}
        closeOnEscape={closeOnEscape}
        className={className}
      >
        <div
          ref={ref}
          className={`${MODAL_CONTENT} ${MAX_WIDTH_CONFIG[maxWidth]} flex flex-col`}
        >
          {(title || showCloseButton) && (
            <div className={MODAL_HEADER}>
              {title ? (
                <h2 className={MODAL_TITLE}>{title}</h2>
              ) : (
                <span aria-hidden="true" />
              )}
              {showCloseButton && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                  }}
                  className={MODAL_CLOSE}
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          <div className={MODAL_BODY}>{children}</div>
        </div>
      </ModalOverlay>
    );
  },
);

NovaModal.displayName = 'NovaModal';

export type { NovaModalProps };
