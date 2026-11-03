import { useMemo, useState, type FormEvent } from 'react';
import type { Db, Purchase } from './types';
import type { DbActions } from './useDb';
import { formatEuros, formatFull, todayIso } from './format';
import { Modal } from './Modal';

function PurchaseForm({ purchase, actions, onDone }: { purchase?: Purchase; actions: DbActions; onDone: () => void }) {
  const [date, setDate] = useState(purchase?.date ?? todayIso());
  const [item, setItem] = useState(purchase?.item ?? '');
  const [amount, setAmount] = useState(purchase?.amount != null ? String(purchase.amount) : '');
  const [note, setNote] = useState(purchase?.note ?? '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseFloat(amount.replace(',', '.').replace(/\s/g, ''));
    const data: Partial<Purchase> = { date, item, note, amount: Number.isFinite(n) ? n : (null as unknown as undefined) };
    const res = purchase
      ? await actions.update<Purchase>('purchases', purchase.id, data)
      : await actions.create<Purchase>('purchases', data);
    if (res) onDone();
  };

  return (
    <form onSubmit={submit} className="stack">
      <label>
        Biens
        <input required autoFocus value={item} onChange={(e) => setItem(e.target.value)} />
      </label>
      <div className="row">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Montant (€)
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
        </label>
      </div>
      <label>
        Note
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="actions">
        {purchase && (
          <button
            type="button"
            className="btn danger"
            onClick={async () => {
              if (!confirm(`Supprimer « ${purchase.item} » ?`)) return;
              await actions.remove('purchases', purchase.id);
              onDone();
            }}
          >
            Supprimer
          </button>
        )}
        <span className="spacer" />
        <button className="btn primary">{purchase ? 'Enregistrer' : 'Ajouter'}</button>
      </div>
    </form>
  );
}

export function Purchases({ db, actions }: { db: Db; actions: DbActions }) {
  const [editing, setEditing] = useState<Purchase | 'new' | null>(null);
  const list = useMemo(
    () => [...db.purchases].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [db.purchases],
  );
  const total = list.reduce((s, p) => s + (p.amount ?? 0), 0);

  return (
    <section className="purchases">
      <div className="toolbar">
        <button className="btn primary" onClick={() => setEditing('new')}>
          + Dépense
        </button>
        <span className="spacer" />
        <strong>Total : {formatEuros(total)}</strong>
      </div>
      <div className="table-wrap">
        <table className="list">
          <thead>
            <tr>
              <th>Date</th>
              <th>Biens</th>
              <th className="num">Montant</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} onClick={() => setEditing(p)} className="clickable">
                <td>{p.date ? formatFull(p.date) : ''}</td>
                <td>{p.item}</td>
                <td className="num">{p.amount != null ? formatEuros(p.amount) : ''}</td>
                <td className="muted">{p.note}</td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Aucune dépense enregistrée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <Modal title={editing === 'new' ? 'Nouvelle dépense' : 'Modifier la dépense'} onClose={() => setEditing(null)}>
          <PurchaseForm
            purchase={editing === 'new' ? undefined : editing}
            actions={actions}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}
    </section>
  );
}
