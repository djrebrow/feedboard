// db.js — Datenbank-Layer (eingebautes node:sqlite, keine nativen Dependencies)
'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'feedboard.db');

// Datenverzeichnis sicherstellen
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

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
  db.prepare("UPDATE feeds SET last_fetched_at = datetime('now'), last_error = NULL WHERE id = ?").run(id);
}

function markFeedError(id, message) {
  db.prepare("UPDATE feeds SET last_fetched_at = datetime('now'), last_error = ? WHERE id = ?")
    .run(String(message).slice(0, 500), id);
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
}

function pruneArticles(feedId, keep = 30) {
  db.prepare(`
    DELETE FROM articles
    WHERE feed_id = ?
      AND id NOT IN (
        SELECT id FROM articles
        WHERE feed_id = ?
        ORDER BY COALESCE(published_at, fetched_at) DESC, id DESC
        LIMIT ?
      )
  `).run(feedId, feedId, keep);
}

function getArticlesForBoard(limitPerFeed = 30) {
  return db.prepare(`
    SELECT id, feed_id, guid, title, link, summary, image_url, published_at, fetched_at
    FROM (
      SELECT a.*,
             ROW_NUMBER() OVER (
               PARTITION BY a.feed_id
               ORDER BY COALESCE(a.published_at, a.fetched_at) DESC, a.id DESC
             ) AS rn
      FROM articles a
    )
    WHERE rn <= ?
  `).all(limitPerFeed);
}

// ---------------------------------------------------------------------------
// Gesamtes Board als verschachtelte Struktur
// ---------------------------------------------------------------------------

function getBoard() {
  const categories = getCategories();
  const feeds = getFeeds();
  const articles = getArticlesForBoard(30);

  const articlesByFeed = new Map();
  for (const article of articles) {
    if (!articlesByFeed.has(article.feed_id)) articlesByFeed.set(article.feed_id, []);
    articlesByFeed.get(article.feed_id).push({
      id: article.id,
      title: article.title,
      link: article.link,
      summary: article.summary,
      image: article.image_url || null,
      published_at: article.published_at,
      fetched_at: article.fetched_at,
    });
  }

  const feedsByCategory = new Map();
  for (const feed of feeds) {
    if (!feedsByCategory.has(feed.category_id)) feedsByCategory.set(feed.category_id, []);
    feedsByCategory.get(feed.category_id).push({
      id: feed.id,
      name: feed.name,
      type: feed.type || 'rss',
      rss_url: feed.rss_url,
      site_url: feed.site_url,
      last_fetched_at: feed.last_fetched_at,
      last_error: feed.last_error,
      articles: articlesByFeed.get(feed.id) || [],
    });
  }

  return {
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug || null,
      logo: category.logo || null,
      feeds: feedsByCategory.get(category.id) || [],
    })),
  };
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
  getFeed,
  getFeedByUrl,
  findSimilarFeed,
  createFeed,
  renameFeed,
  deleteFeed,
  reorderFeeds,
  markFeedFetched,
  markFeedError,
  upsertArticle,
  pruneArticles,
  getBoard,
  seedIfEmpty,
};
