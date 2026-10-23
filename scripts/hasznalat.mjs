#!/usr/bin/env node
// Használati minták egy mentésfájlból (DESIGN_TERV.md, 2. fázis): ki, mikor, mit és hogyan rögzít. Csak
// összesített számokat ír ki, összegeket és megjegyzésszövegeket nem, és semmit nem küld sehova.
//
//   node scripts/hasznalat.mjs <csaladi-koltsegvetes-ÉÉÉÉ-HH-NN.json>

import { readFile } from 'node:fs/promises';

const file = process.argv[2];
if (!file) {
  console.error('Add meg a mentésfájlt: node scripts/hasznalat.mjs <mentés.json>');
  process.exit(1);
}
const data = JSON.parse(await readFile(file, 'utf8'));
const entries = (data.entries ?? []).filter((e) => e.kind !== 'withdrawal');
const cats = new Map((data.categories ?? []).map((c) => [c.id, c]));
if (entries.length === 0) {
  console.log('A mentésben nincs rögzítés.');
  process.exit(0);
}

const pct = (n, of) => `${Math.round((n / of) * 100)}%`;
const count = (list, key) => {
  const m = new Map();
  for (const x of list) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
};
const table = (title, rows, of = entries.length) => {
  console.log(`\n${title}`);
  for (const [k, n] of rows) console.log(`  ${String(k).padEnd(28)} ${String(n).padStart(5)}  ${pct(n, of)}`);
};

const created = entries.map((e) => new Date(e.createdAt)).filter((d) => !Number.isNaN(d.getTime()));
const first = new Date(Math.min(...created));
const last = new Date(Math.max(...created));
const days = new Set(created.map((d) => d.toISOString().slice(0, 10)));
const spanDays = Math.max(1, Math.round((last - first) / 86_400_000) + 1);

console.log(`Rögzítések: ${entries.length} · ${first.toLocaleDateString('hu-HU')} – ${last.toLocaleDateString('hu-HU')}`);
console.log(`Napok, amikor volt rögzítés: ${days.size} / ${spanDays} (${pct(days.size, spanDays)})`);
console.log(`Átlagosan ${(entries.length / days.size).toFixed(1)} rögzítés egy ilyen napon`);

table('Ki rögzít (közös használatnál a név, egyébként „–”)', count(entries, (e) => e.createdBy ?? '–'));

const WEEKDAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
table('A hét melyik napján', count(created, (d) => WEEKDAYS[d.getDay()]), created.length);
const slot = (h) => (h < 9 ? 'reggel (–9)' : h < 13 ? 'délelőtt (9–13)' : h < 18 ? 'délután (13–18)' : h < 22 ? 'este (18–22)' : 'késő este (22–)');
table('Napszak', count(created, (d) => slot(d.getHours())), created.length);

// A vásárlás napja és a rögzítés napja közti késés: azonnal rögzít, vagy utólag, egyszerre többet.
const lag = entries.map((e) => {
  const d = new Date(`${e.date}T12:00:00`);
  const c = new Date(e.createdAt);
  return Math.round((new Date(c.toISOString().slice(0, 10) + 'T12:00:00') - d) / 86_400_000);
});
const lagBucket = (n) => (n < 0 ? 'előre (jövőbeli napra)' : n === 0 ? 'aznap' : n === 1 ? 'másnap' : n <= 7 ? '2–7 nappal később' : 'egy hétnél később');
table('Mikor rögzül a vásárlás napjához képest', count(lag, lagBucket));

table('Kategóriatípus', count(entries, (e) => ({ keret: 'keret', fix: 'fix számla', bevetel: 'bevétel', megtakaritas: 'megtakarítás' })[cats.get(e.categoryId)?.type] ?? 'ismeretlen'));
table('A 10 leggyakrabban használt kategória', count(entries, (e) => cats.get(e.categoryId)?.name ?? 'ismeretlen').slice(0, 10));

const withNote = entries.filter((e) => e.note?.trim()).length;
const tags = entries.flatMap((e) => (e.note ?? '').match(/#[\p{L}\p{N}_-]+/gu) ?? []);
console.log('\nFunkciók használata');
console.log(`  megjegyzéssel                ${String(withNote).padStart(5)}  ${pct(withNote, entries.length)}`);
console.log(`  #címkével                    ${String(entries.filter((e) => /#[\p{L}\p{N}]/u.test(e.note ?? '')).length).padStart(5)}  (${new Set(tags).size} különböző címke)`);
console.log(`  „Havi összeg megadása”       ${String(entries.filter((e) => e.monthlyTotal).length).padStart(5)}`);
console.log(`  lezáró rögzítés (Kifizetve…) ${String(entries.filter((e) => e.settles).length).padStart(5)}`);
console.log(`  felhasználás megtakarításból ${String((data.entries ?? []).filter((e) => e.kind === 'withdrawal').length).padStart(5)}`);
