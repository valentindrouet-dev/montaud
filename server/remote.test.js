// Teste la logique du stockage partagé (src/remote.ts) avec un faux « Supabase » en mémoire,
// et deux appareils qui travaillent sur les mêmes données.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { remoteBackend } from '../src/remote.ts';

function memoryStore() {
  const rows = new Map();
  const files = new Map();
  const listeners = new Set();
  const notify = () => listeners.forEach((cb) => cb());
  return {
    rows,
    files,
    store: {
      async selectAll() {
        return [...rows.values()].map((r) => structuredClone(r));
      },
      async upsert(list) {
        for (const r of list) rows.set(r.id, structuredClone(r));
        notify();
      },
      async remove(ids) {
        ids.forEach((id) => rows.delete(id));
        notify();
      },
      async removeAll() {
        rows.clear();
        notify();
      },
      async putFile(path, blob) {
        files.set(path, blob);
      },
      async getFile(path) {
        if (!files.has(path)) throw new Error('absent');
        return files.get(path);
      },
      async removeFiles(paths) {
        paths.forEach((p) => files.delete(p));
      },
      async listFiles() {
        return [...files.keys()];
      },
      onChange(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    },
  };
}

const file = (name, text, type) => Object.assign(new Blob([text], { type }), { name });

test('deux appareils partagent les mêmes données', async () => {
  const mem = memoryStore();
  const moi = remoteBackend(mem.store);
  const elle = remoteBackend(mem.store);
  await moi.load();
  await elle.load();

  const cat = await moi.create('categories', { name: 'Piscine' });
  const ev = await moi.create('events', { name: 'Première baignade', categoryId: cat.id });

  // Elle reçoit la mise à jour en direct, puis ajoute un événement avec photo
  const recu = await new Promise((resolve) => {
    const off = elle.subscribe((db) => {
      if (db.events.length) {
        off();
        resolve(db);
      }
    });
    moi.update('events', ev.id, { note: 'eau à 26°' });
  });
  assert.equal(recu.events[0].note, 'eau à 26°');

  const occ = await elle.create('occurrences', { eventId: ev.id, year: 2026, date: '2026-05-25' });
  const photo = await elle.upload('occurrences', occ.id, file('plouf.jpg', 'JPEG', 'image/jpeg'));
  await elle.uploadThumb(photo.id, new Blob(['THUMB']));

  // Je les vois
  const db = await moi.load();
  assert.equal(db.occurrences.length, 1);
  assert.equal(db.attachments[0].hasThumb, true);
  assert.equal(await (await mem.store.getFile(photo.id)).text(), 'JPEG');

  // Seules les lignes modifiées sont envoyées : ma modification n'écrase pas la sienne
  const avant = mem.rows.get(occ.id);
  await moi.update('categories', cat.id, { icon: '🏊' });
  assert.deepEqual(mem.rows.get(occ.id), avant);

  // Sauvegarde, suppression en cascade (fichiers compris), restauration
  const zip = await moi.exportBackup();
  await moi.remove('categories', cat.id);
  assert.equal(mem.rows.size, 0);
  assert.equal(mem.files.size, 0);
  const restored = await elle.importBackup(new File([await zip.arrayBuffer()], 'montaud.zip'));
  assert.equal(restored.attachments.length, 1);
  assert.equal(await (await mem.store.getFile(`${photo.id}.thumb`)).text(), 'THUMB');
});

test('erreurs métier : rien n’est envoyé', async () => {
  const mem = memoryStore();
  const b = remoteBackend(mem.store);
  await b.load();
  await assert.rejects(b.create('events', { name: 'X', categoryId: 'inconnue' }), /Catégorie inconnue/);
  assert.equal(mem.rows.size, 0);
});

test('import du classeur Excel', { skip: !fs.existsSync(process.env.MONTAUD_XLSX ?? '') }, async () => {
  const mem = memoryStore();
  const b = remoteBackend(mem.store);
  const buf = fs.readFileSync(process.env.MONTAUD_XLSX);
  const db = await b.importXlsx(new File([buf], 'MONTAUD.xlsx'));
  assert.ok(db.occurrences.length > 100);
  assert.equal(mem.rows.size, db.categories.length + db.events.length + db.occurrences.length + db.purchases.length);
});
