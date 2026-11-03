import { useMemo } from 'react';
import { Sparkles, StickyNote } from 'lucide-react';
import { useApp } from '../context';
import { catColor, matches, type Entry } from '../model';
import { capitalize, formatFull, monthName, since, todayIso, whenText } from '../format';
import { Thumbs } from '../components/Attachments';
import { CategoryChips, SearchBox } from '../components/Filters';

function EntryCard({ e }: { e: Entry }) {
  const { openEntry } = useApp();
  const o = e.occ;
  const future = (o.date ?? '') > todayIso();
  return (
    <article
      className={`card entry ${future ? 'future' : ''}`}
      style={{ '--c': catColor(e.category) } as React.CSSProperties}
      onClick={() => openEntry(o.id)}
      tabIndex={0}
      onKeyDown={(ev) => ev.key === 'Enter' && openEntry(o.id)}
    >
      <div className="entry-head">
        <span className="entry-icon" aria-hidden>
          {e.category.icon}
        </span>
        <div className="entry-title">
          <h3>{e.event.name}</h3>
          <p className="entry-when">
            {o.date ? (
              <span title={formatFull(o.date)}>{capitalize(whenText(o))}</span>
            ) : (
              <span className="approx">
                <Sparkles size={12} /> {o.label || 'Date approximative'}
              </span>
            )}
            <span className="sep">·</span>
            <span className="muted">{e.category.name}</span>
          </p>
        </div>
        <span className="entry-since">{since(o)}</span>
      </div>
      {o.note && (
        <p className="entry-note">
          <StickyNote size={13} /> {o.note}
        </p>
      )}
      <Thumbs files={e.files} caption={`${e.event.name} — ${whenText(o, true)}`} occurrenceId={o.id} />
    </article>
  );
}

export function TimelineView() {
  const { entries, query, cats, db } = useApp();
  const list = useMemo(() => entries.filter((e) => matches(e, query, cats)), [entries, query, cats]);

  const years = useMemo(() => {
    const groups: { year: number; months: { month: number; items: Entry[] }[] }[] = [];
    for (const e of list) {
      let y = groups.at(-1);
      if (!y || y.year !== e.occ.year) groups.push((y = { year: e.occ.year, months: [] }));
      const m = e.month ?? 0;
      let g = y.months.at(-1);
      if (!g || g.month !== m) y.months.push((g = { month: m, items: [] }));
      g.items.push(e);
    }
    return groups;
  }, [list]);

  const first = entries.at(-1)?.occ.year;
  const photos = db.attachments.filter((a) => a.mime.startsWith('image/')).length;

  return (
    <section className="view timeline-view">
      <header className="view-head">
        <div>
          <h1>Le fil de la maison</h1>
          <p className="muted">
            {entries.length} événements{first ? ` depuis ${first}` : ''} · {photos} photos
          </p>
        </div>
        <SearchBox placeholder="Rechercher un événement…" />
      </header>
      <CategoryChips />

      {years.length === 0 && <p className="empty-state">Aucun événement ne correspond.</p>}

      <div className="tl">
        {years.map((y) => (
          <section key={y.year} className="tl-year">
            <h2 className="tl-year-title">
              <span>{y.year}</span>
              <small>{y.months.reduce((n, m) => n + m.items.length, 0)} événements</small>
            </h2>
            {y.months.map((m) => (
              <div key={m.month} className="tl-month">
                <h3 className="tl-month-title">{m.month ? capitalize(monthName(m.month)) : 'Dans l’année'}</h3>
                <div className="tl-items">
                  {m.items.map((e) => (
                    <div key={e.occ.id} className="tl-item" style={{ '--c': catColor(e.category) } as React.CSSProperties}>
                      <span className="tl-dot" />
                      <EntryCard e={e} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
