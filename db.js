// db.js — Datenbank-Layer (eingebautes node:sqlite, keine nativen Dependencies)
'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { fehler } = require('./errors');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'feedboard.db');

// Datenverzeichnis sicherstellen
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
// Ohne Wartezeit scheitert jeder Schreibzugriff sofort, sobald die Datei kurz
// gesperrt ist — etwa durch ein Backup oder eine zweite Instanz. Fuenf Sekunden
// warten ist allemal besser als ein Fehler.
db.exec('PRAGMA busy_timeout = 5000');

// SQLite kennt nur ASCII-Kleinschreibung: "ÜBER" LIKE "%über%" ergibt 0.
// Fuer deutsche und russische Inhalte ist das zu wenig, deshalb eine eigene
// Funktion mit den Kleinschreib-Regeln von JavaScript.
db.function('kleinschreib', { deterministic: true }, (value) => String(value ?? '').toLowerCase());

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS feeds (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id      INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name             TEXT    NOT NULL,
    rss_url          TEXT    NOT NULL,
    site_url         TEXT,
    position         INTEGER NOT NULL DEFAULT 0,
    last_fetched_at  TEXT,
    last_error       TEXT,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS articles (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id       INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
    guid          TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    link          TEXT,
    summary       TEXT,
    published_at  TEXT,
    fetched_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE (feed_id, guid)
  );

  CREATE INDEX IF NOT EXISTS idx_feeds_category   ON feeds(category_id, position);
  CREATE INDEX IF NOT EXISTS idx_articles_feed    ON articles(feed_id, published_at DESC);
`);

// Migrationen für bestehende Datenbanken ------------------------------------
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Logo als eingebettetes Bild (data:-URI) direkt in der Rubrik
ensureColumn('categories', 'logo', 'TEXT');
// Anker/Slug für den URL-Anker (#/<slug>)
ensureColumn('categories', 'slug', 'TEXT');
// Vorschaubild eines Artikels (URL aus dem RSS-Eintrag)
ensureColumn('articles', 'image_url', 'TEXT');
// Feed-Typ: 'rss' (Standard) oder 'telegram'
ensureColumn('feeds', 'type', 'TEXT');
// Lese-Zeitpunkt eines Artikels (NULL = ungelesen)
ensureColumn('articles', 'read_at', 'TEXT');
// Speicher-Zeitpunkt eines Artikels (NULL = nicht gespeichert)
ensureColumn('articles', 'starred_at', 'TEXT');
// Feed pausiert (0) oder aktiv (1) — pausierte Feeds werden nicht abgerufen
ensureColumn('feeds', 'enabled', 'INTEGER NOT NULL DEFAULT 1');
// Fehler in Folge; ab AUTO_DISABLE_AFTER_ERRORS wird der Feed automatisch pausiert
ensureColumn('feeds', 'error_count', 'INTEGER NOT NULL DEFAULT 0');
// Was der Server beim letzten Mal mitgab, damit der naechste Abruf fragen kann,
// ob sich ueberhaupt etwas geaendert hat (ETag / Last-Modified)
ensureColumn('feeds', 'etag', 'TEXT');
ensureColumn('feeds', 'last_modified', 'TEXT');
// Zaehlt, wie oft der Server mit 304 geantwortet hat — reine Statistik
ensureColumn('feeds', 'not_modified_count', 'INTEGER NOT NULL DEFAULT 0');
// Nachgeladener Volltext eines Artikels (Anriss-Feeds)
ensureColumn('articles', 'content', 'TEXT');
ensureColumn('articles', 'content_at', 'TEXT');
// KI-Ergebnisse (gecacht, damit jeder Artikel höchstens einen Aufruf kostet)
ensureColumn('articles', 'ai_summary', 'TEXT');
ensureColumn('articles', 'ai_translation', 'TEXT');
ensureColumn('articles', 'ai_lang', 'TEXT');

// ---------------------------------------------------------------------------
// Volltextindex ueber die Artikel
// ---------------------------------------------------------------------------
// Vorher lief jede Suche als Volltabellen-Scan mit vier LIKE-Vergleichen und
// einer JavaScript-Funktion je Zeile. Mit wachsendem Bestand wird das zaeh.
//
// Tokenizer ist bewusst `trigram` und nicht `unicode61`: nur damit bleibt die
// Teilwortsuche erhalten. "wandel" soll weiterhin "Klimawandel" finden — bei
// deutschen Zusammensetzungen ist das der Normalfall. Der Preis ist, dass
// Umlaute nicht auf ihre Grundform fallen ("apfel" findet kein "Äpfel") —
// genau wie bisher mit LIKE. Trigram braucht mindestens drei Zeichen; kuerzere
// Eingaben laufen weiter ueber LIKE.
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
    title, summary, content, ai_summary,
    content='articles', content_rowid='id',
    tokenize='trigram'
  );

  CREATE TRIGGER IF NOT EXISTS articles_fts_insert AFTER INSERT ON articles BEGIN
    INSERT INTO articles_fts (rowid, title, summary, content, ai_summary)
    VALUES (new.id, new.title, new.summary, new.content, new.ai_summary);
  END;

  CREATE TRIGGER IF NOT EXISTS articles_fts_delete AFTER DELETE ON articles BEGIN
    INSERT INTO articles_fts (articles_fts, rowid, title, summary, content, ai_summary)
    VALUES ('delete', old.id, old.title, old.summary, old.content, old.ai_summary);
  END;

  CREATE TRIGGER IF NOT EXISTS articles_fts_update AFTER UPDATE ON articles BEGIN
    INSERT INTO articles_fts (articles_fts, rowid, title, summary, content, ai_summary)
    VALUES ('delete', old.id, old.title, old.summary, old.content, old.ai_summary);
    INSERT INTO articles_fts (rowid, title, summary, content, ai_summary)
    VALUES (new.id, new.title, new.summary, new.content, new.ai_summary);
  END;
`);

// Einmalig fuellen: bestehende Datenbanken haben Artikel, aber noch keinen Index.
//
// Gezaehlt wird in articles_fts_docsize, der internen Tabelle des Index. Ein
// COUNT(*) auf articles_fts selbst taugt dafuer nicht: bei externem Inhalt
// liest es die Artikeltabelle durch und meldet deren Anzahl — der Vergleich
// waere immer ausgeglichen und der Index bliebe leer.
{
  const imIndex = db.prepare('SELECT COUNT(*) AS n FROM articles_fts_docsize').get().n;
  const vorhanden = db.prepare('SELECT COUNT(*) AS n FROM articles').get().n;
  if (imIndex !== vorhanden) {
    db.exec("INSERT INTO articles_fts (articles_fts) VALUES ('rebuild')");
    if (vorhanden) console.log(`Volltextindex aufgebaut: ${vorhanden} Artikel.`);
  }
}

// ---------------------------------------------------------------------------
// Regeln
// ---------------------------------------------------------------------------
// Bedingungen auf Titel oder Kurzfassung, die beim Eintreffen eines Artikels
// greifen: als gelesen markieren, mit Stern versehen oder verbergen. Die
// globale Ausblenden-Liste bleibt daneben bestehen — sie ist der Sonderfall
// "verbergen, ueberall, nur Wort".
db.exec(`
  CREATE TABLE IF NOT EXISTS rules (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    feed_id     INTEGER REFERENCES feeds(id) ON DELETE CASCADE,
    field       TEXT    NOT NULL DEFAULT 'any',
    pattern     TEXT    NOT NULL,
    action      TEXT    NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1,
    hits        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_rules_feed ON rules(feed_id);
`);

const REGEL_FELDER = ['title', 'summary', 'any'];
const REGEL_AKTIONEN = ['read', 'star', 'hide'];

function getRules() {
  return db.prepare(`
    SELECT r.*, f.name AS feed_name
    FROM rules r
    LEFT JOIN feeds f ON f.id = r.feed_id
    ORDER BY r.id
  `).all().map((r) => ({ ...r, enabled: !!r.enabled }));
}

function createRule({ feedId = null, field = 'any', pattern, action }) {
  const muster = String(pattern || '').trim();
  if (!muster) throw fehler('rule_pattern_required', 'Die Regel braucht einen Suchtext.');
  if (muster.length > 200) throw fehler('rule_pattern_too_long', 'Der Suchtext ist zu lang (max. 200 Zeichen).', { max: 200 });
  if (!REGEL_FELDER.includes(field)) throw fehler('rule_field_unknown', `Unbekanntes Feld: ${field}`, { field });
  if (!REGEL_AKTIONEN.includes(action)) throw fehler('rule_action_unknown', `Unbekannte Aktion: ${action}`, { action });
  if (feedId !== null && !getFeed(feedId)) throw fehler('feed_not_found', 'Feed nicht gefunden.');

  const info = db.prepare('INSERT INTO rules (feed_id, field, pattern, action) VALUES (?, ?, ?, ?)')
    .run(feedId, field, muster, action);
  return db.prepare('SELECT * FROM rules WHERE id = ?').get(info.lastInsertRowid);
}

function updateRule(id, { enabled }) {
  db.prepare('UPDATE rules SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  return db.prepare('SELECT * FROM rules WHERE id = ?').get(id);
}

function deleteRule(id) {
  db.prepare('DELETE FROM rules WHERE id = ?').run(id);
}

// Passt der Artikel auf die Regel? Verglichen wird ohne Ruecksicht auf Gross-
// und Kleinschreibung, in JavaScript — SQLite kennt nur ASCII.
function regelPasst(regel, artikel) {
  const muster = regel.pattern.toLowerCase();
  const titel = String(artikel.title || '').toLowerCase();
  const kurz = String(artikel.summary || '').toLowerCase();
  if (regel.field === 'title') return titel.includes(muster);
  if (regel.field === 'summary') return kurz.includes(muster);
  return titel.includes(muster) || kurz.includes(muster);
}

// Wendet die Regeln auf einen frisch eingetroffenen Artikel an. Gibt zurueck,
// was geschehen ist — der Aufrufer kann es zaehlen.
function applyRules(artikel, regeln = null) {
  const passende = (regeln || getRules())
    .filter((r) => r.enabled && (r.feed_id === null || r.feed_id === artikel.feed_id))
    .filter((r) => regelPasst(r, artikel));
  if (!passende.length) return [];

  const getan = [];
  for (const regel of passende) {
    if (regel.action === 'read') db.prepare("UPDATE articles SET read_at = COALESCE(read_at, datetime('now')) WHERE id = ?").run(artikel.id);
    else if (regel.action === 'star') db.prepare("UPDATE articles SET starred_at = COALESCE(starred_at, datetime('now')) WHERE id = ?").run(artikel.id);
    else if (regel.action === 'hide') db.prepare('DELETE FROM articles WHERE id = ?').run(artikel.id);
    db.prepare('UPDATE rules SET hits = hits + 1 WHERE id = ?').run(regel.id);
    getan.push(regel.action);
    if (regel.action === 'hide') break; // weg ist weg
  }
  return getan;
}

// Auf den vorhandenen Bestand anwenden — fuer neu angelegte Regeln, die sonst
// erst beim naechsten Abruf etwas taeten.
function applyRulesToExisting(regelId = null) {
  const regeln = getRules().filter((r) => r.enabled && (regelId === null || r.id === regelId));
  if (!regeln.length) return { articles: 0, actions: 0 };

  const artikel = db.prepare('SELECT id, feed_id, title, summary FROM articles').all();
  let betroffen = 0;
  let aktionen = 0;
  for (const a of artikel) {
    const getan = applyRules(a, regeln);
    if (getan.length) { betroffen += 1; aktionen += getan.length; }
  }
  return { articles: betroffen, actions: aktionen };
}

// Schlüssel-Wert-Einstellungen (z. B. Mute-Wörter)
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `).run(key, value ?? null);
}

// Für Einträge, die es nach einer Umstellung nicht mehr geben soll. Ein leerer
// Wert würde stattdessen als „bewusst leer" gelten und bliebe stehen.
function deleteSetting(key) {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

function getMuteWords() {
  const raw = getSetting('mute_words', '') || '';
  return raw.split('\n').map((w) => w.trim()).filter(Boolean);
}

function setMuteWords(words) {
  const clean = (Array.isArray(words) ? words : String(words || '').split('\n'))
    .map((w) => w.trim())
    .filter(Boolean);
  setSetting('mute_words', clean.join('\n'));
  return clean;
}

function isMuted(article, muteLower) {
  if (!muteLower.length) return false;
  const haystack = `${article.title || ''}\n${article.summary || ''}`.toLowerCase();
  return muteLower.some((w) => haystack.includes(w));
}

// ---------------------------------------------------------------------------
// Slug-Erzeugung (de/ru-Transliteration → URL-tauglicher Anker)
// ---------------------------------------------------------------------------

const TRANSLIT = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function slugify(text) {
  let out = '';
  for (const ch of String(text ?? '').toLowerCase()) {
    out += TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch;
  }
  out = out.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  out = out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return out;
}

function uniqueSlug(base, excludeId = null) {
  let slug = slugify(base) || 'rubrik';
  const rows = excludeId
    ? db.prepare('SELECT slug FROM categories WHERE id != ?').all(excludeId)
    : db.prepare('SELECT slug FROM categories').all();
  const taken = new Set(rows.map((r) => r.slug).filter(Boolean));
  if (!taken.has(slug)) return slug;
  for (let i = 2; ; i += 1) {
    const candidate = `${slug}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// Bestehende Rubriken ohne Slug nachrüsten
for (const row of db.prepare("SELECT id, name FROM categories WHERE slug IS NULL OR slug = ''").all()) {
  db.prepare('UPDATE categories SET slug = ? WHERE id = ?').run(uniqueSlug(row.name, row.id), row.id);
}

// ---------------------------------------------------------------------------
// Rubriken (categories)
// ---------------------------------------------------------------------------

function getCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY position, id').all();
}

function getCategory(id) {
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

function getCategoryBySlug(slug) {
  return db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
}

function createCategory(name, slug) {
  const { maxPos } = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM categories')
    .get();
  const finalSlug = uniqueSlug(slug || name);
  const result = db
    .prepare('INSERT INTO categories (name, slug, position) VALUES (?, ?, ?)')
    .run(name, finalSlug, Number(maxPos) + 1);
  return getCategory(Number(result.lastInsertRowid));
}

function renameCategory(id, name, slug) {
  // Expliziter Anker hat Vorrang, sonst wird er aus dem Namen abgeleitet
  const finalSlug = uniqueSlug(slug || name, id);
  db.prepare('UPDATE categories SET name = ?, slug = ? WHERE id = ?').run(name, finalSlug, id);
  return getCategory(id);
}

function setCategoryLogo(id, logo) {
  db.prepare('UPDATE categories SET logo = ? WHERE id = ?').run(logo ?? null, id);
  return getCategory(id);
}

function deleteCategory(id) {
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
}

function reorderCategories(ids) {
  const stmt = db.prepare('UPDATE categories SET position = ? WHERE id = ?');
  ids.forEach((id, index) => stmt.run(index, id));
}

// ---------------------------------------------------------------------------
// Feeds
// ---------------------------------------------------------------------------

function getFeeds() {
  return db.prepare('SELECT * FROM feeds ORDER BY category_id, position, id').all();
}

function getFeed(id) {
  return db.prepare('SELECT * FROM feeds WHERE id = ?').get(id);
}

function getFeedByUrl(rssUrl) {
  return db.prepare('SELECT * FROM feeds WHERE rss_url = ?').get(rssUrl);
}

function findSimilarFeed(name, siteUrl) {
  if (!name || !siteUrl) return undefined;
  return db
    .prepare('SELECT * FROM feeds WHERE site_url = ? AND LOWER(name) = LOWER(?)')
    .get(siteUrl, name);
}

function createFeed({ categoryId, name, rssUrl, siteUrl, type }) {
  const { maxPos } = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS maxPos FROM feeds WHERE category_id = ?')
    .get(categoryId);
  const result = db
    .prepare('INSERT INTO feeds (category_id, name, rss_url, site_url, position, type) VALUES (?, ?, ?, ?, ?, ?)')
    .run(categoryId, name, rssUrl, siteUrl ?? null, Number(maxPos) + 1, type || 'rss');
  return getFeed(Number(result.lastInsertRowid));
}

function renameFeed(id, name) {
  db.prepare('UPDATE feeds SET name = ? WHERE id = ?').run(name, id);
  return getFeed(id);
}

function deleteFeed(id) {
  db.prepare('DELETE FROM feeds WHERE id = ?').run(id);
}

function reorderFeeds(ids) {
  const stmt = db.prepare('UPDATE feeds SET position = ? WHERE id = ?');
  ids.forEach((id, index) => stmt.run(index, id));
}

function markFeedFetched(id) {
  db.prepare("UPDATE feeds SET last_fetched_at = datetime('now'), last_error = NULL, error_count = 0 WHERE id = ?")
    .run(id);
}

// Nach so vielen Fehlversuchen in Folge gilt ein Feed als tot und wird
// pausiert — sonst laufen gelöschte Adressen ewig weiter ins Leere.
const AUTO_DISABLE_AFTER_ERRORS = 20;

function markFeedError(id, message) {
  db.prepare(`
    UPDATE feeds
    SET last_fetched_at = datetime('now'),
        last_error      = ?,
        error_count     = error_count + 1,
        enabled         = CASE WHEN error_count + 1 >= ? THEN 0 ELSE enabled END
    WHERE id = ?
  `).run(String(message).slice(0, 500), AUTO_DISABLE_AFTER_ERRORS, id);
  return getFeed(id);
}

// Nach einem erfolgreichen Abruf merken, woran der Server eine Aenderung
// erkennt. Nur nach erfolgreichem Verarbeiten aufrufen: sonst gaelte ein
// kaputter Rumpf als "gesehen" und der Feed bliebe stehen.
function setFeedCache(id, etag, lastModified) {
  db.prepare('UPDATE feeds SET etag = ?, last_modified = ? WHERE id = ?')
    .run(etag || null, lastModified || null, id);
}

// Der Server sagt: unveraendert. Kein Herunterladen, kein Parsen — nur den
// Zeitpunkt festhalten und den Fehlerzaehler zuruecksetzen.
function markFeedNotModified(id) {
  db.prepare(`
    UPDATE feeds
    SET last_fetched_at      = datetime('now'),
        last_error           = NULL,
        error_count          = 0,
        not_modified_count   = not_modified_count + 1
    WHERE id = ?
  `).run(id);
}

function setFeedEnabled(id, enabled) {
  // Beim Reaktivieren den Fehlerzähler zurücksetzen, damit der Feed nicht
  // sofort wieder in die Auto-Pause läuft.
  db.prepare('UPDATE feeds SET enabled = ?, error_count = CASE WHEN ? THEN 0 ELSE error_count END WHERE id = ?')
    .run(enabled ? 1 : 0, enabled ? 1 : 0, id);
  return getFeed(id);
}

function getEnabledFeeds() {
  return db.prepare('SELECT * FROM feeds WHERE enabled = 1 ORDER BY category_id, position, id').all();
}

// ---------------------------------------------------------------------------
// Artikel
// ---------------------------------------------------------------------------

function upsertArticle({ feedId, guid, title, link, summary, imageUrl, publishedAt }) {
  db.prepare(`
    INSERT INTO articles (feed_id, guid, title, link, summary, image_url, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (feed_id, guid) DO UPDATE SET
      title        = excluded.title,
      link         = excluded.link,
      summary      = excluded.summary,
      image_url    = COALESCE(excluded.image_url, articles.image_url),
      published_at = COALESCE(excluded.published_at, articles.published_at)
  `).run(feedId, guid, title, link ?? null, summary ?? null, imageUrl ?? null, publishedAt ?? null);

  // Fuer die Regeln: welcher Artikel es geworden ist und ob er neu war.
  const zeile = db.prepare('SELECT id, feed_id, title, summary, fetched_at FROM articles WHERE feed_id = ? AND guid = ?')
    .get(feedId, guid);
  return zeile || null;
}

// Aufräumen: gespeicherte (Stern) und ungelesene Artikel bleiben erhalten.
// Ohne die Ungelesen-Ausnahme verschwinden bei schnellen Feeds Artikel,
// bevor sie überhaupt jemand gesehen hat — wer zwei Tage nicht reinschaut,
// verliert sie stillschweigend.
//
// Damit ein nie gelesener Feed die Datenbank nicht unbegrenzt füllt, greift
// weit oberhalb des normalen Limits zusätzlich eine harte Obergrenze. Erst
// dort weicht auch Ungelesenes — Gesterntes weiterhin nie.
function pruneArticles(feedId, keep = 30, hardCap = keep * 10) {
  const deleteBeyond = db.prepare(`
    DELETE FROM articles
    WHERE feed_id = ?
      AND starred_at IS NULL
      AND (? = 0 OR read_at IS NOT NULL)
      AND id NOT IN (
        SELECT id FROM articles
        WHERE feed_id = ?
        ORDER BY COALESCE(published_at, fetched_at) DESC, id DESC
        LIMIT ?
      )
  `);

  deleteBeyond.run(feedId, 1, feedId, keep);          // nur Gelesenes
  deleteBeyond.run(feedId, 0, feedId, hardCap);       // Notbremse, auch Ungelesenes
}

// Ungelesene werden nicht mehr weggeräumt (siehe pruneArticles). Damit sie
// auch sichtbar sind und der Ungelesen-Zähler nicht bei limitPerFeed
// stehenbleibt, reicht das Board über das normale Limit hinaus — allerdings
// nur für Ungelesenes und bis zu einer Obergrenze, damit die Antwort nicht
// unbegrenzt wächst.
function getArticlesForBoard(limitPerFeed = 30, unreadLimitPerFeed = 150) {
  return db.prepare(`
    SELECT id, feed_id, guid, title, link, summary, image_url, read_at, starred_at, published_at, fetched_at,
           content IS NOT NULL AS has_content, ai_summary, ai_translation
    FROM (
      SELECT a.*,
             ROW_NUMBER() OVER (
               PARTITION BY a.feed_id
               ORDER BY COALESCE(a.published_at, a.fetched_at) DESC, a.id DESC
             ) AS rn
      FROM articles a
    )
    WHERE rn <= ?
       OR (read_at IS NULL AND rn <= ?)
  `).all(limitPerFeed, unreadLimitPerFeed);
}

// Lese-Status ----------------------------------------------------------------

function setArticleRead(id, read) {
  db.prepare("UPDATE articles SET read_at = CASE WHEN ? THEN datetime('now') ELSE NULL END WHERE id = ?")
    .run(read ? 1 : 0, id);
}

function setFeedRead(feedId, read) {
  db.prepare("UPDATE articles SET read_at = CASE WHEN ? THEN datetime('now') ELSE NULL END WHERE feed_id = ?")
    .run(read ? 1 : 0, feedId);
}

function setCategoryRead(categoryId, read) {
  db.prepare(`
    UPDATE articles SET read_at = CASE WHEN ? THEN datetime('now') ELSE NULL END
    WHERE feed_id IN (SELECT id FROM feeds WHERE category_id = ?)
  `).run(read ? 1 : 0, categoryId);
}

// ---------------------------------------------------------------------------
// Fuer die Fever-Schnittstelle (Handy-Apps)
// ---------------------------------------------------------------------------
// Fever arbeitet mit nackten ID-Listen und holt die Artikel dann blockweise
// ueber since_id. Deshalb eigene Abfragen: die Board-Ansicht ist auf etwas
// anderes zugeschnitten (Rubriken, Bilder, Ausblenden).

function getFeverItemIds({ unread = false, saved = false } = {}) {
  const wo = unread ? 'read_at IS NULL' : (saved ? 'starred_at IS NOT NULL' : '1');
  return db.prepare(`SELECT id FROM articles WHERE ${wo} ORDER BY id`).all().map((r) => r.id);
}

function getFeverItems({ sinceId = null, maxId = null, ids = null, limit = 50 } = {}) {
  if (ids && ids.length) {
    const platzhalter = ids.map(() => '?').join(',');
    return db.prepare(`
      SELECT id, feed_id, title, link, summary, content, read_at, starred_at, published_at, fetched_at
      FROM articles WHERE id IN (${platzhalter}) ORDER BY id LIMIT ?
    `).all(...ids.slice(0, limit), limit);
  }

  // since_id zaehlt aufwaerts, max_id abwaerts — so steht es in der Fever-Doku.
  if (maxId) {
    return db.prepare(`
      SELECT id, feed_id, title, link, summary, content, read_at, starred_at, published_at, fetched_at
      FROM articles WHERE id < ? ORDER BY id DESC LIMIT ?
    `).all(maxId, limit);
  }

  return db.prepare(`
    SELECT id, feed_id, title, link, summary, content, read_at, starred_at, published_at, fetched_at
    FROM articles WHERE id > ? ORDER BY id LIMIT ?
  `).all(sinceId || 0, limit);
}

// Fever markiert „alles vor diesem Zeitpunkt". Ohne Zeitpunkt gilt: alles.
function markFeedReadBefore(feedId, grenzeIso = null) {
  if (!grenzeIso) return setFeedRead(feedId, true);
  db.prepare(`
    UPDATE articles SET read_at = datetime('now')
    WHERE feed_id = ? AND read_at IS NULL
      AND COALESCE(published_at, fetched_at) <= ?
  `).run(feedId, grenzeIso);
  return undefined;
}

function markCategoryReadBefore(categoryId, grenzeIso = null) {
  if (!grenzeIso) return setCategoryRead(categoryId, true);
  db.prepare(`
    UPDATE articles SET read_at = datetime('now')
    WHERE feed_id IN (SELECT id FROM feeds WHERE category_id = ?)
      AND read_at IS NULL
      AND COALESCE(published_at, fetched_at) <= ?
  `).run(categoryId, grenzeIso);
  return undefined;
}

// Fuer den Offline-Vorrat: gespeicherte Artikel zuerst, dann die juengsten
// ungelesenen. Nur solche mit bereits geladenem Volltext oder wenigstens einer
// Kurzfassung — fuer den Rest gaebe es offline ohnehin nichts zu zeigen.
function getOfflineCandidates(limit = 60) {
  return db.prepare(`
    SELECT id FROM articles
    WHERE (starred_at IS NOT NULL OR read_at IS NULL)
      AND (content IS NOT NULL OR summary IS NOT NULL)
    ORDER BY (starred_at IS NULL), COALESCE(published_at, fetched_at) DESC
    LIMIT ?
  `).all(limit).map((r) => r.id);
}

// Gespeicherte Artikel (Stern) -----------------------------------------------

function setArticleStarred(id, starred) {
  db.prepare("UPDATE articles SET starred_at = CASE WHEN ? THEN datetime('now') ELSE NULL END WHERE id = ?")
    .run(starred ? 1 : 0, id);
}

function getSavedArticles(limit = 200) {
  return db.prepare(`
    SELECT a.id, a.title, a.link, a.summary, a.image_url, a.read_at, a.starred_at, a.published_at, a.fetched_at,
           f.name AS feed_name, f.site_url AS feed_site_url, f.rss_url AS feed_rss_url,
           c.name AS category_name, c.slug AS category_slug
    FROM articles a
    JOIN feeds f ON f.id = a.feed_id
    JOIN categories c ON c.id = f.category_id
    WHERE a.starred_at IS NOT NULL
    ORDER BY a.starred_at DESC
    LIMIT ?
  `).all(limit).map((row) => ({
    id: row.id,
    title: row.title,
    link: row.link,
    summary: row.summary,
    image: row.image_url || null,
    read: !!row.read_at,
    starred: true,
    published_at: row.published_at,
    fetched_at: row.fetched_at,
    feed_name: row.feed_name,
    feed_site_url: row.feed_site_url,
    feed_rss_url: row.feed_rss_url,
    category_name: row.category_name,
    category_slug: row.category_slug,
  }));
}

// Volltext & KI-Ergebnisse ---------------------------------------------------

// Artikel samt Feed- und Rubrik-Namen — Basis für Volltext, KI und Teilen
function getArticleWithFeed(id) {
  return db.prepare(`
    SELECT a.*, f.name AS feed_name, f.site_url AS feed_site_url, f.type AS feed_type,
           c.name AS category_name
    FROM articles a
    JOIN feeds f ON f.id = a.feed_id
    JOIN categories c ON c.id = f.category_id
    WHERE a.id = ?
  `).get(id);
}

function setArticleContent(id, content) {
  db.prepare("UPDATE articles SET content = ?, content_at = datetime('now') WHERE id = ?")
    .run(content ?? null, id);
}

function setArticleAiSummary(id, summary) {
  db.prepare('UPDATE articles SET ai_summary = ? WHERE id = ?').run(summary ?? null, id);
}

function setArticleAiTranslation(id, translation, lang) {
  db.prepare('UPDATE articles SET ai_translation = ?, ai_lang = ? WHERE id = ?')
    .run(translation ?? null, lang ?? null, id);
}

// Ungelesene Artikel der letzten Stunden — Grundlage für das Tages-Briefing
function getRecentUnread(hours = 24, limit = 120) {
  const muteLower = getMuteWords().map((w) => w.toLowerCase());
  const rows = db.prepare(`
    SELECT a.id, a.title, a.summary, a.link, a.published_at, a.fetched_at,
           f.name AS feed_name, c.name AS category_name
    FROM articles a
    JOIN feeds f ON f.id = a.feed_id
    JOIN categories c ON c.id = f.category_id
    WHERE a.read_at IS NULL
      AND COALESCE(a.published_at, a.fetched_at) >= datetime('now', ?)
    ORDER BY COALESCE(a.published_at, a.fetched_at) DESC
    LIMIT ?
  `).all(`-${Math.max(1, Math.min(168, Number(hours) || 24))} hours`, limit);
  return rows.filter((row) => !isMuted(row, muteLower));
}

// Volltextsuche (JS-seitig, damit Groß-/Kleinschreibung auch bei Kyrillisch passt)
// Durchsucht Titel, Kurzfassung, geholten Volltext und KI-Zusammenfassung.
//
// Die Auswahl passiert in SQL statt in JavaScript: der Volltext eines Artikels
// kann etliche Kilobyte gross sein, und frueher wurde die komplette
// Artikeltabelle in den Speicher geladen und dort gefiltert. So beruehrt
// SQLite den Volltext nur zeilenweise und bricht beim Limit ab. Die
// Treffer-Reihenfolge (neueste zuerst) bleibt unveraendert.
const SUCH_SPALTEN = `a.id, a.title, a.link, a.summary, a.image_url, a.read_at, a.starred_at,
           a.published_at, a.fetched_at,
           f.name AS feed_name, f.site_url AS feed_site_url, f.rss_url AS feed_rss_url,
           c.name AS category_name, c.slug AS category_slug`;

// Der Index sucht ueber Titel, Kurzfassung, Volltext und KI-Kurzfassung.
// Sortiert wird nach Fundstelle: ein Treffer im Titel wiegt schwerer als einer
// irgendwo im Volltext. bm25() gewichtet die Spalten dafuer von vorn nach
// hinten. Bei gleichem Rang entscheidet das Datum.
function sucheImIndex(needle, limit) {
  // In FTS5 ist alles zwischen doppelten Anfuehrungszeichen woertlich; ein
  // enthaltenes Anfuehrungszeichen wird verdoppelt. Damit koennen Eingaben wie
  // `foo OR bar` oder `NEAR(` nicht als Suchsyntax wirken.
  const ausdruck = `"${needle.replace(/"/g, '""')}"`;
  return db.prepare(`
    SELECT ${SUCH_SPALTEN}
    FROM articles_fts
    JOIN articles a   ON a.id = articles_fts.rowid
    JOIN feeds f      ON f.id = a.feed_id
    JOIN categories c ON c.id = f.category_id
    WHERE articles_fts MATCH :ausdruck
    ORDER BY bm25(articles_fts, 10.0, 4.0, 1.0, 2.0),
             COALESCE(a.published_at, a.fetched_at) DESC, a.id DESC
    LIMIT :limit
  `).all({ ausdruck, limit });
}

// Fuer ein oder zwei Zeichen taugt der Trigramm-Index nicht — dafuer bleibt
// der alte Weg. Bei so kurzen Eingaben ist der Bestand ohnehin schnell
// durchgesehen.
function sucheMitLike(needle, limit) {
  // %, _ und \ sind LIKE-Platzhalter — im Suchtext sollen sie woertlich gelten
  const muster = `%${needle.replace(/[\\%_]/g, (z) => `\\${z}`)}%`;
  return db.prepare(`
    SELECT ${SUCH_SPALTEN}
    FROM articles a
    JOIN feeds f ON f.id = a.feed_id
    JOIN categories c ON c.id = f.category_id
    WHERE kleinschreib(a.title)      LIKE :muster ESCAPE '\\'
       OR kleinschreib(a.summary)    LIKE :muster ESCAPE '\\'
       OR kleinschreib(a.content)    LIKE :muster ESCAPE '\\'
       OR kleinschreib(a.ai_summary) LIKE :muster ESCAPE '\\'
    ORDER BY COALESCE(a.published_at, a.fetched_at) DESC, a.id DESC
    LIMIT :limit
  `).all({ muster, limit });
}

function searchArticles(query, limit = 100) {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return [];

  let rows;
  try {
    rows = needle.length >= 3 ? sucheImIndex(needle, limit) : sucheMitLike(needle, limit);
  } catch (error) {
    // Lieber langsam als gar nicht: sollte der Index fehlen oder klemmen,
    // findet die Suche trotzdem etwas.
    console.warn('Volltextindex nicht nutzbar, weiche auf LIKE aus:', error.message);
    rows = sucheMitLike(needle, limit);
  }

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    link: row.link,
    summary: row.summary,
    image: row.image_url || null,
    read: !!row.read_at,
    starred: !!row.starred_at,
    published_at: row.published_at,
    fetched_at: row.fetched_at,
    feed_name: row.feed_name,
    feed_site_url: row.feed_site_url,
    feed_rss_url: row.feed_rss_url,
    category_name: row.category_name,
    category_slug: row.category_slug,
  }));
}

// ---------------------------------------------------------------------------
// Kennzahlen für externe Dashboards (Homepage-Widget)
// ---------------------------------------------------------------------------

// Zählt ungelesene Artikel nach derselben Logik wie getBoard(): nur die im
// Board sichtbaren 30 Artikel je Feed, stumm geschaltete ausgenommen. Liefert
// bewusst nur Skalare, damit das Widget nicht das komplette Board (inkl.
// Base64-Logos) laden muss.
// ---------------------------------------------------------------------------
// Feed-Gesundheit
// ---------------------------------------------------------------------------
// Alles, was sich ueber einen Feed sagen laesst, ohne ihn abzurufen: wann er
// zuletzt erfolgreich war, woran es scheitert, wie oft er ueberhaupt etwas
// veroeffentlicht und ob er sich selbst abgeschaltet hat.

function getFeedHealth() {
  return db.prepare(`
    SELECT f.id, f.name, f.rss_url, f.type, f.enabled, f.error_count, f.last_error,
           f.last_fetched_at, f.not_modified_count,
           (f.etag IS NOT NULL OR f.last_modified IS NOT NULL) AS conditional,
           c.name AS category_name,
           (SELECT COUNT(*) FROM articles a WHERE a.feed_id = f.id)   AS articles,
           (SELECT COUNT(*) FROM articles a WHERE a.feed_id = f.id
              AND a.read_at IS NULL)                                  AS unread,
           (SELECT MAX(COALESCE(a.published_at, a.fetched_at)) FROM articles a
              WHERE a.feed_id = f.id)                                 AS newest_at,
           (SELECT COUNT(*) FROM articles a WHERE a.feed_id = f.id
              AND COALESCE(a.published_at, a.fetched_at) >= datetime('now', '-30 days')) AS last30
    FROM feeds f
    JOIN categories c ON c.id = f.category_id
    ORDER BY f.enabled, f.error_count DESC, c.position, f.position, f.id
  `).all().map((f) => ({
    ...f,
    enabled: !!f.enabled,
    conditional: !!f.conditional,
    // Veroeffentlichungen je Woche, aus den letzten 30 Tagen gerechnet
    per_week: Math.round((f.last30 / 30) * 7 * 10) / 10,
  }));
}

function getStats() {
  const muteLower = getMuteWords().map((w) => w.toLowerCase());

  let unread = 0;
  for (const article of getArticlesForBoard(30)) {
    if (article.read_at) continue;
    if (!article.starred_at && isMuted(article, muteLower)) continue;
    unread += 1;
  }

  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM categories)                            AS categories,
      (SELECT COUNT(*) FROM feeds)                                 AS feeds,
      (SELECT COUNT(*) FROM feeds WHERE last_error IS NOT NULL)    AS failing_feeds,
      (SELECT COUNT(*) FROM articles)                              AS articles,
      (SELECT COUNT(*) FROM articles WHERE starred_at IS NOT NULL) AS saved,
      (SELECT MAX(last_fetched_at) FROM feeds)                     AS last_fetched_at
  `).get();

  return { unread, ...counts };
}

// ---------------------------------------------------------------------------
// Gesamtes Board als verschachtelte Struktur
// ---------------------------------------------------------------------------

function getBoard() {
  const categories = getCategories();
  const feeds = getFeeds();
  const articles = getArticlesForBoard(30);
  const muteLower = getMuteWords().map((w) => w.toLowerCase());

  const articlesByFeed = new Map();
  for (const article of articles) {
    // Stumm geschaltete Artikel ausblenden (gespeicherte bleiben sichtbar)
    if (!article.starred_at && isMuted(article, muteLower)) continue;
    if (!articlesByFeed.has(article.feed_id)) articlesByFeed.set(article.feed_id, []);
    articlesByFeed.get(article.feed_id).push({
      id: article.id,
      title: article.title,
      link: article.link,
      summary: article.summary,
      image: article.image_url || null,
      read: !!article.read_at,
      starred: !!article.starred_at,
      published_at: article.published_at,
      fetched_at: article.fetched_at,
      // Volltext selbst bleibt draußen (zu groß fürs Board) — nur der Hinweis,
      // dass er schon geladen wurde; abgerufen wird er einzeln.
      has_content: !!article.has_content,
      ai_summary: article.ai_summary || null,
      ai_translation: article.ai_translation || null,
    });
  }

  const feedsByCategory = new Map();
  for (const feed of feeds) {
    if (!feedsByCategory.has(feed.category_id)) feedsByCategory.set(feed.category_id, []);
    const feedArticles = articlesByFeed.get(feed.id) || [];
    feedsByCategory.get(feed.category_id).push({
      id: feed.id,
      name: feed.name,
      type: feed.type || 'rss',
      rss_url: feed.rss_url,
      site_url: feed.site_url,
      last_fetched_at: feed.last_fetched_at,
      last_error: feed.last_error,
      enabled: feed.enabled !== 0,
      error_count: feed.error_count || 0,
      unread: feedArticles.filter((a) => !a.read).length,
      articles: feedArticles,
    });
  }

  return {
    categories: categories.map((category) => {
      const categoryFeeds = feedsByCategory.get(category.id) || [];
      return {
        id: category.id,
        name: category.name,
        slug: category.slug || null,
        logo: category.logo || null,
        unread: categoryFeeds.reduce((sum, f) => sum + f.unread, 0),
        feeds: categoryFeeds,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Backup & Wiederherstellung (JSON, damit es ohne SQLite-Werkzeuge lesbar ist)
// ---------------------------------------------------------------------------

const BACKUP_VERSION = 1;

// Passwort und Cookie-Schlüssel gehören nicht in eine Sicherung: sie würde
// sonst Zugangsdaten weitertragen, und eine eingespielte Sicherung würde einen
// aus der eigenen Installation aussperren.
//
// Dasselbe gilt für Bot-Token und API-Schlüssel: eine Sicherungsdatei landet
// leicht in einer Cloud oder in fremden Händen. Sie bleiben beim Einspielen
// erhalten (siehe `keep` weiter unten), reisen aber nicht mit.
const SECRET_SETTINGS = new Set(['password_hash', 'session_secret', 'cfg_telegram_bot_token']);

function istGeheim(key) {
  return SECRET_SETTINGS.has(key) || /^cfg_ai_key_/.test(key);
}

function exportBackup() {
  return {
    format: 'feedboard-backup',
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    categories: db.prepare('SELECT * FROM categories ORDER BY position, id').all(),
    feeds: db.prepare('SELECT * FROM feeds ORDER BY category_id, position, id').all(),
    articles: db.prepare('SELECT * FROM articles ORDER BY feed_id, id').all(),
    settings: db.prepare('SELECT * FROM settings').all().filter((row) => !istGeheim(row.key)),
  };
}

function insertRow(table, row, columns) {
  const used = columns.filter((c) => row[c] !== undefined);
  db.prepare(
    `INSERT INTO ${table} (${used.join(', ')}) VALUES (${used.map(() => '?').join(', ')})`
  ).run(...used.map((c) => (row[c] === undefined ? null : row[c])));
}

// Ersetzt den kompletten Bestand. Läuft in einer Transaktion: schlägt etwas
// fehl, bleibt die alte Datenbank unverändert.
function importBackup(data) {
  if (!data || data.format !== 'feedboard-backup') {
    throw fehler('backup_invalid', 'Das ist keine Feedboard-Sicherung.');
  }
  if (Number(data.version) > BACKUP_VERSION) {
    throw fehler('backup_too_new', 'Die Sicherung stammt aus einer neueren Feedboard-Version.');
  }
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const feeds = Array.isArray(data.feeds) ? data.feeds : [];
  const articles = Array.isArray(data.articles) ? data.articles : [];
  const settings = Array.isArray(data.settings) ? data.settings : [];
  if (!categories.length) throw fehler('backup_no_categories', 'Die Sicherung enthält keine Rubriken.');

  const columnsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const categoryColumns = columnsOf('categories');
  const feedColumns = columnsOf('feeds');
  const articleColumns = columnsOf('articles');

  // Zugangsdaten der laufenden Installation überleben die Wiederherstellung
  const keep = db.prepare('SELECT * FROM settings').all().filter((row) => istGeheim(row.key));

  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM articles; DELETE FROM feeds; DELETE FROM categories; DELETE FROM settings;');
    for (const row of categories) insertRow('categories', row, categoryColumns);
    for (const row of feeds) insertRow('feeds', row, feedColumns);
    for (const row of articles) insertRow('articles', row, articleColumns);
    for (const row of settings) {
      if (!istGeheim(row.key)) setSetting(row.key, row.value);
    }
    for (const row of keep) setSetting(row.key, row.value);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw fehler('restore_failed', `Wiederherstellung fehlgeschlagen: ${error.message}`, { msg: error.message });
  }

  return { categories: categories.length, feeds: feeds.length, articles: articles.length };
}

// ---------------------------------------------------------------------------
// Startbefüllung beim allerersten Start (kann in der UI gelöscht werden)
// ---------------------------------------------------------------------------

function seedIfEmpty() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM categories').get();
  if (Number(count) > 0) return false;

  const tech = createCategory('Tech');
  createFeed({
    categoryId: tech.id,
    name: 'heise online',
    rssUrl: 'https://www.heise.de/rss/heise-atom.xml',
    siteUrl: 'https://www.heise.de',
  });
  createFeed({
    categoryId: tech.id,
    name: 'Golem.de',
    rssUrl: 'https://rss.golem.de/rss.php?feed=RSS2.0',
    siteUrl: 'https://www.golem.de',
  });

  const news = createCategory('Nachrichten');
  createFeed({
    categoryId: news.id,
    name: 'tagesschau',
    rssUrl: 'https://www.tagesschau.de/index~rss2.xml',
    siteUrl: 'https://www.tagesschau.de',
  });

  return true;
}

module.exports = {
  db,
  getCategories,
  getCategory,
  getCategoryBySlug,
  slugify,
  createCategory,
  renameCategory,
  setCategoryLogo,
  deleteCategory,
  reorderCategories,
  getFeeds,
  getEnabledFeeds,
  getFeed,
  getFeedByUrl,
  findSimilarFeed,
  createFeed,
  renameFeed,
  deleteFeed,
  reorderFeeds,
  markFeedFetched,
  setFeedCache,
  markFeedNotModified,
  markFeedError,
  setFeedEnabled,
  AUTO_DISABLE_AFTER_ERRORS,
  upsertArticle,
  pruneArticles,
  setArticleRead,
  setFeedRead,
  setCategoryRead,
  setArticleStarred,
  getOfflineCandidates,
  getFeverItemIds,
  getFeverItems,
  markFeedReadBefore,
  markCategoryReadBefore,
  getSavedArticles,
  searchArticles,
  getArticleWithFeed,
  setArticleContent,
  setArticleAiSummary,
  setArticleAiTranslation,
  getRecentUnread,
  exportBackup,
  importBackup,
  getSetting,
  setSetting,
  deleteSetting,
  getMuteWords,
  setMuteWords,
  getBoard,
  getStats,
  getFeedHealth,
  getRules,
  createRule,
  updateRule,
  deleteRule,
  applyRules,
  applyRulesToExisting,
  REGEL_FELDER,
  REGEL_AKTIONEN,
  AUTO_DISABLE_AFTER_ERRORS,
  seedIfEmpty,
};
