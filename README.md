# 🏡 Montaud

Le journal de la maison : tous les événements (entretien, jardin, piscine, travaux, enfants, vacances…)
rangés comme dans le fichier Excel d'origine — **une ligne par événement, une colonne par année**.

## Fonctionnalités

- **Tableau** : la grille catégories × années, comme l'Excel. Cliquer sur une case pour ajouter ou modifier
  une date (date précise, période ou texte libre du type « mi-octobre »), avec une note facultative.
  La colonne « Dernière fois » indique depuis quand l'événement a eu lieu (pratique pour le ramonage,
  l'adoucisseur, les tailles…). Catégories repliables, colorées, réordonnables ; recherche.
- **Journal** : toutes les dates de la plus récente à la plus ancienne, filtrables par catégorie.
- **Dépenses** : date / biens / montant / note, avec le total.
- **Données** : import du fichier Excel, export et restauration d'une sauvegarde JSON.

## Démarrer

```bash
npm install
npm run dev        # API sur :3001 + interface Vite sur http://localhost:5173
```

En production :

```bash
npm run build
npm start          # http://localhost:3001
```

Ou avec Docker :

```bash
docker build -t montaud .
docker run -p 3001:3001 -v montaud-data:/data -e APP_PASSWORD=motdepasse montaud
```

## Importer le fichier Excel

Depuis l'onglet **Données** de l'application, ou en ligne de commande :

```bash
npm run import -- chemin/vers/MONTAUD.xlsx
```

Règles d'import :
- la première ligne contenant des années sert d'en-tête ; si une année est répétée, la colonne suivante
  prend l'année d'après ;
- une ligne en MAJUSCULES sans aucune date devient une catégorie ;
- **l'année de la colonne fait foi** : les cellules sont au format « jj mmmm », seuls le jour et le mois sont repris ;
- les cellules texte (« mi-octobre », « 15 - 22 juin »…) sont conservées telles quelles ;
- une feuille avec les colonnes `date / Montant / Biens / Note` alimente les dépenses.

⚠️ L'import **remplace** toutes les données existantes.

## Données et confidentialité

Les données sont stockées dans `data/montaud.json` (modifiable via `DATA_FILE`), **ignoré par git** :
le dépôt ne contient que le code, jamais les données de la famille.

| Variable       | Rôle                                                        |
| -------------- | ----------------------------------------------------------- |
| `PORT`         | Port du serveur (3001 par défaut)                           |
| `DATA_FILE`    | Chemin du fichier de données                                |
| `APP_PASSWORD` | Si défini, l'app demande ce mot de passe (HTTP Basic, nom d'utilisateur libre) |

## Technique

- `server/` : Node.js + Express, stockage JSON (écriture atomique), import Excel avec ExcelJS.
- `src/` : React + TypeScript (Vite).
- `npm test` : tests de l'import Excel.
