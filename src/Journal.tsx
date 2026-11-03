import { useMemo, useState } from 'react';
import type { Db } from './types';
import { byOrder } from './useDb';
import { formatFull, occurrenceText, sortKey } from './format';

/** Fil chronologique de toutes les dates, de la plus récente à la plus ancienne. */
export function Journal({ db }: { db: Db }) {
  const [catId, setCatId] = useState('');
  const events = useMemo(() => new Map(db.events.map((e) => [e.id, e])), [db.events]);
  const cats = useMemo(() => new Map(db.categories.map((c) => [c.id, c])), [db.categories]);

  const byYear = useMemo(() => {
    const list = db.occurrences
      .filter((o) => !catId || events.get(o.eventId)?.categoryId === catId)
      .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    const groups = new Map<number, typeof list>();
    for (const o of list) groups.set(o.year, [...(groups.get(o.year) ?? []), o]);
    return [...groups.entries()];
  }, [db.occurrences, catId, events]);

  return (
    <section className="journal">
      <div className="toolbar">
        <select value={catId} onChange={(e) => setCatId(e.target.value)}>
          <option value="">Toutes les catégories</option>
          {[...db.categories].sort(byOrder).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {byYear.map(([year, list]) => (
        <div key={year} className="journal-year">
          <h2>{year}</h2>
          <ul>
            {list.map((o) => {
              const ev = events.get(o.eventId);
              const cat = ev && cats.get(ev.categoryId);
              return (
                <li key={o.id}>
                  <time title={o.date ? formatFull(o.date) : undefined} className={o.date ? '' : 'approx'}>
                    {occurrenceText(o)}
                  </time>
                  <span className="journal-name">{ev?.name}</span>
                  {cat && (
                    <span className="chip" style={{ background: cat.color }}>
                      {cat.name}
                    </span>
                  )}
                  {o.note && <p className="journal-note">{o.note}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
