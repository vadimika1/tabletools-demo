'use client';
// Детализация: блок сообщает, что открыть (точку, сотрудника, канал, услугу, кампанию),
// панель справа показывает подробности. Состояние в адресе (?d=loc:ham), чтобы им можно было поделиться.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type DrillKind = 'loc' | 'staff' | 'channel' | 'service' | 'campaign' | 'metric';
export interface DrillTarget { kind: DrillKind; key: string }

const KINDS: readonly DrillKind[] = ['loc', 'staff', 'channel', 'service', 'campaign', 'metric'];
const PARAM = 'd';

export function parseDrill(raw: string | null): DrillTarget | null {
  if (!raw) return null;
  const [kind, ...rest] = raw.split(':');
  const key = rest.join(':');
  if (!KINDS.includes(kind as DrillKind) || !key || key.length > 64 || !/^[\p{L}\p{N}_.\- ]+$/u.test(key)) return null;
  return { kind: kind as DrillKind, key };
}

interface DrillCtx { target: DrillTarget | null; open: (t: DrillTarget) => void; close: () => void }
const Ctx = createContext<DrillCtx>({ target: null, open: () => {}, close: () => {} });
export const useDrill = () => useContext(Ctx);

function writeUrl(t: DrillTarget | null) {
  const u = new URL(location.href);
  if (t) u.searchParams.set(PARAM, `${t.kind}:${t.key}`);
  else u.searchParams.delete(PARAM);
  history.replaceState(history.state, '', `${u.pathname}${u.search.replace(/%3A/gi, ':').replace(/%2C/gi, ',')}`);
}

export function DrillProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<DrillTarget | null>(null);
  useEffect(() => {
    const handleSync = () => setTarget(parseDrill(new URLSearchParams(location.search).get(PARAM)));
    handleSync();
    window.addEventListener('popstate', handleSync); // «Назад» в браузере открывает и закрывает панель вместе с адресом
    return () => window.removeEventListener('popstate', handleSync);
  }, []);
  const open = useCallback((t: DrillTarget) => { setTarget(t); writeUrl(t); }, []);
  const close = useCallback(() => { setTarget(null); writeUrl(null); }, []);
  const value = useMemo(() => ({ target, open, close }), [target, open, close]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
