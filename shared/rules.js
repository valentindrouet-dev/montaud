// Règles métier partagées entre le serveur Node et le mode « navigateur » (GitHub Pages).

/** Champs autorisés pour chaque collection modifiable (le reste est ignoré). */
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

export const newId = () => globalThis.crypto.randomUUID();

function sanitize(collection, input) {
  const schema = SCHEMAS[collection];
  if (!schema) throw new HttpError(404, 'Collection inconnue');
  const out = {};
  for (const [key, type] of Object.entries(schema)) {
    if (!input || !(key in input)) continue;
    const v = input[key];
    if (v === null || v === '') out[key] = undefined;
    else if (typeof v === type) out[key] = type === 'string' ? v.trim() : v;
    else throw new HttpError(400, `Champ « ${key} » invalide`);
  }
  return out;
}

function validate(db, collection, item) {
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

/** Une date précise fixe l'année ; on retire les champs vides. */
function normalize(collection, item) {
  if (collection === 'occurrences') {
    if (item.date) item.year = Number(item.date.slice(0, 4));
    else delete item.endDate;
  }
  return Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined));
}

/** Ajoute un élément (modifie `db`) et le renvoie. */
export function createIn(db, collection, input) {
  if (collection === 'attachments') throw new HttpError(400, 'Utiliser l’envoi de fichier');
  const item = normalize(collection, { id: newId(), ...sanitize(collection, input) });
  validate(db, collection, item);
  db[collection].push(item);
  return item;
}

export function updateIn(db, collection, id, input) {
  const list = db[collection];
  const idx = list?.findIndex((x) => x.id === id) ?? -1;
  if (idx < 0) throw new HttpError(404, 'Introuvable');
  const next = normalize(collection, { ...list[idx], ...sanitize(collection, input), id });
  validate(db, collection, next);
  list[idx] = next;
  return next;
}

export function newAttachment(db, { ownerType, ownerId, name, mime, size }) {
  const owners = { occurrences: db.occurrences, purchases: db.purchases };
  if (!owners[ownerType]?.some((x) => x.id === ownerId)) throw new HttpError(400, 'Élément inconnu');
  const item = {
    id: newId(),
    ownerType,
    ownerId,
    name: String(name || 'fichier').slice(0, 200),
    mime: String(mime || 'application/octet-stream').slice(0, 100),
    size,
    createdAt: new Date().toISOString(),
  };
  db.attachments.push(item);
  return item;
}

/** Supprime avec cascade (modifie `db`) ; renvoie les pièces jointes supprimées (fichiers à effacer). */
export function removeIn(db, collection, id) {
  if (!db[collection]?.some((x) => x.id === id)) throw new HttpError(404, 'Introuvable');
  const gone = { [collection]: new Set([id]) };
  if (collection === 'categories') {
    gone.events = new Set(db.events.filter((e) => e.categoryId === id).map((e) => e.id));
  }
  if (gone.events) {
    gone.occurrences = new Set(db.occurrences.filter((o) => gone.events.has(o.eventId)).map((o) => o.id));
  }
  const dead = db.attachments.filter(
    (a) => gone[a.ownerType]?.has(a.ownerId) || (collection === 'attachments' && a.id === id),
  );
  const deadIds = new Set(dead.map((a) => a.id));
  for (const [c, ids] of Object.entries(gone)) db[c] = db[c].filter((x) => !ids.has(x.id));
  db.attachments = db.attachments.filter((a) => !deadIds.has(a.id));
  return dead;
}

/** Vérifie la forme d'une sauvegarde JSON. */
export function checkShape(body) {
  const keys = Object.keys(emptyDb());
  if (!body || typeof body !== 'object' || !keys.every((k) => Array.isArray(body[k] ?? []))) {
    throw new HttpError(400, 'Sauvegarde invalide');
  }
  return Object.fromEntries(keys.map((k) => [k, body[k] ?? []]));
}
