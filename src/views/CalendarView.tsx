import { useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { useApp } from '../context';
import { catColor, matches, type Entry } from '../model';
import type { Occurrence } from '../types';
import { addDays, capitalize, daysBetween, formatFull, isoOf, monthName, monthYear, todayIso, whenText } from '../format';
import { CategoryChips } from '../components/Filters';
import { Sheet } from '../components/Sheet';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MAX_SPAN = 92;

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** 0 = lundi */
function weekday(y: number, m: number, d: number) {
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

function useEntriesByDay(entries: Entry[]) {
  return useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      const { date, endDate } = e.occ;
      if (!date) continue;
      const span = endDate ? Math.min(daysBetween(date, endDate), MAX_SPAN) : 0;
      for (let i = 0; i <= span; i++) {
        const k = addDays(date, i);
        map.set(k, [...(map.get(k) ?? []), e]);
      }
    }
    return map;
  }, [entries]);
}

function Pill({ e, day }: { e: Entry; day: string }) {
  const { openEntry } = useApp();
  const id = `${e.occ.id}|${day}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: { e, day } });
  const start = e.occ.date === day;
  const end = (e.occ.endDate ?? e.occ.date) === day;
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`pill ${start ? 'start' : ''} ${end ? 'end' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ '--c': catColor(e.category) } as React.CSSProperties}
      onClick={(ev) => {
        ev.stopPropagation();
        openEntry(e.occ.id);
      }}
      title={`${e.event.name} — ${whenText(e.occ, true)}`}
    >
      <span aria-hidden>{e.category.icon}</span>
      <span className="pill-text">{e.event.name}</span>
      {e.files.length > 0 && <span className="pill-clip">📎</span>}
    </button>
  );
}

function ApproxChip({ e }: { e: Entry }) {
  const { openEntry } = useApp();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${e.occ.id}|approx`, data: { e } });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`chip approx-chip ${isDragging ? 'dragging' : ''}`}
      style={{ '--c': catColor(e.category) } as React.CSSProperties}
      onClick={() => openEntry(e.occ.id)}
      title="Glisser sur un jour pour fixer la date"
    >
      {e.category.icon} {e.event.name} <em>{e.occ.label}</em>
    </button>
  );
}

function DayCell({
  iso,
  inMonth,
  items,
  onMore,
}: {
  iso: string;
  inMonth: boolean;
  items: Entry[];
  onMore: () => void;
}) {
  const { newEntry } = useApp();
  const { setNodeRef, isOver } = useDroppable({ id: iso });
  const today = iso === todayIso();
  const shown = items.slice(0, 3);
  return (
    <div
      ref={setNodeRef}
      className={`day ${inMonth ? '' : 'out'} ${today ? 'today' : ''} ${isOver ? 'over' : ''}`}
      onClick={() => (items.length ? onMore() : newEntry({ date: iso }))}
    >
      <span className="day-num">{Number(iso.slice(8))}</span>
      <button
        className="day-add"
        aria-label={`Ajouter le ${formatFull(iso)}`}
        onClick={(ev) => {
          ev.stopPropagation();
          newEntry({ date: iso });
        }}
      >
        <Plus size={14} />
      </button>
      <div className="day-items">
        {shown.map((e) => (
          <Pill key={e.occ.id} e={e} day={iso} />
        ))}
        {items.length > shown.length && (
          <button
            className="more-btn"
            onClick={(ev) => {
              ev.stopPropagation();
              onMore();
            }}
          >
            +{items.length - shown.length} autres
          </button>
        )}
      </div>
      {items.length > 0 && <span className="day-dots" aria-hidden>{items.slice(0, 4).map((e) => <i key={e.occ.id} style={{ background: catColor(e.category) }} />)}</span>}
    </div>
  );
}

function MonthGrid({ y, m, byDay, onMore }: { y: number; m: number; byDay: Map<string, Entry[]>; onMore: (iso: string) => void }) {
  const first = weekday(y, m, 1);
  const total = daysInMonth(y, m);
  const weeks = Math.ceil((first + total) / 7);
  const start = addDays(isoOf(y, m, 1), -first);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  return (
    <div className="month">
      {WEEKDAYS.map((d) => (
        <div key={d} className="weekday">
          {d}
        </div>
      ))}
      {cells.map((iso) => (
        <DayCell
          key={iso}
          iso={iso}
          inMonth={Number(iso.slice(5, 7)) === m}
          items={byDay.get(iso) ?? []}
          onMore={() => onMore(iso)}
        />
      ))}
    </div>
  );
}

function YearGrid({ y, byDay, onPick }: { y: number; byDay: Map<string, Entry[]>; onPick: (m: number) => void }) {
  const today = todayIso();
  return (
    <div className="year-grid">
      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
        const first = weekday(y, m, 1);
        const total = daysInMonth(y, m);
        let count = 0;
        for (let d = 1; d <= total; d++) count += byDay.get(isoOf(y, m, d))?.length ?? 0;
        return (
          <button key={m} className="mini-month card" onClick={() => onPick(m)}>
            <header>
              <strong>{capitalize(monthName(m))}</strong>
              {count > 0 && <span className="badge">{count}</span>}
            </header>
            <div className="mini-days">
              {Array.from({ length: first }, (_, i) => (
                <span key={`b${i}`} />
              ))}
              {Array.from({ length: total }, (_, i) => {
                const iso = isoOf(y, m, i + 1);
                const items = byDay.get(iso);
                return (
                  <span
                    key={iso}
                    className={`${items ? 'has' : ''} ${iso === today ? 'today' : ''}`}
                    style={items ? ({ '--c': catColor(items[0].category) } as React.CSSProperties) : undefined}
                    title={items?.map((e) => e.event.name).join(', ')}
                  >
                    {i + 1}
                  </span>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function CalendarView() {
  const { entries, query, cats, actions, openEntry, newEntry } = useApp();
  const now = new Date();
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth() + 1);
  const [dragging, setDragging] = useState<{ e: Entry; day?: string } | null>(null);
  const [dayList, setDayList] = useState<string | null>(null);

  const list = useMemo(() => entries.filter((e) => matches(e, query, cats)), [entries, query, cats]);
  const byDay = useEntriesByDay(list);
  const approx = list.filter((e) => !e.occ.date && e.occ.year === y && (mode === 'year' || e.month === m));

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  const shift = (d: number) => {
    if (mode === 'year') return setY((v) => v + d);
    const idx = y * 12 + (m - 1) + d;
    setY(Math.floor(idx / 12));
    setM((idx % 12) + 1);
  };

  const onDragStart = (ev: DragStartEvent) => setDragging(ev.active.data.current as { e: Entry; day?: string });
  const onDragEnd = async (ev: DragEndEvent) => {
    setDragging(null);
    const target = ev.over?.id as string | undefined;
    const data = ev.active.data.current as { e: Entry; day?: string } | undefined;
    if (!target || !data) return;
    const o = data.e.occ;
    let patch: Partial<Occurrence>;
    if (o.date && data.day) {
      const delta = daysBetween(data.day, target);
      if (delta === 0) return;
      patch = { date: addDays(o.date, delta), endDate: o.endDate ? addDays(o.endDate, delta) : '' };
    } else {
      patch = { date: target, label: '' };
    }
    const res = await actions.update<Occurrence>('occurrences', o.id, patch);
    if (res) actions.setToast(`« ${data.e.event.name} » déplacé au ${formatFull(res.date!)}`);
  };

  return (
    <section className="view calendar-view">
      <header className="view-head">
        <div className="cal-nav">
          <button className="icon-btn round" onClick={() => shift(-1)} aria-label="Précédent">
            <ChevronLeft size={20} />
          </button>
          <h1>{mode === 'year' ? y : capitalize(monthYear(y, m))}</h1>
          <button className="icon-btn round" onClick={() => shift(1)} aria-label="Suivant">
            <ChevronRight size={20} />
          </button>
          <button
            className="btn ghost small"
            onClick={() => {
              setY(now.getFullYear());
              setM(now.getMonth() + 1);
            }}
          >
            Aujourd’hui
          </button>
        </div>
        <div className="segmented">
          <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>
            Mois
          </button>
          <button className={mode === 'year' ? 'on' : ''} onClick={() => setMode('year')}>
            Année
          </button>
        </div>
      </header>
      <CategoryChips />

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        {approx.length > 0 && (
          <div className="approx-bar">
            <span className="muted">
              <Sparkles size={14} /> Dates approximatives{mode === 'month' ? ' ce mois-ci' : ` en ${y}`} — glisser sur un jour pour préciser :
            </span>
            {approx.map((e) => (
              <ApproxChip key={e.occ.id} e={e} />
            ))}
          </div>
        )}
        {mode === 'month' ? (
          <MonthGrid y={y} m={m} byDay={byDay} onMore={setDayList} />
        ) : (
          <YearGrid
            y={y}
            byDay={byDay}
            onPick={(mm) => {
              setM(mm);
              setMode('month');
            }}
          />
        )}
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="pill start end overlay" style={{ '--c': catColor(dragging.e.category) } as React.CSSProperties}>
              <span aria-hidden>{dragging.e.category.icon}</span>
              <span className="pill-text">{dragging.e.event.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {dayList && (
        <Sheet
          title={capitalize(formatFull(dayList))}
          onClose={() => setDayList(null)}
          variant="center"
          footer={
            <button
              className="btn primary"
              onClick={() => {
                const d = dayList;
                setDayList(null);
                newEntry({ date: d });
              }}
            >
              <Plus size={16} /> Ajouter ce jour-là
            </button>
          }
        >
          <ul className="day-list">
            {(byDay.get(dayList) ?? []).map((e) => (
              <li key={e.occ.id}>
                <button
                  className="day-list-item"
                  style={{ '--c': catColor(e.category) } as React.CSSProperties}
                  onClick={() => {
                    setDayList(null);
                    openEntry(e.occ.id);
                  }}
                >
                  <span>{e.category.icon}</span> {e.event.name}
                  <small className="muted">{whenText(e.occ)}</small>
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </section>
  );
}
