import { useBudget } from '../context';
import { Icon } from '../components/common';

/** Helyőrző: a hőtérkép, a trendek, az éves összesítő és a címkék egy későbbi lépésben kerülnek ide. */
export function Analysis() {
  const { go } = useBudget();
  return (
    <>
      <div className="page-head">
        <h1>Elemzés</h1>
      </div>
      <div className="card empty-state">
        <Icon name="chart-histogram" className="empty-icon" />
        <h2>Ez a képernyő még készül</h2>
        <p className="muted small">
          Itt lesz a kategóriák időszakonkénti hőtérképe, egy-egy kategória trendje, az éves összesítő, valamint a
          megjegyzések #címkéi és a kereső. Addig az Áttekintés grafikonjai mutatják a futó egyenleget és a havi kiadásokat.
        </p>
        <button onClick={() => go('dashboard')}>
          <Icon name="layout-dashboard" /> Áttekintés
        </button>
      </div>
    </>
  );
}
