# Design- és funkcióátnézési terv – 4. kör

**Cél:** a felület legyen sokkal reszponzívabb és modernebb hatású, a 2026-os trendeknek megfelelő. Közben mérjük fel, milyen új funkciók és lehetőségek érik meg a fejlesztést. A terv nem a megvalósítás, hanem egy átnézési folyamat: mérés → összegzés → irány → design-rendszer → képernyőnkénti megvalósítás → visszamérés.

**Kiinduló állapot (2026-10-22)**
- React 19 + Vite PWA, egyetlen `src/styles.css` (860 sor, CSS-változók, világos/sötét/kézi téma), Tabler ikonok, Chart.js.
- Képernyők: Áttekintés, Rögzítés, Tervező, Elemzés, Számlanaptár, Kategóriák, Beállítások, első indítás. Rétegek: gyorsrögzítő, alsó lap, Váratlan kiadás.
- Navigáció: asztalon bal oldalsáv, 900 px alatt alsó sáv a kiemelt **+**-szal.
- Töréspontok: 600, 720 és 900 px, kb. 30 `@media` blokkban szétszórva. Táblagép-méretre (768–1100 px) nincs külön elrendezés, ott a telefonos nézet nyúlik szét.
- Nincs mintaadat: a felmérés csak a böngészőben lévő valódi adatokkal mehet.

## A három plugin és a szerepük

| Plugin | Skill | Mire használjuk |
|---|---|---|
| **UX/UI Audit** | `ux-ui-audit:ux-ui-audit` | Mérés a böngészőben: kontrasztarányok, érintési célpontok mérete, fókuszkeret, akadálymentes nevek, Hick- és Fitts-index, design-rendszer-megfelelés, Gestalt (közelség, hasonlóság). A szöveges rész: placeholder szöveg, ellentmondó állítások, következetlen elnevezés, zsákutca üres állapotok, kétértelmű dátumok, szövegnövekedés. Előtte–utána összevetéshez is ez kell. |
| **Design** | `design:design-critique` | Képernyőnkénti kritika: hierarchia, olvashatóság, következetesség. |
| | `design:accessibility-review` | WCAG 2.1 AA átnézés: billentyűzet, képernyőolvasó, kontraszt, érintési cél. |
| | `design:design-system` | A `styles.css` auditja (beégetett értékek, névadás), majd az új tokenek és komponensminták dokumentálása. |
| | `design:ux-copy` | Mikroszövegek, üres állapotok, hibaüzenetek, gombfeliratok a meglévő nyelvi szabályok szerint. |
| | `design:user-research`, `design:research-synthesis` | Rövid használati napló és interjú a családdal; a megállapítások témákba rendezése, rangsor. |
| | `design:design-handoff` | Minden képernyő megvalósítása előtt specifikáció: elrendezés töréspontonként, tokenek, állapotok, animáció. |
| **Frontend Design** | `frontend-design:frontend-design` | Esztétikai irány (tipográfia, szín, tér, mozgás), 2–3 alternatív vázlat, majd a kiválasztott irány megvalósítása úgy, hogy ne sablonos hatást keltsen. |

A Design plugin Figma-, Notion-, Linear- stb. kapcsolói nincsenek bekötve, és ehhez a tervhez nincs is rájuk szükség. Ha mégis kellenének, a `/mcp` paranccsal lehet engedélyezni őket.

## A megvalósítás szabályai

A `FEJLESZTESI_TERV.md` általános szabályai érvényesek (magyar, mondatkezdő nagybetűs felület, `formatFt`, nincs „Kérjük” és felkiáltójel, visszavonás minden módosításnál, `npx tsc` + `npx vitest run` + `npm run build` hibátlan). Kiegészítések:
- A számítási logika (`src/domain/`) nem változik a redesign miatt. Ha egy új funkció kell hozzá, az tiszta függvény lesz, teszttel.
- Minden felmérési és döntési anyag a `docs/design/` mappába kerül, számozva (lásd lent), hogy a későbbi munkamenetek is fel tudják venni a fonalat.
- A képernyőképek nem kerülnek a repóba (`docs/design/kepek/` a `.gitignore`-ban), csak a megállapítások és a mért számok.
- A `KONCEPCIO.md` 4. fejezete (Képernyők) a viselkedés változásával együtt frissül.
- **Szóhasználat (a felhasználó döntése, 2026-10-23, lásd `docs/design/01-szovegek.md` Szójegyzék):**
  - a fizetéstől fizetésig tartó egység a felületen **hónap**, „időszak” csak ott, ahol a dátumtartomány a lényeg (Beállítások → „Időszak kezdőnapja”);
  - a megszólítás következetesen **te**, a közös pénzről személytelen mondatok („Minden keret a terv szerint halad”);
  - két keret közti áthelyezés: **Átcsoportosítás**;
  - a fájlba mentés gombja **Mentés letöltése**, az állapota „Letöltve …”, a puszta „Mentés” csak űrlap mentése.

---

## 0. Előkészítés

- **Mintaadat a méréshez:** fejlesztői módban betölthető minta (`?minta` paraméter), ami a meglévő import útvonalon fut. Legyen benne 14 lezárt időszak, minden kategóriatípus, lejárt és esedékes számla, túllépett és gyorsan fogyó keret, cél, #címkék, hosszú kategórianév és nagy összeg (8 számjegy). Kell egy **üres** állapot is (friss indítás) és egy **szélsőséges** (negatív futó egyenleg, 40 kategória). A korrekció és a havi zárás még nincs megvalósítva, ezért a mintában sem szerepelhet.
- **Mérési mátrix:** 7 útvonal × 4 szélesség (375, 768, 1024, 1440 px) × 2 téma. A rétegeket (gyorsrögzítő, alsó lap, havi zárás) külön, 375 és 1440 px-en.
- **Kiindulási képernyőképek** minden mátrix-cellában, a `preview_start` (`dev` szerver) és a böngészőpanel `resize_window` eszközével.

**Kimenet:** `docs/design/00-elokeszites.md` (a minta leírása, a mátrix, a betöltés módja), a `npm run kepek` szkript és a kiindulási képek a `docs/design/kepek/alap/` mappában. **Állapot: kész (2026-10-22).**

## 1. Állapotfelmérés (párhuzamosan futtatható)

| Lépés | Skill | Mit vizsgál | Kimenet |
|---|---|---|---|
| 1.1 | `ux-ui-audit` | A teljes mérési mátrix: kontraszt, érintési cél, fókusz, Fitts/Hick, design-rendszer-megfelelés, szöveges hibák, üres állapotok. | `docs/design/01-audit.md`, mért számokkal |
| 1.2 | `design:accessibility-review` | Billentyűzetes bejárás (Tab-sorrend, rétegek fókuszcsapdája, Esc), képernyőolvasó (VoiceOver), `aria-live`, a grafikonok szöveges alternatívája. | `docs/design/01-akadalymentesseg.md` |
| 1.3 | `design:design-critique` | Képernyőnként: első benyomás, vizuális hierarchia, sűrűség, következetesség, mi hat elavultnak. | `docs/design/01-kritika.md` |
| 1.4 | `design:design-system` | A `styles.css` auditja: beégetett színek és méretek, a töréspontok száma, a tokenek hiánya (térköz, betűméret, árnyék, mozgás), ismétlődő komponensminták. | `docs/design/01-design-rendszer.md` |
| 1.5 | `design:ux-copy` | Minden felirat, üres állapot, hibaüzenet, toast, megerősítés. | `docs/design/01-szovegek.md` |

**Kifejezetten vizsgálandó a reszponzivitás:**
- 768–1100 px között (táblagép, félképernyős asztali ablak) mennyire „nyúlt telefon” a nézet.
- 1440 px felett kihasználatlan-e a tér (egy oszlop, széles margók).
- A Tervező és az Elemzés hőtérképe telefonon: vízszintes görgetés, olvashatóság.
- Fekvő telefon, képernyő-billentyűzet a gyorsrögzítő alatt, `safe-area` a Dynamic Island és a gesztussáv körül.
- Szöveg 200%-os nagyításnál és iOS nagy betűméretnél.

**Állapot: kész (2026-10-22).** Az összefoglaló és a gyors javítások listája: `docs/design/01-osszefoglalo.md`. A mérések újrafuttatása: `npm run meresek -- --probak <a UX/UI Audit plugin scripts mappája>`.

## 2. Használói felmérés és összegzés

- **2.1 `design:user-research`:** rövid interjúvázlat a család felhasználóinak (10–15 perc), és egy egyhetes használati napló: mikor, melyik eszközön, mire használják; mi akad el; mit csinálnak még Excelben vagy fejben. A szinkron miatt két eszköz van, ezért a „ki rögzített” kérdés is ide tartozik.
- **2.2 `design:research-synthesis`:** az 1. fázis és a napló megállapításai témákba rendezve, súlyosság × gyakoriság × ráfordítás szerint rangsorolva.

**Kimenet:** `docs/design/02-osszegzes.md`, a végén egy rangsorolt listával, amiből a felhasználó választ.

**Állapot (2026-10-23):** a kutatási terv és eszközök kész (`docs/design/02-felhasznaloi-kutatas.md`, adatkivonat: `node scripts/hasznalat.mjs <mentés.json>`). Az összegzés ideiglenes rangsorral kész, 16 munkacsomaggal. A beszélgetések és a napló a családra várnak, utánuk véglegesedik.

## 3. Funkciófelmérés

Minden jelöltnél: mit old meg, mekkora munka, kell-e hozzá domain-változás vagy új npm-csomag, és a felhasználó döntése (igen / később / nem). A lista a 2. fázis után bővülhet.

**A `KONCEPCIO.md` 2. verziójából még nyitott:**
- „Mi lenne, ha” forgatókönyvek a futó egyenlegre (pl. „ha a Szabadidőt 20 000-rel csökkentjük”).
- Két időszak egymás melletti összevetése.
- Éves összesítő (idei és tavalyi) és a „ki mennyit rögzített” bontás.

**Új jelöltek:**
- **Megtakarítások egyenlege jól látható helyen** (a felhasználó kérése, 2026. okt. 23.): ma csak a Futó egyenleg kártya apró sorában („félretéve most”) és célonként a Megtakarítás és célok kártyán látszik. Kérdések: hol legyen (Áttekintés felső sávja, saját kártya vagy saját képernyő), csak a mai összeg kell-e vagy havi alakulás is (befizetések, felhasználás, grafikon), és célonként vagy összesítve.
- **Parancspaletta** (`Cmd/Ctrl+K`): ugrás képernyőre és kategóriára, gyors rögzítés gépeléssel („élelmiszer 12500”), keresés a megjegyzésekben.
- **Gesztusok mobilon:** a számlasor elhúzása = kifizetve, a rögzítés elhúzása = törlés (visszavonással). Az alsó lap húzható fogantyúval csukható.
- **Értesítések:** esedékes számla, havi zárás, elavult mentés (Notification API; iOS-en csak telepített PWA-ban). Ütemezett értesítéshez szerveroldali push kellene, ezért itt csak a megnyitáskori jelzés reális.
- **Bankszámlakivonat-import (CSV):** a gyakori magyar bankok exportjából keret-javaslatok; nagy munka, külön döntés.
- **Évértékelő** („Az év pénzügyei”): az év végén egy lapozható összefoglaló.
- **Célok ünneplése:** elért cél, lezárt hónap pluszban, finom mozgással (`prefers-reduced-motion` mellett nincs).
- **Kezdőképernyő-parancsikonok bővítése:** „Számla kifizetése”, „Elemzés”.
- **Megosztás:** a havi összegzés képként vagy szövegként a rendszer megosztás-lapjára (`navigator.share`).
- **Offline és szinkronállapot** egyértelmű jelzése, húzással frissítés a szinkronhoz.
- **Billentyűparancs-súgó** (`?`) asztalon.

**Kimenet:** `docs/design/03-funkciok.md`, döntési oszloppal.

## 4. Esztétikai irány (`frontend-design`)

- **4.1 Irányok:** 2–3 egymástól jól elkülönülő vizuális irány, mindegyik az Áttekintésen és a gyorsrögzítőn bemutatva, 375 és 1440 px-en, világos és sötét témában. Az irányok mozgástere:
  - **tipográfia:** markánsabb címek, nagyobb, beszédesebb számok (a pénzösszeg a főszereplő), változó betűtípus; saját tárhelyről a `public/`-ba, nem npm-ből;
  - **szín:** OKLCH-alapú paletta, egységes világosság a kategóriaszíneknél, a meglévő hero (sötét kártya) koncepció továbbvitele vagy elhagyása;
  - **elrendezés:** „bento” rács az Áttekintésen, kártyák helyett vagy mellett tagolás térközzel;
  - **mozgás:** View Transitions API a képernyőváltáshoz, rugalmas alsó lap, számláló animáció az összegeknél;
  - **anyag:** áttetsző (backdrop blur) sávok csak a navigációnál, mélység finom árnyékokkal.
- **4.2 Döntés:** a felhasználó választ (vagy kever). A vázlatok a böngészőben, a dev szerveren futnak egy rejtett `#/minta-design` útvonalon, vagy artifactként.

**Kimenet:** `docs/design/04-irany.md`, a választott irány leírásával és indoklással.

**Állapot (2026-10-23):** három irány kész (Csekk, Borítékok, Pénzfolyam), vázlatok: [Családi költségvetés – vizuális irányok](https://claude.ai/artifact/95bWwAVufTsaTg3bc7BLHh), forrás: `docs/design/04-vazlatok/`. A felhasználó választására vár.

## 5. Design-rendszer 2.0 (`design:design-system`)

- **Tokenek a `:root`-on:** szín (OKLCH, szemantikus nevekkel), térközskála (4 px alap), folyékony típusskála (`clamp()`), sugár, árnyék/mélység, mozgás (időtartam, görbe), z-rétegek.
- **Egységes töréspontok:** a 600/720/900 helyett három elrendezési osztály.
  - **Kompakt** (< 640 px): alsó sáv, egy oszlop, rétegek alulról.
  - **Közepes** (640–1024 px): navigációs sín (ikonok felirattal) a bal szélen, két oszlop, ahol értelmes; rétegek középen.
  - **Széles** (> 1024 px): oldalsáv, többoszlopos rács, a részletek oldalsó panelen (pl. kategóriára kattintva a Rögzítés jobb oldalt nyílik meg, nem új képernyőn).
- **Konténer-lekérdezések** (`@container`) a kártyákon és a sorokon, hogy a komponens a saját szélességéhez igazodjon, ne az ablakéhoz.
- **Komponensleltár:** gomb, mező, chip, sáv, sor, kártya, KPI, alsó lap, toast, üres állapot, váz (skeleton). Mindegyikhez állapotok (alap, hover, fókusz, aktív, tiltott, betöltés, hiba).
- A `styles.css` szétbontása rétegekre (`@layer tokens, base, components, screens`), vagy képernyőnkénti fájlokra, CSS modulokra.

**Kimenet:** `docs/design/05-design-rendszer.md`, és a tokenek a kódban, a vizuális megjelenés változtatása nélkül (első lépésként csak csere tokenekre, hogy a későbbi különbség tiszta legyen).

**Állapot (2026-10-23):** a specifikáció kész, az 5.A (tokenek, 0 látható változás, képkülönbséggel igazolva) kész. Az 5.B (a Csekk palettája és saját tárhelyes betűi) kész. Az 5.C (a keret: három elrendezési osztály, képernyőcímek) kész. Az 5.D (rétegek, komponensek, konténer-lekérdezések) kész. Az 5.E (rétegek) és az 5.F (grafikonok a tokenekből, kézi témaválasztó) kész: az 5. fázis lezárult. Következik a 6. fázis (megvalósítás képernyőnként).

## 6. Megvalósítás képernyőnként

Minden képernyőnél ugyanaz a menet:
1. `design:design-handoff`: specifikáció a három elrendezési osztályra, az állapotokkal és az üres/hibás esetekkel.
2. `frontend-design`: megvalósítás a választott irányban.
3. `design:ux-copy`: a megváltozott szövegek átnézése.
4. Ellenőrzés a böngészőpanelen a mérési mátrix érintett celláiban, képernyőképpel.

Sorrend (a keret előre, utána a leggyakrabban használt képernyők):
1. **Keret:** oldalsáv / navigációs sín / alsó sáv, fejléc, rétegek, toastok, képernyőváltás animációja.
2. **Áttekintés** (hero, teendők, KPI-k, kategórialista, grafikonok).
3. **Gyorsrögzítő** és **Rögzítés**.
4. **Tervező** (telefonon kártyalista a táblázat helyett).
5. **Elemzés** és a grafikonok (Chart.js témázás a tokenekből).
6. **Számlanaptár**.
7. **Kategóriák**, **Beállítások**.
8. **Első indítás** (a legelső benyomás, a végén, a kész rendszerrel).

A 3. fázisban elfogadott funkciók a hozzájuk tartozó képernyővel együtt készülnek, külön commitban.

## 7. Visszamérés

- A `ux-ui-audit` újrafuttatása ugyanazon a mátrixon, ugyanazzal a mintaadattal. A mért számok összevetése a kiindulással (kontrasztproblémák, kis érintési célok, fókuszhibák száma, Fitts-index a fő műveleteknél).
- `design:accessibility-review` a végleges állapoton.
- `design:design-critique` a régi és az új képernyőképek egymás mellett.
- Teljesítmény: Lighthouse mobil profil (LCP, CLS, INP), a CSS és JS méret a buildben.

**Kimenet:** `docs/design/07-visszameres.md`, előtte–utána táblázattal.

## Döntési pontok a felhasználónak

| Mikor | Kérdés |
|---|---|
| A 0. fázis előtt | Maradjon-e a „nem kerülhet be új npm-csomag” szabály? (Betűtípus a `public/`-ba enélkül is betehető; animációs vagy ikonkönyvtár csere csak a szabály lazításával.) |
| A 2. fázis után | Mely megállapítások kerülnek be, milyen sorrendben. |
| A 3. fázis után | Mely új funkciók készülnek el ebben a körben. |
| A 4. fázisban | Melyik esztétikai irány. |
| Az 5. fázisban | Egy CSS fájl rétegekkel, vagy képernyőnkénti CSS modulok. |
