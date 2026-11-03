import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Camera, FolderKanban, GitCommitVertical, Plus, Receipt, Settings, Table2, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { useDb } from './useDb';
import { auth } from './supabase';
import { Login } from './components/Login';
import { Ctx, type AppCtx, type EditorPreset } from './context';
import { buildEntries } from './model';
import type { Category } from './types';
import { TimelineView } from './views/TimelineView';
import { CalendarView } from './views/CalendarView';
import { TableView } from './views/TableView';
import { TopicsView } from './views/TopicsView';
import { PhotosView } from './views/PhotosView';
import { PurchasesView } from './views/PurchasesView';
import { SettingsView } from './views/SettingsView';
import { EntryEditor } from './components/EntryEditor';
import { Lightbox, type LightboxItem } from './components/Lightbox';

const VIEWS = [
  { id: 'fil', label: 'Fil', icon: GitCommitVertical },
  { id: 'calendrier', label: 'Calendrier', short: 'Agenda', icon: CalendarDays },
  { id: 'tableau', label: 'Tableau', icon: Table2 },
  { id: 'rubriques', label: 'Rubriques', short: 'Suivi', icon: FolderKanban },
  { id: 'photos', label: 'Photos', icon: Camera },
  { id: 'depenses', label: 'Dépenses', short: '€', icon: Receipt },
  { id: 'reglages', label: 'Réglages', icon: Settings },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

function viewFromHash(): ViewId {
  const h = location.hash.slice(1);
  return VIEWS.some((v) => v.id === h) ? (h as ViewId) : 'fil';
}

export default function App() {
  // Connexion (uniquement en mode partagé Supabase)
  const [session, setSession] = useState<Session | null | 'loading'>(auth.enabled ? 'loading' : null);
  const [member, setMember] = useState<boolean | null>(null);
  useEffect(() => {
    if (!auth.enabled) return;
    auth.session().then(setSession, () => setSession(null));
    return auth.onChange(setSession);
  }, []);
  const userEmail = session && session !== 'loading' ? session.user.email : undefined;
  useEffect(() => {
    if (!userEmail) return;
    // Nettoie l'adresse après un lien magique (#access_token=…)
    if (/access_token|error_description/.test(location.hash)) history.replaceState(null, '', `${location.pathname}#fil`);
    setMember(null);
    auth.isMember().then(setMember, () => setMember(false));
  }, [userEmail]);
  const ready = !auth.enabled || (Boolean(userEmail) && member === true);

  const actions = useDb(ready);
  const { db, error, setError, toast } = actions;
  const [view, setView] = useState<ViewId>(viewFromHash);
  const [editor, setEditor] = useState<{ id?: string; preset?: EditorPreset; key: number } | null>(null);
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; index: number } | null>(null);
  const [query, setQuery] = useState('');
  const [cats, setCats] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (v: ViewId) => {
    location.hash = v;
    window.scrollTo({ top: 0 });
  };

  const entries = useMemo(() => (db ? buildEntries(db) : []), [db]);
  const openEntry = useCallback((id: string) => {
    setLightbox(null);
    setEditor({ id, key: Date.now() });
  }, []);
  const newEntry = useCallback((preset?: EditorPreset) => setEditor({ preset, key: Date.now() }), []);

  if (auth.enabled && session === null) return <Login />;
  if (auth.enabled && userEmail && member === false) {
    return (
      <div className="splash">
        <span className="logo-mark">M</span>
        <p>
          L’adresse <strong>{userEmail}</strong> n’est pas autorisée sur Montaud.
        </p>
        <button className="btn" onClick={() => auth.signOut()}>
          Utiliser une autre adresse
        </button>
      </div>
    );
  }

  if (!db) {
    return (
      <div className="splash">
        <span className="logo-mark">M</span>
        {error ? <p className="error-text">{error}</p> : <p className="muted">Chargement…</p>}
      </div>
    );
  }

  const ctx: AppCtx = {
    db,
    actions,
    entries,
    query,
    setQuery,
    cats,
    toggleCat: (id) =>
      setCats((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    clearCats: () => setCats(new Set()),
    openEntry,
    newEntry,
    openLightbox: (items, index) => setLightbox({ items, index }),
  };

  const isEmpty = db.categories.length === 0 && db.purchases.length === 0;

  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="logo-mark">M</span>
            <div>
              <strong>Montaud</strong>
              <small>Le carnet de la maison</small>
            </div>
          </div>
          <button className="btn primary block" onClick={() => newEntry()} disabled={isEmpty}>
            <Plus size={18} /> Nouvel événement
          </button>
          <nav className="side-nav">
            {VIEWS.map(({ id, label, icon: Icon }) => (
              <button key={id} className={view === id ? 'active' : ''} onClick={() => go(id)}>
                <Icon size={18} /> {label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="content">
          {error && (
            <div className="alert" role="alert">
              {error}
              <button className="icon-btn" onClick={() => setError(null)} aria-label="Fermer">
                <X size={16} />
              </button>
            </div>
          )}
          {isEmpty && view !== 'reglages' ? (
            <div className="welcome">
              <span className="logo-mark xl">M</span>
              <h1>Bienvenue dans le carnet de Montaud</h1>
              <p className="muted">Commence par importer ton fichier Excel, ou pars d’une page blanche.</p>
              <div className="row center">
                <button className="btn primary" onClick={() => go('reglages')}>
                  Importer le fichier Excel
                </button>
                <button
                  className="btn"
                  onClick={() => actions.create<Category>('categories', { name: 'Maison', icon: '🏡', color: '#3d9970', order: 0 })}
                >
                  Commencer de zéro
                </button>
              </div>
            </div>
          ) : view === 'fil' ? (
            <TimelineView />
          ) : view === 'calendrier' ? (
            <CalendarView />
          ) : view === 'tableau' ? (
            <TableView />
          ) : view === 'rubriques' ? (
            <TopicsView />
          ) : view === 'photos' ? (
            <PhotosView />
          ) : view === 'depenses' ? (
            <PurchasesView />
          ) : (
            <SettingsView onImported={() => go('fil')} userEmail={userEmail} />
          )}
        </main>

        {!isEmpty && view !== 'depenses' && view !== 'reglages' && (
          <button className="fab" onClick={() => newEntry()} aria-label="Nouvel événement">
            <Plus size={26} />
          </button>
        )}

        <nav className="bottom-nav">
          {VIEWS.filter((v) => v.id !== 'reglages').map((v) => (
            <button key={v.id} className={view === v.id ? 'active' : ''} onClick={() => go(v.id)} aria-label={v.label}>
              <v.icon size={20} />
              <span>{'short' in v ? v.short : v.label}</span>
            </button>
          ))}
          <button className={view === 'reglages' ? 'active' : ''} onClick={() => go('reglages')} aria-label="Réglages">
            <Settings size={20} />
            <span>Plus</span>
          </button>
        </nav>
      </div>

      {editor && <EntryEditor key={editor.key} occurrenceId={editor.id} preset={editor.preset} onClose={() => setEditor(null)} />}
      {lightbox && (
        <Lightbox items={lightbox.items} start={lightbox.index} onClose={() => setLightbox(null)} onOpenEntry={openEntry} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </Ctx.Provider>
  );
}
