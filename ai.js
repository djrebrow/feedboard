// ai.js — KI-Funktionen (Kurzfassung, Übersetzung, Briefing)
//
// Zwei Aufrufpfade: Anthropic über das eigene SDK — dort hängen „thinking" und
// der Aufwand-Regler mit drin — und alles andere über die OpenAI-kompatible
// Schnittstelle, die Groq, OpenRouter, Google AI Studio, Mistral, DeepSeek und
// lokale Server wie Ollama gleichermaßen sprechen. Welcher Anbieter gilt, steht
// im Zahnrad-Menü; die Liste selbst in public/providers.js.
//
// Ohne eingerichteten Zugang ist die ganze Datei ein No-op: isEnabled() liefert
// false, das Frontend blendet die Knöpfe aus, Feedboard läuft wie zuvor.
'use strict';

const { Anthropic } = require('@anthropic-ai/sdk');

const config = require('./config');
const { fehler } = require('./errors');

const ZEITLIMIT_MS = 120000;
const ZEITLIMIT_LISTE_MS = 15000;

function isEnabled() {
  return config.aiConfigured();
}

function requireConfigured() {
  if (!isEnabled()) {
    throw fehler('ai_not_configured', 'Die KI-Funktionen sind nicht eingerichtet — Anbieter oder Schlüssel fehlen (Zahnrad-Menü).');
  }
}

// ---------------------------------------------------------------------------
// Anbieter-Pfad 1: Anthropic
// ---------------------------------------------------------------------------

// Der Schlüssel ist im Menü änderbar. Der Client wird deshalb erst bei Bedarf
// gebaut und nur dann neu, wenn sich der Schlüssel tatsächlich geändert hat —
// so kostet der Normalfall nichts und ein Wechsel greift ohne Neustart.
let zwischenspeicher = { schluessel: '', client: null };

function anthropicClient() {
  const schluessel = config.aiApiKey();
  if (zwischenspeicher.schluessel !== schluessel) {
    zwischenspeicher = { schluessel, client: new Anthropic({ apiKey: schluessel }) };
  }
  return zwischenspeicher.client;
}

async function fragAnthropic({ system, prompt, maxTokens, effort }) {
  let response;
  try {
    response = await anthropicClient().messages.create({
      model: config.aiModel(),
      max_tokens: maxTokens,
      system,
      output_config: { effort },
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (error) {
    // Typisierte SDK-Fehler in verständliche Meldungen übersetzen
    if (error instanceof Anthropic.AuthenticationError) {
      throw fehler('ai_key_rejected', 'Der API-Schlüssel wurde abgelehnt.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw fehler('ai_rate_limited', 'Zu viele Anfragen — bitte kurz warten.');
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw fehler('ai_unreachable', 'Der KI-Dienst ist nicht erreichbar.');
    }
    if (error instanceof Anthropic.APIError) {
      throw fehler('ai_error', `KI-Dienst: ${error.message}`, { msg: error.message });
    }
    throw error;
  }

  if (response.stop_reason === 'refusal') {
    throw fehler('ai_refused', 'Die KI hat die Bearbeitung dieses Artikels abgelehnt.');
  }

  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Anbieter-Pfad 2: OpenAI-kompatibel
// ---------------------------------------------------------------------------

// Ein Aufruf gegen {basis}{pfad}. Ohne Schlüssel (eigener Server im Heimnetz)
// bleibt der Authorization-Kopf einfach weg.
async function rufe(pfad, { method = 'GET', body = null, timeout = ZEITLIMIT_MS } = {}) {
  const basis = config.aiBaseUrl();
  if (!basis) throw fehler('ai_no_base_url', 'Für diesen Anbieter fehlt die Basis-URL.');

  const schluessel = config.aiApiKey();
  let antwort;
  try {
    antwort = await fetch(`${basis}${pfad}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(schluessel ? { Authorization: `Bearer ${schluessel}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      throw fehler('ai_timeout', 'Der KI-Dienst hat nicht rechtzeitig geantwortet.');
    }
    throw fehler('ai_unreachable', 'Der KI-Dienst ist nicht erreichbar.');
  }

  const text = await antwort.text();
  let daten = null;
  try { daten = text ? JSON.parse(text) : null; } catch { /* kein JSON — Text bleibt */ }

  if (!antwort.ok) {
    const meldung = daten?.error?.message || daten?.message || text.slice(0, 200) || `HTTP ${antwort.status}`;
    if (antwort.status === 401 || antwort.status === 403) {
      throw fehler('ai_key_rejected', 'Der API-Schlüssel wurde abgelehnt.');
    }
    if (antwort.status === 429) {
      throw fehler('ai_rate_limited', 'Zu viele Anfragen — bitte kurz warten.');
    }
    if (antwort.status === 404) {
      throw fehler('ai_model_unknown', `Der Dienst kennt dieses Modell nicht: ${config.aiModel()}`, { model: config.aiModel() });
    }
    const raus = fehler('ai_error', `KI-Dienst: ${meldung}`, { msg: meldung });
    raus.status = antwort.status;
    raus.meldung = meldung;
    throw raus;
  }

  return daten ?? {};
}

async function fragOpenAiKompatibel({ system, prompt, maxTokens }) {
  const anfrage = {
    model: config.aiModel(),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  };

  let daten;
  try {
    daten = await rufe('/chat/completions', { method: 'POST', body: { ...anfrage, max_tokens: maxTokens } });
  } catch (error) {
    // Die neueren Denkmodelle von OpenAI lehnen max_tokens ab und wollen
    // max_completion_tokens. Der Name steht in der Fehlermeldung, also einmal
    // umbenennen und erneut fragen, statt den Benutzer damit zu behelligen.
    if (error?.status === 400 && /max_completion_tokens/.test(error.meldung || '')) {
      daten = await rufe('/chat/completions', { method: 'POST', body: { ...anfrage, max_completion_tokens: maxTokens } });
    } else {
      throw error;
    }
  }

  const wahl = daten.choices?.[0];
  if (wahl?.finish_reason === 'content_filter') {
    throw fehler('ai_refused', 'Die KI hat die Bearbeitung dieses Artikels abgelehnt.');
  }

  const inhalt = wahl?.message?.content;
  // Manche Dienste liefern statt eines Textes eine Liste von Blöcken.
  if (Array.isArray(inhalt)) {
    return inhalt.map((teil) => (typeof teil === 'string' ? teil : teil?.text || '')).join('').trim();
  }
  return String(inhalt ?? '').trim();
}

// ---------------------------------------------------------------------------
// Gemeinsamer Einstieg
// ---------------------------------------------------------------------------

// Ein Aufruf, ein Textergebnis. `effort` wirkt nur bei Anthropic, wo „thinking"
// standardmäßig anspringt — deshalb ist max_tokens großzügig, sonst bricht die
// Antwort mittendrin ab.
async function ask({ system, prompt, maxTokens = 2048, effort = 'low' }) {
  requireConfigured();

  const text = config.aiAnbieter().api === 'anthropic'
    ? await fragAnthropic({ system, prompt, maxTokens, effort })
    : await fragOpenAiKompatibel({ system, prompt, maxTokens });

  if (!text) throw fehler('ai_no_answer', 'Die KI hat keine Antwort geliefert.');
  return text;
}

// ---------------------------------------------------------------------------
// Modellliste des Anbieters
// ---------------------------------------------------------------------------
// Damit im Menü zur Auswahl steht, was der Anbieter tatsächlich anbietet, statt
// einer im Code gepflegten Liste, die immer ein halbes Jahr hinterherhinkt.

// Absichtlich ohne requireConfigured(): bei einem eigenen Endpunkt ist das
// Modell ja gerade das, was hier erst herausgefunden werden soll. Es genügt,
// was für den Aufruf nötig ist — Schlüssel bzw. Basis-URL.
async function listModels() {
  if (config.aiAnbieter().api === 'anthropic') {
    if (!config.aiApiKey()) {
      throw fehler('ai_not_configured', 'Die KI-Funktionen sind nicht eingerichtet — Anbieter oder Schlüssel fehlen (Zahnrad-Menü).');
    }
    const seiten = await anthropicClient().models.list({ limit: 100 })
      .catch((error) => {
        if (error instanceof Anthropic.AuthenticationError) {
          throw fehler('ai_key_rejected', 'Der API-Schlüssel wurde abgelehnt.');
        }
        throw fehler('ai_models_failed', 'Die Modellliste ließ sich nicht laden.', { msg: error.message });
      });
    return (seiten.data || []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
  }

  const daten = await rufe('/models', { timeout: ZEITLIMIT_LISTE_MS });
  const liste = Array.isArray(daten.data) ? daten.data : (Array.isArray(daten.models) ? daten.models : []);
  return liste
    .map((m) => {
      const id = typeof m === 'string' ? m : (m.id || m.name || '');
      return { id, name: (typeof m === 'object' && m.name && m.name !== id) ? `${m.name} (${id})` : id };
    })
    .filter((m) => m.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

const LANGUAGE_NAMES = { de: 'Deutsch', ru: 'Russisch', en: 'Englisch' };

function languageName(code) {
  return LANGUAGE_NAMES[code] || LANGUAGE_NAMES.de;
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
  if (!articles.length) throw fehler('briefing_no_articles', 'Es gibt keine ungelesenen Artikel für ein Briefing.');

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

module.exports = { isEnabled, summarize, translate, briefing, listModels, model: config.aiModel };
