// errors.js — Fehler mit Übersetzungsschlüssel
//
// Die Meldungen des Servers landen als Toast in der Oberfläche. Frei
// formulierte deutsche Sätze wären dort auch dann deutsch, wenn jemand die
// Oberfläche auf Russisch oder Englisch liest. Deshalb bekommt jeder Fehler
// zusätzlich einen Schlüssel, den das Frontend übersetzt.
//
// Der deutsche Text bleibt und wird weiter mitgeschickt: er ist die
// Rückfallebene, wenn ein Schlüssel im Wörterbuch fehlt, und er steht in
// Server-Logs und in `last_error` an den Feeds.
'use strict';

function fehler(code, text, params = null) {
  const error = new Error(text);
  error.code = code;
  if (params) error.params = params;
  return error;
}

// Was von einem Fehler in die Antwort darf.
function toResponse(error) {
  const body = { error: error?.message || 'Unbekannter Fehler.' };
  if (error?.code) body.code = error.code;
  if (error?.params) body.params = error.params;
  if (error?.login_required) body.login_required = true;
  return body;
}

module.exports = { fehler, toResponse };
