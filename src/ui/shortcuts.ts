interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
}

interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Az N billentyű a gyorsrögzítőt nyitja. Gépelés közben (mezőben, szerkeszthető elemen) és módosítóbillentyűvel
 * nem, hogy a böngésző parancsai (pl. Cmd+N) és a beírt szöveg ne változzon.
 */
export function isQuickEntryKey(e: KeyLike, target: TargetLike | null): boolean {
  if (e.key !== 'n' && e.key !== 'N') return false;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.isComposing || e.defaultPrevented) return false;
  if (!target) return true;
  return !target.isContentEditable && !TYPING_TAGS.has((target.tagName ?? '').toUpperCase());
}
