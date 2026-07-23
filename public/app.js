// app.js — Feedboard Frontend
'use strict';

(() => {
  const ARTICLES_VISIBLE = 8;
  const AUTO_RELOAD_MS = 60 * 1000;

  // -------------------------------------------------------------------------
  // Übersetzungen (Komplette UI-Sprache de/ru)
  // -------------------------------------------------------------------------

  const translations = {
    de: {
      status_label: 'Stand:',
      refresh_title: 'Alle Feeds jetzt aktualisieren',
      refresh_label: 'Aktualisieren',
      edit_title: 'Rubriken und Feeds verwalten',
      edit_label: 'Bearbeiten',
      theme_title: 'Design wechseln (hell/dunkel)',
      new_category_placeholder: 'Neue Rubrik …',
      anchor_placeholder: 'anker',
      create_category: 'Rubrik anlegen',
      name_label: 'Name',
      anchor_label: 'Anker',
      logo_label: 'Logo',
      save: 'Speichern',
      edit_hint_categories: 'Bearbeitungsmodus — Rubriken anlegen, umbenennen, sortieren und löschen.',
      edit_hint_feeds: 'Bearbeitungsmodus — Feeds hinzufügen, umbenennen, sortieren und löschen.',
      back_all: 'Alle Rubriken',
      no_feeds: 'Noch keine Feeds in dieser Rubrik.',
      no_articles: 'Noch keine Artikel geladen.',
      feed_add_url_placeholder: 'Website-URL, RSS oder Telegram (t.me/kanal, @kanal)',
      feed_add_name_placeholder: 'Name (optional, wird sonst erkannt)',
      feed_add_submit: 'Feed hinzufügen',
      feed_add_hint: 'Website-Adresse (RSS wird automatisch gesucht) oder ein Telegram-Kanal: t.me/kanal bzw. @kanal.',
      searching_feed: 'Suche Feed …',
      show_more: 'weitere anzeigen',
      show_less: 'weniger anzeigen',
      ok: 'OK',
      cancel: 'Abbr.',
      board_empty_title: 'Noch ganz leer hier.',
      board_empty_text: 'Leg deine erste Rubrik an und füge ihr RSS-Feeds hinzu.',
      board_empty_btn: 'Erste Rubrik anlegen',
      category_move_prev: 'Nach vorn',
      category_move_next: 'Nach hinten',
      rename_category_title: 'Rubrik bearbeiten',
      delete_category_title: 'Rubrik löschen',
      logo_upload_title: 'Logo hochladen',
      logo_remove_title: 'Logo entfernen',
      feed_move_up: 'Nach oben',
      feed_move_down: 'Nach unten',
      rename_feed_title: 'Feed umbenennen',
      delete_feed_title: 'Feed löschen',
      feed_error_prefix: 'Letzter Abruf fehlgeschlagen:',
      refreshed: 'Aktualisiert',
      ok_suffix: 'ok',
      failed_suffix: 'fehlgeschlagen',
      toast_refreshing_running: 'Eine Aktualisierung läuft bereits.',
      toast_category_added: 'Rubrik „{name}“ angelegt.',
      toast_feed_added: 'Feed „{name}“ hinzugefügt.',
      toast_category_deleted: 'Rubrik gelöscht.',
      toast_feed_deleted: 'Feed gelöscht.',
      toast_board_load_failed: 'Board konnte nicht geladen werden: {msg}',
      toast_refresh_failed: 'Aktualisierung fehlgeschlagen: {msg}',
      toast_logo_saved: 'Logo gespeichert.',
      toast_logo_removed: 'Logo entfernt.',
      toast_logo_failed: 'Logo konnte nicht gespeichert werden: {msg}',
      confirm_delete_category: 'Rubrik „{name}“{suffix} wirklich löschen?',
      confirm_delete_category_suffix: ' samt {feeds}',
      confirm_delete_feed: 'Feed „{name}“ wirklich löschen?',
      time_now: 'jetzt',
      time_min: '{n} Min.',
      time_hours: '{n} Std.',
      time_yesterday: 'gestern',
      time_days: '{n} Tg.',
    },
    ru: {
      status_label: 'Обновлено:',
      refresh_title: 'Обновить все ленты',
      refresh_label: 'Обновить',
      edit_title: 'Управление рубриками и лентами',
      edit_label: 'Править',
      theme_title: 'Сменить тему (светлая/тёмная)',
      new_category_placeholder: 'Новая рубрика …',
      anchor_placeholder: 'anker',
      create_category: 'Создать рубрику',
      name_label: 'Название',
      anchor_label: 'Якорь',
      logo_label: 'Логотип',
      save: 'Сохранить',
      edit_hint_categories: 'Режим редактирования — рубрики: создание, переименование, сортировка, удаление.',
      edit_hint_feeds: 'Режим редактирования — ленты: добавление, переименование, сортировка, удаление.',
      back_all: 'Все рубрики',
      no_feeds: 'В этой рубрике пока нет лент.',
      no_articles: 'Статьи ещё не загружены.',
      feed_add_url_placeholder: 'Сайт, RSS или Telegram (t.me/канал, @канал)',
      feed_add_name_placeholder: 'Название (необязательно)',
      feed_add_submit: 'Добавить ленту',
      feed_add_hint: 'Адрес сайта (RSS найдётся автоматически) или Telegram-канал: t.me/канал или @канал.',
      searching_feed: 'Поиск ленты …',
      show_more: 'показать ещё',
      show_less: 'свернуть',
      ok: 'OK',
      cancel: 'Отм.',
      board_empty_title: 'Здесь пока пусто.',
      board_empty_text: 'Создайте первую рубрику и добавьте в неё RSS-ленты.',
      board_empty_btn: 'Создать первую рубрику',
      category_move_prev: 'Вперёд',
      category_move_next: 'Назад',
      rename_category_title: 'Редактировать рубрику',
      delete_category_title: 'Удалить рубрику',
      logo_upload_title: 'Загрузить логотип',
      logo_remove_title: 'Удалить логотип',
      feed_move_up: 'Вверх',
      feed_move_down: 'Вниз',
      rename_feed_title: 'Переименовать ленту',
      delete_feed_title: 'Удалить ленту',
      feed_error_prefix: 'Последний запрос не удался:',
      refreshed: 'Обновлено',
      ok_suffix: 'ок',
      failed_suffix: 'с ошибкой',
      toast_refreshing_running: 'Обновление уже выполняется.',
      toast_category_added: 'Рубрика «{name}» создана.',
      toast_feed_added: 'Лента «{name}» добавлена.',
      toast_category_deleted: 'Рубрика удалена.',
      toast_feed_deleted: 'Лента удалена.',
      toast_board_load_failed: 'Не удалось загрузить: {msg}',
      toast_refresh_failed: 'Ошибка обновления: {msg}',
      toast_logo_saved: 'Логотип сохранён.',
      toast_logo_removed: 'Логотип удалён.',
      toast_logo_failed: 'Не удалось сохранить логотип: {msg}',
      confirm_delete_category: 'Удалить рубрику «{name}»{suffix}?',
      confirm_delete_category_suffix: ' вместе с {feeds}',
      confirm_delete_feed: 'Удалить ленту «{name}»?',
      time_now: 'сейчас',
      time_min: '{n} мин.',
      time_hours: '{n} ч.',
      time_yesterday: 'вчера',
      time_days: '{n} дн.',
    },
  };

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
  const langButtons = document.querySelectorAll('.lang-btn');
  const logoFileInput = document.getElementById('logo-file-input');
  const articlePreview = document.getElementById('article-preview');

  // -------------------------------------------------------------------------
  // i18n-Hilfsfunktionen
  // -------------------------------------------------------------------------

  function t(key, params) {
    const dict = translations[state.lang] || translations.de;
    let str = dict[key] ?? translations.de[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) str = str.replaceAll(`{${k}}`, v);
    }
    return str;
  }

  function locale() {
    return state.lang === 'ru' ? 'ru-RU' : 'de-DE';
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

  function feedCountLabel(n) {
    if (state.lang === 'ru') {
      const mod10 = n % 10;
      const mod100 = n % 100;
      let word;
      if (mod10 === 1 && mod100 !== 11) word = 'фид';
      else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) word = 'фида';
      else word = 'фидов';
      return `${n} ${word}`;
    }
    return `${n} ${n === 1 ? 'Feed' : 'Feeds'}`;
  }

  function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  }

  function updateLangButtons() {
    langButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.lang === state.lang));
  }

  function setLang(lang) {
    state.lang = lang === 'ru' ? 'ru' : 'de';
    localStorage.setItem('feedboard-lang', state.lang);
    document.documentElement.lang = state.lang;
    applyStaticI18n();
    updateLangButtons();
    updateClock();
    render();
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
      throw new Error((data && data.error) || `Fehler ${response.status}`);
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

  function faviconHtml(feed) {
    const host = hostnameOf(feed.site_url || feed.rss_url);
    const letter = esc((feed.name || '?').charAt(0));
    if (!host) return `<span class="feed-favicon-fallback">${letter}</span>`;
    return `<img class="feed-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;feed-favicon-fallback&quot;>${letter}</span>'">`;
  }

  function articleHtml(article) {
    const hasSummary = !!article.summary;
    const expanded = state.expanded.has(article.id);
    const fresh = isFresh(article.published_at || article.fetched_at);
    const link = safeUrl(article.link);
    const title = link
      ? `<a class="article-title" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(article.title)}</a>`
      : `<span class="article-title">${esc(article.title)}</span>`;

    return `
      <li class="article${hasSummary ? ' has-summary' : ''}${expanded ? ' expanded' : ''}${fresh ? ' article-fresh' : ''}" data-article-id="${article.id}">
        <div class="article-row" ${hasSummary ? 'data-action="toggle-summary" title="Kurzfassung ein-/ausblenden"' : ''}>
          <span class="article-time">${esc(relativeTime(article.published_at || article.fetched_at))}</span>
          ${title}
          ${hasSummary ? '<svg class="article-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' : ''}
        </div>
        ${hasSummary ? `<div class="article-summary">${esc(article.summary)}</div>` : ''}
      </li>`;
  }

  function feedToolsHtml(feed, index, total) {
    return `
      <span class="feed-tools">
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
    const articles = showAll ? feed.articles : feed.articles.slice(0, ARTICLES_VISIBLE);
    const hiddenCount = feed.articles.length - articles.length;

    const nameHtml = renaming
      ? `<form class="rename-form" data-action="feed-rename-submit">
           <input type="text" value="${esc(feed.name)}" maxlength="120" required>
           <button type="submit" class="btn btn-accent">${esc(t('ok'))}</button>
           <button type="button" class="btn" data-action="rename-cancel">${esc(t('cancel'))}</button>
         </form>`
      : siteLink
        ? `<a class="feed-name" href="${esc(siteLink)}" target="_blank" rel="noopener noreferrer">${esc(feed.name)}</a>`
        : `<span class="feed-name">${esc(feed.name)}</span>`;

    return `
      <div class="feed" data-feed-id="${feed.id}">
        <div class="feed-header">
          ${faviconHtml(feed)}
          ${nameHtml}
          ${feed.last_error ? `<span class="feed-error" title="${esc(t('feed_error_prefix'))} ${esc(feed.last_error)}">⚠</span>` : ''}
          ${feedToolsHtml(feed, index, total)}
        </div>
        ${feed.articles.length
          ? `<ul class="articles">${articles.map(articleHtml).join('')}</ul>`
          : `<div class="feed-empty">${esc(t('no_articles'))}</div>`}
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
    return `
      <section class="category category-open" data-category-id="${category.id}">
        <div class="category-header">
          <button class="btn-back" data-action="back-to-categories" title="${esc(t('back_all'))}">
            <svg class="icon" style="width:15px;height:15px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            <span>${esc(t('back_all'))}</span>
          </button>
          <h2 class="category-title">${esc(category.name)}</h2>
          <span class="category-count">${esc(feedCountLabel(feedCount))}</span>
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
        ${category.feeds.length
          ? `<div class="feeds-grid">${category.feeds.map((feed, i) => feedHtml(feed, i, category.feeds.length)).join('')}</div>`
          : `<div class="category-empty">${esc(t('no_feeds'))}</div>`}
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

  function render() {
    if (!state.board) return;
    hideArticlePreview();
    updateEditBar();

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
    const link = event.target.closest('.article-title');
    if (!link || link === previewLink) return;
    const articleEl = link.closest('[data-article-id]');
    if (!articleEl) return;
    const article = findArticle(Number(articleEl.dataset.articleId));
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
  btnEdit.addEventListener('click', () => setEditMode(!state.editMode));
  langButtons.forEach((btn) => btn.addEventListener('click', () => setLang(btn.dataset.lang)));

  // -------------------------------------------------------------------------
  // Theme
  // -------------------------------------------------------------------------

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('feedboard-theme', theme);
  }

  btnTheme.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  const savedTheme = localStorage.getItem('feedboard-theme');
  applyTheme(savedTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  // -------------------------------------------------------------------------
  // Start & Auto-Reload
  // -------------------------------------------------------------------------

  const savedLang = localStorage.getItem('feedboard-lang');
  state.lang = savedLang === 'ru' ? 'ru' : 'de';
  document.documentElement.lang = state.lang;
  applyStaticI18n();
  updateLangButtons();

  applyHashToState();
  updateClock();
  setInterval(updateClock, 60 * 1000);

  loadBoard();

  setInterval(() => {
    // Im Bearbeitungsmodus nicht neu rendern (würde Formulareingaben verwerfen)
    if (!state.editMode && !state.renaming) loadBoard({ silent: true });
  }, AUTO_RELOAD_MS);
})();
