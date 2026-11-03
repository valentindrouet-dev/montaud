import fs from 'node:fs';
import path from 'node:path';
import {
  SCHEMAS, HttpError, emptyDb, createIn, updateIn, removeIn, newAttachment,
} from '../shared/rules.js';

export { SCHEMAS, HttpError, emptyDb };

export const DATA_FILE = path.resolve(process.env.DATA_FILE || 'data/montaud.json');
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(path.dirname(DATA_FILE), 'uploads'));

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

const isId = (id) => /^[0-9a-f-]{36}$/.test(id);

export function filePath(id, thumb = false) {
  if (!isId(id)) throw new HttpError(400, 'Identifiant invalide');
  return path.join(UPLOAD_DIR, thumb ? `${id}.thumb` : id);
}

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

export function create(collection, input) {
  const item = createIn(db, collection, input);
  save();
  return item;
}

export function update(collection, id, input) {
  const item = updateIn(db, collection, id, input);
  save();
  return item;
}

export function addAttachment({ ownerType, ownerId, name, mime, data }) {
  const item = newAttachment(db, { ownerType, ownerId, name, mime, size: data.length });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(filePath(item.id), data);
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
  for (const a of removeIn(db, collection, id)) {
    fs.rmSync(filePath(a.id), { force: true });
    fs.rmSync(filePath(a.id, true), { force: true });
  }
  save();
}
