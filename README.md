# Családi költségvetés

Havi családi költségvetés tervezése és követése, fizetéstől fizetésig tartó időszakokkal. Böngészőben futó webapp (PWA); az adatok a böngészőben (IndexedDB) tárolódnak, mentés JSON fájlba.

A részletes koncepció: [KONCEPCIO.md](KONCEPCIO.md).

## Fejlesztés

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # a számítási logika tesztjei
npm run build      # éles build a dist/ mappába
npm run kepek      # képernyőképek a mintaadattal (fut a dev szerver mellett, lásd docs/design/00-elokeszites.md)
npm run meresek -- --probak <mappa>   # a UX/UI Audit plugin mérései ugyanezen a mátrixon (docs/design/01-audit.md)
node scripts/hasznalat.mjs <mentés.json>   # használati minták egy mentésből, csak összesítve (docs/design/02-felhasznaloi-kutatas.md)
```

Fejlesztői módban az adatbázis a böngészőkonzolból `db` néven elérhető (Dexie), hibakereséshez. A `?minta=teljes`, `?minta=szelso` vagy `?minta=ures` paraméter mintaadattal indítja az appot egy külön adatbázisban, a `?minta=ki` visszavált a valódi adatokra.

## Felépítés

- `src/domain/` – a felülettől független számítások: időszakok, terv-öröklődés, futó egyenleg, állapotok, mentési formátum (tesztekkel)
- `src/db/` – Dexie adatbázis és műveletek
- `src/ui/` – React felület: `screens/` (Áttekintés, Rögzítés, Tervező, Elemzés, Kategóriák, Beállítások, első indítás), `components/`, hash-alapú útvonalak (`router.ts`, a feldolgozás a `src/domain/routes.ts`-ben)

## Közzététel

A `npm run build` után a `dist/` mappa tartalma bármilyen statikus tárhelyre feltölthető (GitHub Pages, Netlify). Relatív útvonalakkal készül, így alkönyvtárban is működik. Az adatok a felhasználó böngészőjében maradnak, a tárhelyen csak az app kódja van.
