// Mode « navigateur » : toutes les données et fichiers sont stockés dans IndexedDB.
// Utilisé pour la version publiée sur GitHub Pages (pas de serveur).
import type { Backend } from './api';
import type { Attachment, Collection, Db } from './types';
import {
  checkShape, createIn, emptyDb, newAttachment, removeIn, updateIn,
} from '../shared/rules.js';

const DB_NAME = 'montaud';
const STATE = 'state';
const FILES = 'files';

let idb: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  idb ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STATE);
      req.result.createObjectStore(FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idb;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Stockage du navigateur indisponible (espace plein ?)'));
  });
}

const getKey = <T>(store: string, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key));
const putKey = (store: string, key: string, value: unknown) => tx<void>(store, 'readwrite', (s) => void s.put(value, key));
const delKey = (store: string, key: string) => tx<void>(store, 'readwrite', (s) => void s.delete(key));
const clearStore = (store: string) => tx<void>(store, 'readwrite', (s) => void s.clear());

let state: Db | undefined;
async function db(): Promise<Db> {
  if (!state) state = { ...emptyDb(), ...((await getKey<Db>(STATE, 'db')) ?? {}) } as Db;
  return state;
}
const clone = <T>(x: T): T => structuredClone(x);
async function persist() {
  await putKey(STATE, 'db', state);
}

/** Erreurs métier -> messages lisibles (comme côté serveur). */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new Error((e as Error).message);
  }
}

const urls = new Map<string, string>();
function revoke(id: string) {
  for (const k of [id, `${id}.thumb`]) {
    const u = urls.get(k);
    if (u) URL.revokeObjectURL(u);
    urls.delete(k);
  }
}

async function replaceAll(next: Db, files: Map<string, { file: Blob; thumb?: Blob }>) {
  await clearStore(FILES);
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
  const attachments: Attachment[] = [];
  for (const a of next.attachments) {
    const f = files.get(a.id);
    if (!f) continue;
    await putKey(FILES, a.id, f.file);
    if (f.thumb) await putKey(FILES, `${a.id}.thumb`, f.thumb);
    attachments.push({ ...a, hasThumb: Boolean(f.thumb) });
  }
  state = { ...emptyDb(), ...next, attachments } as Db;
  await persist();
  return clone(state);
}

export const localBackend: Backend = {
  kind: 'local',
  async load() {
    navigator.storage?.persist?.().catch(() => {}); // évite que le navigateur efface les données
    return clone(await db());
  },
  create: <T,>(c: Collection, data: Partial<T>) =>
    guard(async () => {
      const item = createIn(await db(), c, data);
      await persist();
      return clone(item) as T;
    }),
  update: <T,>(c: Collection, id: string, data: Partial<T>) =>
    guard(async () => {
      const item = updateIn(await db(), c, id, data);
      await persist();
      return clone(item) as T;
    }),
  remove: (c: Collection, id) =>
    guard(async () => {
      const dead: Attachment[] = removeIn(await db(), c, id);
      await persist();
      for (const a of dead) {
        revoke(a.id);
        await delKey(FILES, a.id);
        await delKey(FILES, `${a.id}.thumb`);
      }
    }),
  upload: (ownerType, ownerId, file) =>
    guard(async () => {
      const item: Attachment = newAttachment(await db(), { ownerType, ownerId, name: file.name, mime: file.type, size: file.size });
      try {
        await putKey(FILES, item.id, file);
      } catch (e) {
        state!.attachments = state!.attachments.filter((a) => a.id !== item.id);
        throw e;
      }
      await persist();
      return clone(item);
    }),
  uploadThumb: (id, blob) =>
    guard(async () => {
      const a = (await db()).attachments.find((x) => x.id === id);
      if (!a) throw new Error('Introuvable');
      await putKey(FILES, `${id}.thumb`, blob);
      a.hasThumb = true;
      await persist();
      return clone(a);
    }),
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
    const d = await db();
    const zip = new JSZip();
    zip.file('montaud.json', JSON.stringify(d, null, 2));
    for (const a of d.attachments) {
      const f = await getKey<Blob>(FILES, a.id);
      if (f) zip.file(`files/${a.id}`, f);
      const t = a.hasThumb ? await getKey<Blob>(FILES, `${a.id}.thumb`) : undefined;
      if (t) zip.file(`files/${a.id}.thumb`, t);
    }
    return zip.generateAsync({ type: 'blob' });
  },
  async fileUrl(a, thumb) {
    const key = thumb && a.hasThumb ? `${a.id}.thumb` : a.id;
    let u = urls.get(key);
    if (!u) {
      const blob = await getKey<Blob>(FILES, key);
      if (!blob) throw new Error('Fichier introuvable');
      u = URL.createObjectURL(blob);
      urls.set(key, u);
    }
    return u;
  },
};
