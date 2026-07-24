// feedFetcher.js — RSS/Atom laden, Kurzfassungen erzeugen, Feeds automatisch finden
'use strict';

const Parser = require('rss-parser');
const store = require('./db');
const telegram = require('./telegram');

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
    item: [
      ['content:encoded', 'contentEncoded'],
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
    ],
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

function sanitizeImageUrl(url) {
  if (!url) return null;
  const clean = decodeEntities(String(url).trim());
  if (!/^https?:\/\//i.test(clean) || clean.length > 1000) return null;
  return clean;
}

function pickMediaUrl(node) {
  if (!node) return null;
  const list = Array.isArray(node) ? node : [node];
  for (const entry of list) {
    const attrs = entry && entry.$ ? entry.$ : entry;
    if (!attrs) continue;
    const url = attrs.url || attrs.href;
    if (!url) continue;
    if (attrs.medium && attrs.medium !== 'image') continue;
    if (attrs.type && !/^image\//i.test(attrs.type)) continue;
    const clean = sanitizeImageUrl(url);
    if (clean) return clean;
  }
  return null;
}

// Vorschaubild aus dem RSS-Eintrag ziehen (kein zusätzlicher Seitenabruf)
function extractImage(item) {
  // 1) enclosure (nur wenn Bild-Typ oder Bild-Endung)
  const enc = item.enclosure;
  if (enc && enc.url) {
    const isImage = /^image\//i.test(enc.type || '') || /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i.test(enc.url);
    if (isImage) {
      const clean = sanitizeImageUrl(enc.url);
      if (clean) return clean;
    }
  }
  // 2) media:content / media:thumbnail
  return (
    pickMediaUrl(item.mediaContent) ||
    pickMediaUrl(item.mediaThumbnail) ||
    // 3) erstes <img> im Inhalt
    (() => {
      const html = item.contentEncoded || item['content:encoded'] || item.content || item.summary || '';
      const match = String(html).match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
      return match ? sanitizeImageUrl(match[1]) : null;
    })()
  );
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

// Telegram-Nachrichten als Artikel speichern (erste Zeile = Überschrift, voller Text = Kurzfassung)
function saveTelegramMessages(feedId, messages) {
  for (const msg of messages) {
    const fullText = (msg.text || '').trim();
    const firstLine = fullText.split('\n').find((line) => line.trim()) || '';
    const title = truncateAtWord(firstLine, 140) || (msg.photo ? '🖼' : '(ohne Text)');

    const hasMore = fullText.includes('\n') || firstLine.length > 140;
    const summary = hasMore ? truncateAtWord(fullText, SUMMARY_MAX_CHARS) : null;

    store.upsertArticle({
      feedId,
      guid: msg.url || `${feedId}:${msg.createdAt || ''}`,
      title,
      link: msg.url || null,
      summary,
      imageUrl: msg.photo || null,
      publishedAt: msg.createdAt,
    });
  }
}

async function fetchTelegramFeed(feed) {
  try {
    const channel =
      telegram.channelFromWebviewUrl(feed.rss_url) ||
      telegram.detectTelegramChannel(feed.site_url) ||
      telegram.detectTelegramChannel(feed.rss_url);
    if (!channel) throw new Error('Telegram-Kanal konnte nicht ermittelt werden.');

    const data = await telegram.fetchTelegramChannel(channel);
    saveTelegramMessages(feed.id, data.messages);
    store.pruneArticles(feed.id, KEEP_ARTICLES_PER_FEED);
    store.markFeedFetched(feed.id);
    return { feedId: feed.id, ok: true, items: data.messages.length };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    store.markFeedError(feed.id, message);
    return { feedId: feed.id, ok: false, error: message };
  }
}

async function fetchFeed(feed) {
  if (feed.type === 'telegram') return fetchTelegramFeed(feed);
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
        imageUrl: extractImage(item),
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
    // Pausierte Feeds (von Hand oder nach zu vielen Fehlern) bleiben außen vor
    const feeds = store.getEnabledFeeds();
    const paused = store.getFeeds().length - feeds.length;
    const results = await mapLimit(feeds, CONCURRENCY, fetchFeed);
    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    return { skipped: false, total: results.length, ok, failed, paused };
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

async function addTelegramFeed({ categoryId, channel, name }) {
  const data = await telegram.fetchTelegramChannel(channel);
  if (!data.messages.length) {
    throw new Error('Kein öffentlicher Telegram-Kanal oder keine Nachrichten gefunden.');
  }

  const rssUrl = telegram.channelWebviewUrl(channel);
  const siteUrl = `https://t.me/${channel}`;
  const feedName = (name && String(name).trim()) || data.title || `@${channel}`;

  const existing = store.getFeedByUrl(rssUrl);
  if (existing) throw new Error(`Dieser Kanal ist bereits vorhanden („${existing.name}“).`);

  const feed = store.createFeed({ categoryId, name: feedName, rssUrl, siteUrl, type: 'telegram' });
  saveTelegramMessages(feed.id, data.messages);
  store.pruneArticles(feed.id, KEEP_ARTICLES_PER_FEED);
  store.markFeedFetched(feed.id);
  return store.getFeed(feed.id);
}

async function addFeed({ categoryId, url, name }) {
  const category = store.getCategory(categoryId);
  if (!category) throw new Error('Rubrik nicht gefunden.');

  // Telegram-Kanal? (t.me/kanal, @kanal, …) — dann keine RSS-Suche
  const channel = telegram.detectTelegramChannel(url);
  if (channel) return addTelegramFeed({ categoryId, channel, name });

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
      imageUrl: extractImage(item),
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
