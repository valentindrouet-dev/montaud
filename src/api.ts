import type { Collection, Db } from './types';

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

export const api = {
  load: () => request<Db>('/api/data'),
  create: <T>(c: Collection, data: Partial<T>) => request<T>(`/api/${c}`, json('POST', data)),
  update: <T>(c: Collection, id: string, data: Partial<T>) => request<T>(`/api/${c}/${id}`, json('PATCH', data)),
  remove: (c: Collection, id: string) => request<void>(`/api/${c}/${id}`, { method: 'DELETE' }),
  importXlsx: (file: File) =>
    request<Db>('/api/import/xlsx', { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } }),
  importJson: (data: unknown) => request<Db>('/api/import/json', json('POST', data)),
};
