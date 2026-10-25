'use client';
// Чип «Под вас»: в каждом блоке напоминает, что дашборд собирается под конкретный бизнес.
import { useEffect, useId, useRef, useState } from 'react';

export const CUSTOM_DEFAULT = 'Это пример. Метрики, разрезы, источники и вид блока подстроим под ваш процесс — или сделаем другой блок.';

export function Custom({ text = CUSTOM_DEFAULT }: { text?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <span className="ds-custom" ref={box} data-tour="custom">
      <button type="button" className="ds-custom-btn" aria-expanded={open} aria-controls={id} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}>
        <svg viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M2 3.5h8M2 8.5h8" /><circle cx="4.5" cy="3.5" r="1.3" fill="var(--ds-sheet)" /><circle cx="7.5" cy="8.5" r="1.3" fill="var(--ds-sheet)" />
        </svg>
        Под вас
      </button>
      {open && (
        <span className="ds-custom-pop" id={id} role="note">
          <b>Настроим под вас</b>
          {text}
        </span>
      )}
    </span>
  );
}
