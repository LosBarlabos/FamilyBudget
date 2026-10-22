# 0. fázis – Előkészítés

A [DESIGN_TERV.md](../../DESIGN_TERV.md) 0. fázisa: mintaadat és mérési mátrix, hogy a felmérés (1. fázis) és a visszamérés (7. fázis) ugyanazon az állapoton, megismételhetően fusson.

## Mintaadat

Csak fejlesztői módban (`npm run dev`) érhető el, az éles buildbe nem kerül bele.

| Cím | Mit tölt be |
|---|---|
| `http://localhost:5173/?minta=teljes` | Egy átlagos család (lásd lent). A `?minta` érték nélkül is ezt tölti. |
| `http://localhost:5173/?minta=szelso` | Szélsőséges eset. |
| `http://localhost:5173/?minta=ures` | Üres adatbázis: az első indítás varázslója. |
| `http://localhost:5173/?minta=ki` | Vissza a valódi adatokra. |

**Elkülönítés:**
- A minta külön IndexedDB-adatbázisba kerül (`csaladi-koltsegvetes-minta`), a valódi adatokhoz nem nyúl.
- A UI-beállítások (összecsukott csoportok, szinkronbeállítás) `minta:` előtagú kulcsokon élnek, így a szinkron a mintaadatos fülön ki van kapcsolva.
- A mód a böngészőfülhöz tartozik (`sessionStorage`): újratöltés után is megmarad, egy új fül viszont már a valódi adatokat mutatja.
- A fül címe `[Minta] …` kezdetű. A képernyőn nincs jelzés, hogy a felmérést ne zavarja.
- A minta újratöltésével (`?minta=teljes` újra) a mintaadatbázis és a minta UI-beállításai alapállapotba kerülnek.

**Megismételhetőség:** a generátor (`src/domain/sample.ts`) ugyanarra a napra mindig ugyanazt adja. A fizetésnapot a mai naphoz igazítja, így **ma mindig a folyamatban lévő időszak 18. napja van** (kb. 58%). A hónapnevek és a dátumok a futtatás napjától függnek, az állapotok nem. Ezt a `src/domain/sample.test.ts` több „mai napra” is ellenőrzi (hónap eleje és vége, szökőnap, évforduló).

### `teljes`

- 14 lezárt időszak és a folyamatban lévő, egy előre rögzített jövőbeli tétellel. Kb. 700 rögzítés, megjegyzésekkel és #címkékkel (`#szülinap`, `#iskola`, `#nyaralás`, `#hétvége`, `#autó`).
- Kategóriák:
  - 3 bevétel, köztük egy keret típusú;
  - 9 fix számla, köztük:
    - 2 csoportos beszedésű,
    - egy kéthavonta, egy negyedévente és egy évente esedékes;
  - 10 keret, köztük:
    - egy terv nélküli,
    - egy, ami nem számít a napi összegbe,
    - a Váratlan kiadások;
  - 3 megtakarítás, ebből 2 célos;
  - 1 archivált.
- Tervek: az első időszaktól. Az Élelmiszer 4 hónapja „ettől a hónaptól” emelve, az Ajándéknak 2 hónap múlva egyszeri terve van („csak erre a hónapra”).
- Megtakarításból fizetett költés (autószerviz a vésztartalékból, a Közlekedés kiadásaként).
- A folyamatban lévő időszakban ezek biztosan előfordulnak (teszt ellenőrzi):

  | Állapot | Hol látszik |
  |---|---|
  | Lejárt számla (Áram, 3 napja) | Teendők, Rögzítés, Számlanaptár, oldalsáv-jelvény |
  | 5 napon belül esedékes számla (Gáz) | Teendők, gyorsrögzítő számla-chip |
  | Csoportos beszedéssel automatikusan kifizetett számla | Rögzítés, Számlanaptár |
  | A tervtől eltérő összeggel kifizetett számla (Internet) | Díjváltozás-javaslat |
  | El nem érkezett egyösszegű bevétel (Családi pótlék) | Teendők |
  | Gyorsan fogyó keret (Élelmiszer) | Hero állapotmondat, Teendők, keretsáv |
  | Túllépett keret (Ruházat) | Teendők, keretsáv, Fedezet áthozása |
  | Terv nélküli költés (Ajándék) | Teendők, Rögzítés |
  | Lemaradó cél (Nyaralás 2027) és tervszerű cél (Vésztartalék) | Teendők, célkártyák |
  | Pozitív futó egyenleg, friss mentés | Áttekintés, oldalsáv |

### `szelso`

- A `teljes` adatai, és mellettük:
  - **40 aktív kategória**, közülük több **50 karakternél hosszabb névvel** (pl. „Gyerekek iskolai, különórai és sportegyesületi költségei”);
  - **erősen negatív futó egyenleg**, ami végig mélyül (−14 millió Ft körül);
  - **nyolcjegyű összegek** (45 000 000 Ft-os cél, 2 350 000 Ft-os váratlan kiadás);
  - 5 lejárt számla, egyszerre sok teendő;
  - **45 napos mentés** (elavult);
  - „Új időszak kezdődött” sáv (a `lastSeenPeriodId` az előző időszak).

### `ures`

Üres adatbázis, a varázsló első lépése.

### Ami nincs a mintában

A tervben szereplő **korrekció (egyeztetés)** és a **havi zárás folyamata** még nincs megvalósítva az appban. Nincs `adjustments` tábla, és a havi zárás helyett csak az „Új időszak kezdődött” mentési sáv létezik, így ezeket a minta nem tartalmazhatja. Ha a 3. fázisban bekerülnek, a mintát is bővíteni kell.

## Mérési mátrix

| Szélesség × magasság | Eszköz | Érintés | Pixelsűrűség |
|---|---|---|---|
| 375 × 812 | telefon | igen (`pointer: coarse`) | 2× |
| 768 × 1024 | táblagép állva | igen | 2× |
| 1024 × 768 | kis laptop, táblagép fekve | nem | 1× |
| 1440 × 900 | asztali | nem | 1× |

Témák: világos és sötét (`prefers-color-scheme`). Kézi témaválasztó jelenleg nincs az appban.

| Minta | Szélességek | Képernyők |
|---|---|---|
| `teljes` | mind a 4 | 7 képernyő: Áttekintés, Rögzítés, Tervező, Elemzés, Számlanaptár, Kategóriák, Beállítások. Rétegek: gyorsrögzítő, Váratlan kiadás, új cél űrlapja, és 900 px alatt a Továbbiak lap. |
| `szelso` | 375, 1440 | Áttekintés, Rögzítés, Tervező, Elemzés |
| `ures` | 375, 1440 | Első indítás |

Ez összesen 104 cella. Mindegyikről két kép készül: a hajtás feletti rész (amit megnyitáskor látni) és az egész oldal.

## Képernyőképek

```bash
npm run dev
```

```bash
npm run kepek
```

- A szkript (`scripts/kepernyokepek.mjs`) a gépre telepített Chrome-ot fej nélküli módban, a DevTools protokollon vezérli. Új npm-csomag nem kell hozzá. Más Chrome-útvonalhoz: `CHROME=/út/a/chrome npm run kepek`.
- Kapcsolók: `--cimke utana` (a 7. fázishoz, külön mappába), `--csak teljes|szelso|ures`, `--url http://localhost:5174/`.
- Kimenet: `docs/design/kepek/<címke>/<minta>/<téma>/<szélesség>/<nn-képernyő>.png` és `…-teljes.png`, áttekintőnek `docs/design/kepek/<címke>/index.html`. A mappa a `.gitignore`-ban van, nem kerül a repóba.
- Minden kép tiszta betöltésből készül: a fül közben mintaadatos marad, de nincs nyitva hagyott réteg vagy görgetési állapot. A grafikonok animációjára 1,2 másodpercet vár.

**Korlátok:**
- Az egész oldalas képen a rögzített elemek (alsó sáv, toastok) az oldal aljára kerülnek. A hajtás feletti kép mutatja őket a valódi helyükön.
- A rétegeken belüli állapotok (pl. kinyitott keretsor, gépelés közbeni gyorsrögzítő) nincsenek a mátrixban. Ezeket az 1. fázisban a böngészőpanelen kell kézzel bejárni.

## Az első futtatáskor feltűnt (az 1. fázis bemenete)

- **Tervező, 1440 px, `szelso`:** a Futó egyenleg grafikon vízszintes tengelyén a hónapnevek egymásra csúsznak, olvashatatlanok („AugSzepOktNovDec…”). A `FEJLESZTESI_TERV.md` 9. pontjában kért `autoSkip` itt nem segít. Valószínűleg azért, mert az oldalsó kártyaoszlop keskeny, és 20 időszak címkéje nem fér el benne. Ezt az 1. fázisban kell megerősíteni.
