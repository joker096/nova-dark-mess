import React, { useEffect, useRef, useState } from 'react';

export interface KeepAliveProps {
  /** Whether this screen is the one currently on show. */
  active: boolean;
  children: React.ReactNode;
  /** Extra classes for the screen wrapper (usually sizing/layout classes). */
  className?: string;
}

/**
 * Keeps a screen mounted after its first visit and only toggles visibility.
 *
 * Re-mounting a screen is what made tab and chat switches feel slow: ChatScreen
 * and ChannelScreen are thousands of lines with dozens of effects, so every
 * return to them cost a long task plus a full layout pass. A kept-alive screen
 * renders once; afterwards a switch is a style change.
 *
 * A hidden screen is `inert` and `aria-hidden`, so it can neither take focus
 * nor be announced while another screen is showing.
 *
 * While hidden the screen is also *frozen*: its last rendered element is kept
 * and handed back to React unchanged, so an unrelated App state update does
 * not re-render a screen the user cannot see. On reactivation the fresh element
 * is used, which catches the screen up in a single render.
 *
 * Hidden screens are stacked (absolute, inset-0) and merely made invisible
 * rather than `display:none`: their layout stays warm, so showing one again is
 * a paint, not a full relayout of a thousand-node subtree.
 */
export function KeepAlive({ active, children, className }: KeepAliveProps) {
  const frozenRef = useRef<React.ReactNode>(children);
  if (active) frozenRef.current = children;
  const content = active ? children : frozenRef.current;

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        visibility: active ? 'visible' : 'hidden',
        pointerEvents: active ? undefined : 'none',
      }}
      aria-hidden={active ? undefined : true}
      inert={active ? undefined : true}
      data-keepalive={active ? 'active' : 'hidden'}
    >
      {content}
    </div>
  );
}

/**
 * Remembers every screen that has been visited, in visit order, and always
 * includes the currently active one so its first frame renders immediately
 * instead of waiting for an effect to update the list.
 */
export function useSeenScreens<T extends string>(active: T, initial: T[] = []): T[] {
  const [seen, setSeen] = useState<T[]>(() =>
    initial.includes(active) ? initial : [...initial, active],
  );

  const effective = seen.includes(active) ? seen : [...seen, active];

  useEffect(() => {
    if (seen.includes(active)) return;
    setSeen((previous) =>
      previous.includes(active) ? previous : [...previous, active],
    );
  }, [active, seen]);

  return effective;
}
