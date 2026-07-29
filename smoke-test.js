// smoke-test.js — Frontend-Smoke-Test mit jsdom (nur für Entwicklung, nicht Teil der App)
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
const scheduleJs = fs.readFileSync(path.join(__dirname, 'public', 'schedule.js'), 'utf8');
const providersJs = fs.readFileSync(path.join(__dirname, 'public', 'providers.js'), 'utf8');

// Die Wörterbücher liegen seit dem i18n-Umbau als eigene Dateien und werden
// zur Laufzeit geholt — der Test muss sie also ausliefern können.
function i18nAntwort(url) {
  const treffer = String(url).match(/i18n\/(\w+)\.json/);
  if (!treffer) return null;
  const datei = path.join(__dirname, 'public', 'i18n', `${treffer[1]}.json`);
  if (!fs.existsSync(datei)) return { ok: false, status: 404, json: async () => ({}) };
  const inhalt = JSON.parse(fs.readFileSync(datei, 'utf8'));
  return { ok: true, status: 200, json: async () => inhalt };
}

const boardData = {
  categories: [
    {
      id: 1,
      name: 'Tech <script>alert(1)</script>',
      slug: 'tech',
      feeds: [
        {
          id: 10,
          name: 'heise online',
          rss_url: 'https://www.heise.de/rss/heise-atom.xml',
          site_url: 'https://www.heise.de',
          last_fetched_at: '2026-07-23 10:00:00',
          last_error: null,
          articles: Array.from({ length: 12 }, (_, i) => ({
            id: 100 + i,
            title: `Artikel ${i + 1} über "Dinge" & <b>mehr</b>`,
            link: 'https://www.heise.de/news/' + (i + 1),
            summary: i % 2 === 0 ? `Kurzfassung ${i + 1} mit Umlauten: äöüß` : null,
            published_at: '2026-07-23T0' + (i % 9) + ':00:00.000Z',
            fetched_at: '2026-07-23 10:00:00',
          })),
        },
        {
          id: 11,
          name: 'Kaputter Feed',
          rss_url: 'https://example.org/rss',
          site_url: 'https://example.org',
          last_fetched_at: '2026-07-23 10:00:00',
          last_error: 'Status code 404',
          enabled: false,
          error_count: 21,
          articles: [],
        },
      ],
    },
  ],
  refreshing: false,
  fetch_interval_minutes: 30,
  features: { ai: true, telegram_share: true, auth: true },
  authenticated: true,
};

// Antwort von /api/settings/integrations — werktags 6:30
const integrationsData = {
  telegram: { configured: true, token_set: true, token_hint: '····1234', chat_id: '-100999' },
  ai: {
    configured: true,
    provider: 'anthropic',
    providers: [
      { id: 'anthropic', name: 'Anthropic (Claude)', base: 'https://api.anthropic.com/v1', eigene_url: false },
      { id: 'groq', name: 'Groq', base: 'https://api.groq.com/openai/v1', eigene_url: false },
      { id: 'custom', name: 'Eigene Basis-URL', base: '', eigene_url: true },
    ],
    keys: { anthropic: { set: true, hint: '····abcd' }, groq: { set: false, hint: '' } },
    key_set: true,
    key_hint: '····abcd',
    base_url: '',
    model: 'claude-opus-5',
  },
  briefing: { time: '06:30', days: [1, 2, 3, 4, 5], lang: 'de', hours: 24 },
  schedule: { active: true, time: '06:30', days: [1, 2, 3, 4, 5], cron: '30 6 * * 1,2,3,4,5' },
  timezone: 'Europe/Berlin',
};

const healthData = {
  auto_disable_after: 20,
  feeds: [
    { id: 10, name: 'heise online', category_name: 'Technik', enabled: true, error_count: 0, last_error: null,
      last_fetched_at: null, not_modified_count: 3, conditional: true, articles: 30, unread: 5, per_week: 21 },
    { id: 11, name: 'Kaputt', category_name: 'Technik', enabled: true, error_count: 2, last_error: 'HTTP 404 Not Found',
      last_fetched_at: null, not_modified_count: 0, conditional: false, articles: 0, unread: 0, per_week: 0 },
    { id: 12, name: 'Abgeschaltet', category_name: 'Welt', enabled: false, error_count: 20, last_error: 'timeout',
      last_fetched_at: null, not_modified_count: 0, conditional: false, articles: 4, unread: 0, per_week: 0 },
  ],
};

const rulesData = {
  fields: ['title', 'summary', 'any'],
  actions: ['read', 'star', 'hide'],
  rules: [
    { id: 1, feed_id: null, feed_name: null, field: 'title', pattern: 'Gewinnspiel', action: 'read', enabled: true, hits: 4 },
    { id: 2, feed_id: 10, feed_name: 'heise online', field: 'any', pattern: 'Wochenrueckblick', action: 'hide', enabled: false, hits: 0 },
  ],
};

async function run() {
  const dom = new JSDOM(html, {
    url: 'http://localhost:8321/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // Browser-APIs mocken, die jsdom nicht mitbringt
  // Die Systemeinstellung ist über systemDark/fireMediaChange steuerbar (Theme-Test)
  let systemDark = false;
  const mediaListeners = [];
  const fireMediaChange = () => mediaListeners.forEach((fn) => fn({ matches: systemDark }));
  window.matchMedia = (query) => ({
    get matches() { return String(query).includes('dark') ? systemDark : false; },
    addEventListener(type, fn) { if (type === 'change') mediaListeners.push(fn); },
    removeEventListener() {},
  });
  window.fetch = async (url) => {
    const sprache = i18nAntwort(url);
    if (sprache) return sprache;
    if (String(url).includes('/api/board')) {
      return { ok: true, status: 200, json: async () => structuredClone(boardData) };
    }
    if (String(url).includes('/api/settings/integrations')) {
      return { ok: true, status: 200, json: async () => structuredClone(integrationsData) };
    }
    if (String(url).includes('/api/feeds/health')) {
      return { ok: true, status: 200, json: async () => structuredClone(healthData) };
    }
    if (String(url).includes('/api/rules')) {
      return { ok: true, status: 200, json: async () => structuredClone(rulesData) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.error || e.message));

  // Sprache festnageln: seit der Browsererkennung würde jsdom sonst Englisch
  // wählen und alle Textprüfungen unten hingen an der Laune der Umgebung.
  window.localStorage.setItem('feedboard-lang', 'de');

  // app.js im Fenster-Kontext ausführen (schedule.js zuerst, app.js braucht es)
  window.eval(scheduleJs);
  window.eval(providersJs);
  window.eval(appJs);

  // Sprachdatei und loadBoard sind async — kurz warten
  await new Promise((r) => setTimeout(r, 150));

  const doc = window.document;
  const results = [];
  const check = (label, condition) => {
    results.push(`${condition ? 'OK  ' : 'FEHLT'} ${label}`);
    if (!condition) process.exitCode = 1;
  };

  check('Keine JS-Fehler beim Init', errors.length === 0);
  check('Rubrik-Kachel auf der Startseite', !!doc.querySelector('.category-tile[data-category-id="1"]'));
  check('XSS im Rubriknamen escaped', !doc.querySelector('.category-tile-name script') && doc.querySelector('.category-tile-name').textContent.includes('<script>'));

  // In die Rubrik wechseln — Feeds und Artikel gibt es nur in der Detailansicht
  doc.querySelector('.category-tile[data-category-id="1"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));

  check('Rubrik-Detailansicht geöffnet', !!doc.querySelector('.category-open[data-category-id="1"]'));
  check('Feed gerendert', !!doc.querySelector('.feed[data-feed-id="10"]'));
  check('Fehler-Badge bei kaputtem Feed', !!doc.querySelector('.feed[data-feed-id="11"] .feed-error'));
  check('Nur 8 Artikel sichtbar (von 12)', doc.querySelectorAll('.feed[data-feed-id="10"] .article').length === 8);
  check('"+4 weitere anzeigen"-Button', doc.querySelector('.articles-more')?.textContent.includes('4'));
  check('Kurzfassung im DOM (escaped)', doc.querySelector('.article-summary')?.textContent.includes('äöüß'));
  check('Datum im Masthead gesetzt', doc.getElementById('today-date').textContent.length > 5);

  // Edit-Mode aktivieren
  doc.getElementById('btn-edit').dispatchEvent(new window.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  check('Edit-Mode: body-Klasse gesetzt', doc.body.classList.contains('edit-mode'));
  check('Edit-Mode: Edit-Leiste sichtbar', !doc.getElementById('edit-bar').classList.contains('hidden'));
  check('Edit-Mode: Feed-Hinzufügen-Formular vorhanden', !!doc.querySelector('.feed-add-form'));

  // "Mehr anzeigen" klicken
  doc.getElementById('btn-edit').dispatchEvent(new window.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  doc.querySelector('.articles-more').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  check('"Mehr anzeigen": alle 12 Artikel sichtbar', doc.querySelectorAll('.feed[data-feed-id="10"] .article').length === 12);

  // Neue Funktionen: Pause-Anzeige, Artikel-Aktionen, „Alle Artikel", Tastatur
  check('Pausierter Feed ist markiert', !!doc.querySelector('.feed[data-feed-id="11"].feed-paused .paused-badge'));
  check('Pause-Knopf im Feed-Werkzeug', !!doc.querySelector('.feed[data-feed-id="11"] [data-action="feed-toggle-enabled"]'));
  check('Artikel-Aktionen vorhanden', !!doc.querySelector('.article[data-article-id="100"] [data-action="article-fulltext"]'));
  check('KI-Aktionen bei aktiver Funktion', !!doc.querySelector('.article[data-article-id="100"] [data-action="article-ai-summary"]'));
  check('Teilen-Aktion bei aktiver Funktion', !!doc.querySelector('.article[data-article-id="100"] [data-action="article-share"]'));
  check('Zahnrad: KI-Bereich sichtbar', !doc.getElementById('settings-ai').hidden);
  check('Zugang: angemeldet → Abmelden und Passwort ändern',
    !doc.getElementById('btn-logout').hidden
    && !doc.getElementById('btn-password').hidden
    && doc.getElementById('btn-login').hidden);
  check('Zugang: Knopf heißt „Passwort ändern"', doc.getElementById('btn-password').textContent.includes('ändern'));
  check('Tastaturübersicht gefüllt', doc.querySelectorAll('#shortcut-list .shortcut').length >= 8);

  // j wählt den ersten Artikel aus, k geht wieder zurück
  const pressKey = (key) => doc.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  pressKey('j');
  check('Tastatur: j wählt einen Artikel', !!doc.querySelector('.article.selected'));
  const firstSelected = doc.querySelector('.article.selected').dataset.articleId;
  pressKey('j');
  check('Tastatur: j springt weiter', doc.querySelector('.article.selected').dataset.articleId !== firstSelected);
  pressKey('k');
  check('Tastatur: k springt zurück', doc.querySelector('.article.selected').dataset.articleId === firstSelected);

  // „Alle Artikel" — chronologischer Strom über alle Rubriken
  doc.getElementById('btn-river').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  check('Alle Artikel: Liste gerendert', doc.querySelectorAll('.search-results .search-result').length === 12);
  check('Alle Artikel: neuester Artikel oben',
    doc.querySelector('.search-result .search-result-meta')?.textContent.includes('heise online'));
  doc.getElementById('btn-river').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  check('Alle Artikel: zurück zur Rubrikansicht', !!doc.querySelector('.feed[data-feed-id="10"]'));

  // Nicht angemeldet: lesen geht, bearbeiten fragt nach dem Passwort
  window.fetch = async (url) => {
    const sprache = i18nAntwort(url);
    if (sprache) return sprache;
    if (String(url).includes('/api/board')) {
      return { ok: true, status: 200, json: async () => ({ ...structuredClone(boardData), authenticated: false }) };
    }
    if (String(url).includes('/api/settings/integrations')) {
      return { ok: true, status: 200, json: async () => structuredClone(integrationsData) };
    }
    if (String(url).includes('/api/feeds/health')) {
      return { ok: true, status: 200, json: async () => structuredClone(healthData) };
    }
    if (String(url).includes('/api/rules')) {
      return { ok: true, status: 200, json: async () => structuredClone(rulesData) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  doc.getElementById('btn-refresh').dispatchEvent(new window.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));

  check('Zugang: abgemeldet → Anmelden sichtbar',
    !doc.getElementById('btn-login').hidden
    && doc.getElementById('btn-logout').hidden
    && doc.getElementById('btn-password').hidden);
  check('Lesen bleibt ohne Anmeldung möglich', !!doc.querySelector('.category-tile, .feed'));

  doc.getElementById('btn-edit').dispatchEvent(new window.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 20));
  check('Bearbeiten öffnet den Anmelde-Dialog', !!doc.querySelector('form[data-action="login-submit"]'));
  check('Bearbeiten bleibt bis dahin gesperrt', !doc.body.classList.contains('edit-mode'));
  doc.querySelector('[data-action="sheet-close"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  // Empty-State testen
  window.fetch = async (url) => i18nAntwort(url)
    || (String(url).includes('/api/rules')
      ? { ok: true, status: 200, json: async () => structuredClone(rulesData) }
      : String(url).includes('/api/feeds/health')
      ? { ok: true, status: 200, json: async () => structuredClone(healthData) }
      : String(url).includes('/api/settings/integrations')
      ? { ok: true, status: 200, json: async () => structuredClone(integrationsData) }
      : { ok: true, status: 200, json: async () => ({ categories: [], refreshing: false, fetch_interval_minutes: 30 }) });
  doc.getElementById('btn-refresh').dispatchEvent(new window.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  check('Empty-State gerendert', !!doc.querySelector('.board-empty'));

  // Theme: System-Modus, Live-Wechsel und feste Auswahl
  const themeSegBtn = (pref) => doc.querySelector(`#seg-theme [data-theme-pref="${pref}"]`);
  const clickEl = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  const themeColorMedia = (variant) => doc.querySelector(`meta[data-theme-color="${variant}"]`).getAttribute('media');

  check('Theme: „System" ist Standard', themeSegBtn('system').classList.contains('active'));
  check('Theme: System hell → data-theme=light', doc.documentElement.dataset.theme === 'light');
  check('Leistenfarbe: bei „System" entscheiden die media-Abfragen',
    themeColorMedia('light') === '(prefers-color-scheme: light)' && themeColorMedia('dark') === '(prefers-color-scheme: dark)');

  systemDark = true;
  fireMediaChange();
  check('Theme: Systemwechsel wird live übernommen', doc.documentElement.dataset.theme === 'dark');

  clickEl(themeSegBtn('light'));
  check('Theme: feste Auswahl „Hell" gesetzt', doc.documentElement.dataset.theme === 'light' && themeSegBtn('light').classList.contains('active'));
  systemDark = false;
  fireMediaChange();
  systemDark = true;
  fireMediaChange();
  check('Theme: feste Auswahl ignoriert Systemwechsel', doc.documentElement.dataset.theme === 'light');
  check('Theme: Auswahl gespeichert', window.localStorage.getItem('feedboard-theme') === 'light');
  check('Leistenfarbe: feste Auswahl schaltet helle Variante fest',
    themeColorMedia('light') === 'all' && themeColorMedia('dark') === 'not all');

  clickEl(doc.getElementById('btn-theme'));
  check('Theme: Knopf schaltet auf dunkel', doc.documentElement.dataset.theme === 'dark' && themeSegBtn('dark').classList.contains('active'));
  check('Leistenfarbe: folgt dem Knopf auf dunkel',
    themeColorMedia('dark') === 'all' && themeColorMedia('light') === 'not all');

  clickEl(themeSegBtn('system'));
  check('Theme: zurück auf „System" folgt wieder dem System', doc.documentElement.dataset.theme === 'dark' && window.localStorage.getItem('feedboard-theme') === 'system');

  // ---- Sprachen: drei Wörterbücher, aus Dateien geladen ----
  const waehleSprache = (lang) => {
    const knopf = doc.querySelector(`#seg-lang [data-lang="${lang}"]`);
    knopf.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  };
  const aktiveSprache = () => doc.querySelector('#seg-lang .seg-btn.active')?.dataset.lang;
  const datenLabel = () => doc.querySelector('[data-i18n="data_label"]').textContent;

  check('Sprache: Start auf Deutsch', doc.documentElement.lang === 'de' && aktiveSprache() === 'de');
  const deutscherText = datenLabel();

  waehleSprache('en');
  await new Promise((r) => setTimeout(r, 80));
  check('Sprache: Auswahl schaltet auf Englisch', aktiveSprache() === 'en' && doc.documentElement.lang === 'en');
  check('Sprache: Beschriftung wechselt wirklich', datenLabel() === 'Data' && datenLabel() !== deutscherText);

  waehleSprache('ru');
  await new Promise((r) => setTimeout(r, 80));
  check('Sprache: Russisch geladen', aktiveSprache() === 'ru' && datenLabel() === 'Данные');

  waehleSprache('de');
  await new Promise((r) => setTimeout(r, 80));
  check('Sprache: zurück auf Deutsch', aktiveSprache() === 'de' && datenLabel() === deutscherText);
  check('Sprache: Wahl wird gespeichert', window.localStorage.getItem('feedboard-lang') === 'de');
  check('Sprache: lang-Attribut gesetzt', doc.documentElement.lang === 'de');

  // ---- Einstellungsdialog: Bereiche statt eines überladenen Aufklappers ----
  const dialog = doc.getElementById('settings-dialog');
  check('Dialog: zunächst geschlossen', dialog.hidden === true);

  doc.getElementById('btn-settings').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  check('Dialog: öffnet über das Zahnrad', dialog.hidden === false);
  check('Dialog: sieben Bereiche', doc.querySelectorAll('#settings-nav .dialog-nav-btn').length === 7);
  check('Dialog: Darstellung ist offen', doc.querySelector('.dialog-pane.is-active')?.dataset.pane === 'appearance');
  check('Dialog: nur ein Bereich sichtbar', doc.querySelectorAll('.dialog-pane.is-active').length === 1);

  doc.querySelector('#settings-nav [data-section="data"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  check('Dialog: Bereichswechsel auf Daten', doc.querySelector('.dialog-pane.is-active')?.dataset.pane === 'data');
  check('Dialog: OPML-Knopf im Daten-Bereich', !!doc.querySelector('.dialog-pane[data-pane="data"] #btn-opml-import'));

  doc.getElementById('settings-backdrop').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  check('Dialog: Klick auf den Hintergrund schließt', dialog.hidden === true);

  doc.getElementById('btn-settings').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise((r) => setTimeout(r, 30));
  check('Dialog: Escape schließt', dialog.hidden === true);

  // Zustand der Feeds
  doc.getElementById('btn-settings').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  doc.querySelector('#settings-nav [data-section="feeds"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  check('Feeds: eine Zeile je Feed', doc.querySelectorAll('#feed-health .feed-health-row').length === 3);
  check('Feeds: Ampel unterscheidet ok, Fehler und pausiert',
    doc.querySelectorAll('#feed-health .is-ok').length === 1
    && doc.querySelectorAll('#feed-health .is-fehler').length === 1
    && doc.querySelectorAll('#feed-health .is-aus').length === 1);
  check('Feeds: Fehlermeldung steht dabei',
    doc.querySelector('#feed-health .feed-health-error')?.textContent === 'HTTP 404 Not Found');
  check('Feeds: nur der pausierte hat einen Einschaltknopf',
    doc.querySelectorAll('#feed-health .feed-health-on').length === 1
    && doc.querySelector('#feed-health .feed-health-on').dataset.feed === '12');
  check('Feeds: Zusammenfassung nennt die Zahlen',
    doc.getElementById('feeds-health-status').textContent === '3 Feeds, 1 pausiert, 1 mit Fehler.');
  check('Feeds: bedingtes Abrufen wird ausgewiesen',
    doc.querySelector('#feed-health .feed-health-meta').textContent.includes('fragt vor dem Laden'));
  // Regeln stehen im selben Bereich
  check('Regeln: eine Zeile je Regel', doc.querySelectorAll('#rule-list .rule-row').length === 2);
  check('Regeln: als Satz lesbar',
    doc.querySelector('#rule-list .rule-text').textContent
      === 'alle Feeds: wenn nur Titel „Gewinnspiel“ enthält → als gelesen markieren');
  check('Regeln: abgeschaltete sind erkennbar', doc.querySelectorAll('#rule-list .rule-row.is-off').length === 1);
  check('Regeln: Treffer werden angezeigt',
    doc.querySelector('#rule-list .rule-meta').textContent === '4-mal angewendet');
  check('Regeln: Feed-Auswahl kennt „alle Feeds“',
    doc.querySelector('#rule-feed option').textContent === 'alle Feeds');
  check('Regeln: Formular sichtbar, Sperrhinweis nicht',
    !doc.getElementById('rule-form').hidden && doc.getElementById('rules-locked').hidden);

  doc.getElementById('btn-settings-close').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  check('Werkzeugleiste: Stift und Design sind heraus gewandert',
    !!doc.querySelector('.toolbar #btn-edit') && !!doc.querySelector('.toolbar #btn-theme'));

  // ---- Briefing-Zeitplan: Uhrzeit und Wochentage statt cron ----
  const schedule = require('./public/schedule.js');
  check('Zeitplan: Uhrzeit und Tage werden zu cron',
    schedule.zuCron({ zeit: '06:30', tage: [1, 2, 3, 4, 5] }) === '30 6 * * 1,2,3,4,5');
  check('Zeitplan: alle Tage ergeben den Stern',
    schedule.zuCron({ zeit: '07:00', tage: [0, 1, 2, 3, 4, 5, 6] }) === '0 7 * * *');
  check('Zeitplan: ohne Tag kein Ausdruck', schedule.zuCron({ zeit: '07:00', tage: [] }) === '');
  check('Zeitplan: cron wird wieder zerlegt',
    JSON.stringify(schedule.ausCron('30 6 * * 1-5')) === JSON.stringify({ zeit: '06:30', tage: [1, 2, 3, 4, 5] }));
  check('Zeitplan: Ausgefallenes bleibt unzerlegt', schedule.ausCron('*/20 8-18 * * 1-5') === null);

  doc.getElementById('btn-settings').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  doc.querySelector('#settings-nav [data-section="integrations"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  check('Zeitplan: sieben Wochentag-Knöpfe', doc.querySelectorAll('#briefing-days .weekday').length === 7);
  check('Zeitplan: Uhrzeit kommt vom Server', doc.getElementById('input-briefing-time').value === '06:30');
  check('Zeitplan: genau die Werktage aktiv',
    [...doc.querySelectorAll('#briefing-days .weekday.active')].map((b) => b.dataset.day).sort().join(',') === '1,2,3,4,5');
  check('Zeitplan: kein cron mehr in der Oberfläche',
    !doc.getElementById('briefing-cron-advanced') && !doc.getElementById('input-briefing-cron'));
  check('Zeitplan: Auswahl steckt auch in aria-pressed',
    [...doc.querySelectorAll('#briefing-days .weekday')]
      .every((b) => b.getAttribute('aria-pressed') === String(b.classList.contains('active'))));
  check('Zeitplan: jeder Tag hat ein Merkmalsfeld neben der Farbe',
    [...doc.querySelectorAll('#briefing-days .weekday')]
      .every((b) => b.querySelectorAll('.weekday-mark').length === 1));
  check('Zeitplan: Uhrzeit und Tage stehen in einer Zeile',
    doc.querySelector('.briefing-when #input-briefing-time') && doc.querySelector('.briefing-when #briefing-days'));

  // Die Statuszeile zeigte früher den rohen cron-Ausdruck
  const statusText = doc.getElementById('integrations-status').textContent;
  check('Zeitplan: Statuszeile im Klartext',
    statusText.includes('Mo–Fr') && statusText.includes('06:30') && !statusText.includes('* *'));

  doc.querySelector('.weekday-presets [data-days="0,1,2,3,4,5,6"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('Zeitplan: Schnellwahl setzt alle sieben Tage',
    doc.querySelectorAll('#briefing-days .weekday.active').length === 7);
  doc.querySelector('.weekday-presets [data-days="1,2,3,4,5"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check('Zeitplan: Schnellwahl Werktage',
    [...doc.querySelectorAll('#briefing-days .weekday.active')].map((b) => b.dataset.day).sort().join(',') === '1,2,3,4,5');

  check('Zeitplan: Zeitzone des Servers steht dabei', doc.getElementById('briefing-tz').textContent === 'Europe/Berlin');

  // KI-Anbieter
  const anbieterFeld = doc.getElementById('select-ai-provider');
  check('KI: Anbieterliste kommt vom Server', anbieterFeld.options.length === 3 && anbieterFeld.value === 'anthropic');
  check('KI: Modell steht in der Auswahl', doc.getElementById('select-ai-model').value === 'claude-opus-5');
  check('KI: Anbieter und Modell stehen nebeneinander',
    doc.querySelector('.settings-pair #select-ai-provider') && doc.querySelector('.settings-pair #select-ai-model'));
  check('KI: Basis-URL nur beim eigenen Endpunkt', doc.getElementById('ai-base-field').hidden === true);
  anbieterFeld.value = 'custom';
  anbieterFeld.dispatchEvent(new window.Event('change', { bubbles: true }));
  check('KI: eigener Endpunkt zeigt die Basis-URL statt des Schlüssels',
    doc.getElementById('ai-base-field').hidden === false && doc.getElementById('ai-key-field').hidden === true);
  anbieterFeld.value = 'groq';
  anbieterFeld.dispatchEvent(new window.Event('change', { bubbles: true }));
  check('KI: Anbieterwechsel übernimmt nicht das fremde Modell',
    doc.getElementById('select-ai-model').value !== 'claude-opus-5');
  check('KI: fehlender Schlüssel wird als solcher angezeigt',
    doc.getElementById('clear-ai-key').hidden === true && !doc.getElementById('input-ai-key').placeholder.includes('····'));

  // Anleitungen an den Feldern
  check('Hilfe: sieben Fragezeichen mit je einem Block',
    doc.querySelectorAll('.help-btn').length === 7
    && [...doc.querySelectorAll('.help-btn')].every((k) => doc.getElementById(`help-${k.dataset.help}`)));
  const hilfeKnopf = doc.querySelector('.help-btn[data-help="tg_token"]');
  const hilfeBlock = doc.getElementById('help-tg_token');
  check('Hilfe: zunächst zugeklappt', hilfeBlock.hidden && hilfeKnopf.getAttribute('aria-expanded') === 'false');
  hilfeKnopf.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  check('Hilfe: klappt mit nummerierten Schritten auf',
    !hilfeBlock.hidden && hilfeKnopf.getAttribute('aria-expanded') === 'true'
    && hilfeBlock.querySelectorAll('ol li').length === 4);
  check('Hilfe: Schritt eins nennt den BotFather',
    hilfeBlock.querySelector('li').textContent.includes('@BotFather'));

  const anbieterFeld2 = doc.getElementById('select-ai-provider');
  anbieterFeld2.value = 'anthropic';
  anbieterFeld2.dispatchEvent(new window.Event('change', { bubbles: true }));
  const schluesselKnopf = doc.querySelector('.help-btn[data-help="ai_key"]');
  schluesselKnopf.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  check('Hilfe: Schlüssel-Anleitung verlinkt den Anbieter',
    doc.querySelector('#help-ai_key a')?.getAttribute('href') === 'https://console.anthropic.com/settings/keys');
  anbieterFeld2.value = 'groq';
  anbieterFeld2.dispatchEvent(new window.Event('change', { bubbles: true }));
  check('Hilfe: die Adresse folgt dem Anbieter',
    doc.querySelector('#help-ai_key a')?.getAttribute('href') === 'https://console.groq.com/keys');
  anbieterFeld2.value = 'anthropic';
  anbieterFeld2.dispatchEvent(new window.Event('change', { bubbles: true }));

  check('Hilfe: Hinweise ohne Nummern beim Briefing',
    (() => {
      const k = doc.querySelector('.help-btn[data-help="briefing"]');
      k.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
      return doc.querySelectorAll('#help-briefing ul li').length === 4;
    })());
  check('Beschriftung heißt API-Schlüssel, nicht KI-Schlüssel',
    doc.querySelector('label[for="input-ai-key"] span').textContent === 'API-Schlüssel');

  // Wochentage tragen kein data-i18n und blieben früher auf der alten Sprache
  // (Russisch, weil "Mo" auf Deutsch und Englisch gleich hieße)
  doc.querySelector('#seg-lang [data-lang="ru"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  check('Sprachwechsel: Wochentage werden neu beschriftet',
    doc.querySelector('#briefing-days .weekday').textContent.includes('Пн'));
  check('Sprachwechsel: auch der eigene Endpunkt im Anbieter-Menü',
    [...doc.getElementById('select-ai-provider').options].pop().textContent === 'Свой адрес API');
  // Blieb frueher in der Sprache stehen, die beim Laden des Bereichs galt
  check('Sprachwechsel: Platzhalter des Bot-Token-Felds',
    doc.getElementById('input-tg-token').placeholder.includes('задано'));
  // Blieb frueher stehen, bis zufaellig eine neue Aktion sie ersetzte
  check('Sprachwechsel: Statuszeile wird neu erzeugt',
    doc.getElementById('integrations-status').textContent === "Провайдер изменён — сохраните и загрузите список моделей.");
  check('Sprachwechsel: offene Anleitung wird neu gezeichnet',
    doc.querySelector('#help-tg_token li').textContent.includes('@BotFather в Telegram'));
  doc.querySelector('#seg-lang [data-lang="de"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));

  // Veralteter oder stummer Server: die Auswahl steht trotzdem, denn sie kommt
  // aus providers.js und schedule.js. Früher blieb hier alles leer.
  const alterFetch = window.fetch;
  doc.getElementById('btn-settings-close').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  // Abmelden setzt den Merker zurück, damit die Zugänge neu geladen werden
  window.fetch = async (url) => i18nAntwort(url)
    || ({ ok: true, status: 200, json: async () => ({ ...structuredClone(boardData), authenticated: false }) });
  doc.getElementById('btn-refresh').dispatchEvent(new window.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));

  // Wieder angemeldet, aber der Server kennt die Zugänge nicht (altes Backend).
  // Die Anbieterliste wird geleert: so sähe es aus, wenn sie nie ankam.
  doc.getElementById('select-ai-provider').innerHTML = '';
  window.fetch = async (url) => i18nAntwort(url)
    || (String(url).includes('/api/settings/integrations')
      ? { ok: false, status: 404, json: async () => { throw new Error('kein JSON'); } }
      : { ok: true, status: 200, json: async () => structuredClone(boardData) });
  doc.getElementById('btn-refresh').dispatchEvent(new window.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));

  doc.getElementById('btn-settings').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  doc.querySelector('#settings-nav [data-section="integrations"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  check('Ohne Serverantwort: Wochentage sind trotzdem da',
    doc.querySelectorAll('#briefing-days .weekday').length === 7);
  check('Ohne Serverantwort: Anbieterliste ist trotzdem gefüllt',
    doc.getElementById('select-ai-provider').options.length === 8);
  check('Ohne Serverantwort: Hinweis statt stiller Vorgaben',
    doc.getElementById('integrations-status').textContent.includes('nur Vorgaben')
    && doc.getElementById('integrations-status').classList.contains('is-error'));
  window.fetch = alterFetch;
  check('Handy-App: Zugangsfelder vorhanden',
    !!doc.getElementById('input-fever-user') && !!doc.getElementById('input-fever-password'));
  check('Offline: Knopf und Volltext-Schalter im Daten-Bereich',
    !!doc.getElementById('btn-offline') && doc.getElementById('chk-offline-fulltext').checked);

  check('Zugänge: Token nur als Hinweis, Feld leer',
    doc.getElementById('input-tg-token').value === '' && doc.getElementById('input-tg-token').placeholder.includes('····1234'));

  console.log(results.join('\n'));
  console.log(errors.length ? `\nJS-Fehler: ${errors.map(String).join(' | ')}` : '\nAlle Smoke-Tests abgeschlossen.');

  // Intervalle aus app.js halten den Prozess sonst offen
  window.close();
  process.exit(process.exitCode || 0);
}

run().catch((error) => {
  console.error('Smoke-Test abgebrochen:', error);
  process.exit(1);
});
