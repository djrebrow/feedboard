// opml.js — OPML lesen und schreiben (Umzug von/zu anderen Readern)
'use strict';

const { load } = require('cheerio');

const store = require('./db');
const telegram = require('./telegram');

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

// Rubriken werden als verschachtelte <outline> abgebildet — so lesen es
// Feedly, Miniflux, NetNewsWire und Co. als Ordner ein.
function buildOpml() {
  const categories = store.getCategories();
  const feeds = store.getFeeds();

  const feedsByCategory = new Map();
  for (const feed of feeds) {
    if (!feedsByCategory.has(feed.category_id)) feedsByCategory.set(feed.category_id, []);
    feedsByCategory.get(feed.category_id).push(feed);
  }

  const body = categories.map((category) => {
    const lines = (feedsByCategory.get(category.id) || []).map((feed) => {
      const attrs = [
        'type="rss"',
        `text="${escapeXml(feed.name)}"`,
        `title="${escapeXml(feed.name)}"`,
        `xmlUrl="${escapeXml(feed.rss_url)}"`,
      ];
      if (feed.site_url) attrs.push(`htmlUrl="${escapeXml(feed.site_url)}"`);
      return `      <outline ${attrs.join(' ')}/>`;
    });
    return [
      `    <outline text="${escapeXml(category.name)}" title="${escapeXml(category.name)}">`,
      ...lines,
      '    </outline>',
    ].join('\n');
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Feedboard</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${body.join('\n')}
  </body>
</opml>
`;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const UNSORTED = 'Importiert';

// Alle <outline>-Elemente mit xmlUrl einsammeln; der Name der umgebenden
// Gruppe (auch über mehrere Ebenen) wird zur Rubrik.
function parseOpml(xml) {
  const raw = String(xml || '').trim();
  if (!raw) throw new Error('Die OPML-Datei ist leer.');

  const $ = load(raw, { xmlMode: true });
  if (!$('opml').length && !$('body outline').length) {
    throw new Error('Das ist keine gültige OPML-Datei.');
  }

  const entries = [];

  function walk(node, groupName) {
    $(node).children('outline').each((_, child) => {
      const el = $(child);
      const xmlUrl = (el.attr('xmlUrl') || el.attr('xmlurl') || '').trim();
      const label = (el.attr('text') || el.attr('title') || '').trim();

      if (xmlUrl) {
        entries.push({
          categoryName: groupName || UNSORTED,
          name: label || null,
          xmlUrl,
          htmlUrl: (el.attr('htmlUrl') || el.attr('htmlurl') || '').trim() || null,
        });
        return;
      }
      // Gruppe ohne eigene Feed-Adresse → Rubrik; verschachtelte Ordner
      // behalten den Namen der obersten Ebene, damit keine Rubrik-Flut entsteht.
      walk(child, groupName || label);
    });
  }

  walk($('body').first(), null);
  return entries;
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Feeds werden ohne Abruf angelegt — bei 100 Feeds wäre eine Validierung im
// Request-Zyklus zu langsam. Der nachgelagerte Refresh füllt sie und markiert
// fehlerhafte Adressen wie gewohnt mit ⚠.
function importOpml(xml) {
  const entries = parseOpml(xml);
  if (!entries.length) throw new Error('In der Datei wurden keine Feeds gefunden.');

  const categoriesByName = new Map(
    store.getCategories().map((c) => [c.name.toLowerCase(), c])
  );

  let created = 0;
  let skipped = 0;
  let newCategories = 0;

  for (const entry of entries) {
    const channel = telegram.detectTelegramChannel(entry.xmlUrl);
    const rssUrl = channel ? telegram.channelWebviewUrl(channel) : entry.xmlUrl;
    if (!channel && !isHttpUrl(rssUrl)) {
      skipped += 1;
      continue;
    }
    if (store.getFeedByUrl(rssUrl)) {
      skipped += 1;
      continue;
    }

    const key = entry.categoryName.toLowerCase();
    let category = categoriesByName.get(key);
    if (!category) {
      category = store.createCategory(entry.categoryName.slice(0, 80));
      categoriesByName.set(key, category);
      newCategories += 1;
    }

    store.createFeed({
      categoryId: category.id,
      name: (entry.name || (channel ? `@${channel}` : new URL(rssUrl).hostname)).slice(0, 120),
      rssUrl,
      siteUrl: channel ? `https://t.me/${channel}` : (isHttpUrl(entry.htmlUrl) ? entry.htmlUrl : null),
      type: channel ? 'telegram' : 'rss',
    });
    created += 1;
  }

  return { feeds: created, skipped, categories: newCategories };
}

module.exports = { buildOpml, parseOpml, importOpml };
