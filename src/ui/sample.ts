import { buildSample } from '../domain/sample';
import { importAll, wipeAll } from '../db/repo';
import type { SampleRequest } from '../db/sampleMode';
import { resetLocalCache, SAMPLE_PREFIX } from './localStore';

/** Csak fejlesztéskor: a minta betöltése a mintaadatbázisba, tiszta UI-beállításokkal (lásd sampleMode). */
export async function loadSample(kind: SampleRequest) {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(SAMPLE_PREFIX)) localStorage.removeItem(k);
  } catch {
    /* nem kritikus */
  }
  resetLocalCache();
  if (kind === 'ures') await wipeAll();
  else await importAll(buildSample(kind));
}
