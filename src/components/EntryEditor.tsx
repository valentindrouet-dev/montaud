import { useMemo, useState, type FormEvent } from 'react';
import { CalendarDays, CalendarRange, Sparkles, Trash2 } from 'lucide-react';
import { Sheet } from './Sheet';
import { AttachmentManager } from './Attachments';
import { useApp, type EditorPreset } from '../context';
import type { HouseEvent, Occurrence } from '../types';
import { byOrder, catColor } from '../model';
import { formatShort, todayIso, whenText } from '../format';

type Mode = 'day' | 'period' | 'approx';
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

export function EntryEditor({
  occurrenceId,
  preset,
  onClose,
}: {
  occurrenceId?: string;
  preset?: EditorPreset;
  onClose: () => void;
}) {
  const { db, actions } = useApp();
  const occ = occurrenceId ? db.occurrences.find((o) => o.id === occurrenceId) : undefined;
  const initialEvent = db.events.find((e) => e.id === (occ?.eventId ?? preset?.eventId));
  const categories = useMemo(() => [...db.categories].sort(byOrder), [db.categories]);

  const [name, setName] = useState(initialEvent?.name ?? '');
  const [newCatId, setNewCatId] = useState(initialEvent?.categoryId ?? categories[0]?.id ?? '');
  const [focus, setFocus] = useState(false);
  const [mode, setMode] = useState<Mode>(occ ? (occ.endDate ? 'period' : occ.date ? 'day' : 'approx') : 'day');
  const [date, setDate] = useState(occ?.date ?? preset?.date ?? todayIso());
  const [endDate, setEndDate] = useState(occ?.endDate ?? '');
  const [year, setYear] = useState(occ?.year ?? preset?.year ?? new Date().getFullYear());
  const [label, setLabel] = useState(occ?.label ?? '');
  const [note, setNote] = useState(occ?.note ?? '');
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const existing = db.events.find((e) => norm(e.name) === norm(name));
  const existingCat = existing && db.categories.find((c) => c.id === existing.categoryId);
  const suggestions = useMemo(() => {
    const q = norm(name);
    return db.events
      .filter((e) => (!q || norm(e.name).includes(q)) && norm(e.name) !== q)
      .slice(0, 8)
      .map((e) => ({ e, c: db.categories.find((c) => c.id === e.categoryId) }));
  }, [name, db.events, db.categories]);

  const history = existing
    ? db.occurrences
        .filter((o) => o.eventId === existing.id && o.id !== occ?.id)
        .sort((a, b) => (b.date ?? `${b.year}`).localeCompare(a.date ?? `${a.year}`))
        .slice(0, 4)
    : [];

  const files = occ ? db.attachments.filter((a) => a.ownerId === occ.id) : [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      let event: HouseEvent | undefined = existing;
      if (!event) {
        event = await actions.create<HouseEvent>('events', {
          name: name.trim(),
          categoryId: newCatId,
          order: db.events.filter((x) => x.categoryId === newCatId).length,
        });
        if (!event) return;
      }
      const data: Partial<Occurrence> = {
        eventId: event.id,
        year: mode === 'approx' ? year : Number(date.slice(0, 4)),
        date: mode === 'approx' ? '' : date,
        endDate: mode === 'period' ? endDate : '',
        label: mode === 'approx' ? label : '',
        note,
      };
      const saved = occ
        ? await actions.update<Occurrence>('occurrences', occ.id, data)
        : await actions.create<Occurrence>('occurrences', data);
      if (!saved) return;
      if (pending.length) await actions.upload('occurrences', saved.id, pending);
      actions.setToast(occ ? 'Modifications enregistrées' : 'Événement ajouté');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!occ || !confirm('Supprimer cet événement et ses pièces jointes ?')) return;
    await actions.remove('occurrences', occ.id);
    actions.setToast('Événement supprimé');
    onClose();
  };

  return (
    <Sheet
      title={occ ? 'Modifier l’événement' : 'Nouvel événement'}
      onClose={onClose}
      footer={
        <>
          {occ && (
            <button type="button" className="btn ghost danger" onClick={del}>
              <Trash2 size={16} /> Supprimer
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" form="entry-form" className="btn primary" disabled={busy}>
            {busy ? 'Enregistrement…' : occ ? 'Enregistrer' : 'Ajouter'}
          </button>
        </>
      }
    >
      <form id="entry-form" className="form" onSubmit={submit}>
        <div className="field combo">
          <label htmlFor="ev-name">Quoi ?</label>
          <input
            id="ev-name"
            className="input-lg"
            required
            autoComplete="off"
            placeholder="Ramonage, Taille glycine, Première baignade…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 150)}
          />
          {focus && suggestions.length > 0 && (
            <ul className="suggest">
              {suggestions.map(({ e, c }) => (
                <li key={e.id}>
                  <button type="button" onMouseDown={(ev) => ev.preventDefault()} onClick={() => (setName(e.name), setFocus(false))}>
                    <span className="dot" style={{ background: catColor(c) }} />
                    {e.name}
                    <small>
                      {c?.icon} {c?.name}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="field">
          <label>Catégorie</label>
          {existing ? (
            <p className="hint">
              <span className="chip" style={{ '--c': catColor(existingCat) } as React.CSSProperties}>
                {existingCat?.icon} {existingCat?.name}
              </span>{' '}
              rubrique existante
            </p>
          ) : (
            <div className="chip-picker">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip selectable ${newCatId === c.id ? 'on' : ''}`}
                  style={{ '--c': catColor(c) } as React.CSSProperties}
                  onClick={() => setNewCatId(c.id)}
                >
                  {c.icon} {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <label>Quand ?</label>
          <div className="segmented">
            {(
              [
                ['day', 'Un jour', CalendarDays],
                ['period', 'Une période', CalendarRange],
                ['approx', 'À peu près', Sparkles],
              ] as const
            ).map(([m, l, Icon]) => (
              <button type="button" key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
                <Icon size={15} /> {l}
              </button>
            ))}
          </div>
          {mode === 'approx' ? (
            <div className="row">
              <input
                type="number"
                className="w-year"
                required
                min={1900}
                max={2200}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="Année"
              />
              <input
                className="grow"
                placeholder="mi-octobre, juillet - août, l’été…"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                aria-label="Précision"
              />
            </div>
          ) : (
            <div className="row">
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
              {mode === 'period' && (
                <>
                  <span className="muted">→</span>
                  <input
                    type="date"
                    required
                    min={date}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    aria-label="Fin"
                  />
                </>
              )}
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="ev-note">Notes</label>
          <textarea
            id="ev-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Artisan, prix, produit utilisé, remarques…"
          />
        </div>

        <div className="field">
          <label>Photos & documents</label>
          <AttachmentManager
            files={files}
            pending={pending}
            caption={name}
            onAdd={(fs) => (occ ? actions.upload('occurrences', occ.id, fs) : setPending((p) => [...p, ...fs]))}
            onRemove={(a) => actions.remove('attachments', a.id)}
            onRemovePending={(f) => setPending((p) => p.filter((x) => x !== f))}
          />
        </div>

        {history.length > 0 && (
          <div className="field">
            <label>Les fois précédentes</label>
            <ul className="mini-history">
              {history.map((o) => (
                <li key={o.id}>
                  <strong>{o.date ? formatShort(o.date) : whenText(o, true)}</strong>
                  {o.note && <span className="muted"> · {o.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Sheet>
  );
}

