// extract.js — Volltext aus einer Artikelseite ziehen (eigene Heuristik)
//
// Bewusst ohne Readability/jsdom: cheerio ist ohnehin schon für Telegram an
// Bord, und der Rest ist Punktevergabe nach Textmenge und Link-Dichte. Trifft
// die gängigen News-Layouts, aber nicht jede Seite — deshalb liefert die
// Funktion lieber nichts als Navigationsmüll.
'use strict';

const { load } = require('cheerio');

const REQUEST_TIMEOUT_MS = 20000;
const MAX_HTML_BYTES = 3_000_000;
const MAX_TEXT_CHARS = 30000;
const MIN_TEXT_CHARS = 250;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Alles, was nie zum Artikeltext gehört
const JUNK_SELECTORS = [
  'script', 'style', 'noscript', 'template', 'svg', 'iframe', 'form', 'button',
  'nav', 'header', 'footer', 'aside',
  '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
  '[aria-hidden="true"]', '[hidden]',
];

// Klassen-/ID-Namen, die typischerweise Beiwerk markieren
const JUNK_PATTERN = /(^|[-_ ])(nav|menu|sidebar|comment|kommentar|share|social|teilen|related|promo|werbung|advert|banner|newsletter|paywall|cookie|consent|breadcrumb|pagination|footer|header|meta|byline|author|autor|profile|profil|tags?)([-_ ]|$)/i;

// Klassen-/ID-Namen, die auf den eigentlichen Inhalt hindeuten
const CONTENT_PATTERN = /(^|[-_ ])(article|articlebody|content|entry|post|story|text|main|body|beitrag|inhalt)([-_ ]|$)/i;

const BLOCK_TAGS = 'p, h2, h3, h4, li, blockquote, pre';

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/ /g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function identity($, el) {
  const node = $(el);
  return `${node.attr('class') || ''} ${node.attr('id') || ''}`;
}

// Verhältnis von verlinktem zu gesamtem Text — Navigationsblöcke liegen hoch
function linkDensity($, el) {
  const total = normalizeWhitespace($(el).text()).length;
  if (!total) return 1;
  const linked = normalizeWhitespace($('a', el).text()).length;
  return linked / total;
}

function scoreCandidate($, el) {
  const text = normalizeWhitespace($(el).text());
  if (text.length < MIN_TEXT_CHARS) return -1;

  const paragraphs = $('p', el).filter((_, p) => normalizeWhitespace($(p).text()).length > 60).length;
  const density = linkDensity($, el);
  if (density > 0.5) return -1;

  let score = text.length * (1 - density) + paragraphs * 120;

  const marker = identity($, el);
  if (CONTENT_PATTERN.test(marker)) score *= 1.35;
  if (JUNK_PATTERN.test(marker)) score *= 0.3;
  if (el.tagName === 'article') score *= 1.5;
  if (el.tagName === 'main') score *= 1.2;

  return score;
}

// Aus dem Gewinnerblock lesbare Absätze bauen; fällt auf den reinen Text
// zurück, wenn die Seite ohne <p> auskommt.
function blocksToText($, el) {
  const parts = [];
  $(BLOCK_TAGS, el).each((_, node) => {
    // Verschachtelte Blöcke (z. B. <p> in <li>) nicht doppelt aufnehmen
    if ($(node).parents(BLOCK_TAGS).length) return;
    const text = normalizeWhitespace($(node).text());
    if (text.length < 25) return;
    parts.push(node.tagName === 'li' ? `• ${text}` : text);
  });

  const joined = parts.join('\n\n');
  if (joined.length >= MIN_TEXT_CHARS) return joined;
  return normalizeWhitespace($(el).text());
}

function extractFromHtml(html, baseUrl) {
  const $ = load(html);

  for (const selector of JUNK_SELECTORS) $(selector).remove();
  $('*').filter((_, el) => JUNK_PATTERN.test(identity($, el))).remove();

  let best = null;
  let bestScore = 0;
  $('article, main, section, div, td').each((_, el) => {
    const score = scoreCandidate($, el);
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  });

  if (!best) return null;

  // Bei gleichwertigem Elternelement lieber den engeren Block nehmen —
  // sonst gewinnt oft der Seitencontainer.
  const text = blocksToText($, best);
  if (text.length < MIN_TEXT_CHARS) return null;

  const title =
    normalizeWhitespace($('meta[property="og:title"]').attr('content')) ||
    normalizeWhitespace($('h1').first().text()) ||
    normalizeWhitespace($('title').first().text()) ||
    null;

  let image = normalizeWhitespace($('meta[property="og:image"]').attr('content')) || null;
  if (image) {
    try {
      image = new URL(image, baseUrl).toString();
    } catch {
      image = null;
    }
  }

  return {
    title,
    image,
    text: text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)} …` : text,
  };
}

async function fetchArticleText(url) {
  const target = new URL(String(url));
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('Nur http- und https-Adressen werden unterstützt.');
  }

  const response = await fetch(target.toString(), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`Seite nicht erreichbar (HTTP ${response.status}).`);

  const type = response.headers.get('content-type') || '';
  if (type && !/text\/html|application\/xhtml/i.test(type)) {
    throw new Error('Die Adresse liefert kein HTML.');
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_HTML_BYTES) throw new Error('Die Seite ist zu groß.');
  const html = new TextDecoder('utf-8').decode(buffer);

  const result = extractFromHtml(html, response.url || target.toString());
  if (!result) throw new Error('Auf dieser Seite wurde kein Artikeltext gefunden.');
  return result;
}

module.exports = { fetchArticleText, extractFromHtml };
