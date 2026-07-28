// ai.js — KI-Funktionen über die Claude API (Kurzfassung, Übersetzung, Briefing)
//
// Ohne ANTHROPIC_API_KEY ist die ganze Datei ein No-op: isEnabled() liefert
// false, das Frontend blendet die Knöpfe aus, Feedboard läuft wie zuvor.
'use strict';

const { Anthropic } = require('@anthropic-ai/sdk');

const config = require('./config');

// Der Schlüssel ist im Menü änderbar. Der Client wird deshalb erst bei Bedarf
// gebaut und nur dann neu, wenn sich der Schlüssel tatsächlich geändert hat —
// so kostet der Normalfall nichts und ein Wechsel greift ohne Neustart.
let zwischenspeicher = { schluessel: '', client: null };

function client() {
  const schluessel = config.get('anthropic_api_key');
  if (!schluessel) return null;
  if (zwischenspeicher.schluessel !== schluessel) {
    zwischenspeicher = { schluessel, client: new Anthropic({ apiKey: schluessel }) };
  }
  return zwischenspeicher.client;
}

function isEnabled() {
  return !!config.get('anthropic_api_key');
}

function requireClient() {
  const vorhanden = client();
  if (!vorhanden) throw new Error('Die KI-Funktionen sind nicht eingerichtet — Schlüssel fehlt (Zahnrad-Menü).');
  return vorhanden;
}

const LANGUAGE_NAMES = { de: 'Deutsch', ru: 'Russisch', en: 'Englisch' };

function languageName(code) {
  return LANGUAGE_NAMES[code] || LANGUAGE_NAMES.de;
}

// Ein Aufruf, ein Textergebnis. „thinking" bleibt an (Standard bei Opus 5) —
// dafür ist max_tokens großzügig, sonst bricht die Antwort mittendrin ab.
async function ask({ system, prompt, maxTokens = 2048, effort = 'low' }) {
  const anthropic = requireClient();
  let response;
  try {
    response = await anthropic.messages.create({
      model: config.anthropicModel(),
      max_tokens: maxTokens,
      system,
      output_config: { effort },
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (error) {
    // Typisierte SDK-Fehler in verständliche Meldungen übersetzen
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error('Der Claude-API-Schlüssel wurde abgelehnt.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error('Zu viele Anfragen an die Claude API — bitte kurz warten.');
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new Error('Die Claude API ist nicht erreichbar.');
    }
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Claude API: ${error.message}`);
    }
    throw error;
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('Die KI hat die Bearbeitung dieses Artikels abgelehnt.');
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('Die KI hat keine Antwort geliefert.');
  return text;
}

// Was von einem Artikel in den Prompt geht: Volltext, wenn geladen, sonst die
// Kurzfassung aus dem Feed.
function articleBody(article, limit = 12000) {
  const body = (article.content || article.summary || '').trim();
  return body.length > limit ? `${body.slice(0, limit)} …` : body;
}

// ---------------------------------------------------------------------------
// Kurzfassung
// ---------------------------------------------------------------------------

const SUMMARY_SYSTEM = `Du fasst Nachrichtenartikel für ein persönliches RSS-Dashboard zusammen.
Antworte mit höchstens drei kurzen Sätzen, je einer pro Zeile, ohne Aufzählungszeichen,
ohne Einleitung und ohne Überschrift. Schreibe in der Sprache des Artikels.
Nenne nur, was im Text steht — wenn die Angaben zu dünn sind, sage das in einem Satz.`;

async function summarize(article) {
  const body = articleBody(article);
  const prompt = [
    `Titel: ${article.title}`,
    article.feed_name ? `Quelle: ${article.feed_name}` : null,
    '',
    body || '(kein Text vorhanden — fasse nur den Titel ein)',
  ].filter(Boolean).join('\n');

  return ask({ system: SUMMARY_SYSTEM, prompt, maxTokens: 2048 });
}

// ---------------------------------------------------------------------------
// Übersetzung
// ---------------------------------------------------------------------------

async function translate(article, targetLang) {
  const language = languageName(targetLang);
  const system = `Du übersetzt Nachrichtentexte nach ${language}.
Gib ausschließlich die Übersetzung aus — keine Vorbemerkung, keine Anmerkungen,
keine Wiederholung des Originals. Behalte Absätze bei. Eigennamen, Produktnamen
und Firmennamen bleiben unverändert.`;

  const body = articleBody(article);
  const prompt = [article.title, '', body].filter(Boolean).join('\n');

  return ask({ system, prompt, maxTokens: 8192 });
}

// ---------------------------------------------------------------------------
// Tages-Briefing über die ungelesenen Artikel
// ---------------------------------------------------------------------------

const BRIEFING_SYSTEM = `Du schreibst ein kurzes tägliches Nachrichten-Briefing aus einer
Liste ungelesener Schlagzeilen. Fasse nach Themen zusammen, nicht nach Quellen: Meldungen
zum selben Vorgang gehören in einen Absatz. Nenne pro Thema die wichtigsten Punkte in ein
bis zwei Sätzen und dahinter die Quellen in Klammern.
Beginne jedes Thema mit einer kurzen Überschrift in einer eigenen Zeile, der ein „#" vorangeht.
Höchstens sechs Themen, das Wichtigste zuerst. Kein Vorwort, kein Schlusswort.
Schreibe auf {{LANG}}.`;

async function briefing(articles, lang = 'de') {
  if (!articles.length) throw new Error('Es gibt keine ungelesenen Artikel für ein Briefing.');

  const lines = articles.slice(0, 120).map((a) => {
    const summary = (a.summary || '').replace(/\s+/g, ' ').slice(0, 220);
    return `- [${a.category_name} / ${a.feed_name}] ${a.title}${summary ? ` — ${summary}` : ''}`;
  });

  return ask({
    system: BRIEFING_SYSTEM.replace('{{LANG}}', languageName(lang)),
    prompt: lines.join('\n'),
    maxTokens: 16000,
    effort: 'medium',
  });
}

module.exports = { isEnabled, summarize, translate, briefing, model: config.anthropicModel };
