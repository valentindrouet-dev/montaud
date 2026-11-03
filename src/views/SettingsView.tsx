import { useState } from 'react';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context';
import type { Db } from '../types';
import { fileSize } from '../format';

export function SettingsView({ onImported }: { onImported: () => void }) {
  const { db, actions } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const hasData = db.categories.length > 0 || db.purchases.length > 0;
  const weight = db.attachments.reduce((s, a) => s + a.size, 0);

  const replace = async (label: string, load: () => Promise<Db>) => {
    if (hasData && !confirm('Cet import va REMPLACER toutes les données actuelles (y compris photos et documents). Exporte une sauvegarde avant. Continuer ?'))
      return;
    setBusy(label);
    const res = await actions.run(load());
    setBusy(null);
    if (res) {
      actions.setDb(res);
      actions.setToast('Import terminé');
      onImported();
    }
  };

  const picker = (accept: string, onFile: (f: File) => void) => (
    <input
      type="file"
      accept={accept}
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) onFile(f);
      }}
    />
  );

  return (
    <section className="view settings-view">
      <header className="view-head">
        <div>
          <h1>Réglages</h1>
          <p className="muted">
            {db.categories.length} catégories · {db.events.length} rubriques · {db.occurrences.length} événements ·{' '}
            {db.attachments.length} fichiers ({fileSize(weight)})
          </p>
        </div>
      </header>

      <div className="settings-grid">
        <div className="card setting">
          <Download size={22} />
          <h2>Sauvegarder</h2>
          <p className="muted">Une archive .zip avec toutes les données, photos et documents.</p>
          <a className="btn primary" href="/api/export" download>
            Télécharger la sauvegarde
          </a>
        </div>

        <div className="card setting">
          <Upload size={22} />
          <h2>Restaurer</h2>
          <p className="muted">Recharger une sauvegarde .zip (ou un ancien export .json).</p>
          <label className={`btn ${busy ? 'disabled' : ''}`}>
            {busy === 'backup' ? 'Restauration…' : 'Choisir une sauvegarde'}
            {picker('.zip,.json', (f) => replace('backup', () => api.importBackup(f)))}
          </label>
        </div>

        <div className="card setting">
          <FileSpreadsheet size={22} />
          <h2>Importer le fichier Excel</h2>
          <p className="muted">
            Une ligne par rubrique, une colonne par année ; les lignes en MAJUSCULES sans date deviennent des catégories.
            L’année de la colonne fait foi.
          </p>
          <label className={`btn ${busy ? 'disabled' : ''}`}>
            {busy === 'xlsx' ? 'Import…' : 'Choisir le fichier .xlsx'}
            {picker('.xlsx', (f) => replace('xlsx', () => api.importXlsx(f)))}
          </label>
        </div>
      </div>
    </section>
  );
}
