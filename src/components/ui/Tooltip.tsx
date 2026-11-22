import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const MARGIN = 6;

/**
 * Hover tooltip rendered in a portal with fixed positioning, so it is never clipped by
 * scrolling/overflow-hidden cards. Positions below the anchor (above if no room) and
 * clamps horizontally inside the window.
 */
export function Tooltip({ content, children, className = '' }: { content: ReactNode; children: ReactNode; className?: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });

  useLayoutEffect(() => {
    if (!open || !anchor.current || !tip.current) return;
    const a = anchor.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const left = Math.min(window.innerWidth - t.width - MARGIN, Math.max(MARGIN, a.left + a.width / 2 - t.width / 2));
    const below = a.bottom + MARGIN;
    const top = below + t.height > window.innerHeight - MARGIN ? a.top - t.height - MARGIN : below;
    setPos({ left, top });
  }, [open]);

  return (
    <span
      ref={anchor}
      className={`inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        setOpen(false);
        setPos({ left: -9999, top: -9999 });
      }}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tip}
            role="tooltip"
            className="pointer-events-none fixed z-50 max-w-[240px] rounded-md border border-white/10 bg-slate-950/95 px-2 py-1.5 text-[11px] leading-snug text-slate-100 shadow-xl"
            style={pos}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
