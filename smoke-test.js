// smoke-test.js — Frontend-Smoke-Test mit jsdom (nur für Entwicklung, nicht Teil der App)
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');

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
          articles: [],
        },
      ],
    },
  ],
  refreshing: false,
  fetch_interval_minutes: 30,
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
    if (String(url).includes('/api/board')) {
      return { ok: true, status: 200, json: async () => structuredClone(boardData) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };

  const errors = [];
  window.addEventListener('error', (e) => errors.push(e.error || e.message));

  // app.js im Fenster-Kontext ausführen
  window.eval(appJs);

  // loadBoard ist async — kurz warten
  await new Promise((r) => setTimeout(r, 50));

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

  // Empty-State testen
  window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ categories: [], refreshing: false, fetch_interval_minutes: 30 }) });
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
