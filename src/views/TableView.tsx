import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { ChevronDown, ChevronRight, Paperclip } from 'lucide-react';
import { useApp } from '../context';
import { byOrder, catColor, matches, type Entry } from '../model';
import type { Category, HouseEvent, Occurrence } from '../types';
import { isoOf, since, todayIso, whenText } from '../format';
import { CategoryChips, SearchBox } from '../components/Filters';

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const COLLAPSE_KEY = 'montaud.table.collapsed';

/** Même jour/mois dans une autre année (29 février -> 28). */
function withYear(iso: string, year: number) {
  const m = Number(iso.slice(5, 7));
  let d = Number(iso.slice(8, 10));
  const max = new Date(Date.UTC(year, m, 0)).getUTCDate();
  if (d > max) d = max;
  return isoOf(year, m, d);
}

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function CellChip({ e }: { e: Entry }) {
  const { openEntry } = useApp();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: e.occ.id, data: { e } });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cell-chip ${e.occ.date ? '' : 'approx'} ${isDragging ? 'dragging' : ''}`}
      onClick={(ev) => {
        ev.stopPropagation();
        openEntry(e.occ.id);
      }}
      title={`${e.event.name} — ${whenText(e.occ, true)}${e.occ.note ? `\n${e.occ.note}` : ''}`}
    >
      {whenText(e.occ)}
      {(e.files.length > 0 || e.occ.note) && (
        <span className="cell-marks">
          {e.occ.note && <i className="note-dot" />}
          {e.files.length > 0 && <Paperclip size={11} />}
        </span>
      )}
    </button>
  );
}

function Cell({ event, year, items, current }: { event: HouseEvent; year: number; items: Entry[]; current: boolean }) {
  const { newEntry } = useApp();
  const { setNodeRef, isOver } = useDroppable({ id: `${event.id}|${year}` });
  return (
    <td
      ref={setNodeRef}
      className={`tcell ${current ? 'current' : ''} ${isOver ? 'over' : ''} ${items.length ? 'filled' : ''}`}
      onClick={() => newEntry({ eventId: event.id, year, date: withYear(todayIso(), year) })}
      title={items.length ? undefined : `Ajouter « ${event.name} » en ${year}`}
    >
      <div className="tcell-inner">
        {items.map((e) => (
          <CellChip key={e.occ.id} e={e} />
        ))}
      </div>
    </td>
  );
}

export function TableView() {
  const { db, entries, query, cats, actions, newEntry } = useApp();
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [dragging, setDragging] = useState<Entry | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const currentYear = new Date().getFullYear();
  const today = todayIso();

  const years = useMemo(() => {
    const ys = db.occurrences.map((o) => o.year);
    const min = Math.min(currentYear, ...ys);
    const max = Math.max(currentYear, ...ys);
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }, [db.occurrences, currentYear]);

  /** rubrique -> année -> événements (ordre chronologique) */
  const grid = useMemo(() => {
    const map = new Map<string, Map<number, Entry[]>>();
    for (const e of [...entries].reverse()) {
      let byYear = map.get(e.event.id);
      if (!byYear) map.set(e.event.id, (byYear = new Map()));
      byYear.set(e.occ.year, [...(byYear.get(e.occ.year) ?? []), e]);
    }
    return map;
  }, [entries]);

  const lastOf = (eventId: string) => {
    const list = [...(grid.get(eventId)?.values() ?? [])].flat();
    return list.filter((e) => e.key <= today).at(-1) ?? list.at(-1);
  };

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...n]));
      } catch {
        /* stockage indisponible */
      }
      return n;
    });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  const onDragStart = (ev: DragStartEvent) => setDragging((ev.active.data.current as { e: Entry }).e);
  const onDragEnd = async (ev: DragEndEvent) => {
    setDragging(null);
    const e = (ev.active.data.current as { e: Entry } | undefined)?.e;
    const target = ev.over?.id as string | undefined;
    if (!e || !target) return;
    const [eventId, y] = target.split('|');
    const year = Number(y);
    if (eventId === e.event.id && year === e.occ.year) return;
    const o = e.occ;
    const patch: Partial<Occurrence> = { eventId, year };
    if (o.date) {
      patch.date = withYear(o.date, year);
      if (o.endDate) patch.endDate = withYear(o.endDate, Number(o.endDate.slice(0, 4)) + (year - o.year));
    }
    const res = await actions.update<Occurrence>('occurrences', o.id, patch);
    const ev2 = db.events.find((x) => x.id === eventId);
    if (res) actions.setToast(`Déplacé : ${ev2?.name ?? ''} · ${year}`);
  };

  const q = norm(query.trim());
  const categories = [...db.categories].sort(byOrder).filter((c) => !cats.size || cats.has(c.id));
  const visible = new Set(entries.filter((e) => matches(e, query, cats)).map((e) => e.event.id));
  const eventsOf = (c: Category) =>
    db.events
      .filter((e) => e.categoryId === c.id)
      .filter((e) => !q || norm(e.name).includes(q) || norm(c.name).includes(q) || visible.has(e.id))
      .sort(byOrder);

  return (
    <section className="view table-view">
      <header className="view-head">
        <div>
          <h1>Tableau</h1>
          <p className="muted">Une ligne par rubrique, une colonne par année — glisser une date pour la déplacer.</p>
        </div>
        <SearchBox placeholder="Rechercher une rubrique…" />
      </header>
      <CategoryChips />

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="tgrid-scroll" ref={scroller}>
          <table className="tgrid">
            <thead>
              <tr>
                <th className="tname">Rubrique</th>
                <th className="tlast">Dernière fois</th>
                {years.map((y) => (
                  <th key={y} className={`tyear ${y === currentYear ? 'current' : ''}`}>
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => {
                const events = eventsOf(c);
                if (q && !events.length) return null;
                const isCollapsed = !q && collapsed.has(c.id);
                return (
                  <Fragment key={c.id}>
                    <tr className="tcat" style={{ '--c': catColor(c) } as React.CSSProperties}>
                      <th className="tname" colSpan={2}>
                        <button className="tcat-btn" onClick={() => toggle(c.id)} aria-expanded={!isCollapsed}>
                          {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                          <span className="tcat-icon">{c.icon}</span>
                          {c.name}
                          <small>{events.length}</small>
                        </button>
                      </th>
                      <td colSpan={years.length} />
                    </tr>
                    {!isCollapsed &&
                      events.map((ev) => {
                        const last = lastOf(ev.id);
                        return (
                          <tr key={ev.id} className="trow" style={{ '--c': catColor(c) } as React.CSSProperties}>
                            <th className="tname" scope="row">
                              <button className="link" onClick={() => newEntry({ eventId: ev.id })} title="Ajouter une date">
                                {ev.name}
                              </button>
                            </th>
                            <td className="tlast">{last ? since(last.occ) : <span className="muted">—</span>}</td>
                            {years.map((y) => (
                              <Cell key={y} event={ev} year={y} items={grid.get(ev.id)?.get(y) ?? []} current={y === currentYear} />
                            ))}
                          </tr>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && <span className="cell-chip overlay">{whenText(dragging.occ)}</span>}
        </DragOverlay>
      </DndContext>
    </section>
  );
}
