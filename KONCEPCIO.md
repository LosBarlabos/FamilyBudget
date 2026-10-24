# Családi költségvetés – koncepció

Egyfelhasználós, böngészőben futó webapp a család havi költségvetésének tervezésére és követésére.

## 1. Alapelvek

- **Terv → tény → egyenleg.** Minden nézet ezt a hármat mutatja: mennyit terveztünk, mennyi ment el, és hova vezet ez a futó egyenlegben.
- **A múlt tény, a jövő előrejelzés.** A futó egyenleg a lezárt időszakokban tényadatból, a folyamatban lévő és jövőbeli időszakokban a tervből számol (vagy a már rögzített tényből, ha az nagyobb). Ha a tervet módosítjuk, az előrejelzés azonnal frissül.
- **Kevés gépelés.** Nem kell tételesen rögzíteni: kategóriánként egy vagy több összeget írunk be, a fix számlák egy kattintással kifizethetők.
- **Interaktív, azonnali visszajelzés.** Szerkesztés helyben, nincs külön mentés gomb. Minden módosítás után „Visszavonás” üzenet jelenik meg megerősítő ablak helyett. Az üzenetek sorba állnak (egyszerre legfeljebb 3 látszik, a többi akkor jelenik meg, amikor hely szabadul fel), mindegyik a saját visszavonásával. Az Enter mindenhol rögzít.
- **Nincs csendes hiba.** Ha egy mentés nem sikerül, „Nem sikerült menteni: …” üzenet jelenik meg. Megjelenítési hibánál fehér képernyő helyett „Hiba történt” oldal jön, nyers adatmentéssel (lásd 5. fejezet).
- **Átlátható.** Egy képernyőn látszik a hónap állása, a hónapok egymás mellett összevethetők.

## 2. Döntések

| Kérdés | Döntés |
|---|---|
| Rögzítés részletessége | Kategóriánként, akár több részletben. Nincs tételes vásárlási lista. |
| Adatbevitel | Kézi |
| Felhasználók | Egy |
| Platform | Webapp (PWA), asztali gépre optimalizálva, de telefon szélességen is használható |
| Hónap | Fizetéstől fizetésig (beállítható fizetésnap) |
| Adattárolás | Böngésző (IndexedDB), rendszeres JSON exporttal |
| Nyelv, pénznem | Magyar, HUF (egész forint) |

## 3. Fogalmak

### Időszak
- **A felületen „hónap” a neve** (a 2026-10-23-i szövegdöntés): a család így gondol rá, és az első indítás is így vezeti be („A hónap fizetéstől fizetésig tart”). A dokumentum és a kód az „időszak” szót használja, a felület csak ott, ahol a dátumtartomány a lényeg (Beállítások → „Időszak kezdőnapja”).
- A fizetésnaptól a következő fizetésnap előtti napig tart. Például 10-i fizetésnapnál az „Október” időszak 2026.10.10-től 2026.11.09-ig.
- A neve annak a hónapnak a neve, amelyikben kezdődik. Azonosító: `2026-10`.
- Egy adott időszak kezdőnapja kézzel felülírható (pl. ha a fizetés hétvége miatt korábban jön). Az előző időszak vége ehhez igazodik.
- Állapot a mai dátum szerint: **lezárt** (múlt), **folyamatban**, **jövőbeli**.
- A mai dátum éjfélkor (és az ablak előtérbe kerülésekor) frissül. Ha a folyamatban lévő időszak volt kiválasztva, fizetésnapkor a nyitva hagyott app is átlép az újra; egy kézzel választott másik időszak kiválasztva marad.

### Kategóriatípusok
| Típus | Példa | Rögzítés |
|---|---|---|
| `fix` – fix számla | Telefon, áram, hitel | „Kifizetve” (a terv összegével), „Más összeg”, „Részlet”, majd „Maradék kifizetve” vagy „Kész, több nem lesz” |
| `keret` – változó kiadás | Élelmiszer, tankolás | Részletek hozzáadása (gyorsgombok a szokásos összegekkel, adat nélkül +5 000, +10 000, +20 000 Ft), vagy egy havi összeg megadása |
| `bevetel` | Fizetés, családi pótlék | Mint a `fix` vagy a `keret`, a `bevetelMod` mező szerint |
| `megtakaritas` | Megtakarítás, nyaralás alap | Mint a `fix`. A futó egyenlegből kivonódik, és külön összesítve látszik. |

- A kategóriákhoz tartozhat egy **csoport** (pl. „Rezsi”: áram, gáz, víz), ami csak a megjelenítést szolgálja: az irányítópulton a csoport összecsukható. A csoport egyszintű.
- A `fix` kategóriának lehet **esedékességi napja** (a hónap napja). Ha az időszakon belül ez a nap elmúlt, és a számla nincs kifizetve, a tétel **lejártként** kiemelve jelenik meg. Terv nélkül (0 Ft) nincs mit kifizetni, így ilyenkor nem lejárt.
- Kategóriát nem törlünk, hanem archiválunk, így a múltbeli adatok megmaradnak.

### Terv
- Időszakonként és kategóriánként egy tervezett összeg.
- **Öröklődés:** egy időszak terve egy kategóriára az adott időszak saját tervrekordja. Ha ilyen nincs, a legközelebbi korábbi időszaké. Ha az sincs, a kategória alapértelmezett összege.
  - Ezért nem kell minden hónapot kitölteni: a terv addig érvényes, amíg át nem írjuk.
- **Az alapértelmezett összeg csak sablon,** a múltbeli terveket nem írja át:
  - Minden kategóriának van tervrekordja az első időszakon (vagy előtte). Az első indítás így írja a terveket, a régebbi adatokat pedig egy indításkori, idempotens migráció egészíti ki (a visszatöltés után is).
  - Új kategória (a varázslón kívül) a mostani időszaktól kapja az alapösszegét; ha az első időszak korábbi, oda 0 Ft-os terv kerül, mert a múltban még nem létezett.
  - Egy meglévő kategória alapösszegének módosítása „ettől a hónaptól” tervmódosítás a mostani időszakra, visszavonással. A mostani időszak terve és a későbbi egyedi tervek helyére is ez kerül; a törölt egyedi terveket a szerkesztő mentés előtt, az üzenet mentés után megnevezi.
  - Ha a költségvetés még nem indult el (a mai nap az első időszak elé esik), mindkettő az első időszaktól hat, mert az előtte lévő időszakban csak a tény számít.
  - **„Csak erre a hónapra”**: tervrekordot ír az adott időszakra, és a következő időszakra is írja az addig érvényes értéket, hogy a változás ne öröklődjön tovább.
  - **„Ettől a hónaptól”**: tervrekordot ír az adott időszakra, és törli a kategória későbbi tervrekordjait.

### Tény (rögzítés)
- Egy rögzítés: időszak, kategória, összeg, dátum, opcionális megjegyzés.
- Egy kategória ténye az időszakban = a rögzítések összege.
- **Lezárás (fix tételnél: számla, egyösszegű bevétel, megtakarítás):** a rögzítés `settles` jelzője azt jelenti, hogy a tétel ebben az időszakban kész, több rögzítés nem várható, akkor sem, ha a tény eltér a tervtől.
  - A jelző csak egy összegben rögzülő tételnél számít. Ha a kategória keretté válik (fix→keret, vagy a bevétel „Több részletben” módra vált), a korábbi jelző figyelmen kívül marad, és a keret szabályai érvényesek.
  - Lezáró rögzítés: „Kifizetve” / „Megérkezett” / „Félretéve”, „Maradék” és „Más összeg”. A „Részlet” nem lezáró.
  - Részleges állapotban a „Kész, több nem lesz” a legutolsó rögzítésre teszi rá a jelzőt.
  - 0 Ft-os rögzítés csak lezárásként megengedett (a havi zárás „Nem volt” lehetősége).
- A „Havi összeg megadása” mód a kategória összes rögzítését egyetlen rögzítésre cseréli az időszakban.

### Futó egyenleg
Kategóriánként és időszakonként a figyelembe vett összeg:

| Időszak | Kiadás, megtakarítás | Bevétel |
|---|---|---|
| Lezárt | tény | tény |
| Folyamatban | max(tény, terv) | max(tény, terv) |
| Jövőbeli | max(tény, terv) | max(tény, terv) |

- A lezárt (`settles`) fix tétel a folyamatban lévő és a jövőbeli időszakban is a **tényt** számolja: több nem jön, akkor sem, ha kevesebb volt a tervnél.
- A jövőbeli időszakba előre rögzített, a tervnél nagyobb tény (pl. egy már befizetett tábor) így az előrejelzésben is látszik.

```
nettó(i)     = Σ bevétel − Σ kiadás − Σ megtakarítás
egyenleg(i)  = nyitó egyenleg + Σ nettó(első időszak … i)
megtakarítás összesen(i) = Σ megtakarítás(első időszak … i)
```
- A nyitó egyenleg az első időszak elején érvényes összeg, a beállításokban adható meg (negatív is lehet).
  - Az első indításkor a kérdés a mostani számlaegyenleg. Ha a mostani időszakkal kezdünk, a nyitó egyenleg ebből visszaszámolva adódik: + az ebben az időszakban már kifizetett és félretett, − a már megérkezett bevétel.
  - Ha a következő fizetéssel kezdünk, a mostani (még az első előtti) időszak minden kategóriája 0 Ft-os tervet kap, így ott csak a ténylegesen rögzített kiadás csökkenti az egyenleget.
- Az időszakok listája az első időszaktól indul. Ha a fizetésnap vagy egy kezdőnap módosítása miatt a mai nap az első időszak elé esik, a lista a folyamatban lévő időszaktól indul, hogy az mindig szerepeljen.
  - Az első időszak előtti időszakban külön terv nélkül 0 a terv (nem az alapösszeg), így ott is csak a rögzített tételek számítanak, és semmi nem számít kétszer. A fejléc sávja jelzi, hogy az első időszak még nem kezdődött el.
- Előrejelzési távolság: a folyamatban lévő időszak után 6 időszak (beállítható).
- A futó egyenleget nem tároljuk, mindig kiszámoljuk.

### Megtakarítási célok
- Egy `megtakaritas` kategóriának lehet **célösszege**, **határideje** (egy időszak, amelynek a végéig össze kell gyűlnie) és **induló összege** (ami már félre van téve). Célösszeg nélkül egyszerűen az összegyűlt összeget mutatja.
- **Összegyűlt** = induló összeg + befizetések (minden időszakból) − felhasználás.
- **Felhasználás:** a félretett pénzből elköltött összeg (`Entry.kind = 'withdrawal'`). A cél egyenlegét csökkenti, a futó egyenleget nem érinti, mert a pénz már a félretételkor kikerült belőle. A „tény” összegekbe nem számít bele.
- **Előrejelzés:** a folyamatban lévő időszaktól kezdve időszakonként a terv még be nem fizetett része (`max(0, terv − tény)`) adódik hozzá, a lezárt időszakokban semmi; az első időszak, amelynek végére eléri a célt.
- **Szükséges havi összeg:** az a legkisebb „ettől a hónaptól” terv (a folyamatban lévő időszaktól), amellyel a cél a határidőre összegyűlik, ezresre felfelé kerekítve. Alapesetben `(hiányzó + a mostani időszak befizetése) / hátralévő időszakok` (a folyamatban lévővel együtt).
  - A határidőn belüli, előre (jövőbe) rögzített befizetés ugyanúgy a terv része, mint a mostani időszaké; ha nagyobb a havi összegnél, az az időszak nem ad hozzá többet.
  - A lezárt befizetésű időszak kimarad, a hiányzó a többi időszakra oszlik. Ha a határidőig már nincs nyitott időszak, a cél azt mutatja: „a határidőig már nem gyűlik össze”.
  - A Tervező „Terv: havi …” gombja mindig a folyamatban lévő időszaktól állítja be, akármelyik időszak van kiválasztva.
- **Állapot:** Elérve / Időben / Lemarad (a határidőre nem gyűlik össze) / Nincs havi terv.

### Váratlan kiadás
- A Rögzítés képernyő „Váratlan kiadás” gombja (vagy a gyorsrögzítő „Váratlan kiadás” linkje, `#/rogzites/varatlan`) alsó lapon (asztalon panelen) nyílik: összeg, „mire ment?” megjegyzés, és hogy miből fizeted. Bezáráskor a fókusz a gombra kerül vissza.
  - **A havi pénzből:** alapértelmezésben a „Váratlan kiadások” kategóriába (`Category.role = 'unexpected'`; ha még nincs, létrejön), de bármelyik kiadási kategória választható (pl. autószerelés → Közlekedés).
  - **Megtakarításból:** felhasználásként rögzül a választott megtakarításon; nem lehet több, mint ami rajta van.
- Beírás közben látszik a hatás: mennyivel csökken a futó egyenleg, vagy mennyit fedez még a választott keret.
- A „Váratlan kiadások” kategóriának a Tervezőben adható havi tartalék-keret. Terv nélkül (0 Ft) a kiadás „nem tervezett”-ként jelenik meg, nem túllépésként.

### Tempó és napi elkölthető összeg
- **Időszak napjai:** az eltelt és a hátralévő napok is tartalmazzák a mai napot (egy 31 napos időszak 11. napján 11 nap telt el, 21 van hátra). Az eltelt idő aránya (11/31) a tempó mércéje és a sávokon a „ma” jelölő helye.
- **Keret tempója** (csak a folyamatban lévő időszakban):
  - *rendben*;
  - *gyorsan fogy*, ha a tény több, mint a terv × eltelt arány × 1,1, és a terv 20%-át is meghaladja (az időszak elején egy nagybevásárlás így még nem riaszt);
  - *túllépve*, ha a tény több a tervnél.
  - A várható kiadás a lineáris tempó szerint: tény / eltelt arány. Az időszak első 6 napjában nincs vetítés (egy nagybevásárlás a keret többszörösére nagyítódna): ilyenkor a várható érték a tény, és a szöveg az eddig elfogyott arányt írja („eddig 50 000 Ft, a terv 25%-a”).
  - Terv nélkül (0 Ft) nincs tempó és túllépés sem: a kiadás „nem tervezett”. Ha viszont van napi keretterv, a napi összegbe számító, terv nélküli keretből való költés csökkenti a napi összeget, ezért figyelmet kér (állapotmondat, teendő, Rögzítés).
  - Lezárt és jövőbeli időszakban, valamint a fix számláknál nincs tempó, csak a túllépés számít.
- **Napi elkölthető összeg:** a napi összegbe beleszámító keretek maradékának összege (terv − tény; a túllépés csökkenti, így negatív is lehet), osztva a hátralévő napokkal, 100 Ft-ra lefelé kerekítve. A fix számlák és az archivált keretek nem számítanak bele (az időszak közben archivált keret eddigi költése nem túlköltés).
  - Alapból minden keret beleszámít, kivéve a váratlan kiadásokét. A kategóriaszerkesztőben kapcsolható („Beleszámít a napi elkölthető összegbe”).
  - A napi összegen kívüli keretnél (pl. váratlan kiadások, ritka nagy vásárlás) nincs tempó, „ma” jelölő és napi összeg, csak a túllépés látszik.
- **Tartalék-mutató:** az utolsó lezárt időszak végi egyenlege osztva az utolsó legfeljebb 3 lezárt időszak átlagos kiadásával (fix és keret), „hónapnyi kiadás” mértékegységben (pl. „≈ 1,4 hónapnyi kiadás”). Lezárt időszak nélkül nem jelenik meg, és mivel a mai állapotot írja le, csak a folyamatban lévő időszakban látszik.

### Rugalmas keretek (maradék-átvitel nélkül)
- **Nincs maradék-átvitel:** a ki nem költött keret nem viszi át a maradékát a következő időszakra, hanem a futó egyenlegbe megy (a lezárt időszak a tényt számolja).
- **Átcsoportosítás:** egy hónapon belül a keretek terve átrendezhető. Ha egy keret gyorsan fogy, túl van lépve, vagy terv nélkül volt belőle költés, az „Átcsoportosítás” egy másik keret maradékából emeli a tervét.
  - Csak a folyamatban lévő és a jövőbeli időszakban érhető el; a lezártban a terv már nem változtat semmin. A költségvetés első időszaka előtt sem (ott szándékosan minden terv 0, csak a tény számít), és a terv nélküli költésnél sem kínálja fel, ha egyik keretnek sincs terve.
  - Forrás az a (nem archivált) keret lehet, amelyben maradt pénz (terv − tény > 0), a maradék szerint csökkenő sorrendben („Szabadidő · maradt 18 000 Ft”).
  - Az összeg előre ki van töltve a túllépéssel (gyors fogyásnál a tempó szerint várható túllépéssel, 100 Ft-ra felfelé kerekítve), vagy ha a forrás maradéka kisebb, azzal. Az időszak első napjaiban, amikor még nincs vetítés, üres. A forrás maradékánál több nem hozható át, így a forrás nem kerül túllépésbe.
  - A háttérben két „csak erre a hónapra” tervmódosítás fut (a forrás terve csökken, a célé ugyanennyivel nő), egyetlen visszavonással. A következő időszak mindkét keretnél a korábbi tervvel folytatódik. A visszavonás csak azt az egy átcsoportosítást vonja vissza: ha közben egy másik módosítás is érintette a keretet (pl. két forrásból ment át ugyanabba), az megmarad, és csak ennek az összege megy vissza.
  - A tervek összege nem változik, ezért gyors fogyásnál a futó egyenleg sem: a lap kimondja, hogy „A futó egyenleg nem változik, csak átrendeződik.” A túllépett keret viszont eddig is a tényével számított (max(tény, terv)), így ami a túllépést fedezi, azt a forrásból már nem számolja kétszer: ilyenkor a lap azt mondja, hogy a tervek összege nem változik, de a futó egyenleg ennyivel javul. A „Még elkölthető” összeg akkor változik, ha a forrás és a cél közül csak az egyik számít a napi összegbe.
- **Díjváltozás-javaslat:** ha egy fix számla a tervtől eltérő összeggel lezárult (vagy a tervnél többel kifizették), a Rögzítésen a sora alatt megjelenik: „Új díj: 8 350 Ft. Legyen ez a terv ettől a hónaptól?” [Igen] [Nem].
  - Az „Igen” „ettől a hónaptól” tervmódosítás a számla időszakától, a Tervezőhöz hasonló üzenettel és visszavonással.
  - A „Nem” időszakonként és kategóriánként megjegyzi az elutasítást (a böngészőben), szintén visszavonható üzenettel.
  - Csak a folyamatban lévő és a jövőbeli időszakban, az első időszaktól kezdve jelenik meg. Nem jelenik meg „Nem volt” (0 Ft) lezárásnál, terv nélküli számlánál, és ha a következő időszak terve már az új díj.
  - A javaslatos számla a kifizetett számlák között sem csukódik össze, hogy a kérdés látsszon.

### Állapotjelzések
- **Fix tétel:** nincs fizetve / részben fizetve (hátralék látszik) / kifizetve. Ha az összeg eltér a tervtől, „Kifizetve (eltér)”. A lezárt tétel a tervnél kisebb összeggel is kifizetett, és nem lehet lejárt.
- **Keret sáva:** a színe a tempót követi: rendben semleges akcentszín, gyors fogyásnál borostyán, túllépésnél piros. A kategória színe csak az ikonon látszik. A folyamatban lévő időszakban egy vékony „ma” jelölő mutatja az eltelt idő arányát. A sor szövege: „maradt 27 000 Ft · ~2 200 Ft/nap”, túllépésnél „túllépés 4 000 Ft”.

## 4. Képernyők

A rögzítő képernyő és az irányítópult tervezésekor készült két interaktív vázlat a mérvadó minta.

### Navigáció
- **Útvonalak (hash):** `#/attekintes`, `#/rogzites`, `#/rogzites/<kategóriaId>`, `#/terv`, `#/elemzes`, `#/kategoriak`, `#/beallitasok`; az új cél űrlapja `#/kategoriak/uj-cel`, a Váratlan kiadás panel `#/rogzites/varatlan`.
  - A képernyőváltás új előzménybejegyzést kap, így a böngésző Vissza gombja és a mobil vissza gesztus az előző képernyőre visz, a telepített app nem lép ki. Ugyanazon a képernyőn belüli váltás (pl. másik kategóriára fókuszálás) nem ad új bejegyzést.
  - A `#/rogzites/<kategóriaId>` egyszer görget a kategória sorához és felvillantja (a keretsort kinyitja, az összecsukott kifizetett számlát előhozza), utána a kategória kikerül az URL-ből. Így a vissza lépés és az újratöltés nem ugrik oda újra, a felhasználó ott folytatja, ahol abbahagyta.
  - Hash nélkül és ismeretlen útvonalnál az Áttekintés nyílik meg, nem az utoljára látott képernyő. Az első indítás varázslója után is.
  - A `?gyors` paraméter (pl. `#/attekintes?gyors`) a gyorsrögzítőt nyitja meg. A PWA-parancsikon („Gyors rögzítés”: az app ikonján hosszan nyomva Androidon, illetve asztali Chrome-ban és Edge-ben) is ide visz.
- **Három elrendezés a szélesség szerint** (a design-rendszer elrendezési osztályai, `docs/design/05-design-rendszer.md`):
  - **Széles (1024 px-től):** bal oldalsáv: a „Kiadás rögzítése” gomb (billentyű: `N`, ha épp nem egy mezőben gépelünk), alatta a menü (Áttekintés, Keretek és számlák, Tervező, Elemzés, Számlanaptár, Kategóriák, Beállítások), alul a mentés állapota.
  - **Közepes (640–1023 px):** ugyanez a menü keskeny sínként, ikonnal és rövid felirattal (Keretek, Naptár); a rögzítés négyzetes gomb a sín tetején.
  - **Kompakt (640 px alatt):** fent fejléc a képernyő címével és a mentés állapotával; alul, a hüvelykujj közelében a teljes szélességű „Kiadás rögzítése” sáv, alatta négy fül: Áttekintés, Keretek, Tervező, **Több**. A Több alsó lapon az Elemzés, a Számlanaptár, a Kategóriák és a Beállítások van.
  - A lejárt számlák száma a „Keretek és számlák” menüponton és fülön látszik.
- **Képernyőváltás:** rövid áttűnés (250 ms, csak átlátszóság); csökkentett mozgásnál nincs.
- **Rétegek** (gyorsrögzítő, alsó lap): kompakt elrendezésben alulról nyílnak, a fix alsó sáv és a képernyő-billentyűzet fölött; közepes és széles elrendezésben középre igazított panelként. Saját előzménybejegyzést kapnak, így a vissza gesztus őket zárja be. A parancsikonnal (`?gyors`) nyitott gyorsrögzítő is: alatta az útvonal képernyője (pl. az Áttekintés) marad, így a vissza gesztus nem lépteti ki az appot. A rétegből a már alatta látszó képernyőt választva csak a réteg zárul be. Az Esc, a bezárás gomb és a háttérre kattintás is bezárja őket; alsó lapként a fogantyú lefelé húzása is (a lap negyedénél, legfeljebb 120 px-nél tovább húzva; rövidebb húzásnál visszaugrik). A sötétítés a navigáció fölött van. Az üzenetek (és a visszavonás) a réteg fölött maradnak; kompakt elrendezésben ilyenkor a képernyő tetején jelennek meg, hogy ne takarják a lap gombjait.

### 4.1 Első indítás (varázsló)
- **Nyitókép** (csak az első lépésen): a márka, egy mondat arról, mire jó („Fizetéstől fizetésig: mennyi költhető még ma, mi vár befizetésre, és mennyi marad a hónap végén.”), és díszként egy hónapcsík, az Áttekintés fő eleme. A további lépéseken csak a márka áll, kicsiben.
- **Lépésjelző:** a lépések neve számozva, a mostani kiemelve; telefonon helyette „2. lépés a 4-ből: Kategóriák” és egy sáv.
- **„Már használod?”** az első lépés kártyája alatt: „Van már mentésem” (visszatöltés) és „Csatlakozom egy közöshöz” (GitHub). A kártyában csak a „Tovább” van.
- Telefonon a kategóriák és a „már megtörtént” sorai ikon nélkül állnak, hogy a név ne vágódjon le, és az összegmező kitölti a saját oszlopát.

1. **Időszak:** fizetésnap (1–31) és „Mennyi pénz van most a számlán?” (negatív is lehet).
   - Ha a mostani időszak több mint fele eltelt, a varázsló felajánlja: „Kezdjük a következő fizetéssel (okt. 10.)” (ez az alapértelmezett), vagy „a mostani hónappal”. Így nem indul az app egy szinte lejárt időszakkal, ahol minden számla „lejárt”.
2. **Kategóriák:** kiinduló lista (lásd 7. fejezet), amelyből törölni, átnevezni és alapértelmezett összeget megadni lehet. A tervek az első időszakra íródnak.
3. **Ebben az időszakban már megtörtént** (csak ha a mostani időszakkal kezdünk): a fix tételek (számla, egyösszegű bevétel, megtakarítás) egy jelölővel kifizetettként rögzíthetők a terv összegével, lezárva. A keretekhez az eddig elköltött, a részletekben érkező bevételhez az eddig megérkezett összeg is beírható. Ezekből számolódik a nyitó egyenleg.
4. **Kész:** összegzés, a nyitó egyenleggel.

### 4.2 Irányítópult (kezdőképernyő)
- **Fejléc:** időszakváltó (lapozás + időszakok listája, a folyamatban lévő jelölve), az időszak dátumai („Október · 10.10–11.09.”), „Mentés letöltése” gomb az utolsó letöltés idejével („Letöltve 3 napja”).
- **Mínuszba forduló futó egyenleg:** ha a futó egyenleg a folyamatban lévő vagy egy előre tervezett hónap végére nulla alá megy, a kártya fölött piros sáv jelzi: „Januárban mínuszba fordul a futó egyenleg. A mélypont −45 000 Ft, februárban. A Tervezőben látszik, melyik hónap okozza.” (a folyamatban lévő hónapnál „A hónap végére …”). A sáv a Tervezőbe visz. Lezárt hónap nézésekor nem jelenik meg.
- **„Jól állunk-e?” kártya** az oldal tetején:
  - A folyamatban lévő időszakban nagy számmal: „Még elkölthető a keretekből: 182 000 Ft” (a napi összegbe számító keretek maradéka, lásd Tempó). Alatta: „Naponta kb. 15 000 Ft jut, még 12 napig (okt. 9-ig).”, az utolsó napon „Ma van a hónap utolsó napja.”
  - Ha a keretek összesen túl vannak lépve: „Kereteken túl: 12 000 Ft”, és kimondva: „A keretek összesen 12 000 Ft-tal túl vannak lépve, még 12 napig (okt. 9-ig).”
  - **Hónapcsík:** a hónap minden napja egy oszlop (a hétvégék halványabbak). Az eltelt napok teliek, a mai bekarikázva. A napi összegbe számító keretekből elfogyott arányt napokra váltja (68% egy 31 napos hónapban 21 nap): ami ebből a mai nap utánra esik, sávozott borostyán. Alatta a hónap első és utolsó napja és a „ma” (széles helyen a következő hónap elseje is), és egy mondat: „3 nappal előrébb jársz.”, „6 nap tartalékod van.” vagy „Épp a terv szerint haladsz.”, utána „A keretek 68%-a fogyott el, a hónap 58%-a telt el.” A csík képernyőolvasóval egy mondatként hallható.
  - A figyelmet kérő keretek nem itt, hanem a teendők között állnak, egyszer.
  - Napi keretterv nélkül az eddigi keretköltés látszik, és az ok: „ebben a hónapban nincs tervezett keret”, „egyik keret sem számít a napi elkölthető összegbe” vagy „a napi összegbe számító kereteknek nincs terve”. Hónapcsík ilyenkor nincs.
  - Lezárt időszakban a zárómondat („A hónap +45 000 Ft-tal zárult”, illetve „A hónap 12 000 Ft mínusszal zárult”), alatta a bevétel, a kiadás és a félretétel. Jövőbeli időszakban a terv összegzése: tervezett havi egyenleg, bevétel, kiadás, félretétel, és hogy hány nap múlva kezdődik.
- **Elrendezés:** a folyamatban lévő időszakban széles tartalomnál (860 px-től) a kártya mellett jobbra a fizetendők és a teendők; keskenyebben alatta.
- **Fizetendő és várható** (csak a folyamatban lévő időszakban): csekkszerű sorok, mindegyik a saját gombjával. Ugyanaz a lezáró rögzítés és visszavonás, mint a Rögzítésen.
  - lejárt vagy 5 napon belül esedékes, még le nem zárt fix számla (terv nélküli és esedékességi nap nélküli nem): név, „lejárt okt. 20.” / „ma esedékes” / „esedékes okt. 25.”, összeg (részlegesnél a hátralék), „Kifizetve” gomb, részlegesnél „Maradék”. A lejárt számla csekksárga, az esedékes szaggatott keretű;
  - egyösszegű bevétel, ami az időszak 3. napja után sem (vagy csak részben) érkezett meg, „+26 600 Ft” és „Megérkezett” gombbal;
  - két vagy több számlánál a cím mellett „Mind kifizetve” gomb (keretes, nem kitöltött: az első képernyőn a „Kiadás rögzítése” az elsődleges művelet). Ha csak bevétel vár, a cím „Várt bevétel”.
- **Teendők** (csak a folyamatban lévő időszakban, legfeljebb 5 elem, fontossági sorrendben):
  - gyorsan fogyó vagy túllépett keret, utánuk a terv nélkül költött napi keret (összesen legfeljebb 2), ami a Rögzítés sorára visz; ha van keret, amelyben maradt pénz, mellette a „Átcsoportosítás” gomb is (lásd Rugalmas keretek);
  - lemaradó cél, ami a Tervezőbe visz;
  - „N napja nem rögzítettél semmit” (4 nap felett, a legutóbbi rögzítés ideje szerint), ami a gyorsrögzítőt nyitja meg;
  - elavult mentés, „Mentés letöltése” gombbal.
  - Ha se fizetendő, se teendő nincs, egy sor jelenik meg: „Minden rendben”. Ha 5-nél több teendő van, alul látszik, hány maradt ki.
  - Lezárás után a fókusz a helyére lépő sor gombjára kerül, ha nincs ilyen, a szakasz címére vagy a „Minden rendben” sorra.
- **A hónap számai** (kártya nélküli sor, felül vonallal; telefonon két oszlop):
  - a folyamatban lévő időszakban: „Bejött” (az eddigi bevétel, alatta a terv), „Elment eddig” (alatta „a hónap végéig kb.” a várható kiadás, amivel a futó egyenleg számol), „Félretéve ebben a hónapban” (ha van terv vagy befizetés), „Megtakarítások összesen” (a célkártyákon látható összegyűlt összegek összege mai állás szerint: induló összeg + befizetések − felhasználás; ha van megtakarítási kategória);
  - lezárt és jövőbeli időszakban: Bevétel, Kiadás (jövőbelinél „várható”, alatta a terv), „A hónap mérlege” (jövőbelinél „várható”);
  - mindig: „A bankszámlán a hónap végén” (a futó egyenleg), alatta a tartalék-mutató („≈ 1,4 hónapnyi kiadás”), a folyamatban lévő időszakban „a hónap mérlege +76 940 Ft” is.
- **Kategórialista:** ugyanazon a sorrácson, mint a Rögzítés keretei: balra az ikon, középen egy sorban a név (a változás jelvényével) és a „tény / terv”, alatta a sáv és keretnél a maradék, jobbra a nyíl (csoportnál lefelé mutat, és kinyitáskor megfordul). Széles tartalomnál (860 px-től) a lista két hasábban folyik; egy csoport a tagjaival egy hasábban marad. A Rögzítés kereteinél ugyanígy. Részletesen: ikon, név, terv/tény sáv (0 és 100% közé szorítva, a színe a tempót követi, a folyamatban lévő időszakban „ma” jelölővel), „tény / terv” számok, keretnél alatta „maradt · /nap”, százalékos eltérés az előző időszakhoz képest. Egy sorra kattintva a rögzítő képernyő ugyanannál a kategóriánál nyílik meg. A csoportok összecsukhatók; a csoportsor tempója csak akkor számít, ha minden tagja napi keret.
  - Jövőbeli időszakban a sor a tervet mutatja; ha oda már előre rögzítettek, a „tény / terv” számokat, mert az előrejelzés is ezzel számol.
  - A folyamatban lévő időszakban az eltérés az eddigi tényt az előző időszak ugyanannyiadik napjáig tartó tényével veti össze (a rögzítés dátuma alapján). Csak akkor jelenik meg, ha az előző időszakban addig volt tény.
- **Futó egyenleg grafikon:** tény (folytonos vonal) és előrejelzés (szaggatott). Egy pontra kattintva az az időszak jelenik meg.
- **Havi összehasonlítás grafikon:** kiadások halmozott oszlopokban kategóriánként, időszakonként. Az aktuális időszak kiemelt, a jövőbeli halványabb. Egy oszlopra kattintva az az időszak jelenik meg.

### 4.3 Rögzítés
- Felül a „Váratlan kiadás” gomb (másodlagos stílusú), alatta az összecsukható **„Legutóbbi rögzítések”** lista: az utolsó 10 rögzítés minden kategóriából és időszakból (ikon, név, megjegyzés, összeg, „ma 18:42” / „tegnap 9:05” / „okt. 6. 18:42”, más időszaknál az időszak neve), egyenként törölhetően, visszavonással. A nyitott/csukott állapotot a böngésző megjegyzi.
- Összesítő (kártya nélküli sor, felül vonallal, mint az Áttekintés számai): rögzítve eddig, fix számlák állása („4 / 7 kifizetve”), keretekből még elkölthető. A folyamatban lévő időszakban ez ugyanaz a szám, mint az Áttekintés „Még elkölthető a keretekből” értéke (a napi összegbe számító keretekből, a túllépéssel csökkentve), alatta soronként a napi összeg és a figyelmet kérő keretek száma („1 keret túllépve”, „1 keret gyorsan fogy”); összesített túllépésnél „Kereteken túl”.
- A számla- és megtakarítássorok alatti részek (a részletek pillái, a díjváltozás-javaslat, az összegmező, a cél állása) a sor alatt külön sávban állnak; telefonon teljes szélességben, hogy ne szoruljanak a név oszlopába.
- A szakaszok sorrendje: **Keretek, Fix számlák, Megtakarítás, Bevételek** (a gyakoribb rögzítés elöl).
- **Keretek:** kompakt sorok (ikon, név, „maradt 27 000 Ft · ~2 200 Ft/nap”, sáv a tempó színével és „ma” jelölővel; gyors fogyásnál „gyorsan fogy”, terv nélküli költésnél „nem tervezett · összeg”). Koppintásra nyílnak ki, egyszerre csak egy:
  - „Eddig 45 000 Ft · keret: 60 000 Ft”, és egy ⋯ menü „Havi összeg megadása” ponttal (az eddigi részletek helyére egyetlen havi összeg kerül; Esc vagy × visszavált).
  - Gyorsan fogyó, túllépett vagy terv nélkül költött keretnél (a folyamatban lévő és a jövőbeli időszakban) „Átcsoportosítás” gomb: alsó lapon (asztalon panelen) a maradékos keretek közül lehet választani, az előtöltött összeggel (lásd Rugalmas keretek).
  - Javasolt gyorsgombok: az utolsó 3 időszak rögzítéseiből a 3 leggyakoribb, 100 Ft-ra kerekített összeg, és a legutóbbi, ha nincs köztük (egyenlő gyakoriságnál a frissebb nyer). A „Havi összeg megadása” egész hónapos összege nem számít bele (a rögzítés meg van jelölve). Ha nincs adat: +5 000, +10 000, +20 000 Ft. Mentés közben a gombok zárolva vannak, így a dupla koppintás nem rögzít kétszer.
  - Összegmező „Hozzáad” gombbal, „Megjegyzés” kapcsolóval; a részletek egyenként törölhető pillekként.
  - Ha a képernyő egy kategóriára irányítva nyílik meg (`#/rogzites/<kategóriaId>`, pl. a teendőkből), a sor kinyílik, odagördül, és az összegmező kapja a fókuszt.
- **Fix számlák** listája esedékesség szerint rendezve, a lejártak kiemelve. A megnyitáskor már kifizetett számlák összecsukódnak („6 / 8 kifizetve · mutasd”); az épp most kifizetett a helyén marad, hogy a visszavonás és a fókusz ne ugorjon el. Gombok:
  - nincs fizetve: Kifizetve (a terv összegével) / Más összeg / Részlet;
  - részben fizetve: Részlet / Maradék / Kész, több nem lesz / Visszavon;
  - kifizetve: Visszavon (a tétel összes rögzítését törli, visszavonható).
  - A „Kifizetve”, a „Maradék” és a „Más összeg” lezárja a tételt, a „Részlet” nem.
  - Részleges állapotban, illetve több részletnél az egyes rögzítések dátummal, egyenként törölhető pillekként látszanak; a lezáró rögzítést lakat jelzi.
  - A tervtől eltérő összeggel kifizetett számla alatt díjváltozás-javaslat jelenik meg („Új díj: … Legyen ez a terv ettől a hónaptól?” [Igen] [Nem], lásd Rugalmas keretek). A válasz után a fókusz a számla sorára kerül.
- **Megtakarítás** és **Bevételek** a fix számlák módján (a részletekben érkező bevétel a keretek módján, tempó nélkül).
- Hibás vagy üres összegnél a mező mellett hibaüzenet jelenik meg, és nem rögzít. Mentés közben a mező zárolva van, így a dupla Enter vagy kattintás nem rögzít kétszer; ha a mentés nem sikerül, a beírt összeg megmarad.
- Összegbevitel: a szóköz elválasztó, az „e” utótag ezret jelent („12e” = 12 000). A pont csak akkor ezres elválasztó, ha pontosan 3 számjegy követi („1.234.567”), különben tizedesjel, mint a vessző („12.5e” = „12,5e” = 12 500). Mobilon a mezők 16 px-esek, hogy az iOS ne nagyítson rá a fókuszkor.
- **Gyors rögzítés** bárhonnan (a + gomb, az `N` billentyű, a `?gyors` paraméter vagy a PWA-parancsikon), mobilon alsó lapként, asztalon középre igazított panelként. Bezárás után a fókusz a megnyitó gombra kerül vissza, billentyűvel nyitva a látható „Kiadás rögzítése” gombra:
  - Felül nagy, automatikusan fókuszált összegmező. Érintőképernyőn (durva mutatónál) a telefon billentyűzete nem nyílik fel: a lap alján saját számbillentyűzet van (1–9, 000, 0, törlés), így a keretek láthatók maradnak; a kijelzőn ezres tagolással („4 500”). Billentyűzetes eszközön a mezőbe gépelni kell (tizedes billentyűzettel).
  - Az összeg alatt, amint van érvényes összeg, a következmény a kiválasztott keretre: „Utána 28 250 Ft marad az Élelmiszer keretben, naponta kb. 2 000 Ft.” (a napi összeg csak napi keretnél, a folyamatban lévő hónapban); túllépésnél „Ezzel 3 000 Ft-tal túllépi a Ruházat keretet.”, terv nélküli keretnél „Az Ajándék keretnek ebben a hónapban nincs terve.”
  - Alatta a kiválasztott keret javasolt összegei (ugyanazok, mint a keretsor gyorsgombjai, „Javasolt (Élelmiszer): …”): koppintásra beíródnak a mezőbe. Telefonon egy sorban, oldalra görgethetően.
  - **„Melyik keretből?”** – a keretek gombjai két-három oszlopban, az elmúlt 60 nap rögzítéseinek száma szerint (azonos számnál a megszokott sorrendben), mindegyiken a keret állása („maradt 32 750 Ft”, „túllépve 5 480 Ft”, „nincs terv”). A koppintás kiválasztja a keretet (nem rögzít); alapból az utoljára itt használt van kiválasztva, ennek híján a leggyakoribb.
  - **A mentés gombja** a lap aljához tapad, és kimondja, hová rögzít: „Rögzítés: Élelmiszer”. Az Enter ugyanezt teszi. Üres vagy hibás mezőnél hibaüzenet, és a fókusz visszakerül a mezőre.
  - **„Esedékes számlák”** – a lejárt vagy 5 napon belül esedékes, még le nem zárt fix számlák csekkként („Áram lejárt okt. 20. · 14 500 Ft”, részben fizetettnél a hátralék; a lejárt csekksárga, az esedékes szaggatott keretű). Koppintásra lezár: üres mezővel a látható összeggel („Kifizetve” / „Maradék”), beírt összeggel azzal (mint a „Más összeg”).
  - „Megjegyzés” kapcsoló: a megjegyzés a rögzítéshez kerül.
  - Mindig a folyamatban lévő időszakba, a mai napra rögzít, akármelyik időszak van kiválasztva. Az új időszak első 3 napjában (a kezdőnappal együtt) időszakválasztó is megjelenik („Okt. | Szep.”): az előzőbe annak utolsó napjára kerül. A mentés gomb fölött látszik, hová kerül („Szeptember hónap · okt. 7.”).
  - „Váratlan kiadás” link: a Rögzítés képernyőn a Váratlan kiadás panelt nyitja meg (havi pénzből vagy megtakarításból), a gyorsrögzítő időszakára váltva, a már beírt összeggel és megjegyzéssel.
  - Rögzítés után a panel bezárul, az üzenet visszavonást kínál. Ha a mentés nem sikerül, a beírt összeg megmarad.

### 4.4 Tervező
- Időszakválasztó (folyamatban lévő és jövőbeli időszakok, de a múltbeliek is szerkeszthetők).
- Kategóriánként csúszka és számmező. A sorban látszik az előző időszak ténye és az elmúlt 3 lezárt időszak átlaga.
  - A csúszka maximuma a mentett tervből számolódik, húzás közben nem mozdul.
  - Ha a kategóriának későbbi egyedi terve van, a sor mutatja (pl. „dec.: 150 000 Ft”), mert „ettől a hónaptól” mentésnél ezek törlődnek.
- Kapcsoló: „Ettől a hónaptól” / „Csak erre a hónapra”. Minden megnyitáskor „Ettől a hónaptól” az alapállás.
- Minden soronkénti mentés után üzenet jelenik meg a hatállyal, visszavonással (a kategória terveinek mentés előtti állapotára). Például: „Élelmiszer: 95 000 Ft novembertől · a decemberi egyedi terv (150 000 Ft) törölve”, vagy „… csak novemberre · decembertől újra 80 000 Ft”.
- Gyorsműveletek: „Előző hónap tényei alapján”, „3 hónapos átlag alapján”. Csak a fix és keret kategóriákra futnak (a bevétel és a megtakarítás terve szándék), és nem írnak 0-t, ha a forrásidőszakban nincs rögzítés. Egyetlen visszavonással visszaállíthatók.
- Élő előnézet: a futó egyenleg grafikonja a szerkesztés közben frissül, a változás előtti előrejelzés halványan látszik mellette, alatta „A terv végén a változás: −40 000 Ft”. A nulla alatti szakasz, pont és terület piros (az Áttekintés grafikonján is).
- A grafikon fölött egy mondat a folyamatban lévő hónaptól előre: „A legalacsonyabb pont novemberben 2 450 000 Ft. A terv végén (2027. április) 2 997 300 Ft.” (ha a mélypont ez a hónap: „A legalacsonyabb pont ennek a hónapnak a vége: …”, ha a terv vége: „A futó egyenleg a terv végéig csökken.”). Ha valamelyik hónapban mínuszba fordul, helyette piros figyelmeztetés a mélyponttal, mint az Áttekintésen.
- Egyoszlopos elrendezésben (keskeny tartalomnál) a terv összesítője és a grafikon a lista fölött áll, görgetéskor pedig egy tapadó sáv mutatja a tervezett havi egyenleget és a terv végi egyenleget, szerkesztés után a változással („A terv végén 2 957 300 Ft (−40 000 Ft)”).
- Összesítő: tervezett bevétel − kiadás − megtakarítás = tervezett havi egyenleg. Ha negatív, figyelmeztetés jelenik meg.

### 4.5 Kategóriák
- Lista típus szerint tagolva (Bevételek, Fix számlák, Keretek, Megtakarítás, mindegyik a darabszámmal), azon belül a megjelenítési sorrendben. A sorban a csoport és a részletek látszanak (a típus a szakasz címében). Mellette egy ceruza gomb (szerkesztés) és egy „⋯” menü: Feljebb, Lejjebb (a saját szakaszán belül; a többi típus helye nem mozdul), Archiválás.
- Az „Új kategória” és az Áttekintés „Új cél” gombja (`#/kategoriak/uj-cel`) alsó lapon (asztalon panelen) nyitja meg az űrlapot, a lista mögötte marad; bezáráskor a cél útvonala is kikerül az URL-ből. A névmező példája a típushoz illik („pl. Nyaralás 2027”, „pl. Áram”), a csoporté fix számlánál „pl. Rezsi”.
- Szerkeszthető mezők: név, ikon, szín, típus, csoport, alapértelmezett összeg, esedékességi nap (`fix`), bevételmód, „Beleszámít a napi elkölthető összegbe” (`keret`; alapból be van kapcsolva, a váratlan kiadásoknál ki). A napi összegen kívüli keret a listában „napi összegen kívül” jelölést kap.
- A típus, ha a kategóriának már van rögzítése, csak a fix és a keret között váltható (mindkettő kiadás), különben a múltbeli tények is átfordulnának. Más váltásnál a mező zárolt: „Archiváld, és hozz létre újat”.
- Az alapértelmezett összeg módosítása a mostani időszaktól érvényes terv lesz (lásd Terv), a múltat nem írja át. Ha ezzel későbbi egyedi tervek törlődnének, a szerkesztő mentés előtt megmutatja őket, az üzenet pedig a Tervezőhöz hasonlóan kimondja (pl. „Élelmiszer mentve · terv 110 000 Ft októbertől · a decemberi egyedi terv (150 000 Ft) törölve”).
- Archiválás és visszaállítás.

### 4.6 Beállítások és mentés
- Fizetésnap, nyitó egyenleg, előrejelzési távolság. A mentés visszavonható.
- **Megjelenés:** téma: Rendszer / Világos / Sötét. Eszközönként tárolódik, a közös adatba és a mentésbe nem kerül. A „Rendszer” a telefon vagy a gép beállítását követi. A választott téma már az első megjelenítéskor érvényes (nincs villanás), és a böngésző sávjának színe is követi.
- Egy időszak kezdőnapjának felülírása. Ha a fizetésnap módosítása után egy felülírás érvénytelenné válik (két időszak összecsúszna), törlődik, és erről üzenet jelenik meg.
- **Biztonsági mentés (JSON export, „Mentés letöltése”):** fájlnév `csaladi-koltsegvetes-ÉÉÉÉ-HH-NN.json`. Az utolsó mentés ideje is tárolódik.
- **Visszatöltés:** fájl kiválasztása után előnézet (időszakok száma, kategóriák száma, legutóbbi módosítás), majd megerősítés után felülírja a jelenlegi adatokat.
  - A fájl rekordonként ellenőrződik. A hiányzó, de pótolható mezők alapértéket kapnak (előrejelzés 6, nyitó egyenleg 0, archivált: nem, sorrend a helye szerint), az összegek egész forintra kerekednek.
  - Érvénytelen rekordnál magyar hibaüzenet mondja meg, mi és hol hibás (pl. „3. rögzítés: ismeretlen kategóriára hivatkozik”), és semmi nem töltődik be.
  - Az első időszak legfeljebb 50 évvel a mai nap előtt és legfeljebb 2 évvel utána lehet; egy képtelen érték (pl. 1900. január) hibaüzenetet ad.
  - Ha a betöltés az adatbázisban hiúsul meg, a korábbi adatok megmaradnak, és hibaüzenet jelenik meg.
- **CSV export:** időszak × kategória táblázat terv és tény oszlopokkal, Excelhez.
- Az összes adat törlése (megerősítéssel).

### 4.7 Elemzés
- **Időablak:** „Ez a hónap / Utolsó 12 / Naptári év”, a felső időszakváltóval együtt. Csak a lezárt és a folyamatban lévő időszakok számítanak (jövőbelinél a mostaniig mutat). A folyamatban lévőből az eddigi tény látszik, ezt a felirat jelzi.
- **Hova ment a pénz:** kiadási kategóriánként a tény a terv mellett, közös léptékű sávokkal és a terv jelölőjével, költés szerint csökkenőn (alapból 8 sor). A megtakarításból fizetett rész sraffozva, külön összeggel. Sorra koppintva megnyílik a trend.
- **Legnagyobb eltérések a tervtől:** legfeljebb 5 kategória, **csak lezárt időszakokból** (a folyamatban lévőben a „terv alatt” csak annyit jelentene, hogy a hónap még tart). Túllépés, kevesebb költés, illetve terv nélküli költés; hány időszakban volt a terv fölött. A megtakarításból fizetett költés nem számít bele. Mellette gomb a Tervezőhöz.
- **Időszakonként (hőtérkép):** sorok a kiadási kategóriák (csoportonként összecsukhatók), oszlopok az időszakok („Ez a hónap” módban az utolsó 6). A cellában a tény („112e”), a színe a tény/terv arány: ≤ 90%, 90–100%, 100–115%, > 115%; külön jelölés a terv nélküli és a folyamatban lévő cellának. Telefonon a táblázat a saját dobozában görgethető, a legfrissebb időszaknál indul; a kategórianevek oszlopa a helyén marad, és kitakarja a mögötte elgördülő cellákat.
- **Trend** (alsó lap): a tény vonalként, a terv lépcsőként, a 3 havi átlag (az utolsó legfeljebb 3 lezárt időszakból) szaggatottan; ha volt megtakarításból fizetett rész, az is. Alatta átlag, legtöbb, az idei eddigi és a jelenlegi terv.
- **Keresés és címkék:** a megjegyzésekben írt `#címkék` összesítése (összeg, darab); koppintásra a címke tételei. A kereső a megjegyzésben, a kategória nevében és a rögzítő nevében keres, „#címke” alakban pontos címkére. A megjegyzésmezők a korábbi címkéket felajánlják.
- **Megtakarításból fizetett költés:** a felhasználás (Váratlan kiadás „Megtakarításból” ága, illetve a megtakarítás „Felhasználás” művelete) kiadási kategóriát kaphat („Mire ment?”). Az Elemzés és az Áttekintés havi kiadás-grafikonja ezt az adott kategória kiadásaként mutatja, halványan, „megtakarításból” jelöléssel. A futó egyenleget nem érinti.
- Későbbre marad: éves összesítő (idei és tavalyi), „ki mennyit rögzített” bontás.

## 5. Mentési folyamat

- **Hibaképernyő:** megjelenítési hibánál „Hiba történt” oldal jelenik meg három lehetőséggel: nyers adatmentés letöltése (az adatbázis táblái közvetlenül, számolás nélkül, az export formátumában, így a Beállításokban visszatölthető), újratöltés, és a hiba részletei. Egy képernyőn belüli hibánál a fejléc és a navigáció megmarad, másik képernyőre lépve újra próbálkozik.

- Indításkor az app tartós tárolást kér a böngészőtől (`navigator.storage.persist()`).
- Az utolsó letöltés ideje a fejlécben látszik („Letöltve ma”, „Letöltve 3 napja”). A puszta „Mentés” szó csak az űrlapok mentése (Beállítások, Kategóriák). 30 nap után sárga figyelmeztetés jelenik meg.
- Új időszak első megnyitásakor egy sáv felajánlja az előző időszak mentését, egy kattintással.
- Ajánlott használat: Safariban „Hozzáadás a Dockhoz”, vagy Chrome-ban telepítve. Safariban a sima weboldal adatai 7 nap használaton kívül törlődhetnek. A mentések helye legyen egy szinkronizált mappa (OneDrive vagy iCloud).

## 6. Adatmodell

```ts
type CategoryType = 'fix' | 'keret' | 'bevetel' | 'megtakaritas';

interface Settings {
  id: 'settings';
  payday: number;               // 1–31; ha a hónap rövidebb, a hónap utolsó napja
  openingBalance: number;       // Ft
  firstPeriodId: string;        // pl. '2026-10'
  forecastPeriods: number;      // alapértelmezés: 6
  lastExportAt?: string;        // ISO dátum
  lastSeenPeriodId?: string;    // az „új időszak” mentési ajánlathoz
  createdAt: string;
}

interface PeriodOverride {
  periodId: string;             // '2026-10'
  startDate: string;            // ISO dátum, a számolt kezdőnap felülírása
}

interface Category {
  id: string;
  name: string;
  icon: string;                 // Tabler ikon neve
  color: string;
  type: CategoryType;
  group?: string;
  defaultAmount: number;
  dueDay?: number;              // csak 'fix'
  incomeMode?: 'fix' | 'keret'; // csak 'bevetel'
  goalAmount?: number;          // csak 'megtakaritas'
  goalDeadline?: string;        // időszak azonosító, pl. '2027-06'
  goalStart?: number;           // a cél kezdetekor már félretett összeg
  role?: 'unexpected';          // a váratlan kiadások kategóriája
  excludeFromDaily?: boolean;   // csak 'keret': nem számít a napi elkölthető összegbe;
                                // ha nincs megadva, a váratlan kiadásoké nem, a többi igen
  order: number;
  archived: boolean;
}

interface Plan {
  periodId: string;
  categoryId: string;           // kulcs: [periodId+categoryId]
  amount: number;
}

interface Entry {
  id: string;
  periodId: string;
  categoryId: string;
  amount: number;               // pozitív egész Ft (0 csak settles-szel)
  date: string;                 // ISO dátum
  note?: string;
  kind?: 'withdrawal';          // megtakarításból való felhasználás
  settles?: true;               // fix tételnél: ezzel a tétel ebben az időszakban lezárult
  createdAt: string;
}
```

Az időszakok nincsenek eltárolva: a fizetésnapból és a felülírásokból számoljuk őket.

**Export formátum:**
```json
{
  "app": "csaladi-koltsegvetes",
  "schemaVersion": 1,
  "exportedAt": "2026-10-10T08:00:00Z",
  "settings": {}, "periodOverrides": [], "categories": [], "plans": [], "entries": []
}
```
A `schemaVersion` alapján a későbbi verziók a régi mentéseket is be tudják tölteni: a `migrateExport` lánc a régi verziót lépésenként (n → n+1) a jelenlegire alakítja, utána jön a rekordszintű ellenőrzés. Az ugyanazon sémaverzión belül ismeretlen mezők megmaradnak.

## 7. Kiinduló kategórialista

| Csoport | Kategória | Típus |
|---|---|---|
| Bevétel | Fizetés, Családi pótlék, Egyéb bevétel | `bevetel` |
| Lakhatás | Hitel / albérlet, Közös költség, Lakásbiztosítás | `fix` |
| Rezsi | Áram, Gáz, Víz, Telefon, Internet és TV | `fix` |
| – | Élelmiszer, Háztartás, Közlekedés, Gyerekek, Egészség, Ruházat, Szabadidő, Egyéb | `keret` |
| – | Megtakarítás | `megtakaritas` |

## 8. Technológia

- **React + TypeScript + Vite**
- **Dexie.js** (IndexedDB) az adattároláshoz, `useLiveQuery` a reaktív frissítéshez
- **Chart.js** (`react-chartjs-2`) a grafikonokhoz
- **vite-plugin-pwa**: telepíthető, offline is működik
- **Tabler Icons**, **date-fns**
- Stílus: CSS változók (világos és sötét mód), CSS modulok
- **Vitest** a számítási logikához (időszakhatárok, terv-öröklődés, futó egyenleg)
- Tárhely: GitHub Pages vagy Netlify (statikus fájlok, az adatok a böngészőben maradnak)
- A fejlesztéshez Node.js kell (`brew install node`), a használathoz nem

A számítási logika (időszakok, terv-öröklődés, egyenleg) tiszta, a felülettől független függvényekben legyen (`src/domain/`), teljes tesztlefedettséggel.

## 9. Fázisok

### MVP
- [x] Projektalap: Vite, React, TS, Dexie, PWA, téma (világos/sötét)
- [x] Domain logika tesztekkel: időszakszámítás, terv-öröklődés, futó egyenleg, állapotjelzések
- [x] Első indítás varázsló
- [x] Kategóriák kezelése
- [x] Rögzítés képernyő
- [x] Tervező
- [x] Irányítópult a két grafikonnal
- [x] Mentés, visszatöltés, CSV export, mentési emlékeztetők
- [x] Megtakarítási célok (célösszeg, határidő, előrejelzés, felhasználás)
- [x] Váratlan kiadás rögzítése (havi pénzből vagy megtakarításból)
- [ ] Közzététel statikus tárhelyre

### 2. verzió
- Összehasonlító nézet: két időszak egymás mellett, kategória × időszak hőtérkép, egy kategória trendje
- „Mi lenne, ha” forgatókönyvek a futó egyenlegre
- Ritka, nagy költségek havi szétosztása (pl. évi biztosítás, nyaralás, karácsony)
- Időszak lezárása: összegzés (a keretmaradék nem viszi át magát, a futó egyenlegbe megy; lásd Rugalmas keretek)
- Egyenleg-egyeztetés: a valós bankszámla-egyenleg megadása, a különbség korrekcióként rögzítve
