import { describe, expect, it } from 'vitest';
import { isQuickEntryKey } from './shortcuts';

const key = (k: string, extra: Partial<Parameters<typeof isQuickEntryKey>[0]> = {}) => ({
  key: k, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...extra,
});

describe('N billentyű', () => {
  it('a gyorsrögzítőt nyitja, ha nem gépelünk', () => {
    expect(isQuickEntryKey(key('n'), null)).toBe(true);
    expect(isQuickEntryKey(key('N'), { tagName: 'BODY' })).toBe(true);
    expect(isQuickEntryKey(key('n'), { tagName: 'BUTTON' })).toBe(true);
  });

  it('más billentyű, módosító, ismétlés és szövegösszeállítás esetén nem', () => {
    expect(isQuickEntryKey(key('m'), null)).toBe(false);
    expect(isQuickEntryKey(key('n', { metaKey: true }), null)).toBe(false);
    expect(isQuickEntryKey(key('n', { ctrlKey: true }), null)).toBe(false);
    expect(isQuickEntryKey(key('n', { altKey: true }), null)).toBe(false);
    expect(isQuickEntryKey(key('n', { repeat: true }), null)).toBe(false);
    expect(isQuickEntryKey(key('n', { isComposing: true }), null)).toBe(false);
    expect(isQuickEntryKey(key('n', { defaultPrevented: true }), null)).toBe(false);
  });

  it('mezőben és szerkeszthető elemen gépelésnek számít', () => {
    expect(isQuickEntryKey(key('n'), { tagName: 'INPUT' })).toBe(false);
    expect(isQuickEntryKey(key('n'), { tagName: 'textarea' })).toBe(false);
    expect(isQuickEntryKey(key('n'), { tagName: 'SELECT' })).toBe(false);
    expect(isQuickEntryKey(key('n'), { tagName: 'DIV', isContentEditable: true })).toBe(false);
  });
});
