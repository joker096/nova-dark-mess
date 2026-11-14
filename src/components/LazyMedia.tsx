import React, { useState, useRef, useEffect } from 'react';

export interface LazyMediaProps {
  src: string;
  alt?: string;
  className?: string;
  placeholder?: React.ReactNode;
}

/**
 * Lazy-loads media only when it enters the viewport.
 */
export function LazyMedia({ src, alt, className, placeholder }: LazyMediaProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <img
      ref={ref}
      src={visible ? src : undefined}
      alt={alt}
      className={className}
      loading="lazy"
    />
  );
}
