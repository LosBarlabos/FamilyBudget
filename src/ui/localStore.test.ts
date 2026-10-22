import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readLocal, resetLocalCache, subscribeLocal, writeLocal } from './localStore';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

beforeEach(() => {
  resetLocalCache();
  vi.stubGlobal('localStorage', memoryStorage());
});
afterEach(() => vi.unstubAllGlobals());

describe('localStorage-os UI-állapot', () => {
  it('a beállító függvény a tárolt értékből számol, és a tárolót azonnal írja (komponens nélkül is)', () => {
    localStorage.setItem('fee-dismissed', JSON.stringify(['2026-10|aram']));
    writeLocal<string[]>('fee-dismissed', [], (l) => [...l, '2026-10|net']);
    // Egy később lefutó visszavonás (a komponens már lecsatolódott) is a friss listát módosítja.
    writeLocal<string[]>('fee-dismissed', [], (l) => l.filter((k) => k !== '2026-10|aram'));
    expect(JSON.parse(localStorage.getItem('fee-dismissed')!)).toEqual(['2026-10|net']);
    expect(readLocal<string[]>('fee-dismissed', [])).toEqual(['2026-10|net']);
  });

  it('a feliratkozók értesülnek, és stabil értéket olvasnak', () => {
    const f = vi.fn();
    const off = subscribeLocal('recent-open', f);
    expect(readLocal('recent-open', false)).toBe(false);
    const list = readLocal<string[]>('x', []);
    expect(readLocal<string[]>('x', [])).toBe(list);
    writeLocal('recent-open', false, true);
    expect(f).toHaveBeenCalledTimes(1);
    off();
    writeLocal('recent-open', false, false);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('ha a localStorage nem érhető el, memóriában működik', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('tiltva');
      },
      setItem: () => {
        throw new Error('tiltva');
      },
    });
    writeLocal<string[]>('a', [], (l) => [...l, 'x']);
    writeLocal<string[]>('a', [], (l) => [...l, 'y']);
    expect(readLocal<string[]>('a', [])).toEqual(['x', 'y']);
  });
});
