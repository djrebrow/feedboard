// config.js — Optionale Zugänge, die im Zahnrad-Menü einrichtbar sind:
// Telegram, KI-Schlüssel und der Zeitplan fürs Briefing.
//
// Die Werte liegen in der settings-Tabelle. Die Umgebungsvariablen legen sie
// beim allerersten Start an; danach gilt, was im Menü gesetzt wurde — dasselbe
// Verhalten wie bei FEEDBOARD_PASSWORD. Wer wieder auf die Umgebung
// zurückwill, leert das Feld im Menü nicht, sondern löscht die Zeile aus der
// Datenbank; ein geleertes Feld ist eine bewusste Angabe und bleibt leer.
'use strict';

const store = require('./db');

const PRAEFIX = 'cfg_';

// Feldname → Umgebungsvariable, die den Startwert liefert
const FELDER = {
  telegram_bot_token: 'TELEGRAM_BOT_TOKEN',
  telegram_chat_id: 'TELEGRAM_CHAT_ID',
  anthropic_api_key: 'ANTHROPIC_API_KEY',
  anthropic_model: 'ANTHROPIC_MODEL',
  briefing_cron: 'BRIEFING_CRON',
  briefing_lang: 'BRIEFING_LANG',
  briefing_hours: 'BRIEFING_HOURS',
};

const NAMEN = Object.keys(FELDER);

// Beim ersten Start aus der Umgebung übernehmen. Ein bereits vorhandener
// Eintrag — auch ein leerer — bleibt unangetastet.
function seedFromEnv() {
  const uebernommen = [];
  for (const [name, envName] of Object.entries(FELDER)) {
    const wert = String(process.env[envName] ?? '').trim();
    if (!wert) continue;
    if (store.getSetting(PRAEFIX + name) !== null) continue;
    store.setSetting(PRAEFIX + name, wert);
    uebernommen.push(envName);
  }
  return uebernommen;
}

function get(name) {
  if (!NAMEN.includes(name)) throw new Error(`Unbekannte Einstellung: ${name}`);
  return String(store.getSetting(PRAEFIX + name, '') ?? '').trim();
}

// Leerer String heißt "bewusst nicht gesetzt" und wird als solcher gespeichert,
// nicht als NULL — sonst würde beim nächsten Start die Umgebung wieder greifen.
function set(name, wert) {
  if (!NAMEN.includes(name)) throw new Error(`Unbekannte Einstellung: ${name}`);
  store.setSetting(PRAEFIX + name, String(wert ?? '').trim());
}

// Übernimmt nur die tatsächlich mitgeschickten Felder. Fehlt ein Feld, bleibt
// es unverändert — so lässt sich der Zeitplan ändern, ohne den Bot-Token
// erneut eintippen zu müssen.
function setMany(werte) {
  const geaendert = [];
  for (const name of NAMEN) {
    if (!Object.prototype.hasOwnProperty.call(werte, name)) continue;
    if (werte[name] === null || werte[name] === undefined) continue;
    set(name, werte[name]);
    geaendert.push(name);
  }
  return geaendert;
}

// ---------------------------------------------------------------------------
// Geprüfte Einzelwerte
// ---------------------------------------------------------------------------

const SPRACHEN = ['de', 'en', 'ru'];

function briefingLang() {
  const wert = get('briefing_lang');
  return SPRACHEN.includes(wert) ? wert : 'de';
}

function briefingHours() {
  const stunden = Number(get('briefing_hours'));
  if (!Number.isInteger(stunden) || stunden < 1 || stunden > 168) return 24;
  return stunden;
}

function anthropicModel() {
  return get('anthropic_model') || 'claude-opus-5';
}

// Zeigt nur, ob und womit etwas eingerichtet ist — der Wert selbst verlässt
// den Server nie. Bei einem Tippfehler hilft der Hinweis beim Wiedererkennen.
function hinweis(wert) {
  if (!wert) return '';
  if (wert.length <= 4) return '····';
  return `····${wert.slice(-4)}`;
}

// Zustand für die Oberfläche: keine Geheimnisse, nur Belegung und Endziffern.
function publicState() {
  const token = get('telegram_bot_token');
  const schluessel = get('anthropic_api_key');
  return {
    telegram: {
      configured: !!(token && get('telegram_chat_id')),
      token_set: !!token,
      token_hint: hinweis(token),
      chat_id: get('telegram_chat_id'),
    },
    ai: {
      configured: !!schluessel,
      key_set: !!schluessel,
      key_hint: hinweis(schluessel),
      model: anthropicModel(),
    },
    briefing: {
      cron: get('briefing_cron'),
      lang: briefingLang(),
      hours: briefingHours(),
    },
  };
}

module.exports = {
  seedFromEnv,
  get,
  set,
  setMany,
  briefingLang,
  briefingHours,
  anthropicModel,
  publicState,
  FELDER,
};
