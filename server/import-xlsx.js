import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';

const PALETTE = ['#e9eb8f', '#d8f7d6', '#e6bdb1', '#fdfcc5', '#e6bdca', '#e6dae5', '#cfe2f3', '#f2dcdb', '#d9ead3', '#fce5cd'];

/** Valeur « brute » d'une cellule exceljs (gère formules et texte riche). */
function cellValue(cell) {
  // Une cellule fusionnée ne compte qu'une fois (sur sa cellule maîtresse).
  if (cell.isMerged && cell.master && cell.master.address !== cell.address) return null;
  let v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) v = v.result;
    else if ('richText' in v) v = v.richText.map((r) => r.text).join('');
    else if ('text' in v) v = v.text;
  }
  if (typeof v === 'string') v = v.trim();
  return v === '' ? null : v;
}

function cellColor(cell) {
  const argb = cell.fill?.type === 'pattern' ? cell.fill.fgColor?.argb : undefined;
  return typeof argb === 'string' && /^[0-9a-f]{8}$/i.test(argb) ? `#${argb.slice(2).toLowerCase()}` : undefined;
}

const pad = (n) => String(n).padStart(2, '0');

function isValidDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function isYear(v) {
  return typeof v === 'number' && Number.isInteger(v) && v > 1900 && v < 2200;
}

/**
 * Lit la feuille « chronologie » : une ligne par événement, une colonne par année,
 * les lignes en MAJUSCULES sans aucune date sont des catégories.
 *
 * Dans le classeur d'origine les dates sont affichées « jj mmmm » : l'année tapée
 * dans la cellule n'est pas fiable, c'est la colonne qui fait foi.
 */
function readTimeline(ws, db) {
  // 1. Ligne d'en-tête : la première qui contient au moins deux années.
  let headerRow;
  ws.eachRow((row) => {
    if (headerRow) return;
    const years = [];
    row.eachCell((c) => isYear(cellValue(c)) && years.push(c));
    if (years.length >= 2) headerRow = row;
  });
  if (!headerRow) return false;

  const yearCols = new Map();
  let prev = -Infinity;
  headerRow.eachCell((c) => {
    let y = cellValue(c);
    if (!isYear(y)) return;
    if (y <= prev) y = prev + 1; // ex. deux colonnes « 2025 » consécutives -> 2025, 2026
    yearCols.set(c.col, y);
    prev = y;
  });
  const firstYearCol = Math.min(...yearCols.keys());

  let category;
  const ensureCategory = (name, color) => {
    category = {
      id: randomUUID(),
      name,
      color: color || PALETTE[db.categories.length % PALETTE.length],
      order: db.categories.length,
    };
    db.categories.push(category);
    return category;
  };

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow.number) return;
    let labelCell;
    for (let col = 1; col < firstYearCol; col++) {
      const c = row.getCell(col);
      if (typeof cellValue(c) === 'string') { labelCell = c; break; }
    }
    if (!labelCell) return;
    const name = cellValue(labelCell);
    const values = [];
    for (const [col, year] of yearCols) {
      const v = cellValue(row.getCell(col));
      if (v !== null && v !== undefined) values.push({ year, v });
    }

    if (values.length === 0 && name === name.toLocaleUpperCase('fr-FR') && /\p{L}/u.test(name)) {
      ensureCategory(name, cellColor(labelCell));
      return;
    }
    if (!category) ensureCategory('GÉNÉRAL');

    const event = {
      id: randomUUID(),
      categoryId: category.id,
      name,
      order: db.events.filter((e) => e.categoryId === category.id).length,
    };
    db.events.push(event);

    for (const { year, v } of values) {
      const occ = { id: randomUUID(), eventId: event.id, year };
      if (v instanceof Date) {
        const m = v.getUTCMonth() + 1;
        const d = v.getUTCDate();
        if (isValidDate(year, m, d)) occ.date = `${year}-${pad(m)}-${pad(d)}`;
        else occ.label = `${d}/${pad(m)}`;
      } else {
        occ.label = String(v);
      }
      db.occurrences.push(occ);
    }
  });
  return true;
}

/** Lit une feuille de dépenses (colonnes date / Montant / Biens / Note). */
function readPurchases(ws, db) {
  const header = ws.getRow(1);
  const cols = {};
  header.eachCell((c) => {
    const h = String(cellValue(c) ?? '').toLowerCase();
    if (h.startsWith('date')) cols.date = c.col;
    else if (h.startsWith('montant')) cols.amount = c.col;
    else if (h.startsWith('bien') || h.startsWith('objet') || h.startsWith('achat')) cols.item = c.col;
    else if (h.startsWith('note')) cols.note = c.col;
  });
  if (!cols.amount || !cols.item) return false;
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const item = cellValue(row.getCell(cols.item));
    if (!item) return;
    const p = { id: randomUUID(), item: String(item) };
    const d = cols.date && cellValue(row.getCell(cols.date));
    if (d instanceof Date) p.date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const a = cellValue(row.getCell(cols.amount));
    if (typeof a === 'number') p.amount = a;
    const note = cols.note && cellValue(row.getCell(cols.note));
    if (note) p.note = String(note);
    db.purchases.push(p);
  });
  return true;
}

export async function importXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const db = { categories: [], events: [], occurrences: [], purchases: [] };
  for (const ws of wb.worksheets) {
    if (!readPurchases(ws, db)) readTimeline(ws, db);
  }
  if (db.categories.length === 0 && db.purchases.length === 0) {
    throw new Error('Aucune donnée reconnue dans ce fichier.');
  }
  return db;
}
