// auth.js — Zugangsschutz mit Passwort und signiertem Session-Cookie
//
// Ohne FEEDBOARD_PASSWORD bleibt alles offen wie bisher — bestehende
// Installationen ändern sich durch ein Update also nicht.
'use strict';

const crypto = require('node:crypto');

const store = require('./db');

const PASSWORD = process.env.FEEDBOARD_PASSWORD || '';
const COOKIE_NAME = 'feedboard_session';
const SESSION_DAYS = 30;
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

function isEnabled() {
  return PASSWORD.length > 0;
}

// Schlüssel zum Signieren der Cookies: aus der Umgebung oder einmalig erzeugt
// und in der Datenbank abgelegt. So überleben Sessions einen Neustart.
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
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

// Beide Seiten erst hashen: timingSafeEqual verlangt gleiche Länge, und die
// Länge des Passworts soll nicht durchsickern.
function safeEqual(a, b) {
  const digestA = crypto.createHash('sha256').update(String(a)).digest();
  const digestB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(digestA, digestB);
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
  // Secure nur setzen, wenn die Verbindung wirklich verschlüsselt ist —
  // sonst verwirft der Browser das Cookie im lokalen Netz per http.
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

function isLoggedIn(req) {
  if (!isEnabled()) return true;
  return isValidToken(readCookie(req, COOKIE_NAME));
}

// Einfache Bremse gegen Durchprobieren: pro Absender-IP zehn Fehlversuche
// je Viertelstunde.
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

function login(req, res, password) {
  const ip = req.ip || 'unbekannt';
  if (tooManyAttempts(ip)) {
    throw new Error('Zu viele Fehlversuche. Bitte in 15 Minuten erneut versuchen.');
  }
  if (!password || !safeEqual(password, PASSWORD)) {
    noteFailure(ip);
    throw new Error('Falsches Passwort.');
  }
  attempts.delete(ip);
  setSessionCookie(req, res);
}

function logout(res) {
  clearSessionCookie(res);
}

// Ohne Anmeldung erreichbar: die Login-Seite selbst und ihre Anmelde-Route
const PUBLIC_PATHS = new Set(['/login', '/login.html', '/api/login', '/manifest.webmanifest', '/icon.svg']);

function middleware(req, res, next) {
  if (!isEnabled() || PUBLIC_PATHS.has(req.path) || isLoggedIn(req)) return next();

  // Für die API eine klare Fehlermeldung, für Seitenaufrufe die Login-Seite
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Nicht angemeldet.', login_required: true });
  }
  return res.redirect('/login');
}

module.exports = { isEnabled, isLoggedIn, login, logout, middleware, COOKIE_NAME };
