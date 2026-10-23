#!/usr/bin/env node
// Két képernyőkép-sorozat összevetése (DESIGN_TERV.md, 5. és 7. fázis): cellánként a megváltozott képpontok
// aránya és a változás befoglaló téglalapja, a változott képekről pedig piros kiemelésű különbségkép. A képeket
// a fej nélküli Chrome vásznán hasonlítja össze, így nem kell hozzá képfeldolgozó csomag.
//
//   node scripts/kepdiff.mjs <előtte címke> <utána címke> [--kuszob 8] [--csak-hajtas]
//
// Kimenet: a konzolra táblázat, a különbségképek a docs/design/kepek/diff/<előtte>--<utána>/ mappába.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { openBrowser, parseArgs } from './cdp.mjs';

const [before, after] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const args = parseArgs();
if (!before || !after) {
  console.error('Használat: node scripts/kepdiff.mjs <előtte címke> <utána címke> [--kuszob 8] [--csak-hajtas]');
  process.exit(1);
}
const ROOT = join('docs', 'design', 'kepek');
const OUT = join(ROOT, 'diff', `${before}--${after}`);
// Csatornánkénti eltérés, ami alatt a képpont változatlannak számít (élsimítás, betűrenderelés zaja).
const THRESHOLD = Number(args.kuszob ?? 8);
const foldOnly = process.argv.includes('--csak-hajtas');

async function list(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await list(p)));
    else if (e.name.endsWith('.png') && (!foldOnly || !e.name.endsWith('-teljes.png'))) out.push(p);
  }
  return out;
}

const COMPARE = `async (a, b, threshold) => {
  const load = async (b64) => createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
  const draw = (img) => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); x.fillStyle = '#ff00ff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
  const da = draw(ia), db = draw(ib);
  const out = new OffscreenCanvas(w, h); const ox = out.getContext('2d'); ox.drawImage(ib, 0, 0);
  const od = ox.getImageData(0, 0, w, h);
  let changed = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
    const p = i / 4, x = p % w, y = (p - x) / w;
    if (d > threshold) {
      changed++; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      od.data[i] = 255; od.data[i + 1] = 0; od.data[i + 2] = 0; od.data[i + 3] = 255;
    } else {
      // A változatlan rész halványítva, hogy a piros kiemelés látszódjon.
      od.data[i] = 255 - (255 - od.data[i]) * 0.25; od.data[i + 1] = 255 - (255 - od.data[i + 1]) * 0.25; od.data[i + 2] = 255 - (255 - od.data[i + 2]) * 0.25;
    }
  }
  ox.putImageData(od, 0, 0);
  const png = changed ? await new Promise((r) => out.convertToBlob({ type: 'image/png' }).then((bl) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(bl); })) : null;
  return JSON.stringify({ size: [ia.width, ia.height, ib.width, ib.height], changed, total: w * h, box: changed ? [x0, y0, x1, y1] : null, png });
}`;

async function main() {
  const files = await list(join(ROOT, before));
  const { evaluate, load, stop } = await openBrowser();
  const rows = [];
  try {
    // Üres lap a vászonhoz; az OffscreenCanvas és a createImageBitmap a data: URL-ekkel itt is működik.
    await load('data:text/html,<title>diff</title><div id=root>x</div>');
    for (const fa of files) {
      const rel = relative(join(ROOT, before), fa);
      const fb = join(ROOT, after, rel);
      let b;
      try {
        b = await readFile(fb);
      } catch {
        rows.push({ rel, note: 'nincs párja' });
        continue;
      }
      const a = await readFile(fa);
      const r = JSON.parse(await evaluate(`(${COMPARE})(${JSON.stringify(a.toString('base64'))}, ${JSON.stringify(b.toString('base64'))}, ${THRESHOLD})`));
      if (r.png) {
        const dest = join(OUT, rel);
        await mkdir(join(dest, '..'), { recursive: true });
        await writeFile(dest, Buffer.from(r.png, 'base64'));
      }
      rows.push({ rel, pct: (100 * r.changed) / r.total, box: r.box, resized: r.size[0] !== r.size[2] || r.size[1] !== r.size[3] ? `${r.size[0]}×${r.size[1]} → ${r.size[2]}×${r.size[3]}` : '' });
      process.stdout.write('.');
    }
  } finally {
    await stop();
  }
  rows.sort((x, y) => (y.pct ?? -1) - (x.pct ?? -1));
  console.log(`\n${before} → ${after}, küszöb ${THRESHOLD}`);
  for (const r of rows) {
    if (r.note) console.log(`  ${r.rel}: ${r.note}`);
    else console.log(`  ${r.pct.toFixed(2).padStart(6)}%  ${r.rel}${r.resized ? `  (méret: ${r.resized})` : ''}${r.box ? `  [${r.box.join(', ')}]` : ''}`);
  }
  const same = rows.filter((r) => r.pct === 0).length;
  console.log(`${same} / ${rows.length} kép változatlan. Különbségképek: ${OUT}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
