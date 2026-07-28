// schedule.js — Briefing-Zeitplan als Uhrzeit und Wochentage
//
// Gespeichert werden seit dem Umbau genau diese beiden Werte. Der
// cron-Ausdruck entsteht nur noch im Moment des Einplanens, weil node-cron
// einen braucht — er steht nirgends mehr in der Datenbank und wird auch
// nirgends mehr angezeigt.
//
// ausCron() ist die Gegenrichtung und wird nur noch einmalig gebraucht: um
// einen alten Eintrag aus der Zeit davor zu übernehmen.
//
// Läuft im Browser (als Skript) und in Node (Server und Test).
(function (global) {
  'use strict';

  const WOCHENTAGE = [1, 2, 3, 4, 5, 6, 0]; // Anzeige ab Montag, cron zählt ab Sonntag

  // "7:5" -> "07:05", Unsinn -> ""
  function normalisiereZeit(wert) {
    const treffer = /^(\d{1,2}):(\d{2})$/.exec(String(wert ?? '').trim());
    if (!treffer) return '';
    const stunde = Number(treffer[1]);
    const minute = Number(treffer[2]);
    if (stunde > 23 || minute > 59) return '';
    return `${String(stunde).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  // [3,1,1] oder "1,3" -> [1,3]
  function normalisiereTage(wert) {
    const roh = Array.isArray(wert) ? wert : String(wert ?? '').split(',');
    return [...new Set(roh
      .map((d) => Number(String(d).trim()))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
      .sort((a, b) => a - b);
  }

  // { zeit: "07:30", tage: [1,2,3,4,5] } -> "30 7 * * 1,2,3,4,5"
  function zuCron({ zeit, tage }) {
    const uhrzeit = normalisiereZeit(zeit);
    if (!uhrzeit) return '';
    const [stunde, minute] = uhrzeit.split(':').map(Number);

    const gewaehlt = normalisiereTage(tage);
    if (!gewaehlt.length) return '';

    const tagTeil = gewaehlt.length === 7 ? '*' : gewaehlt.join(',');
    return `${minute} ${stunde} * * ${tagTeil}`;
  }

  // "30 7 * * 1-5" -> { zeit: "07:30", tage: [1,2,3,4,5] }
  // Gibt null zurück, wenn der Ausdruck sich nicht auf Uhrzeit plus Wochentage
  // abbilden lässt (z. B. "*/15 * * * *").
  function ausCron(cron) {
    const teile = String(cron || '').trim().split(/\s+/);
    if (teile.length !== 5) return null;
    const [minute, stunde, tagImMonat, monat, wochentag] = teile;

    if (tagImMonat !== '*' || monat !== '*') return null;
    if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(stunde)) return null;
    const zeit = normalisiereZeit(`${stunde}:${minute.padStart(2, '0')}`);
    if (!zeit) return null;

    let tage;
    if (wochentag === '*') {
      tage = [0, 1, 2, 3, 4, 5, 6];
    } else if (/^[0-6](,[0-6])*$/.test(wochentag)) {
      tage = normalisiereTage(wochentag);
    } else if (/^[0-6]-[0-6]$/.test(wochentag)) {
      const [von, bis] = wochentag.split('-').map(Number);
      if (von > bis) return null;
      tage = [];
      for (let d = von; d <= bis; d += 1) tage.push(d);
    } else {
      return null;
    }

    return { zeit, tage };
  }

  // Für eine lesbare Zusammenfassung: zusammenhängende Tage zu Spannen bündeln,
  // in Anzeigereihenfolge ab Montag. [1,2,3,4,5,0] -> [[1,5],[0,0]]
  // Eine Spanne ist [ersterTag, letzterTag]; Einzeltage sind [d, d].
  function gruppiereTage(tage) {
    const gewaehlt = normalisiereTage(tage);
    const spannen = [];
    let aktuell = null;

    for (const tag of WOCHENTAGE) {
      if (!gewaehlt.includes(tag)) {
        aktuell = null;
        continue;
      }
      if (aktuell) aktuell[1] = tag;
      else {
        aktuell = [tag, tag];
        spannen.push(aktuell);
      }
    }

    return spannen;
  }

  const api = { zuCron, ausCron, normalisiereZeit, normalisiereTage, gruppiereTage, WOCHENTAGE };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.FeedboardSchedule = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
