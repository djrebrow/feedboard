// app.js — Feedboard Frontend
'use strict';

(() => {
  const ARTICLES_VISIBLE = 8;
  const AUTO_RELOAD_MS = 60 * 1000;

  // Version aus der eigenen Skript-Adresse (app.js?v=…). Wird an die
  // Sprachdateien weitergereicht, damit sie derselben Cache-Regel folgen.
  const ASSET_VERSION = (() => {
    const eigenes = document.currentScript?.src || '';
    try { return new URL(eigenes, location.href).searchParams.get('v') || ''; } catch { return ''; }
  })();

  const state = {
    board: null,
    lang: 'de',
    view: 'categories',    // 'categories' (Startseite) | 'category' (eine Rubrik geöffnet)
    activeSlug: null,      // Slug der geöffneten Rubrik (URL-Anker #/<slug>)
    editMode: false,
    expanded: new Set(),   // Artikel-IDs mit ausgeklappter Kurzfassung
    showAll: new Set(),    // Feed-IDs, die alle Artikel anzeigen
    renaming: null,        // { type: 'feed', id } — Inline-Umbenennen von Feeds
    editingCategory: null, // Rubrik-ID, deren Bearbeiten-Panel offen ist
    editingDraft: null,    // { name, slug, slugTouched } — ungespeicherte Panel-Eingaben
    logoTargetId: null,    // Rubrik-ID für den nächsten Logo-Upload
    unreadOnly: false,     // nur ungelesene Artikel anzeigen
    searchQuery: '',       // aktive Suchanfrage (leer = normale Ansicht)
    searchResults: [],
    savedView: false,      // „Gespeichert"-Ansicht aktiv
    savedResults: [],
    riverView: false,      // „Alle Artikel"-Ansicht (chronologisch über alle Rubriken)
    features: {},          // vom Server gemeldete optionale Funktionen (KI, Teilen, Login)
    authenticated: true,   // fürs Bearbeiten angemeldet (ohne Passwort immer wahr)
    selectedId: null,      // per Tastatur ausgewählter Artikel
    extra: new Map(),      // Artikel-ID → nachgeladener Text (Volltext, KI)
    busy: new Set(),       // Artikel-IDs mit laufender Aktion
    themePref: 'system',   // 'light' | 'dark' | 'system' (System = Betriebssystem-Einstellung folgen)
    fontSize: 'normal',    // 'small' | 'normal' | 'large'
    density: 'comfortable',// 'comfortable' | 'compact'
    thumbnails: false,     // Thumbnails in der Liste
    dedupe: true,          // gleiche Meldung aus mehreren Quellen zusammenfassen
    faviconCache: false,   // Favicons über den lokalen Proxy laden
    loading: false,
  };

  const boardEl = document.getElementById('board');
  const editBar = document.getElementById('edit-bar');
  const editBarHint = document.querySelector('.edit-bar-hint');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnEdit = document.getElementById('btn-edit');
  const btnTheme = document.getElementById('btn-theme');
  const lastUpdatedEl = document.getElementById('last-updated');
  const todayDateEl = document.getElementById('today-date');
  const formAddCategory = document.getElementById('form-add-category');
  const inputCategoryName = document.getElementById('input-category-name');
  const inputCategorySlug = document.getElementById('input-category-slug');
  const toastContainer = document.getElementById('toast-container');
  const segLang = document.getElementById('seg-lang');
  const btnSettings = document.getElementById('btn-settings');
  const settingsDialog = document.getElementById('settings-dialog');
  const settingsBackdrop = document.getElementById('settings-backdrop');
  const settingsNav = document.getElementById('settings-nav');
  const btnSettingsClose = document.getElementById('btn-settings-close');
  const logoFileInput = document.getElementById('logo-file-input');
  const articlePreview = document.getElementById('article-preview');
  const btnUnread = document.getElementById('btn-unread');
  const btnSaved = document.getElementById('btn-saved');
  const inputSearch = document.getElementById('input-search');
  const btnSearchClear = document.getElementById('btn-search-clear');
  const metaThemeColors = document.querySelectorAll('meta[data-theme-color]');
  const segTheme = document.getElementById('seg-theme');
  const segFontSize = document.getElementById('seg-fontsize');
  const segDensity = document.getElementById('seg-density');
  const chkThumbnails = document.getElementById('chk-thumbnails');
  const chkDedupe = document.getElementById('chk-dedupe');
  const chkFaviconCache = document.getElementById('chk-favicon-cache');
  const inputMute = document.getElementById('input-mute');
  const btnMuteSave = document.getElementById('btn-mute-save');
  const previewSheet = document.getElementById('preview-sheet');
  const previewSheetCard = previewSheet.querySelector('.preview-sheet-card');
  const btnRiver = document.getElementById('btn-river');
  const opmlFileInput = document.getElementById('opml-file-input');
  const backupFileInput = document.getElementById('backup-file-input');
  const btnOpmlImport = document.getElementById('btn-opml-import');
  const btnRestore = document.getElementById('btn-restore');
  const btnLogout = document.getElementById('btn-logout');
  const btnLogin = document.getElementById('btn-login');
  const btnPassword = document.getElementById('btn-password');
  const btnBriefing = document.getElementById('btn-briefing');
  const settingsAi = document.getElementById('settings-ai');
  const settingsIntegrations = document.getElementById('settings-integrations');
  const integrationsLocked = document.getElementById('integrations-locked');
  const inputTgToken = document.getElementById('input-tg-token');
  const inputTgChat = document.getElementById('input-tg-chat');
  const inputAiKey = document.getElementById('input-ai-key');
  const inputAiModel = document.getElementById('input-ai-model');
  const inputBriefingCron = document.getElementById('input-briefing-cron');
  const inputBriefingTime = document.getElementById('input-briefing-time');
  const briefingDays = document.getElementById('briefing-days');
  const briefingCronAdvanced = document.getElementById('briefing-cron-advanced');
  const briefingTz = document.getElementById('briefing-tz');
  const inputBriefingHours = document.getElementById('input-briefing-hours');
  const selectBriefingLang = document.getElementById('select-briefing-lang');
  const clearTgToken = document.getElementById('clear-tg-token');
  const clearAiKey = document.getElementById('clear-ai-key');
  const integrationsStatus = document.getElementById('integrations-status');
  const btnIntegrationsSave = document.getElementById('btn-integrations-save');
  const btnIntegrationsTest = document.getElementById('btn-integrations-test');
  const settingsAccount = document.getElementById('settings-account');
  const shortcutList = document.getElementById('shortcut-list');

  // -------------------------------------------------------------------------
  // i18n-Hilfsfunktionen
  // -------------------------------------------------------------------------

  // Die Wörterbücher liegen als JSON unter /i18n/<sprache>.json und werden beim
  // Start geladen. Deutsch dient als Rückfallebene: fehlt ein Schlüssel in
  // einer Sprache, erscheint der deutsche Text statt eines rohen Schlüssels.
  const LANGS = ['de', 'en', 'ru'];
  const FALLBACK_LANG = 'de';
  const LOCALES = { de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

  const dictionaries = { };

  async function loadDictionary(lang) {
    if (dictionaries[lang]) return dictionaries[lang];
    // Dieselbe Version wie app.js, damit der Service-Worker nach einem Update
    // nicht die alten Texte weiterreicht.
    const antwort = await fetch(`i18n/${lang}.json${ASSET_VERSION ? `?v=${ASSET_VERSION}` : ''}`);
    if (!antwort.ok) throw new Error(`Sprachdatei ${lang} nicht ladbar`);
    dictionaries[lang] = await antwort.json();
    return dictionaries[lang];
  }

  function t(key, params) {
    const dict = dictionaries[state.lang] || dictionaries[FALLBACK_LANG] || {};
    const fallback = dictionaries[FALLBACK_LANG] || {};
    let str = dict[key] ?? fallback[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) str = str.replaceAll(`{${k}}`, v);
    }
    return str;
  }

  function locale() {
    return LOCALES[state.lang] || LOCALES[FALLBACK_LANG];
  }

  // Fehlermeldungen des Servers: er schickt einen Schlüssel mit, den wir
  // übersetzen. Der mitgelieferte deutsche Text ist die Rückfallebene — für
  // Schlüssel, die wir noch nicht kennen, und für ältere Serverstände.
  function fehlerText(data, status) {
    if (data && data.code) {
      const dict = dictionaries[state.lang] || {};
      const schluessel = `err_${data.code}`;
      if (dict[schluessel] !== undefined) return t(schluessel, data.params || undefined);
    }
    return (data && data.error) || `${t('error_generic')} ${status}`;
  }

  const TRANSLIT = {
    'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z',
    'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
    'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  };

  // Muss mit slugify() im Backend (db.js) übereinstimmen
  function slugify(text) {
    let out = '';
    for (const ch of String(text ?? '').toLowerCase()) {
      out += TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch;
    }
    out = out.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    out = out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return out;
  }

  // Pluralformen kommen aus Intl statt aus handgerechneten Sonderfällen —
  // Russisch braucht drei Formen, Deutsch und Englisch zwei.
  function feedCountLabel(n) {
    const dict = dictionaries[state.lang] || {};
    const regel = new Intl.PluralRules(locale()).select(n);
    const schluessel = `feed_count_${regel}`;
    return dict[schluessel] !== undefined ? t(schluessel, { n }) : t('feed_count_other', { n });
  }

  function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  }

  function updateLangButtons() {
    segLang.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('active', b.dataset.lang === state.lang));
  }

  async function setLang(lang, { speichern = true } = {}) {
    const ziel = LANGS.includes(lang) ? lang : FALLBACK_LANG;
    try {
      await loadDictionary(ziel);
    } catch {
      // Sprachdatei nicht erreichbar (z. B. offline und nie geladen): bei der
      // bisherigen Sprache bleiben statt die Oberfläche mit Schlüsseln zu füllen.
      return;
    }
    state.lang = ziel;
    if (speichern) localStorage.setItem('feedboard-lang', ziel);
    document.documentElement.lang = ziel;
    applyStaticI18n();
    updateLangButtons();
    renderShortcutList();
    updateClock();
    render();
  }

  // Beim allerersten Besuch die Browsersprache übernehmen, sofern wir sie
  // sprechen. Sobald einmal von Hand gewählt wurde, gilt nur noch das.
  function ermittelteStartsprache() {
    const gespeichert = localStorage.getItem('feedboard-lang');
    if (LANGS.includes(gespeichert)) return gespeichert;
    for (const eintrag of navigator.languages || [navigator.language || '']) {
      const kurz = String(eintrag).slice(0, 2).toLowerCase();
      if (LANGS.includes(kurz)) return kurz;
    }
    return FALLBACK_LANG;
  }

  // -------------------------------------------------------------------------
  // Hilfsfunktionen
  // -------------------------------------------------------------------------

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value));
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    } catch { /* ignorieren */ }
    return null;
  }

  function hostnameOf(value) {
    try { return new URL(String(value)).hostname; } catch { return ''; }
  }

  function toast(message, isError = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' toast-error' : '');
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, isError ? 5000 : 2800);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    let data = null;
    try { data = await response.json(); } catch { /* leere Antwort */ }
    if (!response.ok) {
      // Sitzung abgelaufen oder Passwort inzwischen gesetzt — nicht die Seite
      // verlassen, nur nach dem Passwort fragen. Gelesen wird ja weiterhin.
      if (response.status === 401 && data && data.login_required && path !== '/api/login') {
        state.authenticated = false;
        openLoginSheet();
      }
      throw new Error(fehlerText(data, response.status));
    }
    return data;
  }

  // Datums-/Zeitdarstellung ---------------------------------------------------

  function parseDbDate(value) {
    if (!value) return null;
    // SQLite datetime('now') liefert "YYYY-MM-DD HH:MM:SS" in UTC (ohne Suffix)
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
      ? value.replace(' ', 'T') + 'Z'
      : value;
    const timestamp = Date.parse(normalized);
    return Number.isNaN(timestamp) ? null : new Date(timestamp);
  }

  function relativeTime(value) {
    const date = parseDbDate(value);
    if (!date) return '·';
    const diffMinutes = Math.round((Date.now() - date.getTime()) / 60000);
    if (diffMinutes < 1) return t('time_now');
    if (diffMinutes < 60) return t('time_min', { n: diffMinutes });
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return t('time_hours', { n: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return t('time_yesterday');
    if (diffDays < 7) return t('time_days', { n: diffDays });
    return date.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' });
  }

  function isFresh(value) {
    const date = parseDbDate(value);
    return !!date && Date.now() - date.getTime() < 3 * 60 * 60 * 1000;
  }

  function updateClock() {
    todayDateEl.textContent = new Date().toLocaleDateString(locale(), {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  function faviconSrc(host) {
    return state.faviconCache
      ? `/api/favicon?host=${encodeURIComponent(host)}`
      : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  }

  function faviconHtml(feed) {
    const host = hostnameOf(feed.site_url || feed.rss_url);
    const letter = esc((feed.name || '?').charAt(0));
    if (!host) return `<span class="feed-favicon-fallback">${letter}</span>`;
    return `<img class="feed-favicon" src="${faviconSrc(host)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;feed-favicon-fallback&quot;>${letter}</span>'">`;
  }

  function readToggleHtml(article) {
    const title = article.read ? t('mark_unread_title') : t('mark_read_title');
    return `<button class="article-read" data-action="toggle-read" title="${esc(title)}" aria-label="${esc(title)}"></button>`;
  }

  function starToggleHtml(article) {
    const title = article.starred ? t('star_remove_title') : t('star_add_title');
    return `<button class="article-star${article.starred ? ' starred' : ''}" data-action="toggle-star" title="${esc(title)}" aria-label="${esc(title)}">
      <svg viewBox="0 0 24 24" fill="${article.starred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
    </button>`;
  }

  function thumbHtml(article) {
    const image = safeUrl(article.image);
    if (!state.thumbnails || !image) return '';
    return `<img class="article-thumb" src="${esc(image)}" alt="" loading="lazy" onerror="this.remove()">`;
  }

  // Aktionen im aufgeklappten Bereich — nur, was der Server auch anbietet
  function articleActionsHtml(article) {
    const buttons = [];
    if (safeUrl(article.link)) {
      buttons.push(`<button class="article-action" data-action="article-fulltext">${esc(t('action_fulltext'))}</button>`);
    }
    if (state.features.ai) {
      buttons.push(`<button class="article-action" data-action="article-ai-summary">✦ ${esc(t('action_ai_summary'))}</button>`);
      buttons.push(`<button class="article-action" data-action="article-ai-translate">✦ ${esc(t('action_ai_translate'))}</button>`);
    }
    if (state.features.telegram_share) {
      buttons.push(`<button class="article-action" data-action="article-share">${esc(t('action_share'))}</button>`);
    }
    return buttons.length ? `<div class="article-actions">${buttons.join('')}</div>` : '';
  }

  // Nachgeladener Text (Volltext, KI-Kurzfassung, Übersetzung) unter dem Artikel
  function articleExtraHtml(article) {
    if (state.busy.has(article.id)) {
      return `<div class="article-extra article-extra-busy">${esc(t('action_loading'))}</div>`;
    }
    const extra = state.extra.get(article.id);
    if (!extra) return '';
    return `<div class="article-extra"><span class="article-extra-label">${esc(extra.label)}</span>${esc(extra.text).replaceAll('\n', '<br>')}</div>`;
  }

  function articleHtml(article) {
    const hasSummary = !!article.summary;
    const expanded = state.expanded.has(article.id);
    const fresh = isFresh(article.published_at || article.fetched_at);
    const link = safeUrl(article.link);
    const title = link
      ? `<a class="article-title" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(article.title)}</a>`
      : `<span class="article-title">${esc(article.title)}</span>`;

    const actions = articleActionsHtml(article);
    const expandable = hasSummary || !!actions;
    const selected = state.selectedId === article.id;

    return `
      <li class="article${hasSummary ? ' has-summary' : ''}${expandable ? ' expandable' : ''}${expanded ? ' expanded' : ''}${fresh ? ' article-fresh' : ''}${article.read ? ' article-read-done' : ''}${selected ? ' selected' : ''}" data-article-id="${article.id}">
        <div class="article-row" ${expandable ? 'data-action="toggle-summary" title="Kurzfassung ein-/ausblenden"' : ''}>
          ${readToggleHtml(article)}
          ${thumbHtml(article)}
          <span class="article-time">${esc(relativeTime(article.published_at || article.fetched_at))}</span>
          ${title}
          ${starToggleHtml(article)}
          ${expandable ? '<svg class="article-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' : ''}
        </div>
        ${hasSummary ? `<div class="article-summary">${esc(article.summary)}</div>` : ''}
        ${articleExtraHtml(article)}
        ${actions}
      </li>`;
  }

  function feedToolsHtml(feed, index, total) {
    const paused = feed.enabled === false;
    return `
      <span class="feed-tools">
        <button class="btn-ghost" data-action="feed-toggle-enabled" title="${esc(paused ? t('feed_resume_title') : t('feed_pause_title'))}">${paused ? '▶' : '⏸'}</button>
        <button class="btn-ghost" data-action="feed-up" title="${esc(t('feed_move_up'))}" ${index === 0 ? 'disabled' : ''}>▲</button>
        <button class="btn-ghost" data-action="feed-down" title="${esc(t('feed_move_down'))}" ${index === total - 1 ? 'disabled' : ''}>▼</button>
        <button class="btn-ghost" data-action="feed-rename" title="${esc(t('rename_feed_title'))}">
          <svg class="icon" style="width:13px;height:13px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button class="btn-ghost btn-danger" data-action="feed-delete" title="${esc(t('delete_feed_title'))}">✕</button>
      </span>`;
  }

  function feedHtml(feed, index, total) {
    const renaming = state.renaming && state.renaming.type === 'feed' && state.renaming.id === feed.id;
    const siteLink = safeUrl(feed.site_url);
    const showAll = state.showAll.has(feed.id);
    const visibleArticles = state.unreadOnly ? feed.articles.filter((a) => !a.read) : feed.articles;
    const articles = showAll ? visibleArticles : visibleArticles.slice(0, ARTICLES_VISIBLE);
    const hiddenCount = visibleArticles.length - articles.length;

    const nameHtml = renaming
      ? `<form class="rename-form" data-action="feed-rename-submit">
           <input type="text" value="${esc(feed.name)}" maxlength="120" required>
           <button type="submit" class="btn btn-accent">${esc(t('ok'))}</button>
           <button type="button" class="btn" data-action="rename-cancel">${esc(t('cancel'))}</button>
         </form>`
      : siteLink
        ? `<a class="feed-name" href="${esc(siteLink)}" target="_blank" rel="noopener noreferrer">${esc(feed.name)}</a>`
        : `<span class="feed-name">${esc(feed.name)}</span>`;

    const unread = feed.unread || 0;
    const paused = feed.enabled === false;
    return `
      <div class="feed${paused ? ' feed-paused' : ''}" data-feed-id="${feed.id}">
        <div class="feed-header">
          ${faviconHtml(feed)}
          ${nameHtml}
          ${paused ? `<span class="paused-badge" title="${esc(feed.error_count >= 20 ? t('feed_auto_paused') : t('feed_pause_title'))}">${esc(t('feed_paused_badge'))}</span>` : ''}
          ${unread > 0 ? `<span class="unread-badge" title="${esc(t('unread_badge_title', { n: unread }))}">${unread}</span>` : ''}
          ${feed.last_error ? `<span class="feed-error" title="${esc(t('feed_error_prefix'))} ${esc(feed.last_error)}">⚠</span>` : ''}
          ${unread > 0 ? `<button class="btn-ghost feed-mark-read" data-action="feed-mark-read" title="${esc(t('mark_all_read_title'))}"><svg class="icon" style="width:14px;height:14px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>` : ''}
          ${feedToolsHtml(feed, index, total)}
        </div>
        ${articles.length
          ? `<ul class="articles">${articles.map(articleHtml).join('')}</ul>`
          : `<div class="feed-empty">${esc(state.unreadOnly ? t('no_articles') : t('no_articles'))}</div>`}
        ${hiddenCount > 0 ? `<button class="articles-more" data-action="show-more">+ ${hiddenCount} ${esc(t('show_more'))}</button>` : ''}
        ${showAll && feed.articles.length > ARTICLES_VISIBLE ? `<button class="articles-more" data-action="show-less">${esc(t('show_less'))}</button>` : ''}
      </div>`;
  }

  // Startseite: Rubrik als anklickbare Kachel ---------------------------------

  function categoryTileHtml(category, index, total) {
    const feedCount = category.feeds.length;
    const logo = safeLogo(category.logo);

    // Bearbeiten-Panel (Name, Anker, Logo) für diese Rubrik
    if (state.editingCategory === category.id) {
      const draft = state.editingDraft || { name: category.name, slug: category.slug || '' };
      return `
        <div class="category-tile editing" data-category-id="${category.id}">
          <form class="category-edit" data-action="category-edit-submit">
            <label class="edit-field">
              <span class="edit-label">${esc(t('name_label'))}</span>
              <input type="text" data-role="edit-name" value="${esc(draft.name)}" maxlength="80" required autocomplete="off">
            </label>
            <label class="edit-field">
              <span class="edit-label">${esc(t('anchor_label'))}</span>
              <span class="slug-field">
                <span class="slug-affix">#/</span>
                <input type="text" data-role="edit-slug" value="${esc(draft.slug)}" maxlength="80" autocomplete="off" spellcheck="false">
              </span>
            </label>
            <div class="edit-field">
              <span class="edit-label">${esc(t('logo_label'))}</span>
              <div class="edit-logo">
                ${logo
                  ? `<img class="category-logo edit-logo-preview" src="${esc(logo)}" alt="">`
                  : '<span class="edit-logo-empty">—</span>'}
                <button type="button" class="btn" data-action="category-logo">${esc(t('logo_upload_title'))}</button>
                ${logo ? `<button type="button" class="btn btn-danger-outline" data-action="category-logo-remove">${esc(t('logo_remove_title'))}</button>` : ''}
              </div>
            </div>
            <div class="edit-actions">
              <button type="submit" class="btn btn-accent">${esc(t('save'))}</button>
              <button type="button" class="btn" data-action="edit-cancel">${esc(t('cancel'))}</button>
            </div>
          </form>
        </div>`;
    }

    return `
      <div class="category-tile${logo ? ' has-logo' : ''}" data-category-id="${category.id}" data-action="open-category" style="animation-delay:${Math.min(index * 55, 400)}ms">
        ${category.unread > 0 ? `<span class="unread-badge tile-badge" title="${esc(t('unread_badge_title', { n: category.unread }))}">${category.unread}</span>` : ''}
        <div class="category-tile-body">
          ${logo ? `<img class="category-logo" src="${esc(logo)}" alt="">` : ''}
          <span class="category-tile-name">${esc(category.name)}</span>
          <span class="category-tile-count">${esc(feedCountLabel(feedCount))}</span>
        </div>
        <span class="category-tools">
          <button class="btn-ghost" data-action="category-up" title="${esc(t('category_move_prev'))}" ${index === 0 ? 'disabled' : ''}>◀</button>
          <button class="btn-ghost" data-action="category-down" title="${esc(t('category_move_next'))}" ${index === total - 1 ? 'disabled' : ''}>▶</button>
          <button class="btn-ghost" data-action="category-edit" title="${esc(t('rename_category_title'))}">
            <svg class="icon" style="width:13px;height:13px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="btn-ghost btn-danger" data-action="category-delete" title="${esc(t('delete_category_title'))}">✕</button>
        </span>
      </div>`;
  }

  // Detailansicht: eine geöffnete Rubrik mit ihren Feeds ----------------------

  function categoryDetailHtml(category) {
    const feedCount = category.feeds.length;
    const unread = category.unread || 0;
    // Bei „nur Ungelesene" Feeds ohne ungelesene Artikel ausblenden
    const visibleFeeds = state.unreadOnly
      ? category.feeds.filter((f) => (f.unread || 0) > 0)
      : category.feeds;

    let body;
    if (!category.feeds.length) {
      body = `<div class="category-empty">${esc(t('no_feeds'))}</div>`;
    } else if (!visibleFeeds.length) {
      body = `<div class="category-empty">${esc(t('search_no_results'))}</div>`;
    } else {
      body = `<div class="feeds-grid">${visibleFeeds.map((feed, i) => feedHtml(feed, i, visibleFeeds.length)).join('')}</div>`;
    }

    return `
      <section class="category category-open" data-category-id="${category.id}">
        <div class="category-header">
          <button class="btn-back" data-action="back-to-categories" title="${esc(t('back_all'))}">
            <svg class="icon" style="width:15px;height:15px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            <span>${esc(t('back_all'))}</span>
          </button>
          <h2 class="category-title">${esc(category.name)}</h2>
          ${unread > 0 ? `<span class="unread-badge" title="${esc(t('unread_badge_title', { n: unread }))}">${unread}</span>` : ''}
          <span class="category-count">${esc(feedCountLabel(feedCount))}</span>
          ${unread > 0 ? `<button class="btn-ghost category-mark-read" data-action="category-mark-read" title="${esc(t('mark_all_read_title'))}"><svg class="icon" style="width:15px;height:15px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>` : ''}
        </div>
        <div class="feed-add">
          <form class="feed-add-form" data-action="feed-add">
            <div class="feed-add-row">
              <input type="text" name="url" placeholder="${esc(t('feed_add_url_placeholder'))}" required autocomplete="off">
            </div>
            <div class="feed-add-row">
              <input type="text" name="name" placeholder="${esc(t('feed_add_name_placeholder'))}" maxlength="120" autocomplete="off">
              <button type="submit" class="btn btn-accent">${esc(t('feed_add_submit'))}</button>
            </div>
            <span class="feed-add-hint">${esc(t('feed_add_hint'))}</span>
          </form>
        </div>
        ${body}
      </section>`;
  }

  function safeLogo(value) {
    return typeof value === 'string' && value.startsWith('data:image/') ? value : null;
  }

  function updateEditBar() {
    const inDetail = state.view === 'category';
    formAddCategory.classList.toggle('hidden', inDetail);
    if (editBarHint) {
      editBarHint.textContent = inDetail ? t('edit_hint_feeds') : t('edit_hint_categories');
    }
  }

  // Weist die zusammengefassten Quellen aus — verschwiegen wird nichts, jede
  // Quelle bleibt einzeln anklickbar.
  function duplicateHintHtml(article) {
    const weitere = article.duplicates;
    if (!weitere || !weitere.length) return '';
    const quellen = weitere.map((eintrag) => {
      const link = safeUrl(eintrag.link);
      return link
        ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(eintrag.feed_name)}</a>`
        : esc(eintrag.feed_name);
    }).join(' · ');
    return `<div class="duplicate-hint">${esc(t('also_at'))} ${quellen}</div>`;
  }

  function searchResultHtml(article) {
    const link = safeUrl(article.link);
    const image = safeUrl(article.image);
    const title = link
      ? `<a class="article-title" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(article.title)}</a>`
      : `<span class="article-title">${esc(article.title)}</span>`;
    const expanded = state.expanded.has(article.id);
    const selected = state.selectedId === article.id;
    return `
      <li class="search-result${article.read ? ' article-read-done' : ''}${expanded ? ' expanded' : ''}${selected ? ' selected' : ''}" data-article-id="${article.id}">
        ${readToggleHtml(article)}
        ${image ? `<img class="search-result-img" src="${esc(image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        <div class="search-result-body" data-action="toggle-summary">
          <div class="search-result-meta">${esc(article.category_name)} · ${esc(article.feed_name)} · ${esc(relativeTime(article.published_at || article.fetched_at))}</div>
          ${title}
          ${duplicateHintHtml(article)}
          ${article.summary ? `<div class="search-result-summary">${esc(article.summary)}</div>` : ''}
          ${articleExtraHtml(article)}
          ${articleActionsHtml(article)}
        </div>
        ${starToggleHtml(article)}
      </li>`;
  }

  function renderResultList(results, emptyText, headText) {
    boardEl.classList.remove('board--detail');
    boardEl.classList.add('board--search');
    if (!results.length) {
      boardEl.innerHTML = `<div class="search-empty">${esc(emptyText)}</div>`;
      return;
    }
    boardEl.innerHTML = `
      <div class="search-head">${esc(headText || t('search_results_count', { n: results.length }))}</div>
      <ul class="search-results">${results.map(searchResultHtml).join('')}</ul>`;
  }

  // „Alle Artikel": ein chronologischer Strom über sämtliche Rubriken hinweg.
  // Wird aus den bereits geladenen Board-Daten gebaut — kein zusätzlicher Abruf.
  const RIVER_MAX = 300;

  function riverArticles() {
    const all = [];
    for (const category of state.board.categories) {
      for (const feed of category.feeds) {
        for (const article of feed.articles) {
          if (state.unreadOnly && article.read) continue;
          all.push({
            ...article,
            feed_name: feed.name,
            feed_site_url: feed.site_url,
            category_name: category.name,
            category_slug: category.slug,
          });
        }
      }
    }
    all.sort((a, b) => {
      const left = Date.parse(a.published_at || a.fetched_at || 0) || 0;
      const right = Date.parse(b.published_at || b.fetched_at || 0) || 0;
      return right - left;
    });
    return (state.dedupe ? mergeDuplicates(all) : all).slice(0, RIVER_MAX);
  }

  // ---- Dieselbe Meldung aus mehreren Quellen --------------------------------
  // Verglichen werden die Titel als Wortmengen: die Formulierungen der
  // Redaktionen unterscheiden sich, die tragenden Wörter bleiben. Verlangt wird
  // zusätzlich zeitliche Nähe und eine andere Quelle — zwei Artikel desselben
  // Feeds sind eine Serie, kein Duplikat.

  const DUPLICATE_WINDOW_MS = 36 * 60 * 60 * 1000;
  const DUPLICATE_MIN_OVERLAP = 0.6;
  const DUPLICATE_MIN_WORDS = 3;

  // Füllwörter tragen nichts zur Unterscheidung bei und würden kurze Titel
  // fälschlich ähnlich machen.
  const STOPWORDS = new Set([
    'aber', 'auch', 'auf', 'aus', 'bei', 'dass', 'dem', 'den', 'der', 'des', 'die', 'ein', 'eine',
    'einen', 'einer', 'für', 'hat', 'ist', 'mit', 'nach', 'nicht', 'noch', 'sich', 'sind', 'über',
    'und', 'von', 'vor', 'wird', 'werden', 'zum', 'zur',
    'and', 'are', 'for', 'from', 'has', 'have', 'not', 'that', 'the', 'this', 'was', 'were', 'with',
    'для', 'его', 'как', 'который', 'нас', 'нет', 'что', 'это',
  ]);

  function storyTokens(title) {
    const woerter = String(title || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
    return new Set(woerter);
  }

  // Anteil gemeinsamer Wörter, bezogen auf den kürzeren Titel — sonst würde ein
  // langer Titel mit erklärendem Nachsatz nie zum knappen Pendant passen.
  function tokenOverlap(a, b) {
    if (a.size < DUPLICATE_MIN_WORDS || b.size < DUPLICATE_MIN_WORDS) return 0;
    let treffer = 0;
    for (const wort of a) if (b.has(wort)) treffer++;
    return treffer / Math.min(a.size, b.size);
  }

  // Erwartet nach Datum absteigend sortierte Artikel: der erste Treffer einer
  // Meldung ist damit der neueste und führt die Gruppe an.
  function mergeDuplicates(articles) {
    const gruppen = [];

    for (const article of articles) {
      const tokens = storyTokens(article.title);
      const zeit = Date.parse(article.published_at || article.fetched_at || 0) || 0;
      const link = article.link || null;
      let ziel = null;

      // Rückwärts, weil die zeitlich nächsten Gruppen am Ende stehen; sobald das
      // Zeitfenster gerissen ist, liegt alles Weitere noch weiter zurück.
      for (let i = gruppen.length - 1; i >= 0; i--) {
        const gruppe = gruppen[i];
        if (gruppe.zeit - zeit > DUPLICATE_WINDOW_MS) break;
        if (gruppe.quellen.has(article.feed_name)) continue;
        const gleicherLink = link && gruppe.links.has(link);
        if (gleicherLink || tokenOverlap(tokens, gruppe.tokens) >= DUPLICATE_MIN_OVERLAP) {
          ziel = gruppe;
          break;
        }
      }

      if (ziel) {
        ziel.kopf.duplicates.push({ feed_name: article.feed_name, link: article.link || null });
        ziel.quellen.add(article.feed_name);
        if (link) ziel.links.add(link);
        // Ungelesen schlägt gelesen: sonst verschwindet eine ungelesene Meldung
        // hinter einem bereits gelesenen Duplikat.
        if (!article.read) ziel.kopf.read = false;
      } else {
        const kopf = { ...article, duplicates: [] };
        gruppen.push({
          kopf,
          tokens,
          zeit,
          quellen: new Set([article.feed_name]),
          links: new Set(link ? [link] : []),
        });
      }
    }

    return gruppen.map((gruppe) => gruppe.kopf);
  }

  function render() {
    if (!state.board) return;
    hideArticlePreview();
    updateEditBar();

    // Suchansicht hat Vorrang, solange eine Anfrage aktiv ist
    if (state.searchQuery) {
      renderResultList(state.searchResults, t('search_no_results'));
      return;
    }
    if (state.savedView) {
      renderResultList(state.savedResults, t('saved_empty'));
      return;
    }
    if (state.riverView) {
      const articles = riverArticles();
      renderResultList(articles, t('river_empty'), t('river_count', { n: articles.length }));
      return;
    }
    boardEl.classList.remove('board--search');

    // Geöffnete Rubrik anzeigen (sofern sie noch existiert)
    if (state.view === 'category' && state.activeSlug) {
      const category = findCategoryBySlug(state.activeSlug);
      if (category) {
        boardEl.classList.add('board--detail');
        boardEl.innerHTML = categoryDetailHtml(category);
        return;
      }
      // Rubrik existiert nicht (mehr) → zurück zur Übersicht
      state.view = 'categories';
      state.activeSlug = null;
      history.replaceState(null, '', '#/');
      updateEditBar();
    }

    boardEl.classList.remove('board--detail');
    const { categories } = state.board;

    if (!categories.length) {
      boardEl.innerHTML = `
        <div class="board-empty">
          <h2>${esc(t('board_empty_title'))}</h2>
          <p>${esc(t('board_empty_text'))}</p>
          <button class="btn btn-accent" data-action="start-editing">${esc(t('board_empty_btn'))}</button>
        </div>`;
      return;
    }

    boardEl.innerHTML = categories
      .map((category, index) => categoryTileHtml(category, index, categories.length))
      .join('');
  }

  // -------------------------------------------------------------------------
  // Routing über den URL-Anker (#/rubrik/<id>)
  // -------------------------------------------------------------------------

  function applyHashToState() {
    const match = location.hash.match(/^#\/([^/]+)/);
    if (match) {
      state.view = 'category';
      state.activeSlug = decodeURIComponent(match[1]);
      // Eine verlinkte Rubrik hat Vorrang vor der Gesamtliste
      if (state.riverView) setRiverView(false, { silent: true });
    } else {
      state.view = 'categories';
      state.activeSlug = null;
    }
  }

  function openCategory(slug) {
    location.hash = `#/${encodeURIComponent(slug)}`;
  }

  function backToCategories() {
    location.hash = '#/';
  }

  window.addEventListener('hashchange', () => {
    applyHashToState();
    state.renaming = null;
    state.editingCategory = null;
    state.editingDraft = null;
    window.scrollTo({ top: 0 });
    render();
  });

  // -------------------------------------------------------------------------
  // Daten laden
  // -------------------------------------------------------------------------

  async function loadBoard({ silent = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    try {
      state.board = await api('/api/board');
      applyFeatures(state.board.features || {}, state.board.authenticated);
      render();
      lastUpdatedEl.textContent = new Date().toLocaleTimeString(locale(), {
        hour: '2-digit', minute: '2-digit',
      });
    } catch (error) {
      if (!silent) toast(t('toast_board_load_failed', { msg: error.message }), true);
    } finally {
      state.loading = false;
    }
  }

  // -------------------------------------------------------------------------
  // Aktionen
  // -------------------------------------------------------------------------

  function setEditMode(active) {
    state.editMode = active;
    state.renaming = null;
    state.editingCategory = null;
    state.editingDraft = null;
    document.body.classList.toggle('edit-mode', active);
    editBar.classList.toggle('hidden', !active);
    btnEdit.classList.toggle('active', active);
    if (active && state.view === 'categories') inputCategoryName.focus();
    render();
  }

  // Lese-Status ---------------------------------------------------------------

  function findArticleAny(id) {
    if (state.searchQuery) {
      const inSearch = state.searchResults.find((a) => a.id === id);
      if (inSearch) return inSearch;
    }
    if (state.savedView) {
      const inSaved = state.savedResults.find((a) => a.id === id);
      if (inSaved) return inSaved;
    }
    return state.board ? findArticle(id) : null;
  }

  async function toggleArticleRead(id) {
    const article = findArticleAny(id);
    if (!article) return;
    const read = !article.read;
    // Optimistisch lokal aktualisieren (Board + evtl. Suchtreffer)
    const boardArticle = findArticle(id);
    if (boardArticle) {
      boardArticle.read = read;
      for (const category of state.board.categories) {
        let catUnread = 0;
        for (const feed of category.feeds) {
          feed.unread = feed.articles.filter((a) => !a.read).length;
          catUnread += feed.unread;
        }
        category.unread = catUnread;
      }
    }
    const searchArticle = state.searchResults.find((a) => a.id === id);
    if (searchArticle) searchArticle.read = read;
    render();
    try {
      await api(`/api/articles/${id}/read`, { method: 'POST', body: JSON.stringify({ read }) });
    } catch (error) {
      toast(error.message, true);
      await loadBoard();
    }
  }

  async function markFeedRead(feedId) {
    try {
      await api(`/api/feeds/${feedId}/read`, { method: 'POST', body: JSON.stringify({ read: true }) });
      await loadBoard();
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function markCategoryRead(categoryId) {
    try {
      await api(`/api/categories/${categoryId}/read`, { method: 'POST', body: JSON.stringify({ read: true }) });
      await loadBoard();
    } catch (error) {
      toast(error.message, true);
    }
  }

  function setUnreadOnly(active) {
    state.unreadOnly = active;
    localStorage.setItem('feedboard-unread-only', active ? '1' : '0');
    btnUnread.classList.toggle('active', active);
    btnUnread.setAttribute('aria-pressed', active ? 'true' : 'false');
    render();
  }

  // Gespeicherte Artikel (Stern) ----------------------------------------------

  async function toggleArticleStarred(id) {
    const article = findArticleAny(id);
    if (!article) return;
    const starred = !article.starred;
    const boardArticle = findArticle(id);
    if (boardArticle) boardArticle.starred = starred;
    const inSearch = state.searchResults.find((a) => a.id === id);
    if (inSearch) inSearch.starred = starred;
    if (state.savedView && !starred) {
      state.savedResults = state.savedResults.filter((a) => a.id !== id);
    } else {
      const inSaved = state.savedResults.find((a) => a.id === id);
      if (inSaved) inSaved.starred = starred;
    }
    render();
    try {
      await api(`/api/articles/${id}/star`, { method: 'POST', body: JSON.stringify({ starred }) });
    } catch (error) {
      toast(error.message, true);
      await loadBoard();
    }
  }

  async function loadSaved() {
    try {
      const data = await api('/api/saved');
      state.savedResults = data.results || [];
      render();
    } catch (error) {
      toast(error.message, true);
    }
  }

  function setSavedView(active) {
    state.savedView = active;
    btnSaved.classList.toggle('active', active);
    btnSaved.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (active) {
      setRiverView(false, { silent: true });
      inputSearch.value = '';
      state.searchQuery = '';
      state.searchResults = [];
      btnSearchClear.hidden = true;
      loadSaved();
    } else {
      render();
    }
  }

  // „Alle Artikel" ---------------------------------------------------------

  function setRiverView(active, { silent = false } = {}) {
    state.riverView = active;
    localStorage.setItem('feedboard-river', active ? '1' : '0');
    btnRiver.classList.toggle('active', active);
    btnRiver.setAttribute('aria-pressed', active ? 'true' : 'false');
    if (active) {
      state.savedView = false;
      btnSaved.classList.remove('active');
      btnSaved.setAttribute('aria-pressed', 'false');
      clearSearch();
      return;
    }
    if (!silent) render();
  }

  // Anzeige-Einstellungen ------------------------------------------------------

  function applyDisplaySettings() {
    document.body.classList.toggle('font-small', state.fontSize === 'small');
    document.body.classList.toggle('font-large', state.fontSize === 'large');
    document.body.classList.toggle('density-compact', state.density === 'compact');
    segFontSize.querySelectorAll('[data-fontsize]').forEach((b) => b.classList.toggle('active', b.dataset.fontsize === state.fontSize));
    segDensity.querySelectorAll('[data-density]').forEach((b) => b.classList.toggle('active', b.dataset.density === state.density));
    chkThumbnails.checked = state.thumbnails;
    chkFaviconCache.checked = state.faviconCache;
    chkDedupe.checked = state.dedupe;
  }

  function setFontSize(size) {
    state.fontSize = size;
    localStorage.setItem('feedboard-fontsize', size);
    applyDisplaySettings();
  }

  function setDensity(density) {
    state.density = density;
    localStorage.setItem('feedboard-density', density);
    applyDisplaySettings();
  }

  function setThumbnails(on) {
    state.thumbnails = on;
    localStorage.setItem('feedboard-thumbnails', on ? '1' : '0');
    applyDisplaySettings();
    render();
  }

  function setDedupe(on) {
    state.dedupe = on;
    localStorage.setItem('feedboard-dedupe', on ? '1' : '0');
    applyDisplaySettings();
    render();
  }

  function setFaviconCache(on) {
    state.faviconCache = on;
    localStorage.setItem('feedboard-favicon-cache', on ? '1' : '0');
    applyDisplaySettings();
    render();
  }

  // Mute-Wörter ----------------------------------------------------------------

  async function loadMuteWords() {
    try {
      const data = await api('/api/settings/mute');
      inputMute.value = (data.words || []).join('\n');
    } catch { /* egal */ }
  }

  async function saveMuteWords() {
    try {
      await api('/api/settings/mute', { method: 'PUT', body: JSON.stringify({ words: inputMute.value }) });
      toast(t('toast_mute_saved'));
      await loadBoard();
    } catch (error) {
      toast(error.message, true);
    }
  }

  // Optionale Funktionen (KI, Teilen, Login) ------------------------------------

  function applyFeatures(features, authenticated) {
    state.features = features;
    state.authenticated = authenticated !== false;
    settingsAi.hidden = !features.ai;

    // Lesen ist immer frei. Der Zugang-Bereich zeigt daher nur, was gerade
    // möglich ist: anmelden, Passwort setzen/ändern, abmelden.
    const locked = !!features.auth && !state.authenticated;
    btnLogin.hidden = !locked;
    btnLogout.hidden = !features.auth || locked;
    btnPassword.hidden = locked;
    btnPassword.textContent = features.auth ? t('password_change') : t('password_set');

    // Bot-Token und KI-Schlüssel gehören nur Angemeldeten. Der Server lehnt
    // unangemeldete Zugriffe ohnehin ab — das hier hält sie erst gar nicht hin.
    const darfEinrichten = !locked;
    settingsIntegrations.hidden = !darfEinrichten;
    integrationsLocked.hidden = darfEinrichten;
    if (darfEinrichten && !integrationsGeladen) loadIntegrations();
    if (!darfEinrichten) integrationsGeladen = false;
  }

  // Zugänge einrichten (Telegram, KI, Briefing) ---------------------------------
  // Die Geheimnisse kommen nie vom Server zurück. Ein leeres Feld heißt deshalb
  // „unverändert"; entfernt wird ausdrücklich über den Knopf daneben.

  let integrationsGeladen = false;

  function scheduleText(schedule) {
    if (!schedule) return '';
    if (schedule.active) return t('schedule_active', { cron: schedule.cron });
    if (schedule.reason === 'invalid_cron') return t('schedule_invalid');
    if (schedule.reason === 'missing') return t('schedule_missing', { what: (schedule.missing || []).join(', ') });
    return t('schedule_off');
  }

  // ---- Briefing-Zeitplan: Uhrzeit und Wochentage statt cron ----------------
  // Gespeichert wird weiterhin cron. Ein von Hand eingetragener Ausdruck, den
  // die Auswahl nicht abbilden kann, wird im Feld für Fortgeschrittene
  // sichtbar gemacht statt beim nächsten Speichern überschrieben zu werden.

  const TAG_SCHLUESSEL = { 0: 'day_sun', 1: 'day_mon', 2: 'day_tue', 3: 'day_wed', 4: 'day_thu', 5: 'day_fri', 6: 'day_sat' };

  function renderWeekdays(gewaehlt) {
    briefingDays.innerHTML = FeedboardSchedule.WOCHENTAGE
      .map((d) => `<button type="button" class="weekday${gewaehlt.includes(d) ? ' active' : ''}" data-day="${d}">${esc(t(TAG_SCHLUESSEL[d]))}</button>`)
      .join('');
  }

  function gewaehlteTage() {
    return [...briefingDays.querySelectorAll('.weekday.active')].map((b) => Number(b.dataset.day));
  }

  function applySchedule(cronAusdruck, zeitzone) {
    const zerlegt = FeedboardSchedule.ausCron(cronAusdruck);
    if (zerlegt) {
      inputBriefingTime.value = zerlegt.zeit;
      renderWeekdays(zerlegt.tage);
      briefingCronAdvanced.hidden = true;
      inputBriefingCron.value = '';
    } else {
      // Leer (= aus) oder zu ausgefallen für die Auswahl
      inputBriefingTime.value = '';
      renderWeekdays([]);
      briefingCronAdvanced.hidden = !cronAusdruck;
      inputBriefingCron.value = cronAusdruck || '';
    }
    // Die Uhrzeit gilt in der Zeitzone des Servers, nicht in der des Browsers —
    // deshalb kommt sie vom Server und wird an die Uhrzeit geschrieben.
    briefingTz.textContent = zeitzone || '';
  }

  // Was gespeichert wird: das Feld für Fortgeschrittene hat Vorrang, solange
  // es sichtbar ist und etwas enthält.
  function currentCron() {
    if (!briefingCronAdvanced.hidden && inputBriefingCron.value.trim()) return inputBriefingCron.value.trim();
    if (!inputBriefingTime.value) return '';
    return FeedboardSchedule.zuCron({ zeit: inputBriefingTime.value, tage: gewaehlteTage() });
  }

  briefingDays.addEventListener('click', (event) => {
    const knopf = event.target.closest('.weekday');
    if (knopf) knopf.classList.toggle('active');
  });

  // Uhrzeit gesetzt, aber kein Tag gewählt: dann liefe nie etwas — alle Tage an
  inputBriefingTime.addEventListener('change', () => {
    if (inputBriefingTime.value && !gewaehlteTage().length) renderWeekdays([0, 1, 2, 3, 4, 5, 6]);
  });

  function applyIntegrations(data) {
    inputTgToken.value = '';
    inputAiKey.value = '';
    inputTgToken.placeholder = data.telegram.token_set
      ? t('integrations_keep', { hint: data.telegram.token_hint })
      : t('integrations_unset');
    inputAiKey.placeholder = data.ai.key_set
      ? t('integrations_keep', { hint: data.ai.key_hint })
      : t('integrations_unset');
    clearTgToken.hidden = !data.telegram.token_set;
    clearAiKey.hidden = !data.ai.key_set;

    inputTgChat.value = data.telegram.chat_id || '';
    inputAiModel.value = data.ai.model || '';
    applySchedule(data.briefing.cron || '', data.timezone);
    inputBriefingHours.value = data.briefing.hours;
    selectBriefingLang.value = data.briefing.lang;

    setIntegrationsStatus(scheduleText(data.schedule), '');
  }

  function setIntegrationsStatus(text, art) {
    integrationsStatus.textContent = text || '';
    integrationsStatus.classList.toggle('is-error', art === 'error');
    integrationsStatus.classList.toggle('is-ok', art === 'ok');
  }

  async function loadIntegrations() {
    try {
      applyIntegrations(await api('/api/settings/integrations'));
      integrationsGeladen = true;
    } catch (error) {
      setIntegrationsStatus(error.message, 'error');
    }
  }

  async function saveIntegrations() {
    // Sichtbare Felder gehen immer mit — leer heißt hier wirklich leer.
    const daten = {
      telegram_chat_id: inputTgChat.value,
      anthropic_model: inputAiModel.value,
      briefing_cron: currentCron(),
      briefing_hours: inputBriefingHours.value,
      briefing_lang: selectBriefingLang.value,
    };
    // Geheimnisse nur, wenn tatsächlich etwas eingetippt wurde.
    if (inputTgToken.value.trim()) daten.telegram_bot_token = inputTgToken.value;
    if (inputAiKey.value.trim()) daten.anthropic_api_key = inputAiKey.value;

    btnIntegrationsSave.disabled = true;
    try {
      const antwort = await api('/api/settings/integrations', { method: 'PUT', body: JSON.stringify(daten) });
      applyIntegrations(antwort);
      setIntegrationsStatus(`${t('integrations_saved')} ${scheduleText(antwort.schedule)}`.trim(), 'ok');
      await loadBoard(); // KI- und Teilen-Knöpfe hängen an den Zugängen
    } catch (error) {
      setIntegrationsStatus(error.message, 'error');
    } finally {
      btnIntegrationsSave.disabled = false;
    }
  }

  async function clearSecret(feld) {
    try {
      applyIntegrations(await api('/api/settings/integrations', {
        method: 'PUT',
        body: JSON.stringify({ [feld]: '' }),
      }));
      await loadBoard();
    } catch (error) {
      setIntegrationsStatus(error.message, 'error');
    }
  }

  async function testTelegram() {
    btnIntegrationsTest.disabled = true;
    setIntegrationsStatus('…', '');
    try {
      await api('/api/settings/integrations/test-telegram', { method: 'POST' });
      setIntegrationsStatus(t('integrations_sent'), 'ok');
    } catch (error) {
      setIntegrationsStatus(error.message, 'error');
    } finally {
      btnIntegrationsTest.disabled = false;
    }
  }

  // Bearbeiten ist geschützt, sobald ein Passwort gesetzt ist
  function needsLogin() {
    return !!state.features.auth && !state.authenticated;
  }

  // Volltext, KI-Kurzfassung und Übersetzung ------------------------------------

  const ACTIONS = {
    fulltext: {
      label: 'action_fulltext',
      path: (id) => `/api/articles/${id}/content`,
      body: () => ({}),
      read: (data) => data.content,
    },
    summary: {
      label: 'action_ai_summary',
      path: (id) => `/api/articles/${id}/ai/summary`,
      body: () => ({}),
      read: (data) => data.summary,
    },
    translate: {
      label: 'action_ai_translate',
      path: (id) => `/api/articles/${id}/ai/translate`,
      body: () => ({ lang: state.lang }),
      read: (data) => data.translation,
    },
  };

  async function runArticleAction(id, kind) {
    const action = ACTIONS[kind];
    if (!action || state.busy.has(id)) return;
    state.expanded.add(id);
    state.busy.add(id);
    render();
    try {
      const data = await api(action.path(id), {
        method: 'POST',
        body: JSON.stringify(action.body()),
      });
      const text = action.read(data);
      if (text) state.extra.set(id, { label: t(action.label), text });
    } catch (error) {
      toast(error.message, true);
    } finally {
      state.busy.delete(id);
      render();
    }
  }

  async function shareArticle(id) {
    try {
      await api(`/api/articles/${id}/share/telegram`, { method: 'POST', body: '{}' });
      toast(t('toast_shared'));
    } catch (error) {
      toast(error.message, true);
    }
  }

  // Tages-Briefing im Vorschau-Sheet zeigen
  async function showBriefing() {
    setSettingsOpen(false);
    openSheet(`<div class="sheet-body"><p class="sheet-summary">${esc(t('action_loading'))}</p></div>`);
    try {
      const data = await api('/api/ai/briefing', {
        method: 'POST',
        body: JSON.stringify({ lang: state.lang }),
      });
      const html = esc(data.text)
        .replaceAll(/^#\s*(.+)$/gm, '<strong>$1</strong>')
        .replaceAll('\n', '<br>');
      previewSheetCard.innerHTML = `
        <div class="sheet-body">
          <h3 class="sheet-title">${esc(t('ai_briefing_title'))}</h3>
          <p class="sheet-summary sheet-briefing">${html}</p>
          <div class="sheet-actions">
            <button type="button" class="btn" data-action="sheet-close">${esc(t('ok'))}</button>
          </div>
        </div>`;
    } catch (error) {
      previewSheetCard.innerHTML = `
        <div class="sheet-body">
          <p class="sheet-summary">${esc(error.message)}</p>
          <div class="sheet-actions">
            <button type="button" class="btn" data-action="sheet-close">${esc(t('ok'))}</button>
          </div>
        </div>`;
    }
  }

  // OPML, Sicherung, Abmelden ---------------------------------------------------

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(file);
    });
  }

  async function importOpml(file) {
    try {
      const xml = await readFileAsText(file);
      const result = await api('/api/opml', { method: 'POST', body: JSON.stringify({ xml }) });
      toast(t('toast_opml_imported', result));
      await loadBoard();
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function restoreBackup(file) {
    if (!confirm(t('confirm_restore'))) return;
    try {
      const json = await readFileAsText(file);
      const result = await api('/api/restore', { method: 'POST', body: json });
      toast(t('toast_restored', result));
      await loadBoard();
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function logout() {
    setSettingsOpen(false);
    try {
      await api('/api/logout', { method: 'POST' });
      toast(t('toast_logged_out'));
    } catch (error) {
      toast(error.message, true);
    }
    setEditMode(false);
    await loadBoard();
  }

  // Anmelden und Passwort setzen ------------------------------------------------

  function openSheet(html) {
    previewSheetCard.innerHTML = html;
    previewSheet.hidden = false;
    previewSheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sheet-open');
    previewSheetCard.querySelector('input')?.focus();
  }

  // Was nach erfolgreicher Anmeldung passieren soll (z. B. Edit-Modus öffnen)
  let afterLogin = null;

  function openLoginSheet(next = null) {
    afterLogin = next;
    setSettingsOpen(false);
    openSheet(`
      <div class="sheet-body">
        <h3 class="sheet-title">${esc(t('login_title'))}</h3>
        <p class="sheet-summary">${esc(t('login_hint'))}</p>
        <form class="sheet-form" data-action="login-submit">
          <input type="password" name="password" autocomplete="current-password"
                 placeholder="${esc(t('password_placeholder'))}" required>
          <div class="sheet-actions">
            <button type="submit" class="btn btn-accent">${esc(t('login'))}</button>
            <button type="button" class="btn" data-action="sheet-close">${esc(t('cancel'))}</button>
          </div>
        </form>
      </div>`);
  }

  function openPasswordSheet() {
    setSettingsOpen(false);
    const existing = state.features.auth;
    openSheet(`
      <div class="sheet-body">
        <h3 class="sheet-title">${esc(existing ? t('password_change') : t('password_set'))}</h3>
        <p class="sheet-summary">${esc(t('password_hint'))}</p>
        <form class="sheet-form" data-action="password-submit">
          ${existing
            ? `<input type="password" name="current" autocomplete="current-password"
                      placeholder="${esc(t('password_current'))}" required>`
            : ''}
          <input type="password" name="next" autocomplete="new-password"
                 placeholder="${esc(t('password_new'))}" minlength="6" required>
          <input type="password" name="repeat" autocomplete="new-password"
                 placeholder="${esc(t('password_repeat'))}" minlength="6" required>
          <div class="sheet-actions">
            <button type="submit" class="btn btn-accent">${esc(t('save'))}</button>
            <button type="button" class="btn" data-action="sheet-close">${esc(t('cancel'))}</button>
          </div>
        </form>
      </div>`);
  }

  async function submitLogin(form) {
    const password = form.elements.password.value;
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
    closePreviewSheet();
    toast(t('toast_logged_in'));
    await loadBoard();
    const next = afterLogin;
    afterLogin = null;
    if (next) next();
  }

  async function submitPassword(form) {
    const next = form.elements.next.value;
    if (next !== form.elements.repeat.value) throw new Error(t('password_mismatch'));
    await api('/api/password', {
      method: 'POST',
      body: JSON.stringify({
        current: form.elements.current ? form.elements.current.value : '',
        next,
      }),
    });
    closePreviewSheet();
    toast(t('toast_password_saved'));
    await loadBoard();
  }

  // Suche ----------------------------------------------------------------------

  let searchTimer = null;

  async function runSearch(query) {
    try {
      const data = await api(`/api/search?q=${encodeURIComponent(query)}`);
      // Nur übernehmen, wenn die Anfrage noch aktuell ist
      if (state.searchQuery === query) {
        state.searchResults = data.results || [];
        render();
      }
    } catch (error) {
      toast(error.message, true);
    }
  }

  function onSearchInput(value) {
    const query = value.trim();
    if (query && state.savedView) {
      state.savedView = false;
      btnSaved.classList.remove('active');
      btnSaved.setAttribute('aria-pressed', 'false');
    }
    state.searchQuery = query;
    btnSearchClear.hidden = query.length === 0;
    if (searchTimer) clearTimeout(searchTimer);
    if (!query) {
      state.searchResults = [];
      render();
      return;
    }
    searchTimer = setTimeout(() => runSearch(query), 250);
  }

  function clearSearch() {
    inputSearch.value = '';
    state.searchQuery = '';
    state.searchResults = [];
    btnSearchClear.hidden = true;
    render();
  }

  // Touch-Vorschau-Sheet -------------------------------------------------------

  function isTouchDevice() {
    return matchMedia('(hover: none)').matches;
  }

  function openPreviewSheet(article) {
    const link = safeUrl(article.link);
    const image = safeUrl(article.image);
    previewSheetCard.innerHTML = `
      ${image ? `<img class="sheet-img" src="${esc(image)}" alt="" onerror="this.remove()">` : ''}
      <div class="sheet-body">
        <h3 class="sheet-title">${esc(article.title)}</h3>
        ${article.summary ? `<p class="sheet-summary">${esc(article.summary)}</p>` : ''}
        <div class="sheet-actions">
          ${link ? `<a class="btn btn-accent" href="${esc(link)}" target="_blank" rel="noopener noreferrer" data-action="sheet-close">${esc(t('open_article'))}</a>` : ''}
          <button type="button" class="btn" data-action="sheet-close">${esc(t('cancel'))}</button>
        </div>
      </div>`;
    previewSheet.hidden = false;
    previewSheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sheet-open');
  }

  function closePreviewSheet() {
    previewSheet.hidden = true;
    previewSheet.setAttribute('aria-hidden', 'true');
    previewSheetCard.innerHTML = '';
    document.body.classList.remove('sheet-open');
  }

  async function refreshAll() {
    btnRefresh.classList.add('spinning');
    btnRefresh.disabled = true;
    try {
      const result = await api('/api/refresh', { method: 'POST' });
      if (result.skipped) {
        toast(t('toast_refreshing_running'));
      } else {
        const failedPart = result.failed ? `, ${result.failed} ${t('failed_suffix')}` : '';
        toast(`${t('refreshed')}: ${feedCountLabel(result.ok)} ${t('ok_suffix')}${failedPart}.`);
      }
      await loadBoard();
    } catch (error) {
      toast(t('toast_refresh_failed', { msg: error.message }), true);
    } finally {
      btnRefresh.classList.remove('spinning');
      btnRefresh.disabled = false;
    }
  }

  async function addCategory(name, slug) {
    await api('/api/categories', { method: 'POST', body: JSON.stringify({ name, slug }) });
    toast(t('toast_category_added', { name }));
    await loadBoard();
  }

  async function addFeed(categoryId, url, name, submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = t('searching_feed');
    try {
      const feed = await api('/api/feeds', {
        method: 'POST',
        body: JSON.stringify({ category_id: categoryId, url, name: name || null }),
      });
      toast(t('toast_feed_added', { name: feed.name }));
      await loadBoard();
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = t('feed_add_submit');
    }
  }

  function findCategory(id) {
    return state.board.categories.find((c) => c.id === id);
  }

  function findCategoryBySlug(slug) {
    return state.board.categories.find((c) => c.slug === slug);
  }

  function findArticle(id) {
    for (const category of state.board.categories) {
      for (const feed of category.feeds) {
        for (const article of feed.articles) {
          if (article.id === id) return article;
        }
      }
    }
    return null;
  }

  async function moveCategory(id, direction) {
    const ids = state.board.categories.map((c) => c.id);
    const from = ids.indexOf(id);
    const to = from + direction;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await api('/api/categories/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
    await loadBoard();
  }

  async function moveFeed(categoryId, feedId, direction) {
    const category = findCategory(categoryId);
    if (!category) return;
    const ids = category.feeds.map((f) => f.id);
    const from = ids.indexOf(feedId);
    const to = from + direction;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await api('/api/feeds/reorder', { method: 'POST', body: JSON.stringify({ ids }) });
    await loadBoard();
  }

  // Logo-Upload ---------------------------------------------------------------

  function fileToResizedDataUrl(file, max = 256) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Bild konnte nicht geladen werden.'));
        img.onload = () => {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/webp', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadLogo(categoryId, file) {
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      await api(`/api/categories/${categoryId}/logo`, {
        method: 'PUT',
        body: JSON.stringify({ logo: dataUrl }),
      });
      toast(t('toast_logo_saved'));
      await loadBoard();
    } catch (error) {
      toast(t('toast_logo_failed', { msg: error.message }), true);
    }
  }

  async function removeLogo(categoryId) {
    try {
      await api(`/api/categories/${categoryId}/logo`, { method: 'DELETE' });
      toast(t('toast_logo_removed'));
      await loadBoard();
    } catch (error) {
      toast(t('toast_logo_failed', { msg: error.message }), true);
    }
  }

  logoFileInput.addEventListener('change', () => {
    const file = logoFileInput.files && logoFileInput.files[0];
    const categoryId = state.logoTargetId;
    logoFileInput.value = '';
    state.logoTargetId = null;
    if (file && categoryId != null) uploadLogo(categoryId, file);
  });

  // -------------------------------------------------------------------------
  // Artikel-Vorschau beim Überfahren des Links (Bild + Kurzfassung)
  // -------------------------------------------------------------------------

  const PREVIEW_DELAY_MS = 300;
  let previewLink = null;   // Link, dessen Vorschau sichtbar oder eingeplant ist
  let previewTimer = null;

  function clearPreviewTimer() {
    if (previewTimer) {
      clearTimeout(previewTimer);
      previewTimer = null;
    }
  }

  function positionArticlePreview(link) {
    const rect = link.getBoundingClientRect();
    const width = articlePreview.offsetWidth;
    const height = articlePreview.offsetHeight;
    const gap = 10;
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    let top = rect.bottom + gap;
    if (top + height > window.innerHeight - 8) top = rect.top - height - gap; // nach oben klappen
    if (top < 8) top = 8;
    articlePreview.style.left = `${Math.round(left)}px`;
    articlePreview.style.top = `${Math.round(top)}px`;
  }

  function showArticlePreview(link, article) {
    const imageUrl = safeUrl(article.image);
    let html = '';
    if (imageUrl) html += `<img class="article-preview-img" src="${esc(imageUrl)}" alt="" onerror="this.remove()">`;
    if (article.summary) html += `<div class="article-preview-text">${esc(article.summary)}</div>`;
    if (!html) { hideArticlePreview(); return; }
    articlePreview.innerHTML = html;
    articlePreview.hidden = false;
    positionArticlePreview(link);
    // Nach dem Laden des Bildes neu positionieren (Höhe ändert sich)
    const img = articlePreview.querySelector('img');
    if (img) img.addEventListener('load', () => { if (!articlePreview.hidden) positionArticlePreview(link); }, { once: true });
  }

  function hideArticlePreview() {
    clearPreviewTimer();
    previewLink = null;
    if (!articlePreview.hidden) {
      articlePreview.hidden = true;
      articlePreview.innerHTML = '';
    }
  }

  boardEl.addEventListener('mouseover', (event) => {
    if (isTouchDevice()) return; // auf Touch-Geräten übernimmt das Sheet
    const link = event.target.closest('.article-title');
    if (!link || link === previewLink) return;
    const articleEl = link.closest('[data-article-id]');
    if (!articleEl) return;
    const article = findArticleAny(Number(articleEl.dataset.articleId));
    if (!article || (!article.image && !article.summary)) { hideArticlePreview(); return; }
    clearPreviewTimer();
    previewLink = link;
    previewTimer = setTimeout(() => {
      previewTimer = null;
      showArticlePreview(link, article);
    }, PREVIEW_DELAY_MS);
  });

  boardEl.addEventListener('mouseout', (event) => {
    const link = event.target.closest('.article-title');
    if (!link || link !== previewLink) return;
    // Innerhalb desselben Links bleiben (Kind-Elemente) nicht als Verlassen werten
    if (event.relatedTarget && link.contains(event.relatedTarget)) return;
    hideArticlePreview();
  });

  window.addEventListener('scroll', hideArticlePreview, { passive: true });

  // Ungespeicherte Eingaben des Bearbeiten-Panels merken, damit sie ein
  // erneutes Rendern (z. B. nach Logo-Upload) überstehen
  function captureEditDraft() {
    const form = boardEl.querySelector('.category-edit');
    if (!form) return;
    const nameInput = form.querySelector('[data-role="edit-name"]');
    const slugInput = form.querySelector('[data-role="edit-slug"]');
    state.editingDraft = {
      name: nameInput ? nameInput.value : '',
      slug: slugInput ? slugInput.value : '',
      slugTouched: state.editingDraft ? state.editingDraft.slugTouched : false,
    };
  }

  // Anker im Panel live aus dem Namen vorbelegen, bis er selbst angefasst wird
  boardEl.addEventListener('input', (event) => {
    const nameInput = event.target.closest('[data-role="edit-name"]');
    if (nameInput) {
      const form = nameInput.closest('.category-edit');
      const slugInput = form.querySelector('[data-role="edit-slug"]');
      if (!state.editingDraft) state.editingDraft = {};
      state.editingDraft.name = nameInput.value;
      if (!state.editingDraft.slugTouched && slugInput) {
        slugInput.value = slugify(nameInput.value);
        state.editingDraft.slug = slugInput.value;
      }
      return;
    }
    const slugInput = event.target.closest('[data-role="edit-slug"]');
    if (slugInput) {
      if (!state.editingDraft) state.editingDraft = {};
      state.editingDraft.slug = slugInput.value;
      state.editingDraft.slugTouched = slugInput.value.trim() !== '';
    }
  });

  // -------------------------------------------------------------------------
  // Event-Delegation
  // -------------------------------------------------------------------------

  boardEl.addEventListener('click', async (event) => {
    // Auf Touch-Geräten: Tippen auf einen Artikel-Link öffnet das Vorschau-Sheet
    const titleLink = event.target.closest('.article-title');
    if (titleLink && isTouchDevice()) {
      const articleEl = titleLink.closest('[data-article-id]');
      const article = articleEl ? findArticleAny(Number(articleEl.dataset.articleId)) : null;
      if (article && (article.image || article.summary)) {
        event.preventDefault();
        openPreviewSheet(article);
        return;
      }
    }

    const actionEl = event.target.closest('[data-action]');
    if (!actionEl || actionEl.tagName === 'FORM') return;

    const action = actionEl.dataset.action;
    const categoryEl = actionEl.closest('[data-category-id]');
    const feedEl = actionEl.closest('[data-feed-id]');
    const articleEl = actionEl.closest('[data-article-id]');
    const categoryId = categoryEl ? Number(categoryEl.dataset.categoryId) : null;
    const feedId = feedEl ? Number(feedEl.dataset.feedId) : null;

    try {
      switch (action) {
        case 'open-category': {
          // Im Bearbeitungsmodus nicht öffnen — dort wird die Kachel verwaltet
          if (state.editMode) return;
          const category = findCategory(categoryId);
          if (category?.slug) openCategory(category.slug);
          break;
        }
        case 'back-to-categories':
          backToCategories();
          break;
        case 'toggle-summary': {
          if (event.target.closest('a')) return; // Link-Klick nicht abfangen
          const articleId = Number(articleEl.dataset.articleId);
          state.expanded.has(articleId) ? state.expanded.delete(articleId) : state.expanded.add(articleId);
          articleEl.classList.toggle('expanded');
          break;
        }
        case 'article-fulltext':
          await runArticleAction(Number(articleEl.dataset.articleId), 'fulltext');
          break;
        case 'article-ai-summary':
          await runArticleAction(Number(articleEl.dataset.articleId), 'summary');
          break;
        case 'article-ai-translate':
          await runArticleAction(Number(articleEl.dataset.articleId), 'translate');
          break;
        case 'article-share':
          await shareArticle(Number(articleEl.dataset.articleId));
          break;
        case 'toggle-read':
          await toggleArticleRead(Number(articleEl.dataset.articleId));
          break;
        case 'toggle-star':
          await toggleArticleStarred(Number(articleEl.dataset.articleId));
          break;
        case 'feed-mark-read':
          await markFeedRead(feedId);
          break;
        case 'category-mark-read':
          await markCategoryRead(categoryId);
          break;
        case 'show-more':
          state.showAll.add(feedId);
          render();
          break;
        case 'show-less':
          state.showAll.delete(feedId);
          render();
          break;
        case 'start-editing':
          setEditMode(true);
          break;
        case 'category-up':
          await moveCategory(categoryId, -1);
          break;
        case 'category-down':
          await moveCategory(categoryId, +1);
          break;
        case 'category-logo':
          captureEditDraft();
          state.logoTargetId = categoryId;
          logoFileInput.click();
          break;
        case 'category-logo-remove':
          captureEditDraft();
          await removeLogo(categoryId);
          break;
        case 'category-edit':
          state.editingCategory = categoryId;
          state.editingDraft = null;
          render();
          boardEl.querySelector('.category-edit [data-role="edit-name"]')?.focus();
          break;
        case 'edit-cancel':
          state.editingCategory = null;
          state.editingDraft = null;
          render();
          break;
        case 'category-delete': {
          const category = findCategory(categoryId);
          const feedCount = category ? category.feeds.length : 0;
          const suffix = feedCount ? t('confirm_delete_category_suffix', { feeds: feedCountLabel(feedCount) }) : '';
          if (!confirm(t('confirm_delete_category', { name: category?.name, suffix }))) return;
          await api(`/api/categories/${categoryId}`, { method: 'DELETE' });
          toast(t('toast_category_deleted'));
          await loadBoard();
          break;
        }
        case 'feed-up':
          await moveFeed(categoryId, feedId, -1);
          break;
        case 'feed-down':
          await moveFeed(categoryId, feedId, +1);
          break;
        case 'feed-toggle-enabled': {
          const category = findCategory(categoryId);
          const feed = category?.feeds.find((f) => f.id === feedId);
          await api(`/api/feeds/${feedId}`, {
            method: 'PATCH',
            body: JSON.stringify({ enabled: feed ? feed.enabled === false : true }),
          });
          await loadBoard();
          break;
        }
        case 'feed-rename':
          state.renaming = { type: 'feed', id: feedId };
          render();
          boardEl.querySelector('.rename-form input')?.focus();
          break;
        case 'feed-delete': {
          const category = findCategory(categoryId);
          const feed = category?.feeds.find((f) => f.id === feedId);
          if (!confirm(t('confirm_delete_feed', { name: feed?.name }))) return;
          await api(`/api/feeds/${feedId}`, { method: 'DELETE' });
          toast(t('toast_feed_deleted'));
          await loadBoard();
          break;
        }
        case 'rename-cancel':
          state.renaming = null;
          render();
          break;
      }
    } catch (error) {
      toast(error.message, true);
    }
  });

  boardEl.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-action]');
    if (!form) return;
    event.preventDefault();

    const action = form.dataset.action;
    const categoryEl = form.closest('[data-category-id]');
    const feedEl = form.closest('[data-feed-id]');
    const categoryId = categoryEl ? Number(categoryEl.dataset.categoryId) : null;
    const feedId = feedEl ? Number(feedEl.dataset.feedId) : null;

    try {
      switch (action) {
        case 'feed-add': {
          const url = form.elements.url.value.trim();
          const name = form.elements.name.value.trim();
          if (!url) return;
          await addFeed(categoryId, url, name, form.querySelector('button[type="submit"]'));
          break;
        }
        case 'category-edit-submit': {
          const name = form.querySelector('[data-role="edit-name"]').value.trim();
          const slug = form.querySelector('[data-role="edit-slug"]').value.trim();
          if (!name) return;
          await api(`/api/categories/${categoryId}`, { method: 'PATCH', body: JSON.stringify({ name, slug }) });
          state.editingCategory = null;
          state.editingDraft = null;
          await loadBoard();
          break;
        }
        case 'feed-rename-submit': {
          const name = form.querySelector('input').value.trim();
          if (!name) return;
          await api(`/api/feeds/${feedId}`, { method: 'PATCH', body: JSON.stringify({ name }) });
          state.renaming = null;
          await loadBoard();
          break;
        }
      }
    } catch (error) {
      toast(error.message, true);
    }
  });

  // Anker-Feld wird aus dem Namen vorbelegt, bis der Nutzer es selbst anfasst
  let slugEdited = false;
  inputCategoryName.addEventListener('input', () => {
    if (!slugEdited) inputCategorySlug.value = slugify(inputCategoryName.value);
  });
  inputCategorySlug.addEventListener('input', () => {
    slugEdited = inputCategorySlug.value.trim() !== '';
  });

  formAddCategory.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = inputCategoryName.value.trim();
    if (!name) return;
    const slug = inputCategorySlug.value.trim();
    try {
      await addCategory(name, slug);
      inputCategoryName.value = '';
      inputCategorySlug.value = '';
      slugEdited = false;
    } catch (error) {
      toast(error.message, true);
    }
  });

  btnRefresh.addEventListener('click', refreshAll);
  btnEdit.addEventListener('click', () => {
    setSettingsOpen(false);
    // Bearbeiten verlangt eine Anmeldung, sobald ein Passwort gesetzt ist
    if (!state.editMode && needsLogin()) {
      openLoginSheet(() => setEditMode(true));
      return;
    }
    setEditMode(!state.editMode);
  });
  segLang.addEventListener('click', (event) => {
    const knopf = event.target.closest('[data-lang]');
    if (knopf) setLang(knopf.dataset.lang);
  });

  // Einstellungs-Zahnrad: auf-/zuklappen
  function setSettingsOpen(open) {
    settingsDialog.hidden = !open;
    btnSettings.setAttribute('aria-expanded', open ? 'true' : 'false');
    // Hintergrund nicht mitscrollen lassen, solange das Fenster offen ist
    document.body.classList.toggle('dialog-open', open);
    if (open) settingsDialog.querySelector('.dialog-nav-btn.is-active')?.focus();
  }

  function showSettingsSection(name) {
    settingsNav.querySelectorAll('.dialog-nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.section === name));
    settingsDialog.querySelectorAll('.dialog-pane').forEach((p) => p.classList.toggle('is-active', p.dataset.pane === name));
  }

  btnSettings.addEventListener('click', () => setSettingsOpen(settingsDialog.hidden));
  btnSettingsClose.addEventListener('click', () => setSettingsOpen(false));
  settingsBackdrop.addEventListener('click', () => setSettingsOpen(false));
  settingsNav.addEventListener('click', (event) => {
    const knopf = event.target.closest('.dialog-nav-btn');
    if (knopf) showSettingsSection(knopf.dataset.section);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setSettingsOpen(false);
  });

  btnUnread.addEventListener('click', () => setUnreadOnly(!state.unreadOnly));
  btnSaved.addEventListener('click', () => setSavedView(!state.savedView));
  btnRiver.addEventListener('click', () => setRiverView(!state.riverView));

  // Zahnrad: KI, Daten, Abmelden
  btnBriefing.addEventListener('click', showBriefing);
  btnLogout.addEventListener('click', logout);
  btnLogin.addEventListener('click', () => openLoginSheet());
  btnPassword.addEventListener('click', openPasswordSheet);
  btnOpmlImport.addEventListener('click', () => opmlFileInput.click());
  btnRestore.addEventListener('click', () => backupFileInput.click());

  opmlFileInput.addEventListener('change', () => {
    const file = opmlFileInput.files && opmlFileInput.files[0];
    opmlFileInput.value = '';
    if (file) importOpml(file);
  });
  backupFileInput.addEventListener('change', () => {
    const file = backupFileInput.files && backupFileInput.files[0];
    backupFileInput.value = '';
    if (file) restoreBackup(file);
  });

  // -------------------------------------------------------------------------
  // Tastatur-Navigation
  // -------------------------------------------------------------------------

  const SHORTCUTS = [
    ['j / k', 'shortcut_move'],
    ['o', 'shortcut_open'],
    ['m', 'shortcut_read'],
    ['s', 'shortcut_star'],
    ['r', 'shortcut_refresh'],
    ['u', 'shortcut_unread'],
    ['a', 'shortcut_river'],
    ['/', 'shortcut_search'],
    ['Esc', 'shortcut_back'],
  ];

  function renderShortcutList() {
    shortcutList.innerHTML = SHORTCUTS
      .map(([key, label]) => `<div class="shortcut"><kbd>${esc(key)}</kbd><span>${esc(t(label))}</span></div>`)
      .join('');
  }

  function articleElements() {
    return Array.from(boardEl.querySelectorAll('[data-article-id]'));
  }

  function setSelected(id) {
    state.selectedId = id;
    for (const el of articleElements()) {
      el.classList.toggle('selected', Number(el.dataset.articleId) === id);
    }
    const active = boardEl.querySelector(`[data-article-id="${id}"]`);
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function moveSelection(delta) {
    const ids = articleElements().map((el) => Number(el.dataset.articleId));
    if (!ids.length) return;
    let index = ids.indexOf(state.selectedId);
    if (index < 0) index = delta > 0 ? -1 : 0;
    setSelected(ids[Math.min(ids.length - 1, Math.max(0, index + delta))]);
  }

  function isTypingTarget(target) {
    return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  }

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (!previewSheet.hidden) return; // das Sheet hat eigene Tasten (Esc)

    const id = state.selectedId;
    switch (event.key) {
      case 'j': moveSelection(+1); break;
      case 'k': moveSelection(-1); break;
      case 'o':
      case 'Enter': {
        const article = id != null ? findArticleAny(id) : null;
        const url = article && safeUrl(article.link);
        if (url) window.open(url, '_blank', 'noopener');
        break;
      }
      case 'm': if (id != null) toggleArticleRead(id); break;
      case 's': if (id != null) toggleArticleStarred(id); break;
      case 'r': refreshAll(); break;
      case 'u': setUnreadOnly(!state.unreadOnly); break;
      case 'a': setRiverView(!state.riverView); break;
      case '/':
        inputSearch.focus();
        inputSearch.select();
        break;
      case 'Escape':
        if (state.searchQuery) clearSearch();
        else if (state.savedView) setSavedView(false);
        else if (state.riverView) setRiverView(false);
        else if (state.view === 'category') backToCategories();
        break;
      default: return;
    }
    event.preventDefault();
  });

  // Anzeige-Einstellungen im Zahnrad
  segFontSize.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-fontsize]');
    if (btn) setFontSize(btn.dataset.fontsize);
  });
  segDensity.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-density]');
    if (btn) setDensity(btn.dataset.density);
  });
  chkThumbnails.addEventListener('change', () => setThumbnails(chkThumbnails.checked));
  chkDedupe.addEventListener('change', () => setDedupe(chkDedupe.checked));
  btnIntegrationsSave.addEventListener('click', saveIntegrations);
  btnIntegrationsTest.addEventListener('click', testTelegram);
  clearTgToken.addEventListener('click', () => clearSecret('telegram_bot_token'));
  clearAiKey.addEventListener('click', () => clearSecret('anthropic_api_key'));
  chkFaviconCache.addEventListener('change', () => setFaviconCache(chkFaviconCache.checked));
  btnMuteSave.addEventListener('click', saveMuteWords);

  inputSearch.addEventListener('input', () => onSearchInput(inputSearch.value));
  inputSearch.addEventListener('keydown', (event) => { if (event.key === 'Escape') clearSearch(); });
  btnSearchClear.addEventListener('click', clearSearch);

  // Vorschau-Sheet schließen (Backdrop, Schließen-Button, „Öffnen"-Link)
  previewSheet.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="sheet-close"]')) closePreviewSheet();
  });

  // Anmelde- und Passwort-Formular im Sheet
  previewSheet.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-action]');
    if (!form) return;
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      if (form.dataset.action === 'login-submit') await submitLogin(form);
      if (form.dataset.action === 'password-submit') await submitPassword(form);
    } catch (error) {
      toast(error.message, true);
      form.querySelector('input')?.select();
    } finally {
      if (submit) submit.disabled = false;
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !previewSheet.hidden) closePreviewSheet();
  });

  // -------------------------------------------------------------------------
  // Theme
  // -------------------------------------------------------------------------

  const THEME_PREFS = ['light', 'dark', 'system'];
  const darkQuery = matchMedia('(prefers-color-scheme: dark)');

  // Tatsächlich sichtbares Design — bei „System" die Betriebssystem-Einstellung
  function effectiveTheme() {
    if (state.themePref === 'system') return darkQuery.matches ? 'dark' : 'light';
    return state.themePref;
  }

  // Farbe der Browser-/System-Leiste an das sichtbare Design koppeln.
  // Bei „System" entscheiden die media-Abfragen, sonst wird die passende Variante fest geschaltet.
  function applyThemeColor(theme) {
    metaThemeColors.forEach((meta) => {
      const variant = meta.dataset.themeColor;
      const media = state.themePref === 'system'
        ? `(prefers-color-scheme: ${variant})`
        : (variant === theme ? 'all' : 'not all');
      meta.setAttribute('media', media);
    });
  }

  function applyTheme() {
    const theme = effectiveTheme();
    document.documentElement.dataset.theme = theme;
    applyThemeColor(theme);
    segTheme.querySelectorAll('[data-theme-pref]').forEach((b) => b.classList.toggle('active', b.dataset.themePref === state.themePref));
  }

  function setTheme(pref) {
    state.themePref = THEME_PREFS.includes(pref) ? pref : 'system';
    localStorage.setItem('feedboard-theme', state.themePref);
    applyTheme();
  }

  // Runder Knopf: schnelles Umschalten hell/dunkel, ausgehend vom sichtbaren Design
  btnTheme.addEventListener('click', () => setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark'));

  segTheme.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-theme-pref]');
    if (btn) setTheme(btn.dataset.themePref);
  });

  // Systemwechsel live übernehmen, solange „System" gewählt ist
  darkQuery.addEventListener('change', () => { if (state.themePref === 'system') applyTheme(); });

  // Ältere Installationen haben nur 'light'/'dark' gespeichert — bleibt gültig
  setTheme(localStorage.getItem('feedboard-theme') || 'system');

  // -------------------------------------------------------------------------
  // Start & Auto-Reload
  // -------------------------------------------------------------------------

  // Die Wörterbücher kommen jetzt über das Netz, der Start wartet darauf.
  // Ohne sie stünden überall rohe Schlüssel — lieber einen Wimpernschlag später
  // rendern als eine Oberfläche voller "toast_feed_added".
  async function start() {
  state.lang = ermittelteStartsprache();
  document.documentElement.lang = state.lang;
  try {
    await loadDictionary(FALLBACK_LANG);
    if (state.lang !== FALLBACK_LANG) await loadDictionary(state.lang);
  } catch {
    // Offline und nichts im Cache: die Oberfläche bleibt bei den im HTML
    // hinterlegten deutschen Beschriftungen, der Rest läuft normal weiter.
  }
  applyStaticI18n();
  updateLangButtons();

  renderShortcutList();

  state.unreadOnly = localStorage.getItem('feedboard-unread-only') === '1';
  btnUnread.classList.toggle('active', state.unreadOnly);
  btnUnread.setAttribute('aria-pressed', state.unreadOnly ? 'true' : 'false');

  state.riverView = localStorage.getItem('feedboard-river') === '1';
  btnRiver.classList.toggle('active', state.riverView);
  btnRiver.setAttribute('aria-pressed', state.riverView ? 'true' : 'false');

  // Anzeige-Einstellungen laden und anwenden
  const savedFont = localStorage.getItem('feedboard-fontsize');
  state.fontSize = ['small', 'normal', 'large'].includes(savedFont) ? savedFont : 'normal';
  state.density = localStorage.getItem('feedboard-density') === 'compact' ? 'compact' : 'comfortable';
  state.thumbnails = localStorage.getItem('feedboard-thumbnails') === '1';
  // Standard an: nur ein ausdrückliches Abschalten wird gespeichert.
  state.dedupe = localStorage.getItem('feedboard-dedupe') !== '0';
  state.faviconCache = localStorage.getItem('feedboard-favicon-cache') === '1';
  applyDisplaySettings();
  loadMuteWords();

  applyHashToState();
  updateClock();
  setInterval(updateClock, 60 * 1000);

  loadBoard();

  setInterval(() => {
    // Nicht neu rendern, während bearbeitet, gesucht oder ein Sheet offen ist
    if (!state.editMode && !state.renaming && !state.editingCategory && !state.searchQuery && !state.savedView && previewSheet.hidden) {
      loadBoard({ silent: true });
    }
  }, AUTO_RELOAD_MS);
  }

  start();

  // Service-Worker für PWA/Offline registrieren
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => { /* egal */ });
    });
  }
})();
