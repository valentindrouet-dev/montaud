import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DATA_FILE = process.env.DATA_FILE || path.resolve('data/montaud.json');

/** Champs autorisés pour chaque collection (le reste est ignoré). */
export const SCHEMAS = {
  categories: { name: 'string', color: 'string', order: 'number', collapsed: 'boolean' },
  events: { categoryId: 'string', name: 'string', order: 'number', note: 'string' },
  occurrences: {
    eventId: 'string', year: 'number', date: 'string', endDate: 'string', label: 'string', note: 'string',
  },
  purchases: { date: 'string', amount: 'number', item: 'string', note: 'string' },
};

export function emptyDb() {
  return { categories: [], events: [], occurrences: [], purchases: [] };
}

let db = load();

function load() {
  try {
    return { ...emptyDb(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    return emptyDb();
  }
}

function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

export function getDb() {
  return db;
}

export function replaceDb(next) {
  db = { ...emptyDb(), ...next };
  save();
  return db;
}

export function sanitize(collection, input, { partial = false } = {}) {
  const schema = SCHEMAS[collection];
  const out = {};
  for (const [key, type] of Object.entries(schema)) {
    if (!(key in input)) continue;
    const v = input[key];
    if (v === null || v === '') {
      out[key] = undefined;
    } else if (typeof v === type) {
      out[key] = type === 'string' ? v.trim() : v;
    } else {
      throw new HttpError(400, `Champ « ${key} » invalide`);
    }
  }
  if (!partial) validateRequired(collection, out);
  return out;
}

function validateRequired(collection, item) {
  const required = {
    categories: ['name'],
    events: ['categoryId', 'name'],
    occurrences: ['eventId', 'year'],
    purchases: ['item'],
  }[collection];
  for (const key of required) {
    if (item[key] === undefined) throw new HttpError(400, `Champ « ${key} » requis`);
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function create(collection, input) {
  const item = { id: randomUUID(), ...sanitize(collection, input) };
  checkRefs(collection, item);
  db[collection].push(stripUndefined(item));
  save();
  return item;
}

export function update(collection, id, input) {
  const list = db[collection];
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) throw new HttpError(404, 'Introuvable');
  const next = stripUndefined({ ...list[idx], ...sanitize(collection, input, { partial: true }), id });
  validateRequired(collection, next);
  checkRefs(collection, next);
  list[idx] = next;
  save();
  return next;
}

export function remove(collection, id) {
  const before = db[collection].length;
  db[collection] = db[collection].filter((x) => x.id !== id);
  if (db[collection].length === before) throw new HttpError(404, 'Introuvable');
  // Suppressions en cascade
  if (collection === 'categories') {
    const eventIds = new Set(db.events.filter((e) => e.categoryId === id).map((e) => e.id));
    db.events = db.events.filter((e) => !eventIds.has(e.id));
    db.occurrences = db.occurrences.filter((o) => !eventIds.has(o.eventId));
  } else if (collection === 'events') {
    db.occurrences = db.occurrences.filter((o) => o.eventId !== id);
  }
  save();
}

function checkRefs(collection, item) {
  if (collection === 'events' && !db.categories.some((c) => c.id === item.categoryId)) {
    throw new HttpError(400, 'Catégorie inconnue');
  }
  if (collection === 'occurrences' && !db.events.some((e) => e.id === item.eventId)) {
    throw new HttpError(400, 'Événement inconnu');
  }
}

function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
