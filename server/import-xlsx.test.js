import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { importXlsx } from './import-xlsx.js';

async function sampleWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.getCell('D1').value = 2023;
  ws.getCell('F1').value = 2024;
  ws.getCell('H1').value = 2024; // doublon -> 2025
  ws.getCell('B3').value = 'Achat maison';
  ws.getCell('D3').value = new Date(Date.UTC(2025, 4, 4)); // année tapée fausse : la colonne fait foi
  ws.getCell('B5').value = 'PISCINE';
  ws.mergeCells('B5:H5');
  ws.getCell('B7').value = 'Première baignade';
  ws.getCell('F7').value = new Date(Date.UTC(2024, 5, 8));
  ws.getCell('H7').value = 'mi-juin';
  ws.getCell('B9').value = 'Hivernage';

  const ws2 = wb.addWorksheet('Feuil1');
  ws2.addRow(['date', 'Montant', 'Biens', 'Note']);
  ws2.addRow([new Date(Date.UTC(2024, 8, 10)), 120.5, 'Robot', 'Test']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('importe chronologie et dépenses', async () => {
  const db = await importXlsx(await sampleWorkbook());

  assert.deepEqual(db.categories.map((c) => c.name), ['Maison', 'Piscine']);
  assert.deepEqual(db.events.map((e) => e.name), ['Achat maison', 'Première baignade', 'Hivernage']);

  const ev = Object.fromEntries(db.events.map((e) => [e.name, e]));
  const occ = (name) => db.occurrences.filter((o) => o.eventId === ev[name].id).map(({ year, date, label }) => ({ year, date, label }));
  assert.deepEqual(occ('Achat maison'), [{ year: 2023, date: '2023-05-04', label: undefined }]);
  assert.deepEqual(occ('Première baignade'), [
    { year: 2024, date: '2024-06-08', label: undefined },
    { year: 2025, date: undefined, label: 'mi-juin' },
  ]);
  assert.equal(ev['Hivernage'].categoryId, db.categories[1].id);

  assert.equal(db.purchases.length, 1);
  assert.equal(db.purchases[0].amount, 120.5);
  assert.equal(db.purchases[0].date, '2024-09-10');
});
