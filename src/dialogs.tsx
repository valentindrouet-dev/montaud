import { useState, type FormEvent } from 'react';
import { Modal } from './Modal';
import type { Category, Db, HouseEvent, Occurrence } from './types';
import { byOrder, type DbActions } from './useDb';
import { todayIso } from './format';

type Mode = 'date' | 'period' | 'text';

function OccurrenceForm({
  eventId,
  year,
  occurrence,
  actions,
  onDone,
}: {
  eventId: string;
  year: number;
  occurrence?: Occurrence;
  actions: DbActions;
  onDone?: () => void;
}) {
  const today = todayIso();
  const [mode, setMode] = useState<Mode>(
    occurrence ? (occurrence.endDate ? 'period' : occurrence.date ? 'date' : 'text') : 'date',
  );
  const [date, setDate] = useState(occurrence?.date ?? (today.startsWith(String(year)) ? today : ''));
  const [endDate, setEndDate] = useState(occurrence?.endDate ?? '');
  const [label, setLabel] = useState(occurrence?.label ?? '');
  const [note, setNote] = useState(occurrence?.note ?? '');
  const [saved, setSaved] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const data: Partial<Occurrence> = {
      eventId,
      year,
      date: mode !== 'text' ? date : '',
      endDate: mode === 'period' ? endDate : '',
      label: mode === 'text' ? label : '',
      note,
    };
    const res = occurrence
      ? await actions.update<Occurrence>('occurrences', occurrence.id, data)
      : await actions.create<Occurrence>('occurrences', data);
    if (res) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      onDone?.();
    }
  };

  return (
    <form className="occ-form" onSubmit={submit}>
      <div className="segmented" role="radiogroup">
        {(
          [
            ['date', 'Date'],
            ['period', 'Période'],
            ['text', 'Texte libre'],
          ] as const
        ).map(([m, l]) => (
          <label key={m} className={mode === m ? 'on' : ''}>
            <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
            {l}
          </label>
        ))}
      </div>
      {mode !== 'text' ? (
        <div className="row">
          <label>
            {mode === 'period' ? 'Du' : 'Date'}
            <input
              type="date"
              required
              min={`${year}-01-01`}
              max={`${year}-12-31`}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          {mode === 'period' && (
            <label>
              Au
              <input type="date" required min={date} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          )}
        </div>
      ) : (
        <label>
          Texte
          <input
            required
            placeholder="ex. mi-octobre, juillet - août…"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
      )}
      <label>
        Note
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Facultatif" />
      </label>
      <div className="actions">
        {occurrence && (
          <button
            type="button"
            className="btn danger"
            onClick={() => confirm('Supprimer cette date ?') && actions.remove('occurrences', occurrence.id)}
          >
            Supprimer
          </button>
        )}
        <span className="spacer" />
        {saved && <span className="saved">Enregistré ✓</span>}
        <button className="btn primary">{occurrence ? 'Enregistrer' : 'Ajouter'}</button>
      </div>
    </form>
  );
}

export function CellDialog({
  event,
  year,
  occurrences,
  actions,
  onClose,
}: {
  event: HouseEvent;
  year: number;
  occurrences: Occurrence[];
  actions: DbActions;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(occurrences.length === 0);
  const wasEmpty = occurrences.length === 0;
  return (
    <Modal
      title={
        <>
          {event.name} <span className="muted">· {year}</span>
        </>
      }
      onClose={onClose}
    >
      {occurrences.map((o) => (
        <OccurrenceForm key={o.id} eventId={event.id} year={year} occurrence={o} actions={actions} />
      ))}
      {adding ? (
        <OccurrenceForm
          eventId={event.id}
          year={year}
          actions={actions}
          onDone={() => (wasEmpty ? onClose() : setAdding(false))}
        />
      ) : (
        <button className="btn" onClick={() => setAdding(true)}>
          + Ajouter une autre date en {year}
        </button>
      )}
    </Modal>
  );
}

export function EventDialog({
  db,
  event,
  categoryId,
  actions,
  onClose,
}: {
  db: Db;
  event?: HouseEvent;
  categoryId: string;
  actions: DbActions;
  onClose: () => void;
}) {
  const [name, setName] = useState(event?.name ?? '');
  const [catId, setCatId] = useState(event?.categoryId ?? categoryId);
  const [note, setNote] = useState(event?.note ?? '');
  const siblings = db.events.filter((e) => e.categoryId === catId).sort(byOrder);
  const count = event ? db.occurrences.filter((o) => o.eventId === event.id).length : 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const data: Partial<HouseEvent> = { name, categoryId: catId, note };
    if (!event || event.categoryId !== catId) data.order = siblings.length;
    const res = event
      ? await actions.update<HouseEvent>('events', event.id, data)
      : await actions.create<HouseEvent>('events', data);
    if (res) onClose();
  };

  return (
    <Modal title={event ? 'Modifier l’événement' : 'Nouvel événement'} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label>
          Nom
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Catégorie
          <select value={catId} onChange={(e) => setCatId(e.target.value)}>
            {[...db.categories].sort(byOrder).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Note
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Facultatif" />
        </label>
        <div className="actions">
          {event && (
            <>
              <button
                type="button"
                className="btn danger"
                onClick={async () => {
                  if (!confirm(`Supprimer « ${event.name} »${count ? ` et ses ${count} date(s)` : ''} ?`)) return;
                  await actions.remove('events', event.id);
                  onClose();
                }}
              >
                Supprimer
              </button>
              <button type="button" className="btn" title="Monter" onClick={() => actions.move('events', siblings, event.id, -1)}>
                ↑
              </button>
              <button type="button" className="btn" title="Descendre" onClick={() => actions.move('events', siblings, event.id, 1)}>
                ↓
              </button>
            </>
          )}
          <span className="spacer" />
          <button className="btn primary">{event ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function CategoryDialog({
  db,
  category,
  actions,
  onClose,
}: {
  db: Db;
  category?: Category;
  actions: DbActions;
  onClose: () => void;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [color, setColor] = useState(category?.color ?? '#d8f7d6');
  const ordered = [...db.categories].sort(byOrder);
  const count = category ? db.events.filter((e) => e.categoryId === category.id).length : 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = category
      ? await actions.update<Category>('categories', category.id, { name, color })
      : await actions.create<Category>('categories', { name, color, order: ordered.length });
    if (res) onClose();
  };

  return (
    <Modal title={category ? 'Modifier la catégorie' : 'Nouvelle catégorie'} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <label>
          Nom
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="inline">
          Couleur
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <div className="actions">
          {category && (
            <>
              <button
                type="button"
                className="btn danger"
                onClick={async () => {
                  if (!confirm(`Supprimer la catégorie « ${category.name} »${count ? ` et ses ${count} événement(s)` : ''} ?`))
                    return;
                  await actions.remove('categories', category.id);
                  onClose();
                }}
              >
                Supprimer
              </button>
              <button type="button" className="btn" title="Monter" onClick={() => actions.move('categories', ordered, category.id, -1)}>
                ↑
              </button>
              <button type="button" className="btn" title="Descendre" onClick={() => actions.move('categories', ordered, category.id, 1)}>
                ↓
              </button>
            </>
          )}
          <span className="spacer" />
          <button className="btn primary">{category ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>
    </Modal>
  );
}
