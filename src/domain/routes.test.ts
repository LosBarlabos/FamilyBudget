import { describe, expect, it } from 'vitest';
import { baseRoute, formatRoute, historyMode, parseRoute, sameRoute, SCREEN_PATH, type Route, type Screen } from './routes';

const r = (screen: Screen, focus: string | null = null, quick = false): Route => ({ screen, focus, quick });

describe('útvonalak', () => {
  it('hash nélkül és ismeretlen útvonalnál az Áttekintés a kezdőképernyő', () => {
    expect(parseRoute('')).toEqual(r('dashboard'));
    expect(parseRoute('#')).toEqual(r('dashboard'));
    expect(parseRoute('#/')).toEqual(r('dashboard'));
    expect(parseRoute('#/nincs-ilyen')).toEqual(r('dashboard'));
    // Ismeretlen képernyőnél a fókusz sem számít.
    expect(parseRoute('#/nincs-ilyen/abc')).toEqual(r('dashboard'));
  });

  it('minden képernyő a saját magyar útvonalán', () => {
    expect(parseRoute('#/attekintes')).toEqual(r('dashboard'));
    expect(parseRoute('#/rogzites')).toEqual(r('record'));
    expect(parseRoute('#/terv')).toEqual(r('planner'));
    expect(parseRoute('#/elemzes')).toEqual(r('analysis'));
    expect(parseRoute('#/naptar')).toEqual(r('calendar'));
    expect(parseRoute('#/kategoriak')).toEqual(r('categories'));
    expect(parseRoute('#/beallitasok')).toEqual(r('settings'));
    // Kis- és nagybetű, záró perjel, hiányzó perjel.
    expect(parseRoute('#/Rogzites/')).toEqual(r('record'));
    expect(parseRoute('#terv')).toEqual(r('planner'));
  });

  it('kategóriafókusz és gyorsrögzítő', () => {
    expect(parseRoute('#/rogzites/abc-123')).toEqual(r('record', 'abc-123'));
    expect(parseRoute('#/attekintes?gyors')).toEqual(r('dashboard', null, true));
    expect(parseRoute('#/rogzites/abc?gyors=1')).toEqual(r('record', 'abc', true));
    expect(parseRoute('#?gyors')).toEqual(r('dashboard', null, true));
    expect(parseRoute('#/terv?mas')).toEqual(r('planner'));
    expect(parseRoute('#/kategoriak/uj-cel')).toEqual(r('categories', 'uj-cel'));
  });

  it('a hibás kódolású fókusz nem dönti el az appot', () => {
    expect(parseRoute('#/rogzites/%E0%A4%A')).toEqual(r('record'));
  });

  it('oda-vissza alakítás', () => {
    const cases: Route[] = [
      r('dashboard'),
      r('dashboard', null, true),
      r('record', 'e1f3c0de-1111-4a2b-9c3d-123456789abc'),
      r('record', 'furcsa/név ?#', true),
      r('categories', 'uj-cel'),
      ...(Object.keys(SCREEN_PATH) as Screen[]).map((s) => r(s)),
    ];
    for (const c of cases) expect(parseRoute(formatRoute(c))).toEqual(c);
    expect(formatRoute(r('record', 'abc'))).toBe('#/rogzites/abc');
    expect(formatRoute(r('dashboard', null, true))).toBe('#/attekintes?gyors');
  });

  it('egyezés', () => {
    expect(sameRoute(r('record', 'a'), r('record', 'a'))).toBe(true);
    expect(sameRoute(r('record', 'a'), r('record', 'b'))).toBe(false);
    expect(sameRoute(r('record'), r('record', null, true))).toBe(false);
    expect(sameRoute(r('record'), r('planner'))).toBe(false);
  });

  it('előzménybejegyzés: új képernyőnél igen, ugyanarra és egy réteg helyére nem', () => {
    const off = { onLayer: false };
    expect(historyMode(r('dashboard'), r('record', 'a'), off)).toBe('push');
    expect(historyMode(r('dashboard'), r('dashboard', null, true), off)).toBe('push');
    expect(historyMode(r('record'), r('record'), off)).toBe('replace');
    expect(historyMode(r('record'), r('record', 'a'), { ...off, replace: true })).toBe('replace');
    // A gyorsrögzítőből vagy a Továbbiak lapról induló képernyőváltás a réteg bejegyzésének helyére lép.
    expect(historyMode(r('dashboard', null, true), r('categories'), { onLayer: true })).toBe('replace');
  });

  it('rétegből kért csere a réteg alatti bejegyzést cseréli, hogy ne maradjon két azonos bejegyzés', () => {
    // Gyorsrögzítő a Rögzítésen, „Váratlan kiadás” link: #/rogzites/varatlan a #/rogzites helyére.
    expect(historyMode(r('record', null, true), r('record', 'varatlan'), { onLayer: true, replace: true })).toBe('backReplace');
    expect(historyMode(r('categories', 'uj-cel', true), r('categories'), { onLayer: true, replace: true })).toBe('backReplace');
    // Másik képernyőre a réteg bejegyzésének helyére lép (a réteg alatti megmarad, oda visz a vissza).
    expect(historyMode(r('dashboard', null, true), r('record', 'varatlan'), { onLayer: true })).toBe('replace');
  });

  it('a réteg alatti útvonalra csak visszalépés kell, hogy ne maradjon két azonos bejegyzés', () => {
    // Gyorsrögzítő a Kategóriákon: a „Kategóriák” gomb (ugyanarra a képernyőre: csere kérésével) csak bezárja.
    expect(historyMode(r('categories', null, true), r('categories'), { onLayer: true, replace: true })).toBe('back');
    expect(historyMode(r('record', 'a', true), r('record', 'a'), { onLayer: true })).toBe('back');
    // A Továbbiak lap nem látszik az útvonalban: a már látott képernyő választása is csak bezárja.
    expect(historyMode(r('planner'), r('planner'), { onLayer: true, replace: true })).toBe('back');
    // Réteg nélkül nincs hova visszalépni.
    expect(historyMode(r('categories'), r('categories'), { onLayer: false, replace: true })).toBe('replace');
  });

  it('a gyorsrögzítő alatti útvonal', () => {
    expect(baseRoute(r('record', 'a', true))).toEqual(r('record', 'a'));
    expect(baseRoute(r('dashboard', null, true))).toEqual(r('dashboard'));
    expect(baseRoute(r('planner'))).toEqual(r('planner'));
  });
});
