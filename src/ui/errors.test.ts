import { describe, expect, it } from 'vitest';
import { errorText, writeError } from './errors';

describe('hibaszöveg', () => {
  it('ismert hibanév helyett magyar ok', () => {
    expect(errorText(Object.assign(new Error('x'), { name: 'QuotaExceededError' }))).toBe('elfogyott a böngésző tárhelye');
    expect(errorText({ name: 'AbortError', inner: { name: 'QuotaExceededError' }, message: 'x' })).toBe('elfogyott a böngésző tárhelye');
    expect(errorText(new Error('Érvénytelen összeg.'))).toBe('Érvénytelen összeg.');
    expect(writeError(undefined)).toBe('Nem sikerült menteni: ismeretlen hiba');
  });
});
