# 4. fázis – Esztétikai irányok

A [DESIGN_TERV.md](../../DESIGN_TERV.md) 4. fázisa (`frontend-design`). Három, egymástól jól elkülönülő vizuális irány készült az Áttekintésre és a gyorsrögzítőre. Mindhárom ugyanarra a mintaadatra épül (október, a 18. nap, 112 320 Ft a keretekben), így csak a megoldás különbözik.

**A vázlatok:** [Családi költségvetés – vizuális irányok](https://claude.ai/artifact/95bWwAVufTsaTg3bc7BLHh) (privát; másnak csak a Megosztás menüből megosztva látható). A forrásuk a [04-vazlatok/](04-vazlatok/) mappában van.

Irányonként egy oldal, rajta három rajztábla:
- az Áttekintés telefonon (390 × 844);
- a gyorsrögzítő telefonon, kipróbálható;
- az Áttekintés asztalon, folyékony oldalként. Az ablak szűkítésével a telefonos elrendezésig átrendeződik.

A Tweaks fülön két kapcsoló van:
- **Sötét téma**;
- **Helyzet:** „Átlagos hónap” vagy „Mínuszos futó egyenleg”. Ez a 2. fázis CS3 csomagjának próbája: hogyan jelenik meg, ha a futó egyenleg januárban −45 000 Ft-ra süllyed.

## Ami mindháromban közös (a 2. fázis csomagjaiból)

- **Egy figyelmeztetés egyszer (CS3):** az Élelmiszer gyors fogyása egy helyen szerepel, nem négyen.
- **A negatív futó egyenleg az első képernyőn (CS3):** a „Mínuszos” helyzetben a hero fölött vagy magában a heróban jelenik meg.
- **Kimondott jelentés (CS4):**
  - „Még elkölthető a keretekből” (nem csak „Még elkölthető”);
  - „Bejött”, „Elment eddig”, „Félretéve” és „A bankszámlán a hónap végén” a „futó egyenleg” szakszó helyett;
  - nincs változáscímke a fix tételeken;
  - a sáv mindenhol ugyanazt jelenti: a tervből elköltött részt, a „ma” jelölővel.
- **Rögzítés telefonon (CS5):**
  - a fő műveletek a képernyő alsó harmadában vannak;
  - az alsó lapnak fogantyúja van;
  - a mentés gombja kimondja, mit tesz („Rögzítés: Élelmiszer”).
- **Elrendezés (CS1):** az asztali oldalak konténer-lekérdezéssel rendeződnek át (`@container`), nem az ablak szélességével. Ez az 5. fázis elrendezési osztályainak próbája.
- **Akadálymentesség rajzolva:** valódi gombok és linkek, legalább 44 px-es érintési célok, rádiócsoport a választóknál, `aria-label` az ikongombokon, `role="img"` és szöveges leírás a grafikonokon. A paletták 36 fő szöveg/háttér párja (irányonként mindkét témában) kiszámolva legalább 4,5:1. A Borítékok világos témájában a kraftpapíron a figyelmeztető és a hiba szín ehhez sötétebbre került.
- **Szövegek:** a ház szabályai és a szójegyzék szerint (hónap, te, Átcsoportosítás); nincs csupa nagybetűs címke, és a „·” elválasztóval fűzött felsorolás helyett mondatok vannak.

## 1. Csekk

**Az ötlet:** a hónap fizetéstől fizetésig tartó napjai egy 31 oszlopos csíkon. Az eltelt napok sötétek, a „ma” bekarikázva. Ahol a költés előrébb tart, mint az idő, sávozott borostyán jelzi a különbséget. A csík egy mondattal együtt válaszol a „Jól állunk-e?” kérdésre: „3 nappal előrébb jársz.” A fizetendő számlák a magyar csekk sárgáját kapják, ez az egyetlen erős szín.

| | |
|---|---|
| Betűk | Barlow Condensed (számok, címek), IBM Plex Sans (szöveg) |
| Világos | háttér `#F4F6F9`, tinta `#15233F`, accent `#2346A8`, csekk `#F2DD5C` |
| Sötét | háttér `#0E1525`, tinta `#EEF2F8`, accent `#93B2FF` |
| Gyorsrögzítő | saját számbillentyűzet a hüvelykujj magasságában: a telefon billentyűzete nem takarja el a kereteket (kritika K20) |
| Asztalon | sötét oldalsáv, kétoszlopos felső rész (a hónap és a fizetendők), alatta négy számoszlop és a keretek két oszlopban |

**Erőssége:** a napi kérdésre a legközvetlenebb válasz, nyugodt, és a legkisebb lépés a mostani apphoz képest.
**Kockázata:** a csík új fogalom („3 nappal előrébb”), meg kell tanulni olvasni. A futó egyenleg csak egy szám a lap alján.

## 2. Borítékok

**Az ötlet:** a borítékrendszer, ahogy sok család készpénzzel csinálta. Minden keret egy kraftpapír boríték. A „töltöttsége” a benne maradt pénz, a túllépett boríték üres. A gyorsrögzítő a boríték kiválasztásával indul, és rögzítés előtt kimondja a következményt: „Utána 28 250 Ft marad az Élelmiszer borítékban, naponta kb. 2 000 Ft.”

| | |
|---|---|
| Betű | Familjen Grotesk (egy család, súlyokkal tagolva) |
| Világos | háttér `#ECF0E8` (zsálya), tinta `#1D2A23`, accent `#2E6A4E`, kraft `#E3D3B4` |
| Sötét | háttér `#111915`, tinta `#E8EEE9`, accent `#8CD0AC`, kraft `#3A3324` |
| Gyorsrögzítő | boríték-választó, valódi számmező, „utána marad” előnézet élőben |
| Asztalon | sötét felső menüsor, borítékfal 2–3–4 oszlopban a konténer szélessége szerint, jobb oldalt a számlák és a hónap végi egyenleg |

**Erőssége:** a legbarátságosabb és a legkézzelfoghatóbb. A keretrendszert magyarázat nélkül is érteni, és a gyerekeknek is meg lehet mutatni.
**Kockázata:** a borítékok sok helyet kérnek: telefonon 6 fér el görgetés nélkül. A fix számlák és a bevételek nem illenek a metaforába, ezért külön blokkot kapnak.

## 3. Pénzfolyam

**Az ötlet:** a hero a futó egyenleg idővonala: 6 hónap vissza, a mai pont, 6 hónap előre szaggatott vonallal. A nulla alatti rész piros. Ami ma egy szám a lap alján, itt a legnagyobb elem. A gyorsrögzítő egyetlen beírt sor: „élelmiszer 4500 kenyér”. Az app szétbontja keretre, összegre és megjegyzésre, és megmutatja, mennyivel lesz kevesebb a napi összeg.

| | |
|---|---|
| Betű | Schibsted Grotesk |
| Világos | háttér `#F6F5FB`, tinta `#1C1A3A`, accent és vonal `#4B3FD6`, mínusz `#C2264B` |
| Sötét | háttér `#14122A`, tinta `#EFEDFB`, accent `#A9A0FF`, mínusz `#FF8DA6` |
| Gyorsrögzítő | egysoros bevitel értelmezéssel (a 3. fázis parancspaletta-jelöltje telefonon), gyakori rögzítések chipként |
| Asztalon | keskeny navigációs sín, nagy idővonal, mellette a napi összeg és a teendők, alatta a keretek igazított táblázatként |

**Erőssége:** a hosszú távú kérdésre („tavaszig kitart-e?”) a legjobb válasz, és a mínuszos helyzetet nem lehet nem észrevenni.
**Kockázata:** a napi „mennyit költhetek ma” a második helyre kerül. A beírt sor gyors annak, aki tud gépelni, de az első használatkor szokatlan.

## Összevetés

| Szempont | 1. Csekk | 2. Borítékok | 3. Pénzfolyam |
|---|---|---|---|
| A fő kérdés | jól állunk-e ebben a hónapban | mennyi van még az egyes keretekben | hova tart a pénz hónapokra előre |
| Változás a mostanihoz képest | kicsi–közepes | közepes | nagy |
| A negatív egyenleg (CS3) | sáv a hero fölött | keretes figyelmeztetés | maga a hero |
| A gyorsrögzítő | saját számbillentyűzet | boríték, majd összeg, előnézettel | egy beírt sor |
| Kinek kedvez | aki naponta ránéz | aki keretekben gondolkodik | aki tervez |

## Javaslatom

Az **1. Csekk** legyen az alap. Ez válaszol a legközvetlenebbül a napi kérdésre, a legkisebb a kockázata, és a csekk sárgája olyan magyar vonás, ami egyik sablonban sincs. Két elemet érdemes átvenni:

- **a 2. irányból:** a gyorsrögzítő „utána marad” előnézetét. Kis munka, és a CS4 (a számok jelentése) leggyakoribb pontján segít.
- **a 3. irányból:** az idővonalat a Tervezőbe és az Áttekintés alá. Mínuszos helyzetben a hero fölé is felkerül.

A végleges döntést a kutatás (2.1) is befolyásolhatja. Ha a beszélgetésekből kiderül, hogy a család havonta tervez és ritkán néz rá napközben, a 3. irány erősebb.

## A döntés után (az 5. fázis bemenete)

- **Betűk:** mind a négy betűtípus SIL Open Font License alatt van, így a `public/fonts/` mappába saját tárhelyre tehetők, npm-csomag nélkül. Latin és latin-ext részhalmazzal típusonként kb. 20–40 kB woff2.
- **Tokenek:** a választott irány színei OKLCH-ba és szemantikus szerepekbe (`--color-text-muted`, `--color-surface-raised`, `--color-bill`) kerülnek, a design-rendszer jelentés (1.4) tokenjavaslata szerint.
- **Mozgás:** a vázlatokban szándékosan nincs animáció. A View Transitions és a számlálóanimáció az 5. fázisban, csökkentett mozgásnál kikapcsolva.
