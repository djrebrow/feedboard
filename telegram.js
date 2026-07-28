// telegram.js — Öffentliche Telegram-Kanäle über die Web-Vorschau (t.me/s/<kanal>) parsen
// Ansatz übernommen von infomate.club: die ö­ffentliche Vorschauseite scrapen.
'use strict';

const { load } = require('cheerio');

const WEBVIEW_PREFIX = 'https://t.me/s/';
const REQUEST_TIMEOUT_MS = 15000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// t.me-Pfade, die keine Kanäle sind
const RESERVED = new Set([
  'joinchat', 'addstickers', 'addemoji', 'addtheme', 'proxy', 'socks',
  'share', 'setlanguage', 'iv', 'login', 'bg', 'c', 'contact',
]);

// Kanalname aus verschiedenen Eingaben ableiten: @kanal, t.me/kanal, t.me/s/kanal, telegram.me/kanal
function detectTelegramChannel(input) {
  const raw = String(input || '').trim();

  const handle = raw.match(/^@([A-Za-z][A-Za-z0-9_]{3,31})$/);
  if (handle) return handle[1];

  const link = raw.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\/(?:s\/)?([A-Za-z][A-Za-z0-9_]{3,31})(?:\/\d+)?(?:[/?#].*)?$/i
  );
  if (link && !RESERVED.has(link[1].toLowerCase())) return link[1];

  return null;
}

function channelWebviewUrl(channel) {
  return WEBVIEW_PREFIX + channel;
}

// Kanalname aus einer gespeicherten t.me/s/-URL zurückgewinnen
function channelFromWebviewUrl(url) {
  const match = String(url || '').match(/t\.me\/s\/([A-Za-z][A-Za-z0-9_]{3,31})/i);
  return match ? match[1] : null;
}

// HTML des Nachrichtentexts in reinen Text mit erhaltenen Zeilenumbrüchen wandeln
function extractText(html) {
  if (!html) return '';
  const withBreaks = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div)>/gi, '\n');
  const text = load(`<x>${withBreaks}</x>`)('x').text(); // dekodiert Entities, entfernt Tags
  return text
    .replace(/\r/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

function extractPhoto($, messageEl) {
  const selectors = [
    '.tgme_widget_message_photo_wrap',
    '.tgme_widget_message_video_thumb',
    '.tgme_widget_message_roundvideo_thumb',
  ];
  for (const selector of selectors) {
    const el = $(selector, messageEl).first();
    if (!el.length) continue;
    const style = el.attr('style') || '';
    const match = style.match(/url\(['"]?(https:\/\/[^'")]+)['"]?\)/i);
    if (match) return match[1];
  }
  return null;
}

async function fetchTelegramChannel(channel) {
  const url = channelWebviewUrl(channel);
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new Error(`Telegram-Kanal nicht erreichbar (HTTP ${response.status}).`);
  }
  const html = await response.text();
  const $ = load(html);

  const title =
    $('.tgme_channel_info_header_title').first().text().trim() ||
    $('.tgme_header_title').first().text().trim() ||
    `@${channel}`;

  const messages = [];
  $('.tgme_widget_message').each((_, node) => {
    const messageEl = $(node);

    const textEl = $('.tgme_widget_message_text', messageEl).first();
    const text = textEl.length ? extractText($.html(textEl)) : '';

    const photo = extractPhoto($, messageEl);

    const dateEl = $('.tgme_widget_message_date', messageEl).first();
    const dataPost = messageEl.attr('data-post');
    const messageUrl = dateEl.attr('href') || (dataPost ? `https://t.me/${dataPost}` : null);

    const datetime = $('time', dateEl).attr('datetime');
    let createdAt = null;
    if (datetime) {
      const timestamp = Date.parse(datetime);
      if (!Number.isNaN(timestamp)) createdAt = new Date(timestamp).toISOString();
    }

    // Nachrichten ohne Inhalt (z. B. reine Service-Meldungen) überspringen
    if (!text && !photo) return;

    messages.push({ url: messageUrl, text, photo, createdAt });
  });

  return { url, title, channel, messages };
}

// ---------------------------------------------------------------------------
// Artikel an den eigenen Telegram-Chat schicken (Bot API)
// ---------------------------------------------------------------------------

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

function canShare() {
  return !!(BOT_TOKEN && CHAT_ID);
}

const MAX_MESSAGE_CHARS = 4096;

// Bewusst ohne parse_mode: dann muss nichts escapt werden und Telegram
// verlinkt nackte URLs von selbst.
async function sendOne(text, { preview = true } = {}) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: text.slice(0, MAX_MESSAGE_CHARS),
      disable_web_page_preview: !preview,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok !== true) {
    const reason = data && data.description ? data.description : `HTTP ${response.status}`;
    throw new Error(`Telegram hat die Nachricht abgelehnt: ${reason}`);
  }
  return { ok: true };
}

// Teilt zu lange Texte auf statt sie abzuschneiden. Getrennt wird möglichst
// an Absätzen, sonst an Zeilen, sonst hart — ein Briefing ist regelmäßig
// länger als die 4096 Zeichen, die Telegram je Nachricht zulässt.
function splitMessage(text, limit = MAX_MESSAGE_CHARS) {
  const rest = String(text || '').trim();
  if (rest.length <= limit) return rest ? [rest] : [];

  // Eine Trennstelle gilt als brauchbar, wenn sie nicht im ersten Drittel
  // liegt — sonst entstehen Schnipsel. Ist keine brauchbar, wird hart getrennt.
  const mindestens = limit * 0.3;
  const stuecke = [];
  let offen = rest;
  while (offen.length > limit) {
    const fenster = offen.slice(0, limit);
    const schnitt = ['\n\n', '\n', ' ']
      .map((trenner) => fenster.lastIndexOf(trenner))
      .find((pos) => pos >= mindestens) ?? limit;
    stuecke.push(offen.slice(0, schnitt).trim());
    offen = offen.slice(schnitt).trim();
  }
  if (offen) stuecke.push(offen);
  return stuecke;
}

async function sendText(text, { preview = false } = {}) {
  if (!canShare()) {
    throw new Error('Das Teilen ist nicht eingerichtet (TELEGRAM_BOT_TOKEN und TELEGRAM_CHAT_ID fehlen).');
  }
  const stuecke = splitMessage(text);
  if (!stuecke.length) throw new Error('Es gibt nichts zu senden.');
  for (const stueck of stuecke) await sendOne(stueck, { preview });
  return { ok: true, parts: stuecke.length };
}

async function shareArticle({ title, link, summary, feedName }) {
  if (!canShare()) {
    throw new Error('Das Teilen ist nicht eingerichtet (TELEGRAM_BOT_TOKEN und TELEGRAM_CHAT_ID fehlen).');
  }

  const parts = [String(title || '').trim()];
  if (feedName) parts.push(`(${feedName})`);
  const text = [
    parts.join(' '),
    summary ? `\n${String(summary).slice(0, 600)}` : '',
    link ? `\n${link}` : '',
  ].join('').trim();

  return sendOne(text, { preview: true });
}

module.exports = {
  detectTelegramChannel,
  channelWebviewUrl,
  channelFromWebviewUrl,
  fetchTelegramChannel,
  canShare,
  shareArticle,
  sendText,
  splitMessage,
};
