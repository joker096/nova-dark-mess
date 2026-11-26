import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import {IconX as X} from '@tabler/icons-react';
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
  'bg-[var(--bg-surface)]/[0.95] backdrop-blur-xl border border-[var(--border)] rounded-2xl shadow-[var(--shadow-2)] flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200';

const MODAL_HEADER =
  'flex items-center justify-between px-6 py-4 border-b border-[var(--border-strong)]';

const MODAL_TITLE =
  'text-lg font-semibold text-[var(--text-primary)]';

const MODAL_CLOSE =
  'w-8 h-8 rounded-full bg-[var(--bg-surface-2)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition focus:outline-none focus:ring-2 focus:ring-[var(--nova-accent-color)]';

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
        ariaLabel={title}
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










