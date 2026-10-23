# 2.2 Összegzés és rangsor (ideiglenes)

**Módszer:** az 1. fázis öt szakértői jelentésének szintézise (`design:research-synthesis`), témákba rendezve és munkacsomagokba vonva · **Résztvevők:** még 0 felhasználó · **Dátum:** 2026-10-23 · **Állapot:** ideiglenes rangsor, a [02-felhasznaloi-kutatas.md](02-felhasznaloi-kutatas.md) beszélgetései és naplója után véglegesedik.

## Vezetői összefoglaló

A 145 megállapításból 25 már javítva van, ebből 3 csak részben (lásd lent). A maradék 120 megállapítás 16 munkacsomagba rendeződik. Az app alapjai erősek: a hero, a rétegek billentyűkezelése, a fókusz, a nevek, a 320 px-es reflow. A gyenge pontok:

- **Elrendezés:** a 640–1200 px-es sávban és 1440 px felett nincs saját elrendezés, és a Tervező 1024 px-en szétesik.
- **Áttekintés:** a hierarchia ugyanazt a figyelmeztetést négyszer mondja el, a valódi kockázatot (a negatív futó egyenleget) viszont nem.
- **Hiányzó alap:** nincs design-rendszer, amire egy modern felület épülhetne.

Az érték szerinti rangsor élén két napi szintű, viszonylag olcsó csomag áll: a számok és címkék jelentése (CS4) és az Áttekintés hierarchiája (CS3). A legnagyobb munka, a reszponzív keret (CS1) és a design-rendszer (CS6), előfeltétel: a redesign ezekre épül, ezért a megvalósítási sorrendben előre kerülnek.

## Már javítva

A `43a17ae` és a `580c3c0` commit (2026-10-23):

| Jelentés | Megállapítás |
|---|---|
| Audit | A01, A02, A03, A04, A08, A09, A10, A12, A19 (a mintaadat hibája) |
| Akadálymentesség | AK5, AK8, AK10, AK11 |
| Kritika | K2 (a tengelyfeliratok), K34 |
| Design-rendszer | DR4 és DR18 részben: a `--text-3`, az `--on-accent` és az `autoSkip` kész, a többi a CS14-ben és a CS7-ben |
| Szövegek | SZ1, SZ2, SZ3, SZ6, SZ14, SZ17, SZ24, SZ43 részben (a „Terv” jelvény kész, a „•” a CS11-ben); a te/ti fejezet |
| Más | a Kategóriák öt selectjének neve, a gyorsrögzítő hónapválasztója |

## Témák

### 1. A szélesség nem elrendezést, csak nyújtást kap

- **Előfordulás:** 4 jelentésből 3. Kritika K1, K4, K5, K12, K16, K21; audit A05; design-rendszer DR2, DR8.
- **Megfigyelés:** 768 px-en alsó sáv és egy oszlop, a sorok 1300 px szélesek. 1024 px-en a Tervező bal oszlopa kb. 350 px, és a magyarázó szöveg szavanként törik. 1440 px-en a kártyán belül a sor neve és az értéke kb. 800 px-re van egymástól.
- **Ok:** az `auto-fit` rácsok és három, egymástól független töréspont (600, 720, 900).
- **Következmény:** a táblagép és a félképernyős asztali ablak a leggyengébb élmény. A 4–5. fázis fő munkája ez.

### 2. Az Áttekintés nem a kockázatot emeli ki

- **Előfordulás:** kritika K6, K7, K8, K22, K24, K30; szövegek SZ8, SZ9.
- **Megfigyelés:**
  - Az Élelmiszer gyors fogyása 4 helyen szerepel egymás alatt.
  - A szélső mintán a −14 milliós futó egyenleg mellett a hero „Még elkölthető 150 680 Ft”-ot mutat.
  - A telefonos oldal kb. 4400 px hosszú.
  - Elavult mentésnél 3 jelzés jelenik meg egyszerre.
- **Következmény:** a napi első képernyő a figyelmet egyformán osztja szét, a valódi bajt elrejti.

### 3. A számok és a jelölések mást jelentenek, mint amit sugallnak

- **Előfordulás:** 5 jelentésből 4. Audit A07; kritika K10, K11, K38; akadálymentesség AK4; szövegek SZ5, SZ8, SZ25, SZ26, SZ27.
- **Megfigyelés:**
  - A „−100%” zöld a még nem esedékes tételeken.
  - A sávgrafika három képernyőn háromféle dolgot mér.
  - A „félretéve” szó egy képernyőn három különböző számot jelöl.
  - Az „e” és „M” rövidítés vegyesen szerepel.
  - A „futó egyenleg” magyarázat nélküli szakszó.
- **Következmény:** a felhasználó rossz következtetést von le egy pénzügyi számból. Egy költségvetési appban ez a legdrágább hibafajta.

### 4. A rögzítés útja telefonon hosszú

- **Előfordulás:** kritika K13, K14, K19, K20, K29, K40; audit A16; szövegek SZ7, SZ21, SZ46.
- **Megfigyelés:**
  - A gyakori vezérlők a képernyő tetején vannak, ahol a hüvelykujj nehezen éri el őket.
  - A gyorsrögzítő teljes magasságú, fogantyú nélkül, és a billentyűzet eltakarja a chipeket.
  - Egy teendősor kb. 150 px magas, 1–2 körvonalas gombbal.
  - A „Visszavonás” menüpont valójában a hónap összes rögzítését törli a tételnél.
- **Következmény:** a leggyakoribb művelet a leglassabb.

### 5. Nincs rendszer, csak egyedi megoldások

- **Előfordulás:** design-rendszer DR1, DR5, DR6, DR7, DR10–DR17, DR20–DR24; kritika K15, K24.
- **Megfigyelés:**
  - 0 token a méretekre: 114 betűméret-, 294 térköz- és 12 mozgásdeklaráció nyers értékkel.
  - 13 sortípus és 7 féle kijelölt állapot.
  - A rétegek négyféleképpen nyílnak.
  - 17 szabály csak az alap `button` stílust vonja vissza.
- **Következmény:** minden képernyő külön tervezett darab. Az egységes, modern hatáshoz előbb a rendszer kell.

### 6. A ritkább képernyők elmaradtak a fő képernyők mögött

- **Előfordulás:** kritika K3, K9, K25, K26, K31, K37, K39; akadálymentesség AK2, AK3, AK6; audit A17, A18.
- **Megfigyelés:**
  - A Számlanaptár listájában egymásra csúszik a szöveg (K3).
  - A hőtérkép rögzített oszlopa átlátszik.
  - A Kategóriák admin táblázatnak, a Beállítások nyers űrlapnak hat.
  - Az első indítás üdvözlés nélküli űrlap.
- **Következmény:** kisebb forgalom, de az első benyomást (első indítás) és a havi rutint (naptár) érinti.

### 7. A szövegek rendben vannak, a peremük nem

- **Előfordulás:** szövegek SZ4, SZ7, SZ10–SZ13, SZ15, SZ16, SZ18–SZ23, SZ28–SZ50; kritika K32.
- **Megfigyelés:**
  - Rossz helyen törő dátumok és számok 375 px-en.
  - Ötféle dátumírás.
  - A „számla” jelent bankszámlát is.
  - Töredékes hibaüzenetek, zsákutca üres állapotok.
  - Valódi értéknek látszó helyőrzők.
  - Egy valódi GitHub-felhasználónév a helyőrzőben (SZ49).
- **Következmény:** egyenként apró, együtt a kidolgozatlanság érzését adják. Képernyőnként, a 6. fázisban érdemes rendbe tenni őket.

## Munkacsomagok és rangsor

**Pontozás:** a hatás és a gyakoriság szorzata, osztva a ráfordítással. A skála a jelentések súlyosságából és a képernyő használati gyakoriságából becsült, nem mért érték. A gyakoriság a kutatás után változhat (lásd a következő szakaszt).

- **Hatás:** 3 = rossz döntéshez vagy elakadáshoz vezet; 2 = lassít vagy bizalmat rombol; 1 = csiszolás.
- **Gyakoriság:** 3 = naponta látott képernyő; 2 = havonta vagy hetente; 1 = ritkán.
- **Ráfordítás:** 1 = néhány óra; 1,5 = egy nap; 2 = pár nap; 3 = egy hét vagy több.

| Hely | Csomag | Megállapítások | Hatás | Gyak. | Ráf. | Pont | Fázis |
|---|---|---|---|---|---|---|---|
| 1 | **CS4 – A számok jelentése:** változáscímke csak a kereteken, a sávok egy jelentéssel, egy „félretéve”, a „Még elkölthető” pontosítva, egységes rövidítés, futó egyenleg magyarázattal | A07, K10, K11, K38, AK4, SZ5, SZ8, SZ25–SZ27 | 3 | 3 | 1,5 | **6,0** | 5–6 |
| 2 | **CS3 – Az Áttekintés hierarchiája:** egy figyelmeztetés egyszer, a negatív egyenleg a hero-ba, összecsukható szakaszok, egy mentésjelzés | K6, K7, K8, K22, K24, K28, K30, SZ9 | 3 | 3 | 2 | **4,5** | 4–6 |
| 3 | **CS5 – Rögzítés telefonon:** a vezérlők a hüvelykujj közelébe, gyorsrögzítő fogantyúval és billentyűzetbarát elrendezéssel, tömör teendősorok, a „Visszavonás” menüpont átnevezése | K13, K14, K19, K20, K29, K40, A16, SZ7, SZ21, SZ46 | 3 | 3 | 2 | **4,5** | 6 |
| 4 | **CS8 – Számlanaptár:** a lista egymásra csúszó szövege, a napok állapota szóban és ikonnal, rács-szerep vagy nyilak | K3, K37, AK2, AK3, AK6 | 2 | 2 | 1 | **4,0** | gyors + 6 |
| 5 | **CS10 – Rétegek egy mintára:** alsó lap fogantyúval, a sötétítés a navigáció fölött, a fókusz visszatérése `N`-nél | K15, K16, K20, AK7 | 2 | 3 | 2 | **3,0** | 5 |
| 6 | **CS2 – A Tervező elrendezése:** két sorra rendeződő tervsor konténer-lekérdezéssel, 24 px+ csúszka, kerekített átlag, hosszú nevek | A05, A06, A11, K1, K12, K27, K35, AK9 | 3 | 2 | 2 | **3,0** | 5–6 |
| 7 | **CS16 – Akadálymentesség maradéka:** grafikonok adatalternatívája, hőtérkép régiója és feliratozása, alsó sáv 12 px | A13, A14, A15, A18, AK1, AK12 | 1,5 | 2 | 1 | **3,0** | 6 |
| 8 | **CS11 – Szövegek maradéka:** dátum- és számtörés, egy dátumformátum, „bankszámla”, teljes mondatos hibaüzenetek, helyőrzők, üres állapotok következő lépéssel | SZ4, SZ10–SZ13, SZ15, SZ16, SZ18–SZ23, SZ28–SZ50, K32 | 2 | 2 | 1,5 | **2,7** | 6 |
| 9 | **CS1 – Reszponzív keret:** három elrendezési osztály, navigációs sín 640–1024 px között, rács és legnagyobb szélesség asztalon, folyékony típus, képernyőcím a fejlécben, egy hónapválasztó minta, egyértelmű „Rögzítés” a menüben | K4, K5, K16, K17, K18, K21, K36, DR2, DR8 | 3 | 2 | 3 | **2,0** | 5 · *előfeltétel* |
| 10 | **CS6 – Design-rendszer alap:** tokenek (térköz, típus, mélység, mozgás, z), komponensek (Row, Badge, Meter, IconTile, Stat, EmptyState), állapotmátrix, `button` alapstílus visszafogva | DR1, DR5–DR7, DR9–DR11, DR13–DR17, DR20–DR24 | 2 | 3 | 3 | **2,0** | 5 · *előfeltétel* |
| 11 | **CS7 – Grafikonok:** téma a tokenekből, legfeljebb 5 sorozat, csökkentett mozgás, témázott tooltip | DR3, DR16 (grafikon), DR18, K33 | 2 | 2 | 2 | **2,0** | 5 |
| 12 | **CS14 – Sötét téma és kézi választó:** hangolt kategóriapaletta, sötét hero, `[data-theme='dark']`, a `theme-color` témánként | K23, DR4 (paletta), DR12 | 2 | 2 | 2 | **2,0** | 4–5 |
| 13 | **CS9 – Elemzés:** a hőtérkép rögzített oszlopa, az üres eltérés-kártya helye, „Utolsó 12 hónap” felirat | K9, K39, SZ36, SZ37 | 2 | 1 | 1,5 | **1,3** | 6 |
| 14 | **CS13 – Első indítás:** üdvözlés és ígéret, asztalon kitöltött tér, lépésjelző telefonon | K31, SZ50 | 2 | 1 | 2 | **1,0** | 6 |
| 15 | **CS15 – Ikonfont:** 507 kB woff2 kb. 90 ikonért; részhalmaz vagy SVG | DR19 | 1,5 | 1 | 1,5 | **1,0** | 4–5 |
| 16 | **CS12 – Kategóriák és Beállítások:** csoportfejléc, a sor maga a szerkesztés célja, rövid mezők, ezres tagolás, telefonos telepítési útmutató | A17, K25, K26, SZ31–SZ33, SZ45, SZ49 | 1,5 | 1 | 2 | **0,8** | 6 |

### Megvalósítási sorrend (függőségek szerint)

A pontszám az értéket mutatja, nem a sorrendet. A javasolt menet:

1. **Most, a design-iránytól függetlenül:** a CS8 egymásra csúszó szövege (K3) és a CS11-ből a helyőrzőben szereplő valódi felhasználónév (SZ49). Ezek hibák, egy-egy óra munka.
2. **4. fázis (esztétikai irány):** a vázlatok a CS3 hierarchiáját, a CS4 jelöléseit és a CS1 elrendezését mutassák meg az Áttekintésen és a gyorsrögzítőn. Ott dől el, hogyan néz ki a válasz.
3. **5. fázis (design-rendszer 2.0):** a CS6 előbb vizuális változás nélkül, utána a CS1, a CS10, a CS7 és a CS14 a választott irányban.
4. **6. fázis (képernyőnként):** a CS3 és a CS4 az Áttekintéssel, a CS5 a Rögzítéssel, a CS2 a Tervezővel, a CS9 az Elemzéssel. A CS8, CS11–CS13 és CS16 a saját képernyőjükkel együtt készül.

## Amit a kutatás átrendezhet

| Kutatási kérdés | Csomag | Hogyan változhat |
|---|---|---|
| K1: melyik eszköz, van-e táblagép | CS1, CS2 | Ha senki nem használ táblagépet és félképernyős ablakot, a közepes elrendezés csak minimális lesz, és a CS1 lejjebb kerül. Ha a tervezés gépen vagy táblagépen történik, a CS2 feljebb. |
| K2: azonnal vagy utólag rögzítenek-e | CS5, CS10 | Esti, egyben rögzítésnél a Rögzítés képernyő listanézete fontosabb, mint a gyorsrögzítő. A pénztárnál rögzítésnél fordítva. |
| K3: ki mit csinál | CS2, CS5 | Ha egy ember tervez gépen, a Tervező asztali változata a fő. |
| K4: mit néznek meg először | CS3, CS4 | Megerősíti vagy cáfolja, hogy a hero és a teendők a jó belépési pont. |
| K5: mit csinálnak az appon kívül | 3. fázis | A funkciójelöltek (CSV-import, „mi lenne, ha”, évértékelő) súlya. |
| K6: mi akaszt el | mind | A szakértői becslés helyére valódi gyakoriság kerül. |

## Feltételezett felhasználói szerepek (ellenőrizendő)

| Szerep | Jellemzők | Igények | Kinél |
|---|---|---|---|
| **Rögzítő** | telefon, naponta, rövid alkalmak, egy kézzel | gyors rögzítés, „mennyi maradt” egy pillantásra, kevés koppintás | feltehetően mindkét felnőtt |
| **Tervező** | gép vagy táblagép, havonta, hosszabb alkalom | áttekinthető Tervező, összevetés az előző hónapokkal, „mi lenne, ha” | feltehetően az egyik felnőtt |

A két szerep ugyanaz az ember is lehet. A beszélgetés F1–F3 feladatai pont ezt választják szét.

## Nyitott kérdések

- Van-e a családban táblagép, és ha igen, mire használják (K1)?
- Mennyit használják az Elemzést és a Számlanaptárt? Az adatkivonat ezt nem mutatja, mert a képernyőnézéseket az app nem rögzíti.
- Zavarja-e őket az Áttekintés hossza, vagy csak a tetejét nézik?
- Értik-e a „futó egyenleg” és a „Még elkölthető” különbségét (CS4)?

## Módszertani megjegyzések

- **A források:** öt szakértői jelentés, valódi felhasználó még nem szólalt meg. A súlyosságok a jelentések saját skálájáról lettek egységesítve, ezért a pontszám összehasonlításra jó, abszolút értékként nem.
- **A gyakoriság:** a képernyők feltételezett használatából becsült. Az adatkivonat (`scripts/hasznalat.mjs`) a rögzítések idejét és szerzőjét méri, a képernyőnézéseket nem.
- **Átfedések:** egy megállapítás csak egy csomagba került. Ahol két jelentés ugyanazt írja le (pl. K2 és A04), az egyik javítása a másikat is lezárja.
- **Teljesség:** a 145-ből 25 javítva (3 részben, ezek maradéka csomagban van), 120 munkacsomagban. Egy megállapítás sem maradt csomagon kívül; ezt egy szkript ellenőrizte az azonosítók alapján.
