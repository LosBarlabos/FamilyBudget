# 5. fázis – Design-rendszer 2.0

A [DESIGN_TERV.md](../../DESIGN_TERV.md) 5. fázisa, a `design:design-system` módszerével.

**Bemenet:**
- a választott irány, az 1. Csekk ([04-irany.md](04-irany.md)), a Borítékok „utána marad” előnézetével és a Pénzfolyam idővonalával a Tervezőben;
- az 1.4-es audit tokenjavaslata és komponensleltára ([01-design-rendszer.md](01-design-rendszer.md));
- a 2. fázis munkacsomagjai: a CS6 (design-rendszer), a CS1 (keret), a CS10 (rétegek), a CS7 (grafikonok), a CS14 (téma).

## Elvek

1. **Egy érték, egy hely.** Szín, méret, térköz, sugár, mélység, mozgás és z-réteg csak tokenből jöhet. Inline stílus csak adatfüggő értékre (a sáv szélessége, a kategória színe).
2. **Szerep, nem szín.** A komponens a jelentést kéri (`--color-text-muted`, `--color-bill`), a téma adja hozzá a színt.
3. **Egy kijelölt állapot.** A kiválasztás mindig ARIA-attribútumhoz kötött (`aria-checked`, `aria-pressed`, `aria-current`), és két fokozata van: erős és finom.
4. **A konténer dönt, nem az ablak.** A sor, a kártya és a lista a saját szélességéhez igazodik (`@container`). Az ablak szélessége csak a keretet (navigáció, oszlopok) választja ki.
5. **Az akadálymentesség a komponensben van:** fókuszgyűrű, 44 px-es érintési cél `pointer: coarse` alatt, a hiba a mezőhöz kötve, a csökkentett mozgás tiszteletben tartva. Nem képernyőnként kell kitalálni.

## Tokenek

### Szín

**Eltérés a tervtől:** a primitív színek hexában maradnak, nem OKLCH-ban. A Chart.js a token színéből számol átlátszóságot (DR3), és az OKLCH-t nem tudja értelmezni. Az átlátszóság mindenhol `color-mix()`-szel készül. Az OKLCH-ra váltás akkor jöhet, ha a grafikonok már csak kész színeket kapnak.

**Szemantikus szerepek** (a Csekk iránya, a vázlatok értékei). A szövegszínek a saját hátterükön AA-ra ellenőrizve. A `--color-border-strong` vezérlőkeretként (WCAG 1.4.11, 3:1) az 5.B-ben ellenőrizendő:

| Token | Világos | Sötét | Mire |
|---|---|---|---|
| `--color-bg` | `#F4F6F9` | `#0E1525` | oldal háttere |
| `--color-surface` | `#FFFFFF` | `#172038` | kártya, lap |
| `--color-surface-sunken` | `#EEF1F6` | `#212C48` | belső panel, billentyű, sáv alapja |
| `--color-surface-inverse` | `#15233F` | `#0A101D` | oldalsáv, toast |
| `--color-text` | `#15233F` | `#EEF2F8` | szöveg |
| `--color-text-muted` | `#46536A` | `#BAC3D3` | másodlagos szöveg |
| `--color-text-subtle` | `#5A6679` | `#9AA5B8` | harmadlagos szöveg, AA-s (≥ 5,3:1) |
| `--color-text-inverse` | `#DCE4F2` | `#BAC3D3` | szöveg az inverz felületen |
| `--color-border` | `#DCE2EB` | `#2B3656` | elválasztó, mezőkeret |
| `--color-border-strong` | `#B9C3D2` | `#43507A` | vezérlő kerete |
| `--color-accent` | `#2346A8` | `#93B2FF` | elsődleges gomb, kijelölés, fókusz |
| `--color-on-accent` | `#FFFFFF` | `#0E1525` | felirat az accenten |
| `--color-accent-subtle` | `#E6ECF9` | `#1E2C52` | finom kijelölés |
| `--color-bill` | `#F2DD5C` | `#E6D25B` | a csekk: fizetendő számla |
| `--color-on-bill` | `#2B2600` | `#2B2600` | felirat a csekken |
| `--color-warn` | `#8F5300` | `#F2B45A` | figyelmeztető szöveg |
| `--color-warn-fill` | `#E39A1E` | `#E39A1E` | figyelmeztető sáv, csík |
| `--color-warn-subtle` | `#FBF0D6` | `#3B2E10` | figyelmeztető háttér |
| `--color-danger` | `#B42318` | `#FF8F85` | hiba, túllépés, mínusz |
| `--color-danger-subtle` | `#FBE9E8` | `#3D1D1B` | hibaháttér |
| `--color-ok` | `#1E7448` | `#72D3A2` | bevétel, kész |
| `--color-ok-subtle` | `#E5F3EA` | `#173326` | kész háttér |
| `--color-day` | `#C9D2E0` | `#33405F` | a hónapcsík jövőbeli napja |
| `--color-scrim` | `rgb(21 35 63 / .45)` | `rgb(0 0 0 / .6)` | rétegek alatti sötétítés |

**Grafikonok:** `--chart-1` … `--chart-8`, `--chart-other`, `--chart-grid`, `--chart-axis`, `--chart-zero`. A Chart.js `getComputedStyle`-lal olvassa őket, és a téma változásakor újrarajzol (CS7).

**Kategóriapaletta:** a mai 13 szín témánként hangolva, azonos világossággal. Sötét háttéren is legalább 3:1 (DR4), és nem lehet a figyelmeztető vagy a hiba színével összetéveszthető.

### Típus

| Token | Érték | Mire |
|---|---|---|
| `--font-display` | Barlow Condensed (600, 700), saját tárhelyről | címek, összegek |
| `--font-body` | IBM Plex Sans (400, 500, 600), saját tárhelyről | szöveg, vezérlők |
| `--text-xs` | 12 px | jelvény, tengelyfelirat |
| `--text-sm` | 13 px | alsor, segédszöveg |
| `--text-ui` | 14 px | vezérlők, sűrű sorok (a mai 17 helyen használt méret) |
| `--text-base` | 15 px | törzsszöveg |
| `--text-md` | 16 px | mezők (`pointer: coarse` alatt minden mező) |
| `--text-lg` | 18 px | kártyacím |
| `--text-xl` | `clamp(20px, 1.6vw + 14px, 26px)` | képernyőcím, szekciócím (display betűvel) |
| `--text-2xl` | `clamp(26px, 2.4vw + 16px, 40px)` | hónapnév a fejlécben |
| `--text-display` | `clamp(56px, 7vw + 24px, 112px)` | a hero összege |
| `--weight-regular` … `--weight-bold` | 400, 500, 600, 700 | a 650 és a 750 megszűnik |
| `--leading-tight` / `-snug` / `-normal` | 1,0 / 1,3 / 1,5 | |

A számok mindenhol `tabular-nums`-szal jelennek meg (a `Stat` és a `Money` komponensben alapértelmezés).

Az 5.A lépésben a típustokenek még a mai rögzített értékeket hordozzák (`--text-2xs` 11, `--text-xl` 20, `--text-2xl` 22, `--text-3xl` 28 px). A folyékony `clamp()` értékek és a display lépcső az 5.B-ben kerülnek a tokenekbe, így a változás egy helyen történik.

### Térköz, méret, sugár

- **Térköz (4 px alap):**

  | Token | Érték |
  |---|---|
  | `--space-0` | 0 |
  | `--space-0-5` | 2 px |
  | `--space-1` | 4 px |
  | `--space-1-5` | 6 px |
  | `--space-2` | 8 px |
  | `--space-3` | 12 px |
  | `--space-4` | 16 px |
  | `--space-5` | 20 px |
  | `--space-6` | 24 px |
  | `--space-8` | 32 px |
  | `--space-10` | 40 px |
  | `--space-12` | 48 px |
  | `--space-16` | 64 px |

  A folyékony oldalmargó: `--gutter: clamp(16px, 4vw, 48px)`.
- **Vezérlőmagasság:** `--control-sm` 32 px, `--control-md` 40 px, `--control-lg` 48 px. `pointer: coarse` alatt `--control-min` 44 px.
- **Ikon:** `--icon-sm` 16, `--icon-md` 20, `--icon-lg` 24. Ikoncsempe: `--tile-sm` 24, `--tile-md` 32, `--tile-lg` 40.
- **Sugár:**

  | Token | Érték |
  |---|---|
  | `--radius-xs` | 4 px |
  | `--radius-sm` | 6 px |
  | `--radius-md` | 10 px |
  | `--radius-lg` | 14 px |
  | `--radius-xl` | 20 px |
  | `--radius-full` | 999 px |

  A csekk aszimmetrikus sugara: `--radius-bill: 6px 14px 14px 6px`.

### Mélység, mozgás, z-rétegek

- **Mélység:**
  - `--elev-1`: kártya, csak keret;
  - `--elev-2`: menü;
  - `--elev-3`: alsó lap, panel;
  - `--elev-4`: toast.

  Sötét témában az árnyék helyett a felület világosodik.
- **Mozgás:**

  | Token | Érték |
  |---|---|
  | `--dur-instant` | 80 ms |
  | `--dur-fast` | 120 ms |
  | `--dur-base` | 180 ms |
  | `--dur-slow` | 240 ms |

  Görbék: `--ease-standard`, `--ease-enter`, `--ease-exit`. `prefers-reduced-motion` alatt minden időtartam 0, és a Chart.js animációja is kikapcsol.
- **Z-rétegek:**

  | Token | Érték |
  |---|---|
  | `--z-sticky` | 1 |
  | `--z-header` | 10 |
  | `--z-dropdown` | 20 |
  | `--z-nav` | 30 |
  | `--z-overlay` | 40 |
  | `--z-toast` | 50 |

## Elrendezés: három osztály

Egyetlen helyen definiálva. A navigáció és a rétegek formája ugyanannál a határnál vált (DR8).

| Osztály | Szélesség | Navigáció | Rögzítés gomb | Rétegek | Tartalom |
|---|---|---|---|---|---|
| **Kompakt** | < 640 px | alsó sáv (Áttekintés, Keretek, Terv, Több) | teljes szélességű sáv az alsó navigáció fölött | alsó lap fogantyúval | egy oszlop |
| **Közepes** | 640–1023 px | navigációs sín bal oldalt (88 px, ikon és felirat) | a sín tetején | középre igazított panel | két oszlop, ahol a konténer elég széles |
| **Széles** | ≥ 1024 px | oldalsáv (240 px) | az oldalsáv tetején | középre igazított panel | a tartalom legfeljebb 1180 px, felül 7:5 rács |

- **Méretek:** `--sidebar-w`, `--rail-w`, `--content-max`, `--tabbar-h` (a safe-area-val) és `--gutter` tokenben.
- **Konténerek:** a sorok és a kártyák 360 és 560 px-nél, a fő rács 880 px-nél vált (`@container`).
- **Görgetés:** a `scroll-padding` a fejléchez és az alsó sávhoz igazodik (ez már kész, AK5).

## Komponensek

A leltár (1.4) 13 sortípusa, 10 címkéje, 3 sávja és 7 ikoncsempéje ezekbe vonódik össze:

| Komponens | Kiváltja | Változatok | Állapotok | Akadálymentesség |
|---|---|---|---|---|
| **Button** | `button.*`, `.btn`, a gombként viselkedő sorok alapja | `primary`, `secondary`, `ghost`, `danger`; `sm`, `md`, `lg`; `icon` | alap, hover (`hover: hover` alatt), `focus-visible`, nyomott, tiltott, betöltés (`aria-busy`: forgó jel, a felirat megmarad) | valódi `<button>`; az ikongomb `aria-label`-lel |
| **Field** | `input`, `select`, `.field`, `.search-box`, `useFieldErrors` | szöveg, összeg, szám, dátum, választó, kereső | alap, fókusz, hibás (`aria-invalid`: piros keret és ikon), tiltott, csak olvasható | `label` és `htmlFor`; a hiba `aria-describedby`-jal |
| **Segmented** | `.seg` (már kész komponens) | `sm`, `md` | kijelölt (`aria-checked`), fókusz | rádiócsoport, nyílbillentyűk |
| **Badge** | `.pill`, `.chip`, `.due`, `.delta`, `.period-badge`, `.todos-count`, `.side-badge`, `.tag-chip` | tónus: `neutral`, `accent`, `ok`, `warn`, `danger`; méret: `sm`, `md`; törölhető | – | szöveggel, nem csak színnel |
| **Chip** | `.chip-btn`, a gyorsrögzítő keretválasztója, a javasolt összegek | választható, művelet | kijelölt, fókusz, tiltott | rádió vagy gomb |
| **Meter** | `.bar`, `.hero .bar`, `.where-bar`, `.bar-today`, `.wb-plan` | `thin`, `regular`; tónus a tempó szerint | „ma” jelölő, tervjel | a mellette álló szöveg mondja ki, a sáv `aria-hidden` |
| **MonthStrip** | új (a Csekk főeleme) | telefon (44 px), asztal (72 px, napfeliratokkal) | eltelt, ma, előreszaladt (sávozott), jövőbeli, hétvége | `role="img"` és teljes mondatos leírás |
| **Row** | a 13 `*-row` | sűrű, normál; elválasztóval; kattintható (link vagy gomb); kinyitható | hover, fókusz, kinyitva | a kattintható sor valódi `<a>` vagy `<button>` |
| **IconTile** | `.cat-icon`, `.todo-icon`, `.hero-alert-icon`, `.side-logo` | `sm`, `md`, `lg`; tónus vagy kategóriaszín | – | `aria-hidden` |
| **Stat** és **Money** | `Kpi`, `.hero-stats`, `.where-total`, `.dev-diff` | `sm`, `md`, `lg`, `display` | pozitív, negatív (valódi mínuszjel) | a címke és az érték egy mondatban olvasható |
| **Bill** | a Csekk számlasora | lejárt (sárga, teli), esedékes (szaggatott keret), kész | – | a „Kifizetve” gomb nevében a számla neve |
| **Callout** | `.banner`, `.hero-alert`, `.side-alert` | `info`, `warn`, `danger`, `ok`; ikon, szöveg, művelet | – | `role="status"` vagy sima szöveg; nem `alert`, ha nem új |
| **Sheet** | `.sheet-layer`, `.sheet` | alsó lap (kompakt), panel (közepes, széles) | nyitás és zárás animációval (reduced-motion alatt nélküle) | `dialog`, `aria-modal`, csapda, Esc, fókusz vissza (már kész) |
| **Toast** | `.toasts`, `.toast` | `neutral`, `ok`, `danger` | belépés, kilépés | állandó `aria-live` (már kész) |
| **EmptyState** | `.empty-state` (használatlan), alkalmi bekezdések | ikon, cím, szöveg, egy művelet | – | a művelet valódi gomb |
| **Skeleton** | új | sor, kártya, szám | – | `aria-busy` a tárolón |
| **Stack**, **Cluster** | a 36 inline flex-sor és az 50 margó | rés a térközskálából | – | – |

**A `button` alapstílus:** csak alaphelyzet marad (betű, kurzor, `background: none`, `border: 0`). A látható gombot a `Button` komponens adja. Így megszűnik a 17 visszavonó szabály (DR7).

## Migráció: lépések és ellenőrzés

Minden lépés után: `npx tsc`, `npx vitest run`, `npm run build`, és a képernyőkép-mátrix újra (`npm run kepek -- --cimke <lépés>`), összevetve az előzővel (`node scripts/kepdiff.mjs <előző> <lépés>`).

| Lépés | Mit | Látható változás | Ellenőrzés |
|---|---|---|---|
| **5.A** | Tokenek a `src/tokens.css`-ben a mai értékekkel: szín (új szerepnevekkel), típus, térköz, sugár, z, mozgás. A pontosan egyező nyers értékek cseréje tokenre; a rácson kívüli értékek (10, 14, 18 px stb.) maradnak, az 5.D komponensei váltják ki őket. | Nincs (a cél: 0 képpont eltérés) | képkülönbség cellánként |
| **5.B** | A Csekk palettája és betűi. A betűk saját tárhelyről a `public/fonts/` alatt. | Teljes színváltás, új betűk | képernyőképek, kontraszt-újramérés (`npm run meresek`) |
| **5.C** | A keret: három elrendezési osztály, oldalsáv, sín, alsó sáv a „Kiadás rögzítése” sávval, képernyőcímek | Új navigáció | a mátrix mind a 4 szélessége, a billentyűzetes bejárás |
| **5.D** | `@layer` szerkezet (a Tabler ikonfont rétegen kívüli CSS-e miatt a komponensekkel együtt). Komponensek: Button, Field, Badge, Chip, Meter, Row, IconTile, Stat, Callout, EmptyState, Stack, Cluster | Egységesebb sorok és címkék | képernyőképek, a fókusz és az érintési cél újramérve |
| **5.E** | Rétegek (Sheet fogantyúval, a sötétítés a navigáció fölött) és toast | A gyorsrögzítő és a lapok formája | a billentyűzetes rétegpróbák újra |
| **5.F** | Grafikonok a tokenekből, reduced-motion, kézi témaválasztó (`[data-theme]`), a `theme-color` témánként | A grafikonok színe, sötét téma kézzel | mindkét téma, csökkentett mozgás |

### Az 5.A eredménye (2026-10-23)

- **Mi változott:**
  - a `src/tokens.css` lett az egyetlen helye a színeknek, a 10 betűméretnek, a 13 térközlépcsőnek, a 7 sugárnak, a 3 időtartamnak és a 6 z-rétegnek;
  - a `styles.css`-ben 108 betűméret, 264 térköz, 14 sugár és mind a 6 z-index tokenre vált;
  - 6 TSX-fájl az új színszerepneveket használja.
- **Ami nyers maradt** (rácson kívüli érték, az 5.D komponensei váltják ki): 79 térköz, 16 sugár, 6 betűméret.
- **A z-rétegek sorrendje** egy ponton szándékosan változott: a menü (20) a fejléc (10) fölé került (DR24).
- **Képkülönbség** (`node scripts/kepdiff.mjs elotte-5 5a`): 208 képből 157 képpontra azonos. A maradék 51:
  - 48 képen egy 100 × 18 px-es folt a „Legutóbbi rögzítések” időbélyegén. Ez a mintaadat órája („ma 10:12”), nem a CSS. A minta azóta a nap elejére rögzíti, így a következő összevetésben nem jelenik meg.
  - 3 képen a gyorsrögzítő és a Továbbiak lap az egész oldalas képen máshol áll. Ez a képkészítés mellékhatása: az egész oldalas kép a nézetet ideiglenesen megnyújtja, és a réteg `12vh`-s eltolása vele változik. Ugyanezek a rétegek a hajtás feletti képeken azonosak.
- **Következtetés:** a CSS-csere 0 látható változást okozott. Rétegeknél a hajtás feletti képek mérvadók (`--csak-hajtas`).

### Az 5.B eredménye (2026-10-23)

- **Betűk:** a Barlow Condensed (600, 700) és az IBM Plex Sans (változó, 400–600) saját tárhelyről jön (`public/fonts/`, 6 woff2, 114 kB, licencekkel), `src/fonts.css`, latin és latin-ext részhalmaz. A build relatív útvonalat ír (`../fonts/…`), így alkönyvtárban is működik, és a PWA offline is gyorsítótárazza.
- **A tokenek a Csekk értékeit kapták:**
  - paletta világos és sötét témára, új szerepekkel (`--color-bill`, `--color-surface-inverse`, `--color-day`, `--color-scrim`);
  - folyékony `--text-xl`, `--text-2xl`, `--text-3xl` és `--text-display`;
  - sugár 10/14/20/24 px;
  - tintakék hero kártya.
- **Ikonok:** a betűmérettel együtt nőtt volna a 18 ikonszabály, ezért külön `--icon-*` tokenekre kerültek, változatlan mérettel.
- **Display betű:** a h1, a h2, a hero összege és címe, a KPI-értékek és a hero számai.
- **Grafikonok, böngésző-témaszín, manifest:** a grafikonok kézi színtáblája, a `theme-color` (témánként) és a manifest színei az új palettához igazodtak. A tokenből olvasás az 5.F-ben jön.
- **Kontraszt:**
  - 26 új színpár számolva;
  - a vezérlőkeret (`--color-border-strong`) a háttéren 2,91:1 volt, `#78859b`-re sötétítve 3,30–3,73:1;
  - a `probe-core` újramérése: 32 cellában (2 téma × 375/1440 px × 8 képernyő) 0 kontraszthiba;
  - a fókusz 213 Tab-lépésből egyszer sem kerül az alsó sáv alá.

### Az 5.C eredménye (2026-10-23)

- **Három elrendezési osztály** egy helyen (`styles.css`, „Keret” szakasz), új tokenekkel: `--sidebar-w`, `--rail-w`, `--content-max`, `--gutter`, `--dock-h`.
  - **Széles (≥ 1024 px):** 240 px-es oldalsáv „Kiadás rögzítése” gombbal (`N`), a kijelölt menüpont accent jelölővel.
  - **Közepes (640–1023 px):** ugyanaz a navigáció 88 px-es sínként, ikonnal és rövid felirattal. A rögzítés 56 px-es négyzetes gomb. A 768 px-es „nyúlt telefon” (K4) megszűnt: a hero három száma egy sorban áll, alsó sáv nincs.
  - **Kompakt (< 640 px):** a fejléc a képernyő címét mutatja (K17). Alul a „Kiadás rögzítése” sáv és négy fül (Áttekintés, Keretek, Tervező, Több), 12 px-es felirattal (A15). A lejárt számla jelvénye a fülön is látszik (K36).
- **Átnevezés:** a Rögzítés képernyő neve „Keretek és számlák” lett (a fülön „Keretek”). A Továbbiak neve Több lett.
- **Egy határ a rétegeknek is:** a toast és az alsó lap ugyanannál a 640 px-es határnál vált, mint a navigáció (DR8). A 720 és 900 px-es keret-töréspontok megszűntek. A tartalmi 720 px-es szabályokat az 5.D konténer-lekérdezései váltják ki.
- **A képernyők saját látható címe** (Számlanaptár, Kategóriák, Beállítások) kompakt elrendezésben csak a felolvasónak marad, hogy ne ismétlődjön a fejléc alatt.
- **Ellenőrzés:**
  - a böngészőben 375, 800 és 1440 px-en átnézve;
  - a `probe-core` 32 cellában 0 kontraszthibát talál;
  - a fókusz 213 Tab-lépésből egyszer sem kerül a magasabb alsó dokk alá;
  - 102 képernyőkép (`kepek/5c`). A Több lap csak kompakt elrendezésben létezik, ezért 2-vel kevesebb.

### Az 5.D eredménye (2026-10-23)

- **CSS-rétegek:** `@layer tokens, base, components, app, utilities`, a sorrend a `src/fonts.css` elején.
  - A rétegekre bontás önmagában 0 látható változást okozott (képkülönbség: minden cella 0,005% alatt).
  - A Tabler ikonfont CSS-e rétegen kívül maradt; csak a `.ti` betűjét állítja, így nem ütközik.
- **Button:** a `<button>` alapstílusa csak viselkedés (betű, 14 px, kurzor, igazítás, fókusz, tiltott és nyomott állapot).
  - A látható gomb a `.btn` és a változatai; egy szkript 96 gombra tette rá. A 26 saját felületű (menüpont, fül, sor, chip, naptárnap) nem kapta meg, így megszűnt 38 visszavonó deklaráció (DR7).
  - A hover csak egeres eszközön (DR6). A foglalt gomb (`aria-busy`) látható állapotot kap.
  - Képkülönbség: 0,005% alatt, miután 3 saját felület (chip, menüpont, ikonválasztó) megkapta a korábban örökölt tulajdonságait.
- **Field:**
  - a hibás mező (`aria-invalid`) piros kerete és a tiltott mező állapota;
  - a kereső 16 px-es, így érintőképernyős táblagépen sem nagyít rá az iOS (DR9).
- **Badge** (`<Badge tone size>`): a `.period-badge`, `.due`, `.chip` (célállapot), `.delta`, `.pill` és `.todos-count` egy komponens lett, öt tónussal és két mérettel. A törölhető badge gombja 24 px-es érintési célt kapott.
- **Chip:** a gyorsrögzítő kategória- és számlachipje és az Elemzés #címkéje egy `.chip` komponens.
- **IconTile:** `tile-sm/md/lg` (24/32/40 px). A `CatIcon` mérete választható. A 7 korábbi méret- és sugárpár 3-ra csökkent.
- **Meter:** a keretsáv, a hero sávja és az Elemzés sávja egy szerkezet. A sáv mindkét végén lekerekített, a jelölő a burkolón van, így a lekerekítés nem vágja le.
  - Menet közben egy névütközés derült ki: a `.lg` méretmódosító egy meglévő jelmagyarázat-osztállyal ütközött, és összenyomta az Elemzés sávját. Javítva (`.meter-lg`), és a többi új osztálynév ütközését is ellenőriztem.
- **Callout** (`.callout tone-*`): a 8 `.banner` helyett, `danger` és `ok` tónussal is.
- **Stat:** a `Kpi` neve `Stat`, a `.kpis` neve `.stats`.
- **EmptyState:** ikon, cím, szöveg és egy művelet. A Számlanaptár (SZ35) és az Elemzés (SZ36) zsákutca üres állapota helyett.
- **Row:** a 10 külön elválasztószabály egy szabály lett. A sorok belső rácsa képernyőnként, a 6. fázisban egységesül.
- **Stack és Cluster:**
  - `stack`, `cluster`, `cluster wrap`, `gap-*`, `mt-*`, `mb-*`, `m-0` a `utilities` rétegben;
  - egy szkript 63 inline stílust cserélt osztályra (139 → 75);
  - a maradék adatfüggő (szélesség, kategóriaszín) vagy egyszeri.
- **Konténer-lekérdezések:** a tartalom 10 `@media` szabálya `@container content`-re váltott (680 és 860 px tartalomszélesség). Így 768 px-en, a sín mellett a kompakt sorok jelennek meg. 1024 px-en a Tervező és a Számlanaptár egy oszlopra vált, és ezzel megszűnt a Tervező 1024 px-es szétesése (K1, A05).
- **Ellenőrzés:** `probe-core` 32 cellában 0 kontraszthiba, a fókusz 213 lépésből egyszer sem takart, friss betöltésnél 0 konzolhiba, 102 képernyőkép (`kepek/5d`).

### Az 5.E és az 5.F eredménye (2026-10-23)

- **Mélység és mozgás:**
  - négy mélységtoken (`--elev-1…4`) a menü, az alsó lap és a toast nyers árnyékai helyett, sötét témában erősebb árnyékkal;
  - a sötétítés a `--color-scrim` tokenből;
  - a lap, a sötétítés és a toast animációja a mozgástokenekből, így csökkentett mozgásnál a toast belépése is azonnali (DR16).
- **Alsó lap fogantyúval:**
  - kompakt elrendezésben látszik, lefelé húzva követi az ujjat;
  - a lap negyedénél (legfeljebb 120 px) tovább húzva bezárul, rövidebb húzásnál visszaugrik;
  - fej nélküli Chrome-ban kipróbálva: 40 px-es húzás visszaugrik, 220 px-es bezárja, az útvonal az alatta lévő képernyő;
  - mind a négy réteg (gyorsrögzítő, Több, Átcsoportosítás, Trend) megkapta.
- **A sötétítés a navigáció fölött** (K16): a réteg z-szintje (40) a navigációé (30) fölött van. Kompakt elrendezésben a dokk közepén a réteg a legfelső elem.
- **Grafikonok a tokenekből** (DR3):
  - a színeket a `--chart-grid`, `--chart-tick`, `--chart-faint`, `--chart-zero`, `--color-accent` és `--color-surface` tokenből olvassák, a betűt a `--font-body`-ból;
  - téma váltásakor újraolvassák;
  - a kézzel összefűzött hexa átlátszóság helyett `withAlpha()` (`src/ui/color.ts`, tesztekkel);
  - a kategóriaikon háttere `color-mix()`;
  - csökkentett mozgásnál nincs animáció.
- **Kézi témaválasztó** (Beállítások → Megjelenés: Rendszer / Világos / Sötét):
  - eszközönként tárolódik;
  - a `tokens.css` sötét értékei `[data-theme='dark']` alatt is érvényesek;
  - az `index.html` egy rövid szkripttel még a megjelenítés előtt alkalmazza, így nincs villanás;
  - a `theme-color` is követi.
  - A böngészőben kipróbálva: „Sötét” mellett a világos rendszerbeállítás ellenére is sötét, újratöltés után is; „Rendszer”-re visszaállítva a `data-theme` eltűnik, és a két `theme-color` visszakapja a médiafeltételét.

**Ami a rétegeknél maradt:** a Váratlan kiadás és az Új cél űrlapja ma a képernyőbe ágyazva nyílik meg, nem rétegként (K15). Ezek tartalmi átalakítása a 6. fázisban, a Rögzítés és a Kategóriák képernyővel együtt jön.

A képernyők tartalmi átalakítása a 6. fázisban jön: a MonthStrip és a Bill az Áttekintésen, az „utána marad” előnézet a gyorsrögzítőben, az idővonal a Tervezőben.

## Nyitott kérdések

- **Ikonok:** a teljes Tabler ikonfont (507 kB) marad, vagy részhalmaz/SVG (DR19)? A Csekk vázlatai kevés ikont használnak. Az 5.D-ben érdemes eldönteni, amikor a komponensek ikonigénye már látszik.
- **„Keretek” fül (eldőlt az 5.C-ben):** a Rögzítés képernyő neve „Keretek és számlák” lett (röviden „Keretek”), mert a rögzítés saját sávot és gombot kapott, és a „Rögzítés” menüpont kétféle jelentése (K36) így megszűnik. Az útvonal (`#/rogzites`) nem változott.
