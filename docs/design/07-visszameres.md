# 7. fázis – Visszamérés

A [DESIGN_TERV.md](../../DESIGN_TERV.md) 7. fázisa (2026-10-24). A végleges állapot (a Csekk design-rendszer és a 6. fázis képernyői) összevetése az 1. fázis kiindulásával: ugyanaz a mérési mátrix, ugyanaz a mintaadat.

## Módszer

- **Mérés:** a UX/UI Audit plugin mérőszkriptjei (`probe-core`, `probe-heuristics`, `probe-perception`, `probe-ltr`) a mátrix 74 celláján, és `probe-focus` 1360 valódi Tab-leütés után, mint az 1. fázisban.
  - Futtatás: `npm run meresek -- --probak <a plugin scripts mappája> --cimke utana`.
  - Összevetés: `node scripts/osszevetes.mjs` (alapból az `alap` és az `utana` címkét veti össze).
  - Képernyőképek: `docs/design/kepek/utana/` (102 kép), a régiek: `docs/design/kepek/alap/`.
- **Akadálymentesség** (`design:accessibility-review`): az 1. fázis 12 megállapításának ellenőrzése a kódban és böngészőben.
- **Kritika** (`design:design-critique`): a régi és az új képernyőképek egymás mellett, Áttekintés, Rögzítés, Tervező, gyorsrögzítő, 375 és 1440 px.
- **Teljesítmény:** nem mértük. A felhasználó döntése szerint a token-keret miatt kimaradt. A mérőszkript elkészült (`scripts/teljesitmeny.mjs`: éles build, mobilprofil, LCP, CLS, fülváltás), de még egyszer sem futott végig sikeresen, ezért ellenőrizetlen.

## Előtte és utána

| Mérőszám | Előtte (1. fázis) | Utána |
|---|---|---|
| Mért cellák | 74 | 74 |
| Szöveges kontraszthiba, összesen | 809 | **0** |
| – világos téma | 749 | 0 |
| – sötét téma | 60 | 0 |
| Cella kontraszthibával | 70 | **0** |
| Érintési cél 24 px alatt | 406 | 146 * |
| Érintési cél 24–44 px között | 2722 | 1940 |
| Név nélküli vezérlő | 0 | 0 |
| Ismétlődő nevű vezérlő | 0 | 0 |
| Cella vízszintes kilógással | 1 | 2 ** |
| Képernyő `<h1>` nélkül | 48 | **0** |
| Tab-leütés | 1360 | 1360 |
| – a `:focus-visible` nem illeszkedik | 2 | 6 *** |
| – fókuszjelző kontraszthibával | 0 | 0 |
| Fókusz a ragadós sávok alatt (1. fázis: AK5) | 23 lépés (Rögzítés 5, Tervező 7, Áttekintés 11) | 0 a 213-ból |
| Nehezen elérhető cél telefonon (Fitts-index > 4) | 100 | 90 |
| Versengő elsődleges gomb, átlag/cella, telefon | 5,0 | 6,8 **** |
| Interaktív elem az első képernyőn, átlag | 28,9 | 27,5 |
| Különböző betűméret, átlag/cella | 6,8 | 8,3 ***** |

\* Mind a 146 a Rögzítés keretneveinek gombja (kb. 20 px magas; az egész sor is kattintható). A mérés után 28 px-re emeltük (`.rec-env-name`), újramérve még nincs. A korábbi 406 nagyrészt a Tervező csúszkája volt (1. fázis: A11), ezek most 44 px magasak.

\** Mindkettő a gyorsrögzítő javasolt összegeinek sora telefonon, világos és sötét témában. Szándékosan oldalra görgethető, a lap nem lóg ki: téves riasztás. Az 1. fázis kilógása (A06, hosszú nevek a `szelso` mintán) és a mérés közben előkerült két új (a sorok belső rácsa és a mínuszos figyelmeztetés gombja) javítva.

\*** Mind a Beállítások dátummezője (1. fázis: A14), két témában és két szélességen. A mező most `:focus-within` alapján kap 2 px-es keretet, ez a mérésben is látszik (`outline: 2px solid`). A mérő csak azt jelzi, hogy nem a `:focus-visible` szabályból jön.

\**** A mérő minden színes kitöltésű gombot elsődlegesnek számol, a zöld keretes „Kifizetve” gombokat is. A valódi gond a „Mind kifizetve” volt: kitöltött kék gombként versenyzett a „Kiadás rögzítése” gombbal. A mérés után keretes lett.

\***** A folyékony betűméretek (`clamp`) szélességenként más pixelértéket adnak. A tokenskála 9 lépcsős, a szám nem jelez szétesést.

## Akadálymentesség: az 1. fázis 12 megállapítása

| # | Megállapítás (1. fázis) | Állapot |
|---|---|---|
| 1 | A grafikonoknak nincs adatalternatívája | **Javítva most.** A futó egyenleg grafikonja kimondja a mélypontot és a terv végét, a kiadásgrafikon a legdrágább hónapot. Az Elemzés trendgrafikonja még csak címet kap. |
| 2 | A naptári nap állapota csak színből derül ki | **Javítva most.** „okt. 20.: Áram, lejárt” |
| 3 | Az „esedékes” pötty kontrasztja 1,88:1 | **Javítva most.** A sötétebb figyelmeztető szín. |
| 4 | A változásjelvény jelentése csak a `title`-ben | **Javítva most.** Felolvasva: „79%-kal több (eddig …, az előző hónapban ugyaneddig …)”. |
| 5 | A fókusz a ragadós alsó sáv alá kerül | Javítva az 5. fázisban (`scroll-padding`), 0 a 213 lépésből. |
| 6 | A naptár `role="grid"`, de nincs nyilas navigáció | **Javítva most.** `role="group"`, a napok egyszerű gombok. |
| 7 | Az `N` billentyűvel nyitott gyorsrögzítő után a fókusz a `body`-ra esik | **Javítva most.** A látható „Kiadás rögzítése” gombra kerül. |
| 8 | A mezőhibák nincsenek a mezőhöz kötve | Javítva az 1. és az 5. fázisban (`useFieldErrors`). |
| 9 | A csúszka értéke nyers számként hangzik el | **Javítva most.** `aria-valuetext`: „865 000 Ft”. |
| 10 | A Tervező hatályváltója csak vizuális | Javítva (rádiócsoport, `Segmented`). |
| 11 | Az Elemzés időablak-váltója csoport-szemantika nélkül | Javítva (rádiócsoport, `Segmented`). |
| 12 | A hőtérképnek nincs felirata | **Javítva most.** `<caption>` a felolvasónak. |

**A mérésből előkerült új hibák, javítva:**
- a csekksárga „Kifizetve” gombon a kék fókuszkeret sötét témában 1,37:1 volt, most a csekk tintája;
- a hosszú, nem törő nevek kitolták a sort az Áttekintésen és a Rögzítésen;
- a mínuszos figyelmeztetés gombja nem tördelt.

**Amit nem fed le:** képernyőolvasós végigjárás valódi eszközzel (VoiceOver, TalkBack), 200% és 400% nagyítás, Windows nagy kontrasztú mód.

## Kritika: régi és új egymás mellett

**Összkép.** A régi felület egy átlagos, fekete kártyás pénzügyi app volt. Az új saját arcot kapott: a Csekk sötétkék heroja és a hónapcsík egy mondatban felel a „jól állunk-e?” kérdésre, a magyar csekk sárgája pedig az egyetlen erős szín, és csak a fizetendőt jelöli.

**Ami javult:**
- **Egy figyelmeztetés egyszer.** Régen az Élelmiszer gyors fogyása a hero alatt és a teendők között is állt; most csak a teendők között.
- **Kimondott jelentés.** „Még elkölthető a keretekből”, „Bejött”, „Elment eddig”, „A bankszámlán a hónap végén”; a hónapcsík mondata („3 nappal előrébb jársz.”) a százalékok helyett.
- **Telefonon a fő művelet a hüvelykujj alatt.** A lebegő + gomb és az öt fül helyett teljes szélességű „Kiadás rögzítése” sáv és négy fül.
- **Gyorsrögzítő.** A telefon billentyűzete helyett saját számbillentyűzet, a kereteken a maradék, mentés előtt az „utána marad” mondat. Cserébe egy koppintással több: a keret kiválaszt, a gomb rögzít.
- **Széles képernyő.** A régi egyetlen 1100 px-es oszlop helyett kétoszlopos felső rész, két hasábban folyó listák, a Tervezőben a grafikon mellett.
- **Tervező.** A tengelyfeliratok nem csúsznak egymásra; a mínuszba forduló szakasz piros, mellette mondat a mélypontról.

**Ami még javítható:**

| Megállapítás | Súly | Javaslat |
|---|---|---|
| Telefonon a „Fizetendő és várható” csekkjei kétsorosak és magasak: három számla után a teendők már a hajtás alá kerülnek. | 🟡 | Egysoros csekk telefonon is (név, összeg, ikongomb), vagy legfeljebb három számla, utána „és még N”. |
| Széles képernyőn a hero alatt üres hely marad, ha a jobb oszlop (fizetendők, teendők) magasabb. | 🟢 | A számsor a hero alá, a bal oszlopba. |
| Az időszakváltó továbbra is natív, nagy legördülő a képernyő tetején (Fitts-index > 4 telefonon). | 🟢 | A Csekk vázlata szerint hónapnév címként és két lapozógomb; a lista egy alsó lapon. |
| A Tervező telefonon soronként három sor (név, összeg, csúszka), hosszú lista. | 🟢 | Összecsukható szakaszok, vagy a csúszka csak a kiválasztott soron. |

## Mi maradt nyitva

- **Teljesítménymérés:** a szkript kész, de ellenőrizetlen; a következő körben futtatandó (`node scripts/teljesitmeny.mjs --dist dist --minta <mentés.json>`), az éles és az 1. fázis buildjén.
- **Újramérés** a két utolsó javítás (keretnevek magassága, „Mind kifizetve”) után.
- **A felhasználói kutatás** (2. fázis, 2.1): a beszélgetések és a napló a családra várnak; utána véglegesedik a rangsor és a 3. fázis funkciódöntései.
- **Funkciójelöltek:** a megtakarítások egyenlegének saját helye, és a profilok, bemutató mód (DESIGN_TERV.md, 3. fázis).
