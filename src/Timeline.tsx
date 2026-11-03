import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Db, HouseEvent, Occurrence } from './types';
import { byOrder, type DbActions } from './useDb';
import { occurrenceText, since, sortKey, todayIso } from './format';
import { CellDialog, CategoryDialog, EventDialog } from './dialogs';

type Dialog =
  | { kind: 'cell'; event: HouseEvent; year: number }
  | { kind: 'event'; event?: HouseEvent; categoryId: string }
  | { kind: 'category'; category?: Category };

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function Timeline({ db, actions }: { db: Db; actions: DbActions }) {
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const currentYear = new Date().getFullYear();

  const years = useMemo(() => {
    const ys = db.occurrences.map((o) => o.year);
    const min = Math.min(currentYear, ...ys);
    const max = Math.max(currentYear, ...ys);
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }, [db.occurrences, currentYear]);

  /** occurrences indexées par événement puis par année */
  const cells = useMemo(() => {
    const map = new Map<string, Map<number, Occurrence[]>>();
    for (const o of db.occurrences) {
      let byYear = map.get(o.eventId);
      if (!byYear) map.set(o.eventId, (byYear = new Map()));
      byYear.set(o.year, [...(byYear.get(o.year) ?? []), o].sort((a, b) => sortKey(a).localeCompare(sortKey(b))));
    }
    return map;
  }, [db.occurrences]);

  const lastOf = (eventId: string) => {
    const byYear = cells.get(eventId);
    if (!byYear) return undefined;
    const all = [...byYear.values()].flat().filter((o) => sortKey(o) <= todayIso());
    return all.sort((a, b) => sortKey(b).localeCompare(sortKey(a)))[0];
  };

  const categories = [...db.categories].sort(byOrder);
  const eventsOf = (catId: string) => db.events.filter((e) => e.categoryId === catId).sort(byOrder);
  const q = norm(query.trim());

  // Ouvre le tableau sur les années les plus récentes.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  return (
    <section className="timeline">
      <div className="toolbar">
        <input
          type="search"
          placeholder="Rechercher un événement…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn" onClick={() => setDialog({ kind: 'category' })}>
          + Catégorie
        </button>
      </div>

      <div className="grid-scroll" ref={scroller}>
        <table className="grid">
          <thead>
            <tr>
              <th className="col-name">Événement</th>
              <th className="col-last">Dernière fois</th>
              {years.map((y) => (
                <th key={y} className={y === currentYear ? 'current' : ''}>
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => {
              const catMatches = q && norm(cat.name).includes(q);
              const events = eventsOf(cat.id).filter((e) => !q || catMatches || norm(e.name).includes(q));
              if (q && events.length === 0) return null;
              const collapsed = !q && cat.collapsed;
              return (
                <Fragment key={cat.id}>
                  <tr className="cat-row" style={{ '--cat': cat.color || '#ddd' } as React.CSSProperties}>
                    <th className="col-name" scope="rowgroup">
                      <button
                        className="chevron"
                        aria-label={collapsed ? 'Déplier' : 'Replier'}
                        aria-expanded={!collapsed}
                        onClick={() => actions.update<Category>('categories', cat.id, { collapsed: !cat.collapsed })}
                      >
                        {collapsed ? '▸' : '▾'}
                      </button>
                      <button className="link cat-name" onClick={() => setDialog({ kind: 'category', category: cat })}>
                        {cat.name}
                      </button>
                      <span className="count">{eventsOf(cat.id).length}</span>
                      <button
                        className="add-event"
                        onClick={() => setDialog({ kind: 'event', categoryId: cat.id })}
                        title={`Ajouter un événement dans ${cat.name}`}
                        aria-label={`Ajouter un événement dans ${cat.name}`}
                      >
                        +
                      </button>
                    </th>
                    <td className="col-last" />
                    <td colSpan={years.length} />
                  </tr>
                  {!collapsed &&
                    events.map((ev) => {
                      const last = lastOf(ev.id);
                      return (
                        <tr key={ev.id}>
                          <th className="col-name" scope="row">
                            <button className="link" onClick={() => setDialog({ kind: 'event', event: ev, categoryId: cat.id })}>
                              {ev.name}
                            </button>
                            {ev.note && <span className="note-dot" title={ev.note} />}
                          </th>
                          <td className="col-last muted">{last ? since(last) : ''}</td>
                          {years.map((y) => {
                            const occ = cells.get(ev.id)?.get(y) ?? [];
                            return (
                              <td
                                key={y}
                                className={`cell ${y === currentYear ? 'current' : ''} ${occ.length ? 'filled' : ''}`}
                              >
                                <button
                                  className="cell-btn"
                                  onClick={() => setDialog({ kind: 'cell', event: ev, year: y })}
                                  aria-label={`${ev.name} ${y}`}
                                >
                                  {occ.map((o) => (
                                    <span key={o.id} className={o.date ? 'occ' : 'occ approx'} title={o.note}>
                                      {occurrenceText(o)}
                                      {o.note && <span className="note-dot" />}
                                    </span>
                                  ))}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {dialog?.kind === 'cell' && (
        <CellDialog
          event={dialog.event}
          year={dialog.year}
          occurrences={cells.get(dialog.event.id)?.get(dialog.year) ?? []}
          actions={actions}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'event' && (
        <EventDialog
          db={db}
          event={dialog.event}
          categoryId={dialog.categoryId}
          actions={actions}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'category' && (
        <CategoryDialog db={db} category={dialog.category} actions={actions} onClose={() => setDialog(null)} />
      )}
    </section>
  );
}
