#!/usr/bin/env node
// Teljesítménymérés egy éles buildön (DESIGN_TERV.md, 7. fázis), Lighthouse nélkül: a fej nélküli Chrome
// mobilprofillal (375 px, 4× lassított processzor, lassú 4G, gyorsítótár és service worker nélkül).
// A buildben nincs mintaadatos mód, ezért a mintát mentésfájlként tölti be az első indítás „Van már mentésem”
// gombjával, utána az Áttekintést háromszor tölti be hidegen, és egy fülváltás válaszidejét is méri.
//
//   node scripts/teljesitmeny.mjs --dist dist --minta <mentés.json> [--port 4180] [--korok 3]
//
// Kimenet: JSON a mediánokkal (LCP, CLS, FCP, átvitt kB) és a fülváltás leghosszabb eseményével (INP-közelítés).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { openBrowser, parseArgs, sleep } from './cdp.mjs';

const args = parseArgs();
const DIST = resolve(args.dist ?? 'dist');
const PORT = Number(args.port ?? 4180);
const ROUNDS = Number(args.korok ?? 3);
if (!args.minta) {
  console.error('Add meg a mintamentést: --minta <mentés.json>');
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain',
};
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(DIST, path.endsWith('/') ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    // Mint a GitHub Pages: a szöveges fájlok gzip-pel mennek, a betűk (woff2) már tömörítettek.
    if (/text|javascript|json|svg|manifest/.test(type) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
      res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip' });
      res.end(gzipSync(body));
    } else {
      res.writeHead(200, { 'content-type': type });
      res.end(body);
    }
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(PORT, ok));
const BASE = `http://localhost:${PORT}/`;

// A betöltés elejétől figyeli a legnagyobb tartalmas festést, az elrendezés-ugrásokat és az eseményeket.
const OBSERVE = `
  window.__perf = { lcp: 0, cls: 0, ev: 0 };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) __perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) __perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) __perf.ev = Math.max(__perf.ev, e.duration); }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
`;

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const b = await openBrowser();
const { cdp, evaluate } = b;
// A súgó betöltése 15 másodpercig vár; lassított hálózaton ennél tovább is tarthat.
const slowLoad = async (url) => {
  const blank = cdp.once('Page.loadEventFired', 60_000);
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await blank;
  const loaded = cdp.once('Page.loadEventFired', 60_000);
  await cdp.send('Page.navigate', { url });
  await loaded;
};
try {
  await b.setViewport({ width: 375, height: 812, touch: true });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVE });
  await cdp.send('DOM.enable');
  await cdp.send('Network.enable');

  // A minta betöltése, lassítás nélkül.
  await b.load(BASE);
  await evaluate(`[...document.querySelectorAll('button')].find((x) => x.textContent.includes('Van már mentésem'))?.click(), true`);
  await sleep(500);
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
  await cdp.send('DOM.setFileInputFiles', { nodeId, files: [resolve(args.minta)] });
  await sleep(800);
  await evaluate(`[...document.querySelectorAll('button')].find((x) => /Felülírás|betöltés/.test(x.textContent) && !x.textContent.includes('Visszatöltés'))?.click(), true`);
  await sleep(2500);

  // Mobilprofil: a Lighthouse mobil alapbeállításához hasonló lassítás.
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });

  const loads = [];
  for (let i = 0; i < ROUNDS; i++) {
    await slowLoad(`${BASE}#/attekintes`);
    await sleep(4000);
    loads.push(
      await evaluate(`({
        hero: !!document.querySelector('.hero'),
        lcp: Math.round(__perf.lcp), cls: Math.round(__perf.cls * 1000) / 1000,
        fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0),
        kb: Math.round((performance.getEntriesByType('navigation')[0].transferSize + performance.getEntriesByType('resource').reduce((s, r) => s + r.transferSize, 0)) / 1024),
      })`),
    );
  }

  // Fülváltás: valódi koppintás a „Keretek” (régen „Rögzítés”) fülre, a leghosszabb esemény időtartama.
  const taps = [];
  for (let i = 0; i < ROUNDS; i++) {
    await slowLoad(`${BASE}#/attekintes`);
    await sleep(4000);
    await evaluate('__perf.ev = 0, true');
    const p = await evaluate(`(() => {
      const t = [...document.querySelectorAll('nav button, .tabbar button')].find((x) => /Keretek|Rögzítés/.test(x.textContent) && x.getBoundingClientRect().width > 0);
      const r = t.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(1500);
    taps.push(await evaluate('Math.round(__perf.ev)'));
  }

  console.log(JSON.stringify({
    dist: DIST,
    adatokkal: loads.every((l) => l.hero),
    lcp: median(loads.map((l) => l.lcp)),
    cls: median(loads.map((l) => l.cls)),
    fcp: median(loads.map((l) => l.fcp)),
    kb: median(loads.map((l) => l.kb)),
    fulvaltas: median(taps),
    korok: { loads, taps },
  }, null, 2));
} finally {
  await b.stop().catch(() => {});
  server.close();
}
