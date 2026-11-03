import { useState } from 'react';
import { api } from './api';
import type { Db } from './types';
import type { DbActions } from './useDb';

export function DataPanel({ db, actions, onImported }: { db: Db; actions: DbActions; onImported: () => void }) {
  const [busy, setBusy] = useState(false);
  const hasData = db.categories.length > 0 || db.purchases.length > 0;

  const confirmReplace = () =>
    !hasData || confirm('Cet import va REMPLACER toutes les données actuelles. Pensez à exporter une sauvegarde avant. Continuer ?');

  const handle = async (load: () => Promise<Db>) => {
    if (!confirmReplace()) return;
    setBusy(true);
    const res = await actions.run(load());
    setBusy(false);
    if (res) {
      actions.setDb(res);
      onImported();
    }
  };

  return (
    <section className="data-panel">
      <div className="card">
        <h2>Importer le fichier Excel</h2>
        <p className="muted">
          Une ligne par événement, une colonne par année. Les lignes en MAJUSCULES sans date deviennent des catégories.
          L’année de la colonne fait foi (les cellules au format « jj mmmm » ne gardent que le jour et le mois). Une
          feuille avec les colonnes <em>date / Montant / Biens / Note</em> est importée dans les dépenses.
        </p>
        <input
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) handle(() => api.importXlsx(f));
          }}
        />
      </div>

      <div className="card">
        <h2>Sauvegarde</h2>
        <p className="muted">
          {db.categories.length} catégories · {db.events.length} événements · {db.occurrences.length} dates ·{' '}
          {db.purchases.length} dépenses
        </p>
        <p>
          <a className="btn" href="/api/export" download>
            Exporter (JSON)
          </a>
        </p>
        <label>
          Restaurer une sauvegarde JSON
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              let parsed: unknown;
              try {
                parsed = JSON.parse(await f.text());
              } catch {
                actions.setError('Fichier JSON illisible');
                return;
              }
              handle(() => api.importJson(parsed));
            }}
          />
        </label>
      </div>
    </section>
  );
}
