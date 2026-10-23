import { useState } from 'react';
import type { BudgetData } from '../../domain/types';
import { REPO_RE } from '../../sync/github';
import { connect, disconnect, probe, renameDevice, syncNow, useSyncConfig, useSyncState, type SyncConfig } from '../../sync/engine';
import { useToast } from '../context';
import { Icon } from './common';
import { syncLabel } from './SyncButton';

/**
 * Közös használat beállítása: privát GitHub-tároló, token, név. A Beállításokban be- és kikapcsolható;
 * az első indításkor (`join`) egy új eszköz a meglévő közös költségvetéshez csatlakozik vele.
 */
export function SyncPanel({ join = false }: { join?: boolean }) {
  const cfg = useSyncConfig();
  if (cfg && !join) return <Connected cfg={cfg} />;
  return <ConnectForm join={join} />;
}

function Connected({ cfg }: { cfg: SyncConfig }) {
  const st = useSyncState();
  const toast = useToast();
  const [name, setName] = useState(cfg.name);
  const [armed, setArmed] = useState(false);
  return (
    <div className="sync-panel">
      <p className="small m-0">
        <Icon name="lock" /> Közös költségvetés: <strong>{cfg.repo}</strong> · {cfg.path}
      </p>
      <p className={`small ${st.status === 'error' ? 'neg' : 'muted'} m-0`} role="status">
        {st.status === 'error' ? st.error : syncLabel(st)}
      </p>
      <div className="sync-row">
        <label className="field" style={{ flex: '1 1 200px' }}>
          A neved ezen az eszközön
          <input type="text" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn"
          disabled={!name.trim() || name.trim() === cfg.name}
          onClick={() => {
            renameDevice(name.trim());
            toast(`Az új rögzítések ezen a néven jelennek meg: ${name.trim()}`);
          }}
        >
          Név mentése
        </button>
      </div>
      <div className="sync-row">
        <button className="btn primary" disabled={st.status === 'syncing'} onClick={() => syncNow()}>
          <Icon name="refresh" /> Szinkronizálás most
        </button>
        {!armed ? (
          <button className="btn ghost" onClick={() => setArmed(true)}>Kikapcsolás ezen az eszközön…</button>
        ) : (
          <>
            <span className="small muted" style={{ flex: '1 1 220px' }}>
              Az adatok itt megmaradnak, de ez az eszköz többé nem szinkronizál. A token törlődik innen.
            </span>
            <button
              className="btn danger"
              onClick={async () => {
                await disconnect();
                toast('A közös használat kikapcsolva ezen az eszközön');
              }}
            >
              Kikapcsolás
            </button>
            <button className="btn ghost" onClick={() => setArmed(false)}>Mégse</button>
          </>
        )}
      </div>
    </div>
  );
}

function ConnectForm({ join }: { join: boolean }) {
  const toast = useToast();
  const [repo, setRepo] = useState('');
  const [path, setPath] = useState('data.json');
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A tárolóban már van közös költségvetés, és ezen az eszközön is: dönteni kell, melyik maradjon.
  const [choice, setChoice] = useState<BudgetData | null>(null);

  const cfg: SyncConfig = { repo: repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, ''), path: path.trim() || 'data.json', token: token.trim(), name: name.trim() };
  const valid = REPO_RE.test(cfg.repo) && cfg.token !== '' && cfg.name !== '';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const done = (text: string) => {
    setChoice(null);
    toast(text);
  };

  const start = () =>
    run(async () => {
      const { remote } = await probe(cfg);
      if (join) {
        if (!remote) throw new Error('A tárolóban még nincs közös költségvetés. Előbb az egyik eszközön állítsd be, és ott kapcsold be a közös használatot.');
        await connect(cfg, 'download');
        return done('Csatlakoztál a közös költségvetéshez');
      }
      if (!remote) {
        await connect(cfg, 'upload');
        return done('Közös használat bekapcsolva: az adatok feltöltve');
      }
      setChoice(remote);
    });

  return (
    <div className="sync-panel">
      {!join && (
        <ol className="sync-steps small muted">
          <li>
            Hozz létre egy <strong>privát</strong> tárolót a GitHubon, pl. <code>FamilyBudget-adatok</code> (
            <a href="https://github.com/new" target="_blank" rel="noreferrer">új tároló</a>).
          </li>
          <li>
            Készíts hozzá tokent (
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">fine-grained token</a>): Repository
            access → <em>Only select repositories</em> → az adattároló; Permissions → <em>Contents: Read and write</em>.
          </li>
          <li>Írd be ide a tárolót, a tokent és a neved. A másik telefonon ugyanezzel a tárolóval és tokennel, a saját neveddel csatlakozz.</li>
        </ol>
      )}
      <div className="form-grid">
        <label className="field">
          Tároló (tulajdonos/név)
          <input type="text" placeholder="pl. felhasznalonev/koltsegvetes-adatok" value={repo} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setRepo(e.target.value)} />
        </label>
        <label className="field">
          GitHub-token
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
        </label>
        <label className="field">
          A neved (ezzel látszik, ki rögzített)
          <input type="text" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Fájl a tárolóban
          <input type="text" value={path} autoCapitalize="off" spellCheck={false} onChange={(e) => setPath(e.target.value)} />
        </label>
      </div>
      <p className="tiny faint m-0">
        A token csak ebben a böngészőben tárolódik. A költségvetés csak privát tárolóba kerülhet; nyilvánoshoz az app nem kapcsolódik.
      </p>
      {error && <div className="error" role="alert">{error}</div>}
      {!choice ? (
        <div className="sync-row">
          <button className="btn primary" disabled={!valid || busy} aria-busy={busy} onClick={start}>
            <Icon name={join ? 'users' : 'cloud-upload'} /> {busy ? 'Kapcsolódás…' : join ? 'Csatlakozás' : 'Bekapcsolás'}
          </button>
        </div>
      ) : (
        <div className="import-preview">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>A tárolóban már van közös költségvetés</div>
          <div className="small muted num mb-3">
            {choice.categories.filter((c) => !c.archived).length} kategória · {choice.entries.length} rögzítés
          </div>
          <div className="sync-row">
            <button className="btn primary" disabled={busy} onClick={() => run(async () => { await connect(cfg, 'download'); done('Csatlakoztál a közös költségvetéshez'); })}>
              A közöset használom
            </button>
            <button className="btn danger" disabled={busy} onClick={() => run(async () => { await connect(cfg, 'upload'); done('A közös költségvetés felülírva az itteni adatokkal'); })}>
              Az itteni adattal felülírom
            </button>
            <button className="btn ghost" disabled={busy} onClick={() => setChoice(null)}>Mégse</button>
          </div>
          <div className="tiny faint mt-2">
            „A közöset használom”: az ezen az eszközön lévő adatok helyére a közös kerül. Előtte érdemes menteni.
          </div>
        </div>
      )}
    </div>
  );
}
