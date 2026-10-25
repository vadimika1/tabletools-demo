// Знак «Стол»: две строчные t с общей золотой перекладиной — столешница на двух ножках.
export function Mark({ size = 28, ink = 'currentColor', title }: { size?: number; ink?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d="M30 16 V68 Q30 84 46 84" stroke={ink} strokeWidth="13" />
      <path d="M66 16 V68 Q66 84 82 84" stroke={ink} strokeWidth="13" />
      <path className="mark-bar" d="M14 38 H86" stroke="var(--gold)" strokeWidth="13" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo">
      <Mark size={size} />
      <span className="logo-word">
        table<span className="gold">tools</span>
      </span>
    </span>
  );
}
