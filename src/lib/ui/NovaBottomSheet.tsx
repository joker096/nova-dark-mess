import { forwardRef, useEffect, useRef } from 'react';
import {IconX as X} from '@tabler/icons-react';
import { ModalOverlay } from '../../components/ModalOverlay';
import { useFocusTrap } from './useFocusTrap';

interface NovaBottomSheetProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClose'> {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  maxHeight?: 'sm' | 'md' | 'lg' | 'full';
  children: React.ReactNode;
}

const MAX_HEIGHT_CONFIG: Record<string, string> = {
  sm: 'max-h-[40vh]',
  md: 'max-h-[60vh]',
  lg: 'max-h-[80vh]',
  full: 'max-h-[95vh]',
};

const SHEET_CONTENT =
  'bg-[var(--nova-surface)] border-t border-[var(--nova-border-subtle)] rounded-t-3xl shadow-[var(--shadow-2)] flex flex-col animate-in slide-in-from-bottom-4 duration-300';

const SHEET_HANDLE = 'w-8 h-1 bg-[var(--nova-border-subtle)] rounded-full mx-auto mt-3 mb-2';

const SHEET_HEADER =
  'flex items-center justify-between px-6 py-4 border-b border-[var(--nova-border-subtle)]';

const SHEET_TITLE = 'text-lg font-semibold text-[var(--nova-text-primary)]';

const SHEET_CLOSE =
  'w-10 h-10 rounded-full bg-[var(--nova-overlay-weak)] flex items-center justify-center text-[var(--nova-text-secondary)] hover:text-[var(--nova-text-primary)] hover:bg-[var(--nova-overlay-medium)] transition focus:outline-none focus:ring-2 focus:ring-[var(--nova-accent-color)]';

const SHEET_BODY = 'flex-1 overflow-y-auto p-6';

export const NovaBottomSheet = forwardRef<HTMLDivElement, NovaBottomSheetProps>(
  (
    {
      isOpen,
      onClose,
      title,
      showCloseButton = true,
      closeOnOverlayClick = true,
      closeOnEscape = true,
      maxHeight = 'md',
      className,
      children,
    },
    ref
  ) => {
    const sheetRef = useRef<HTMLDivElement>(null);
    const focusTrap = useFocusTrap<HTMLDivElement>(isOpen, onClose);

    useEffect(() => {
      if (isOpen) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
      return () => {
        document.body.style.overflow = '';
      };
    }, [isOpen]);

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
          ref={(el) => {
            sheetRef.current = el;
            focusTrap.current = el;
            if (ref) {
              if (typeof ref === 'function') ref(el);
              else ref.current = el;
            }
          }}
          className={`${SHEET_CONTENT} ${MAX_HEIGHT_CONFIG[maxHeight]} ${className || ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby={title ? 'sheet-title' : undefined}
        >
          <div className={SHEET_HANDLE} aria-hidden="true" />
          {(title || showCloseButton) && (
            <div className={SHEET_HEADER}>
              {title ? (
                <h2 id="sheet-title" className={SHEET_TITLE}>
                  {title}
                </h2>
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
                  className={SHEET_CLOSE}
                  aria-label="Close sheet"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
          <div className={SHEET_BODY}>{children}</div>
        </div>
      </ModalOverlay>
    );
  }
);

NovaBottomSheet.displayName = 'NovaBottomSheet';

export type { NovaBottomSheetProps };









