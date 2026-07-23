// feedFetcher.js — RSS/Atom laden, Kurzfassungen erzeugen, Feeds automatisch finden
'use strict';

const Parser = require('rss-parser');
const store = require('./db');

const FETCH_TIMEOUT_MS = 15000;
const SUMMARY_MAX_CHARS = 400;
const KEEP_ARTICLES_PER_FEED = 30;
const CONCURRENCY = 4;
const USER_AGENT = 'Mozilla/5.0 (compatible; Feedboard/1.0; +https://github.com/feedboard)';

const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  headers: {
    'User-Agent': USER_AGENT,
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  },
  customFields: {
    item: [['content:encoded', 'contentEncoded']],
  },
});

// ---------------------------------------------------------------------------
// Text-Hilfsfunktionen
// ---------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  Auml: 'Ä',
  Ouml: 'Ö',
  Uuml: 'Ü',
  szlig: 'ß',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  raquo: '»',
  laquo: '«',
  bdquo: '„',
  ldquo: '“',
  rdquo: '”',
  rsquo: '’',
  lsquo: '‘',
  euro: '€',
};

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name) => NAMED_ENTITIES[name] ?? match);
}

function stripHtml(html) {
  if (!html) return '';
  return decodeEntities(
    String(html)
      .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateAtWord(text, maxChars) {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + ' …';
}

function buildSummary(item) {
  const raw =
    item.contentEncoded ||
    item['content:encoded'] ||
    item.content ||
    item.summary ||
    item.contentSnippet ||
    '';
  const clean = stripHtml(raw);
  if (!clean) return null;

  // Wenn die Kurzfassung nur den Titel wiederholt, bringt sie nichts
  const title = stripHtml(item.title || '');
  if (title && clean === title) return null;

  return truncateAtWord(clean, SUMMARY_MAX_CHARS);
}

function toIsoDate(item) {
  const raw = item.isoDate || item.pubDate;
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function buildGuid(item) {
  const guid = item.guid || item.id || item.link;
  if (guid) return String(guid).slice(0, 500);
  // Notfall-Fallback: Hash-artiger Schlüssel aus Titel + Datum
  return `t:${String(item.title || '').slice(0, 200)}|d:${item.pubDate || ''}`;
}

// ---------------------------------------------------------------------------
// Einen Feed laden und Artikel speichern
// ---------------------------------------------------------------------------

async function fetchFeed(feed) {
  try {
    const parsed = await parser.parseURL(feed.rss_url);
    const items = (parsed.items || []).slice(0, KEEP_ARTICLES_PER_FEED);

    for (const item of items) {
      const title = stripHtml(item.title || '') || '(ohne Titel)';
      store.upsertArticle({
        feedId: feed.id,
        guid: buildGuid(item),
        title,
        link: item.link || null,
        summary: buildSummary(item),
        publishedAt: toIsoDate(item),
      });
    }

    store.pruneArticles(feed.id, KEEP_ARTICLES_PER_FEED);
    store.markFeedFetched(feed.id);
    return { feedId: feed.id, ok: true, items: items.length };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    store.markFeedError(feed.id, message);
    return { feedId: feed.id, ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Alle (oder ausgewählte) Feeds mit begrenzter Parallelität aktualisieren
// ---------------------------------------------------------------------------

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, runWorker);
  await Promise.all(workers);
  return results;
}

let refreshInProgress = false;

async function refreshAllFeeds() {
  if (refreshInProgress) return { skipped: true };
  refreshInProgress = true;
  try {
    const feeds = store.getFeeds();
    const results = await mapLimit(feeds, CONCURRENCY, fetchFeed);
    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    return { skipped: false, total: results.length, ok, failed };
  } finally {
    refreshInProgress = false;
  }
}

function isRefreshing() {
  return refreshInProgress;
}

// ---------------------------------------------------------------------------
// Feed-Autodiscovery: aus einer beliebigen URL die RSS-Adresse ermitteln
// ---------------------------------------------------------------------------

function buildUrlCandidates(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Bitte eine URL angeben.');
  // Mit angegebenem Schema: genau diese URL verwenden (wirft bei ungültiger URL)
  if (/^https?:\/\//i.test(raw)) return [new URL(raw).toString()];
  // Ohne Schema: erst https versuchen, dann http (z. B. für Dienste im Heimnetz)
  return [new URL('https://' + raw).toString(), new URL('http://' + raw).toString()];
}

async function tryParseFeed(url) {
  try {
    const parsed = await parser.parseURL(url);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function extractFeedLinksFromHtml(html, baseUrl) {
  const candidates = [];
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    if (!/rel\s*=\s*["']?[^"'>]*alternate/i.test(tag)) continue;
    if (!/type\s*=\s*["']?[^"'>]*(rss|atom)/i.test(tag)) continue;
    const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i) || tag.match(/href\s*=\s*([^\s>]+)/i);
    if (!hrefMatch) continue;
    try {
      candidates.push(new URL(decodeEntities(hrefMatch[1]), baseUrl).toString());
    } catch {
      /* ungültige URL ignorieren */
    }
  }
  return [...new Set(candidates)];
}

const COMMON_FEED_PATHS = [
  '/feed',
  '/feed/',
  '/rss',
  '/rss.xml',
  '/feed.xml',
  '/atom.xml',
  '/index.xml',
  '/rss/feed.xml',
];

async function discoverFeedAt(url) {
  // 1) Ist die Eingabe bereits ein Feed?
  const direct = await tryParseFeed(url);
  if (direct) return { rssUrl: url, parsed: direct };

  // 2) HTML der Seite laden und nach <link rel="alternate"> suchen
  let html = null;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (response.ok) html = await response.text();
  } catch {
    /* Seite nicht erreichbar — unten weiterprobieren */
  }

  if (html) {
    for (const candidate of extractFeedLinksFromHtml(html, url).slice(0, 5)) {
      const parsed = await tryParseFeed(candidate);
      if (parsed) return { rssUrl: candidate, parsed };
    }
  }

  // 3) Übliche Feed-Pfade durchprobieren
  const origin = new URL(url).origin;
  for (const feedPath of COMMON_FEED_PATHS) {
    const candidate = origin + feedPath;
    const parsed = await tryParseFeed(candidate);
    if (parsed) return { rssUrl: candidate, parsed };
  }

  return null;
}

async function discoverFeed(inputUrl) {
  for (const url of buildUrlCandidates(inputUrl)) {
    const found = await discoverFeedAt(url);
    if (found) return found;
  }
  throw new Error('Unter dieser Adresse wurde kein RSS-/Atom-Feed gefunden.');
}

// ---------------------------------------------------------------------------
// Feed anlegen: Discovery + Validierung + erste Artikel speichern
// ---------------------------------------------------------------------------

async function addFeed({ categoryId, url, name }) {
  const category = store.getCategory(categoryId);
  if (!category) throw new Error('Rubrik nicht gefunden.');

  const { rssUrl, parsed } = await discoverFeed(url);

  const parsedTitle = stripHtml(parsed.title || '');
  const feedName = (name && String(name).trim()) || parsedTitle || new URL(rssUrl).hostname;

  let siteUrl = null;
  if (parsed.link) {
    try {
      siteUrl = new URL(parsed.link, rssUrl).toString();
    } catch {
      siteUrl = null;
    }
  }
  if (!siteUrl) siteUrl = new URL(rssUrl).origin;

  const existing = store.getFeedByUrl(rssUrl) || store.findSimilarFeed(parsedTitle, siteUrl);
  if (existing) throw new Error(`Dieser Feed ist bereits vorhanden („${existing.name}“).`);

  const feed = store.createFeed({ categoryId, name: feedName, rssUrl, siteUrl });

  // Bereits geparste Artikel direkt übernehmen
  const items = (parsed.items || []).slice(0, KEEP_ARTICLES_PER_FEED);
  for (const item of items) {
    const title = stripHtml(item.title || '') || '(ohne Titel)';
    store.upsertArticle({
      feedId: feed.id,
      guid: buildGuid(item),
      title,
      link: item.link || null,
      summary: buildSummary(item),
      publishedAt: toIsoDate(item),
    });
  }
  store.pruneArticles(feed.id, KEEP_ARTICLES_PER_FEED);
  store.markFeedFetched(feed.id);

  return store.getFeed(feed.id);
}

module.exports = {
  fetchFeed,
  refreshAllFeeds,
  isRefreshing,
  addFeed,
  discoverFeed,
  stripHtml,
  buildSummary,
  truncateAtWord,
};
