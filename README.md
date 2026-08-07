# Income Eco Run – Results Viewer

Built by **axlee/axellee1994** because the official results page was incredibly shitty and had redundant information on it.

The [official site](https://results.raceroster.com/v3/events/agmtjs3rt7d9e5bb) only shows your name, distance, and bib number — no placement, no chip time, nothing useful. So I built my own viewer with one goal: **find out where I actually placed.**

## Supported years

| Year | Event code | Official results |
|---|---|---|
| 2024 | `p2m7kjgqjqkzjrwn` | [results.raceroster.com](https://results.raceroster.com/v3/events/p2m7kjgqjqkzjrwn) |
| 2025 | `ru6ha7aauyfgsk4b` | [results.raceroster.com](https://results.raceroster.com/v3/events/ru6ha7aauyfgsk4b) |
| 2026 | `agmtjs3rt7d9e5bb` | [results.raceroster.com](https://results.raceroster.com/v3/events/agmtjs3rt7d9e5bb) |

On load, a year-selection screen appears. Pick a year, and the dashboard fetches that year's race list from the API. A **← Year** button in the navbar returns you to the selector at any time.

## Original website vs. mine

| | |
|---|---|
| Original | ![Original website](frontend/images/before.png) |
| Mine | ![My viewer](frontend/images/after.png) |

## Tech stack

No npm packages, no build step — just the platform plus Bootstrap for styling.

| Layer | What's used |
|---|---|
| **Runtime** | Node.js (stdlib only — `http`, `https`, `fs`, `path`) |
| **Frontend** | Vanilla HTML + ES module JavaScript |
| **CSS** | [Bootstrap 5.3](https://getbootstrap.com/) (CDN) + small custom overrides for the brand accent colour |
| **API** | RaceRoster v2 REST API (`results.raceroster.com`) |
| **Proxy** | Forwards `/api/*` to RaceRoster to avoid CORS — two implementations, see [Deployment](#deployment) |
| **Caching** | Browser `localStorage` (permanent, namespaced by year + race ID) |
| **Deployment** | Vercel (serverless function) for hosting; Docker/local Node for dev |

## Features

- Year-selection landing page (2024, 2025, 2026) with year badge in the navbar for always-visible context
- First race auto-loads immediately after selecting a year — no extra button click needed
- Race category dropdown loaded from the live event API
- Pipelined loading — timing fetches start as soon as each participant is discovered, both phases run concurrently
- 20 parallel prefix searches (a–z, 10–145) to discover every participant
- Up to 50 concurrent timing fetches, streamed into the table as they arrive
- Search by name or bib — matching text is highlighted in results
- Sort by position, bib, name, or chip time
- Gold/silver/bronze highlights for the top 3
- Back to top button appears after scrolling, returns to the top smoothly
- Permanent `localStorage` cache per year — results are final, so reopening any race is instant
- Switching to a previously loaded race restores it from cache immediately, no button click needed
- Race dropdown is locked during an active load to prevent mid-flight state corruption
- Falls back to a baked-in static race list (2026 only) if the API is unreachable

## Project structure

```
├── backend/
│   └── server.js              # Local dev: static file server + HTTPS proxy to results.raceroster.com
└── frontend/
    ├── index.html
    ├── vercel.json            # Vercel: rewrites /api/* to the proxy function
    ├── api/
    │   └── proxy.js           # Vercel: serverless proxy to results.raceroster.com
    ├── css/styles.css
    └── js/
        ├── app.js             # Bootstrap, event wiring, load orchestration
        ├── api.js             # Fetch wrappers for RaceRoster v2 API
        ├── loader.js          # Pipelined discovery + timing fetch, semaphore, cache
        ├── render.js          # Table rendering, sorting/filtering, progress bar
        ├── state.js           # Shared mutable state (event code, selection, participants)
        ├── years.js           # Year → event code mapping (2024, 2025, 2026)
        └── races/
            ├── index.js       # Loader — imports and re-exports all races as an array
            ├── 21_1_km.js     # 21.1KM Half Marathon (id 255209)
            ├── 15_km.js       # 15KM              (id 255210)
            ├── 10_km.js       # 10KM              (id 255211)
            ├── 5_km.js        # 5KM               (id 255212)
            ├── 3_km.js        # 3KM               (id 255213)
            ├── 1_2_km_kids.js # 1.2km - Kids      (id 255214)
            ├── 700m_kids.js   # 700m - Kids        (id 255215)
            ├── 1_2_km_pets.js # 1.2KM - Pets      (id 255216)
            └── 700m_pets.js   # 700m - Pets        (id 255217)
```

## 2026 static race fallback

The `races/` directory contains baked-in race configs for 2026, used when the API is unreachable. No equivalent exists for 2024/2025 — if those years can't be fetched, an error message is shown instead.

| File | Race | Sub-event ID | Participants |
|---|---|---|---|
| `21_1_km.js` | 21.1KM Half Marathon | 255209 | 2,469 |
| `15_km.js` | 15KM | 255210 | 498 |
| `10_km.js` | 10KM | 255211 | 1,706 |
| `5_km.js` | 5KM | 255212 | 964 |
| `3_km.js` | 3KM | 255213 | 246 |
| `1_2_km_kids.js` | 1.2km - Kids | 255214 | 123 |
| `700m_kids.js` | 700m - Kids | 255215 | 293 |
| `1_2_km_pets.js` | 1.2KM - Pets | 255216 | 254 |
| `700m_pets.js` | 700m - Pets | 255217 | 68 |

## Caching

Results are cached permanently in `localStorage` under the key `race_{year}_{subEventId}`. Since all three years are past events with finalised results, there is no TTL — the cache never expires on its own.

To force a fresh fetch (e.g. if results were corrected), clear `localStorage` in browser devtools:

```js
localStorage.clear()
```

## Running locally

Need Node.js — that's it, no `npm install`.

```bash
node backend/server.js
```

Open [http://localhost:3001](http://localhost:3001).

## Deployment

The app is hosted on **Vercel**, but there are **two copies of the same proxy** — one per environment. Both do the identical job (forward `/api/*` to `results.raceroster.com` with a browser `User-Agent` to dodge CORS and UA filtering); they just run in different places.

| Environment | Static files | Proxy | Entry point |
|---|---|---|---|
| **Vercel** (production) | Served from `frontend/` | `frontend/api/proxy.js` (serverless function), routed via `frontend/vercel.json` | push to `main` auto-deploys |
| **Local / Docker** (dev) | Served by `backend/server.js` | `backend/server.js` (same file, built-in `/api/*` proxy) | `node backend/server.js` |

The frontend calls `/api/...` unchanged in both — each environment resolves that path to its own proxy.

> **Vercel note:** the project's **Root Directory is `frontend`**, so everything Vercel deploys must live inside `frontend/`. That's why `api/` and `vercel.json` sit there rather than at the repo root — files at the repo root are outside the deploy scope and silently ignored.

## Running with Docker

```bash
sudo docker build -t income-eco-run .
sudo docker run -p 3001:3001 income-eco-run
```

Open [http://localhost:3001](http://localhost:3001).

### Troubleshooting port conflicts

If you see "address already in use" or "port is already allocated", free up port 3001 with:

**1. Find what is using port 3001 and kill its PID:**
```bash
sudo lsof -i :3001
sudo kill -9 <PID>
```

**2. Stop and remove old Docker containers:**
```bash
sudo docker ps -a -q | xargs -r sudo docker rm -f
```

## How it works

1. A year-selection screen appears on load. Choosing a year sets the RaceRoster event code, fetches the race list from the API, then auto-loads the first race. If the API fails, 2026 falls back to the static configs in `races/`.
2. Loading fires 162 prefix searches (a–z, 10–145) at 20 concurrent to discover every participant ID in the selected race.
3. Timing fetches begin immediately as participants are discovered — both phases run in parallel rather than sequentially, with up to 50 concurrent timing requests.
4. The table updates live every 50 records as timing data arrives. Search matches are highlighted inline.
5. The completed result set is cached permanently in `localStorage` keyed by year and race ID — subsequent loads are instant.
6. Switching races checks the cache first. If data is already there it renders immediately; otherwise the **▶ Load Results** button is shown. The race dropdown is disabled while a load is in progress to prevent state corruption.
