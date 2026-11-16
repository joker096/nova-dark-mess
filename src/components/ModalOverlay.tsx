import { ReactNode, useEffect, useRef, useCallback, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Maximize, Minimize, Download } from 'lucide-react';
import { useFocusTrap } from '../lib/ui/useFocusTrap';

interface ModalOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  ariaLabel?: string;
}

export const ModalOverlay: React.FC<ModalOverlayProps> = ({
  isOpen,
  onClose,
  children,
  className = '',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  ariaLabel = 'Modal',
}) => {
  const overlayRef = useFocusTrap<HTMLDivElement>(
    isOpen,
    closeOnEscape ? onClose : undefined
  );

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      onClick={closeOnOverlayClick ? onClose : undefined}
      className={`fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center animate-in fade-in duration-200 ${className}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      {showCloseButton && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white text-base hover:bg-white/20 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--nova-accent-color)]"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>
      )}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full h-full max-w-[90vw] max-h-[90vh] flex items-center justify-center p-4"
      >
        {children}
      </div>
    </div>
  );
};

interface ImageLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  onDownload?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  currentIndex?: number;
  totalCount?: number;
  onPrev?: () => void;
  onNext?: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  isOpen,
  onClose,
  src,
  alt,
  onDownload,
  onZoomIn,
  onZoomOut,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
}) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!isOpen) return;
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [isOpen, src]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale((prev) => Math.max(0.5, Math.min(3, prev + delta)));
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale <= 1) return;
      setIsDragging(true);
      dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
      e.preventDefault();
    },
    [scale, position]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.current.x,
        y: e.clientY - dragStart.current.y,
      });
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    setScale((prev) => (prev > 1 ? 1 : 2));
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
      if (e.key === 'ArrowRight' && onNext) onNext();
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        onZoomIn?.();
      }
      if (e.key === '-') {
        e.preventDefault();
        onZoomOut?.();
      }
      if (e.key === '0') {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }
    },
    [onPrev, onNext, onZoomIn, onZoomOut]
  );

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  return (
    <ModalOverlay
      isOpen={isOpen}
      onClose={onClose}
      closeOnOverlayClick={scale <= 1}
      closeOnEscape={scale <= 1}
      showCloseButton={false}
      className="cursor-zoom-out"
    >
      <div
        className="relative w-full h-full flex items-center justify-center"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          className={`max-w-full max-h-[85vh] object-contain transition-transform duration-100 ${isDragging ? 'cursor-grabbing' : 'cursor-zoom-in'}`}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        />

        {/* Toolbar */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-full px-4 py-2 z-10">
          {onPrev && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPrev?.();
              }}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
              aria-label="Previous"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {onDownload && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
              aria-label="Download"
            >
              <Download className="w-5 h-5" />
            </button>
          )}
          {onZoomIn && onZoomOut && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onZoomOut?.();
                }}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                aria-label="Zoom out"
              >
                <Minimize className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onZoomIn?.();
                }}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
                aria-label="Zoom in"
              >
                <Maximize className="w-5 h-5" />
              </button>
            </>
          )}
          {onNext && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNext?.();
              }}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
              aria-label="Next"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Counter */}
        {totalCount && currentIndex !== undefined && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md rounded-full px-4 py-1.5 text-white text-sm font-medium z-10">
            {currentIndex + 1} / {totalCount}
          </div>
        )}

        {/* Keyboard hints */}
        <div className="absolute bottom-4 left-4 right-4 flex justify-center gap-4 text-white/60 text-xs pointer-events-none">
          <span>← → navigate</span>
          <span>Scroll to zoom</span>
          <span>Double-click reset</span>
          <span>Esc close</span>
        </div>
      </div>
    </ModalOverlay>
  );
};

