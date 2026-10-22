import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { addEntry, deleteEntry, initialize, wipeAll } from '../db/repo';
import { buildExport, parseImport } from '../domain/exportFormat';
import type { Category, Entry, Settings } from '../domain/types';
import { connect, disconnect, probe, syncNow } from './engine';
import { fromBase64, toBase64 } from './github';

const settings: Settings = {
  id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-10', forecastPeriods: 3, createdAt: '2026-10-01T00:00:00Z',
};
const cats: Category[] = [{ id: 'kaja', name: 'Élelmiszer', icon: 'dots', color: '#000', type: 'keret', defaultAmount: 100_000, order: 0, archived: false }];
const cfg = { repo: 'csalad/adatok', path: 'data.json', token: 't', name: 'Anna' };

/** Egy GitHub-tároló a memóriában: a contents API olvasása és sha-val védett írása. */
function fakeGitHub(opts: { private?: boolean } = {}) {
  const server = {
    file: null as { text: string; sha: string } | null,
    commits: [] as string[],
    /** A következő írás előtt egyszer lefut (pl. a másik eszköz közbeírása). */
    beforePut: null as null | (() => void),
  };
  let n = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    const path = new URL(url).pathname;
    if (path === '/repos/csalad/adatok') return json(200, { private: opts.private ?? true, permissions: { push: true } });
    if (path !== '/repos/csalad/adatok/contents/data.json') return json(404, {});
    if (!init.method) return server.file ? json(200, { sha: server.file.sha, encoding: 'base64', content: toBase64(server.file.text) }) : json(404, {});
    const hook = server.beforePut;
    server.beforePut = null;
    hook?.();
    const body = JSON.parse(String(init.body)) as { sha?: string; content: string; message: string };
    if ((server.file?.sha ?? undefined) !== body.sha) return json(server.file ? 409 : 422, {});
    server.file = { text: fromBase64(body.content), sha: `s${++n}` };
    server.commits.push(body.message);
    return json(200, { content: { sha: server.file.sha } });
  });
  return server;
}

const entry = (id: string, amount: number, by?: string): Entry => ({
  id, periodId: '2026-10', categoryId: 'kaja', amount, date: '2026-10-20', createdAt: '2026-10-20T10:00:00Z', createdBy: by,
});

/** A másik eszköz rögzítése: közvetlenül a közös fájlba. */
function remoteAdd(server: ReturnType<typeof fakeGitHub>, e: Entry) {
  const f = parseImport(server.file!.text);
  const data = { settings: f.settings, categories: f.categories, plans: f.plans, entries: [...f.entries, e], overrides: f.periodOverrides };
  server.file = { text: JSON.stringify(buildExport(data)), sha: `${server.file!.sha}b` };
}

const localIds = async () => (await db.entries.toArray()).map((e) => e.id).sort();
const remoteEntries = (server: ReturnType<typeof fakeGitHub>) => parseImport(server.file!.text).entries;

beforeEach(async () => {
  await disconnect();
  await wipeAll();
  await initialize(settings, cats);
});
afterEach(() => vi.unstubAllGlobals());

describe('GitHub-szinkron', () => {
  it('base64 oda-vissza ékezetekkel', () => {
    expect(fromBase64(toBase64('Élelmiszer – 12 000 Ft ő'))).toBe('Élelmiszer – 12 000 Ft ő');
  });

  it('nyilvános tárolóhoz nem kapcsolódik', async () => {
    fakeGitHub({ private: false });
    await expect(probe(cfg)).rejects.toThrow(/nyilvános/);
  });

  it('feltöltés, majd a két eszköz rögzítései összefésülődnek, a név rákerül', async () => {
    const server = fakeGitHub();
    await connect(cfg, 'upload');
    expect(server.commits).toEqual(['Anna: első feltöltés']);

    const mine = await addEntry('2026-10', 'kaja', 5000, '2026-10-21');
    expect(mine.createdBy).toBe('Anna');
    remoteAdd(server, entry('partner1', 7000, 'Béla'));
    await syncNow({ localChange: true });

    expect(await localIds()).toEqual([mine.id, 'partner1'].sort());
    expect(remoteEntries(server).map((e) => e.id).sort()).toEqual([mine.id, 'partner1'].sort());
    expect(server.commits.at(-1)).toBe('Anna: 1 új rögzítés');
  });

  it('a törlés átjut, a változatlan állapot nem ír újra', async () => {
    const server = fakeGitHub();
    const e = await addEntry('2026-10', 'kaja', 5000, '2026-10-21');
    await connect(cfg, 'upload');
    await deleteEntry(e.id);
    await syncNow({ localChange: true });
    expect(remoteEntries(server)).toEqual([]);
    const commits = server.commits.length;
    await syncNow();
    expect(server.commits.length).toBe(commits);
  });

  it('ha közben a másik eszköz írt, újraolvas és mindkét rögzítés megmarad', async () => {
    const server = fakeGitHub();
    await connect(cfg, 'upload');
    const mine = await addEntry('2026-10', 'kaja', 5000, '2026-10-21');
    server.beforePut = () => remoteAdd(server, entry('partner2', 3000, 'Béla'));
    await syncNow({ localChange: true });
    expect(remoteEntries(server).map((e) => e.id).sort()).toEqual([mine.id, 'partner2'].sort());
    expect(await localIds()).toEqual([mine.id, 'partner2'].sort());
  });

  it('csatlakozás egy új eszközről: a közös költségvetés lejön', async () => {
    const server = fakeGitHub();
    await addEntry('2026-10', 'kaja', 5000, '2026-10-21');
    await connect(cfg, 'upload');
    const shared = server.file!.text;
    await disconnect();
    await wipeAll();
    server.file = { text: shared, sha: 'x1' };
    await connect({ ...cfg, name: 'Béla' }, 'download');
    expect((await db.entries.toArray()).length).toBe(1);
    expect((await db.settings.get('settings'))?.payday).toBe(10);
  });
});
