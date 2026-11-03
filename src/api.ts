import type { Attachment, Collection, Db } from './types';

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

export const api = {
  load: () => request<Db>('/api/data'),
  create: <T>(c: Collection, data: Partial<T>) => request<T>(`/api/${c}`, json('POST', data)),
  update: <T>(c: Collection, id: string, data: Partial<T>) => request<T>(`/api/${c}/${id}`, json('PATCH', data)),
  remove: (c: Collection, id: string) => request<void>(`/api/${c}/${id}`, { method: 'DELETE' }),
  upload: (ownerType: Attachment['ownerType'], ownerId: string, file: File) =>
    request<Attachment>(
      `/api/${ownerType}/${ownerId}/attachments`,
      binary('POST', file, file.type, { 'X-Filename': encodeURIComponent(file.name) }),
    ),
  uploadThumb: (id: string, blob: Blob) => request<Attachment>(`/api/attachments/${id}/thumb`, binary('PUT', blob, 'image/jpeg')),
  importXlsx: (file: File) => request<Db>('/api/import/xlsx', binary('POST', file, 'application/octet-stream')),
  importBackup: (file: File) => request<Db>('/api/import/backup', binary('POST', file, 'application/octet-stream')),
};

export const fileUrl = (a: Attachment, thumb = false) => `/api/files/${a.id}${thumb && a.hasThumb ? '?thumb' : ''}`;
