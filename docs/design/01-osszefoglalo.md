# 1. fázis – Állapotfelmérés, összefoglaló

A [DESIGN_TERV.md](../../DESIGN_TERV.md) 1. fázisa (2026-10-22). Öt párhuzamos vizsgálat a 0. fázis mintaadatán és mérési mátrixán. Ez az oldal a belépési pont: összeköti a jelentéseket, és témákba rendezi a megállapításokat a 2. fázis (összegzés, rangsor) számára.

| Lépés | Plugin, skill | Jelentés | Megállapítás |
|---|---|---|---|
| 1.1 | UX/UI Audit · `ux-ui-audit` | [01-audit.md](01-audit.md) | 19 (7 jelentős, 7 akadálymentességi, 5 megjegyzés) |
| 1.2 | Design · `accessibility-review` | [01-akadalymentesseg.md](01-akadalymentesseg.md) | 12 (5 jelentős, 7 kisebb) |
| 1.3 | Design · `design-critique` | [01-kritika.md](01-kritika.md) | 40 (3 kritikus, 9 magas, 21 közepes, 7 alacsony) |
| 1.4 | Design · `design-system` | [01-design-rendszer.md](01-design-rendszer.md) | 24 (2 kritikus, 6 magas, 12 közepes, 4 alacsony) |
| 1.5 | Design · `ux-copy` | [01-szovegek.md](01-szovegek.md) | 50 (7 magas, 32 közepes, 11 alacsony) |

Összesen 145 megállapítás. Az azonosítók előtagja a jelentést jelöli:

| Előtag | Jelentés |
|---|---|
| A | audit |
| AK | akadálymentesség (a táblázat sorszáma) |
| K | kritika |
| DR | design-rendszer |
| SZ | szövegek |

A súlyossági skálák jelentésenként eltérnek, ezért a 2. fázis egységesen rangsorol.

**A mérés újrafuttatható** (7. fázis):
```bash
npm run kepek -- --cimke utana
```

```bash
npm run meresek -- --probak <a UX/UI Audit plugin scripts mappája> --cimke utana
```

## Ami jól működik (ezt ne rontsuk el)

- **A hero:** egy nagy szám, egy mondat, egy sáv (K, Összkép). A „Még elkölthető” a jó kérdésre felel.
- **A rétegek billentyűkezelése** mintaszerű: fókusz be, csapda, Esc, visszatérés (AK, Billentyűzet).
- **A fókuszjelző:** 1339 Tab-leütésből 0 kontraszthiba (A, Ami jól működik).
- **Nevek:** 0 név nélküli vezérlő 74 cellában. A hőtérkép cellái teljes mondatot adnak a felolvasónak.
- **Reflow:** 320 px-en 0 kilógás mind a 8 képernyőn (AK, Reflow).
- **A szövegek alaphangja** konkrét és barátságos, a ház szabályait szinte mindenhol betartja (SZ, Ami jól működik).
- **A sötét téma szöveges kontrasztja** cellánként 0–5 hiba, a világosé 25+.

## Témák

### 1. A reszponzív elrendezés hiányzik a 640–1200 px-es sávban és 1440 px felett

**Megállapítások:** K1, K4, K5, A05, A06, DR2

- **768 px:** a telefonos nézet nyúlik szét, alsó sávval.
- **1024 px:** a Tervező összetörik.
- **1440 px:** egyetlen 1100 px-es oszlop marad, a hőtérkép a kártya 40%-át használja.

A rejtett ok az `auto-fit` rácsok és a mindössze három (600/720/900) töréspont (DR2).

Ez a terv 5. fázisának fő munkája. A javasolt három elrendezési osztály (kompakt / közepes / széles) és a konténer-lekérdezések pont ezt célozzák.

### 2. A grafikonok olvashatatlanok keskeny konténerben, és nem követik a témát

**Megállapítások:** A04, K2, DR3, AK1

- **Feliratok:** az `autoSkip: false` miatt a hónapnevek egymásra csúsznak (`Charts.tsx:40`).
- **Színek:** a grafikon saját, kézzel másolt színtáblát használ, ami már el is tért a `--grid` tokentől.
- **Akadálymentesség:** a képernyőolvasó nem kap adatot.

**Gyors javítás:** az `autoSkip`. **A teljes megoldás:** a tokenekből olvasott grafikontéma (5. fázis).

### 3. Számok és szövegek, amelyek mást mondanak, mint amit jelentenek

**Megállapítások:** A01, A02, A03, A07, K10, K11, SZ5, AK4

- **„4 / 9 kifizetve”:** a 9 sosem érhető el.
- **„nem tervezett”:** egy negyedéves számlán, aminek van terve.
- **„még nincs lezárt időszak”:** miközben 14 van.
- **„−100%”:** még nem esedékes tételeken.
- **„félretéve”:** háromféle szám ugyanazzal a szóval.
- **A sávok** képernyőnként mást jelentenek.

Ezek pár soros javítások, de a felhasználó bizalmát erodálják. Nem a design irányától függnek.

### 4. Kontraszt: két token több száz helyen

**Megállapítások:** A08, A09, DR4, AK3

- A `--text-3` 3,51:1 (legalább 687 előfordulás).
- Az elsődleges gomb felirata 4,42:1 világosban és 3,20:1 sötétben.
- Az „esedékes” pötty 1,88:1.
- Néhány kategóriaszín sötét háttéren 3:1 körül van.

A javítás tokenszintű, és a design-irány (4. fázis) színpalettájába kell beépülnie.

### 5. Hierarchia és sűrűség: minden egyforma kártya

**Megállapítások:** K6, K7, K8, K12, A17

- **Kártyaleves:** az Áttekintésen a hero után minden egyforma súlyú kártya.
- **Ismétlés:** ugyanaz az Élelmiszer-figyelmeztetés 3–4-szer jelenik meg.
- **Rejtett kockázat:** a szélső mintán a −14 milliós futó egyenleg mellett a hero nyugodt pozitív számot mutat.
- **Hosszúság:** a telefonos oldalak 4–7 képernyőnyiek, összecsukás nélkül.
- **Sok vezérlő:** a Kategóriák első képernyőjén 54–67.

Ez a 4. fázis (esztétikai irány, elrendezés) kérdése.

### 6. Állapotok és űrlapok: amit csak a szem lát

**Megállapítások:** AK2, AK8, AK10, AK11, A10, A12, A13, DR6

- **Szemantika:** a Tervező hatályváltójának és a naptár napjainak állapota nincs a szemantikában.
- **Űrlaphibák:** a Beállítások és a Kategóriák hibái nincsenek a mezőhöz kötve.
- **Címsorok:** a négy fő képernyőn nincs `<h1>`.
- **Hiányzó állapotstílusok:** betöltés, mezőhiba, tiltott mező.

A közös mezőkomponens és a komponensleltár (5. fázis) egyszerre kezeli.

### 7. Szóhasználat és megszólítás

**Megállapítások:** SZ2, SZ3, SZ4, SZ6, SZ12–14, SZ17, Szójegyzék

- **Két jelentésű szavak:** a „Mentés” jelent letöltést és űrlapmentést is, a „számla” bankszámlát és csekket is.
- **Megszólítás:** a te és a ti keveredik, már az első mondatban.
- **Dátumok:** öt dátumformátum és nem szabványos hónaprövidítések.
- **Mínuszjel:** kétféle.
- **Nyelvtani hiba:** „a októberi”.

A szójegyzék javaslatai felhasználói döntést kérnek (lásd lent).

### 8. A design-rendszer alapja hiányzik

**Megállapítások:** DR1, DR7, DR (Számokban)

- **Tokenek:** nincs térköz-, típus-, mélység-, mozgás- és z-réteg-token.
- **Elszórt értékek:** 13 betűméret, 25 térközérték, 138 soron belüli stílus.
- **Túl erős alapstílus:** a `button` elemre írt alapstílus miatt 17 szabály csak visszavonja azt.
- **Ikonok:** a teljes Tabler ikonfont kerül a buildbe (507 kB woff2) a kb. 90 használt ikonhoz.

Ez az 5. fázis első lépése.

## Gyors javítások, a design-iránytól függetlenül

Ezek hibák, nem ízlés kérdései. Mindegyik néhány sor, és egyik sem akadályozza a későbbi redesignt. Javaslatom, hogy a 2. fázis előtt vagy vele párhuzamosan, egy külön commitban készüljenek el.

| # | Javítás | Megállapítás | Hely |
|---|---|---|---|
| 1 | A fix számlák nevezője csak az esedékeseket számolja | A01 | `Record.tsx:111`, `:216` |
| 2 | A nem esedékes számla „nem esedékes · legközelebb …” feliratot kap | A02 | `Dashboard.tsx:246` |
| 3 | Az eltérések üres állapota különbözik aszerint, hogy van-e lezárt időszak | A03 | `Analysis.tsx:145` |
| 4 | `autoSkip` a grafikonok tengelyén | A04, K2 | `Charts.tsx:40` |
| 5 | `--text-3` és az accent kontrasztja AA szintre | A08, A09 | `styles.css` `:root` |
| 6 | `scroll-padding-bottom` az alsó sávhoz | AK5 | `styles.css` |
| 7 | Rádiószerep a Tervező hatályváltóján és az Elemzés időablakán | AK10, AK11 | `Planner.tsx:122`, `Analysis.tsx` |
| 8 | `<h1>` a négy fő képernyőn, a Beállítások select neve | A12, A10 | képernyők, `Settings.tsx:121` |
| 9 | A „Fizetésnap” és a Kategóriák hibáinak bekötése | AK8 | `Settings.tsx`, `Categories.tsx` |
| 10 | „az októberi”, a felkiáltójel és a mínuszjel egységesítése | SZ1, SZ2, SZ14 | `plans.ts:193`, `github.ts:74` |

## Döntések a 2. fázishoz

A szövegjelentés szójegyzéke néhány ponton felhasználói döntést kér. Ezek az 5–6. fázis szövegeit határozzák meg:

- **„hónap” vagy „időszak”** a felületen (SZ, Szójegyzék). A javaslat a „hónap”, a fizetéstől fizetésig értelemben.
- **te vagy ti:** a javaslat a következetes „te”, a család pénzéről személytelen mondatokkal (SZ, „Te vagy ti”).
- **„Fedezet áthozása” helyett „Átcsoportosítás”** (SZ17). Ez a `KONCEPCIO.md` saját szava.
- **A „Mentés” szétválasztása:** „Mentés letöltése” a fájlhoz, „Mentés” az űrlapokhoz (SZ3).

A 2. fázis (`design:user-research`, `design:research-synthesis`) e mellé teszi a család használati tapasztalatát, és egy rangsorolt listát ad, amiből a felhasználó választ.

## A felmérés korlátai

- **Képernyőolvasó:** valódi képernyőolvasós (VoiceOver, TalkBack) végigjárás nem volt. A bejelentéseket a DOM-ból számítottam.
- **Teljesítmény:** a teljesítményszámok a fejlesztői szerverről valók, nem az éles buildből.
- **A kritika forrása:** a kritika csak a képernyőképekre épül. A rétegek belső állapotait (kinyitott sor, gépelés, képernyő-billentyűzet) nem látta.
- **Becsült érték:** a design-rendszer jelentés kontrasztarányai tokenpárokból számoltak. A böngészőben mért értékek az auditban vannak. A jelentés 45/100-as pontszáma a szerző becslése, nem mért érték.
