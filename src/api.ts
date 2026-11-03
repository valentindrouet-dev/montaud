import type { Attachment, Collection, Db } from './types';
import { localBackend } from './local';
import { remoteBackend } from './remote';
import { sb, supabaseStore } from './supabase';

/**
 * Stockage des données :
 * - `remote` : en ligne et partagé (Supabase) — si VITE_SUPABASE_URL est défini
 * - `local`  : dans le navigateur (IndexedDB) — VITE_STORAGE=local
 * - `server` : serveur Node du dépôt (/api)
 */
export interface Backend {
  kind: 'server' | 'local' | 'remote';
  load(): Promise<Db>;
  create<T>(c: Collection, data: Partial<T>): Promise<T>;
  update<T>(c: Collection, id: string, data: Partial<T>): Promise<T>;
  remove(c: Collection, id: string): Promise<void>;
  upload(ownerType: Attachment['ownerType'], ownerId: string, file: File): Promise<Attachment>;
  uploadThumb(id: string, blob: Blob): Promise<Attachment>;
  importXlsx(file: File): Promise<Db>;
  importBackup(file: File): Promise<Db>;
  exportBackup(): Promise<Blob>;
  /** URL affichable d'un fichier joint (vignette si dispo quand `thumb`) */
  fileUrl(a: Attachment, thumb?: boolean): Promise<string>;
  /** Être prévenu des changements faits ailleurs (renvoie la fonction de désabonnement). */
  subscribe?(cb: (db: Db) => void): () => void;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Erreur ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const binary = (method: string, body: Blob, type: string, headers: Record<string, string> = {}): RequestInit => ({
  method,
  body,
  headers: { 'Content-Type': type || 'application/octet-stream', ...headers },
});

const serverBackend: Backend = {
  kind: 'server',
  load: () => request<Db>('api/data'),
  create: (c, data) => request(`api/${c}`, json('POST', data)),
  update: (c, id, data) => request(`api/${c}/${id}`, json('PATCH', data)),
  remove: (c, id) => request(`api/${c}/${id}`, { method: 'DELETE' }),
  upload: (ownerType, ownerId, file) =>
    request(
      `api/${ownerType}/${ownerId}/attachments`,
      binary('POST', file, file.type, { 'X-Filename': encodeURIComponent(file.name) }),
    ),
  uploadThumb: (id, blob) => request(`api/attachments/${id}/thumb`, binary('PUT', blob, 'image/jpeg')),
  importXlsx: (file) => request('api/import/xlsx', binary('POST', file, 'application/octet-stream')),
  importBackup: (file) => request('api/import/backup', binary('POST', file, 'application/octet-stream')),
  exportBackup: async () => {
    const res = await fetch('api/export');
    if (!res.ok) throw new Error(`Erreur ${res.status}`);
    return res.blob();
  },
  fileUrl: async (a, thumb) => `api/files/${a.id}${thumb && a.hasThumb ? '?thumb' : ''}`,
};

export const api: Backend = sb
  ? remoteBackend(supabaseStore(sb))
  : import.meta.env.VITE_STORAGE === 'local'
    ? localBackend
    : serverBackend;
