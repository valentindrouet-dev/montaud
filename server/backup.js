import fs from 'node:fs';
import JSZip from 'jszip';
import { filePath, getDb, replaceDb } from './store.js';
import { checkShape, HttpError } from '../shared/rules.js';

/** Sauvegarde complète : données + fichiers joints. */
export async function exportZip() {
  const db = getDb();
  const zip = new JSZip();
  zip.file('montaud.json', JSON.stringify(db, null, 2));
  for (const a of db.attachments) {
    try {
      zip.file(`files/${a.id}`, fs.readFileSync(filePath(a.id)));
      if (a.hasThumb) zip.file(`files/${a.id}.thumb`, fs.readFileSync(filePath(a.id, true)));
    } catch {
      /* fichier manquant : ignoré */
    }
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}

/** Restaure une sauvegarde .zip (ou un ancien .json sans fichiers). */
export async function importBackup(buffer) {
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!isZip) return replaceDb(checkShape(JSON.parse(buffer.toString('utf8'))));
  const zip = await JSZip.loadAsync(buffer);
  const json = zip.file('montaud.json');
  if (!json) throw new HttpError(400, 'montaud.json absent de l’archive');
  const data = checkShape(JSON.parse(await json.async('string')));
  const files = new Map();
  for (const a of data.attachments) {
    const file = zip.file(`files/${a.id}`);
    if (!file) continue;
    const thumb = zip.file(`files/${a.id}.thumb`);
    files.set(a.id, { file: await file.async('nodebuffer'), thumb: thumb && (await thumb.async('nodebuffer')) });
  }
  return replaceDb(data, files);
}
