'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// Оверлей: стопка слоёв, Esc закрывает один (верхний), фокус не выходит наружу,
// после закрытия узел удаляется из DOM (а не прячется стилем), фон блокируется от прокрутки.
const stack: symbol[] = [];

export type OverlayKind = 'modal' | 'drawer';

interface Props {
  open: boolean;
  onClose: () => void;
  kind?: OverlayKind;
  labelledBy: string;
  size?: 'md' | 'lg';
  children: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Overlay({ open, onClose, kind = 'modal', labelledBy, size = 'lg', children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useRef(Symbol('overlay'));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const me = id.current;
    const returnTo = document.activeElement as HTMLElement | null;
    stack.push(me);
    document.documentElement.classList.add('overlay-open');

    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(me);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) document.documentElement.classList.remove('overlay-open');
      returnTo?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className={`ov ov-${kind}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className={`ov-panel ov-${size}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
        <button type="button" className="ov-close" onClick={onClose} aria-label="Закрыть">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
