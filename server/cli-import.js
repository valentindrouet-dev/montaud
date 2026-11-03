// Usage : npm run import -- chemin/vers/MONTAUD.xlsx
// Remplace les données actuelles par le contenu du classeur.
import fs from 'node:fs';
import { importXlsx } from '../shared/import-xlsx.js';
import { replaceDb } from './store.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage : npm run import -- chemin/vers/fichier.xlsx');
  process.exit(1);
}
const db = replaceDb(await importXlsx(fs.readFileSync(file)));
console.log(
  `Import OK : ${db.categories.length} catégories, ${db.events.length} événements, ` +
    `${db.occurrences.length} dates, ${db.purchases.length} dépenses.`,
);
