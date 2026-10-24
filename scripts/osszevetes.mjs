#!/usr/bin/env node
// Két mérés összevetése (DESIGN_TERV.md, 7. fázis): a scripts/meresek.mjs két címkéjének (alapból „alap” és
// „utana”) JSON-jait ugyanazokra a számokra vetíti, és egy Markdown-táblázatot ír a kimenetre.
//
//   node scripts/osszevetes.mjs [--elotte alap] [--utana utana]

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from './cdp.mjs';

const args = parseArgs();
const ROOT = join('docs', 'design', 'kepek', 'meresek');

/** Minden <minta>/<téma>/<szélesség>/<képernyő>.<próba>.json, cellánként összegyűjtve. */
async function load(label) {
  const cells = new Map();
  const walk = async (dir, parts) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(join(dir, e.name), [...parts, e.name]);
      else if (e.name.endsWith('.json')) {
        const [screen, probe] = e.name.replace(/\.json$/, '').split('.');
        const key = [...parts, screen].join('/');
        const cell = cells.get(key) ?? { sample: parts[0], theme: parts[1], width: Number(parts[2]), screen };
        try {
          cell[probe] = JSON.parse(await readFile(join(dir, e.name), 'utf8'));
        } catch {
          cell[probe] = null;
        }
        cells.set(key, cell);
      }
    }
  };
  await walk(join(ROOT, label), []);
  return [...cells.values()];
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const avg = (xs) => (xs.length ? sum(xs) / xs.length : 0);
const fmt = (n, d = 0) => n.toFixed(d).replace('.', ',');

function metrics(cells) {
  const core = cells.filter((c) => c.core && !c.core.error);
  const heur = cells.filter((c) => c.heuristics && !c.heuristics.error);
  const tabs = cells.filter((c) => Array.isArray(c.tab));
  const steps = tabs.flatMap((c) => c.tab);
  const contrastIn = (theme) => sum(core.filter((c) => c.theme === theme).map((c) => c.core.contrast?.failures?.length ?? 0));
  const phone = heur.filter((c) => c.width <= 390);
  return {
    'Mért cellák': core.length,
    'Kontraszthiba (szöveg), összesen': sum(core.map((c) => c.core.contrast?.failures?.length ?? 0)),
    '– ebből világos téma': contrastIn('vilagos'),
    '– ebből sötét téma': contrastIn('sotet'),
    'Cella kontraszthibával': core.filter((c) => (c.core.contrast?.failures?.length ?? 0) > 0).length,
    'Érintési cél 24 px alatt': sum(core.map((c) => c.core.tapTargets?.tooSmall?.length ?? 0)),
    'Érintési cél 24–44 px között': sum(core.map((c) => c.core.tapTargets?.between24and44 ?? 0)),
    'Név nélküli vezérlő': sum(core.map((c) => c.core.naming?.unnamed?.length ?? 0)),
    'Ismétlődő nevű vezérlő': sum(core.map((c) => c.core.naming?.duplicateNames?.length ?? 0)),
    'Cella vízszintes kilógással': core.filter((c) => c.core.layout?.horizontalOverflow || (c.core.layout?.overflowingElements?.length ?? 0) > 0).length,
    'Cella <h1> nélkül': core.filter((c) => (c.core.structure?.h1Count ?? 0) === 0).length,
    'Tab-leütés (fókuszpróba)': steps.length,
    '– fókuszjelző nélkül': steps.filter((s) => s && s.focusedElement && !s.focusVisibleMatches).length,
    '– fókuszjelző kontraszthibával': steps.filter((s) => s?.verdict && s.verdict.contrastPasses === false).length,
    'Versengő elsődleges gomb, átlag/cella (telefon)': fmt(avg(phone.map((c) => c.heuristics.fitts?.competingPrimaries?.count ?? 0)), 1),
    'Nehezen elérhető cél (Fitts-index > 4), telefon': sum(phone.map((c) => (c.heuristics.fitts?.hardestTargets ?? []).filter((t) => t.index > 4).length)),
    'Interaktív elem az első képernyőn, átlag': fmt(avg(heur.map((c) => c.heuristics.cognitiveLoad?.interactiveFirstScreen ?? 0)), 1),
    'Különböző betűméret, átlag/cella': fmt(avg(heur.map((c) => c.heuristics.designSystem?.distinctFontSizes?.count ?? 0)), 1),
    'Különböző térköz, átlag/cella': fmt(avg(heur.map((c) => c.heuristics.designSystem?.distinctSpacingValues?.count ?? 0)), 1),
  };
}

const before = metrics(await load(args.elotte ?? 'alap'));
const after = metrics(await load(args.utana ?? 'utana'));
console.log(`| Mérőszám | Előtte (${args.elotte ?? 'alap'}) | Utána (${args.utana ?? 'utana'}) |`);
console.log('|---|---|---|');
for (const k of Object.keys(before)) console.log(`| ${k} | ${before[k]} | ${after[k]} |`);
