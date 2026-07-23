// app.js — Feedboard Frontend
'use strict';

(() => {
  const ARTICLES_VISIBLE = 8;
  const AUTO_RELOAD_MS = 60 * 1000;

  const state = {
    board: null,
    editMode: false,
    expanded: new Set(),   // Artikel-IDs mit ausgeklappter Kurzfassung
    showAll: new Set(),    // Feed-IDs, die alle Artikel anzeigen
    renaming: null,        // { type: 'category' | 'feed', id }
    loading: false,
  };

  const boardEl = document.getElementById('board');
  const editBar = document.getElementById('edit-bar');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnEdit = document.getElementById('btn-edit');
  const btnTheme = document.getElementById('btn-theme');
  const lastUpdatedEl = document.getElementById('last-updated');
  const todayDateEl = document.getElementById('today-date');
  const formAddCategory = document.getElementById('form-add-category');
  const inputCategoryName = document.getElementById('input-category-name');
  const toastContainer = document.getElementById('toast-container');

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
    if (diffMinutes < 1) return 'jetzt';
    if (diffMinutes < 60) return `${diffMinutes} Min.`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} Std.`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'gestern';
    if (diffDays < 7) return `${diffDays} Tg.`;
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  }

  function isFresh(value) {
    const date = parseDbDate(value);
    return !!date && Date.now() - date.getTime() < 3 * 60 * 60 * 1000;
  }

  function updateClock() {
    todayDateEl.textContent = new Date().toLocaleDateString('de-DE', {
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
        <button class="btn-ghost" data-action="feed-up" title="Nach oben" ${index === 0 ? 'disabled' : ''}>▲</button>
        <button class="btn-ghost" data-action="feed-down" title="Nach unten" ${index === total - 1 ? 'disabled' : ''}>▼</button>
        <button class="btn-ghost" data-action="feed-rename" title="Feed umbenennen">
          <svg class="icon" style="width:13px;height:13px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button class="btn-ghost btn-danger" data-action="feed-delete" title="Feed löschen">✕</button>
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
           <button type="submit" class="btn btn-accent">OK</button>
           <button type="button" class="btn" data-action="rename-cancel">Abbr.</button>
         </form>`
      : siteLink
        ? `<a class="feed-name" href="${esc(siteLink)}" target="_blank" rel="noopener noreferrer">${esc(feed.name)}</a>`
        : `<span class="feed-name">${esc(feed.name)}</span>`;

    return `
      <div class="feed" data-feed-id="${feed.id}">
        <div class="feed-header">
          ${faviconHtml(feed)}
          ${nameHtml}
          ${feed.last_error ? `<span class="feed-error" title="Letzter Abruf fehlgeschlagen: ${esc(feed.last_error)}">⚠</span>` : ''}
          ${feedToolsHtml(feed, index, total)}
        </div>
        ${feed.articles.length
          ? `<ul class="articles">${articles.map(articleHtml).join('')}</ul>`
          : '<div class="feed-empty">Noch keine Artikel geladen.</div>'}
        ${hiddenCount > 0 ? `<button class="articles-more" data-action="show-more">+ ${hiddenCount} weitere anzeigen</button>` : ''}
        ${showAll && feed.articles.length > ARTICLES_VISIBLE ? '<button class="articles-more" data-action="show-less">weniger anzeigen</button>' : ''}
      </div>`;
  }

  function categoryHtml(category, index, total) {
    const renaming = state.renaming && state.renaming.type === 'category' && state.renaming.id === category.id;
    const feedCount = category.feeds.length;

    const titleHtml = renaming
      ? `<form class="rename-form" data-action="category-rename-submit">
           <input type="text" value="${esc(category.name)}" maxlength="80" required>
           <button type="submit" class="btn btn-accent">OK</button>
           <button type="button" class="btn" data-action="rename-cancel">Abbr.</button>
         </form>`
      : `<h2 class="category-title">${esc(category.name)}</h2>`;

    return `
      <section class="category" data-category-id="${category.id}" style="animation-delay:${Math.min(index * 60, 400)}ms">
        <div class="category-header">
          ${titleHtml}
          <span class="category-count">${feedCount} ${feedCount === 1 ? 'Feed' : 'Feeds'}</span>
          <span class="category-tools">
            <button class="btn-ghost" data-action="category-up" title="Nach vorn" ${index === 0 ? 'disabled' : ''}>◀</button>
            <button class="btn-ghost" data-action="category-down" title="Nach hinten" ${index === total - 1 ? 'disabled' : ''}>▶</button>
            <button class="btn-ghost" data-action="category-rename" title="Rubrik umbenennen">
              <svg class="icon" style="width:13px;height:13px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <button class="btn-ghost btn-danger" data-action="category-delete" title="Rubrik löschen">✕</button>
          </span>
        </div>
        ${category.feeds.length
          ? category.feeds.map((feed, i) => feedHtml(feed, i, category.feeds.length)).join('')
          : '<div class="category-empty">Noch keine Feeds in dieser Rubrik.</div>'}
        <div class="feed-add">
          <form class="feed-add-form" data-action="feed-add">
            <div class="feed-add-row">
              <input type="text" name="url" placeholder="Feed- oder Website-URL, z. B. heise.de" required autocomplete="off">
            </div>
            <div class="feed-add-row">
              <input type="text" name="name" placeholder="Name (optional, wird sonst erkannt)" maxlength="120" autocomplete="off">
              <button type="submit" class="btn btn-accent">Feed hinzufügen</button>
            </div>
            <span class="feed-add-hint">Es reicht die normale Website-Adresse — der RSS-Feed wird automatisch gesucht.</span>
          </form>
        </div>
      </section>`;
  }

  function render() {
    if (!state.board) return;
    const { categories } = state.board;

    if (!categories.length) {
      boardEl.innerHTML = `
        <div class="board-empty">
          <h2>Noch ganz leer hier.</h2>
          <p>Leg deine erste Rubrik an und füge ihr RSS-Feeds hinzu.</p>
          <button class="btn btn-accent" data-action="start-editing">Erste Rubrik anlegen</button>
        </div>`;
      return;
    }

    boardEl.innerHTML = categories
      .map((category, index) => categoryHtml(category, index, categories.length))
      .join('');
  }

  // -------------------------------------------------------------------------
  // Daten laden
  // -------------------------------------------------------------------------

  async function loadBoard({ silent = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    try {
      state.board = await api('/api/board');
      render();
      lastUpdatedEl.textContent = new Date().toLocaleTimeString('de-DE', {
        hour: '2-digit', minute: '2-digit',
      });
    } catch (error) {
      if (!silent) toast(`Board konnte nicht geladen werden: ${error.message}`, true);
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
    document.body.classList.toggle('edit-mode', active);
    editBar.classList.toggle('hidden', !active);
    btnEdit.classList.toggle('active', active);
    if (active) inputCategoryName.focus();
    render();
  }

  async function refreshAll() {
    btnRefresh.classList.add('spinning');
    btnRefresh.disabled = true;
    try {
      const result = await api('/api/refresh', { method: 'POST' });
      if (result.skipped) {
        toast('Eine Aktualisierung läuft bereits.');
      } else {
        toast(`Aktualisiert: ${result.ok} Feed${result.ok === 1 ? '' : 's'} ok${result.failed ? `, ${result.failed} fehlgeschlagen` : ''}.`);
      }
      await loadBoard();
    } catch (error) {
      toast(`Aktualisierung fehlgeschlagen: ${error.message}`, true);
    } finally {
      btnRefresh.classList.remove('spinning');
      btnRefresh.disabled = false;
    }
  }

  async function addCategory(name) {
    await api('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
    toast(`Rubrik „${name}“ angelegt.`);
    await loadBoard();
  }

  async function addFeed(categoryId, url, name, submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Suche Feed …';
    try {
      const feed = await api('/api/feeds', {
        method: 'POST',
        body: JSON.stringify({ category_id: categoryId, url, name: name || null }),
      });
      toast(`Feed „${feed.name}“ hinzugefügt.`);
      await loadBoard();
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Feed hinzufügen';
    }
  }

  function findCategory(id) {
    return state.board.categories.find((c) => c.id === id);
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
        case 'category-rename':
          state.renaming = { type: 'category', id: categoryId };
          render();
          boardEl.querySelector('.rename-form input')?.focus();
          break;
        case 'category-delete': {
          const category = findCategory(categoryId);
          const feedCount = category ? category.feeds.length : 0;
          const suffix = feedCount ? ` samt ${feedCount} Feed${feedCount === 1 ? '' : 's'}` : '';
          if (!confirm(`Rubrik „${category?.name}“${suffix} wirklich löschen?`)) return;
          await api(`/api/categories/${categoryId}`, { method: 'DELETE' });
          toast('Rubrik gelöscht.');
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
          if (!confirm(`Feed „${feed?.name}“ wirklich löschen?`)) return;
          await api(`/api/feeds/${feedId}`, { method: 'DELETE' });
          toast('Feed gelöscht.');
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
        case 'category-rename-submit': {
          const name = form.querySelector('input').value.trim();
          if (!name) return;
          await api(`/api/categories/${categoryId}`, { method: 'PATCH', body: JSON.stringify({ name }) });
          state.renaming = null;
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

  formAddCategory.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = inputCategoryName.value.trim();
    if (!name) return;
    try {
      await addCategory(name);
      inputCategoryName.value = '';
    } catch (error) {
      toast(error.message, true);
    }
  });

  btnRefresh.addEventListener('click', refreshAll);
  btnEdit.addEventListener('click', () => setEditMode(!state.editMode));

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

  updateClock();
  setInterval(updateClock, 60 * 1000);

  loadBoard();

  setInterval(() => {
    // Im Bearbeitungsmodus nicht neu rendern (würde Formulareingaben verwerfen)
    if (!state.editMode && !state.renaming) loadBoard({ silent: true });
  }, AUTO_RELOAD_MS);
})();
