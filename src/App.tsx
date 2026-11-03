import { useEffect, useState } from 'react';
import { useDb } from './useDb';
import { Timeline } from './Timeline';
import { Journal } from './Journal';
import { Purchases } from './Purchases';
import { DataPanel } from './DataPanel';
import type { Category } from './types';

const TABS = [
  { id: 'timeline', label: 'Tableau' },
  { id: 'journal', label: 'Journal' },
  { id: 'purchases', label: 'Dépenses' },
  { id: 'data', label: 'Données' },
] as const;
type Tab = (typeof TABS)[number]['id'];

function tabFromHash(): Tab {
  const h = location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as Tab) : 'timeline';
}

export default function App() {
  const actions = useDb();
  const { db, error, setError } = actions;
  const [tab, setTab] = useState<Tab>(tabFromHash);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (t: Tab) => {
    location.hash = t;
  };

  const isEmpty = db && db.categories.length === 0 && db.purchases.length === 0;

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          <span aria-hidden>🏡</span> Montaud
        </h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => go(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="error" role="alert">
          {error}
          <button className="icon-btn" onClick={() => setError(null)} aria-label="Fermer">
            ✕
          </button>
        </div>
      )}

      <main>
        {!db ? (
          !error && <p className="muted pad">Chargement…</p>
        ) : isEmpty && tab !== 'data' ? (
          <div className="empty">
            <p>Aucune donnée pour l’instant.</p>
            <p>
              <button className="btn primary" onClick={() => go('data')}>
                Importer le fichier Excel
              </button>{' '}
              ou{' '}
              <button className="btn" onClick={() => actions.create<Category>('categories', { name: 'GÉNÉRAL', order: 0 })}>
                Commencer de zéro
              </button>
            </p>
          </div>
        ) : tab === 'timeline' ? (
          <Timeline db={db} actions={actions} />
        ) : tab === 'journal' ? (
          <Journal db={db} />
        ) : tab === 'purchases' ? (
          <Purchases db={db} actions={actions} />
        ) : (
          <DataPanel db={db} actions={actions} onImported={() => go('timeline')} />
        )}
      </main>
    </div>
  );
}
