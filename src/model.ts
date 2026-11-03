import type { Attachment, Category, Db, HouseEvent, Occurrence } from './types';
import { approxMonth, isoOf } from './format';

export interface Entry {
  occ: Occurrence;
  event: HouseEvent;
  category: Category;
  files: Attachment[];
  /** Clé de tri chronologique (AAAA-MM-JJ, avec 00 pour les parties inconnues) */
  key: string;
  /** Mois (1-12) estimé, même pour une date approximative */
  month?: number;
}

const FALLBACK: Category = { id: '', name: 'Sans catégorie', color: '#888', icon: '⭐' };

export const byOrder = <T extends { order?: number; name?: string }>(a: T, b: T) =>
  (a.order ?? 0) - (b.order ?? 0) || (a.name ?? '').localeCompare(b.name ?? '');

export function sortKey(o: Occurrence): string {
  if (o.date) return o.date;
  const m = approxMonth(o.label);
  return m ? isoOf(o.year, m, 0) : isoOf(o.year, 0, 0);
}

export function filesByOwner(db: Db) {
  const map = new Map<string, Attachment[]>();
  for (const a of db.attachments) map.set(a.ownerId, [...(map.get(a.ownerId) ?? []), a]);
  return map;
}

export function buildEntries(db: Db): Entry[] {
  const events = new Map(db.events.map((e) => [e.id, e]));
  const cats = new Map(db.categories.map((c) => [c.id, c]));
  const files = filesByOwner(db);
  const out: Entry[] = [];
  for (const occ of db.occurrences) {
    const event = events.get(occ.eventId);
    if (!event) continue;
    out.push({
      occ,
      event,
      category: cats.get(event.categoryId) ?? FALLBACK,
      files: files.get(occ.id) ?? [],
      key: sortKey(occ),
      month: occ.date ? Number(occ.date.slice(5, 7)) : approxMonth(occ.label),
    });
  }
  return out.sort((a, b) => b.key.localeCompare(a.key));
}

export const isImage = (a: Attachment) => a.mime.startsWith('image/');

const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function matches(e: Entry, query: string, cats: Set<string>) {
  if (cats.size && !cats.has(e.category.id)) return false;
  if (!query) return true;
  const q = norm(query);
  return [e.event.name, e.category.name, e.occ.note ?? '', e.occ.label ?? ''].some((t) => norm(t).includes(q));
}

export const catColor = (c?: Category) => c?.color || '#8a8f98';
