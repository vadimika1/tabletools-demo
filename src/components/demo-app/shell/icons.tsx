// Иконки разделов демо: тонкая линия 1.8, одна сетка 24×24.
import type { SectionKey } from '@/lib/demo-app/blocks/registry';

export const SECTION_ICON: Record<SectionKey, string> = {
  overview: 'M3 12h4v8H3zM10 4h4v16h-4zM17 9h4v11h-4z',
  ops: 'M4 5h16v14H4zM4 10h16M9 5v14',
  finance: 'M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6',
  marketing: 'M3 11l15-6v14L3 13zM7 13v5a2 2 0 004 0v-3.5',
  clients: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M17 11a3 3 0 100-6M22 21a6 6 0 00-5-6',
  crm: 'M3 5h5v14H3zM10 5h5v9h-5zM17 5h4v6h-4z',
  attribution: 'M4 6h5l3 6h8M4 18h5l3-6M17 9l3 3-3 3',
  insights: 'M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V16h8v-1.3A7 7 0 0012 2z',
};

export function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export const ICON = {
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  help: 'M12 22a10 10 0 100-20 10 10 0 000 20zM9.5 9a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.5M12 17h.01',
  chevron: 'M6 9l6 6 6-6',
  build: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7',
  back: 'M15 18l-6-6 6-6',
};
