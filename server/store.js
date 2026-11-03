import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const DATA_FILE = path.resolve(process.env.DATA_FILE || 'data/montaud.json');
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(path.dirname(DATA_FILE), 'uploads'));

/** Champs autorisés pour chaque collection modifiable via l'API (le reste est ignoré). */
export const SCHEMAS = {
  categories: { name: 'string', color: 'string', icon: 'string', order: 'number' },
  events: { categoryId: 'string', name: 'string', order: 'number', note: 'string' },
  occurrences: {
    eventId: 'string', year: 'number', date: 'string', endDate: 'string', label: 'string', note: 'string',
  },
  purchases: { date: 'string', amount: 'number', item: 'string', note: 'string' },
  attachments: { name: 'string' },
};

const REQUIRED = {
  categories: ['name'],
  events: ['categoryId', 'name'],
  occurrences: ['eventId', 'year'],
  purchases: ['item'],
  attachments: ['ownerType', 'ownerId', 'name', 'mime'],
};

export function emptyDb() {
  return { categories: [], events: [], occurrences: [], purchases: [], attachments: [] };
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
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

export const getDb = () => db;

/** Remplace toutes les données. `files` : Map id -> { file?: Buffer, thumb?: Buffer } (sinon les fichiers sont effacés). */
export function replaceDb(next, files = new Map()) {
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const attachments = [];
  for (const a of next.attachments ?? []) {
    const f = files.get(a.id);
    if (!f?.file || !isId(a.id)) continue;
    fs.writeFileSync(filePath(a.id), f.file);
    if (f.thumb) fs.writeFileSync(filePath(a.id, true), f.thumb);
    attachments.push({ ...a, hasThumb: Boolean(f.thumb) });
  }
  db = { ...emptyDb(), ...next, attachments };
  save();
  return db;
}

const isId = (id) => /^[0-9a-f-]{36}$/.test(id);

export function filePath(id, thumb = false) {
  if (!isId(id)) throw new HttpError(400, 'Identifiant invalide');
  return path.join(UPLOAD_DIR, thumb ? `${id}.thumb` : id);
}

function sanitize(collection, input, { partial = false } = {}) {
  const schema = SCHEMAS[collection];
  const out = {};
  for (const [key, type] of Object.entries(schema)) {
    if (!(key in input)) continue;
    const v = input[key];
    if (v === null || v === '') out[key] = undefined;
    else if (typeof v === type) out[key] = type === 'string' ? v.trim() : v;
    else throw new HttpError(400, `Champ « ${key} » invalide`);
  }
  if (!partial) validate(collection, out);
  return out;
}

function validate(collection, item) {
  for (const key of REQUIRED[collection]) {
    if (item[key] === undefined) throw new HttpError(400, `Champ « ${key} » requis`);
  }
  if (collection === 'events' && !db.categories.some((c) => c.id === item.categoryId)) {
    throw new HttpError(400, 'Catégorie inconnue');
  }
  if (collection === 'occurrences') {
    if (!db.events.some((e) => e.id === item.eventId)) throw new HttpError(400, 'Rubrique inconnue');
    for (const k of ['date', 'endDate']) {
      if (item[k] !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(item[k])) throw new HttpError(400, `Champ « ${k} » invalide`);
    }
    if (item.endDate && (!item.date || item.endDate < item.date)) throw new HttpError(400, 'Fin de période invalide');
  }
}

/** Une date précise fixe l'année. */
function normalize(collection, item) {
  if (collection === 'occurrences') {
    if (item.date) item.year = Number(item.date.slice(0, 4));
    else delete item.endDate;
  }
  return Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined));
}

export function create(collection, input) {
  if (collection === 'attachments') throw new HttpError(400, 'Utiliser l’envoi de fichier');
  const item = normalize(collection, { id: randomUUID(), ...sanitize(collection, input) });
  validate(collection, item);
  db[collection].push(item);
  save();
  return item;
}

export function update(collection, id, input) {
  const list = db[collection];
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) throw new HttpError(404, 'Introuvable');
  const next = normalize(collection, { ...list[idx], ...sanitize(collection, input, { partial: true }), id });
  validate(collection, next);
  list[idx] = next;
  save();
  return next;
}

export function addAttachment({ ownerType, ownerId, name, mime, data }) {
  const owners = { occurrences: db.occurrences, purchases: db.purchases };
  if (!owners[ownerType]?.some((x) => x.id === ownerId)) throw new HttpError(400, 'Élément inconnu');
  const item = {
    id: randomUUID(),
    ownerType,
    ownerId,
    name: String(name || 'fichier').slice(0, 200),
    mime: String(mime || 'application/octet-stream').slice(0, 100),
    size: data.length,
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(filePath(item.id), data);
  db.attachments.push(item);
  save();
  return item;
}

export function setThumb(id, data) {
  const a = db.attachments.find((x) => x.id === id);
  if (!a) throw new HttpError(404, 'Introuvable');
  fs.writeFileSync(filePath(id, true), data);
  a.hasThumb = true;
  save();
  return a;
}

export function remove(collection, id) {
  if (!db[collection].some((x) => x.id === id)) throw new HttpError(404, 'Introuvable');
  const gone = { [collection]: new Set([id]) };
  // Suppressions en cascade
  if (collection === 'categories') {
    gone.events = new Set(db.events.filter((e) => e.categoryId === id).map((e) => e.id));
  }
  if (gone.events || collection === 'events') {
    const evs = gone.events ?? gone[collection];
    gone.occurrences = new Set(db.occurrences.filter((o) => evs.has(o.eventId)).map((o) => o.id));
  }
  const owned = (a) => gone[a.ownerType]?.has(a.ownerId);
  const deadFiles = db.attachments.filter((a) => owned(a) || (collection === 'attachments' && a.id === id));
  for (const a of deadFiles) {
    fs.rmSync(filePath(a.id), { force: true });
    fs.rmSync(filePath(a.id, true), { force: true });
  }
  const dead = new Set(deadFiles.map((a) => a.id));
  for (const [c, ids] of Object.entries(gone)) db[c] = db[c].filter((x) => !ids.has(x.id));
  db.attachments = db.attachments.filter((a) => !dead.has(a.id));
  save();
}
