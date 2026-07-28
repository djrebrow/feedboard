// schedule.js — Übersetzt zwischen Uhrzeit-plus-Wochentagen und cron.
//
// Gespeichert wird weiterhin ein cron-Ausdruck: der Zeitplan lief schon so,
// und wer will, kann in der Datenbank etwas Ausgefalleneres eintragen. Die
// Oberfläche bietet aber nur den Normalfall an — eine Uhrzeit und die Tage,
// an denen sie gelten soll.
//
// Läuft im Browser (als Skript) und in Node (für den Test).
(function (global) {
  'use strict';

  const WOCHENTAGE = [1, 2, 3, 4, 5, 6, 0]; // Anzeige ab Montag, cron zählt ab Sonntag

  // { zeit: "07:30", tage: [1,2,3,4,5] } -> "30 7 * * 1,2,3,4,5"
  function zuCron({ zeit, tage }) {
    const treffer = /^(\d{1,2}):(\d{2})$/.exec(String(zeit || '').trim());
    if (!treffer) return '';
    const stunde = Number(treffer[1]);
    const minute = Number(treffer[2]);
    if (stunde > 23 || minute > 59) return '';

    const gewaehlt = [...new Set((tage || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
    if (!gewaehlt.length) return '';

    const tagTeil = gewaehlt.length === 7 ? '*' : gewaehlt.join(',');
    return `${minute} ${stunde} * * ${tagTeil}`;
  }

  // "30 7 * * 1-5" -> { zeit: "07:30", tage: [1,2,3,4,5] }
  // Gibt null zurück, wenn der Ausdruck nicht in die Auswahl passt (z. B.
  // "*/15 * * * *"). Dann zeigt die Oberfläche das Feld für Fortgeschrittene.
  function ausCron(cron) {
    const teile = String(cron || '').trim().split(/\s+/);
    if (teile.length !== 5) return null;
    const [minute, stunde, tagImMonat, monat, wochentag] = teile;

    // Nur feste Uhrzeiten an festen Wochentagen lassen sich abbilden
    if (tagImMonat !== '*' || monat !== '*') return null;
    if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(stunde)) return null;
    const m = Number(minute);
    const h = Number(stunde);
    if (m > 59 || h > 23) return null;

    let tage;
    if (wochentag === '*') {
      tage = [0, 1, 2, 3, 4, 5, 6];
    } else if (/^[0-6](,[0-6])*$/.test(wochentag)) {
      tage = [...new Set(wochentag.split(',').map(Number))].sort();
    } else if (/^[0-6]-[0-6]$/.test(wochentag)) {
      const [von, bis] = wochentag.split('-').map(Number);
      if (von > bis) return null;
      tage = [];
      for (let d = von; d <= bis; d += 1) tage.push(d);
    } else {
      return null;
    }

    return { zeit: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, tage };
  }

  const api = { zuCron, ausCron, WOCHENTAGE };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.FeedboardSchedule = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
