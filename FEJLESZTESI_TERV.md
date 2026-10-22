# Fejlesztési terv – 3. kör

A 2026-10-07-i kritikai átnézés (6 nézőpont, 88 ellenőrzött megállapítás) és a felhasználó döntései alapján.

**A felhasználó döntései**
- Csomagok: hibajavítás, „Jól állunk-e?”, teendők sáv, gyorsrögzítés, rugalmas keretek (átcsoportosítás és díjváltozás-javaslat, **rollover nélkül**), havi zárás és egyeztetés, adatbiztonság, elemzés, design-csiszolás (navigációval).
- A félretett pénzből (megtakarításból) való költés a kimutatásokban **kiadásként is látszódjon**, a futó egyenleget továbbra se érintse.
- **Nincs maradék-átvitel:** a ki nem költött keret a futó egyenlegbe megy.
- Mutatók: **csak a lényeg** – napi elkölthető összeg és tartalék hónapokban kifejezve. Nincs 50/30/20 és hasonló.
- Nem része ennek a körnek: nem havi (éves) számlák, cél-típusok, hitelkövetés, mobil szinkron, közzététel.

**Általános szabályok a megvalósításhoz**
- A felület magyar nyelvű, mondatkezdő nagybetűs. Összegek csak a `formatFt`-vel jelennek meg. „Kérjük”-öt és felkiáltójelet nem használunk.
- A számítási logika tiszta függvény a `src/domain/`-ben, Vitest-tesztekkel. Az adatbázis-műveletek a `src/db/repo.ts`-be, a felület a `src/ui/`-ba kerül. A stílus a `src/styles.css` meglévő CSS-változóit használja. Ikon csak olyan Tabler-ikon lehet, ami létezik.
- Minden módosító műveletnél legyen visszavonás (toast) vagy előtte pillanatkép. Az írási hibák toastként jelenjenek meg, ne csendben.
- Új npm-csomag nem kerülhet be.
- Minden lépés végén hibátlanul le kell futnia: `npx tsc`, `npx vitest run`, `npm run build`.
- A `KONCEPCIO.md` érintett fejezetei a viselkedéssel együtt frissülnek.

---

## 0. Hibajavítások

| ID | Hiba | Elvárt viselkedés |
|---|---|---|
| B1 | Ha a fizetésnapot vagy az első időszak kezdőnapját későbbre állítod, a `currentId < firstPeriodId` miatt az app összeomlik (fehér képernyő). | A `computeSummaries` a `min(firstPeriodId, currentId)`-tól számoljon. A fizetésnap mentésekor a már érvénytelen kezdőnap-felülírások törlődjenek, és erről jöjjön figyelmeztetés. A `periodRange` kapjon biztonsági felső korlátot (pl. 1200 lépés). |
| B2 | Nincs hibahatár. | Kell egy `ErrorBoundary` „Hiba történt” képernyővel, amelyen három lehetőség van: **Nyers adatmentés letöltése** (a Dexie táblák közvetlen dumpja, számolás nélkül, az export formátumában), **Újratöltés**, és a hiba részletei. Az írásoknál legyen egységes hibakezelés: egy `runWrite`/`safe` segéd, amely hiba esetén „Nem sikerült menteni: …” toastot ad. A dupla beküldés ellen az `AmountInput` kapjon „folyamatban” zárat. |
| B3 | Fix tétel (számla, egyösszegű bevétel, megtakarítás) a tervnél kisebb összeggel nem zárható le, örökre „részben” marad. | Az `Entry` kapjon `settles?: true` jelzőt: „ezzel a tétel ebben az időszakban lezárult”. A „Kifizetve” / „Megérkezett” / „Félretéve”, a „Maradék” és a „Más összeg” lezáró rögzítés, a „Részlet” nem az. Részleges állapotban legyen **„Kész, több nem lesz”** gomb (a legutolsó rögzítésre teszi rá a `settles` jelzőt). A `fixStatus(plan, actual, settled)` lezárt állapotban `paid`/`paidDiff` értéket adjon. A futó egyenlegben a folyamatban lévő időszak lezárt fix tétele a **tényt** számolja, nem a `max(tény, terv)`-et. A lezárt tétel nem lehet „lejárt”. Részleges állapotban is legyen „Visszavon”, és az egyes részletek törölhető pillekként látszódjanak, dátummal. A havi zárás „Nem volt” lehetőségéhez 0 Ft-os, `settles` jelzős rögzítés is megengedett (csak ehhez). |
| B4 | A Tervezőben az „Ettől a hónaptól” mód szó nélkül törli a későbbi egyedi terveket. Az egyes módosítások nem vonhatók vissza. A gyorskitöltés nulláz, és a bevételt is felülírja. | Minden soronkénti mentés után jöjjön toast a hatállyal, visszavonással (a kategória terveinek pillanatképe alapján). Például: „Élelmiszer: 95 000 Ft novembertől · a decemberi egyedi terv (150 000) törölve”. Ha a kategóriának későbbi egyedi terve van, a sor mutassa (pl. „dec.: 150 000”). A gyorskitöltés csak fix és keret kategóriákra fusson, és ne írjon 0-t, ha a forrásidőszakban nincs rögzítés. A mód ne maradjon meg localStorage-ban: minden megnyitáskor „Ettől a hónaptól” legyen. |
| B5 | Az alapértelmezett összeg módosítása visszamenőleg átírja a múltbeli terveket, és egy új kategória a múltban is kap tervet. | Az alapértelmezett összeg csak sablon legyen. **Indításkori migráció:** minden kategória, amelynek nincs tervrekordja a `firstPeriodId`-n vagy előtte, kapjon `{firstPeriodId, defaultAmount}` rekordot (idempotens). Az első indítás is így írja a terveket. Új kategória (a varázslón kívül) a mostani időszakra kap `defaultAmount` tervet, ha pedig a `firstPeriodId` korábbi, oda 0-t. Egy meglévő kategória alapértelmezett összegének módosítása `changePlan(cat, currentId, amount, 'from')`, toasttal. |
| B6 | A visszatöltés ellenőrzése felületes: végtelen ciklus, NaN, néma hiba. A Beállítások űrlap régi értékei felülírják a betöltött beállításokat. | Rekordszintű ellenőrzés és normalizálás alapértékekkel (forecastPeriods 6, openingBalance 0, archived false, order index, egész számú összegek). Érvénytelen rekordnál magyar hibaüzenet, mi és hol hibás. Legyen egy `migrateExport` lánc a sémaverziókhoz. Az `importAll` hibája jelenjen meg. A `BasicSettings` a `data.settings` változására szinkronizáljon (`key`). |
| B7 | A cél „szükséges havi összege” alulbecsül, ha a mostani időszakban már volt befizetés. | `required = ceil((remaining + mostani befizetés) / periodsLeft / 1000) × 1000`. Teszt: a javasolt összeget „ettől a hónaptól” tervként beállítva az állapot `onTrack` lesz. |
| B8 | Ha az app fizetésnapkor nyitva van, a régi időszakon ragad. | Ha a kiválasztott időszak a korábbi `currentId` volt, kövesse az újat. Kell egy éjféli időzítő a `today` frissítéséhez. A „Később” gomb is ugorjon az új időszakra. |
| B9 | A kategória típusának módosítása visszamenőleg átfordítja a múltat. | Ha a kategóriának van rögzítése, a típus csak a fix és a keret között váltható (mindkettő kiadás). Más váltásnál a mező legyen zárolt, rövid magyarázattal: „Archiváld, és hozz létre újat”. |
| B10 | A „megtakarítás összesen” ellentmond a célkártyáknak, és negatív összegnél a sáv tele jelenik meg. | A KPI alsor a célok `saved` összegét mutassa: „félretéve most: X”. A `Bar` 0 és 100% közé szorítson. |
| B11 | A delta-címke a folyamatban lévő hónapban a tervet hasonlítja a múlt havi tényhez. | A folyamatban lévő időszakban a delta a **tényt az előző időszak azonos napjáig tartó tényével** vesse össze (`Entry.date` alapján). Csak akkor jelenjen meg, ha az előző időszakban addig nem 0 volt a tény. |
| B12 | A Tervező csúszkájának maximuma befagy. A „12.5e” 125 000-ként rögzül. | A maximum a mentett értékből számolódjon (`useMemo`), húzás közben maradjon rögzített. A `parseAmount`: a pont csak akkor ezres elválasztó, ha pontosan 3 számjegy követi, egyébként tizedesjel. Így a „12.5e” 12 500, az „1.234.567” pedig 1 234 567. |
| B13 | Jövőbeli időszakba előre rögzített kiadás nem számít az előrejelzésbe. | Jövőbeli időszakban is `max(tény, terv)` legyen (lezárt fix tételnél a tény). Az UnexpectedExpense szövege és a `KONCEPCIO.md` frissüljön. |
| B14 | Első indítás: az app egy szinte lejárt időszakkal indul, minden számla „lejárt”, és a nyitó egyenleg kérdése félreérthető. | Ha a mostani időszak több mint fele eltelt, a varázsló ajánlja fel: „Kezdjük a következő fizetéssel (okt. 10.)” (ez az alapértelmezett), vagy „a mostani időszakkal”. A kérdés legyen: „Mennyi pénz van most a számlán?”, és lehessen negatív is. Ha a mostani időszakkal kezd, jöjjön egy lépés „Ebben az időszakban már megtörtént” címmel: a fix tételek egy jelölővel kifizetettként (terv összegével, `settles`) rögzíthetők. |
| B15 | Egyszerre csak egy toast él. | A toastok sorba álljanak (legfeljebb 3 látszik egyszerre), mindegyik a saját visszavonásával. A konténer legyen állandó `aria-live="polite"`. |

## 1. Navigáció és keret

- **Hash-alapú útvonalak:** `#/attekintes`, `#/rogzites`, `#/rogzites/<kategóriaId>`, `#/terv`, `#/elemzes`, `#/kategoriak`, `#/beallitasok`. A `?gyors` paraméter (pl. `#/attekintes?gyors`) megnyitja a gyorsrögzítőt. A `go()` `pushState`/hash-változással dolgozik, a vissza gesztus a `popstate`-re (`hashchange`) reagál. Kezdőképernyő hash nélkül: Áttekintés, nem az utoljára látott képernyő.
- **Asztali felső menü:** Áttekintés, Rögzítés, Tervező, Elemzés, Kategóriák, Beállítások, jobbra egy „+ Rögzítés” gomb (billentyű: `N`) és a mentés gomb.
- **Mobil alsó sáv (5 hely):** Áttekintés, Rögzítés, középen egy kiemelt **+** (gyorsrögzítő), Tervező, **Továbbiak** (alsó lap: Elemzés, Kategóriák, Beállítások).
- **PWA manifest:** `shortcuts`, „Gyors rögzítés” → `./#/attekintes?gyors`.
- Az Elemzés képernyő ebben a lépésben még csak egy üres helyőrző, a 8. pont tölti meg.

## 2. „Jól állunk-e?” – napi áttekintés

- **Domain (`src/domain/pace.ts`):**
  - Időszak napjai: eltelt (a mai nappal együtt) és hátralévő (a mai nappal együtt).
  - `envelopePace(plan, actual, elapsedRatio)` értékei: `ok`, `fast` (a tény > terv × eltelt arány × 1,1, és a tény > terv × 0,2), `over` (tény > terv). Mellette a lineáris tempó szerinti várható érték.
  - `dailyAllowance`: a napi pénzbe beleszámító keretek maradékának összege (a túllépés **csökkenti**), osztva a hátralévő napokkal.
  - **Tartalék-mutató:** az utolsó lezárt időszak végi egyenlege osztva az utolsó legfeljebb 3 lezárt időszak átlagos kiadásával, „hónapnyi kiadás” mértékegységben.
- **Kategória:** új `excludeFromDaily?: boolean` mező. A kategóriaszerkesztőben, keretnél: „Beleszámít a napi elkölthető összegbe”. Az alapértelmezés minden keretnél „igen”, kivéve a `role: 'unexpected'` kategóriát.
- **Áttekintés, hero kártya** a folyamatban lévő időszakban, az oldal tetején, nagy számmal: „Még elkölthető: 182 000 Ft”. Alatta: „12 nap van fizetésig (okt. 9-ig) · naponta ~15 000 Ft”. Mellette egy állapotmondat: a leggyorsabban fogyó keret („Az Élelmiszer gyorsabban fogy a tervezettnél, ezzel a tempóval ~18 000 Ft-tal lépi túl”), vagy „A terv szerint haladtok”.
  - Lezárt időszakban a hero zárómondat legyen („Az időszak +45 000 Ft-tal zárult”), jövőbeliben a terv összegzése.
- **KPI-k a hero alatt:**
  - Bevétel: tény, alsorban a terv.
  - Kiadás: eddigi tény, alsorban a várható.
  - Havi egyenleg: várható.
  - Futó egyenleg: alsorban „≈ 1,4 hónapnyi kiadás” (a tartalék-mutató).
- **Keretsávok** (Áttekintés és Rögzítés): vékony „ma” jelölő az eltelt idő arányánál. A szín a tempót követi: ok semleges akcentszín, `fast` borostyán, `over` piros. A sor szövege: „maradt 27 000 · ~2 200 Ft/nap”. A fix számláknál nincs tempó.

## 3. Teendők sáv

Az Áttekintésen, a hero alatt, csak a folyamatban lévő időszakban jelenik meg, legfeljebb 5 elemmel:
- lejárt, vagy 5 napon belül esedékes, még le nem zárt fix számla, „Kifizetve” gombbal (ugyanaz a művelet és visszavonás, mint a Rögzítésen);
- egyösszegű bevétel, ami az időszak 3. napja után sem érkezett meg, „Megérkezett” gombbal;
- `fast` vagy `over` állapotú keret (legfeljebb 2), ami a Rögzítés sorára visz;
- lemaradó cél, ami a Tervezőbe visz;
- „N napja nem rögzítettél semmit” (4 nap felett);
- elavult mentés.

Ha nincs teendő, egy sor jelenik meg: „Minden rendben”.

## 4. Gyorsrögzítés

- **`QuickEntry` panel:** mobilon alsó lap, asztalon középre igazított panel. Nem `position: fixed` iframe-ben, hanem az app saját rétege.
  - Felül nagy, automatikusan fókuszált összegmező (16 px felett, `inputmode="decimal"`).
  - Alatta a **keretkategóriák chipjei**, az elmúlt 60 nap használati gyakorisága szerint rendezve. Egy chipre koppintás rögzít, toasttal és visszavonással.
  - Külön sorban a **még le nem zárt, esedékes fix számlák** chipként („Áram · 18 000”). Üres összegmezővel a koppintás a terv összegével zár, beírt összeggel azzal.
  - „+ megjegyzés” kapcsoló.
  - Az új időszak első 3 napjában egy időszakválasztó is megjelenik („Okt. | Szept.”).
  - Egy link az eddigi „Váratlan kiadás” panelre (megtakarításból fizetéshez).
- **`suggestedAmounts(entries, categoryId)`** (domain, tesztelve): az utolsó 3 időszak rögzítéseiből a 3 leggyakoribb, 100 Ft-ra kerekített összeg, plusz a legutóbbi. Ha nincs adat, a +5e/+10e/+20e marad. A Rögzítés keretsorai is ezt használják.
- **Megnyitás:** a + gomb, az `N` billentyű, a `?gyors` paraméter, és a PWA-parancsikon.
- **Rögzítés képernyő átrendezése:**
  - A sorrend: Keretek, Fix számlák, Megtakarítás, Bevételek.
  - A keretsorok kompaktak (ikon, név, sáv, „maradt · /nap”), koppintásra nyílnak ki. Kinyitva: okos gyorsgombok, összegmező, megjegyzés-kapcsoló, és egy ⋯ menü „Havi összeg megadása” ponttal. Egyszerre egy sor lehet nyitva.
  - A lezárt fix számlák összecsukódnak („6 / 8 kifizetve · mutasd”).
  - A „Váratlan kiadás” gomb másodlagos stílusú.
  - Ha a képernyő kategóriára fókuszálva nyílik meg, a sor kinyílik, és az összegmező fókuszt kap.
- **„Legutóbbi rögzítések”:** összecsukható lista a Rögzítés tetején, az utolsó 10 rögzítéssel minden kategóriából (ikon, összeg, megjegyzés, „ma 18:42”, törlés).

## 5. Rugalmas keretek (rollover nélkül)

- **Átcsoportosítás:** a `fast` vagy `over` állapotú keret sorában (és a teendőknél) egy „Fedezet áthozása” gomb. Megnyitja azoknak a kereteknek a listáját, ahol van maradék („Szabadidő · maradt 18 000”). Az összeg előre ki van töltve a túllépéssel, vagy ha az kisebb, a forrás maradékával. A háttérben két `'only'` terv-művelet fut az aktuális időszakra, egyetlen visszavonással. A felület kimondja: „A futó egyenleg nem változik, csak átrendeződik.”
- **Díjváltozás-javaslat:** ha egy fix számla lezárva, a tervtől eltérő összeggel áll, a sor alatt ez jelenik meg: „Új díj: 8 350 Ft. Legyen ez a terv ettől a hónaptól?” [Igen] [Nem]. Az „Igen” `changePlan('from')` hívás toasttal és visszavonással. A „Nem” időszakonként és kategóriánként megjegyzi az elutasítást (localStorage).

## 6. Havi zárás és egyeztetés

- **Korrekciók:**
  - Új Dexie-tábla (`version(2)`): `adjustments {id, periodId, date, amount (előjeles), note, createdAt}`.
  - A `computeSummaries` hozzáadja a korrekciókat a nettóhoz (`PeriodSummary.adjustment`).
  - Az export `schemaVersion` értéke 2 lesz, kap `adjustments` mezőt. Az 1-es verzió `[]` értékkel migrálódik.
- **`balanceNow`** (domain): az utolsó lezárt időszak végi egyenlege, plus a folyamatban lévő időszak **tényleges** nettója és korrekciói.
- **Egyeztetés:** az Áttekintés futó egyenleg kártyáján egy „Egyeztetés” gomb, a Beállításokban pedig egy szakasz.
  - A kérdés: „Mennyi pénz van most összesen a számlán (és készpénzben)?”
  - A különbség korrekcióként rögzül a folyamatban lévő időszakban, „Egyeztetés” megjegyzéssel, visszavonással.
  - A korrekciók listája a Beállításokban látszik, törölhetően.
- **Havi zárás** (az „Új időszak kezdődött” sáv helyett): a sáv szövege „Szeptember lezárása · ~1 perc” [Indítás] [Később]. Lépések:
  1. **Hiányzó tételek:**
     - Le nem zárt fix tételek (számla, bevétel, megtakarítás): „Kifizetve (terv összegével)”, „Más összeg”, vagy „Nem volt” (0 Ft, `settles`).
     - 0 tényű keretek: „Tényleg 0 volt?”, gyors hozzáadással.
  2. **Összegzés:** bevétel, kiadás, félretéve, az időszak nettója, a 3 legnagyobb túllépés és maradék.
  3. **Egyeztetés:** opcionális, ugyanaz az űrlap, mint fent.
  4. **Mentés:** letöltés.

  A végén a `settings.lastClosedPeriodId` frissül. A folyamat bármikor kihagyható, és a Beállításokból később is elindítható.

## 7. Adatbiztonság

- **Pillanatképek:** külön Dexie-adatbázisban (`csaladi-koltsegvetes-snapshots`), a `snapshots {id, createdAt, reason, data (export JSON szöveg), counts}` táblában.
  - Mikor készül: naponta az első megnyitáskor, minden új időszak kezdetén, továbbá **visszatöltés, minden adat törlése, gyorskitöltés, pillanatképből visszaállítás és sémamigráció előtt**.
  - Megőrzés: 14 napi, 12 időszakos és 10 eseményhez kötött pillanatkép.
  - A Beállításokban egy „Pillanatképek” lista: dátum, ok, darabszámok, „Visszaállítás” és „Letöltés”.
- **Biztonságos visszatöltés:**
  - Az előnézet a fájlt a helyi adatokkal is összeveti: legutóbbi rögzítés itt és ott, rögzítések száma. Ha a fájl régebbi, piros figyelmeztetés jelenik meg: „A mentés régebbi, mint a jelenlegi adatok; N rögzítés elveszne”.
  - Betöltés előtt pillanatkép készül, utána a toast felajánlja a visszavonást.
- **Minden adat törlése:** előtte pillanatkép készül, és felajánlja a letöltést. A megerősítéshez be kell írni: „TÖRLÉS”.
- **Mentési emlékeztető:**
  - Kockázatalapú: az utolsó letöltés óta történt változások száma (rögzítések, tervek és korrekciók `createdAt` értéke a `lastExportAt` után, illetve egy egyszerű változásszámláló a settingsben).
  - A fejléc mutassa: „Letöltve 12 napja · 23 új változás”. Figyelmeztetés: 7 napnál régebbi letöltés és van változás, vagy 30-nál több változás.
  - A „Mentve” felirat helyett „Letöltve” legyen.
- **Telepítés és származási hely (origin):**
  - Ha az app nem telepített módban fut (`display-mode: standalone` / `navigator.standalone`), az első indítás és a Beállítások figyelmeztessenek: a telepített app (Dock, főképernyő) **külön tárolót** kap, ezért érdemes telepítve kezdeni, vagy mentéssel átvinni az adatokat.
  - A Beállítások mutassa az origint.
- A dev módú `window.db` maradjon csak fejlesztői módban.

## 8. Elemzés (új képernyő)

- **Időablak:** „Utolsó 12 időszak” vagy naptári év választó.
- **Hőtérkép:**
  - A sorok a kategóriák, csoportonként összecsukhatók. Az oszlopok az időszakok, a lezártak és a folyamatban lévő.
  - A cella a tényt mutatja („112e”). A színe a tény/terv arány szerint alakul: ≤ 90% zöldes, 90–100% semleges, 100–115% borostyán, > 115% piros. Világos és sötét módban is olvasható legyen.
  - Cellára vagy sorra kattintva megnyílik a kategória trendje: a tény vonalként, a terv lépcsőként, a 3 havi átlag szaggatott vonalként.
- **Éves összesítő:** kategóriánként az idei összeg és a tavalyi azonos időszakok összege, ha van adat, változással. Mellette a teljes bevétel, kiadás és félretétel.
- **A megtakarításból fizetett költés kiadásként** (a felhasználó döntése):
  - A felhasználás (`withdrawal`) kap egy opcionális `spendCategoryId` mezőt. A Váratlan kiadás panel megtakarításból ága és a „Felhasználás” panel kínáljon kategóriát („Mire ment?”).
  - Az Elemzés és a havi kiadás-grafikon ezeket az adott kategória kiadásaként mutassa, „megtakarításból” jelöléssel (halványabb/sraffozott rész, tooltipben külön).
  - A futó egyenleg nem változik.
- **#címkék és kereső:**
  - A megjegyzésekben a `#szó` címke.
  - Lista: címke, összesen, darabszám. Kattintásra a hozzá tartozó rögzítések jelennek meg.
  - Kereső az összes rögzítés megjegyzésében, találati listával: dátum, kategória, összeg, megjegyzés.
  - A megjegyzésmezőben javaslatok a korábbi címkékből (`datalist`).
- **Az Áttekintés grafikonjai** alapból ablakkal jelennek meg: az utolsó 6 lezárt, a folyamatban lévő és az előrejelzés.

## 9. Design-csiszolás

- **Színek:**
  - A keretsávok „rendben” állapotban semleges akcentszínt kapnak, figyelmeztetésnél borostyánt, túllépésnél pirosat. A kategóriaszín csak az ikonokban és a grafikonokban jelenik meg.
  - A palettában nem lehet a `--warn-fill`/`--danger-fill` színével azonos vagy ahhoz nagyon közeli szín. A sárga kategóriaszín cserélendő.
  - A „Többi” szín ne egyezzen az „Egyéb” színével.
- **Kontraszt (WCAG AA):**
  - A `--text-3` szöveges használata legalább 4,5:1 legyen (pl. `#6f6e68` világosban).
  - A kategóriaikon színe világos módban a szín sötétített (`color-mix` feketével), sötét módban világosított változata legyen, legalább 3:1-es kontraszttal.
  - Az elsődleges gombon a fehér felirat legalább 4,5:1 legyen.
- **Kézi témaválasztó** (Rendszer / Világos / Sötét) a Beállításokban. Ehhez `data-theme` kell a `html`-en, és a CSS kapjon `[data-theme='dark']` blokkot. A grafikon színei is kövessék.
- **Mobil:**
  - 720 px alatt minden `input` és `select` 16 px-es (az iOS ne nagyítson rá).
  - Az érintési célpontok legalább 40 px-esek. A pillek törlőgombja kapjon nagyobb érintési felületet.
- **Grafikonok:**
  - Futó egyenleg:
    - a nulla alatti terület piros, a nullavonal hangsúlyos;
    - a legalacsonyabb előrejelzett pont felirattal („mélypont: márc. −45 000 Ft”);
    - „ma” jelölő;
    - évszám a feliratokban (januárnál, vagy ha más év: „jan. ’27”);
    - keskeny képernyőn `autoSkip`.
  - Halmozott oszlopdiagram: a folyamatban lévő hónapban a tény tömör, a hátralévő terv halvány. Érintőképernyőn az első koppintás csak tooltipet mutat, időszakot váltani a tengelyfeliratra vagy egy második koppintással lehet.
- **Akadálymentesség:**
  - Az összegmezők `aria-label` attribútuma tartalmazza a kategória nevét.
  - A hibaüzenetet `aria-describedby` kösse a mezőhöz, és legyen `role="alert"`.
  - `prefers-reduced-motion` esetén nincs animáció.
