import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { SCHEMAS, HttpError, getDb, replaceDb, create, update, remove, emptyDb } from './store.js';
import { importXlsx } from './import-xlsx.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Protection optionnelle par mot de passe (HTTP Basic) : APP_PASSWORD=...
const PASSWORD = process.env.APP_PASSWORD;
if (PASSWORD) {
  app.use((req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization || '').split(' ');
    const given = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : '';
    const a = Buffer.from(given);
    const b = Buffer.from(PASSWORD);
    if (a.length === b.length && timingSafeEqual(a, b)) return next();
    res.set('WWW-Authenticate', 'Basic realm="Montaud"').status(401).send('Authentification requise');
  });
}

app.use(express.json({ limit: '5mb' }));

app.get('/api/data', (_req, res) => res.json(getDb()));

for (const collection of Object.keys(SCHEMAS)) {
  app.post(`/api/${collection}`, (req, res) => res.status(201).json(create(collection, req.body)));
  app.patch(`/api/${collection}/:id`, (req, res) => res.json(update(collection, req.params.id, req.body)));
  app.delete(`/api/${collection}/:id`, (req, res) => {
    remove(collection, req.params.id);
    res.status(204).end();
  });
}

app.post('/api/import/xlsx', express.raw({ type: '*/*', limit: '20mb' }), async (req, res, next) => {
  try {
    res.json(replaceDb(await importXlsx(req.body)));
  } catch (e) {
    next(new HttpError(400, e.message));
  }
});

app.get('/api/export', (_req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.set('Content-Disposition', `attachment; filename="montaud-${stamp}.json"`).json(getDb());
});

app.post('/api/import/json', (req, res) => {
  const body = req.body;
  const keys = Object.keys(emptyDb());
  if (!body || typeof body !== 'object' || !keys.every((k) => Array.isArray(body[k] ?? []))) {
    throw new HttpError(400, 'Sauvegarde JSON invalide');
  }
  res.json(replaceDb(Object.fromEntries(keys.map((k) => [k, body[k] ?? []]))));
});

// Front-end compilé (npm run build)
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Erreur serveur' });
});

app.listen(PORT, () => console.log(`Montaud sur http://localhost:${PORT}`));
