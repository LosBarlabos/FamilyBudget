#!/usr/bin/env node
// Képernyőképek a design-felméréshez (DESIGN_TERV.md, 0. és 7. fázis): a mérési mátrix minden cellája a
// mintaadattal, világos és sötét témában. A Chrome-ot a DevTools protokollon vezérli a Node beépített
// WebSocketjével, így nem kell hozzá npm-csomag. Futó fejlesztői szerver kell hozzá (npm run dev).
//
//   node scripts/kepernyokepek.mjs [--url http://localhost:5173/] [--cimke alap] [--csak teljes|szelso|ures]
//
// Kimenet: docs/design/kepek/<címke>/<minta>/<téma>/<szélesség>/<nn-képernyő>.png (a hajtás feletti rész) és
// ...-teljes.png (az egész oldal), valamint egy index.html áttekintő. A mappa nincs a gitben.

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const BASE = (args.url ?? 'http://localhost:5173/').replace(/#.*$/, '');
const LABEL = args.cimke ?? 'alap';
const OUT = join('docs', 'design', 'kepek', LABEL);
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** A mérési mátrix (a 0. fázis leírása: docs/design/00-elokeszites.md). */
const VIEWPORTS = [
  { width: 375, height: 812, touch: true }, // telefon
  { width: 768, height: 1024, touch: true }, // táblagép állva
  { width: 1024, height: 768, touch: false }, // kis laptop, táblagép fekve
  { width: 1440, height: 900, touch: false }, // asztali
];
const THEMES = [
  { name: 'vilagos', scheme: 'light' },
  { name: 'sotet', scheme: 'dark' },
];
const SCREENS = [
  ['01-attekintes', '#/attekintes'],
  ['02-rogzites', '#/rogzites'],
  ['03-tervezo', '#/terv'],
  ['04-elemzes', '#/elemzes'],
  ['05-szamlanaptar', '#/naptar'],
  ['06-kategoriak', '#/kategoriak'],
  ['07-beallitasok', '#/beallitasok'],
];
/** Rétegek: a hash nyitja meg őket, a Továbbiak lapot a mobil alsó sáv gombja. */
const LAYERS = [
  ['10-gyorsrogzito', '#/attekintes?gyors'],
  ['11-varatlan-kiadas', '#/rogzites/varatlan'],
  ['12-uj-cel', '#/kategoriak/uj-cel'],
  ['13-tovabbiak', '#/attekintes', `[...document.querySelectorAll('.tabbar button')].find((b) => b.textContent.includes('Továbbiak'))?.click()`],
];
const PLAN = [
  { sample: 'teljes', viewports: VIEWPORTS, screens: SCREENS, layers: LAYERS },
  { sample: 'szelso', viewports: [VIEWPORTS[0], VIEWPORTS[3]], screens: SCREENS.slice(0, 4), layers: [] },
  { sample: 'ures', viewports: [VIEWPORTS[0], VIEWPORTS[3]], screens: [['00-elso-inditas', '']], layers: [] },
].filter((p) => !args.csak || p.sample === args.csak);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimális DevTools-kliens: kérés–válasz azonosítóval, és egy eseményre várás. */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = fail;
  });
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) fail(new Error(`${msg.error.message} (${msg.error.code})`));
      else ok(msg.result);
    } else if (msg.method) {
      for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].method === msg.method) waiters.splice(i, 1)[0].ok(msg.params);
    }
  };
  return {
    send: (method, params = {}) =>
      new Promise((ok, fail) => {
        pending.set(++id, { ok, fail });
        ws.send(JSON.stringify({ id, method, params }));
      }),
    once: (method, timeout = 15_000) =>
      new Promise((ok, fail) => {
        waiters.push({ method, ok });
        setTimeout(() => fail(new Error(`Nem jött meg: ${method}`)), timeout);
      }),
    close: () => ws.close(),
  };
}

async function launchChrome() {
  const profile = await mkdtemp(join(tmpdir(), 'kepernyokepek-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--lang=hu-HU', 'about:blank',
  ]);
  const port = await new Promise((ok, fail) => {
    let err = '';
    proc.stderr.on('data', (d) => {
      err += d;
      const m = err.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (m) ok(m[1]);
    });
    proc.on('exit', (code) => fail(new Error(`A Chrome kilépett (${code}). Más útvonalon van? CHROME=... \n${err}`)));
  });
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdp = await connect(target.webSocketDebuggerUrl);
  return {
    cdp,
    stop: async () => {
      cdp.close();
      proc.kill();
      await sleep(300);
      await rm(profile, { recursive: true, force: true });
    },
  };
}

async function main() {
  try {
    await fetch(BASE);
  } catch {
    throw new Error(`Nem érhető el: ${BASE}. Előbb indítsd el a fejlesztői szervert (npm run dev).`);
  }
  const { cdp, stop } = await launchChrome();
  const evaluate = async (expression) =>
    (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
  const settle = async () => {
    for (let i = 0; i < 50 && !(await evaluate(`document.querySelector('#root')?.childElementCount > 0`)); i++) await sleep(200);
    await evaluate('document.fonts.ready.then(() => true)');
    // A grafikonok animációja és a késleltetett elrendezés.
    await sleep(1200);
  };
  const load = async (url) => {
    // Előbb egy üres lap: ha csak a hash változna, az a lapon belül maradna, de minden kép tiszta betöltésből
    // készüljön. A mintaadatos mód a fülön (sessionStorage) közben megmarad.
    const blank = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await blank;
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url });
    await loaded;
    await settle();
  };
  const shots = [];
  const capture = async (dir, name) => {
    await mkdir(dir, { recursive: true });
    await evaluate('window.scrollTo(0, 0)');
    await sleep(150);
    const fold = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(dir, `${name}.png`), Buffer.from(fold.data, 'base64'));
    const height = Math.min(12_000, await evaluate('document.documentElement.scrollHeight'));
    const width = await evaluate('window.innerWidth');
    const full = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
    await writeFile(join(dir, `${name}-teljes.png`), Buffer.from(full.data, 'base64'));
    shots.push(join(dir, `${name}.png`));
    process.stdout.write('.');
  };

  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    for (const p of PLAN) {
      // A minta egyszer töltődik be; a fül utána mintaadatos marad (sessionStorage), az újratöltések nem írják felül.
      await load(`${BASE}?minta=${p.sample}`);
      for (const theme of THEMES) {
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme.scheme }] });
        for (const vp of p.viewports) {
          await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.touch ? 2 : 1, mobile: vp.touch });
          await cdp.send('Emulation.setTouchEmulationEnabled', vp.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
          const dir = join(OUT, p.sample, theme.name, String(vp.width));
          for (const [name, hash] of p.screens) {
            await load(`${BASE}${hash}`);
            await capture(dir, name);
          }
          for (const [name, hash, open] of p.layers) {
            if (name === '13-tovabbiak' && vp.width >= 900) continue;
            await load(`${BASE}${hash}`);
            if (open) {
              await evaluate(open);
              await sleep(500);
            }
            await capture(dir, name);
          }
        }
      }
    }
  } finally {
    await stop();
  }
  await writeIndex(shots);
  console.log(`\n${shots.length} képernyőkép: ${OUT}/index.html`);
}

/** Áttekintő oldal: képernyőnként egy sor, a szélességek egymás mellett, témánként és mintánként csoportosítva. */
async function writeIndex(shots) {
  const groups = new Map();
  for (const s of shots) {
    const [sample, theme, width, file] = relative(OUT, s).split('/');
    const key = `${sample} · ${theme}`;
    if (!groups.has(key)) groups.set(key, new Map());
    const rows = groups.get(key);
    const name = file.replace(/\.png$/, '');
    if (!rows.has(name)) rows.set(name, []);
    rows.get(name).push({ width, src: relative(OUT, s) });
  }
  const section = ([key, rows]) => `<h2>${key}</h2>${[...rows].map(([name, cells]) => `
    <h3>${name}</h3><div class="row">${cells.map((c) => `
      <figure><a href="${c.src.replace(/\.png$/, '-teljes.png')}"><img src="${c.src}" loading="lazy" alt="${name} ${c.width}px"></a><figcaption>${c.width} px</figcaption></figure>`).join('')}</div>`).join('')}`;
  const html = `<!doctype html><meta charset="utf-8"><title>Képernyőképek · ${LABEL}</title>
<style>
  body { font: 14px -apple-system, system-ui, sans-serif; margin: 24px; background: #f4f4f2; color: #1b1b19; }
  h2 { margin: 32px 0 8px; } h3 { margin: 16px 0 6px; font-weight: 500; color: #5c5b56; }
  .row { display: flex; gap: 16px; align-items: flex-start; overflow-x: auto; }
  figure { margin: 0; } figcaption { color: #5c5b56; font-size: 12px; }
  img { height: 360px; width: auto; border: 1px solid #0002; border-radius: 6px; background: #fff; }
</style>
<h1>Képernyőképek · ${LABEL}</h1><p>Készült: ${new Date().toLocaleString('hu-HU')} · ${BASE} · kattintásra az egész oldal.</p>
${[...groups].map(section).join('')}`;
  await writeFile(join(OUT, 'index.html'), html);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
