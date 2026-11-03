import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { useApp } from '../context';
import type { Purchase } from '../types';
import { formatEuros, formatShort, todayIso } from '../format';
import { Sheet } from '../components/Sheet';
import { AttachmentManager, Thumbs } from '../components/Attachments';

function PurchaseSheet({ purchase, onClose }: { purchase?: Purchase; onClose: () => void }) {
  const { db, actions } = useApp();
  const [date, setDate] = useState(purchase?.date ?? todayIso());
  const [item, setItem] = useState(purchase?.item ?? '');
  const [amount, setAmount] = useState(purchase?.amount != null ? String(purchase.amount).replace('.', ',') : '');
  const [note, setNote] = useState(purchase?.note ?? '');
  const [pending, setPending] = useState<File[]>([]);
  const files = purchase ? db.attachments.filter((a) => a.ownerId === purchase.id) : [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseFloat(amount.replace(',', '.').replace(/\s/g, ''));
    const data = { date, item, note, amount: Number.isFinite(n) ? n : null } as unknown as Partial<Purchase>;
    const res = purchase
      ? await actions.update<Purchase>('purchases', purchase.id, data)
      : await actions.create<Purchase>('purchases', data);
    if (!res) return;
    if (pending.length) await actions.upload('purchases', res.id, pending);
    onClose();
  };

  return (
    <Sheet
      title={purchase ? 'Modifier la dépense' : 'Nouvelle dépense'}
      onClose={onClose}
      footer={
        <>
          {purchase && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={async () => {
                if (!confirm(`Supprimer « ${purchase.item} » ?`)) return;
                await actions.remove('purchases', purchase.id);
                onClose();
              }}
            >
              <Trash2 size={16} /> Supprimer
            </button>
          )}
          <span className="spacer" />
          <button type="submit" form="purchase-form" className="btn primary">
            {purchase ? 'Enregistrer' : 'Ajouter'}
          </button>
        </>
      }
    >
      <form id="purchase-form" className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="p-item">Quoi ?</label>
          <input id="p-item" className="input-lg" required value={item} onChange={(e) => setItem(e.target.value)} />
        </div>
        <div className="row">
          <div className="field grow">
            <label htmlFor="p-date">Date</label>
            <input id="p-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field grow">
            <label htmlFor="p-amount">Montant (€)</label>
            <input id="p-amount" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="p-note">Notes</label>
          <textarea id="p-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="field">
          <label>Factures & photos</label>
          <AttachmentManager
            files={files}
            pending={pending}
            caption={item}
            onAdd={(fs) => (purchase ? actions.upload('purchases', purchase.id, fs) : setPending((p) => [...p, ...fs]))}
            onRemove={(a) => actions.remove('attachments', a.id)}
            onRemovePending={(f) => setPending((p) => p.filter((x) => x !== f))}
          />
        </div>
      </form>
    </Sheet>
  );
}

export function PurchasesView() {
  const { db } = useApp();
  const [editing, setEditing] = useState<Purchase | 'new' | null>(null);
  const list = useMemo(() => [...db.purchases].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')), [db.purchases]);
  const total = list.reduce((s, p) => s + (p.amount ?? 0), 0);
  const byYear = useMemo(() => {
    const m = new Map<string, Purchase[]>();
    for (const p of list) {
      const y = p.date?.slice(0, 4) ?? 'Sans date';
      m.set(y, [...(m.get(y) ?? []), p]);
    }
    return [...m.entries()];
  }, [list]);

  return (
    <section className="view purchases-view">
      <header className="view-head">
        <div>
          <h1>Dépenses</h1>
          <p className="muted">
            {list.length} dépenses · <strong className="total">{formatEuros(total)}</strong>
          </p>
        </div>
        <button className="btn primary" onClick={() => setEditing('new')}>
          <Plus size={16} /> Dépense
        </button>
      </header>
      {list.length === 0 && (
        <div className="empty-state">
          <Receipt size={36} />
          <p>Aucune dépense pour l’instant.</p>
        </div>
      )}
      {byYear.map(([y, items]) => (
        <section key={y} className="purchase-year">
          <h2>
            {y} <span className="muted">{formatEuros(items.reduce((s, p) => s + (p.amount ?? 0), 0))}</span>
          </h2>
          <div className="purchase-list">
            {items.map((p) => {
              const files = db.attachments.filter((a) => a.ownerId === p.id);
              return (
                <article key={p.id} className="card purchase" onClick={() => setEditing(p)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEditing(p)}>
                  <div className="purchase-main">
                    <div>
                      <h3>{p.item}</h3>
                      <p className="muted">{p.date ? formatShort(p.date) : 'Sans date'}</p>
                    </div>
                    <strong className="amount">{p.amount != null ? formatEuros(p.amount) : '—'}</strong>
                  </div>
                  {p.note && <p className="entry-note">{p.note}</p>}
                  <Thumbs files={files} caption={p.item} />
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {editing && <PurchaseSheet purchase={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}
