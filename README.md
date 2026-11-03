# 🏡 Montaud

Le carnet de la maison : tous les événements (entretien, jardin, piscine, travaux, enfants, vacances…),
avec leurs photos et documents, en frise chronologique, en calendrier et par rubrique.

## Fonctionnalités

- **Fil** : la frise chronologique de la maison, année par année et mois par mois, en cartes avec photos,
  notes et documents. Recherche et filtre par catégorie.
- **Calendrier** : vue mois et vue année. Glisser-déposer un événement sur un autre jour pour le déplacer
  (les périodes gardent leur durée) ; les dates approximatives (« mi-octobre ») peuvent être glissées sur
  un jour pour les préciser. Clic sur un jour pour y ajouter un événement.
- **Rubriques** : tout ce qui revient (ramonage, adoucisseur, tailles, baignades…) avec « il y a combien de
  temps », l'historique, et un bouton « Aujourd'hui » pour noter en un clic que c'est fait.
- **Photos** : la galerie de toutes les photos, avec visionneuse plein écran (flèches, glisser du doigt).
- **Dépenses** : montants par année, avec factures jointes.
- **Pièces jointes** partout : photos, factures, devis, notices (glisser-déposer). Les vignettes des photos
  sont générées dans le navigateur.
- **Réglages** : sauvegarde complète en .zip (données + fichiers), restauration, import du fichier Excel.
- Pensée pour mobile (barre d'onglets, feuilles plein écran) et thème sombre automatique.

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

Les données sont stockées dans `data/montaud.json` et les fichiers joints dans `data/uploads/`
(modifiables via `DATA_FILE` / `UPLOAD_DIR`). Le dossier `data/` est **ignoré par git** : le dépôt ne
contient que le code, jamais les données ni les photos de la famille. Pense à télécharger régulièrement
une sauvegarde .zip depuis les Réglages.

| Variable       | Rôle                                                        |
| -------------- | ----------------------------------------------------------- |
| `PORT`         | Port du serveur (3001 par défaut)                           |
| `DATA_FILE`    | Chemin du fichier de données                                |
| `UPLOAD_DIR`   | Dossier des pièces jointes (par défaut `data/uploads`)      |
| `APP_PASSWORD` | Si défini, l'app demande ce mot de passe (HTTP Basic, nom d'utilisateur libre) |

## Technique

- `server/` : Node.js + Express, stockage JSON (écriture atomique) + fichiers sur disque, import Excel
  (ExcelJS), sauvegarde zip (JSZip).
- `src/` : React + TypeScript (Vite), icônes Lucide, glisser-déposer dnd-kit, polices Inter & Fraunces.
- `npm test` : tests de l'import Excel, des pièces jointes et de la sauvegarde.
