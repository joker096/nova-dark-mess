import { forwardRef, type HTMLAttributes, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus } from 'lucide-react';
import { useFocusTrap } from './useFocusTrap';

interface NovaBottomSheetProps extends HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  showHandle?: boolean;
  showCloseButton?: boolean;
  closeLabel?: string;
  children: React.ReactNode;
  maxHeight?: string;
  snapPoints?: string[];
  defaultSnap?: number;
}

export const NovaBottomSheet = forwardRef<HTMLDivElement, NovaBottomSheetProps>(
  (
    {
      isOpen,
      onClose,
      title,
      subtitle,
      showHandle = true,
      showCloseButton = false,
      closeLabel = 'Close',
      children,
      maxHeight = '85vh',
      className,
      style,
      ...props
    },
    ref
  ) => {
    const sheetRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen, onClose);
    const [dragPosition, setDragPosition] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const startYRef = useRef(0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    useEffect(() => {
      if (isOpen) {
        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';
      }
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }, [isOpen]);

    const handleTouchStart = (e: React.TouchEvent) => {
      startYRef.current = e.touches[0].clientY;
      setIsDragging(true);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      if (!isDragging) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta > 0) {
        setDragPosition(delta);
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      if (dragPosition > 100) {
        onClose();
      }
      setDragPosition(0);
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      startYRef.current = e.clientY;
      setIsDragging(true);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const delta = e.clientY - startYRef.current;
      if (delta > 0) {
        setDragPosition(delta);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (dragPosition > 100) {
        onClose();
      }
      setDragPosition(0);
    };

    if (!isOpen) return null;

    const sheetContent = (
      <div
        ref={sheetRef}
        className="fixed inset-0 z-50 flex items-end"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'sheet-title' : undefined}
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          aria-hidden="true"
        />

        <div
          ref={(el) => {
            contentRef.current = el;
            focusTrapRef.current = el;
          }}
          className={`relative w-full bg-[var(--bg-screen)] border-t border-[var(--border-divider)] rounded-t-[var(--radius-sheet)] shadow-xl max-h-[${maxHeight}] overflow-hidden flex flex-col ${className ?? ''}`}
          style={{
            ...(style as React.CSSProperties),
            transform: `translateY(${dragPosition}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.22, 0.8, 0.24, 1)',
          } as React.CSSProperties}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          {...props}
        >
          {showHandle && (
            <div className="flex items-center justify-center pt-3 pb-2">
              <div
                className="w-10 h-1.5 rounded-full bg-[var(--text-secondary)] transition-transform"
                style={{
                  transform: isDragging ? 'scaleX(1.5)' : 'scaleX(1)',
                } as React.CSSProperties}
                aria-hidden="true"
              />
            </div>
          )}

          {(title || showCloseButton) && (
            <div className="flex items-center justify-between px-4 pb-3 border-b border-[var(--border-divider)]">
              <div className="flex-1">
                {title && (
                  <h2
                    id="sheet-title"
                    className="text-[17px] font-semibold text-[var(--text-primary)]"
                  >
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p className="text-[14px] text-[var(--text-secondary)] mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>
              {showCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-field)] transition-colors"
                  aria-label={closeLabel}
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    );

    return createPortal(sheetContent, document.body);
  }
);

NovaBottomSheet.displayName = 'NovaBottomSheet';

export type { NovaBottomSheetProps };