# Feedboard

Selbstgehostetes Dashboard für RSS-/Atom-Feeds und öffentliche Telegram-Kanäle. Rubriken und Quellen werden vollständig über die Oberfläche angelegt, umbenannt, sortiert und gelöscht — keine YAML-Konfiguration nötig.

## Funktionen

### Quellen verwalten

- **Rubriken & Feeds komplett über die UI** (Bearbeitungsmodus über das Stift-Symbol im Zahnrad-Menü)
- **Feed-Autodiscovery**: normale Website-Adresse eingeben (z. B. `heise.de`) — der RSS-/Atom-Feed wird automatisch gefunden; der Name wird aus dem Feed übernommen, wenn keiner angegeben ist
- **Öffentliche Telegram-Kanäle** als Quelle: `@kanal` oder `t.me/kanal` eingeben, gelesen wird die öffentliche Web-Vorschau
- **Rubrik-Logos** hochladen (werden als Bilddaten in der Datenbank abgelegt) und eigener Anker je Rubrik für die Adresszeile
- Reihenfolge von Rubriken und Feeds frei sortierbar

### Lesen

- **Startseite mit Rubrik-Kacheln**, Klick öffnet die Rubrik mit allen Feeds (Adresse `#/<anker>`, damit einzelne Rubriken direkt verlinkbar sind)
- **Kurzfassungen** aus den Feed-Inhalten (HTML bereinigt), per Klick auf die Artikelzeile aufklappbar
- **Artikel-Vorschau** mit Bild und Kurzfassung beim Überfahren mit der Maus; auf Touch-Geräten als eingeblendete Karte
- **Lese-Status** je Artikel, dazu „alles gelesen" pro Feed oder Rubrik, Ungelesen-Zähler und ein Filter für ungelesene Artikel
- **Gespeicherte Artikel** (Stern) mit eigener Ansicht
- **Volltextsuche** über alle vorliegenden Artikel (Titel und Kurzfassung)
- **Ausblenden per Stichwort** (Mute-Wörter); gespeicherte Artikel bleiben davon unberührt

### Darstellung & Betrieb

- **Design: Hell, Dunkel oder System** — im Zahnrad-Menü wählbar; „System" folgt der Betriebssystem-Einstellung und wechselt auch im laufenden Betrieb mit. Der Sonne/Mond-Knopf bleibt als schneller Hell/Dunkel-Umschalter
- **Anzeige-Einstellungen**: Schriftgröße, Zeilendichte, Thumbnails in der Liste, Favicons wahlweise über den lokalen Cache (dann ohne Aufruf externer Dienste beim Anzeigen)
- **Zweisprachige Oberfläche** (Deutsch, Russisch)
- **Installierbar als PWA**, App-Grundgerüst und zuletzt geladene Daten sind offline verfügbar
- **Automatische Aktualisierung** im Hintergrund (Standard: alle 30 Minuten) plus manueller Refresh, einzeln oder für alle Feeds
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

| Variable                 | Standard              | Bedeutung                                                                                                            |
| ------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `PORT`                   | `8321`                | HTTP-Port                                                                                                              |
| `FETCH_INTERVAL_MINUTES` | `30`                  | Abrufintervall in Minuten (5–59)                                                                                       |
| `DB_PATH`                | `./data/feedboard.db` | Pfad zur SQLite-Datei                                                                                                  |
| `DEV_ASSETS`             | –                     | `1` = Asset-Version bei jedem Seitenaufruf neu aus den Dateizeiten bestimmen (für die Live-Entwicklung des Frontends)   |

## API (falls man sie direkt nutzen möchte)

### Board & Kennzahlen

| Methode & Pfad    | Zweck                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `GET /api/board`  | Gesamtes Board (Rubriken → Feeds → Artikel)                                                        |
| `GET /api/stats`  | Schlanke Kennzahlen für externe Dashboards: ungelesen, Rubriken, Feeds, fehlerhafte Feeds, Artikel, gespeicherte, letzter Abruf |

### Rubriken

| Methode & Pfad                  | Zweck                                       |
| ------------------------------- | ------------------------------------------- |
| `POST /api/categories`          | Rubrik anlegen `{ name, slug? }`            |
| `PATCH /api/categories/:id`     | Rubrik umbenennen `{ name, slug? }`         |
| `PUT /api/categories/:id/logo`  | Logo setzen `{ logo }` (Bild als data:-URI) |
| `DELETE /api/categories/:id/logo` | Logo entfernen                            |
| `DELETE /api/categories/:id`    | Rubrik samt Feeds und Artikeln löschen      |
| `POST /api/categories/reorder`  | Reihenfolge setzen `{ ids: [3,1,2] }`       |

### Feeds

| Methode & Pfad                | Zweck                                                                  |
| ----------------------------- | ---------------------------------------------------------------------- |
| `POST /api/feeds`             | Feed anlegen `{ category_id, url, name? }` (Website-Adresse, RSS-Adresse oder Telegram-Kanal) |
| `PATCH /api/feeds/:id`        | Feed umbenennen `{ name }`                                             |
| `DELETE /api/feeds/:id`       | Feed löschen                                                           |
| `POST /api/feeds/reorder`     | Feed-Reihenfolge setzen `{ ids: […] }`                                 |
| `POST /api/feeds/:id/refresh` | Einzelnen Feed sofort aktualisieren                                    |
| `POST /api/refresh`           | Alle Feeds sofort aktualisieren                                        |

### Lesen, Speichern, Suchen

| Methode & Pfad                   | Zweck                                                     |
| -------------------------------- | --------------------------------------------------------- |
| `POST /api/articles/:id/read`    | Artikel als gelesen/ungelesen markieren `{ read }`         |
| `POST /api/feeds/:id/read`       | Alle Artikel eines Feeds als gelesen markieren             |
| `POST /api/categories/:id/read`  | Alle Artikel einer Rubrik als gelesen markieren            |
| `POST /api/articles/:id/star`    | Artikel speichern/entfernen `{ starred }`                  |
| `GET /api/saved`                 | Gespeicherte Artikel (max. 200)                            |
| `GET /api/search?q=…`            | Volltextsuche über alle Artikel (max. 100 Treffer)         |
| `GET /api/settings/mute`         | Mute-Wörter lesen                                          |
| `PUT /api/settings/mute`         | Mute-Wörter setzen `{ words: […] }`                        |
| `GET /api/favicon?host=…`        | Favicon über den lokalen Cache ausliefern                  |

## Entwicklung

`smoke-test.js` prüft das Frontend (Rendering, Rubrik-Drill-down, Edit-Modus, Design-Auswahl, XSS-Escaping) ohne Browser. Dafür einmalig `npm install --no-save jsdom`, dann `node smoke-test.js`.

**Frontend ohne Rebuild ändern:** `docker-compose.yml` hängt `./public` schreibgeschützt in den Container und setzt `DEV_ASSETS=1`. Änderungen an HTML, CSS und JavaScript sind damit nach einem Reload im Browser sichtbar. Änderungen am Backend (`server.js`, `db.js`, `feedFetcher.js`, `telegram.js`) stecken im Image und brauchen `docker compose up -d --build`. Für einen reinen Produktivbetrieb lassen sich die eingehängte Zeile und `DEV_ASSETS` aus `docker-compose.yml` entfernen.

## Projektstruktur

```
server.js        Express-Server, API, Cron-Job
db.js            SQLite-Schema und Datenzugriff (node:sqlite)
feedFetcher.js   RSS-/Atom-Parsing, Kurzfassungen, Autodiscovery
telegram.js      Öffentliche Telegram-Kanäle über die Web-Vorschau
public/          Frontend (HTML/CSS/JS, ohne Framework, PWA)
data/            SQLite-Datenbank und Favicon-Cache (werden automatisch angelegt)
```
