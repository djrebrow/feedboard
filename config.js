// config.js — Optionale Zugänge, die im Zahnrad-Menü einrichtbar sind:
// Telegram, KI-Anbieter samt Schlüssel und der Zeitplan fürs Briefing.
//
// Die Werte liegen in der settings-Tabelle. Die Umgebungsvariablen legen sie
// beim allerersten Start an; danach gilt, was im Menü gesetzt wurde — dasselbe
// Verhalten wie bei FEEDBOARD_PASSWORD. Wer wieder auf die Umgebung
// zurückwill, leert das Feld im Menü nicht, sondern löscht die Zeile aus der
// Datenbank; ein geleertes Feld ist eine bewusste Angabe und bleibt leer.
'use strict';

const store = require('./db');
const providers = require('./public/providers');
const schedule = require('./public/schedule');

const PRAEFIX = 'cfg_';

// Feldname → Umgebungsvariable, die den Startwert liefert.
// Die Schlüssel der KI-Anbieter kommen aus der gemeinsamen Anbieterliste, damit
// ein neuer Anbieter dort nur an einer Stelle eingetragen werden muss.
const FELDER = {
  telegram_bot_token: 'TELEGRAM_BOT_TOKEN',
  telegram_chat_id: 'TELEGRAM_CHAT_ID',
  ai_provider: 'AI_PROVIDER',
  ai_model: 'AI_MODEL',
  ai_base_url: 'AI_BASE_URL',
  briefing_time: 'BRIEFING_TIME',
  briefing_days: 'BRIEFING_DAYS',
  briefing_lang: 'BRIEFING_LANG',
  briefing_hours: 'BRIEFING_HOURS',
};

for (const anbieter of providers.ANBIETER) {
  if (anbieter.eigeneUrl) continue; // dort steckt der Zugang in der Basis-URL
  FELDER[providers.schluesselFeld(anbieter.id)] = anbieter.env;
}

const NAMEN = Object.keys(FELDER);

// ---------------------------------------------------------------------------
// Übernahme aus älteren Ständen
// ---------------------------------------------------------------------------
// Früher gab es nur Claude (cfg_anthropic_api_key, cfg_anthropic_model) und der
// Zeitplan lag als cron-Ausdruck in cfg_briefing_cron. Beides wird einmalig
// übernommen und danach entfernt, damit nicht zwei Wahrheiten nebeneinander
// stehen. Gibt zurück, was zu melden ist.
function migrateLegacy() {
  const meldungen = [];

  const umbenennen = (alt, neu) => {
    const wert = store.getSetting(PRAEFIX + alt);
    if (wert === null) return;
    if (store.getSetting(PRAEFIX + neu) === null) store.setSetting(PRAEFIX + neu, wert);
    store.deleteSetting(PRAEFIX + alt);
  };

  const hatteSchluessel = store.getSetting('cfg_anthropic_api_key') !== null;
  umbenennen('anthropic_api_key', providers.schluesselFeld('anthropic'));
  umbenennen('anthropic_model', 'ai_model');
  // Wer bisher Claude genutzt hat, soll das auch danach tun.
  if (hatteSchluessel && store.getSetting(`${PRAEFIX}ai_provider`) === null) {
    store.setSetting(`${PRAEFIX}ai_provider`, 'anthropic');
  }

  const altCron = store.getSetting('cfg_briefing_cron');
  if (altCron !== null) {
    const zerlegt = schedule.ausCron(altCron);
    if (zerlegt) {
      if (store.getSetting(`${PRAEFIX}briefing_time`) === null) {
        store.setSetting(`${PRAEFIX}briefing_time`, zerlegt.zeit);
        store.setSetting(`${PRAEFIX}briefing_days`, zerlegt.tage.join(','));
      }
    } else if (String(altCron).trim()) {
      // Ausdrücke wie "*/15 * * * *" lassen sich nicht als Uhrzeit abbilden.
      // Stillschweigend etwas anderes einzuplanen wäre schlimmer als aus.
      meldungen.push(`Alter Briefing-Zeitplan "${altCron}" passt nicht in Uhrzeit + Wochentage — Briefing bleibt aus.`);
    }
    store.deleteSetting('cfg_briefing_cron');
  }

  return meldungen;
}

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

  // Aus der Zeit, als es nur Claude gab. Bleibt gültig, damit bestehende
  // .env-Dateien nicht brechen.
  const envModell = String(process.env.ANTHROPIC_MODEL ?? '').trim();
  if (envModell && store.getSetting(`${PRAEFIX}ai_model`) === null) {
    store.setSetting(`${PRAEFIX}ai_model`, envModell);
    uebernommen.push('ANTHROPIC_MODEL');
  }

  // BRIEFING_CRON gibt es weiter, damit bestehende .env-Dateien nicht brechen —
  // umgerechnet, nicht gespeichert.
  const envCron = String(process.env.BRIEFING_CRON ?? '').trim();
  if (envCron && store.getSetting(`${PRAEFIX}briefing_time`) === null) {
    const zerlegt = schedule.ausCron(envCron);
    if (zerlegt) {
      store.setSetting(`${PRAEFIX}briefing_time`, zerlegt.zeit);
      store.setSetting(`${PRAEFIX}briefing_days`, zerlegt.tage.join(','));
      uebernommen.push('BRIEFING_CRON');
    }
  }

  // Ein Schlüssel ohne gewählten Anbieter wäre wirkungslos: den ersten
  // belegten Anbieter übernehmen.
  if (store.getSetting(`${PRAEFIX}ai_provider`) === null) {
    const belegt = providers.ANBIETER.find((a) => !a.eigeneUrl && get(providers.schluesselFeld(a.id)));
    if (belegt) store.setSetting(`${PRAEFIX}ai_provider`, belegt.id);
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

function briefingTime() {
  return schedule.normalisiereZeit(get('briefing_time'));
}

// Ohne ausdrückliche Tagesauswahl gilt: jeden Tag. Sonst hinge an einer
// gesetzten Uhrzeit ein Briefing, das nie liefe.
function briefingDays() {
  const tage = schedule.normalisiereTage(get('briefing_days'));
  return tage.length ? tage : [0, 1, 2, 3, 4, 5, 6];
}

// Der cron-Ausdruck entsteht nur hier und nur fürs Einplanen.
function briefingCron() {
  return schedule.zuCron({ zeit: briefingTime(), tage: briefingDays() });
}

// ---------------------------------------------------------------------------
// KI-Anbieter
// ---------------------------------------------------------------------------

function aiProvider() {
  const id = get('ai_provider');
  return providers.istBekannt(id) ? id : 'anthropic';
}

function aiAnbieter() {
  return providers.anbieter(aiProvider());
}

function aiApiKey(id = aiProvider()) {
  const anbieter = providers.anbieter(id);
  if (anbieter.eigeneUrl) return '';
  return get(providers.schluesselFeld(anbieter.id));
}

// Bei „Eigene Basis-URL" kommt sie vom Benutzer, sonst steht sie in der Liste.
function aiBaseUrl() {
  const anbieter = aiAnbieter();
  const url = anbieter.eigeneUrl ? get('ai_base_url') : anbieter.base;
  return url.replace(/\/+$/, '');
}

function aiModel() {
  return get('ai_model') || aiAnbieter().standard;
}

// Eingerichtet heißt: es gibt etwas anzusprechen. Ein eigener Endpunkt im
// Heimnetz braucht dafür keinen Schlüssel, ein bezahlter Dienst schon.
function aiConfigured() {
  const anbieter = aiAnbieter();
  if (anbieter.eigeneUrl) return !!(aiBaseUrl() && aiModel());
  return !!aiApiKey();
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

  // Damit im Menü sichtbar ist, für welche Anbieter schon ein Schlüssel liegt.
  const schluessel = {};
  for (const anbieter of providers.ANBIETER) {
    if (anbieter.eigeneUrl) continue;
    const wert = aiApiKey(anbieter.id);
    schluessel[anbieter.id] = { set: !!wert, hint: hinweis(wert) };
  }

  return {
    telegram: {
      configured: !!(token && get('telegram_chat_id')),
      token_set: !!token,
      token_hint: hinweis(token),
      chat_id: get('telegram_chat_id'),
    },
    ai: {
      configured: aiConfigured(),
      provider: aiProvider(),
      providers: providers.ANBIETER.map((a) => ({
        id: a.id,
        name: a.name,
        base: a.base,
        eigene_url: !!a.eigeneUrl,
      })),
      keys: schluessel,
      key_set: !!aiApiKey(),
      key_hint: hinweis(aiApiKey()),
      base_url: get('ai_base_url'),
      model: aiModel(),
    },
    briefing: {
      time: briefingTime(),
      days: briefingTime() ? briefingDays() : [],
      lang: briefingLang(),
      hours: briefingHours(),
    },
  };
}

module.exports = {
  migrateLegacy,
  seedFromEnv,
  get,
  set,
  setMany,
  briefingLang,
  briefingHours,
  briefingTime,
  briefingDays,
  briefingCron,
  aiProvider,
  aiAnbieter,
  aiApiKey,
  aiBaseUrl,
  aiModel,
  aiConfigured,
  publicState,
  FELDER,
};
