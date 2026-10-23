#!/usr/bin/env node
// Képernyőképek a design-felméréshez (DESIGN_TERV.md, 0. és 7. fázis): a mérési mátrix minden cellája a
// mintaadattal, világos és sötét témában. A Chrome-ot a DevTools protokollon vezérli a Node beépített
// WebSocketjével, így nem kell hozzá npm-csomag. Futó fejlesztői szerver kell hozzá (npm run dev).
//
//   node scripts/kepernyokepek.mjs [--url http://localhost:5173/] [--cimke alap] [--csak teljes|szelso|ures]
//
// Kimenet: docs/design/kepek/<címke>/<minta>/<téma>/<szélesség>/<nn-képernyő>.png (a hajtás feletti rész) és
// ...-teljes.png (az egész oldal), valamint egy index.html áttekintő. A mappa nincs a gitben.

import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { openBrowser, parseArgs, requireServer, SCREENS, sleep, THEMES, VIEWPORTS } from './cdp.mjs';

const args = parseArgs();
const BASE = (args.url ?? 'http://localhost:5173/').replace(/#.*$/, '');
const LABEL = args.cimke ?? 'alap';
const OUT = join('docs', 'design', 'kepek', LABEL);

/** Rétegek: a hash nyitja meg őket, a Továbbiak lapot a mobil alsó sáv gombja. */
const LAYERS = [
  ['10-gyorsrogzito', '#/attekintes?gyors'],
  ['11-varatlan-kiadas', '#/rogzites/varatlan'],
  ['12-uj-cel', '#/kategoriak/uj-cel'],
  ['13-tobb', '#/attekintes', `[...document.querySelectorAll('.tabbar button')].find((b) => b.textContent.trim() === 'Több')?.click()`],
];
const PLAN = [
  { sample: 'teljes', viewports: VIEWPORTS, screens: SCREENS, layers: LAYERS },
  { sample: 'szelso', viewports: [VIEWPORTS[0], VIEWPORTS[3]], screens: SCREENS.slice(0, 4), layers: [] },
  { sample: 'ures', viewports: [VIEWPORTS[0], VIEWPORTS[3]], screens: [['00-elso-inditas', '']], layers: [] },
].filter((p) => !args.csak || p.sample === args.csak);

async function main() {
  await requireServer(BASE);
  const { cdp, evaluate, load, setViewport, setTheme, stop } = await openBrowser();
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
    for (const p of PLAN) {
      // A minta egyszer töltődik be; a fül utána mintaadatos marad (sessionStorage), az újratöltések nem írják felül.
      await load(`${BASE}?minta=${p.sample}`);
      for (const theme of THEMES) {
        await setTheme(theme);
        for (const vp of p.viewports) {
          await setViewport(vp);
          const dir = join(OUT, p.sample, theme.name, String(vp.width));
          for (const [name, hash] of p.screens) {
            await load(`${BASE}${hash}`);
            await capture(dir, name);
          }
          for (const [name, hash, open] of p.layers) {
            if (name === '13-tobb' && vp.width >= 640) continue;
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
