# Akadálymentességi átnézés (1.2)

**Szabvány:** WCAG 2.1 AA, a 2.2-es új feltételeknél (2.4.11, 2.5.8) külön jelölve · **Dátum:** 2026-10-22 · **Minta:** `teljes`, világos téma

Ez az átnézés a [01-audit.md](01-audit.md) mérésire épül, és nem ismétli meg őket. Onnan jönnek a kontrasztarányok (A08, A09), az érintési célpontok (A11), a címsorok (A12), a select neve (A10), a hőtérkép szerepe (A13) és a dátummező fókusza (A14). Ez a rész a folyamatokat nézi: rétegek billentyűvel, hibaüzenetek, élő régiók, képernyőolvasós szemantika, reflow és mozgás.

## Módszer

A próbák fej nélküli Chrome-ban futottak, valódi billentyűleütésekkel (DevTools-protokoll, `Input.dispatchKeyEvent`). A bejárt folyamatok:

- a gyorsrögzítő az `N` billentyűvel és az oldalsáv gombjáról, majd egy rögzítés;
- a Továbbiak alsó lap telefonon;
- a keretsor kinyitása a Rögzítésen;
- a Számlanaptár nyílbillentyűi;
- egy érvénytelen fizetésnap a Beállításokban;
- négy képernyő Tab-bal végig 375 px-en, a ragadós alsó sáv takarását mérve;
- reflow 320 és 640 px szélességen, 8 képernyőn;
- `prefers-reduced-motion: reduce` mellett a számított animációk.

A szemantikát a DOM-ból olvastam ki (szerepek, nevek, állapotattribútumok). A forráskódot a kiváltó ok azonosításához néztem meg.

**Nem fedi le:**
- Valódi képernyőolvasós végigjárás (VoiceOver, TalkBack). A „bejelentés” oszlop a DOM-ból számított név és szerep, nem hallott felolvasás.
- Szövegnagyítás böngésző-beállítással (csak a nézet szélességét szűkítettem).
- Windows nagy kontrasztú mód.

## Összegzés

**Talált problémák:** 12 · **Kritikus:** 0 · **Jelentős:** 5 · **Kisebb:** 7

A rétegek kezelése mintaszerű:
- a fókusz a rétegbe kerül;
- 30 Tab-leütés alatt sem szökik ki;
- Esc-re bezárul;
- a fókusz visszakerül a megnyitó gombra.

Rögzítés után az üzenet egy `aria-live="polite"` tárolóban jelenik meg, a visszavonással együtt. A reflow 320 px-en mind a 8 képernyőn kilógás nélküli.

A hiányosságok két csoportba tartoznak:
- **Állapot, amit csak a szem lát:** a kiválasztott gomb a Tervezőben, a napok állapota a naptárban, a grafikonok adatai, a változáscímke jelentése.
- **Hibaüzenet, ami nem kapcsolódik a mezőhöz.**

## Megállapítások

### Érzékelhető

| # | Probléma | WCAG | Súlyosság | Javaslat |
|---|---|---|---|---|
| 1 | **A grafikonoknak nincs adatalternatívája.** Mindkét Áttekintés-grafikon `<canvas role="img">`, csak általános címkével („Futó egyenleg időszakonként”, „Kiadások kategóriánként, időszakonként”). Nincs mellette táblázat vagy összegző mondat. A képernyőolvasó nem tudja meg például az előrejelzett mélypontot vagy azt, melyik hónap volt a legdrágább. | 1.1.1 | 🟡 Jelentős | Az `aria-label` mondja ki a lényeget, a valós adatból számolva, például „Futó egyenleg: az időszak végén <összeg>, az előrejelzés végén <összeg>, a legalacsonyabb pont <hónap>, <összeg>”. Mellé legyen egy `sr-only` táblázat, vagy egy „Mutasd táblázatként” kapcsoló, ami mindenkinek hasznos. |
| 2 | **A Számlanaptár napjainak állapota csak színes pöttyből derül ki.** A pötty 6 px-es, és a nap felolvasott nevéből is hiányzik az állapot: „okt. 19.: Áram”, a „lejárt” szó nélkül. A lenti lista szövegben is kimondja, de a rácsban csak a szín jelez. | 1.4.1, 1.3.1 | 🟡 Jelentős | A nap neve legyen „okt. 19.: Áram, lejárt”. Vizuálisan a pötty mellé vagy helyett állapotikon kell (felkiáltó háromszög, pipa), ne csak a szín. |
| 3 | **Az „esedékes” pötty kontrasztja 1,88:1** a kiemelt napcella hátterén (`--warn-fill` `#eda100` a `--surface-2` `#f0efea`-n). A „bevétel” pötty 3,84:1, a „lejárt” 4,17:1, a „kész” 4,62:1. | 1.4.11 | 🟢 Kisebb | Az esedékes jelölés a `--warn` (`#8f5d00`, 4,89:1) színt kapja, vagy a 2. pont szerinti ikont. |
| 4 | **A változáscímke („−53%”, „+81%”) jelentése csak a `title` attribútumban van.** „Eddig 10 490 Ft, az előző időszakban ugyaneddig 22 320 Ft” – ezt a képernyőolvasók többsége nem olvassa fel, és érintőképernyőn sem jelenik meg. A felolvasott szöveg csak annyi, hogy „mínusz 53%”. | 1.3.1 | 🟢 Kisebb | `sr-only` kiegészítés: „53%-kal kevesebb, mint az előző hónapban ugyaneddig”. Lásd még az audit A07-et (a címke a fix tételeknél félrevezető). |

### Kezelhető

| # | Probléma | WCAG | Súlyosság | Javaslat |
|---|---|---|---|---|
| 5 | **Telefonon a Tab-bal elért elem a ragadós alsó sáv alá kerül.** A Rögzítésen 52 fókuszlépésből 5 teljesen takart („Háztartás”, „Ajándék”, „Igen”), a Tervezőben 58-ból 2 teljesen és 5 részben, az Áttekintésen 52-ből 11 részben. Az ok: nincs `scroll-padding-bottom`, így a böngésző a képernyő aljáig görget, ahol az alsó sáv van. | 2.4.11 (2.2) | 🟡 Jelentős | `html { scroll-padding-bottom: calc(72px + env(safe-area-inset-bottom)); }` 900 px alatt, és ugyanez felül a ragadós fejléchez. |
| 6 | **A Számlanaptár `role="grid"`, de a nyílbillentyűk nem mozgatják a fókuszt.** A „Jobbra” után a fókusz ugyanazon a napon maradt („okt. 5.”). A rács szerep kétdimenziós nyilas navigációt ígér, így a képernyőolvasó-felhasználó hiába próbálja. Egyébként minden nap Tab-bal elérhető, ezért nem zár ki senkit. | 4.1.2, 2.1.1 | 🟢 Kisebb | Vagy nyilas navigáció bejárható tabindexszel (ARIA APG „Date Grid”), vagy a `role="grid"` elhagyása, és a napok egyszerű gomblistaként. |
| 7 | **Az `N` billentyűvel nyitott gyorsrögzítő bezárása után a fókusz a `body`-ra esik.** A gombról nyitva helyesen visszatér a gombra. Billentyűvel nyitva viszont nincs megnyitó elem, így a felhasználó elveszíti a helyét az oldalon. | 2.4.3 | 🟢 Kisebb | A megnyitás előtti `document.activeElement` legyen a visszatérési pont (a `Sheet` `opener` logikája ezt a billentyűs ágon is megkapja). |

### Érthető

| # | Probléma | WCAG | Súlyosság | Javaslat |
|---|---|---|---|---|
| 8 | **A Beállítások mezőhibái nincsenek a mezőhöz kötve.** A „Fizetésnap” 40-re állítva és mentve megjelenik az „1 és 31 közötti nap” szöveg. Mellette viszont `aria-invalid` nincs, `aria-describedby` nincs, `role="alert"` nincs, és a fókusz sem kerül a hibás mezőre. A képernyőolvasó-felhasználó csak annyit tapasztal, hogy a mentés nem történt meg. Ugyanez érvényes a kezdőnap-felülírás hibájára (`Settings.tsx:133`) és a Kategóriák űrlapjának öt hibaüzenetére is (`Categories.tsx:299`, `329`, `361`, `414`, `428`). Az összegmezők (`common.tsx:160`, gyorsrögzítő, Tervező, Fedezet áthozása, Váratlan kiadás) viszont már helyesen kapják az `aria-invalid`-ot. A minta tehát megvan, csak nem terjed ki minden űrlapra. | 3.3.1, 4.1.3 | 🟡 Jelentős | Egy közös `Field` komponens: `aria-invalid`, `aria-describedby` a hibaszöveg azonosítójára, és mentéskor fókusz az első hibás mezőre. Ahol a hiba nem mezőhöz tartozik, ott `role="alert"`. |
| 9 | **A csúszkák értéke nyers számként hangzik el.** A „Fizetés terve” csúszka `aria-valuetext` nélkül „865000”-et mond, a felületen „865 000 Ft” áll. A csúszka mellett van szövegmező is, így az érték elérhető, csak a csúszka bejelentése nehezen érthető. | 4.1.2 | 🟢 Kisebb | `aria-valuetext={formatFt(value)}`. |

### Robusztus

| # | Probléma | WCAG | Súlyosság | Javaslat |
|---|---|---|---|---|
| 10 | **A Tervező „Ettől a hónaptól / Csak erre a hónapra” váltójának kiválasztott állapota csak vizuális.** A gombok csak egy `.on` osztályt kapnak, se `aria-pressed`, se rádiószerep nincs (`Planner.tsx:122–123`). A képernyőolvasó nem tudja megmondani, melyik hatállyal ment a módosítás. Ez pedig a Tervező legkockázatosabb döntése, mert az „Ettől a hónaptól” a későbbi egyedi terveket is felülírhatja. | 4.1.2 | 🟡 Jelentős | `role="radiogroup"` + `role="radio"` + `aria-checked`, nyílbillentyűkkel. Ugyanez a minta már megvan az appban (3 `radiogroup`). |
| 11 | **Az Elemzés időablak-váltója (`Ez az időszak / Utolsó 12 / Naptári év`) `aria-pressed` gombsor.** Működik, de csoport-szemantika nélkül: nincs „1 / 3” bejelentés, és nincs nyilas navigáció. | 4.1.2 | 🟢 Kisebb | Mint a 10. pontban: rádiócsoport. |
| 12 | **A hőtérkép táblázatának nincs `<caption>`-je.** A cellák viszont példásan teljes mondatot adnak a felolvasónak („2026. május: 218 400 Ft / terv 218 400 Ft (a terv szerint)”). | 1.3.1 | 🟢 Kisebb | `<caption class="sr-only">Kategóriák tény/terv aránya időszakonként</caption>`. |

## Színkontraszt

A szöveges és a gombfelirat-kontrasztot az audit méri (A08, A09). Itt csak a nem szöveges elemek szerepelnek.

| Elem | Előtér | Háttér | Arány | Elvárt | Megfelel? |
|---|---|---|---|---|---|
| Naptár, „esedékes” pötty | `#eda100` | `#f0efea` | 1,88:1 | 3:1 | ❌ |
| Naptár, „bevétel” pötty | `#2a78d6` | `#f0efea` | 3,84:1 | 3:1 | ✅ |
| Naptár, „lejárt” pötty | `#d03b3b` | `#f0efea` | 4,17:1 | 3:1 | ✅ |
| Naptár, „kész” pötty | `#2c7a3a` | `#f0efea` | 4,62:1 | 3:1 | ✅ |
| Fókuszkeret (1339 lépés, 2 téma) | `--accent` | a mindenkori háttér | ≥ 3:1 minden lépésben | 3:1 | ✅ |

## Billentyűzetes kezelés

| Elem | Tab-sorrend | Enter/Szóköz | Esc | Nyilak |
|---|---|---|---|---|
| Oldalsáv „+ Rögzítés” | 1. Tab-leütés | megnyitja a gyorsrögzítőt, fókusz az „Összeg” mezőn | – | – |
| Gyorsrögzítő | a fókusz a rétegben marad (30/30 leütés) | Enter rögzít, a réteg bezárul, a fókusz visszakerül a gombra | bezárja, a fókusz visszakerül a gombra (`N`-nel nyitva a `body`-ra, lásd 7.) | – |
| Továbbiak alsó lap (375 px) | 39. Tab-leütés az Áttekintésen | megnyitja, a fókusz a lapon | bezárja, a fókusz a „Továbbiak” gombon | – |
| Keretsor (Rögzítés) | 15. Tab-leütés | kinyitja (`aria-expanded="true"`), a fókusz a néven marad | nem csukja be | – |
| Számlanaptár napjai | minden nap külön Tab-lépés | kiválasztja a napot (`aria-pressed`) | – | nem működik (lásd 6.) |
| Tervező hatályváltó | sorban | vált | – | nem működik (lásd 10.) |

## Képernyőolvasó (a DOM-ból számítva)

| Elem | Bejelentés | Probléma |
|---|---|---|
| Gyorsrögzítő | „Gyors rögzítés, párbeszédablak, modális” | – |
| Időszakválasztó (Áttekintés) | „Időszak, legördülő lista” (`aria-label`) | – |
| Időszakválasztó (Beállítások) | „Időszak 2025. augusztus (08.05.–09.04.) 2025. szeptember …” | a név tartalmazza mind a 21 lehetőséget (audit A10) |
| Navigáció | „Áttekintés, aktuális oldal” | – (`aria-current="page"`, mindkét navigációban) |
| Keretsávok | nem jelentik be magukat (`role="presentation"`) | – (a sor szövege kimondja ugyanazt: „127 250 Ft / 160 000 Ft”) |
| Futó egyenleg grafikon | „Futó egyenleg időszakonként, kép” | nincs adat (1.) |
| Változáscímke | „mínusz 53%” | nincs viszonyítás (4.) |
| Naptár napja | „okt. 19.: Áram, kapcsoló gomb, nincs lenyomva” | nincs állapot (2.) |
| Tervező hatályváltó | „Ettől a hónaptól, gomb” | nincs kiválasztott állapot (10.) |
| Tervcsúszka | „Fizetés terve, csúszka, 865000” | nyers szám (9.) |
| Hőtérkép cellája | „2026. május: 218 400 Ft / terv 218 400 Ft (a terv szerint)” | – példás |
| Rögzítés utáni üzenet | „Élelmiszer: +1 230 Ft, Visszavonás” (udvarias élő régió) | – |

## Reflow és mozgás

- **Reflow (1.4.10):** 320 px-en és 640 px-en (ami egy 1280 px-es ablak 200%-os nagyításának felel meg) mind a 8 képernyőn `scrollWidth = innerWidth`, és 0 elem lóg ki. ✅ A hosszú kategórianevek kilógása (audit A06) ettől független, a szélső mintán jön elő.
- **Csökkentett mozgás:** a rétegek beúszó animációja kikapcsol (`animation: none`) ✅. Megmarad viszont:
  - a gombok átmenete (0,12 s) és a keretsávok kitöltése (0,25 s), ami rövid és nem mozgatja a tartalmat;
  - a Chart.js 250 ms-os animációja, ami a `prefers-reduced-motion`-t nem figyeli (`Charts.tsx`, `animation: { duration: 250 }`).

  Ez AAA szintű (2.3.3), nem AA-hiba. A rendszer-beállítás tiszteletben tartásához a grafikonok animációja is kapcsoljon ki.

## Első javítások

1. **A mezőhibák bekötése (8.):** a képernyőolvasó-felhasználó jelenleg nem tudja meg, miért nem mentődött a beállítás. Egy közös mezőkomponens az összes űrlapon megoldja.
2. **`scroll-padding` az alsó sávhoz (5.):** egy CSS-sor, ami minden telefonos billentyűzet- és kapcsolóhasználót érint.
3. **A rejtett állapotok kimondása (2., 10.):** a naptár napjainak neve és a Tervező hatályváltójának rádiószerepe. Mindkettő a pénzügyi döntés pontosságát érinti.
4. **Grafikonok adatalternatívája (1.):** az összegző `aria-label` gyors, a táblázatos nézet az 5. fázis része lehet.
5. **Kisebbek (3., 4., 6., 7., 9., 11., 12.):** egyszerre, a design-rendszer 2.0 komponenseivel.
