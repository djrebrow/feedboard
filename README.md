# Feedboard

*[English version](README.en.md)*

Selbstgehostetes Dashboard für RSS-/Atom-Feeds und öffentliche Telegram-Kanäle. Rubriken und Quellen werden vollständig über die Oberfläche angelegt, umbenannt, sortiert und gelöscht — keine YAML-Konfiguration nötig.

## Funktionen

### Quellen verwalten

- **Rubriken & Feeds komplett über die UI** (Bearbeitungsmodus über das Stift-Symbol in der Werkzeugleiste)
- **Feed-Autodiscovery**: normale Website-Adresse eingeben (z. B. `heise.de`) — der RSS-/Atom-Feed wird automatisch gefunden; der Name wird aus dem Feed übernommen, wenn keiner angegeben ist
- **Öffentliche Telegram-Kanäle** als Quelle: `@kanal` oder `t.me/kanal` eingeben, gelesen wird die öffentliche Web-Vorschau
- **Rubrik-Logos** hochladen (werden als Bilddaten in der Datenbank abgelegt) und eigener Anker je Rubrik für die Adresszeile
- Reihenfolge von Rubriken und Feeds frei sortierbar
- **OPML-Import und -Export** über das Einstellungsfenster (Bereich „Daten") — der übliche Umzugsweg von und zu anderen Readern
- **Feeds pausieren**; Feeds, die 20-mal in Folge fehlschlagen, pausieren sich automatisch und werden nicht weiter abgerufen (Kennzeichnung „pausiert" im Feed-Kopf)

### Lesen

- **Startseite mit Rubrik-Kacheln**, Klick öffnet die Rubrik mit allen Feeds (Adresse `#/<anker>`, damit einzelne Rubriken direkt verlinkbar sind)
- **„Alle Artikel"**: ein chronologischer Strom über sämtliche Rubriken hinweg (Listen-Symbol in der Werkzeugleiste oder Taste `a`)
- **Kurzfassungen** aus den Feed-Inhalten (HTML bereinigt), per Klick auf die Artikelzeile aufklappbar
- **Artikel-Vorschau** mit Bild und Kurzfassung beim Überfahren mit der Maus; auf Touch-Geräten als eingeblendete Karte
- **Lese-Status** je Artikel, dazu „alles gelesen" pro Feed oder Rubrik, Ungelesen-Zähler und ein Filter für ungelesene Artikel
- **Gespeicherte Artikel** (Stern) mit eigener Ansicht
- **Volltextsuche** über alle vorliegenden Artikel — Titel, Kurzfassung, nachgeladener Volltext und KI-Zusammenfassung
- **Ausblenden per Stichwort** (Mute-Wörter); gespeicherte Artikel bleiben davon unberührt
- **Volltext nachladen** bei Feeds, die nur Anrisse liefern: der Artikeltext wird aus der Seite geholt und in der Datenbank abgelegt (auch offline lesbar)
- **Tastatur-Navigation**: `j`/`k` Artikel wechseln, `o` öffnen, `m` gelesen, `s` speichern, `r` aktualisieren, `u` nur Ungelesene, `a` alle Artikel, `/` suchen, `Esc` zurück (Übersicht im Einstellungsfenster)

### Optional: KI und Teilen

Beide Funktionen sind aus, solange sie nicht eingerichtet sind — die Knöpfe erscheinen dann gar nicht erst. Eingerichtet wird im Einstellungsfenster unter „Zugänge“ (nur angemeldet sichtbar) oder über Umgebungsvariablen.

- **KI-Kurzfassung** (drei Sätze) und **Übersetzung** je Artikel über den eingerichteten KI-Anbieter (Anthropic, OpenAI, Google AI Studio, Groq, OpenRouter, Mistral, DeepSeek oder ein eigener OpenAI-kompatibler Endpunkt); beides wird zwischengespeichert, kostet also höchstens einen Aufruf je Artikel
- **Tages-Briefing**: alle ungelesenen Artikel der letzten 24 Stunden nach Themen gebündelt (Einstellungsfenster, Bereich „Zugänge"); wird sechs Stunden lang wiederverwendet
- **Artikel per Telegram teilen** — an den eigenen Chat über einen Bot
- **Geplantes Briefing per Telegram**: Uhrzeit und Wochentage im Einstellungsfenster wählen, den Rest erledigt Feedboard. Die Uhrzeit gilt in der Zeitzone des Servers, sie steht neben dem Feld
- **Einrichtung im Fenster**: Bot-Token, Chat-ID, KI-Anbieter samt Schlüssel und Modell sowie das Briefing (Uhrzeit und Wochentage) sind nach der Anmeldung unter „Zugänge" setzbar, samt Knopf für eine Testnachricht. Ein Fragezeichen an jedem Feld klappt eine kurze Anleitung auf — beim API-Schlüssel mit der Adresse des gerade gewählten Anbieters. Die Geheimnisse verlassen den Server nie wieder — angezeigt werden nur ihre letzten vier Zeichen

### Sicherheit & Sicherung

- **Lesen bleibt für alle frei, Bearbeiten ist geschützt.** Sobald ein Passwort gesetzt ist, verlangen nur noch Eingriffe eine Anmeldung: Rubriken und Feeds anlegen, ändern, sortieren und löschen, OPML-Import, Wiederherstellung, Mute-Wörter, Sicherung herunterladen — dazu alles, was Geld kostet oder nach außen geht (KI-Aufrufe, Teilen). Board, Suche, Lese-Status und Sterne bleiben offen.
- Der Klick auf den Stift öffnet dann einen **Anmelde-Dialog** statt des Bearbeitungsmodus; danach geht es direkt weiter. Angemeldet bleibt man 30 Tage über ein signiertes Cookie. Nach zehn Fehlversuchen je Viertelstunde und Absender-IP ist Schluss.
- **Passwort setzen und ändern im Einstellungsfenster** unter „Zugang". Das Passwort liegt als scrypt-Hash in der Datenbank; `FEEDBOARD_PASSWORD` legt beim allerersten Start eines an. Eine Änderung meldet alle anderen Sitzungen ab.
- Ohne gesetztes Passwort bleibt alles wie bisher offen — bestehende Installationen ändern sich durch ein Update nicht.
- **Sicherung als JSON** herunterladen und wieder einspielen (Rubriken, Feeds, Artikel, Einstellungen). Zugangsdaten sind bewusst nicht enthalten und überleben eine Wiederherstellung. Das Einspielen ersetzt den restlichen Bestand und läuft in einer Transaktion — schlägt es fehl, bleibt die alte Datenbank unverändert.

### Darstellung & Betrieb

- **Einstellungen als Fenster** mit den Bereichen Darstellung, Lesen, Zugänge, Daten, Zugang und Tastatur; auf dem Handy als Vollbild
- **Design: Hell, Dunkel oder System** — im Einstellungsfenster wählbar; „System" folgt der Betriebssystem-Einstellung und wechselt auch im laufenden Betrieb mit. Der Sonne/Mond-Knopf bleibt als schneller Hell/Dunkel-Umschalter
- **Anzeige-Einstellungen**: Schriftgröße, Zeilendichte, Thumbnails in der Liste, Favicons wahlweise über den lokalen Cache (dann ohne Aufruf externer Dienste beim Anzeigen)
- **Gleiche Meldung zusammenfassen**: In „Alle Artikel" wird dieselbe Nachricht aus mehreren Quellen zu einem Eintrag gebündelt, die weiteren Quellen stehen darunter und bleiben einzeln anklickbar. Abschaltbar im Einstellungsfenster
- **Dreisprachige Oberfläche** (Deutsch, Englisch, Russisch) — beim ersten Besuch wird die Browsersprache übernommen, danach gilt die Wahl im Einstellungsfenster. Auch die Meldungen des Servers sind übersetzt
- **Installierbar als PWA**, App-Grundgerüst und zuletzt geladene Daten sind offline verfügbar
- **Automatische Aktualisierung** im Hintergrund (Standard: alle 30 Minuten) plus manueller Refresh, einzeln oder für alle Feeds
- Fehleranzeige pro Feed (⚠ mit Details). Aufbewahrt werden 30 gelesene Artikel pro Feed; ungelesene und gespeicherte bleiben erhalten (Notbremse bei 300 pro Feed)
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

Telegram, der KI-Anbieter samt Schlüssel und der Briefing-Zeitplan lassen sich auch **im Einstellungsfenster unter „Zugänge"** setzen — sichtbar, sobald man angemeldet ist. Die Umgebungsvariablen legen diese Werte beim allerersten Start an; danach gilt, was im Einstellungsfenster steht (dasselbe Verhalten wie bei `FEEDBOARD_PASSWORD`). Wer ganz ohne Umgebungsvariablen startet, richtet alles im Einstellungsfenster ein.

| Variable                 | Standard              | Bedeutung                                                                                                            |
| ------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `PORT`                   | `8321`                | HTTP-Port                                                                                                              |
| `FETCH_INTERVAL_MINUTES` | `30`                  | Abrufintervall in Minuten (5–59)                                                                                       |
| `DB_PATH`                | `./data/feedboard.db` | Pfad zur SQLite-Datei                                                                                                  |
| `DEV_ASSETS`             | –                     | `1` = Asset-Version bei jedem Seitenaufruf neu aus den Dateizeiten bestimmen (für die Live-Entwicklung des Frontends)   |
| `FEEDBOARD_PASSWORD`     | –                     | Legt beim allerersten Start das Passwort an. Danach gilt, was im Menü gesetzt wurde. Leer = bearbeiten bleibt offen.     |
| `AI_PROVIDER`            | `anthropic`           | KI-Anbieter: `anthropic`, `openai`, `google` (AI Studio), `groq`, `openrouter`, `mistral`, `deepseek` oder `custom`                     |
| `AI_MODEL`               | je Anbieter           | Startwert für das Modell. Im Einstellungsfenster lässt sich die Liste beim Anbieter abrufen                                             |
| `AI_BASE_URL`            | –                     | Nur bei `AI_PROVIDER=custom`: OpenAI-kompatibler Endpunkt, z. B. Ollama oder LM Studio im eigenen Netz                                  |
| `ANTHROPIC_API_KEY` u. a.| –                     | Startwert für den Schlüssel des jeweiligen Anbieters — außerdem `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`, `DEEPSEEK_API_KEY` |
| `TELEGRAM_BOT_TOKEN`     | –                     | Startwert für den Bot-Token (zusammen mit `TELEGRAM_CHAT_ID`). Danach gilt das Einstellungsfenster                                    |
| `TELEGRAM_CHAT_ID`       | –                     | Startwert für den Ziel-Chat. Danach gilt das Einstellungsfenster                                                                       |
| `BRIEFING_TIME`          | –                     | Startwert für die Uhrzeit des Briefings, z. B. `07:30` (nach `TZ`). Leer = aus. Braucht KI-Zugang und Telegram                          |
| `BRIEFING_DAYS`          | täglich               | Wochentage des Briefings, `0` = Sonntag … `6` = Samstag, z. B. `1,2,3,4,5`                                                             |
| `BRIEFING_LANG`          | `de`                  | Startwert für die Sprache des Briefings (`de`, `en`, `ru`). Danach gilt das Einstellungsfenster                                        |
| `BRIEFING_HOURS`         | `24`                  | Startwert für den Rückblick des Briefings in Stunden (1–168). Danach gilt das Einstellungsfenster                                      |

Für Docker liegen die optionalen Werte am besten in einer `.env` neben der `docker-compose.yml` — sie werden dort schon durchgereicht.

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
| `PATCH /api/feeds/:id`        | Feed umbenennen bzw. pausieren `{ name?, enabled? }`                   |
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
| `GET /api/settings/integrations` | Zugänge lesen (nur angemeldet; ohne Geheimnisse)           |
| `PUT /api/settings/integrations` | Zugänge setzen (nur angemeldet; fehlende Felder unverändert) |
| `POST /api/settings/integrations/test-telegram` | Testnachricht schicken (nur angemeldet)     |
| `GET /api/settings/ai-models` | Modellliste beim eingerichteten Anbieter abrufen (nur angemeldet) |
| `GET /api/favicon?host=…`        | Favicon über den lokalen Cache ausliefern                  |

### Volltext, KI und Teilen

| Methode & Pfad                              | Zweck                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `GET /api/articles/:id/content`             | Bereits geladenen Volltext abrufen                                        |
| `POST /api/articles/:id/content`            | Volltext von der Artikelseite holen und speichern `{ force? }`            |
| `POST /api/articles/:id/ai/summary`         | KI-Kurzfassung erzeugen (gecacht) `{ force? }`                            |
| `POST /api/articles/:id/ai/translate`       | Artikel übersetzen `{ lang: 'de' \| 'ru' \| 'en', force? }`               |
| `POST /api/ai/briefing`                     | Tages-Briefing über die ungelesenen Artikel `{ lang?, hours?, force? }`   |
| `POST /api/articles/:id/share/telegram`     | Artikel an den eigenen Telegram-Chat schicken                             |

### Umzug, Sicherung und Anmeldung

| Methode & Pfad     | Zweck                                                                 |
| ------------------ | --------------------------------------------------------------------- |
| `GET /api/opml`    | Alle Rubriken und Feeds als OPML herunterladen                        |
| `POST /api/opml`   | OPML einlesen `{ xml }` (vorhandene Feeds werden übersprungen)         |
| `GET /api/backup`  | Vollständige Sicherung als JSON                                       |
| `POST /api/restore`| Sicherung einspielen (ersetzt den kompletten Bestand)                  |
| `POST /api/login`  | Anmelden `{ password }` — setzt das Session-Cookie                     |
| `POST /api/logout` | Abmelden                                                              |
| `POST /api/password` | Passwort setzen oder ändern `{ current, next }`                     |

## Entwicklung

`smoke-test.js` prüft das Frontend (Rendering, Rubrik-Drill-down, Edit-Modus, Design-Auswahl, XSS-Escaping, „Alle Artikel", Tastatur-Navigation, Artikel-Aktionen, Feed-Pause) ohne Browser. Dafür einmalig `npm install --no-save jsdom`, dann `node smoke-test.js`.

**Passwort vergessen?** Einmal den Hash löschen, dann greift beim nächsten Start wieder `FEEDBOARD_PASSWORD`:

```bash
docker compose exec feedboard node -e "require('./db').setSetting('password_hash', null)"
docker compose restart
```

**Frontend ohne Rebuild ändern:** `docker-compose.yml` hängt `./public` schreibgeschützt in den Container und setzt `DEV_ASSETS=1`. Änderungen an HTML, CSS und JavaScript sind damit nach einem Reload im Browser sichtbar. Änderungen am Backend (`server.js`, `db.js`, `feedFetcher.js`, `telegram.js`, `opml.js`, `extract.js`, `auth.js`, `ai.js`) stecken im Image und brauchen `docker compose up -d --build`. Für einen reinen Produktivbetrieb lassen sich die eingehängte Zeile und `DEV_ASSETS` aus `docker-compose.yml` entfernen.

## Projektstruktur

```
server.js        Express-Server, API, Cron-Job
db.js            SQLite-Schema und Datenzugriff (node:sqlite), Sicherung
feedFetcher.js   RSS-/Atom-Parsing, Kurzfassungen, Autodiscovery
telegram.js      Öffentliche Telegram-Kanäle lesen, Artikel per Bot teilen
opml.js          OPML lesen und schreiben
extract.js       Volltext aus Artikelseiten (eigene Heuristik auf cheerio)
auth.js          Passwort (scrypt), Session-Cookie, Schutz einzelner Routen
ai.js            KI-Anbieter: Kurzfassung, Übersetzung, Briefing
config.js        Zugänge in der Datenbank (Telegram, KI, Briefing), Startwerte aus der Umgebung
errors.js        Fehler mit Übersetzungsschlüssel
public/providers.js  Liste der KI-Anbieter (Server und Oberfläche teilen sie sich)
public/schedule.js   Briefing-Zeitplan: Uhrzeit und Wochentage
public/          Frontend (HTML/CSS/JS, ohne Framework, PWA) inkl. login.html
data/            SQLite-Datenbank und Favicon-Cache (werden automatisch angelegt)
```
