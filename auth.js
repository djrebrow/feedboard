// auth.js — Zugangsschutz fürs Bearbeiten
//
// Gelesen werden darf immer. Geschützt sind nur Eingriffe: Rubriken und Feeds
// ändern, Import, Wiederherstellung, Einstellungen — und alles, was Geld kostet
// oder nach außen geht (KI, Teilen).
//
// Das Passwort liegt als scrypt-Hash in der settings-Tabelle. FEEDBOARD_PASSWORD
// legt es beim ersten Start an; danach gilt, was im Menü gesetzt wurde.
'use strict';

const crypto = require('node:crypto');

const store = require('./db');
const { fehler } = require('./errors');

const ENV_PASSWORD = process.env.FEEDBOARD_PASSWORD || '';
const COOKIE_NAME = 'feedboard_session';
const SESSION_DAYS = 30;
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;

// ---------------------------------------------------------------------------
// Passwort
// ---------------------------------------------------------------------------

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(String(password), parts[1], expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Beim ersten Start aus der Umgebungsvariable übernehmen. Danach hat das im
// Menü gesetzte Passwort Vorrang — FEEDBOARD_PASSWORD wird nicht mehr gelesen.
function seedFromEnv() {
  if (!ENV_PASSWORD) return;
  if (store.getSetting('password_hash')) return;
  store.setSetting('password_hash', hashPassword(ENV_PASSWORD));
}

seedFromEnv();

function isEnabled() {
  return !!store.getSetting('password_hash');
}

// ---------------------------------------------------------------------------
// Session-Cookie
// ---------------------------------------------------------------------------

function sessionSecret() {
  let secret = store.getSetting('session_secret');
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    store.setSetting('session_secret', secret);
  }
  return secret;
}

function sign(value) {
  return crypto.createHmac('sha256', sessionSecret()).update(value).digest('hex');
}

function createToken() {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${sign(String(expires))}`;
}

function isValidToken(token) {
  const raw = String(token || '');
  const dot = raw.indexOf('.');
  if (dot < 1) return false;
  const expires = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  const expected = sign(expires);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function setSessionCookie(req, res) {
  // Secure nur bei wirklich verschlüsselter Verbindung — sonst verwirft der
  // Browser das Cookie im Heimnetz per http.
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.append('Set-Cookie', [
    `${COOKIE_NAME}=${createToken()}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
    secure ? 'Secure' : null,
  ].filter(Boolean).join('; '));
}

function clearSessionCookie(res) {
  res.append('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// Ohne gesetztes Passwort ist niemand ausgesperrt
function isLoggedIn(req) {
  if (!isEnabled()) return true;
  return isValidToken(readCookie(req, COOKIE_NAME));
}

// ---------------------------------------------------------------------------
// Anmelden, abmelden, Passwort ändern
// ---------------------------------------------------------------------------

// Einfache Bremse gegen Durchprobieren: zehn Fehlversuche je Absender-IP
// und Viertelstunde.
const attempts = new Map();

function tooManyAttempts(ip) {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > ATTEMPT_WINDOW_MS) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function noteFailure(ip) {
  const entry = attempts.get(ip);
  if (!entry || Date.now() - entry.first > ATTEMPT_WINDOW_MS) {
    attempts.set(ip, { first: Date.now(), count: 1 });
    return;
  }
  entry.count += 1;
}

function checkPassword(req, password) {
  const ip = req.ip || 'unbekannt';
  if (tooManyAttempts(ip)) {
    throw fehler('too_many_attempts', 'Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.', { minutes: 15 });
  }
  if (!password || !verifyPassword(password, store.getSetting('password_hash'))) {
    noteFailure(ip);
    throw fehler('wrong_password', 'Falsches Passwort.');
  }
  attempts.delete(ip);
}

function login(req, res, password) {
  if (!isEnabled()) throw fehler('no_password_set', 'Es ist kein Passwort eingerichtet.');
  checkPassword(req, password);
  setSessionCookie(req, res);
}

function logout(res) {
  clearSessionCookie(res);
}

// Passwort setzen oder ändern. Ist noch keines eingerichtet, darf jeder das
// erste setzen — danach nur noch, wer das alte kennt.
function setPassword(req, res, { current, next }) {
  const password = String(next || '');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw fehler('password_too_short', `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.`, { min: MIN_PASSWORD_LENGTH });
  }
  if (isEnabled()) checkPassword(req, current);

  store.setSetting('password_hash', hashPassword(password));
  // Anderen Sitzungen den Zugang entziehen, die eigene erneuern
  store.setSetting('session_secret', crypto.randomBytes(32).toString('hex'));
  setSessionCookie(req, res);
}

// ---------------------------------------------------------------------------
// Schutz einzelner Routen
// ---------------------------------------------------------------------------

// Vor jede Route hängen, die etwas verändert oder etwas kostet.
function protect(req, res, next) {
  if (isLoggedIn(req)) return next();
  res.status(401).json({ error: 'Zum Bearbeiten bitte anmelden.', code: 'login_required_msg', login_required: true });
}

module.exports = {
  isEnabled,
  isLoggedIn,
  login,
  logout,
  setPassword,
  protect,
  MIN_PASSWORD_LENGTH,
  COOKIE_NAME,
};
