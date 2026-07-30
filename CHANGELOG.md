# Änderungen

Alle nennenswerten Änderungen an Feedboard. Die Versionen folgen
[Semantic Versioning](https://semver.org/lang/de/): die erste Zahl steigt bei
Brüchen, die zweite bei neuen Funktionen, die dritte bei Korrekturen.

## [Unveröffentlicht]

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

[Unveröffentlicht]: https://github.com/djrebrow/feedboard/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/djrebrow/feedboard/releases/tag/v2.0.0
