// Stockage partagé « en ligne » : chaque catégorie / rubrique / événement / dépense / pièce jointe est une
// ligne distincte dans une table distante (Supabase), et les fichiers sont dans un stockage d'objets.
// Ce module ne dépend pas de Supabase : il travaille avec un `RemoteStore` (testable en mémoire).
import type { Attachment, Collection, Db } from './types';
import type { Backend } from './api';
import {
  checkShape, createIn, emptyDb, newAttachment, removeIn, updateIn,
} from '../shared/rules.js';

export interface Row {
  id: string;
  collection: Collection;
  data: Record<string, unknown>;
}

export interface RemoteStore {
  selectAll(): Promise<Row[]>;
  upsert(rows: Row[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  removeAll(): Promise<void>;
  putFile(path: string, blob: Blob, contentType: string): Promise<void>;
  getFile(path: string): Promise<Blob>;
  removeFiles(paths: string[]): Promise<void>;
  listFiles(): Promise<string[]>;
  /** Prévenir quand les données changent ailleurs (autre appareil / autre personne). */
  onChange?(cb: () => void): () => void;
}

const COLLECTIONS: Collection[] = ['categories', 'events', 'occurrences', 'purchases', 'attachments'];
const CHUNK = 500;

function toDb(rows: Row[]): Db {
  const db = emptyDb() as Db;
  for (const r of rows) {
    if (COLLECTIONS.includes(r.collection)) (db[r.collection] as unknown[]).push({ ...r.data, id: r.id });
  }
  return db;
}

function toRows(db: Db): Row[] {
  return COLLECTIONS.flatMap((c) =>
    (db[c] as { id: string }[]).map(({ id, ...data }) => ({ id, collection: c, data })),
  );
}

function snapshot(db: Db) {
  const m = new Map<string, string>();
  for (const r of toRows(db)) m.set(r.id, JSON.stringify(r));
  return m;
}

async function chunked<T>(list: T[], fn: (part: T[]) => Promise<void>) {
  for (let i = 0; i < list.length; i += CHUNK) await fn(list.slice(i, i + CHUNK));
}

const thumbPath = (id: string) => `${id}.thumb`;

export function remoteBackend(store: RemoteStore): Backend {
  let state: Db | undefined;
  const urls = new Map<string, string>();

  async function fresh(): Promise<Db> {
    state = toDb(await store.selectAll());
    return state;
  }
  const current = async () => state ?? fresh();
  const clone = <T,>(x: T): T => structuredClone(x);

  /** Applique une modification en mémoire puis envoie uniquement les lignes changées. */
  async function commit<T>(mutate: (db: Db) => T): Promise<T> {
    const db = await current();
    const before = snapshot(db);
    let result: T;
    try {
      result = mutate(db);
    } catch (e) {
      await fresh(); // annule la modification locale
      throw e;
    }
    const after = toRows(db);
    const afterIds = new Set(after.map((r) => r.id));
    const changed = after.filter((r) => before.get(r.id) !== JSON.stringify(r));
    const removed = [...before.keys()].filter((id) => !afterIds.has(id));
    try {
      if (changed.length) await chunked(changed, (p) => store.upsert(p));
      if (removed.length) await chunked(removed, (p) => store.remove(p));
    } catch (e) {
      await fresh().catch(() => {});
      throw e;
    }
    return result;
  }

  function forget(id: string) {
    for (const k of [id, thumbPath(id)]) {
      const u = urls.get(k);
      if (u) URL.revokeObjectURL(u);
      urls.delete(k);
    }
  }

  async function replaceAll(next: Db, files: Map<string, { file: Blob; thumb?: Blob }>): Promise<Db> {
    await store.removeAll();
    const old = await store.listFiles();
    if (old.length) await chunked(old, (p) => store.removeFiles(p));
    for (const u of urls.values()) URL.revokeObjectURL(u);
    urls.clear();
    const attachments: Attachment[] = [];
    for (const a of next.attachments) {
      const f = files.get(a.id);
      if (!f) continue;
      await store.putFile(a.id, f.file, a.mime);
      if (f.thumb) await store.putFile(thumbPath(a.id), f.thumb, 'image/jpeg');
      attachments.push({ ...a, hasThumb: Boolean(f.thumb) });
    }
    const db = { ...(emptyDb() as Db), ...next, attachments };
    await chunked(toRows(db), (p) => store.upsert(p));
    return clone(await fresh());
  }

  return {
    kind: 'remote',
    load: async () => clone(await fresh()),
    create: <T,>(c: Collection, data: Partial<T>) => commit((db) => clone(createIn(db, c, data)) as T),
    update: <T,>(c: Collection, id: string, data: Partial<T>) => commit((db) => clone(updateIn(db, c, id, data)) as T),
    async remove(c, id) {
      const dead: Attachment[] = await commit((db) => removeIn(db, c, id));
      if (dead.length) {
        dead.forEach((a) => forget(a.id));
        await store.removeFiles(dead.flatMap((a) => [a.id, thumbPath(a.id)])).catch(() => {});
      }
    },
    async upload(ownerType, ownerId, file) {
      const db = await current();
      // On vérifie le propriétaire et on prépare l'id avant d'envoyer le fichier…
      const draft: Attachment = newAttachment(structuredClone(db), {
        ownerType, ownerId, name: file.name, mime: file.type, size: file.size,
      });
      await store.putFile(draft.id, file, draft.mime);
      // …puis on enregistre la ligne.
      return commit((d) => {
        d.attachments.push(draft);
        return clone(draft);
      });
    },
    async uploadThumb(id, blob) {
      await store.putFile(thumbPath(id), blob, 'image/jpeg');
      return commit((db) => {
        const a = db.attachments.find((x) => x.id === id);
        if (!a) throw new Error('Introuvable');
        a.hasThumb = true;
        return clone(a);
      });
    },
    async importXlsx(file) {
      const { importXlsx } = await import('../shared/import-xlsx.js');
      return replaceAll((await importXlsx(await file.arrayBuffer())) as Db, new Map());
    },
    async importBackup(file) {
      const buf = new Uint8Array(await file.arrayBuffer());
      if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
        return replaceAll(checkShape(JSON.parse(new TextDecoder().decode(buf))) as Db, new Map());
      }
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(buf);
      const json = zip.file('montaud.json');
      if (!json) throw new Error('montaud.json absent de l’archive');
      const data = checkShape(JSON.parse(await json.async('string'))) as Db;
      const files = new Map<string, { file: Blob; thumb?: Blob }>();
      for (const a of data.attachments) {
        const f = zip.file(`files/${a.id}`);
        if (!f) continue;
        const t = zip.file(`files/${a.id}.thumb`);
        files.set(a.id, {
          file: new Blob([await f.async('arraybuffer')], { type: a.mime }),
          thumb: t ? new Blob([await t.async('arraybuffer')], { type: 'image/jpeg' }) : undefined,
        });
      }
      return replaceAll(data, files);
    },
    async exportBackup() {
      const { default: JSZip } = await import('jszip');
      const db = await fresh();
      const zip = new JSZip();
      zip.file('montaud.json', JSON.stringify(db, null, 2));
      for (const a of db.attachments) {
        const f = await store.getFile(a.id).catch(() => null);
        if (f) zip.file(`files/${a.id}`, f);
        const t = a.hasThumb ? await store.getFile(thumbPath(a.id)).catch(() => null) : null;
        if (t) zip.file(`files/${a.id}.thumb`, t);
      }
      return zip.generateAsync({ type: 'blob' });
    },
    async fileUrl(a, thumb) {
      const key = thumb && a.hasThumb ? thumbPath(a.id) : a.id;
      let u = urls.get(key);
      if (!u) {
        u = URL.createObjectURL(await store.getFile(key));
        urls.set(key, u);
      }
      return u;
    },
    subscribe(cb) {
      if (!store.onChange) return () => {};
      let timer: ReturnType<typeof setTimeout> | undefined;
      const off = store.onChange(() => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            cb(clone(await fresh()));
          } catch {
            /* réseau : on réessaiera au prochain changement */
          }
        }, 400);
      });
      return () => {
        clearTimeout(timer);
        off();
      };
    },
  };
}
