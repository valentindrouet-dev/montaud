# 🏡 Montaud

Le carnet de la maison : tous les événements (entretien, jardin, piscine, travaux, enfants, vacances…),
avec leurs photos et documents, en frise chronologique, en calendrier et par rubrique.

## Fonctionnalités

- **Tableau** : une ligne par rubrique, une colonne par année, comme le classeur d'origine. Clic sur une
  case pour ajouter/modifier, glisser une date vers une autre année ou une autre rubrique.
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

## Où sont les données ?

| Mode | Quand | Données |
|---|---|---|
| **Partagé (Supabase)** | variables `SUPABASE_URL` / `SUPABASE_ANON_KEY` définies | en ligne, **communes à tous les membres**, mises à jour en direct |
| Navigateur | site GitHub Pages sans Supabase | dans le navigateur, propres à chaque appareil |
| Serveur Node | `npm start` / Docker | sur le serveur |

### Mettre en place le mode partagé (≈ 10 min, gratuit)

1. Créer un compte et un projet sur [supabase.com](https://supabase.com) (offre gratuite).
2. **SQL Editor** → coller le contenu de [`supabase/setup.sql`](supabase/setup.sql) en remplaçant les deux
   adresses e-mail par les vôtres → **Run**. (Pour ajouter quelqu'un plus tard :
   `insert into members (email) values ('...');`)
3. **Authentication → URL Configuration** : *Site URL* = `https://valentindrouet-dev.github.io/montaud/`
   (et l'ajouter aussi dans *Redirect URLs*).
4. **Project Settings → API** (ou *Data API*) : copier la *Project URL* et la clé *anon / publishable*.
5. Sur GitHub : **Settings → Secrets and variables → Actions → onglet Variables** → créer
   `SUPABASE_URL` et `SUPABASE_ANON_KEY` avec ces valeurs. (La clé *anon* est faite pour être publique :
   la sécurité vient des règles du script SQL, qui réservent tout aux adresses de la table `members`.)
6. **Actions → Déployer sur GitHub Pages → Run workflow**.
7. Ouvrir le site, se connecter avec son e-mail (lien magique), puis **Réglages → Importer le fichier Excel**.

Facultatif : dans **Authentication → Emails → Magic Link**, ajouter `{{ .Token }}` au modèle pour recevoir
aussi un code à 6 chiffres (pratique quand le lien s'ouvre dans un autre navigateur que celui de l'app).

### Publier sur GitHub Pages

Le workflow `.github/workflows/pages.yml` compile et publie l'app à chaque push. Réglage à faire une fois :
**Settings → Pages → Build and deployment → Source : « GitHub Actions »**.

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
- `src/remote.ts` + `src/supabase.ts` : mode partagé (une ligne par élément, envoi des seules
  modifications, temps réel) ; `src/local.ts` : mode navigateur (IndexedDB).
- `supabase/setup.sql` : tables, règles d'accès, stockage des fichiers.
- `shared/` : règles métier et import Excel, communs au serveur et au mode navigateur.
- `npm test` : tests de l'import Excel, des pièces jointes, de la sauvegarde et du mode partagé
  (deux appareils simulés).
