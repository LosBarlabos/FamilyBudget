# 2.1 Felhasználói kutatás – terv és eszközök

A [DESIGN_TERV.md](../../DESIGN_TERV.md) 2. fázisának első lépése, a `design:user-research` módszerével. Az 1. fázis azt mérte, mit csinál az app. Ez a lépés azt kérdezi meg, mit csinál vele a család. A kettő együtt adja a 2.2-es rangsort ([02-osszegzes.md](02-osszegzes.md)).

Az appot egy család használja, ezért a kutatás két emberre van méretezve:
- nincs statisztikai minta és nincs kérdőív;
- helyette két rövid, külön beszélgetés, néhány megfigyelt feladat, egy hét napló és egy objektív adatkivonat a valódi mentésből.

## Kutatási kérdések

Mindegyik kérdés egy konkrét döntést szolgál a 3–6. fázisban.

| # | Kérdés | Melyik döntést szolgálja |
|---|---|---|
| K1 | Melyik eszközön, melyik képernyőt használjátok? Van-e táblagép, és ha igen, mire? | Az 5. fázis töréspontjainak sorrendje: kell-e a közepes (640–1024 px) elrendezés, vagy elég a telefon és az asztal. |
| K2 | Mikor és hogyan rögzítetek: azonnal a pénztárnál, este egyben, vagy hétvégén utólag? | A gyorsrögzítő és a Rögzítés képernyő súlya; kellenek-e gesztusok és értesítések. |
| K3 | Ki mit csinál? Egyikőtök tervez, a másik rögzít, vagy mindketten mindent? | A Tervező asztali, a Rögzítés telefonos optimalizálása; a „ki rögzítette” bontás értéke. |
| K4 | Mit néztek meg először, amikor megnyitjátok? Mit kerestek, és nem találtok? | Az Áttekintés hierarchiája (kritika K6, K7). |
| K5 | Mit csináltok még az appon kívül: Excel, fejben számolás, banki app? | Új funkciók: CSV-import, „mi lenne, ha”, évértékelő. |
| K6 | Mi akaszt el, mi bosszantó, mit nem értetek? | Az 1. fázis megállapításainak súlyozása valós hatás szerint. |

## Módszerek

| Módszer | Kivel | Mennyi idő | Mit ad |
|---|---|---|---|
| **Adatkivonat** a valódi mentésből | – | 2 perc | Objektív minta: ki, mikor, mit, mennyire utólag rögzít (K2, K3) |
| **Beszélgetés** feladatokkal | külön-külön mindkét felnőttel | 15 perc fejenként | Szokások, elakadások, prioritások (K1–K6) |
| **Napló** | mindketten | 1 hét, naponta 1 perc | Valós helyzetek, nem emlékezetből (K2, K4, K6) |
| **Funkciók rangsorolása** | együtt, a végén | 5 perc | A 3. fázis jelöltjeinek sorrendje |

**Miért külön a beszélgetés?** Mert a két felnőtt szinte biztosan mást csinál az appal. Együtt az egyikük válaszai elnyomják a másikét.

### Ütemezés

| Nap | Teendő |
|---|---|
| 1. | Adatkivonat a mentésből (lásd lent), a napló indítása |
| 1–7. | Napló, naponta egy rövid bejegyzés |
| 7. vagy 8. | A két beszélgetés és a közös rangsorolás (összesen kb. 40 perc) |
| utána | A jegyzetek a `docs/design/02-nyers/` mappába (nem kell szépen), és szólj. Ebből frissül a [02-osszegzes.md](02-osszegzes.md). |

---

## Adatkivonat a valódi mentésből

A Beállításokban a „Mentés letöltése” után:

```bash
node scripts/hasznalat.mjs ~/Downloads/csaladi-koltsegvetes-2026-10-23.json
```

Csak összesített számokat ír ki: hány rögzítés van, melyik napon és napszakban készültek, ki rögzítette őket, aznap vagy utólag, mely kategóriákba, és mennyit használjátok a megjegyzést, a #címkét, a havi összeget és a lezárást. Összegeket és megjegyzésszövegeket nem ír ki, és semmit nem küld sehova. A kimenet bemásolható a `docs/design/02-nyers/adatok.txt` fájlba.

Közös használatnál (GitHub-szinkron) a „Ki rögzít” sor megmutatja a két ember arányát. Szinkron nélkül minden rögzítés „–”.

---

## Beszélgetési vázlat (15 perc, külön-külön)

A beszélgetést az vezesse, aki nem a másik fél, ideális esetben az, aki a redesignt kéri. A cél megérteni, mit csinál a másik, nem meggyőzni. Ha a válasz rövid, a „Mesélj többet erről” és a „Mutasd meg” a két legjobb kérdés.

### 1. Ráhangolódás (1 perc)

> „Az appot szeretném jobbá tenni. Nincs jó vagy rossz válasz: ha valami bosszant benne, az nekem a leghasznosabb. A végén pár dolgot meg is mutatnál a telefonodon.”

### 2. Szokások (4 perc)

1. Mikor használtad utoljára? Mit csináltál vele? *(K2, K4)*
2. Hol és mikor szoktál rögzíteni: a boltban, este, vagy egyszerre többet? Miért éppen akkor? *(K2)*
3. Melyik eszközön nyitod meg leggyakrabban? Van, amit csak gépen csinálsz? Tableten használtad már? *(K1)*
4. Ki tervezi a hónapot? Te mit csinálsz, és a másik mit? *(K3)*

### 3. Megfigyelt feladatok (6 perc)

A saját eszközén, a valódi adatokon csinálja. Ne segíts, csak figyeld, és jegyezd fel, hol akad meg, mit keres, és mit mond közben. Ha kérdez, a válasz: „Te mit próbálnál?”

| # | Feladat | Mit figyelj |
|---|---|---|
| F1 | „Most vettél 4 500 Ft-ért kenyeret és tejet. Rögzítsd.” | Hány koppintás; a gyorsrögzítőt vagy a Rögzítés képernyőt választja; megtalálja-e a kategóriát. |
| F2 | „Mennyit költhetsz még ebben a hónapban szabadidőre?” | Az Áttekintést vagy a Rögzítést nyitja meg; megérti-e a „maradt · /nap” szöveget. |
| F3 | „Jövő hónapban 20 000 Ft-tal többet szeretnél élelmiszerre. Állítsd be.” | Megtalálja-e a Tervezőt; érti-e az „Ettől a hónaptól / Csak erre a hónapra” különbséget. |
| F4 | *(csak ha van idő)* „Melyik kategóriában költöttetek az elmúlt fél évben a legtöbbet a tervhez képest?” | Eljut-e az Elemzésig; a Továbbiak lapon megtalálja-e. |

### 4. Benyomások (3 perc)

5. Ha egy dolgot megváltoztathatnál az appban, mi lenne az? *(K6)*
6. Mit csinálsz még az appon kívül a pénzügyekkel kapcsolatban? Táblázat, banki app, papír? *(K5)*
7. Volt olyan, hogy egy szám vagy felirat mást jelentett, mint gondoltad? *(K4, K6)*

### 5. Zárás (1 perc)

8. Van valami, amit nem kérdeztem, de fontos?

> „Köszönöm. A közös rangsorolás a másik beszélgetés után jön.”

### Jegyzetsablon

```
Ki: A / B · dátum · eszköz:
Szokások:
F1 – koppintások, elakadás, idézet:
F2 –
F3 –
F4 –
Egy dolog, amit megváltoztatna:
Az appon kívül:
Félreértett szám vagy felirat:
Szó szerinti idézetek („…”):
```

---

## Napló (1 hét, naponta 1 perc)

Minden este egy bejegyzés, akkor is, ha aznap nem volt rögzítés (az is adat). A legegyszerűbb egy közös jegyzet a telefonon vagy egy üzenet a családi csevegőbe. Ugyanazt a három kérdést kell megválaszolni:

```
Dátum · ki:
1. Mit csináltál ma az appal? (semmit / rögzítés / megnéztem, mennyi maradt / tervezés / más: …)
2. Volt, ami elakasztott, bosszantott vagy meglepett? (1 mondat)
3. Volt, amit az appon kívül intéztél, pedig az appban is lehetett volna? (pl. fejben számoltam, Excel)
```

A hét végén két kérdés:

```
- Melyik képernyőt használtad a legtöbbet a héten?
- Ha az app holnaptól csak egy dolgot tudna jobban, mi legyen az?
```

---

## Funkciók rangsorolása (5 perc, együtt)

**Módszer:** „100 forintos szavazás”. Mindketten 100 pontot osztanak szét a jelöltek között, a saját papírjukon, egymástól függetlenül, utána összeadjuk. Egy jelöltre sok pont is mehet, és több jelölt 0-t is kaphat.

| Jelölt | Mit old meg | A | B |
|---|---|---|---|
| Átrendezett, táblagépen és asztalon kényelmes elrendezés | A „szétnyúlt telefon” 768–1024 px között, kihasználatlan hely asztalon | | |
| Gyorsabb rögzítés: elhúzás (számla kifizetve, rögzítés törlése) | Kevesebb koppintás telefonon | | |
| Parancspaletta (`Cmd+K`): „élelmiszer 12500” beírva rögzít | Asztalon gépelve rögzítés és ugrás | | |
| Emlékeztető esedékes számlára, havi zárásra | Elfelejtett számla, elmaradt rögzítés | | |
| Bankszámlakivonat beolvasása (CSV) | Kevesebb kézi rögzítés; nagy munka | | |
| „Mi lenne, ha” a futó egyenlegre | Döntés előtt látni egy nagyobb kiadás hatását | | |
| Két hónap egymás mellett | Gyors összevetés | | |
| Évértékelő az év végén | Visszatekintés, közös beszélgetés a pénzről | | |
| Havi összefoglaló megosztása (kép vagy szöveg) | A család másik tagjának átküldeni | | |
| Célok ünneplése (elért cél, pluszos hónap) | Motiváció | | |
| Saját ötlet: … | | | |

A jelöltek a [DESIGN_TERV.md](../../DESIGN_TERV.md) 3. fázisából és az 1. fázis megállapításaiból valók. A végleges döntés a 3. fázisban születik, ráfordítással együtt.

---

## Amit a kutatás nem dönt el

- **Az akadálymentességi hibák javítását:** azok a WCAG szerint kellenek, függetlenül attól, hogy a család használ-e képernyőolvasót.
- **A vizuális irányt:** azt a 4. fázis vázlatai mutatják meg, és a felhasználó választ közülük.
- **Hogy a két ember válasza általánosítható-e:** nem az, és nem is kell, hogy az legyen. Ez egy család saját eszköze.
