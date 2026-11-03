import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../context';
import { byOrder, catColor, sortKey, type Entry } from '../model';
import type { Category, HouseEvent, Occurrence } from '../types';
import { since, todayIso, whenText } from '../format';
import { CategoryChips, SearchBox } from '../components/Filters';
import { Sheet } from '../components/Sheet';

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const SWATCHES = ['#e07a5f', '#3d9970', '#5b8def', '#f2a541', '#9b6bd3', '#e05f8a', '#2bb3b1', '#8a8f3c', '#c9733a', '#6c7a89'];
const EMOJIS = ['🏡', '🌿', '🏊', '🔥', '🪵', '🛠️', '🚗', '🧱', '🧰', '🎉', '🚲', '🧳', '👶', '🐶', '💡', '🚿', '🧹', '💶', '📄', '⭐'];

export function TopicsView() {
  const { db, entries, query, cats, actions, openEntry } = useApp();
  const [topic, setTopic] = useState<HouseEvent | null>(null);
  const [category, setCategory] = useState<Category | 'new' | null>(null);

  const byTopic = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) map.set(e.event.id, [...(map.get(e.event.id) ?? []), e]);
    return map;
  }, [entries]);

  const today = todayIso();
  const lastPast = (id: string) => byTopic.get(id)?.find((e) => e.key <= today) ?? byTopic.get(id)?.[0];

  const doneToday = async (ev: HouseEvent) => {
    const res = await actions.create<Occurrence>('occurrences', { eventId: ev.id, year: Number(today.slice(0, 4)), date: today });
    if (res) actions.setToast(`« ${ev.name} » noté aujourd’hui ✓`);
  };

  const q = norm(query.trim());
  const categories = [...db.categories].sort(byOrder).filter((c) => !cats.size || cats.has(c.id));

  return (
    <section className="view topics-view">
      <header className="view-head">
        <div>
          <h1>Rubriques</h1>
          <p className="muted">Tout ce qui revient : entretien, tailles, baignades… et à quand remonte la dernière fois.</p>
        </div>
        <div className="head-actions">
          <SearchBox placeholder="Rechercher une rubrique…" />
          <button className="btn" onClick={() => setCategory('new')}>
            <Plus size={16} /> Catégorie
          </button>
        </div>
      </header>
      <CategoryChips />

      {categories.map((c) => {
        const topics = db.events
          .filter((e) => e.categoryId === c.id && (!q || norm(e.name).includes(q) || norm(c.name).includes(q)))
          .sort((a, b) => (lastPast(b.id)?.key ?? '').localeCompare(lastPast(a.id)?.key ?? ''));
        if (q && !topics.length) return null;
        return (
          <section key={c.id} className="topic-group" style={{ '--c': catColor(c) } as React.CSSProperties}>
            <header className="topic-group-head">
              <span className="big-icon">{c.icon}</span>
              <h2>{c.name}</h2>
              <span className="muted">{topics.length}</span>
              <span className="spacer" />
              <button className="icon-btn" onClick={() => setCategory(c)} aria-label={`Modifier ${c.name}`} title="Modifier la catégorie">
                <Pencil size={16} />
              </button>
            </header>
            <div className="topic-grid">
              {topics.map((t) => {
                const list = byTopic.get(t.id) ?? [];
                const last = lastPast(t.id);
                return (
                  <article key={t.id} className="card topic" onClick={() => setTopic(t)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setTopic(t)}>
                    <h3>{t.name}</h3>
                    <p className="topic-last">
                      {last ? (
                        <>
                          <strong>{since(last.occ)}</strong>
                          <span className="muted"> · {whenText(last.occ, true)}</span>
                        </>
                      ) : (
                        <span className="muted">Jamais</span>
                      )}
                    </p>
                    <div className="topic-foot">
                      <span className="years" aria-label={`${list.length} fois`}>
                        {[...new Set(list.map((e) => e.occ.year))]
                          .sort()
                          .slice(-8)
                          .map((y) => (
                            <i key={y} title={String(y)}>
                              {String(y).slice(2)}
                            </i>
                          ))}
                      </span>
                      <button
                        className="btn small done"
                        onClick={(e) => {
                          e.stopPropagation();
                          doneToday(t);
                        }}
                        title="Noter cette rubrique à la date d’aujourd’hui"
                      >
                        <Check size={14} /> Aujourd’hui
                      </button>
                    </div>
                  </article>
                );
              })}
              <NewTopicCard category={c} />
            </div>
          </section>
        );
      })}

      {topic && (
        <TopicSheet
          topic={db.events.find((e) => e.id === topic.id) ?? topic}
          entries={byTopic.get(topic.id) ?? []}
          onClose={() => setTopic(null)}
          onOpenEntry={(id) => {
            setTopic(null);
            openEntry(id);
          }}
        />
      )}
      {category && <CategorySheet category={category === 'new' ? undefined : category} onClose={() => setCategory(null)} />}
    </section>
  );
}

function NewTopicCard({ category }: { category: Category }) {
  const { db, actions } = useApp();
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className="card topic add" onClick={() => setOpen(true)}>
        <Plus size={18} /> Nouvelle rubrique
      </button>
    );
  return (
    <form
      className="card topic add-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await actions.create<HouseEvent>('events', {
          name,
          categoryId: category.id,
          order: db.events.filter((x) => x.categoryId === category.id).length,
        });
        if (res) {
          setName('');
          setOpen(false);
        }
      }}
    >
      <input autoFocus required placeholder="Nom de la rubrique" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => !name && setOpen(false)} />
      <button className="btn primary small">Créer</button>
    </form>
  );
}

function TopicSheet({
  topic,
  entries,
  onClose,
  onOpenEntry,
}: {
  topic: HouseEvent;
  entries: Entry[];
  onClose: () => void;
  onOpenEntry: (id: string) => void;
}) {
  const { db, actions, newEntry } = useApp();
  const [name, setName] = useState(topic.name);
  const [catId, setCatId] = useState(topic.categoryId);
  const [note, setNote] = useState(topic.note ?? '');
  const sorted = [...entries].sort((a, b) => sortKey(b.occ).localeCompare(sortKey(a.occ)));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const data: Partial<HouseEvent> = { name, categoryId: catId, note };
    const res = await actions.update<HouseEvent>('events', topic.id, data);
    if (res) {
      actions.setToast('Rubrique enregistrée');
      onClose();
    }
  };

  return (
    <Sheet
      title={topic.name}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn ghost danger"
            onClick={async () => {
              if (!confirm(`Supprimer la rubrique « ${topic.name} » et ses ${entries.length} événement(s) ?`)) return;
              await actions.remove('events', topic.id);
              onClose();
            }}
          >
            <Trash2 size={16} /> Supprimer
          </button>
          <span className="spacer" />
          <button type="submit" form="topic-form" className="btn primary">
            Enregistrer
          </button>
        </>
      }
    >
      <form id="topic-form" className="form" onSubmit={save}>
        <div className="field">
          <label htmlFor="t-name">Nom</label>
          <input id="t-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Catégorie</label>
          <div className="chip-picker">
            {[...db.categories].sort(byOrder).map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip selectable ${catId === c.id ? 'on' : ''}`}
                style={{ '--c': catColor(c) } as React.CSSProperties}
                onClick={() => setCatId(c.id)}
              >
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="t-note">Notes (produit, artisan, fréquence conseillée…)</label>
          <textarea id="t-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </form>
      <div className="field">
        <div className="row between">
          <label>Historique · {entries.length} fois</label>
          <button
            className="btn small"
            onClick={() => {
              onClose();
              newEntry({ eventId: topic.id });
            }}
          >
            <Plus size={14} /> Ajouter une date
          </button>
        </div>
        <ul className="history">
          {sorted.map((e) => (
            <li key={e.occ.id}>
              <button onClick={() => onOpenEntry(e.occ.id)}>
                <strong>{whenText(e.occ, true)}</strong>
                <span className="muted">{since(e.occ)}</span>
                {e.files.length > 0 && <span>📎 {e.files.length}</span>}
                {e.occ.note && <small className="muted history-note">{e.occ.note}</small>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

function CategorySheet({ category, onClose }: { category?: Category; onClose: () => void }) {
  const { db, actions } = useApp();
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? '⭐');
  const [color, setColor] = useState(category?.color ?? SWATCHES[db.categories.length % SWATCHES.length]);
  const ordered = [...db.categories].sort(byOrder);
  const count = category ? db.events.filter((e) => e.categoryId === category.id).length : 0;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const res = category
      ? await actions.update<Category>('categories', category.id, { name, icon, color })
      : await actions.create<Category>('categories', { name, icon, color, order: ordered.length });
    if (res) onClose();
  };

  return (
    <Sheet
      title={category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
      onClose={onClose}
      variant="center"
      footer={
        <>
          {category && (
            <>
              <button
                type="button"
                className="btn ghost danger"
                onClick={async () => {
                  if (!confirm(`Supprimer « ${category.name} »${count ? ` et ses ${count} rubrique(s)` : ''} ?`)) return;
                  await actions.remove('categories', category.id);
                  onClose();
                }}
              >
                <Trash2 size={16} />
              </button>
              <button type="button" className="icon-btn" title="Monter" onClick={() => actions.move('categories', ordered, category.id, -1)}>
                <ArrowUp size={16} />
              </button>
              <button type="button" className="icon-btn" title="Descendre" onClick={() => actions.move('categories', ordered, category.id, 1)}>
                <ArrowDown size={16} />
              </button>
            </>
          )}
          <span className="spacer" />
          <button type="submit" form="cat-form" className="btn primary">
            {category ? 'Enregistrer' : 'Créer'}
          </button>
        </>
      }
    >
      <form id="cat-form" className="form" onSubmit={save}>
        <div className="field">
          <label htmlFor="c-name">Nom</label>
          <div className="row">
            <span className="big-icon preview" style={{ '--c': color } as React.CSSProperties}>
              {icon}
            </span>
            <input id="c-name" className="grow" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Icône</label>
          <div className="emoji-picker">
            {EMOJIS.map((e) => (
              <button type="button" key={e} className={icon === e ? 'on' : ''} onClick={() => setIcon(e)}>
                {e}
              </button>
            ))}
            <input aria-label="Autre emoji" className="emoji-input" maxLength={4} value={icon} onChange={(e) => setIcon(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Couleur</label>
          <div className="swatches">
            {SWATCHES.map((s) => (
              <button
                type="button"
                key={s}
                className={color === s ? 'on' : ''}
                style={{ background: s }}
                onClick={() => setColor(s)}
                aria-label={s}
              />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Autre couleur" />
          </div>
        </div>
      </form>
    </Sheet>
  );
}
