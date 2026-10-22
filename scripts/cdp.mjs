// Közös segéd a design-felmérés szkriptjeihez (kepernyokepek.mjs, meresek.mjs): a gépre telepített Chrome
// fej nélküli módban, a DevTools protokollon, a Node beépített WebSocketjével. Nem kell hozzá npm-csomag.

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** A mérési mátrix (lásd docs/design/00-elokeszites.md). */
export const VIEWPORTS = [
  { width: 375, height: 812, touch: true }, // telefon
  { width: 768, height: 1024, touch: true }, // táblagép állva
  { width: 1024, height: 768, touch: false }, // kis laptop, táblagép fekve
  { width: 1440, height: 900, touch: false }, // asztali
];
export const THEMES = [
  { name: 'vilagos', scheme: 'light' },
  { name: 'sotet', scheme: 'dark' },
];
export const SCREENS = [
  ['01-attekintes', '#/attekintes'],
  ['02-rogzites', '#/rogzites'],
  ['03-tervezo', '#/terv'],
  ['04-elemzes', '#/elemzes'],
  ['05-szamlanaptar', '#/naptar'],
  ['06-kategoriak', '#/kategoriak'],
  ['07-beallitasok', '#/beallitasok'],
];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Egyszerű `--kulcs érték` kapcsolók. */
export function parseArgs(argv = process.argv.slice(2)) {
  return Object.fromEntries(argv.reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
}

/** Minimális DevTools-kliens: kérés–válasz azonosítóval, és egy eseményre várás. */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = fail;
  });
  let id = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) fail(new Error(`${msg.error.message} (${msg.error.code})`));
      else ok(msg.result);
    } else if (msg.method) {
      for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].method === msg.method) waiters.splice(i, 1)[0].ok(msg.params);
    }
  };
  return {
    send: (method, params = {}) =>
      new Promise((ok, fail) => {
        pending.set(++id, { ok, fail });
        ws.send(JSON.stringify({ id, method, params }));
      }),
    once: (method, timeout = 15_000) =>
      new Promise((ok, fail) => {
        waiters.push({ method, ok });
        setTimeout(() => fail(new Error(`Nem jött meg: ${method}`)), timeout);
      }),
    close: () => ws.close(),
  };
}

/** Ellenőrzi, hogy fut-e a fejlesztői szerver. */
export async function requireServer(base) {
  try {
    await fetch(base);
  } catch {
    throw new Error(`Nem érhető el: ${base}. Előbb indítsd el a fejlesztői szervert (npm run dev).`);
  }
}

/** Elindítja a Chrome-ot egy ideiglenes profillal, és visszaadja a lapot vezérlő segédeket. */
export async function openBrowser() {
  const profile = await mkdtemp(join(tmpdir(), 'design-felmeres-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--hide-scrollbars', '--lang=hu-HU', 'about:blank',
  ]);
  const port = await new Promise((ok, fail) => {
    let err = '';
    proc.stderr.on('data', (d) => {
      err += d;
      const m = err.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (m) ok(m[1]);
    });
    proc.on('exit', (code) => fail(new Error(`A Chrome kilépett (${code}). Más útvonalon van? CHROME=... \n${err}`)));
  });
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const settle = async () => {
    for (let i = 0; i < 50 && !(await evaluate(`document.querySelector('#root')?.childElementCount > 0`)); i++) await sleep(200);
    await evaluate('document.fonts.ready.then(() => true)');
    // A grafikonok animációja és a késleltetett elrendezés.
    await sleep(1200);
  };
  const load = async (url) => {
    // Előbb egy üres lap: ha csak a hash változna, az a lapon belül maradna, de minden mérés tiszta betöltésből
    // készüljön. A mintaadatos mód a fülön (sessionStorage) közben megmarad.
    const blank = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await blank;
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url });
    await loaded;
    await settle();
  };
  const setViewport = async (vp) => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.touch ? 2 : 1, mobile: vp.touch });
    await cdp.send('Emulation.setTouchEmulationEnabled', vp.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  };
  const setTheme = (theme) => cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme.scheme }] });
  /** Valódi billentyűleütés (a :focus-visible csak erre kapcsol be, a programból hívott focus() nem elég). */
  const press = async (key, code = key, keyCode = 0, modifiers = 0) => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers });
  };
  const stop = async () => {
    cdp.close();
    proc.kill();
    await sleep(300);
    await rm(profile, { recursive: true, force: true });
  };
  return { cdp, evaluate, load, setViewport, setTheme, press, stop };
}
