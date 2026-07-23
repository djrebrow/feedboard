// server.js — Feedboard: RSS-Dashboard mit Verwaltung über die UI
'use strict';

const path = require('node:path');
const express = require('express');
const cron = require('node-cron');

const store = require('./db');
const fetcher = require('./feedFetcher');

const PORT = Number(process.env.PORT) || 8321;
const FETCH_INTERVAL_MINUTES = clampInterval(process.env.FETCH_INTERVAL_MINUTES, 30);

function clampInterval(value, fallback) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 59) return fallback;
  return minutes;
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function asyncHandler(handler) {
  return (req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      const message = error && error.message ? error.message : 'Unbekannter Fehler.';
      res.status(400).json({ error: message });
    });
  };
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Ungültige ID.');
  return id;
}

function requireIdArray(value) {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => Number.isInteger(v) && v > 0)) {
    throw new Error('Es wird eine Liste von IDs erwartet.');
  }
  return value;
}

// ---------------------------------------------------------------------------
// API: Board
// ---------------------------------------------------------------------------

app.get('/api/board', (req, res) => {
  res.json({
    ...store.getBoard(),
    refreshing: fetcher.isRefreshing(),
    fetch_interval_minutes: FETCH_INTERVAL_MINUTES,
  });
});

// ---------------------------------------------------------------------------
// API: Rubriken
// ---------------------------------------------------------------------------

app.post('/api/categories', asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw new Error('Bitte einen Namen für die Rubrik angeben.');
  if (name.length > 80) throw new Error('Der Rubrikname ist zu lang (max. 80 Zeichen).');
  res.status(201).json(store.createCategory(name));
}));

app.patch('/api/categories/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!store.getCategory(id)) throw new Error('Rubrik nicht gefunden.');
  const name = String(req.body?.name || '').trim();
  if (!name) throw new Error('Bitte einen Namen für die Rubrik angeben.');
  if (name.length > 80) throw new Error('Der Rubrikname ist zu lang (max. 80 Zeichen).');
  res.json(store.renameCategory(id, name));
}));

app.delete('/api/categories/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!store.getCategory(id)) throw new Error('Rubrik nicht gefunden.');
  store.deleteCategory(id);
  res.json({ ok: true });
}));

app.post('/api/categories/reorder', asyncHandler(async (req, res) => {
  store.reorderCategories(requireIdArray(req.body?.ids));
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// API: Feeds
// ---------------------------------------------------------------------------

app.post('/api/feeds', asyncHandler(async (req, res) => {
  const categoryId = parseId(req.body?.category_id);
  const url = String(req.body?.url || '').trim();
  const name = req.body?.name ? String(req.body.name).trim() : null;
  if (!url) throw new Error('Bitte eine Feed- oder Website-URL angeben.');
  const feed = await fetcher.addFeed({ categoryId, url, name });
  res.status(201).json(feed);
}));

app.patch('/api/feeds/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!store.getFeed(id)) throw new Error('Feed nicht gefunden.');
  const name = String(req.body?.name || '').trim();
  if (!name) throw new Error('Bitte einen Namen für den Feed angeben.');
  if (name.length > 120) throw new Error('Der Feed-Name ist zu lang (max. 120 Zeichen).');
  res.json(store.renameFeed(id, name));
}));

app.delete('/api/feeds/:id', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!store.getFeed(id)) throw new Error('Feed nicht gefunden.');
  store.deleteFeed(id);
  res.json({ ok: true });
}));

app.post('/api/feeds/reorder', asyncHandler(async (req, res) => {
  store.reorderFeeds(requireIdArray(req.body?.ids));
  res.json({ ok: true });
}));

app.post('/api/feeds/:id/refresh', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const feed = store.getFeed(id);
  if (!feed) throw new Error('Feed nicht gefunden.');
  const result = await fetcher.fetchFeed(feed);
  if (!result.ok) throw new Error(`Aktualisierung fehlgeschlagen: ${result.error}`);
  res.json({ ok: true, items: result.items });
}));

// ---------------------------------------------------------------------------
// API: alles aktualisieren
// ---------------------------------------------------------------------------

app.post('/api/refresh', asyncHandler(async (req, res) => {
  const result = await fetcher.refreshAllFeeds();
  res.json(result);
}));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const seeded = store.seedIfEmpty();

app.listen(PORT, () => {
  console.log(`Feedboard läuft auf http://localhost:${PORT}`);
  if (seeded) console.log('Erststart: Beispiel-Rubriken und -Feeds wurden angelegt.');
  console.log(`Feeds werden alle ${FETCH_INTERVAL_MINUTES} Minuten aktualisiert.`);
});

// Kurz nach dem Start einmal alles laden, danach im Intervall
setTimeout(() => {
  fetcher.refreshAllFeeds().then((result) => {
    if (!result.skipped) console.log(`Initiale Aktualisierung: ${result.ok} ok, ${result.failed} fehlgeschlagen.`);
  });
}, 3000);

cron.schedule(`*/${FETCH_INTERVAL_MINUTES} * * * *`, () => {
  fetcher.refreshAllFeeds().then((result) => {
    if (!result.skipped) console.log(`Automatische Aktualisierung: ${result.ok} ok, ${result.failed} fehlgeschlagen.`);
  });
});
