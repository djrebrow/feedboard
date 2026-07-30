# Änderungen

Alle nennenswerten Änderungen an Feedboard. Die Versionen folgen
[Semantic Versioning](https://semver.org/lang/de/): die erste Zahl steigt bei
Brüchen, die zweite bei neuen Funktionen, die dritte bei Korrekturen.

## [Unveröffentlicht]

### Neu

- **Fußzeile im Einstellungsfenster** mit Fassung, Lizenz und einem Link zum
  Quellcode — in jedem Bereich sichtbar, nicht in einem eigenen Reiter versteckt.
  § 13 der AGPL empfiehlt für Web-Anwendungen genau das: Wer die Anwendung
  benutzt, soll den Weg zum Quellcode finden. Die Fassung kommt aus
  `package.json` und wird beim Ausliefern der `index.html` eingesetzt, damit sie
  nicht an zwei Stellen gepflegt werden muss.
- **Fertiges Image aus der GitHub Container Registry.** Besteht der Smoke-Test,
  veröffentlicht die CI nach `ghcr.io/djrebrow/feedboard` — ein Push auf `main`
  als `:main`, ein Fassungs-Tag als `:2.1.0`, `:2.1` und `:latest`, jeweils für
  `linux/amd64` und `linux/arm64`. Damit entfällt das Selbstbauen auf dem
  Raspberry Pi. Pull Requests bauen weiterhin nur.

### Geändert

- **Lizenz: AGPL-3.0-or-later statt PolyForm Noncommercial 1.0.0.** Feedboard ist
  damit freie Software im Sinne der OSI — nutzen, weitergeben und ändern darf sie
  jeder, privat wie gewerblich. Die Gegenleistung steht in § 13 der Lizenz: Wer
  eine geänderte Fassung über ein Netzwerk anbietet, muss den Nutzern dieser
  Fassung den Quellcode dazu anbieten. Wer Feedboard unverändert betreibt, ist
  davon nicht betroffen. Die bisherige Lizenz verbot Firmen jede Nutzung, auch die
  rein interne, und schloss Feedboard gleichzeitig aus Verzeichnissen und
  App-Stores aus, die eine anerkannte Lizenz verlangen.

## [2.1.0] — 2026-07-30

Härtung und Sparsamkeit — von außen ändert sich am Aussehen nichts.

### Neu

- **Content Security Policy** und die üblichen Schutz-Kopfzeilen (`nosniff`,
  `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Permissions-Policy`).
  Feedboard zeigt fremde Inhalte an; die Oberfläche escaped sie, die CSP ist die
  zweite Reihe dahinter. Bewusst nicht gesetzt: `upgrade-insecure-requests` —
  viele Installationen laufen im Heimnetz über http.
- **Schriften kommen nicht mehr von Google.** Fraunces und Libre Franklin liegen
  als woff2-Teilmengen in `public/fonts/` (SIL OFL 1.1, siehe `OFL.txt` dort).
  Kein Aufruf bei einem fremden Dienst mehr beim Anzeigen, und offline sieht die
  PWA aus wie online. Der Browser holt über `unicode-range` nur die Zeichensätze,
  die er wirklich braucht.
- **Gzip für Antworten und Dateien.** `/api/board` schrumpft von gut 1 MB auf rund
  340 KB, `app.js` von 116 auf 30 KB. Gemessen auf einem Raspberry Pi 5 kostet
  Stufe 4 für das Megabyte 22 ms, Stufe 6 schon 35 ms bei 3 % weniger Umfang —
  deshalb Stufe 4 für Erzeugtes und Stufe 9 samt Vorrat im Speicher für die
  unveränderlichen Dateien aus `public/`.
- **Bremse fürs Aktualisieren.** Ohne Anmeldung darf ein Vollrefresh höchstens
  einmal pro Minute und ein einzelner Feed höchstens alle zehn Sekunden je
  Absender-IP angestoßen werden, sonst `429` samt Wartezeit. Angemeldet gilt
  keine Grenze. Ein Parallellauf war schon vorher ausgeschlossen — eine Schleife
  aus Einzelabrufen hämmerte aber ungebremst einen fremden Server.

### Geändert

- `/login.html` leitet auf `/login` um: nur dort bekommen Stil und Skript der
  Anmeldeseite den Nonce, den die CSP verlangt.
- Fehler tragen jetzt einen HTTP-Status; die API antwortet nicht mehr pauschal
  mit `400`.
- Symbolgrößen und der Kachel-Versatz stehen in der CSS-Datei statt als
  `style`-Attribut im erzeugten HTML — Inline-Stile verbietet die CSP.

## [2.0.0] — 2026-07-30

Erste veröffentlichte Fassung. Was davor lag, war Entwicklung im eigenen Netz
ohne Versionsstände — deshalb steht hier der gesamte Funktionsumfang und nicht
eine Liste von Unterschieden.

### Neu in dieser Fassung

- **Lebenszeichen unter `/api/healthz`** — antwortet mit Version und Laufzeit,
  und mit `503`, wenn der Prozess zwar läuft, aber nicht mehr an die Datenbank
  kommt. Das Docker-Image prüft das selbst per `HEALTHCHECK`, sodass
  `restart: unless-stopped` auch bei einem hängenden Prozess greift.
- **`docker-compose.yml` ist jetzt die Produktivfassung** — ohne eingehängtes
  `public/` und ohne `DEV_ASSETS`. Die Entwicklungseinstellungen stehen daneben
  in `docker-compose.dev.yml` und werden bei Bedarf daraufgelegt.
- **Automatische Prüfung bei jedem Push** (GitHub Actions): Smoke-Test unter
  Node 22, ein Start des Servers gegen eine frische Datenbank und ein Bau des
  Images für `linux/amd64` und `linux/arm64` — Letzteres, damit ein Bruch auf
  dem Raspberry Pi auffällt, bevor jemand dort baut.
- **`npm test`** startet den Smoke-Test; `jsdom` steht endlich als
  `devDependency` in der `package.json` statt nur zufällig im `node_modules`.

### Quellen verwalten

- Rubriken und Feeds vollständig über die Oberfläche: anlegen, umbenennen,
  sortieren, löschen — keine Konfigurationsdatei nötig
- Feed-Autodiscovery aus einer normalen Website-Adresse
- Öffentliche Telegram-Kanäle als Quelle
- Rubrik-Logos und eigener Anker je Rubrik für die Adresszeile
- OPML-Import und -Export
- Feeds pausieren; nach 20 Fehlversuchen in Folge pausiert ein Feed von selbst
- Bedingtes Abrufen über ETag und Last-Modified (gemessen 27 % weniger
  Übertragung)

### Lesen

- Startseite mit Rubrik-Kacheln, „Alle Artikel" als chronologischer Strom
- Kurzfassungen aus dem Feed, Artikel-Vorschau mit Bild
- Lese-Status, Ungelesen-Zähler, Ungelesen-Filter, gespeicherte Artikel
- Volltextsuche über SQLite FTS5 mit Trigramm-Tokenizer — Teilwortsuche, Treffer
  im Titel zuerst
- Volltext nachladen bei Anriss-Feeds, eigene Heuristik ohne Readability
- Gleiche Meldung aus mehreren Quellen zu einem Eintrag bündeln
- Ausblenden per Stichwort; gespeicherte Artikel bleiben unberührt
- Offline lesen: gespeicherte und ungelesene Artikel samt Text im Browser
- Tastatur-Navigation (`j`/`k`, `o`, `m`, `s`, `r`, `u`, `a`, `/`, `Esc`)
- Regeln: „Titel enthält X → gelesen, Stern oder verbergen", je Feed oder für
  alle, auf Wunsch rückwirkend

### KI und Teilen (beides optional)

- Kurzfassung und Übersetzung je Artikel über Anthropic, OpenAI, Google AI
  Studio, Groq, OpenRouter, Mistral, DeepSeek oder einen eigenen
  OpenAI-kompatiblen Endpunkt; Ergebnisse werden zwischengespeichert
- Tages-Briefing über die ungelesenen Artikel eines Zeitraums
- Artikel per Telegram teilen, Briefing zu fester Uhrzeit an gewählten
  Wochentagen
- Einrichtung im Einstellungsfenster; Geheimnisse verlassen den Server nie
  wieder, angezeigt werden nur die letzten vier Zeichen

### Sicherheit und Sicherung

- Lesen bleibt frei, Eingriffe verlangen eine Anmeldung, sobald ein Passwort
  gesetzt ist — scrypt-Hash in der Datenbank, signiertes Cookie für 30 Tage,
  Sperre nach zehn Fehlversuchen je Viertelstunde und IP
- Sicherung als JSON herunterladen und einspielen, in einer Transaktion;
  Zugangsdaten sind bewusst nicht enthalten

### Darstellung und Betrieb

- Einstellungen als Fenster mit Bereichsnavigation, auf dem Handy als Vollbild
- Hell, Dunkel (OLED-Schwarz) oder System; Schriftgröße, Zeilendichte,
  Thumbnails, Favicons wahlweise aus dem lokalen Cache
- Dreisprachige Oberfläche (Deutsch, Englisch, Russisch), auch die
  Servermeldungen
- Installierbar als PWA
- Fever-Schnittstelle für NetNewsWire, Reeder, FeedMe und Fluent Reader
- Zustand der Feeds im Einstellungsfenster: Häufigkeit, letzter Erfolg, Fehler
- SQLite über das eingebaute `node:sqlite` — keine nativen Abhängigkeiten

[Unveröffentlicht]: https://github.com/djrebrow/feedboard/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/djrebrow/feedboard/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/djrebrow/feedboard/releases/tag/v2.0.0
