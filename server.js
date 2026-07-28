// server.js — Feedboard: RSS-Dashboard mit Verwaltung über die UI
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cron = require('node-cron');

const store = require('./db');
const fetcher = require('./feedFetcher');
const opml = require('./opml');
const auth = require('./auth');
const extract = require('./extract');
const ai = require('./ai');
const telegram = require('./telegram');

const PORT = Number(process.env.PORT) || 8321;
const FETCH_INTERVAL_MINUTES = clampInterval(process.env.FETCH_INTERVAL_MINUTES, 30);

// Geplantes Briefing: leer = aus. Beispiel "0 7 * * *" für täglich 7 Uhr.
const BRIEFING_CRON = String(process.env.BRIEFING_CRON || '').trim();
const BRIEFING_LANG = ['de', 'en', 'ru'].includes(process.env.BRIEFING_LANG) ? process.env.BRIEFING_LANG : 'de';
const BRIEFING_HOURS = clampHours(process.env.BRIEFING_HOURS, 24);

function clampHours(value, fallback) {
  const hours = Number(value);
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) return fallback;
  return hours;
}

function clampInterval(value, fallback) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 59) return fallback;
  return minutes;
}

const app = express();
app.use(express.json({ limit: '3mb' })); // Logos werden als data:-URI übertragen

// Nur die Wiederherstellung darf groß sein — eine Sicherung enthält alle Artikel
const restoreBodyParser = express.json({ limit: '64mb' });

const LOGO_MAX_LENGTH = 1_500_000; // ~1,1 MB Bilddaten als data:-URI

const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------------------------------------------------------------------------
// Zugangsschutz: Lesen ist immer frei, geschützt sind nur Eingriffe.
// Die einzelnen Routen hängen dafür weiter unten `auth.protect` davor.
// ---------------------------------------------------------------------------

app.set('trust proxy', true); // damit req.ip hinter einem Reverse Proxy stimmt

app.post('/api/login', (req, res) => {
  try {
    auth.login(req, res, String(req.body?.password || ''));
    res.json({ ok: true });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.post('/api/logout', (req, res) => {
  auth.logout(res);
  res.json({ ok: true });
});

// Passwort setzen oder ändern. Das erste Passwort darf jeder setzen — danach
// nur noch, wer das alte kennt (geprüft in auth.setPassword).
app.post('/api/password', (req, res) => {
  try {
    auth.setPassword(req, res, {
      current: String(req.body?.current || ''),
      next: String(req.body?.next || ''),
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/login', (req, res) => {
  if (!auth.isEnabled() || auth.isLoggedIn(req)) return res.redirect('/');
  res.set('Cache-Control', 'no-store');
  res.type('html').send(fs.readFileSync(path.join(PUBLIC_DIR, 'login.html'), 'utf8'));
});

// ---------------------------------------------------------------------------
// index.html mit versionierten Asset-URLs ausliefern (Cache-Busting)
// ---------------------------------------------------------------------------

function assetVersion() {
  try {
    const mtimes = ['app.js', 'style.css', 'index.html']
      .map((f) => fs.statSync(path.join(PUBLIC_DIR, f)).mtimeMs);
    return String(Math.round(Math.max(...mtimes)));
  } catch {
    return String(Date.now());
  }
}

// Im Normalbetrieb einmal beim Start ermitteln. Mit DEV_ASSETS=1 (public/ als Bind-Mount
// eingehängt) bei jedem Aufruf neu, damit geänderte Dateien sofort eine neue Version bekommen.
const DEV_ASSETS = process.env.DEV_ASSETS === '1';
const ASSET_VERSION = assetVersion();

function currentAssetVersion() {
  return DEV_ASSETS ? assetVersion() : ASSET_VERSION;
}

app.get(['/', '/index.html'], (req, res) => {
  const version = currentAssetVersion();
  let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  html = html
    .replace('href="style.css"', `href="style.css?v=${version}"`)
    .replace('src="app.js"', `src="app.js?v=${version}"`);
  res.set('Cache-Control', 'no-cache');
  res.type('html').send(html);
});

app.use(express.static(PUBLIC_DIR));

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

// Welche optionalen Funktionen eingerichtet sind — das Frontend blendet die
// zugehörigen Knöpfe aus, wenn etwas fehlt.
function features() {
  return {
    ai: ai.isEnabled(),
    telegram_share: telegram.canShare(),
    auth: auth.isEnabled(),
  };
}

app.get('/api/board', (req, res) => {
  res.json({
    ...store.getBoard(),
    refreshing: fetcher.isRefreshing(),
    fetch_interval_minutes: FETCH_INTERVAL_MINUTES,
    features: features(),
    authenticated: auth.isLoggedIn(req),
  });
});

// Schlanke Kennzahlen für externe Dashboards (z. B. Homepage-customapi-Widget).
// Bewusst getrennt von /api/board, das mit den Base64-Logos mehrere hundert KB
// gross ist und sich zum Pollen im Sekundentakt nicht eignet.
app.get('/api/stats', (req, res) => {
  res.json({
    ...store.getStats(),
    refreshing: fetcher.isRefreshing(),
    fetch_interval_minutes: FETCH_INTERVAL_MINUTES,
  });
});

// ---------------------------------------------------------------------------
// API: Rubriken
// ---------------------------------------------------------------------------

app.post('/api/categories', auth.protect, asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw new Error('Bitte einen Namen für die Rubrik angeben.');
  if (name.length > 80) throw new Error('Der Rubrikname ist zu lang (max. 80 Zeichen).');
  const slug = req.body?.slug != null ? String(req.body.slug).trim() : '';
  res.status(201).json(store.createCategory(name, slug));
}));

app.patch('/api/categories/:id', auth.protect, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!store.getCategory(id)) throw new Error('Rubrik nicht gefunden.');
  const name = String(req.body?.name || '').trim();
  if (!name) throw new Error('Bitte einen Namen für die Rubrik angeben.');
  if (name.length > 80) throw new Error('Der Rubrikname ist zu lang (max. 80 Zeichen).');
  const slug = req.body?.slug != null ? String(req.body.slug).trim() : '';
  res.json(store.renameCategory(id, name, slug));
}));

app.put('/api/categories/:id/logo', auth.protect, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!store.getCategory(id)) throw new Error('Rubrik nicht gefunden.');
  const logo = String(req.body?.logo || '');
  if (!/^data:image\/(png|jpeg|webp|gif|svg\+xml);/i.test(logo)) {
    throw new Error('Ungültiges Bildformat.');
  }
  if (logo.length > LOGO_MAX_LENGTH) {
    throw new Error('Das Bild ist zu groß.');
  }
  res.json(store.setCategoryLogo(id, logo));
}));

app.delete('/api/categories/:id/logo', auth.protect, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!store.getCategory(id)) throw new Error('Rubrik nicht gefunden.');
  res.json(store.setCategoryLogo(id, null));
}));

app.delete('/api/categories/:id', auth.protect, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!store.getCategory(id)) throw new Error('Rubrik nicht gefunden.');
  store.deleteCategory(id);
  res.json({ ok: true });
}));

app.post('/api/categories/reorder', auth.protect, asyncHandler(async (req, res) => {
  store.reorderCategories(requireIdArray(req.body?.ids));
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// API: Feeds
// ---------------------------------------------------------------------------

app.post('/api/feeds', auth.protect, asyncHandler(async (req, res) => {
  const categoryId = parseId(req.body?.category_id);
  const url = String(req.body?.url || '').trim();
  const name = req.body?.name ? String(req.body.name).trim() : null;
  if (!url) throw new Error('Bitte eine Feed- oder Website-URL angeben.');
  const feed = await fetcher.addFeed({ categoryId, url, name });
  res.status(201).json(feed);
}));

app.patch('/api/feeds/:id', auth.protect, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!store.getFeed(id)) throw new Error('Feed nicht gefunden.');

  // Pausieren/Fortsetzen kann allein oder zusammen mit dem Namen kommen
  if (req.body?.enabled !== undefined) {
    store.setFeedEnabled(id, req.body.enabled !== false);
  }
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) throw new Error('Bitte einen Namen für den Feed angeben.');
    if (name.length > 120) throw new Error('Der Feed-Name ist zu lang (max. 120 Zeichen).');
    store.renameFeed(id, name);
  }
  res.json(store.getFeed(id));
}));

app.delete('/api/feeds/:id', auth.protect, asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!store.getFeed(id)) throw new Error('Feed nicht gefunden.');
  store.deleteFeed(id);
  res.json({ ok: true });
}));

app.post('/api/feeds/reorder', auth.protect, asyncHandler(async (req, res) => {
  store.reorderFeeds(requireIdArray(req.body?.ids));
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// API: OPML (Umzug von/zu anderen Readern)
// ---------------------------------------------------------------------------

app.get('/api/opml', (req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.set('Content-Disposition', `attachment; filename="feedboard-${stamp}.opml"`);
  res.type('application/xml').send(opml.buildOpml());
});

app.post('/api/opml', auth.protect, asyncHandler(async (req, res) => {
  const xml = String(req.body?.xml || '');
  if (!xml.trim()) throw new Error('Bitte eine OPML-Datei auswählen.');
  const result = opml.importOpml(xml);
  // Die neuen Feeds im Hintergrund füllen — der Import selbst bleibt schnell
  if (result.feeds > 0) setTimeout(() => fetcher.refreshAllFeeds().catch(() => {}), 100);
  res.json(result);
}));

// ---------------------------------------------------------------------------
// API: Lese-Status
// ---------------------------------------------------------------------------

app.post('/api/articles/:id/read', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  store.setArticleRead(id, req.body?.read !== false);
  res.json({ ok: true });
}));

app.post('/api/feeds/:id/read', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!store.getFeed(id)) throw new Error('Feed nicht gefunden.');
  store.setFeedRead(id, req.body?.read !== false);
  res.json({ ok: true });
}));

app.post('/api/categories/:id/read', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!store.getCategory(id)) throw new Error('Rubrik nicht gefunden.');
  store.setCategoryRead(id, req.body?.read !== false);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// API: Gespeicherte Artikel (Stern)
// ---------------------------------------------------------------------------

app.post('/api/articles/:id/star', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  store.setArticleStarred(id, req.body?.starred !== false);
  res.json({ ok: true });
}));

app.get('/api/saved', asyncHandler(async (req, res) => {
  res.json({ results: store.getSavedArticles(200) });
}));

// ---------------------------------------------------------------------------
// API: Volltext nachladen (für Feeds, die nur Anrisse liefern)
// ---------------------------------------------------------------------------

function requireArticle(id) {
  const article = store.getArticleWithFeed(id);
  if (!article) throw new Error('Artikel nicht gefunden.');
  return article;
}

app.get('/api/articles/:id/content', asyncHandler(async (req, res) => {
  const article = requireArticle(parseId(req.params.id));
  res.json({ content: article.content || null, content_at: article.content_at || null });
}));

app.post('/api/articles/:id/content', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const article = requireArticle(id);
  // Schon geladen? Dann nicht erneut die fremde Seite behelligen.
  if (article.content && req.body?.force !== true) {
    return res.json({ content: article.content, cached: true });
  }
  if (!article.link) throw new Error('Zu diesem Artikel gibt es keine Adresse.');

  const result = await extract.fetchArticleText(article.link);
  store.setArticleContent(id, result.text);
  res.json({ content: result.text, cached: false });
}));

// ---------------------------------------------------------------------------
// API: KI (nur mit ANTHROPIC_API_KEY)
// ---------------------------------------------------------------------------

function requireAi() {
  if (!ai.isEnabled()) throw new Error('Die KI-Funktionen sind nicht eingerichtet.');
}

app.post('/api/articles/:id/ai/summary', auth.protect, asyncHandler(async (req, res) => {
  requireAi();
  const id = parseId(req.params.id);
  const article = requireArticle(id);
  if (article.ai_summary && req.body?.force !== true) {
    return res.json({ summary: article.ai_summary, cached: true });
  }
  const summary = await ai.summarize(article);
  store.setArticleAiSummary(id, summary);
  res.json({ summary, cached: false });
}));

app.post('/api/articles/:id/ai/translate', auth.protect, asyncHandler(async (req, res) => {
  requireAi();
  const id = parseId(req.params.id);
  const article = requireArticle(id);
  const lang = ['de', 'ru', 'en'].includes(req.body?.lang) ? req.body.lang : 'de';
  // Zwischengespeichert wird immer nur die zuletzt gewählte Zielsprache
  if (article.ai_translation && article.ai_lang === lang && req.body?.force !== true) {
    return res.json({ translation: article.ai_translation, lang, cached: true });
  }
  const translation = await ai.translate(article, lang);
  store.setArticleAiTranslation(id, translation, lang);
  res.json({ translation, lang, cached: false });
}));

// Das Briefing wird pro Tag und Sprache einmal erzeugt und dann wiederverwendet.
// Als eigene Funktion, weil auch der Zeitplan (siehe unten) sie benutzt.
async function createBriefing({ lang = 'de', hours = 24, force = false } = {}) {
  const key = `ai_briefing_${lang}`;

  if (!force) {
    const cached = store.getSetting(key);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - Date.parse(parsed.created_at) < 6 * 60 * 60 * 1000) {
          return { ...parsed, cached: true };
        }
      } catch { /* kaputter Cache-Eintrag — einfach neu erzeugen */ }
    }
  }

  const articles = store.getRecentUnread(hours, 120);
  const text = await ai.briefing(articles, lang);
  const payload = { text, lang, articles: articles.length, created_at: new Date().toISOString() };
  store.setSetting(key, JSON.stringify(payload));
  return { ...payload, cached: false };
}

app.post('/api/ai/briefing', auth.protect, asyncHandler(async (req, res) => {
  requireAi();
  const lang = ['de', 'ru', 'en'].includes(req.body?.lang) ? req.body.lang : 'de';
  const hours = Number(req.body?.hours) || 24;
  res.json(await createBriefing({ lang, hours, force: req.body?.force === true }));
}));

// ---------------------------------------------------------------------------
// API: Artikel per Telegram teilen
// ---------------------------------------------------------------------------

app.post('/api/articles/:id/share/telegram', auth.protect, asyncHandler(async (req, res) => {
  const article = requireArticle(parseId(req.params.id));
  await telegram.shareArticle({
    title: article.title,
    link: article.link,
    summary: article.ai_summary || article.summary,
    feedName: article.feed_name,
  });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// API: Backup & Wiederherstellung
// ---------------------------------------------------------------------------

app.get('/api/backup', auth.protect, (req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.set('Content-Disposition', `attachment; filename="feedboard-backup-${stamp}.json"`);
  res.json(store.exportBackup());
});

app.post('/api/restore', auth.protect, restoreBodyParser, asyncHandler(async (req, res) => {
  const result = store.importBackup(req.body);
  res.json(result);
}));

// ---------------------------------------------------------------------------
// API: Einstellungen (Mute-Wörter)
// ---------------------------------------------------------------------------

app.get('/api/settings/mute', (req, res) => {
  res.json({ words: store.getMuteWords() });
});

app.put('/api/settings/mute', auth.protect, asyncHandler(async (req, res) => {
  res.json({ words: store.setMuteWords(req.body?.words ?? []) });
}));

// ---------------------------------------------------------------------------
// API: Favicon-Proxy mit lokalem Cache (Offline-tauglich, ohne Google-Aufruf)
// ---------------------------------------------------------------------------

const FAVICON_DIR = path.join(__dirname, 'data', 'favicons');
fs.mkdirSync(FAVICON_DIR, { recursive: true });

app.get('/api/favicon', asyncHandler(async (req, res) => {
  const host = String(req.query?.host || '').toLowerCase().replace(/[^a-z0-9.-]/g, '');
  if (!host || host.length > 100 || host.includes('..')) throw new Error('Ungültiger Host.');
  const file = path.join(FAVICON_DIR, `${host}.png`);

  if (!fs.existsSync(file)) {
    const source = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
    const response = await fetch(source, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Favicon nicht gefunden.');
    fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  }
  res.set('Cache-Control', 'public, max-age=604800');
  res.type('png').send(fs.readFileSync(file));
}));

// ---------------------------------------------------------------------------
// API: Volltextsuche
// ---------------------------------------------------------------------------

app.get('/api/search', asyncHandler(async (req, res) => {
  const query = String(req.query?.q || '').trim();
  res.json({ query, results: query ? store.searchArticles(query, 100) : [] });
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

// ---------------------------------------------------------------------------
// Geplantes KI-Briefing per Telegram
// ---------------------------------------------------------------------------
// Braucht BRIEFING_CRON (z. B. "0 7 * * *" für täglich 7 Uhr) sowie einen
// eingerichteten KI-Zugang und Telegram-Bot. Fehlt eines davon, passiert
// nichts — die Funktion ist damit eine reine Zugabe für alle, die sie wollen.

async function sendScheduledBriefing() {
  const articles = store.getRecentUnread(BRIEFING_HOURS, 120);
  if (!articles.length) {
    console.log('Briefing übersprungen: keine ungelesenen Artikel im Zeitraum.');
    return;
  }

  // force: der Zeitplan soll den Stand von jetzt zusammenfassen und nicht ein
  // Briefing wiederholen, das jemand vor fünf Stunden im Browser erzeugt hat.
  const briefing = await createBriefing({ lang: BRIEFING_LANG, hours: BRIEFING_HOURS, force: true });
  const kopf = `📰 Feedboard-Briefing — ${articles.length} ungelesene Artikel der letzten ${BRIEFING_HOURS} Stunden`;
  const { parts } = await telegram.sendText(`${kopf}\n\n${briefing.text}`);
  console.log(`Briefing verschickt (${articles.length} Artikel, ${parts} Nachricht(en)).`);
}

if (BRIEFING_CRON) {
  const fehlend = [
    !ai.isEnabled() && 'ANTHROPIC_API_KEY',
    !telegram.canShare() && 'TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID',
  ].filter(Boolean);

  if (!cron.validate(BRIEFING_CRON)) {
    console.warn(`BRIEFING_CRON ist kein gültiger Zeitplan: "${BRIEFING_CRON}" — geplantes Briefing bleibt aus.`);
  } else if (fehlend.length) {
    console.warn(`Geplantes Briefing bleibt aus, es fehlt: ${fehlend.join(', ')}.`);
  } else {
    cron.schedule(BRIEFING_CRON, () => {
      sendScheduledBriefing().catch((error) => {
        console.error('Geplantes Briefing fehlgeschlagen:', error.message);
      });
    });
    console.log(`Geplantes Briefing aktiv (${BRIEFING_CRON}, Sprache ${BRIEFING_LANG}, ${BRIEFING_HOURS} Stunden).`);
  }
}
