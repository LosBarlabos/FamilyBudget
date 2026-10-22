# Családi költségvetés – UX/UI audit (1.1)

**Hatókör:** fejlesztői szerver (`http://localhost:5173`), `teljes`, `szelso` és `ures` minta · **Szélességek:** 375, 768, 1024, 1440 px · **Témák:** világos, sötét · **Dátum:** 2026-10-22 · **Képernyők:** Áttekintés, Rögzítés, Tervező, Elemzés, Számlanaptár, Kategóriák, Beállítások, gyorsrögzítő, első indítás

## Módszer

- **Mérés:** a UX/UI Audit plugin mérőszkriptjei futottak a mérési mátrix 74 celláján, fej nélküli Chrome-ban, minden cella tiszta betöltésből. A szkriptek: `probe-core`, `probe-heuristics`, `probe-perception`, `probe-ltr`.
  - A futtató: `npm run meresek -- --probak <a plugin scripts mappája>`.
  - A nyers JSON: `docs/design/kepek/meresek/alap/`.
- **Billentyűzet:** `probe-focus` 1339 valódi Tab-leütés után, 375 és 1440 px-en, mindkét témában.
- **Olvasás:** minden képernyő látható szövegét elolvastam a `teljes` mintán, 1440 px-en.
- **Ellenőrzés a forrásban:** minden ellentmondásnál megkerestem, honnan jön a szám vagy a szöveg.
- **Képek:** a 0. fázis képernyőképei (`docs/design/kepek/alap/`).

**Ami kimaradt, és miért:**
- `probe-routes`: az app hash-útvonalas gombokkal navigál, nincs bejárható `<a href>`.
- `probe-rtl` és `probe-parity`: a felület egynyelvű, balról jobbra író.
- A `probe-ltr` angol nyelvre szabott ellenőrzéseit (többes szám, Title Case) nem vettem figyelembe. A kategórianevek tulajdonnevek, így a „vegyes nagybetűzés” jelzés téves riasztás.

**A mérce:** a ház szabályai (`FEJLESZTESI_TERV.md`, „Általános szabályok”), WCAG 2.2 AA, a nem akadálymentességi megállapításoknál Nielsen heurisztikái. A súlyossági skála a plugin saját konvenciója (Kritikus / Jelentős / Akadálymentesség / Megjegyzés), nem szabvány.

**Korlát:** a teljesítményszámok a Vite fejlesztői szerverről valók (73 kérés, modulonként). Az éles buildre nem érvényesek.

## Összegzés

| | Darab |
|---|---|
| Kritikus | 0 |
| Jelentős | 7 |
| Akadálymentesség | 7 |
| Megjegyzés | 5 |
| Jól működik | 7 |

Az alapok erősek. Az 1339 Tab-leütésből egyetlen fókuszjelző sem bukott el kontraszton, a 74 cellában nincs név nélküli vezérlő, és a `teljes` mintán egyik szélességen sincs vízszintes kilógás.

A hibák két helyre koncentrálódnak:
- **Számok, amelyek mást mondanak, mint amit a felhasználó gondol:** a „4 / 9 kifizetve”, a „nem tervezett” negyedéves számla, és a „még nincs lezárt időszak”, miközben 14 van. Ezeket egyetlen automatikus eszköz sem jelzi, és mindegyik pár sor a kódban.
- **Szűk konténerek** a grafikonokban és a Tervezőben.

A szöveges kontraszt az egyetlen széles körű akadálymentességi hiba: egyetlen tokenen múlik, de több száz helyen jelenik meg.

---

## Megállapítások

### A01 · Jelentős · Rögzítés

**A „Fix számlák” számláló sosem érheti el a teljes számot, mert a nevezőben a nem esedékes számlák is benne vannak.**

A számláló 9 fix számlát számol, köztük az évente esedékes Lakásbiztosítást és a negyedéves Kötelező biztosítást. Ebben a hónapban egyiket sem lehet kifizetni, így a legjobb elérhető állapot „7 / 9”. A „hátra” összeg viszont helyesen csak az esedékeseket számolja (Áram 14 500 + Gáz 19 000 + Víz 13 800 = 47 300). A két szám egymás mellett ellentmond egymásnak.

```
megjelenik:  „4 / 9 kifizetve” · „hátra 47 300 Ft · 1 lejárt”
nem esedékes ebben a hónapban: Lakásbiztosítás (évente, „legközelebb december”),
                               Kötelező biztosítás (negyedévente, „legközelebb november”)
forrás:      src/ui/screens/Record.tsx:111   const fixed = active.filter((c) => c.type === 'fix')…
             src/ui/screens/Record.tsx:216   value={`${fixDone} / ${fixed.length} kifizetve`}
```

**Javítás:** a nevező csak az ebben az időszakban esedékes számlákat számolja (`isDuePeriod`), ahogy a `due()` segéd ugyanebben a fájlban (`Record.tsx:108`).

---

### A02 · Jelentős · Áttekintés

**A negyedéves számla csoportja „nem tervezett” feliratot kap, pedig van terve, csak nem ebben a hónapban.**

A felhasználó azt olvassa, hogy elfelejtette betervezni az autóbiztosítást, és a Tervezőben keresni kezdi. Ott viszont azt látja, hogy van terve. Három képernyő háromféle állítást tesz ugyanarról a tételről.

```
Áttekintés:  „Autó 1 · 0 Ft · nem tervezett”
Rögzítés:    „Kötelező biztosítás · negyedévente · legközelebb november”
Tervező:     „negyedévente · ebben a hónapban nem esedékes · November: 21 600 Ft”
forrás:      src/ui/screens/Dashboard.tsx:246   const unplanned = figs.plan === 0;
```

**Javítás:** a nem esedékes számla (és az olyan csoport, amelynek minden tagja nem esedékes) a „nem esedékes · legközelebb november” szöveget kapja, ugyanazzal a megfogalmazással, mint a Tervezőben.

---

### A03 · Jelentős · Elemzés

**A „Legnagyobb eltérések” üres állapota azt állítja, hogy még nincs lezárt időszak, miközben 14 van.**

Az ok az, hogy az alapértelmezett időablak „Ez az időszak”, és abban valóban nincs lezárt időszak. A szöveg viszont nem ezt mondja, és nem ad kiutat sem: a felhasználónak magától kell rájönnie, hogy az „Utolsó 12” gombra kell kattintania.

```
megjelenik:  „Az első lezárt időszak után jelenik meg: a folyamatban lévő hónapot még nincs mihez mérni.”
a mintában:  14 lezárt időszak
forrás:      src/ui/screens/Analysis.tsx:145   const closed = periods.filter((p) => p.status === 'closed').length;
             (a periods itt a kiválasztott időablak időszakai, nem az összes)
```

**Javítás:** ha van lezárt időszak, csak az ablakban nincs, a szöveg legyen „Az eltérések a lezárt hónapokból számolódnak.”, és mellette egy „Utolsó 12 hónap” gomb. Az eredeti szöveg csak akkor jelenjen meg, ha valóban nincs lezárt időszak.

---

### A04 · Jelentős · Áttekintés, Tervező (grafikonok)

**A Futó egyenleg grafikon hónapnevei egymásra csúsznak minden keskeny grafikonon.**

21 időszak címkéje nem fér el, és a beállítás tiltja a ritkítást. Ez nem csak a szélső minta hibája: a `teljes` mintán is olvashatatlan 375 px-en, és 1024 és 1440 px-en a Tervező oldalsó oszlopában.

```
ticks: { color: t.tick, autoSkip: false, maxRotation: 0 }      src/ui/components/Charts.tsx:40
látszik:  „AugSzepOktNovDecJanFebMárÁprMájJúnJúlAugSzepOktNovDecJanFebMárÁpr”
képek:    teljes/vilagos/1024/03-tervezo.png, szelso/vilagos/1440/03-tervezo.png, teljes/vilagos/375/01-attekintes-teljes.png
```

**Javítás:** `autoSkip: true` és `autoSkipPadding`, vagy keskeny konténerben csak a negyedévek és a „ma” felirata. Az évváltásnál maradjon meg az évszám.

---

### A05 · Jelentős · Tervező, 1024 px

**A tervsorok egy kb. 350 px-es oszlopba szorulnak, a magyarázó szöveg szavanként törik, és a csúszka rácsúszik.**

1024 px a kis laptopok és a fekvő táblagépek szélessége. Ezen a méreten a Tervező, a leggyakoribb havi feladat helye, gyakorlatilag olvashatatlan.

```
kép: teljes/vilagos/1024/03-tervezo.png
„Fizetés / előző / tény / 865 000 Ft / · / 3 / havi / átlag / 865 000 Ft”  (soronként egy szó)
oldalhossz: 7,3 képernyőnyi görgetés 1024 px-en, 2,9 1440 px-en (probe-core → layout.screensOfScroll)
```

**Javítás:** az oldalsó összegző oszlop 1200 px alatt kerüljön a lista fölé vagy alá, a tervsor pedig 520 px alatti konténerben két sorra rendeződjön (konténer-lekérdezéssel). Lásd még: kritika K1, design-rendszer DR2.

---

### A06 · Jelentős · Rögzítés, 375 px, `szelso`

**A hosszú kategórianév kitolja a keretsort a képernyőből, és a név, a sáv és az összeg vége le van vágva.**

A törzsön `overflow-x: clip` van, így nem görget oldalra, csak eltűnik a tartalom.

```
probe-core → layout.overflowingElements (szelso/vilagos/375/02-rogzites):
  div#cat-minta-extra-0 > … > div.rec-env-line   right: 469px  (nézet: 375px)
  „Gyerekek iskolai, különórai és sportegyesületi költségei”
```

**Javítás:** a `rec-env-line` kapjon `min-width: 0`-t, a név `overflow-wrap: anywhere`-t vagy két sorra törést.

---

### A07 · Jelentős · Áttekintés, kategórialista

**A „−100%” címke a még nem esedékes tételeken azt sugallja, hogy valami elmaradt, pedig minden rendben van.**

A címke a mostani tényt veti össze az előző időszak azonos napjáig tartó tényével. A havi egyszeri tételeknél (megtakarítás, számlák, váratlan kiadás) ez csak azt méri, hogy ugyanazon a napon történt-e a befizetés.

```
„Váratlan kiadások  -100%  0 Ft / 20 000 Ft”
„Nyaralás 2027      -100%  0 Ft / 30 000 Ft”
„Megtakarítás       -100%  0 Ft / 40 000 Ft”
„Rezsi              -53%   23 480 Ft / 70 280 Ft”
```

**Javítás:** a változáscímke csak a kereteknél jelenjen meg (ott van értelme a napi tempónak). A fix tételek és a megtakarítások helyett az állapot szóljon („esedékes okt. 31.”).

---

### A08 · Akadálymentesség · WCAG 1.4.3 · minden képernyő, világos téma

**A `--text-3` színű kis szöveg 3,51:1 kontrasztú fehéren; 4,5:1 kellene.**

Ez a mérés leggyakoribb hibája: ugyanaz a színpár legalább 687 előfordulásban. A szám alsó becslés, mert a próba oldalanként legfeljebb 25 hibát listáz, és a 42 világos cellából 20-nál elérte ezt a plafont. Tipikusan 12–13 px-es alsorok: „terv 891 600 Ft”, „≈ 4,1 hónapnyi kiadás”, „és még 2 teendő”.

```
#8a8983 (rgb 138,137,131) a #ffffff-en  → 3,51 : 1   (687×)
#8a8983 a --surface-2-n (#f0efea)        → 3,05 : 1   (14×)
#8a8983 a --bg-n (#f6f5f1)               → 3,22 : 1   (6×)
sötét: #8f8e86 a #2a2a27-en              → 4,37 : 1   (8×)
```

**Javítás:** a `--text-3` világos témában legalább `#6f6e68` legyen (ezt a `FEJLESZTESI_TERV.md` 9. pontja már előírta), sötétben a `--surface-2` fölötti használatnál egy fokkal világosabb.

---

### A09 · Akadálymentesség · WCAG 1.4.3 · az elsődleges gomb

**Az elsődleges gombon a fehér felirat 4,42:1 világosban és 3,20:1 sötétben; 4,5:1 kellene.**

Ez az app leggyakrabban megnyomott gombja: az oldalsáv „+ Rögzítés” gombja, a „Mind kifizetve”, a „Mentés most”. A felirat 14–15 px, normál vastagságú, így a nagy szövegre vonatkozó 3:1 nem alkalmazható.

```
#ffffff a #2a78d6-on (világos)  → 4,42 : 1   (42×)
#ffffff a #4a92e8-on (sötét)    → 3,20 : 1   (52×)
```

**Javítás:** a világos accent egy árnyalattal sötétebb (pl. `#2369c0` körül), a sötét témában az elsődleges gombon sötét felirat, vagy sötétebb gombszín.

---

### A10 · Akadálymentesség · WCAG 4.1.2 · Beállítások

**Az „Időszak” lenyíló felolvasott neve az összes lehetőségét tartalmazza.**

A `<select>` egy `<label>` belsejében van, `for`/`id` nélkül. Így a hozzáférhető név magába szívja mind a 21 `<option>` szövegét.

```
accessibleName: „Időszak 2025. augusztus (08.05.–09.04.) 2025. szeptember (09…”   nameSource: wrapping label
(probe-core → forms, teljes/*/*/07-beallitasok)
```

**Javítás:** a címke legyen külön elem `htmlFor`/`id` párral, vagy a select kapjon `aria-label="Időszak"`-ot. Az Áttekintés időszakválasztója már így működik (`aria-label`).

---

### A11 · Akadálymentesség · WCAG 2.5.8 · Tervező

**A tervcsúszkák 16 px magasak; az érintési célpontnak legalább 24 px kell.**

Képernyőnként 23 csúszka (a szélső mintában 38). Telefonon a 16 px-es sávon a hüvelykujj könnyen a szomszédos sort fogja meg.

```
probe-core → tapTargets.tooSmall (teljes/vilagos/375/03-tervezo):
  input „Fizetés terve”  297 × 16 px  …  23 elem
```

**Javítás:** a csúszka érintési magassága legalább 24 px (inkább 44), a látható sáv maradhat vékony.

---

### A12 · Akadálymentesség · WCAG 1.3.1, 2.4.6 · a négy fő képernyő

**Az Áttekintésen, a Rögzítésen, a Tervezőben és az Elemzésben nincs `<h1>`, a többi képernyőn van.**

A képernyőolvasó felhasználó a címsorok listájában nem találja az oldal nevét a leggyakrabban használt képernyőkön.

```
h1Count = 0:  01-attekintes, 02-rogzites, 03-tervezo, 04-elemzes, gyorsrögzítő
h1Count = 1:  05-szamlanaptar, 06-kategoriak, 07-beallitasok, első indítás
Áttekintés vázlata: H2 Teendők, H2 Futó egyenleg, H2 Kiadások havonta, H2 Megtakarítás és célok, H2 Kategóriák
```

**Javítás:** minden képernyőnek legyen egy `<h1>` (látható, vagy `sr-only`, ha a dizájn nem kér címet).

---

### A13 · Akadálymentesség · WCAG 4.1.2 · Elemzés

**A hőtérkép görgethető tárolója `<div tabindex="0">`, szerep és név nélkül.**

Billentyűvel elérhető (jó), de a képernyőolvasó csak szövegként jelenti be, nem tudni, mi az.

```
probe-focus → verdict.semantics: FAIL — <div tabindex="0"> with no role   („Kategória máj. jún. júl. aug…”)
```

**Javítás:** `role="region"` és `aria-label="Kategóriák időszakonként"`.

---

### A14 · Akadálymentesség · WCAG 2.4.7 · Beállítások

**A „Kezdőnap” dátummezőn nem jelenik meg az app fókuszkerete.**

A mező fókuszt kap, de `outline-style: none`, és nincs `box-shadow` sem. A Chrome csak a dátum egy szegmensét emeli ki, ami gyenge jelzés. Ez csak a 4 fókuszálatlan esetből 2. A másik kettő (az Elemzés keresőmezője) téves riasztás: ott a burkoló `.search-box:focus-within` adja a keretet.

```
teljes/*/1440/07-beallitasok.tab.json:  input „2026-10-05”  outlineStyle: none, boxShadow: none
```

**Javítás:** a dátummező kerete kézi ellenőrzést kér Safariban és Chrome-ban is. Ha valóban hiányzik, kapjon `:focus-within` keretet, mint a kereső.

---

### A15 · Megjegyzés · minden képernyő, 900 px alatt

**Az alsó sáv feliratai 11 px-esek.**

A próba 36 cellában jelzi ugyanazt a négy feliratot („Áttekintés”, „Rögzítés”, „Tervező”, „Továbbiak”). Ez nem WCAG-hiba, de ez a legkisebb szöveg az appban, és a leggyakrabban olvasott.

**Javítás:** 12 px, és a kiválasztott elemnél félkövér helyett szín és jelölő.

### A16 · Megjegyzés · Rögzítés

**A keret nevét viselő gomb 68–72 × 23 px.**

A WCAG 2.5.8 alól kivétel, mert az egész sorfej is kattintható (`onClick` a `rec-env-head`-en, `Record.tsx:649`). Csakhogy egérrel és érintéssel a sor, billentyűzettel a 23 px-es gomb a cél, és a sorfej `div`-je nem gomb.

### A17 · Megjegyzés · Kategóriák, Számlanaptár

**Sok vezérlő van az első képernyőn.**

- **Kategóriák:** 103–111 vezérlő, ebből 54–67 az első képernyőn (Hick-index 5,8–6,1; a jól hangolt képernyő 3,2–4,0 között van). A sok vezérlőt a soronkénti „Szerkesztés” gomb adja.
- **Számlanaptár:** 44–52 vezérlő, szinte mind az első képernyőn (5,5–5,7).

**Javítás:** a sor maga legyen a szerkesztés célja.

### A18 · Megjegyzés · első indítás

**A varázslóban nincs `main` tájékozódási pont.**

A mérés szerint nincs `main`, `nav` és `header` sem (`landmarks: main=0`). A többi képernyőn van `main`, két `nav`, `header` és `aside`.

### A19 · Megjegyzés · a mérés melléktermékei

- **A mintaadat hibája, nem az appé:** a „Legutóbbi rögzítések” „nov. 8. 16:41” dátumot mutatott a mai okt. 22. helyett. Ennek a mintában egy előre rögzített, jövőbeli tétel jövőbeli rögzítési ideje volt az oka. Javítva a `src/domain/sample.ts`-ben, teszttel.
- **A `probe-core` szerinti „1 élő régió”** az üzenetek konténere (`aria-live="polite"`). Ez megfelel a WCAG 4.1.3-nak.

---

## Ami jól működik

- **Fókusz:** 1339 Tab-leütésből 0 fókuszjelző bukott el kontraszton. A `:focus-visible` mindenhol illeszkedett, kivéve az A14-ben leírt két mezőt. A Tab-sorrend logikáját nem ellenőriztem, csak a jelzőt.
- **Nevek:** a 74 cellában 0 név nélküli és 0 ismétlődő nevű vezérlő van. Az ikongombok mind kaptak nevet, a gyorsbillentyű `aria-keyshortcuts="N"`, a `kbd` el van rejtve a felolvasó elől.
- **Kilógás:** a `teljes` mintán 0 vízszintes kilógás mind a négy szélességen, mindkét témában.
- **Oldalcímek (WCAG 2.4.2):** minden útvonalnak saját címe van („Tervező · Családi költségvetés”), és `<html lang="hu">`.
- **Sötét téma szöveges kontrasztja:** cellánként 0–5 hiba, szemben a világos téma 25+ hibájával. A sötét paletta szövegszínei jók, csak a gombfelirat (A09) és a `--surface-2` fölötti halvány szöveg bukik.
- **Hangsúly:** a félkövér szöveg aránya az első képernyőn 6–43%. A súly még hierarchiát hordoz, nem lett minden kiemelt.
- **Válaszidő:** 0 darab 50 ms-nál hosszabb feladat a betöltés alatt egyik cellában sem. Az első tartalmas festés 188–288 ms (fejlesztői szerveren).

## Hol kezdjük

A sorrend a hatás és a ráfordítás aránya szerint.

| # | Teendő | Megállapítás | Miért |
|---|---|---|---|
| 1 | A `--text-3` és az accent színének javítása | A08, A09 | Két token, több száz előfordulás, minden képernyő |
| 2 | `autoSkip` a grafikonokon | A04 | Egy sor; a futó egyenleg az app egyik fő üzenete |
| 3 | A három ellentmondó szám és szöveg | A01, A02, A03 | Néhány sor; a felhasználó bizalmát erodálják |
| 4 | Az `<h1>` a négy fő képernyőn, a select neve, a hőtérkép szerepe | A10, A12, A13 | Kis jelölési javítások |
| 5 | A változáscímke csak kereteken | A07 | Kevesebb zaj az Áttekintésen |
| 6 | A Tervező 1024 px-en és a hosszú nevek | A05, A06 | Az 5. fázis elrendezési munkájának része |
| 7 | A csúszkák érintési magassága | A11 | Telefonos Tervező |

## Amit nem fed le

- Képernyőolvasós végigjárás (VoiceOver, TalkBack). Ez a 1.2 (akadálymentességi átnézés) része.
- Nagyítás 200% és 400% mellett.
- Windows nagy kontrasztú mód.
- A fókusz takarása a ragadós alsó sáv alatt (WCAG 2.4.11). A `probe-focus` nem ad koordinátát, így nem mértem.
- Az éles build teljesítménye és a PWA offline működése.
