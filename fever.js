// fever.js — Fever-Schnittstelle für Handy-Apps
//
// NetNewsWire, Reeder, FeedMe, Fluent Reader und andere sprechen dieses
// Protokoll. Damit lässt sich Feedboard unterwegs lesen, und der Lesestatus
// gleicht sich in beide Richtungen ab.
//
// Das Protokoll ist alt und eigenwillig, deshalb ein paar Festlegungen:
//   * Alles läuft über POST auf /fever mit ?api (+ optional &items usw.).
//   * Angemeldet wird mit api_key = md5("email:passwort"). Das Passwort von
//     Feedboard liegt als scrypt-Hash vor und lässt sich daraus nicht
//     herleiten — deshalb gibt es im Menü ein eigenes Zugangswort für Apps,
//     von dem nur der md5-Wert gespeichert wird.
//   * IDs sind bei uns dieselben wie in der Datenbank. Rubriken heißen dort
//     „groups", Feeds „feeds", Artikel „items".
//   * Fever kennt kein „ungelesen" als Filter, sondern liefert IDs; die App
//     holt sich die Artikel dann in Blöcken von 50 über since_id.
'use strict';

const crypto = require('node:crypto');

const store = require('./db');

const PRAEFIX = 'fever_';
const BLOCK = 50; // so viele Artikel je Anfrage, so sieht es die Fever-Doku vor

// ---------------------------------------------------------------------------
// Zugang
// ---------------------------------------------------------------------------

function md5(text) {
  return crypto.createHash('md5').update(String(text)).digest('hex');
}

function isEnabled() {
  return !!store.getSetting(`${PRAEFIX}key`);
}

// Legt den Zugang an: gespeichert wird nur der md5-Wert, den die App ohnehin
// schickt — das Zugangswort selbst brauchen wir nie wieder.
function setCredentials(email, passwort) {
  const nutzer = String(email || '').trim();
  const wort = String(passwort || '');
  if (!nutzer || !wort) return null;
  const schluessel = md5(`${nutzer}:${wort}`);
  store.setSetting(`${PRAEFIX}key`, schluessel);
  store.setSetting(`${PRAEFIX}user`, nutzer);
  return schluessel;
}

function clearCredentials() {
  store.deleteSetting(`${PRAEFIX}key`);
  store.deleteSetting(`${PRAEFIX}user`);
}

function publicState() {
  const nutzer = store.getSetting(`${PRAEFIX}user`, '') || '';
  return { configured: isEnabled(), user: nutzer };
}

// Zeitgleicher Vergleich: sonst liesse sich der Schlüssel zeichenweise raten.
function checkKey(gesendet) {
  const erwartet = store.getSetting(`${PRAEFIX}key`);
  if (!erwartet) return false;
  const a = Buffer.from(String(gesendet || ''));
  const b = Buffer.from(erwartet);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Umformung: Feedboard → Fever
// ---------------------------------------------------------------------------

// Fever erwartet Sekunden seit 1970, die Datenbank liefert UTC-Text.
function zuZeitstempel(wert) {
  if (!wert) return 0;
  const text = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(wert) ? `${wert.replace(' ', 'T')}Z` : wert;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

function alsGruppen() {
  return store.getCategories().map((c) => ({ id: c.id, title: c.name }));
}

// Welche Feeds zu welcher Rubrik gehören — Fever überträgt das als Liste von
// kommagetrennten IDs je Gruppe.
function alsGruppenZuordnung(feeds) {
  const proGruppe = new Map();
  for (const f of feeds) {
    if (!proGruppe.has(f.category_id)) proGruppe.set(f.category_id, []);
    proGruppe.get(f.category_id).push(f.id);
  }
  return [...proGruppe.entries()].map(([group_id, ids]) => ({ group_id, feed_ids: ids.join(',') }));
}

function alsFeeds(feeds) {
  return feeds.map((f) => ({
    id: f.id,
    favicon_id: 0,
    title: f.name,
    url: f.rss_url,
    site_url: f.site_url || f.rss_url,
    is_spark: 0,
    last_updated_on_time: zuZeitstempel(f.last_fetched_at),
  }));
}

function alsArtikel(zeilen) {
  return zeilen.map((a) => ({
    id: a.id,
    feed_id: a.feed_id,
    title: a.title,
    author: '',
    // Volltext, wenn geladen — sonst die Kurzfassung aus dem Feed
    html: a.content || a.summary || '',
    url: a.link || '',
    is_saved: a.starred_at ? 1 : 0,
    is_read: a.read_at ? 1 : 0,
    created_on_time: zuZeitstempel(a.published_at || a.fetched_at),
  }));
}

// ---------------------------------------------------------------------------
// Die eigentliche Schnittstelle
// ---------------------------------------------------------------------------

function handle(query, body) {
  const antwort = { api_version: 3, auth: 0 };

  const schluessel = body?.api_key ?? query?.api_key;
  if (!checkKey(schluessel)) return antwort;

  antwort.auth = 1;
  antwort.last_refreshed_on_time = zuZeitstempel(store.getStats().last_fetched_at);

  const hat = (name) => Object.prototype.hasOwnProperty.call(query, name);
  const feeds = store.getFeeds();

  if (hat('groups')) {
    antwort.groups = alsGruppen();
    antwort.feeds_groups = alsGruppenZuordnung(feeds);
  }

  if (hat('feeds')) {
    antwort.feeds = alsFeeds(feeds);
    antwort.feeds_groups = alsGruppenZuordnung(feeds);
  }

  // Wir liefern keine Favicons aus; die Apps kommen ohne aus.
  if (hat('favicons')) antwort.favicons = [];

  // „Hot links" gibt es bei uns nicht.
  if (hat('links')) antwort.links = [];

  if (hat('unread_item_ids')) antwort.unread_item_ids = store.getFeverItemIds({ unread: true }).join(',');
  if (hat('saved_item_ids')) antwort.saved_item_ids = store.getFeverItemIds({ saved: true }).join(',');

  if (hat('items')) {
    const auswahl = {
      sinceId: query.since_id ? Number(query.since_id) : null,
      maxId: query.max_id ? Number(query.max_id) : null,
      ids: query.with_ids ? String(query.with_ids).split(',').map(Number).filter(Number.isInteger) : null,
      limit: BLOCK,
    };
    antwort.items = alsArtikel(store.getFeverItems(auswahl));
    antwort.total_items = store.getStats().articles;
  }

  if (hat('mark')) {
    markiere(query, body);
    // Nach einer Änderung schickt Fever die IDs gleich neu mit — sonst müsste
    // die App eine zweite Runde drehen.
    antwort.unread_item_ids = store.getFeverItemIds({ unread: true }).join(',');
    antwort.saved_item_ids = store.getFeverItemIds({ saved: true }).join(',');
  }

  return antwort;
}

function markiere(query, body) {
  const was = String(query.mark || '');
  const wie = String(body?.as ?? query.as ?? '');
  const id = Number(body?.id ?? query.id);
  if (!Number.isInteger(id)) return;

  if (was === 'item') {
    if (wie === 'read') store.setArticleRead(id, true);
    else if (wie === 'unread') store.setArticleRead(id, false);
    else if (wie === 'saved') store.setArticleStarred(id, true);
    else if (wie === 'unsaved') store.setArticleStarred(id, false);
    return;
  }

  // Ganze Feeds oder Rubriken: Fever schickt dazu einen Zeitpunkt, bis zu dem
  // markiert werden soll — alles Ältere gilt als gelesen.
  const bis = Number(body?.before ?? query.before);
  const grenze = Number.isInteger(bis) && bis > 0 ? new Date(bis * 1000).toISOString() : null;

  if (was === 'feed' && wie === 'read') store.markFeedReadBefore(id, grenze);
  else if (was === 'group' && wie === 'read') {
    // Gruppe 0 heisst bei Fever „alle"
    if (id === 0) for (const c of store.getCategories()) store.markCategoryReadBefore(c.id, grenze);
    else store.markCategoryReadBefore(id, grenze);
  }
}

module.exports = { handle, isEnabled, setCredentials, clearCredentials, publicState, md5 };
