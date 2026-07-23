# Feedboard

Selbstgehostetes RSS-Dashboard im Stil von [infomate.club](https://github.com/vas3k/infomate.club) — aber mit vollständiger Verwaltung über die Oberfläche: Rubriken und Feeds werden direkt in der UI angelegt, umbenannt, sortiert und gelöscht. Keine YAML-Konfiguration nötig.

## Funktionen

- **Rubriken & Feeds komplett über die UI verwalten** (Bearbeitungsmodus mit Stift-Symbol)
- **Feed-Autodiscovery**: normale Website-Adresse eingeben (z. B. `heise.de`) — der RSS-/Atom-Feed wird automatisch gefunden; der Feed-Name wird aus dem Feed übernommen, wenn keiner angegeben ist
- **Kurzfassungen** aus den Feed-Inhalten (HTML bereinigt, auf 400 Zeichen gekürzt), per Klick auf die Artikelzeile aufklappbar
- **Automatische Aktualisierung** im Hintergrund (Standard: alle 30 Minuten) plus manueller Refresh
- **Hell-/Dunkel-Design** (folgt der Systemeinstellung, per Knopf umschaltbar)
- Duplikat-Erkennung, Fehleranzeige pro Feed (⚠ mit Details), maximal 30 gespeicherte Artikel pro Feed
- SQLite über das **eingebaute `node:sqlite`** — keine nativen Abhängigkeiten, kein Kompilieren (ideal für Raspberry Pi)

## Voraussetzungen

- **Node.js 22.5 oder neuer** (wegen `node:sqlite`); die Meldung `ExperimentalWarning: SQLite` beim Start ist normal und unkritisch
- Alternativ: Docker (das Image bringt Node 22 mit)

## Start (lokal)

```bash
npm install
npm start
```

Danach im Browser: `http://localhost:8321`

Beim allerersten Start werden Beispiel-Rubriken angelegt (heise, Golem, tagesschau) — sie lassen sich im Bearbeitungsmodus löschen oder ersetzen.

## Start (Docker / Raspberry Pi)

```bash
docker compose up -d --build
```

Die Datenbank liegt im Ordner `./data` und überlebt Container-Neustarts und -Updates.

## Konfiguration (Umgebungsvariablen)

| Variable                 | Standard | Bedeutung                                    |
| ------------------------ | -------- | -------------------------------------------- |
| `PORT`                   | `8321`   | HTTP-Port                                    |
| `FETCH_INTERVAL_MINUTES` | `30`     | Abrufintervall in Minuten (5–59)             |
| `DB_PATH`                | `./data/feedboard.db` | Pfad zur SQLite-Datei           |

## API (falls man sie direkt nutzen möchte)

| Methode & Pfad                   | Zweck                                            |
| -------------------------------- | ------------------------------------------------ |
| `GET  /api/board`                | Gesamtes Board (Rubriken → Feeds → Artikel)      |
| `POST /api/categories`           | Rubrik anlegen `{ name }`                        |
| `PATCH /api/categories/:id`      | Rubrik umbenennen `{ name }`                     |
| `DELETE /api/categories/:id`     | Rubrik samt Feeds und Artikeln löschen           |
| `POST /api/categories/reorder`   | Reihenfolge setzen `{ ids: [3,1,2] }`            |
| `POST /api/feeds`                | Feed anlegen `{ category_id, url, name? }`       |
| `PATCH /api/feeds/:id`           | Feed umbenennen `{ name }`                       |
| `DELETE /api/feeds/:id`          | Feed löschen                                     |
| `POST /api/feeds/reorder`        | Feed-Reihenfolge setzen `{ ids: […] }`           |
| `POST /api/feeds/:id/refresh`    | Einzelnen Feed sofort aktualisieren              |
| `POST /api/refresh`              | Alle Feeds sofort aktualisieren                  |

## Entwicklung

`smoke-test.js` prüft das Frontend (Rendering, Edit-Modus, XSS-Escaping) ohne Browser. Dafür einmalig `npm install --no-save jsdom`, dann `node smoke-test.js`.

## Projektstruktur

```
server.js        Express-Server, API, Cron-Job
db.js            SQLite-Schema und Datenzugriff (node:sqlite)
feedFetcher.js   RSS-/Atom-Parsing, Kurzfassungen, Autodiscovery
public/          Frontend (HTML/CSS/JS, ohne Framework)
data/            SQLite-Datenbank (wird automatisch angelegt)
```
