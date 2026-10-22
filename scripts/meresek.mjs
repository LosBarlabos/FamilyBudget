#!/usr/bin/env node
// Mérések a design-felméréshez (DESIGN_TERV.md, 1. és 7. fázis): a UX/UI Audit plugin mérőszkriptjei
// (probe-*.js) a mérési mátrix minden celláján, a mintaadattal. A szkripteket nem másolja a repóba, a plugin
// mappájából olvassa. Futó fejlesztői szerver kell hozzá (npm run dev).
//
//   node scripts/meresek.mjs --probak <a plugin scripts mappája> [--cimke alap] [--url http://localhost:5173/]
//
// Kimenet: docs/design/kepek/meresek/<címke>/<minta>/<téma>/<szélesség>/<képernyő>.<próba>.json, a
// billentyűzetes bejárás pedig <képernyő>.tab.json. A mappa nincs a gitben.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openBrowser, parseArgs, requireServer, SCREENS, THEMES, VIEWPORTS, sleep } from './cdp.mjs';

const args = parseArgs();
if (!args.probak) {
  console.error('Add meg a UX/UI Audit plugin scripts mappáját: --probak <mappa>');
  process.exit(1);
}
const BASE = (args.url ?? 'http://localhost:5173/').replace(/#.*$/, '');
const OUT = join('docs', 'design', 'kepek', 'meresek', args.cimke ?? 'alap');
// A probe-routes kimarad (az app hash-útvonalas gombokkal navigál, nincs bejárható <a href>), a probe-rtl és a
// probe-parity is (egynyelvű, balról jobbra író felület).
const PROBES = ['core', 'heuristics', 'perception', 'ltr'];
const TAB_STEPS = 40;

const PLAN = [
  { sample: 'teljes', themes: THEMES, viewports: VIEWPORTS, screens: [...SCREENS, ['10-gyorsrogzito', '#/attekintes?gyors']], tab: true },
  { sample: 'szelso', themes: [THEMES[0]], viewports: [VIEWPORTS[0], VIEWPORTS[3]], screens: SCREENS.slice(0, 4), tab: false },
  { sample: 'ures', themes: [THEMES[0]], viewports: [VIEWPORTS[0], VIEWPORTS[3]], screens: [['00-elso-inditas', '']], tab: true },
];

async function main() {
  await requireServer(BASE);
  const code = Object.fromEntries(await Promise.all(PROBES.map(async (p) => [p, await readFile(join(args.probak, `probe-${p}.js`), 'utf8')])));
  const focusProbe = await readFile(join(args.probak, 'probe-focus.js'), 'utf8');
  const { evaluate, load, setViewport, setTheme, press, stop } = await openBrowser();
  let cells = 0;
  try {
    for (const p of PLAN) {
      await load(`${BASE}?minta=${p.sample}`);
      for (const theme of p.themes) {
        await setTheme(theme);
        for (const vp of p.viewports) {
          await setViewport(vp);
          const dir = join(OUT, p.sample, theme.name, String(vp.width));
          await mkdir(dir, { recursive: true });
          for (const [name, hash] of p.screens) {
            for (const probe of PROBES) {
              // Minden próba tiszta betöltésen fut, hogy a teljesítmény- és eseményadatok ne keveredjenek.
              await load(`${BASE}${hash}`);
              let out;
              try {
                out = await evaluate(code[probe]);
              } catch (e) {
                out = JSON.stringify({ error: String(e.message ?? e) });
              }
              await writeFile(join(dir, `${name}.${probe}.json`), out);
            }
            // Billentyűzetes bejárás: valódi Tab-leütések, mindegyik után a fókuszpróba. A világos és a sötét
            // témában, telefonon és asztalon.
            if (p.tab && (vp.width === 375 || vp.width === 1440)) {
              await load(`${BASE}${hash}`);
              const steps = [];
              for (let i = 0; i < TAB_STEPS; i++) {
                await press('Tab', 'Tab', 9);
                await sleep(60);
                try {
                  steps.push(JSON.parse(await evaluate(focusProbe)));
                } catch (e) {
                  steps.push({ error: String(e.message ?? e) });
                }
              }
              await writeFile(join(dir, `${name}.tab.json`), JSON.stringify(steps, null, 1));
            }
            cells++;
            process.stdout.write('.');
          }
        }
      }
    }
  } finally {
    await stop();
  }
  console.log(`\n${cells} cella mérve: ${OUT}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
