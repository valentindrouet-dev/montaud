import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'montaud-'));
process.env.DATA_FILE = path.join(dir, 'montaud.json');
const store = await import('./store.js');
const { exportZip, importBackup } = await import('./backup.js');

test('pièces jointes, cascade et sauvegarde zip', async () => {
  const cat = store.create('categories', { name: 'Piscine' });
  const ev = store.create('events', { name: 'Première baignade', categoryId: cat.id });
  const occ = store.create('occurrences', { eventId: ev.id, year: 1999, date: '2026-05-25' });
  assert.equal(occ.year, 2026, 'la date précise fixe l’année');

  const a = store.addAttachment({ ownerType: 'occurrences', ownerId: occ.id, name: 'eau.jpg', mime: 'image/jpeg', data: Buffer.from('JPEG') });
  store.setThumb(a.id, Buffer.from('THUMB'));
  assert.ok(fs.existsSync(store.filePath(a.id)));

  const zip = await exportZip();

  store.remove('events', ev.id);
  assert.equal(store.getDb().occurrences.length, 0);
  assert.equal(store.getDb().attachments.length, 0);
  assert.ok(!fs.existsSync(store.filePath(a.id)), 'fichier supprimé en cascade');

  await importBackup(zip);
  const db = store.getDb();
  assert.equal(db.occurrences.length, 1);
  assert.equal(db.attachments.length, 1);
  assert.equal(fs.readFileSync(store.filePath(a.id)).toString(), 'JPEG');
  assert.equal(fs.readFileSync(store.filePath(a.id, true)).toString(), 'THUMB');
});

test('refuse une période qui finit avant de commencer', () => {
  const ev = store.getDb().events[0];
  assert.throws(() => store.create('occurrences', { eventId: ev.id, year: 2026, date: '2026-05-25', endDate: '2026-05-01' }), /Fin de période/);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
