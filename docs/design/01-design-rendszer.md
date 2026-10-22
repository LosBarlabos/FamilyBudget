# 1.4 Design-rendszer audit

A [DESIGN_TERV.md](../../DESIGN_TERV.md) 1.4-es lépése, a `design:design-system` skill audit módszerével: tokenlefedettség, névadás, komponensek teljessége, prioritások. Ez az anyag az 5. fázis (Design-rendszer 2.0) kiindulópontja. A számok a 2026-10-22-i `main` állapotra vonatkoznak (`b456fc1`).

**Vizsgált anyag:**
- `src/styles.css` (860 sor, 50 KB, 283 osztály);
- a TSX fájlok inline stílusai (`style={{…}}`);
- `src/ui/components/Charts.tsx` (Chart.js téma);
- `src/domain/defaults.ts` (kategóriapaletta);
- `index.html` és `vite.config.ts` (téma-metaadatok);
- a kiindulási képek a `docs/design/kepek/alap/` mappában (pl. `teljes/vilagos/1440/01-attekintes-teljes.png`, `teljes/sotet/1440/04-elemzes.png`, `teljes/vilagos/768/10-gyorsrogzito.png`).

**Módszer:** a számokat szkript számolta a deklarációkból (a `:root` és a sötét blokk, 1–63. sor, külön kezelve). A felhasználatlan osztályokat a CSS-szelektorok és a forrásban szereplő osztálynevek összevetése adta. A dinamikusan összerakott neveket (pl. `t-${tone}`) kézzel ellenőriztem. A kontrasztarányok WCAG-képlettel számolt értékek a token-színpárokra. A böngészőben mért kontraszt az 1.1-es auditban van.

**Összegzés:** a színek a CSS-ben nagyrészt tokeneken mennek, minden más viszont beégetett érték. A betűméret, a térköz, az árnyék, a z-index és a mozgás egyetlen deklarációja sem használ tokent, a sugárnak csak 34%-a. A komponensek kézzel másolt változatokban élnek: 13 sortípus, 10 címke-/jelvényváltozat, 3 sávmegvalósítás. A grafikonok párhuzamos, kézzel másolt színtáblát használnak. Az 5. fázis első lépése (csere tokenekre, látható változás nélkül) ezért nem egyszerű keresés–csere: előbb skálákat kell választani, és a közeli értékeket össze kell vonni.

**Pontszám: 45/100.** Színtokenek: jó. Méret- és mozgástokenek: nincsenek. Komponensek: működnek, de állapotaik és változataik nincsenek rendszerbe foglalva. Architektúra: egy fájl, képernyőnként szétszórt töréspontokkal.

---

## Számokban

| Terület | Mért érték |
|---|---|
| `styles.css` | 860 sor, 50 KB, 283 osztály, 25 `@media` blokk, 0 `!important` |
| Tokenek a `:root`-on | 30 (27 szín, 2 sugár, 1 betűcsalád) |
| Sötét módban újradefiniált token | 23 / 30; a 4 színtoken (`--warn-fill`, `--danger-fill`, `--hero-accent`, `--hero-danger`) nincs újradefiniálva |
| Definiált, de nem használt token | 1 (`--grid`: 0 használat); 1 használattal: `--surface-3`, `--font`, `--hero-accent`, `--hero-danger` |
| Nyers szín a CSS-ben a `:root`-on kívül | 9 (3× `#fff`, 1× `#000`, 5× `rgba(0,0,0,…)`); `color-mix()`: 17 |
| Hexa szín TS/TSX-ben (a `sample.ts` mintaadat nélkül) | 29: `Charts.tsx` 13, `defaults.ts` 13 (paletta), 3 tartalékszín (`#8a8983` 2×, `#888780` 1×) |
| Hexa színhez fűzött átlátszóság (`${szín}1f`) | 8 hely (`common.tsx:19`, `Charts.tsx:85, 196, 216, 260, 300, 311`) |
| `font-size` | 114 deklaráció, 0 tokennel; 13 különböző px-érték + 1 `clamp()` |
| Betűméret-értékek | 11 (4×), 12 (21×), 13 (17×), 14 (17×), 15 (11×), 16 (16×), 17 (1×), 18 (8×), 19 (2×), 20 (8×), 22 (4×), 28 (2×), 40 (1×) px; `clamp(36px, 10vw, 52px)` |
| Ikonméret (`.ti`) | 10 különböző: 12, 14, 16, 17, 18, 19, 20, 22, 28, 40 px |
| `font-weight` | 53 deklaráció, 6 érték: 400, 500, 600, 650, 700, 750 |
| `line-height` / `letter-spacing` | 6 deklaráció 6 értékkel (1.05–1.5) / 6 deklaráció 4 értékkel |
| Térköz (`gap`, `padding`, `margin`) | 294 deklaráció, 343 px-érték, 0 tokennel; 25 különböző érték |
| Térközértékek | 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 30, 34, 40, 48, 50, 80, 96 px (és negatív margók: −1, −2, −4, −16, −18, −20) |
| 4 px-es rácson kívüli térköz | 113 / 343 (33%), az 1–2 px-es finomhangolás nélkül (3, 5, 6, 7, 9, 10, 14, 18, 22, 30, 34, 50 px) |
| `border-radius` | 70 deklaráció, ebből 24 tokennel (34%); 13 nyers px-érték (1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 16, 20, 22), valamint `999px` (8×) és `50%` (9×) |
| Vezérlőmagasság | 16 különböző: 18, 26, 28, 32, 34, 36, 38, 40, 42, 44, 48, 52, 56, 60 px (és `auto`, `min-height`) |
| `box-shadow` | 26 deklaráció; 5 egyedi mélységárnyék, mind egyszeri; az elválasztóvonal-trükk (`0 -1px 0 var(--border)`) 10× |
| `z-index` | 6 deklaráció, 5 érték (1, 10, 20, 40, 50; a 10 kétszer), dokumentálva csak egy megjegyzésben (414. sor) |
| Mozgás | 4 `transition`, 6 `@keyframes`; 8 időtartam (0,06; 0,12; 0,15; 0,18; 0,22; 0,25; 1; 1,6 s) és a grafikon 250 ms-a; 3 görbe |
| `prefers-reduced-motion` lefedettség | 3 / 6 animáció, 0 / 4 átmenet, a grafikon nem |
| Töréspontok | 12× `max-width: 720px`, 4× `900px`, 2× `600px`; 3× `hover: hover`, 1× `hover: none`, 1× `pointer: coarse`, 2× reduced-motion, 1× color-scheme |
| `:hover` szabály | 28, ebből 2 van `(hover: hover)` alatt |
| Kijelölt állapot (`.on`) | 16 szabály, legalább 7 különböző vizuális megoldással |
| Tónusszótár (rossz/figyelmeztető/info/jó) | 8 különböző módosítókészlet (lásd a [Névadás](#névadás) részt) |
| Inline stílus TSX-ben | 138 `style={{…}}` 17 fájlban; 36 flex-elrendezés, 50 csak margó, 9 `var()`-ral |
| Az alap `button` stílusát visszavonó szabály | 17 (keret és háttér), 8 `height: auto`, 3 `:active` nélkül, 4 átlátszó hover, 2 `:disabled` felülírás |
| Sortípus | 13 különböző `*-row` vagy sor jellegű komponens |
| Felhasználatlan osztály | 3 (`.btn`, `.empty-state`, `.empty-icon`) |
| Stílus nélküli osztálynév TSX-ben | 4 (`barcell`, `cat-form`, `rec-list`, `rec-main`) |
| Ikonkészlet a buildben | 213 KB Tabler CSS (a 243 KB-os CSS-csomagból) + 507 KB woff2, kb. 90 használt ikonra |

---

## Tokenek és beégetett értékek

### Szín

A CSS-ben a színek nagyrészt tokeneken mennek. A `:root`-on kívüli nyers színek:

| Sor | Érték | Szerep | Gond |
|---|---|---|---|
| 114, 239, 666 | `#fff` | Szöveg az akcentszínen (elsődleges gomb, **+** gomb, varázsló aktív lépése) | Sötét módban fehér a `#4a92e8`-on: 3,2:1. 14 px-es szövegnél ez AA alatt van (4,5:1 kell). Világosban 4,42:1, ez is épphogy alatta. |
| 172 | `color-mix(#000 22%)` | A `kbd` háttere a Rögzítés gombon | Nincs rá token |
| 376, 388, 597, 422 | `rgba(0,0,0,.18/.12/.16/.24)` | Toast, toast-számláló, menü, alsó lap árnyéka | 4 egyedi árnyék, sötét módban szinte láthatatlan |
| 417 | `rgba(0,0,0,.35)` | A réteg háttere | Nincs `--scrim` token |

A TSX-ben a szín három úton kerüli meg a tokeneket:
1. **Kategóriapaletta** (`src/domain/defaults.ts:5–6`): 13 rögzített hexa szín, mindkét témában ugyanaz. A `CatIcon` (`common.tsx:19`) a színt szövegszínnek és 12%-os háttérnek is használja (`${cat.color}1f`). Sötét felületen (`#1f1f1d`) négy szín 3:1 alatt van, ennyi kellene grafikus elemnek: `#6250d6` 2,86:1, `#8a5a2b` 2,81:1, `#4f6d8a` 3,06:1 (határeset), `#008300` 3,34:1 (határeset). Ez a `teljes/sotet/1440/04-elemzes.png` képen is látszik: a Ruházat és a Gyerekek ikonja alig válik el.
2. **Grafikon téma** (`Charts.tsx:18–23`): a [Grafikonok](#grafikonok-témája) részben.
3. **Tartalékszínek:** `#8a8983` (`Record.tsx:778`, `Analysis.tsx:372`) a `--text-3` világos értéke, sötétben is ez marad. `#888780` (`Charts.tsx:187`, `exportFormat.ts:198`) a paletta 11. eleme.

Inline `var()` 9 helyen van (pl. `Settings.tsx:138, 216, 256, 283`, `UnexpectedExpense.tsx:105`), ezek témahelyesek, de nem az osztályokon keresztül mennek.

**Tokenszintű kontraszt** (számolt értékek, a böngészős mérés az 1.1-ben):
- `--text-3` `#8a8983` fehéren 3,51:1, a `--bg`-n 3,22:1. Ez a token viszi a `.faint` és a `.section-title` szöveget (12 px, nagybetűs), a helyőrzőt és a grafikon tengelyfeliratait. AA-hoz kevés.
- `--warn` `#8f5d00` a `--warn-bg`-n 4,96:1, ez rendben van.

### Típus

- 114 `font-size` deklaráció, egyik sem tokenes. A 13 px-érték közül több csak 1 px-lel tér el a szomszédjától (11/12/13, 14/15/16, 17/18/19/20), ezek egyértelműen nem skálából jönnek. Egyszer szereplő értékek: 17 px (`.cat-icon`, 366), 40 px (`.empty-icon`, 503, felhasználatlan). A 19 px kétszer szerepel: `.todo-icon` 326 és `.hero-title` mobilon 347.
- A `body` 15 px (74), a mezők 14 px, érintőképernyőn 16 px (140–142). Az alapszöveg és a mező mérete tehát eszközönként máshogy viszonyul egymáshoz.
- A súly 6 értéket vesz fel. A 650 (6×) és a 750 (1×, `.hero-value` 279) csak változó betűtípussal jelenik meg pontosan. A `--font` sorában (25) az Apple rendszerbetűje változó, a Segoe UI és a Roboto tartalék viszont 600-ra vagy 700-ra kerekít, így Windowson és Androidon más lesz a hierarchia.
- A kiemelt számok négy, egymástól független stílusban élnek:
  - `.kpi .value`: 22 px / 600, mobilon 18 px (257, 408);
  - `.hero-stats dd`: 16 px / 650 (296);
  - `.where-total`: 18 px / 650 (734);
  - `.dev-diff`: 15 px / 650 (769).
- Két azonos „szekciócím” stílus van: `.quick-title` (437) és `.section-title` (507). Mindkettő 12 px / 600, nagybetűs, 0,04 em.
- A `clamp()` egyetlen helyen szerepel (`.hero-value`, 279). Folyékony típusskála nincs.

### Térköz

- 294 deklaráció, 343 érték, 25 különböző lépcső, token nélkül. A leggyakoribbak: 8 (gap 30×), 12 (gap 27×), 6 (gap 24×), 4 (padding 21×), 6 (padding 19×).
- A 6 és a 10 px nagyon gyakori (2 px-es rácsra épül). A 4 px-es rácson kívül esik az értékek 33%-a.
- A kártya belső térköze `16px 18px` (252), a KPI-é `14px 16px` (255), a hero-é `22px 24px` (274), a banneré `12px 16px` (352), az alsó lapé `12px 18px 18px` (422). Öt felület, öt különböző térköz.
- A sorok függőleges térköze 9 féle: 4, 5, 6, 8, 9, 10, 14 px és `6px 4px 6px 0`.
- Összefüggő mágikus számok:
  - a `.topbar` negatív margója (194, 404) kézzel követi a `.app-main` oldalsó térközét (216, 403);
  - a `.todo-sublist` 50 px-es bal margója (336) a 38 px-es ikon és a 12 px-es gap összege;
  - a `.goal-hint` 40 px-es margója (692) a 30 px-es ikon és a 10 px összege.
- Inline: 50 csak margós stílusobjektum (`marginTop: 6/8/12/16`, `margin: '10px 0 0'` stb.), főleg a `Settings.tsx`-ben (21) és az `Onboarding.tsx`-ben (19).

### Sugár

- Csak két token van: `--radius` 8 px és `--radius-lg` 12 px. A deklarációk 66%-a nyers.
- Néhány nyers érték éppen a token értéke: 12 px 3× (168, 185, 220), 8 px 1× (366). Ezek tokenes helyek lehetnének.
- Az ikoncsempéknél négy közeli sugár van: 8 (366), 9 (338), 10 (309), 11 (164, 325).
- A hero sugara mobilon nő (20 → 22 px, 275 → 346), miközben az alsó lapé 12 → 16 px. Nincs egységes logika arra, mikor nagyobb a sugár.
- A `.delta` 4 px-es sugárral (361) téglalap, a többi címke `999px`-es pirula.

### Árnyék és mélység

- 5 mélységárnyék, mind egyedi:
  - toast `0 8px 24px / .18` (376);
  - menü `0 8px 24px / .16` (597);
  - toast-számláló `0 4px 12px / .12` (388);
  - alsó lap `0 16px 48px / .24` (422);
  - **+** gomb színes árnyéka `0 4px 14px` (240).
- Mélységskála nincs, a sötét téma nem kap saját árnyékot (a fekete árnyék a `#161615`-ös háttéren nem látszik).
- A 20 tokenes `box-shadow` többsége nem mélység, hanem trükk: 10 elválasztóvonal (`0 -1px 0 var(--border)`), gyűrűk (476, 653, 795–797, 832) és a „ma” jelölő kontúrja (268, 287, 753).

### Z-index

Öt érték, skála nélkül:

| Érték | Elem | Sor |
|---|---|---|
| 1 | A hőtérkép ragadós első oszlopa | 778 |
| 10 | Telefonos fejléc | 190 |
| 10 | Legördülő menü | 595 |
| 20 | Alsó sáv | 225 |
| 40 | Réteg (alsó lap) | 416 |
| 50 | Toastok | 369 |

A menü és a fejléc ugyanazon a szinten van, a sorrendet a DOM dönti el. A rétegrendet egyedül a 414. sor megjegyzése írja le.

### Mozgás

- 8 időtartam (60–250 ms és 1–1,6 s), 3 görbe (`ease`, `ease-out`, `linear`), token nélkül.
- Két különböző belépő animáció ugyanarra a mozgásra: `toast-in` és `sheet-in` (390, 487), mindkettő 8 px felfelé, átlátszóságból, 0,18 s.
- A `prefers-reduced-motion` csak a szinkron pörgést (208) és az alsó lapot (498) kapcsolja ki. Nem kapcsolja ki:
  - a `toast-in`-t (377);
  - az 1,6 s-os `flash` kiemelést (399);
  - a gombok `scale(0.98)`-ját (112);
  - a sáv szélességének átmenetét (263);
  - a `.chev` forgatást (522);
  - a Chart.js 250 ms-os animációját (`Charts.tsx:29`).

---

## Töréspontok

25 `@media` blokk, ebből 18 szélességfüggő. Mind `max-width`, asztali gépről lefelé épülnek, komponensenként szétszórva.

| Sor | Feltétel | Mit változtat |
|---|---|---|
| 36 | `prefers-color-scheme: dark` | Sötét tokenek |
| 140 | `pointer: coarse`, `max-width: 720px` | Mezők 16 px-re (iOS-nagyítás ellen) |
| 208 | `prefers-reduced-motion` | Szinkron ikon pörgése ki |
| 213 | ≤ 900 | **Keret:** oldalsáv helyett fejléc és alsó sáv, `.app-main` 20 px, a mentés gombja csak ikon |
| 345 | ≤ 720 | Hero térköze és sugara (22 px), `.hero-title` 19 px, teendőgombok 40 px |
| 391 | ≤ 900 | Toastok az alsó sáv fölé (84 px) |
| 394 | ≤ 720 | Nyitott alsó lapnál a toastok felülre |
| 402 | ≤ 720 | `.app-main` 16 px, fejléc, `.grid-2` egy oszlop, `.kpis` két oszlop, KPI 18 px, időszakjelvény elrejtve |
| 475 | `hover: hover` | Gyorsrögzítő chip Enter-célja |
| 478 | `hover: none` | Billentyűtipp elrejtve |
| 489 | ≤ 720 | **Réteg:** középre igazított panelből alsó lap |
| 498 | `prefers-reduced-motion` | Alsó lap animációja ki |
| 525 | ≤ 720 | `.list-row` két oszlop |
| 543 | `hover: hover` | Pipagyűrű hover |
| 560 | `hover: hover` | Keret fejlécének hovere |
| 612 | ≤ 720 | Rögzítés: 36–40 px-es célok, 16 px-es mező |
| 633 | ≤ 900 | Tervező egy oszlop, összesítő felülre |
| 637 | ≤ 720 | `.plan-row` két oszlop, csúszka külön sorban |
| 654 | ≤ 720 | `.cat-row` két oszlop |
| 675 | ≤ 600 | Első indítás: `.ob-row` oszlopai, csoportnév elrejtve |
| 708 | ≤ 720 | Hibaképernyő margója |
| 722 | ≤ 600 | Első indítás: `.ob-row.ob-past` |
| 811 | ≤ 720 | Elemzés: keresőmező 16 px, hőtérkép első oszlopa, szegmentált vezérlő teljes szélességen |
| 852 | ≤ 900 | Számlanaptár egy oszlop |
| 855 | ≤ 720 | `.cal-row` oszlopai |

**Ütközések és duplikációk:**
1. **A keret és a réteg máshol vált.** A navigáció 900 px-nél vált, az alsó lap 720 px-nél. 721 és 900 px között alsó sáv van, a gyorsrögzítő viszont 12 vh-ról induló, középre igazított panel (`teljes/vilagos/768/10-gyorsrogzito.png`). A toastok elhelyezése ugyanígy két blokkban él (391, 394).
2. **Rejtett töréspontok az `auto-fit` rácsokban.** A `.grid-2` `minmax(420px, 1fr)` (259) az oldalsáv (232 px) és a `clamp(20px, 3vw, 40px)` térköz mellett **kb. 1160 px alatt** egy oszlopra esik. 900 és 1160 px között tehát asztali keret jár egyoszlopos tartalommal. A `.kpis` (190 px, 254), a `.form-grid` (200 px, 647) és a `.hero-stats` (96 px, 292) ugyanígy saját, nem dokumentált töréspontot visz.
3. **A Tervező 901 px-en.** A `.planner` rögzített 360 px-es oldalsávja (622) miatt 901 px-es ablakban a főoszlop kb. **239 px** széles. Ez keskenyebb, mint telefonon. A Számlanaptár `.cal-layout` két egyforma oszlopa (821) ugyanitt kb. 300 px-es.
4. **A 16 px-es mezőszabály négyszer szerepel** (141, 442, 617, 812). A 141-es szelektorlista a `type="search"`-et nem tartalmazza (`Analysis.tsx:327`). A keresőmező 15 px (805), és csak ≤ 720 px-en kap 16 px-t (812). 720 px feletti érintőképernyőn (iPad) az iOS ezért ránagyít.
5. **A `600px` csak az Első indításban szerepel** (675, 722). Harmadik érték, a keret logikájától függetlenül.
6. **A hover védelme hiányos.** 28 `:hover` szabályból 2 van `(hover: hover)` alatt (544, 561), ezért érintésre a többi „beragadhat”. A 475-ös és a 478-as blokk jó minta, de nem általános.
7. **Elavult értékek az asztali fejléc megszűnése után** (`8385a4f`):
   - `.planner-side { top: 72px }` (623): asztalon már nincs fejléc, amihez igazodna;
   - a `.app-main` alsó 96 px-es térköze (154) asztalon is megmarad, pedig ott nincs alsó sáv.
8. 768 és 1100 px között nincs saját elrendezés. A DESIGN_TERV „nyúlt telefon” problémája a 2. és 3. pont következménye.

---

## Hiányzó token-kategóriák

| Kategória | Állapot | Bizonyíték |
|---|---|---|
| Térközskála | Hiányzik | 294 deklaráció, 25 érték, 0 token |
| Típusskála (méret, súly, sormagasság, betűköz) | Hiányzik | 114 + 53 + 6 + 6 deklaráció, 0 token |
| Ikonméret | Hiányzik | 10 érték |
| Vezérlőméret (magasság, érintési cél) | Hiányzik | 16 magasság; az alap gomb 34 px, a `sm` 28 px, mindkettő a 44 px-es érintési cél alatt |
| Sugár | Részleges | 2 token, 13 nyers érték |
| Mélység (árnyék) | Hiányzik | 5 egyedi árnyék |
| Mozgás (időtartam, görbe) | Hiányzik | 8 időtartam, 3 görbe |
| Z-rétegek | Hiányzik | 5 érték, egy ütközéssel |
| Fedőréteg (`scrim`), fókuszgyűrű | Hiányzik | `rgba(0,0,0,.35)` (417); a fókusz `2px solid var(--accent)` 5 helyen kézzel (113, 458, 774, 804) |
| Elrendezés (oldalsáv-szélesség, tartalom-maximum, margó, alsó sáv magassága) | Hiányzik | 232 px (153), 1200 px (154), 84 px (392), 96 px (154, 216, 403), 360 px (622) |
| Adatvizualizáció (sorozatszínek, rács, tengely, nulla vonal) | Kódban, nem tokenben | `Charts.tsx:21–22`, `defaults.ts:5–6` |
| Futásidejű változó | Nem deklarált | `--kb` (493–494) csak a `Sheet.tsx`-ben kap értéket, alapértelmezés nélkül a `:root`-on |

## Névadás

**Tokenek:**
- **Sorszámos nevek:** `--surface-2/-3`, `--text-2/-3`. A név nem mondja meg a szerepet (süllyesztett, emelt, halvány, másodlagos). A `--surface-2` 29 helyen hover-háttér, kijelölt háttér és sávalap is egyszerre.
- **Következetlen tónushármasok:**

  | Tónus | Tokenek |
  |---|---|
  | `accent` | alap, `-bg`, `-text` |
  | `success` | alap, `-bg` (nincs `-fill`, az alap viszi a kitöltést is, 548) |
  | `warn` | alap, `-bg`, `-fill` |
  | `danger` | alap, `-bg`, `-fill` |

  A `--warn` és a `--danger` szövegszín, az `--accent` viszont kitöltés. Ugyanaz a névminta tehát mást jelent.
- **Komponenstokenek a globális térben:** a `--hero-*` (6 token) a rendszertokenek között van. A `--hero-accent` türkiz (`#7fd4c4`), semmi köze az `--accent`-hez.
- **Felhasználatlan:** a `--grid` (24, 56) sehol nincs használva. A grafikon a saját, eltérő másolatát használja.
- A meglévő tokenek nem jelölik a kategóriát (nincs `--color-` vagy `--space-` előtag), így egy bővülő készletben nehezen kereshetők.

**Osztályok:**
- Nincs egységes konvenció. Keveredik:
  - az előtagos komponensnév (`rec-env-head`, `cover-opt-name`);
  - az általános segédosztály (`.small`, `.tiny`, `.muted`, `.faint`, `.num`, `.pos`, `.neg`, `.warn-text`);
  - a puszta módosító (`on`, `open`, `late`, `done`, `part`, `over`, `child`, `off`).
- **Képernyő-előtagú osztály közös komponensként:** a `.rec-name` (550) 5 fájlban (`Record`, `BillCalendar`, `Planner`, `Goals`, `Categories`), a `.rec-actions` (551) a `Categories.tsx`-ben is. A `.cal-main .rec-name` (850) már felül is írja.
- **8 tónusszótár ugyanarra a 4 jelentésre:**

  | Komponens | Módosítók |
  |---|---|
  | `.todo-icon` | `bad` / `warn` / `info` |
  | `.chip` | `ok` / `bad` / `warn` |
  | `.delta` | `up` / `down` / `good` |
  | `.hero-alert` | `fast` / `over` |
  | hőtérkép | `t-under` / `t-ok` / `t-over` / `t-way-over` / `t-unplanned` |
  | `.banner` | `info` / `warn` |
  | `.toast` | `error` |
  | `.backup` | `stale` / `sync.pending` / `sync.error` |

- **Névütközés:** a `.chip` (688) állapotcímke, a `.chip-btn` (470) választható kategória-chip, a `.chips` (469) a `.chip-btn` tárolója, a `.tag-chip` (807) gomb.

---

## Sötét mód lefedettsége

- **Csak rendszerbeállítás szerint vált.** A `:root:not([data-theme='light'])` (37) előkészíti a kézi témát, de a `data-theme`-et semmi nem állítja be. `[data-theme='dark']` blokk nincs, így rendszer szerinti világos témában nem lehetne sötétre váltani. A `FEJLESZTESI_TERV.md:174` kézi témaválasztója tehát félig van kész.
- **Nem újradefiniált színtokenek:**
  - `--warn-fill` `#eda100`, `--danger-fill` `#d03b3b`: sávok, naptárpöttyök, hőtérkép; sötét felületen is működnek, de nincsenek hangolva;
  - `--hero-accent`, `--hero-danger`.
- **A témát megkerülő színek:**
  - 3× `#fff` az akcentszínen (sötétben 3,2:1);
  - 5 fekete árnyék, sötétben láthatatlan;
  - a kategóriapaletta (13 szín, egy készlet mindkét témára);
  - a grafikon saját táblája;
  - két tartalékszín (`#8a8983`) a TSX-ben.
- **A hero szerepe megfordul.** A 26. sor megjegyzése szerint a hero „a képernyő egyetlen sötét felülete, mindkét témában”. Sötétben viszont a `--hero-bg` `#2e2e2a` világosabb, mint a `--surface` (`#1f1f1d`), így ott emelt kártya lesz belőle, nem kontrasztos sötét felület (`teljes/sotet/375/01-attekintes.png`).
- **Metaadatok:**
  - a `theme-color` egyetlen érték (`index.html:6`, `#2a78d6`), nincs `media="(prefers-color-scheme: dark)"` változat;
  - a manifest `background_color` `#f7f7f5` (`vite.config.ts:19`), ez eltér a `--bg` `#f6f5f1` értékétől.

---

## Komponensleltár

A pontszám (0–10) azt méri, mennyire teljes és következetes a komponens: változatok, állapotok, tokenhasználat, egyetlen megvalósítás.

| Komponens | Hol (sor) | Változatok | Megvan | Hiányzik vagy következetlen | Pont |
|---|---|---|---|---|---|
| Gomb | `button, .btn` 94–125, `button.link` 481 | alap, `primary`, `success`, `danger`, `ghost`, `link`, `icon`, `sm` | hover, `focus-visible`, `active`, `disabled` | **Betöltés:** az `aria-busy` 7 helyen szerepel, vizuális jele nincs. A `primary` hovere `filter: brightness`, a többié háttércsere. A `disabled` `opacity .4`, kétszer visszavonva (306, 830). Az `active` háromszor kikapcsolva (570, 741, 766). 16 magasság. Az alap 34 px. A `.btn` osztály nincs használva. | 6 |
| Mező | 127–146 | `text`, `number`, `date`, `password`, `select`, `sm`, range, checkbox | `focus-visible`, helyőrző | **Hiba:** az `aria-invalid` 5 helyen szerepel, stílusa nincs, csak a `.error` szöveg alatta (23×). **Tiltott** állapot nincs. A `type="search"` kimarad a szelektorból. A `.search-box` saját fókuszt kap (`:focus-within`, 804). | 4 |
| Szegmentált vezérlő | `.seg` 148–150, 440, 814 | 1 | kijelölt (`.on`), `aria-pressed` | 3 méret (26, 32, 36 px), a gombok 6 px-es sugara nem token | 6 |
| Címke, jelvény, chip | `.pill` 357, `.chip` 688, `.due` 552, `.delta` 361, `.period-badge` 249, `.todos-count` 317, `.side-badge` 182, `.dot` 664, `.chip-btn` 470, `.tag-chip` 807 | 10 külön osztály | — | A `.chip` és a `.due` deklarációi azonosak. A `.chip-btn` és a `.tag-chip` szinte azonos. Három méret (11, 12, 14–15 px). A `.delta` sugara 4 px, a többié 999 px. | 3 |
| Sáv | `.bar` 262, `.hero .bar` 285, `.where-bar` 747; jelölő: `.bar-today` 266, `.wb-plan` 753 | 3 megvalósítás | „ma” jelölő, tónusok | A tónusszín inline megy (`common.tsx:27–34`, `TONE`), nem módosító osztállyal. Magasság: 8/10/10 px, sugár 4/5/5 px. A két jelölő szinte azonos. | 5 |
| Sor | `.list-row` 509, `.rec-row` 533, `.rec-env-head` 556, `.plan-row` 624, `.cat-row` 643, `.goal-row` 681, `.recent-row` 606, `.cal-row` 842, `.where-row` 737, `.dev-main` 762, `.todo` 322, `.ob-row` 668, `.search-row` 809 | 13 sortípus | hover 6 típuson | Az elválasztó (`+ … box-shadow`) 10× ismétlődik. 9 féle függőleges térköz. A `role="button"` sorok (`Dashboard.tsx:263`, `Goals.tsx:23`) nem kapnak `:focus-visible` stílust, ott a böngésző alapértelmezése látszik. Mindegyik saját oszloprácsot ad meg (44/30/64/52/124/220/360 px). | 3 |
| Kártya és felület | `.card` 252, `.kpi` 255, `.hero` 273, `.banner` 352, `.hero-alert` 299, `.side-alert` 185; belső panelek: `.cover-note` 465, `.goal-inline` 697, `.import-preview` 658, `.fee-suggest` 577 | 6 felület + 4 belső panel | — | 5 különböző térköz, sugár 8/12/16/20/22 px. A belső panelek 4 változata ugyanaz a minta (`surface-2`, 8 px). | 5 |
| KPI és kiemelt szám | `Kpi` (`common.tsx:57`), `.kpi` 255–258, `.hero-stats` 291–297, `.where-total` 734, `.dev-diff` 769 | 4 | — | 4 számstílus típustoken nélkül. A `.kpi .value` mobilon 22 → 18 px, a hero-é `clamp()`. | 4 |
| Alsó lap és panel | `.sheet-layer` 415, `.sheet` 419, mobil 489–497, `.sheet-menu` 426 | panel (asztal) és alsó lap (mobil) | animáció, reduced-motion, billentyűzetkövetés (`--kb`), safe-area | A fedőréteg nyers `rgba`. A sugár 12 → 16 px. A váltás 720 px-nél van, a navigációé 900-nál. | 8 |
| Toast | 368–397 | alap (fordított), `error` | visszavonás gomb, várakozósor, `aria-live` | Nincs `success` és `info` tónus. A `toast-in` nincs reduced-motion alatt. Az árnyék nyers. | 7 |
| Banner | 352–355 | `info`, `warn` | — | Nincs `danger` és `success`. Nincs egységes ikonhely és művelethely (a `.grow` csak itt létezik). 8 használat. | 5 |
| Menü | `.menu` 594–601 | 1 | hover, `focus-visible` | A z-index megegyezik a fejlécével. Az árnyék nyers. | 6 |
| Üres állapot | `.empty-state` 502–504 | — | — | **A komponens nincs használva.** Az üres állapotok alkalmi `<p className="small muted" style={{margin…}}>` elemek (pl. `Analysis.tsx:351`), illetve `.cover-empty` (467) és `.todos-ok` (341). | 1 |
| Váz (skeleton) és betöltés | — | — | — | Nincs. Az `App.tsx:80` betöltés közben `null`-t renderel. | 0 |
| Ikoncsempe | `.cat-icon` 366, `.todo-icon` 324, `.todo-sublist .todo-icon` 338, `.hero-alert-icon` 308, `.side-logo` 163, `.chip-btn .cat-icon` 472, `.list-row.child .cat-icon` 521 | 7 méret- és sugárpár | — | 24/30/36/38 px, sugár 8/9/10/11 px és 50% | 3 |
| Kijelölt állapot (`.on`) | 150, 181, 236, 430, 456, 476, 548, 651, 653, 665, 718, 777, 833 | — | — | Legalább 7 megoldás: akcent háttér és szöveg (`.seg`, `.sheet-menu`, `.icon-pick`, `.cal-day`); `surface-2` és félkövér (`.side-nav`); csak szövegszín (`.tabbar`); akcent keret és háttér (`.cover-opt`, `.start-choice`); belső gyűrű (`.chip-btn`); zöld kitöltés (`.check-btn`); dupla gyűrű (`.swatch`). Ehhez hol `aria-pressed` (4), hol `aria-current` (3), hol `aria-checked` (4) tartozik, hol semmi. | 3 |

**Elrendezési primitívek hiánya:** a 138 inline stílusból 36 ugyanaz a „vízszintes sor, középre igazítva, résszel” minta (`display: 'flex', alignItems: 'center', gap: 8`, pl. `Record.tsx:272`, `BillCalendar.tsx:174`, `ErrorBoundary.tsx:57`, `UnexpectedExpense.tsx:104`). 50 csak függőleges margót ad. Egy `stack` és egy `cluster` primitív (résskálával) a legtöbbet kiváltaná.

---

## Grafikonok témája

A `Charts.tsx` saját témaobjektumot használ (`useChartTheme`, 18–23. sor), a CSS-tokenektől függetlenül:

| Kulcs | Világos | Megfelelő token | Sötét | Megfelelő token |
|---|---|---|---|---|
| `grid` | `#e9e7e1` | **eltér** a `--grid`-től (`#e3e1da`) | `#2e2e2b` | `--grid` (sötét) |
| `tick` | `#8a8983` | `--text-3` | `#8f8e86` | `--text-3` |
| `surface` | `#ffffff` | `--surface` | `#1f1f1d` | `--surface` |
| `accent` | `#2a78d6` | `--accent` | `#4a92e8` | `--accent` |
| `faint` | `#c3c2b7` | nincs (ez a sötét `--text-2` értéke) | `#7a7972` | nincs |
| `zero` | `#c3c2b7` | nincs | `#4a4945` | nincs |

**Problémák:**
1. **Kézi másolat.** 12 hexa érték kettőzi a tokeneket, egy már el is tért (`grid`). Minden színváltozást két helyen kell átvezetni.
2. **A téma forrása a `matchMedia`** (`useColorScheme`, `common.tsx:330–339`), nem a dokumentum. Kézi témánál (`data-theme`) a grafikon a rendszertémát követné, nem a választottat.
3. **Hexa átlátszóság szövegösszefűzéssel:** `${t.accent}14`, `${hex}59`, `${hex}b3`, `${s.color}40`, `${t.accent}80`, `${t.tick}40` (85, 196, 216, 260, 300, 311). OKLCH vagy `var()` értékkel ez nem működik. Az 5. fázis színtokenjeihez a `getComputedStyle` + `color-mix()` vagy egy átlátszósági segédfüggvény kell.
4. **Betűtípus és méret nincs beállítva.** Nincs `ChartJS.defaults.font`, így a tengelyfeliratok a Chart.js alapját használják („Helvetica Neue”, Helvetica, Arial, 12 px), nem a `--font` rendszerbetűt.
5. **Az eszköztipp (tooltip) témázatlan.** Mindkét témában a Chart.js alapértelmezett fekete doboza jelenik meg, sugara, térköze és betűje nem igazodik a toasthoz vagy a menühöz.
6. **A tengelyfeliratok ütköznek.** `autoSkip: false, maxRotation: 0` (40). 15–20 időszaknál a hónapnevek összefolynak („AugSzepOkt…”, `teljes/vilagos/1440/01-attekintes-teljes.png`, Futó egyenleg és Kiadások havonta).
7. **Az animáció nem követi a `prefers-reduced-motion`-t** (`animation: { duration: 250 }`, 29).
8. **A kategóriasorozatok a rögzített palettát használják**, témánkénti hangolás nélkül. A „Többi” színe beégetett (`#888780`, 187).
9. **A jelmagyarázat HTML-ben van, és ez jó irány** (`.tiny .muted`), de a mintái inline stílusok (24 a fájlban). A szaggatás mintája eltér a vonaltól: a jelmagyarázat `dotted`, az adatsor `borderDash: [2, 3]`.

---

## CSS-architektúra

- **Egy fájl, rétegek nélkül.** A sorrend: tokenek → alapelemek → vezérlők → elrendezés → Áttekintés → réteg → listák → képernyők (Rögzítés, Tervező, Kategóriák, Első indítás, Célok, Hibaképernyő, Közös használat, Elemzés, Számlanaptár). `@layer` nincs, a sorrend dönti el a kaszkádot.
- **Rossz helyre került szabályok:**
  - a „Hibaképernyő” blokkban (702–724) van a `.later-plans` (Tervező és Kategóriák), a `.start-choice` és az `.ob-row.ob-past` (Első indítás);
  - a `.plan-row.off-cycle` (859–860) a Számlanaptár után áll;
  - a Fedezet áthozása blokkban (446–488) vannak közös komponensek: `.chips`, `.chip-btn`, `button.link`, `.kbd-hint`, és három `@keyframes`;
  - a `.menu`, a `.pills` és a `.check-btn` a Rögzítés blokkjában van, a `.menu-wrap` viszont a `common.tsx`-ben használt közös elem;
  - a `.kpi .sub .kpi-line` (270) a sáv szabályai között áll.
- **Elemszelektor komponensként.** Az alap `button` (94) minden gombot gombbá formáz. Emiatt 17 szabály kapcsolja ki a keretet és a hátteret (pl. 120, 149, 231, 427, 536, 566, 590, 738, 763, 827, 844), 8 a magasságot (`height: auto`), 4 a hover hátterét, 3 az `:active` kicsinyítést. A „gombnak látszó” és a „gombként viselkedő” elem nincs szétválasztva.
- **Specifikussági trükkök** (`!important` nincs, ez jó):
  - `.app-main > .topbar` (188, 217) a `.topbar` ellen;
  - `.hero-alert.fast, .hero-alert.fast:hover` (303–304) a `button:hover` ellen;
  - `.tabbar > .tab-plus:hover` (242) a `.tabbar > button:hover` ellen;
  - `.hero p.hero-ok` (289) a `.hero p` ellen;
  - `.sumlist dd.total.pos` (631);
  - `.list-row:hover, .list-row:hover + .list-row` (515), `.goal-row:hover + .goal-row` (685): az elválasztó trükk mellékhatása.
- **Töréspontok komponensenként.** 18 szélességi blokk, képernyőnként saját ≤ 720 px-es blokkal. Egy elrendezési osztály módosítása 12 helyen jár.
- **Ismétlődő deklarációk:**
  - `.backup.stale` = `.backup.sync.pending` (200, 204);
  - `.chip` = `.due` (688, 552);
  - `.wb-savings` = `.lg-savings` (752, 758);
  - `.quick-title` ≈ `.section-title` (437, 507);
  - `.cover-opt.on` = `.start-choice .choice.on` (456, 718);
  - `.bar-today` ≈ `.wb-plan` (266, 753);
  - a 16 px-es mezőszabály 4× (141, 442, 617, 812).
- **Halott és árva osztályok:**
  - CSS-ben van, a forrásban nincs: `.btn` (94), `.empty-state` és `.empty-icon` (502–503);
  - TSX-ben van, stílusa nincs: `barcell` (`Dashboard.tsx:276`), `cat-form` (`Categories.tsx:294`), `rec-list` (`Record.tsx:277`), `rec-main` (`Record.tsx:447`). Ezek lehetnek szándékos horgok, de nincs mögöttük szabály.
- **Az ikonkészlet súlya.** A teljes Tabler webfont be van töltve (`main.tsx:4`): 213 KB CSS és 507 KB woff2, kb. 90 használt ikonra. Ez a PWA első betöltésének nagyobbik része, és a gyorsítótárba is bekerül.

---

## Megállapítások

| ID | Súlyosság | Terület | Megállapítás | Bizonyíték | Javaslat az 5. fázishoz |
|---|---|---|---|---|---|
| DR1 | Kritikus | Tokenek | Méret-, térköz-, típus-, mélység-, mozgás- és z-tokenek egyáltalán nincsenek. 0 token 114 betűméret-, 294 térköz-, 6 z-index-, 12 mozgásdeklarációban. | `styles.css` 1–34; a Számokban tábla | Az első lépés a skálák bevezetése (lásd a tokenjavaslatot) és a meglévő értékek leképezése a legközelebbi lépcsőre, eltérési listával. Csak utána jöhet a látható változás. |
| DR2 | Magas | Elrendezés | Rejtett töréspontok. A `.grid-2` kb. 1160 px alatt egy oszlop. A Tervező főoszlopa 901 px-en kb. 239 px, a naptár két oszlopa kb. 300 px. Asztali keret jár keskeny, „nyúlt telefon” tartalommal. | 259, 622, 821; 213 (900 px) | Három elrendezési osztály (kompakt, közepes, széles) egy helyen. A kártyák és sorok `@container`-rel igazodjanak. Az oldalsáv a széles osztályba kerüljön, a közepesbe navigációs sín. |
| DR3 | Magas | Grafikon | Párhuzamos, kézzel másolt színtábla. Egy érték már eltér (`grid`). A téma a `matchMedia`-ból jön, a hexa átlátszóság szövegösszefűzés, a betűtípus nincs beállítva. | `Charts.tsx:18–23, 29, 40, 85, 196, 216, 300, 311`; `common.tsx:330` | A grafikonszínek a CSS-tokenekből jöjjenek (`getComputedStyle` a dokumentumon), a téma változását `MutationObserver` vagy kontextus jelezze. Kell `ChartJS.defaults.font = var(--font)`, témázott tooltip és `autoSkip`. |
| DR4 | Magas | Akadálymentesség és szín | Sötét módban a fehér szöveg az akcentszínen 3,2:1. A kategóriapaletta 4 színe 3:1 körül vagy alatta van sötét felületen. A `--text-3` szövegszínként 3,5:1. | 114, 239, 666; `defaults.ts:5–6`; `common.tsx:19`; 7 (`--text-3`) | Témánként külön `on-accent` token, témánként hangolt kategóriapaletta (OKLCH-ban azonos világosság). A `--text-3` csak díszítésre maradjon, szövegre legyen egy AA-s „subtle” szint. |
| DR5 | Magas | Komponensek | Duplikált minták: 13 sortípus, 10 címke- és jelvényváltozat, 3 sáv, 7 ikoncsempe, 4 belső panel, 4 számstílus. | Komponensleltár tábla | Közös komponensek: `Row` (sűrűség, elválasztó, kattintható változat), `Badge` (tónus, méret), `Meter`, `IconTile` (sm/md/lg), `Inset`, `Stat`. Mindegyik tokenekkel és egyetlen CSS-szabállyal. |
| DR6 | Magas | Komponensállapotok | Nincs betöltési (az `aria-busy` 7×, stílus nélkül), mezőhibás (az `aria-invalid` 5×, stílus nélkül) és tiltott mező állapot. A `role="button"` sorokon nincs fókuszstílus. 26/28 `:hover` védelem nélkül. | 111–113; `Dashboard.tsx:263`; `Goals.tsx:23`; a `:hover` sorok | Állapotmátrix minden komponensre (alap, hover, fókusz, aktív, tiltott, betöltés, hiba). A hover `(hover: hover)` alá kerüljön. Egységes `:focus-visible` gyűrű token (`[role=button]`, `[tabindex]` is). |
| DR7 | Magas | CSS-architektúra | Az alap `button` elemszelektor minden gombot formáz. 17 + 8 + 4 + 3 + 2 szabály vonja vissza. | 94–125, a felsorolt visszavonó sorok | `button` csak alaphelyzetbe állítva. A látható gomb a `.btn` (változatok, méretek) legyen, a „gombként viselkedő” sor, csempe és chip külön komponens. |
| DR8 | Közepes | Töréspontok | 720 és 900 px két külön logika: 721–900 között alsó sáv és középső panel. A toast két blokkban él, a 600 px csak az Első indításban. | 213, 391, 394, 489, 675, 722 | Három osztály (< 640, 640–1024, > 1024) egyetlen helyen definiálva. A réteg formája és a navigáció ugyanannál a határnál váltson. |
| DR9 | Közepes | Mezők | A 16 px-es mezőszabály 4× szerepel, és a `type="search"` kimarad belőle. 720 px feletti érintőképernyőn az iOS ránagyít a keresőre. | 141, 442, 617, 805, 812; `Analysis.tsx:327` | Egy `--control-font` token, ami `pointer: coarse` alatt 16 px. A mezőszelektor legyen osztály (`.field-input`) vagy `input:not([type=checkbox]…)`. |
| DR10 | Közepes | Kijelölés és tónus | A kijelölt állapotnak legalább 7 megjelenése van. 8 tónusszótár él ugyanarra a 4 jelentésre. | `.on` sorai; Névadás rész | Egy `selected` minta két fokozattal (erős, finom), ARIA-attribútumhoz kötve (`[aria-pressed=true]`, `[aria-current]`). Egy tónuskészlet: `neutral`, `info`, `success`, `warning`, `danger`. |
| DR11 | Közepes | Token-névadás | Sorszámos nevek (`-2/-3`), következetlen tónushármasok, komponenstokenek (`--hero-*`) a globális térben, felhasználatlan `--grid`, deklarálatlan `--kb`. | 1–34, 493 | Két szint: primitív skálák és szemantikus szerepek (`--color-text-muted`, `--color-surface-raised`). Minden tónus ugyanazt a négy tagot kapja (`fg`, `bg`, `fill`, `border`). A hero helyett `inverse` felület. |
| DR12 | Közepes | Sötét mód | Csak rendszerbeállításra vált. A `data-theme='light'` kizárás kész, a `dark` blokk hiányzik. 4 színtoken nincs újradefiniálva. A hero sötétben emelt kártyává válik. A `theme-color` egyetlen érték, a manifest háttere eltér. | 36–63; `index.html:6`; `vite.config.ts:19` | A tokenek egyszer, `[data-theme]` szelektorral, és a rendszertémához egy `@media` blokkal. Két `theme-color` meta. A hero szerepe döntés a 4. fázisban. |
| DR13 | Közepes | Inline stílusok | 138 inline stílus, ebből 36 flex-sor és 50 margó. Elrendezési primitív nincs. | `Settings.tsx` 21, `Onboarding.tsx` 19, `Charts.tsx` 24 | `stack` és `cluster` primitív résskálával. Az inline stílus csak adatfüggő érték maradjon (szélesség, kategóriaszín). |
| DR14 | Közepes | Üres állapot és betöltés | Az `.empty-state` komponens kész, de nincs használva. Az üres állapotok alkalmi bekezdések. Váz és betöltési jelzés nincs. | 502–504; `Analysis.tsx:351`; `Cover.tsx:102`; `App.tsx:80` | `EmptyState` (ikon, cím, szöveg, művelet) és `Skeleton` komponens a leltárba. A szövegük az 1.5-ös szövegaudit alapján készüljön. |
| DR15 | Közepes | Típus | 13 betűméret 1 px-es lépésekkel, 6 súly (a 650 és a 750 tartalék betűvel kerekít), 4 független számstílus, `clamp()` csak egyszer. | Számokban; 279, 296, 734, 769 | Folyékony típusskála kb. 7 lépcsővel, 4 súllyal, 3 sormagassággal. A számstílus egy `Stat` komponens méretváltozatokkal. |
| DR16 | Közepes | Mozgás | 8 időtartam, 3 görbe. Két egyforma belépő animáció. A reduced-motion 3 animációt kapcsol ki a 6-ból, átmenetet egyet sem, a grafikont sem. | 108, 263, 377, 390, 399, 487, 522; `Charts.tsx:29` | 4 időtartam- és 3 görbetoken. Egy általános reduced-motion szabály, ami a tokeneket nullázza. |
| DR17 | Közepes | Sugár és mélység | 2 sugártoken mellett 13 nyers érték. A hero mobilon nagyobb sugarat kap. 5 egyedi árnyék, sötétben láthatatlan. | Számokban; 275, 346, 376, 388, 422, 597 | Sugárskála 6 lépcsővel és `full`. Mélységskála 4 szinttel, témánként (sötétben világosabb felület és finomabb árnyék). |
| DR18 | Közepes | Grafikon | A tengelyfeliratok ütköznek (`autoSkip: false`), a tooltip témázatlan, a „Többi” színe beégetett. | `Charts.tsx:40, 187`; `teljes/vilagos/1440/01-attekintes-teljes.png` | Felirat-ritkítás a szélesség szerint (vagy negyedéves címkék), tooltip a menütokenekkel, adatvizualizációs tokenek (`--chart-1…8`, `--chart-grid`, `--chart-axis`). |
| DR19 | Közepes | Teljesítmény | A teljes Tabler webfont (213 KB CSS + 507 KB woff2) kb. 90 ikonért töltődik be. | `main.tsx:4`; `dist/assets` | Részhalmaz-font vagy SVG-ikonok (`@tabler/icons-react` fa-rázással). A döntés a 4. fázis ikonirányától függ. |
| DR20 | Alacsony | CSS-architektúra | Rossz helyre került szabályok, képernyő-előtagú osztályok közös komponensként (`.rec-name` 5 fájlban). | 446–488, 702–724, 859–860, 550 | `@layer reset, tokens, base, layout, components, screens, utilities`. Közös komponensek képernyő-előtag nélkül. |
| DR21 | Alacsony | Ismétlődés | Hat azonos vagy szinte azonos szabálypár, és négyszer ugyanaz a mezőszabály. | 200/204, 552/688, 752/758, 437/507, 456/718, 266/753 | Összevonás a komponensek kialakításakor. |
| DR22 | Alacsony | Halott kód | 3 felhasználatlan osztály, 4 stílus nélküli osztálynév a TSX-ben. | 94, 502–503; `Dashboard.tsx:276`, `Categories.tsx:294`, `Record.tsx:277, 447` | Törlés, vagy szándékos horog esetén dokumentálás. |
| DR23 | Alacsony | Elavult értékek | A `top: 72px` és az asztali 96 px-es alsó térköz az asztali fejléc megszűnése óta fölösleges. A fejléc negatív margója kézzel követi a tartalom térközét. | 154, 194, 216, 403–404, 623 | `--gutter` és `--tabbar-h` token, a fejléc margója ebből számolva. Az asztali alsó térköz a kompakt osztályhoz kötve. |
| DR24 | Alacsony | Z-rétegek | Skála nélküli z-index. A menü és a fejléc ugyanazon a szinten van (10). | 190, 595, 225, 416, 369 | Z-réteg tokenek, a fejléc és a menü külön szinten. |

---

## Tokenjavaslat vázlata (5. fázis)

Csak kategóriák és lépcsők. A konkrét színeket és a karaktert a 4. fázis esztétikai iránya adja meg. A cél: a mai értékek mindegyike leképezhető legyen egy lépcsőre, és a leképezés eltérése legfeljebb 2 px vagy egy súlyfokozat legyen.

### Szín (OKLCH, két szint)

- **Primitív skálák:**
  - `neutral`, `accent`, `success`, `warning`, `danger`, 11 lépcsővel (50, 100 … 900, 950), egyenletes világossággal;
  - opcionálisan egy második, kiegészítő árnyalat, ha a 4. fázis ezt kéri.
- **Szemantikus szerepek (témánként):**
  - háttér és felület: `bg`, `surface`, `surface-raised`, `surface-sunken`, `surface-inverse`, `scrim`;
  - szöveg: `text`, `text-muted`, `text-subtle` (AA-s), `text-disabled`, `text-inverse`;
  - keret és fókusz: `border`, `border-strong`, `focus-ring`;
  - tónusonként (`accent`, `info`, `success`, `warning`, `danger`): `-fg`, `-bg`, `-fill`, `-border`, `on-…`.
- **Adatvizualizáció:**
  - `chart-1` … `chart-8` és `chart-other`;
  - `chart-grid`, `chart-axis`, `chart-zero`;
  - kategóriapaletta 13 helyen, témánként hangolva, azonos világossággal.
- **Átlátszóság:** `color-mix()`-szel a tokenből, nem hexa összefűzéssel.

### Térköz (4 px alap)

| Lépcső | Érték |
|---|---|
| `0` | 0 |
| `px` | 1 px |
| `0.5` | 2 |
| `1` | 4 |
| `1.5` | 6 |
| `2` | 8 |
| `3` | 12 |
| `4` | 16 |
| `5` | 20 |
| `6` | 24 |
| `8` | 32 |
| `10` | 40 |
| `12` | 48 |
| `16` | 64 |

A mai 10, 14, 18 és 22 px a szomszédos lépcsőre kerül (eltérési lista kell). Folyékony oldalmargó: `--gutter` `clamp()`-pel.

### Típus (folyékony, `clamp()`)

- **Méret:** 7 lépcső:

  | Token | Mai érték kb. |
  |---|---|
  | `xs` | 11–12 |
  | `sm` | 13 |
  | `base` | 15 |
  | `md` | 16, a mezőknek |
  | `lg` | 18–20 |
  | `xl` | 22 |
  | `2xl` | 28 |

  Ehhez jön egy `display` lépcső (kb. 36–52) a hero összegének.
- **Súly:** `regular` 400, `medium` 500, `semibold` 600, `bold` 700. A 650 és a 750 csak akkor marad, ha a 4. fázis változó betűtípust választ.
- **Sormagasság:** `tight` (kb. 1,1), `snug` (kb. 1,3), `normal` (1,5).
- **Betűköz:** `tight`, `tighter` (címek és nagy számok), `caps` (nagybetűs szekciócím).
- **Számok:** `tabular-nums` alapértelmezésként a `Stat` és az összeg komponensekben.

### Méret

- **Ikon:** `sm` 16, `md` 20, `lg` 24, és egy `display` lépcső (28/40) az üres állapotnak.
- **Vezérlő:** `sm` 32, `md` 40, `lg` 48. `pointer: coarse` alatt az érintési cél legalább 44 px.
- **Ikoncsempe:** `sm` 24, `md` 32, `lg` 40.
- **Sáv vastagsága:** `thin`, `regular`.

### Sugár

`xs` 4, `sm` 6, `md` 8, `lg` 12, `xl` 16, `2xl` 20–24, `full`.

### Mélység

| Szint | Mire |
|---|---|
| `0` | Lapos |
| `1` | Kártya, emelt |
| `2` | Menü, legördülő |
| `3` | Alsó lap, panel |
| `4` | Toast |

Témánként két összetevő: árnyék, és sötétben a felület világosítása. Ehhez jön egy külön `focus` gyűrű.

### Mozgás

- **Időtartam:**

  | Token | Érték kb. | Mire |
  |---|---|---|
  | `instant` | 80 ms | Nyomás |
  | `fast` | 120 ms | Hover, szín |
  | `base` | 180 ms | Belépés |
  | `slow` | 240 ms | Alsó lap, sáv |

  Ehhez jön egy `emphasis` minta (a mai 1,6 s-os kiemelés).
- **Görbe:** `standard`, `enter` (lassuló), `exit` (gyorsuló).
- **Reduced-motion:** egy szabály, ami az időtartamokat 0-ra állítja, és a grafikon is ezt olvassa.

### Z-rétegek

`base` 0, `sticky` 1 (táblázat), `header` 10, `dropdown` 20, `nav` 30, `overlay` 40, `toast` 50.

### Elrendezés

- **Osztályok:** kompakt (< 640), közepes (640–1024), széles (> 1024), egyetlen helyen definiálva.
- **Méretek:** `--sidebar-w`, `--rail-w`, `--content-max`, `--tabbar-h` (safe-area-val), `--gutter`.
- **Konténerméretek:** kártya- és sorszintű `@container` határok (kb. 360 és 560 px).

### Rétegek a CSS-ben

`@layer reset, tokens, base, layout, components, screens, utilities`. A tokenek külön fájlban, a komponensek és a képernyők külön szakaszban vagy fájlban.
