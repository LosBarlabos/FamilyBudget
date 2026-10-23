// A közös adatfájl olvasása és írása a GitHub REST API-n (contents) keresztül, a felhasználó saját tokenjével.
// Az írás a fájl utolsó ismert sha-jával történik: ha közben a másik eszköz írt, a GitHub 409-cel elutasítja,
// és a szinkron újraolvas, összefésül, majd újra próbálja.

const API = 'https://api.github.com';

export interface RepoConfig {
  /** „tulajdonos/tároló” */
  repo: string;
  /** A fájl útvonala a tárolóban, pl. data.json */
  path: string;
  token: string;
}

export type SyncErrorKind = 'auth' | 'forbidden' | 'notFound' | 'conflict' | 'network' | 'public' | 'other';

export class SyncError extends Error {
  constructor(public kind: SyncErrorKind, message: string) {
    super(message);
  }
}

export const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/** UTF-8 szöveg base64-ben (a GitHub API így várja a fájl tartalmát). */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function call(cfg: RepoConfig, path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      // A GitHub API válasza egy percig gyorsítótárazható; a szinkronnak mindig a friss állapot kell.
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new SyncError('network', 'Nincs internetkapcsolat, vagy a GitHub nem érhető el.');
  }
  if (res.status === 401) throw new SyncError('auth', 'A GitHub-token érvénytelen vagy lejárt.');
  if (res.status === 403) {
    const limited = res.headers.get('x-ratelimit-remaining') === '0';
    throw new SyncError('forbidden', limited ? 'Túl sok kérés a GitHub felé, próbáld később.' : 'A tokennek nincs jogosultsága ehhez a tárolóhoz.');
  }
  return res;
}

const repoPath = (cfg: RepoConfig) => `/repos/${cfg.repo}`;
const filePath = (cfg: RepoConfig) => `${repoPath(cfg)}/contents/${cfg.path.split('/').map(encodeURIComponent).join('/')}`;

/** A tároló ellenőrzése a bekapcsoláskor: létezik, privát, és a token írni is tudja. */
export async function checkRepo(cfg: RepoConfig): Promise<void> {
  const res = await call(cfg, repoPath(cfg));
  if (res.status === 404) throw new SyncError('notFound', 'A tároló nem található, vagy a token nem fér hozzá.');
  if (!res.ok) throw new SyncError('other', `A GitHub hibát jelzett (${res.status}).`);
  const r = (await res.json()) as { private?: boolean; permissions?: { push?: boolean } };
  if (!r.private) throw new SyncError('public', 'A tároló nyilvános, a költségvetés csak privát tárolóba kerülhet. Állítsd privátra a GitHubon (Settings → Change visibility), és próbáld újra.');
  if (r.permissions && r.permissions.push === false) throw new SyncError('forbidden', 'A token csak olvasni tudja a tárolót, írni nem.');
}

/** A közös fájl tartalma és sha-ja; null, ha még nincs ilyen fájl. */
export async function readFile(cfg: RepoConfig): Promise<{ text: string; sha: string } | null> {
  const res = await call(cfg, filePath(cfg));
  if (res.status === 404) {
    // A hiányzó tároló is 404: azt külön kell jelezni, különben üres költségvetésnek tűnne.
    const repo = await call(cfg, repoPath(cfg));
    if (repo.status === 404) throw new SyncError('notFound', 'A tároló nem található, vagy a token nem fér hozzá.');
    return null;
  }
  if (!res.ok) throw new SyncError('other', `A GitHub hibát jelzett (${res.status}).`);
  const f = (await res.json()) as { sha: string; content?: string; encoding?: string };
  if (f.encoding === 'base64' && f.content) return { text: fromBase64(f.content), sha: f.sha };
  // 1 MB fölött a contents válasz nem tartalmazza a fájlt: a blob API-n jön le.
  const blob = await call(cfg, `${repoPath(cfg)}/git/blobs/${f.sha}`);
  if (!blob.ok) throw new SyncError('other', `A GitHub hibát jelzett (${blob.status}).`);
  const b = (await blob.json()) as { content: string };
  return { text: fromBase64(b.content), sha: f.sha };
}

/** Írás; a sha a felülírt változaté (új fájlnál null). Az új sha-t adja vissza. */
export async function writeFile(cfg: RepoConfig, text: string, sha: string | null, message: string): Promise<string> {
  const res = await call(cfg, filePath(cfg), {
    method: 'PUT',
    body: JSON.stringify({ message, content: toBase64(text), ...(sha ? { sha } : {}) }),
  });
  // 409: a fájl közben megváltozott; 422: új fájlként írnánk, de közben létrejött.
  if (res.status === 409 || res.status === 422) throw new SyncError('conflict', 'A közös fájl közben megváltozott.');
  if (res.status === 404) throw new SyncError('notFound', 'A tároló nem található, vagy a token nem fér hozzá.');
  if (!res.ok) throw new SyncError('other', `A GitHub hibát jelzett (${res.status}).`);
  const r = (await res.json()) as { content: { sha: string } };
  return r.content.sha;
}
