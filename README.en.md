# Feedboard

*[Deutsche Fassung](README.md)*

Self-hosted dashboard for RSS/Atom feeds and public Telegram channels. Categories and sources are created, renamed, reordered and deleted entirely through the interface — no YAML configuration required.

## Features

### Managing sources

- **Categories & feeds fully managed in the UI** (edit mode via the pencil icon in the gear menu)
- **Feed autodiscovery**: enter a plain website address (e.g. `heise.de`) — the RSS/Atom feed is found automatically, and the name is taken from the feed if none is given
- **Public Telegram channels** as a source: enter `@channel` or `t.me/channel`; the public web preview is parsed
- **Category logos** can be uploaded (stored as image data in the database), and each category has its own anchor for the address bar
- Categories and feeds can be reordered freely

### Reading

- **Home screen with category tiles**; clicking one opens the category with all its feeds (address `#/<anchor>`, so individual categories can be linked directly)
- **Summaries** taken from the feed contents (HTML stripped), expandable by clicking the article row
- **Article preview** with image and summary on mouse hover; on touch devices as a slide-in card
- **Read state** per article, plus "mark all as read" per feed or category, unread counters and a filter for unread articles
- **Saved articles** (star) with a dedicated view
- **Full-text search** across all available articles (title and summary)
- **Hiding by keyword** (mute words); saved articles are never hidden

### Appearance & operation

- **Theme: light, dark or system** — selectable in the gear menu; "system" follows the operating system setting and switches along with it while running. The sun/moon button remains as a quick light/dark toggle
- **Display settings**: font size, row density, thumbnails in the list, and favicons optionally served from the local cache (no calls to external services while browsing)
- **Bilingual interface** (German, Russian)
- **Installable as a PWA**; the app shell and the most recently loaded data are available offline
- **Automatic background refresh** (default: every 30 minutes) plus manual refresh, for a single feed or all of them
- Duplicate detection, per-feed error display (⚠ with details), at most 30 stored articles per feed
- SQLite via the **built-in `node:sqlite`** — no native dependencies, no compiling (ideal for a Raspberry Pi)

## Requirements

- **Node.js 22.5 or newer** (because of `node:sqlite`); the `ExperimentalWarning: SQLite` message at startup is normal and harmless
- Alternatively: Docker (the image ships with Node 22)

## Getting started (local)

```bash
npm install
npm start
```

Then open `http://localhost:8321` in the browser.

On the very first start, example categories are created (heise, Golem, tagesschau) — they can be deleted or replaced in edit mode.

## Getting started (Docker / Raspberry Pi)

```bash
docker compose up -d --build
```

The database lives in the `./data` folder and survives container restarts and updates.

## Configuration (environment variables)

| Variable                 | Default               | Meaning                                                                                                     |
| ------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `PORT`                   | `8321`                | HTTP port                                                                                                     |
| `FETCH_INTERVAL_MINUTES` | `30`                  | Refresh interval in minutes (5–59)                                                                            |
| `DB_PATH`                | `./data/feedboard.db` | Path to the SQLite file                                                                                       |
| `DEV_ASSETS`             | –                     | `1` = determine the asset version from file timestamps on every page request (for live frontend development)   |

## API (in case you want to use it directly)

### Board & metrics

| Method & path     | Purpose                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /api/board`  | The whole board (categories → feeds → articles)                                                                   |
| `GET /api/stats`  | Lightweight metrics for external dashboards: unread, categories, feeds, failing feeds, articles, saved, last fetch |

### Categories

| Method & path                     | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| `POST /api/categories`            | Create a category `{ name, slug? }`            |
| `PATCH /api/categories/:id`       | Rename a category `{ name, slug? }`            |
| `PUT /api/categories/:id/logo`    | Set the logo `{ logo }` (image as a data: URI) |
| `DELETE /api/categories/:id/logo` | Remove the logo                                |
| `DELETE /api/categories/:id`      | Delete a category with its feeds and articles  |
| `POST /api/categories/reorder`    | Set the order `{ ids: [3,1,2] }`               |

### Feeds

| Method & path                 | Purpose                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `POST /api/feeds`             | Create a feed `{ category_id, url, name? }` (website address, RSS address or Telegram channel) |
| `PATCH /api/feeds/:id`        | Rename a feed `{ name }`                                                           |
| `DELETE /api/feeds/:id`       | Delete a feed                                                                      |
| `POST /api/feeds/reorder`     | Set the feed order `{ ids: […] }`                                                  |
| `POST /api/feeds/:id/refresh` | Refresh a single feed immediately                                                  |
| `POST /api/refresh`           | Refresh all feeds immediately                                                      |

### Reading, saving, searching

| Method & path                   | Purpose                                                |
| ------------------------------- | ------------------------------------------------------ |
| `POST /api/articles/:id/read`   | Mark an article read/unread `{ read }`                 |
| `POST /api/feeds/:id/read`      | Mark all articles of a feed as read                    |
| `POST /api/categories/:id/read` | Mark all articles of a category as read                |
| `POST /api/articles/:id/star`   | Save/unsave an article `{ starred }`                   |
| `GET /api/saved`                | Saved articles (max. 200)                              |
| `GET /api/search?q=…`           | Full-text search across all articles (max. 100 hits)   |
| `GET /api/settings/mute`        | Read the mute words                                    |
| `PUT /api/settings/mute`        | Set the mute words `{ words: […] }`                    |
| `GET /api/favicon?host=…`       | Serve a favicon from the local cache                   |

## Development

`smoke-test.js` checks the frontend (rendering, category drill-down, edit mode, theme selection, XSS escaping) without a browser. Run `npm install --no-save jsdom` once, then `node smoke-test.js`.

**Changing the frontend without a rebuild:** `docker-compose.yml` mounts `./public` into the container read-only and sets `DEV_ASSETS=1`. Changes to HTML, CSS and JavaScript are then visible after a reload in the browser. Backend changes (`server.js`, `db.js`, `feedFetcher.js`, `telegram.js`) live in the image and require `docker compose up -d --build`. For plain production use, the mounted line and `DEV_ASSETS` can be removed from `docker-compose.yml`.

## Project layout

```
server.js        Express server, API, cron job
db.js            SQLite schema and data access (node:sqlite)
feedFetcher.js   RSS/Atom parsing, summaries, autodiscovery
telegram.js      Public Telegram channels via the web preview
public/          Frontend (HTML/CSS/JS, no framework, PWA)
data/            SQLite database and favicon cache (created automatically)
```
