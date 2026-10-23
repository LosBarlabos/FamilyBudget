import { describe, expect, it } from 'vitest';
import { withAlpha } from './color';

describe('withAlpha', () => {
  it('a hexa színhez átlátszóságot fűz', () => {
    expect(withAlpha('#2346a8', 0.5)).toBe('#2346a880');
    expect(withAlpha('#2346A8', 0.08)).toBe('#2346A814');
  });

  it('a rövid alakot kibontja, az értéket 0 és 1 közé szorítja', () => {
    expect(withAlpha('#abc', 1)).toBe('#aabbccff');
    expect(withAlpha('#000000', -1)).toBe('#00000000');
    expect(withAlpha('#000000', 2)).toBe('#000000ff');
  });

  it('nem hexa színt változatlanul hagy', () => {
    expect(withAlpha('oklch(0.5 0.1 250)', 0.5)).toBe('oklch(0.5 0.1 250)');
    expect(withAlpha(' #112233 ', 0.25)).toBe('#11223340');
  });
});
