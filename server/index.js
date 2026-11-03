import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import {
  SCHEMAS, HttpError, getDb, replaceDb, create, update, remove, addAttachment, setThumb, filePath,
} from './store.js';
import { importXlsx } from '../shared/import-xlsx.js';
import { exportZip, importBackup } from './backup.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const MAX_UPLOAD = '60mb';

// Protection optionnelle par mot de passe (HTTP Basic) : APP_PASSWORD=...
const PASSWORD = process.env.APP_PASSWORD;
if (PASSWORD) {
  app.use((req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization || '').split(' ');
    const given =
      scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : '';
    const a = Buffer.from(given);
    const b = Buffer.from(PASSWORD);
    if (a.length === b.length && timingSafeEqual(a, b)) return next();
    res.set('WWW-Authenticate', 'Basic realm="Montaud"').status(401).send('Authentification requise');
  });
}

// JSON partout sauf sur les routes qui reçoivent des fichiers bruts.
const json = express.json({ limit: '5mb' });
const RAW_ROUTES = /\/(attachments|thumb)$|^\/import\//;
app.use('/api', (req, res, next) => (RAW_ROUTES.test(req.path) ? next() : json(req, res, next)));
const raw = express.raw({ type: () => true, limit: MAX_UPLOAD });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

app.get('/api/data', (_req, res) => res.json(getDb()));

for (const collection of Object.keys(SCHEMAS)) {
  if (collection !== 'attachments') {
    app.post(`/api/${collection}`, (req, res) => res.status(201).json(create(collection, req.body)));
  }
  app.patch(`/api/${collection}/:id`, (req, res) => res.json(update(collection, req.params.id, req.body)));
  app.delete(`/api/${collection}/:id`, (req, res) => {
    remove(collection, req.params.id);
    res.status(204).end();
  });
}

// --- Fichiers joints -------------------------------------------------------
app.post('/api/:ownerType/:ownerId/attachments', raw, (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'Fichier vide');
  const name = decodeURIComponent(String(req.get('X-Filename') || 'fichier'));
  const item = addAttachment({
    ownerType: req.params.ownerType,
    ownerId: req.params.ownerId,
    name,
    mime: req.get('Content-Type'),
    data: req.body,
  });
  res.status(201).json(item);
});

app.put('/api/attachments/:id/thumb', raw, (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'Vignette vide');
  res.json(setThumb(req.params.id, req.body));
});

const INLINE = /^(image\/(png|jpe?g|gif|webp|avif|heic|heif)|application\/pdf|video\/(mp4|webm|quicktime)|text\/plain)$/;

app.get('/api/files/:id', (req, res) => {
  const a = getDb().attachments.find((x) => x.id === req.params.id);
  if (!a) throw new HttpError(404, 'Introuvable');
  const thumb = req.query.thumb !== undefined && a.hasThumb;
  const inline = !('download' in req.query) && INLINE.test(a.mime);
  res.set({
    'Content-Type': thumb ? 'image/jpeg' : a.mime,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.name)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
  res.sendFile(filePath(a.id, thumb));
});

// --- Import / sauvegarde ---------------------------------------------------
app.post('/api/import/xlsx', raw, wrap(async (req, res) => {
  try {
    res.json(replaceDb(await importXlsx(req.body)));
  } catch (e) {
    throw new HttpError(400, e.message);
  }
}));

app.get('/api/export', wrap(async (_req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="montaud-${stamp}.zip"` });
  res.send(await exportZip());
}));

app.post('/api/import/backup', express.raw({ type: () => true, limit: '2gb' }), wrap(async (req, res) => {
  try {
    res.json(await importBackup(req.body));
  } catch (e) {
    throw e instanceof HttpError ? e : new HttpError(400, `Sauvegarde illisible : ${e.message}`);
  }
}));

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Route inconnue')));

// --- Front-end compilé (npm run build) -------------------------------------
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status === 413 ? 'Fichier trop volumineux' : err.message || 'Erreur serveur' });
});

app.listen(PORT, () => console.log(`Montaud sur http://localhost:${PORT}`));
