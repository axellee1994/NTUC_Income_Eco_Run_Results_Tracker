# NTUC Income Eco Run — Analytics Export Spec (v1)

Build brief for the data-export step of the Historical Analytics project. Everything below was confirmed against real API responses on 27 Sept 2026. Do not guess beyond it; if something here turns out to be wrong when you run it, stop and report back rather than working around it silently.

## Working method
- The person wants this built, but must be able to validate the reasoning afterwards. **After each notebook cell, explain in 2–3 plain sentences what it does and why.**
- Before writing code, restate the plan in a few lines and get a "go ahead".
- Coding standard: clear, explicit names; no nested ternaries or dense one-liners; prefer explicit if/else; don't over-consolidate concerns into one function; only comment what isn't obvious.
- Stack: Python (`requests`, `pandas`) in a Jupyter notebook (`.ipynb`).

## Where it lives
- Repo: `axellee1994/NTUC_Income_Eco_Run_Results_Tracker`
- Create a new folder **`analytics/` at the repo root**. Vercel's root directory is `frontend/`, so nothing in `analytics/` gets deployed. **Do not modify anything in `frontend/` or `backend/`.**
- Files:
  - `analytics/export_results.ipynb` — the notebook
  - `analytics/raw/` — cached raw JSON responses (add `analytics/raw/` to `.gitignore`)
  - `analytics/output/` — the CSVs Power BI will import

## Background: there is no existing export
The live tracker has no database or export. It fetches results live from the RaceRoster API in the visitor's browser and caches them only in that browser's `localStorage`. This notebook is the first time the data is saved anywhere.

## API (public, no auth)
Base URL: `https://results.raceroster.com/v2/api/`
Headers (mirror `backend/server.js`): `Accept: application/json`, `User-Agent: Mozilla/5.0`

| Endpoint | Returns | Notes |
|---|---|---|
| `events/{code}` | `data.event.subEvents[]` — each has `id`, `name`, `resultCount` | Use `resultCount` for the completeness check |
| `events/{code}/participant-search?phrase={p}` | `data.exact[]` + `data.other[]` — **combine both** | Each row: `id` (string), `name`, `bib` (string), `resultSubEventId` (**string**). **Capped at 100 results per phrase.** |
| `events/{code}/detail/{id}` | `data.result` — `chipTimeSec` (int or null), `chipTime` (e.g. `"2:00:21"`), `raceStatus` (e.g. `"COMPLETE"`), `resultSubEventId` (**int**) | One call per participant |

Gotchas confirmed from real responses:
- `resultSubEventId` is a string in search results and an int in detail results. Cast to int before comparing.
- `gender` is always `"Unknown"`, and `age`, `ageGroup`, `division`, `firstName`, `lastName` are always null. No demographic analysis is possible.
- `overallPlace` is blank; placings must be computed.
- The API's `distance` field is **wrong** for some 2025 races (15KM, 10KM and 3KM all claim `distance: 1`). **Never use API distance.** Use the `RACES` lookup below.
- Only `raceStatus = "COMPLETE"` has been observed so far. Other values may exist; keep whatever comes back.

## Events
```python
YEARS = {
    2024: "p2m7kjgqjqkzjrwn",
    2025: "ru6ha7aauyfgsk4b",
    2026: "agmtjs3rt7d9e5bb",
}
```

## In-scope races (hand-written lookup: race ID → clean race name)
Race names differ across years ("21.1km" vs "21.1KM Half Marathon"), so races are matched by this table, not by name or distance.

```python
RACES = {
    # 2024
    199895: "21.1km", 199896: "15km", 199897: "10km",
    199898: "5km",    199899: "3km",  200770: "700m Kids",
    # 2025
    230117: "21.1km", 230113: "15km", 230114: "10km",
    230115: "5km",    230116: "3km",  230742: "700m Kids",
    # 2026
    255209: "21.1km", 255210: "15km", 255211: "10km",
    255212: "5km",    255213: "3km",  255215: "700m Kids",
}
```

Out of scope (don't fetch details): 2024 "1KM (E-cert only)", 2025 "Kids - 1KM" and "Pets - 1KM", 2026 "1.2km - Kids", "1.2KM - Pets" and "700m - Pets". **These still matter for the duplicate-name check. See "Repeat-runner matching".**

**Adding 2027 later** should mean one new line in `YEARS` and six new lines in `RACES`, and nothing else. Design for that.

## Steps

### 1. Discover participants
- Search phrases, same as `frontend/js/loader.js`: `a`–`z`, `10`–`99`, `100`–`145` (162 phrases).
- For each year, run every phrase and collect unique participants **by `id`, never by name**. Two different people can share a name in the same race; for example, 2026 21.1km has two "Tan Sean"s (bibs 2548 and 1251).
- Keep **every** participant from **every** race, in-scope or not. That full list feeds the duplicate-name check.

### 2. Completeness check (mandatory, do not skip)
For each in-scope race, compare the unique participants found against the event's `resultCount`. Expected counts:

| Race | 2024 | 2025 | 2026 |
|---|---|---|---|
| 21.1km | 1,629 | 1,952 | 2,469 |
| 15km | 488 | 483 | 498 |
| 10km | 1,280 | 1,406 | 1,706 |
| 5km | 788 | 842 | 964 |
| 3km | 235 | 219 | 246 |
| 700m Kids | 184 | 201 | 293 |

Because search caps at 100 results per phrase, the 162 phrases might not reach everyone. **If any race comes up short, print the gap and stop.** Report it to the person instead of continuing. A likely fix is adding two-letter phrases (`aa`–`zz`) for the short year, but confirm with the person first.

### 3. Fetch details (in-scope races only)
- About 12,000 requests in total. Be polite: **at most about 10 concurrent requests**, with retry and backoff on HTTP 429/5xx.
- **Cache every raw response to disk** (`analytics/raw/{year}/detail/{id}.json`, and likewise `raw/{year}/search/{phrase}.json`). Skip the request if the file already exists, so a crash at request 9,000 resumes rather than restarting.
- Run 2026 only first, check the output, then run 2024 and 2025.

### 4. Write the CSVs

**`output/results.csv`**: one row per participant per year, in-scope races only. Keep all statuses; filtering happens in Power BI.

| Column | Type | Notes |
|---|---|---|
| `year` | int | |
| `race` | text | clean name from `RACES` |
| `race_id` | int | |
| `participant_id` | text | API `id` |
| `name` | text | as returned |
| `name_key` | text | lowercased, trimmed, repeated spaces collapsed. **Do not reorder words** |
| `bib` | text | keep as text |
| `chip_time_sec` | int, blank if null | used for all calculations |
| `chip_time` | text | display only |
| `race_status` | text | exactly as returned |

**`output/all_participants.csv`**: every participant from every race (used for the duplicate check): `year, race_id, race_name` (from the event's `subEvents`), `participant_id, name, name_key`.

**`output/repeat_runners.csv`**: see below.

### 5. Repeat-runner matching (confirmed rules — follow exactly)
Priority is **no false merges**, even if that means counting fewer repeat runners.

1. `name_key` = lowercase, trim, collapse repeated spaces. No fuzzy matching and no reordering ("Tan Eric" and "Eric Tan" stay different).
2. For each year, count each `name_key` across **all races in that year, including out-of-scope ones** (use `all_participants.csv`). Example: 2026 has "Eric Tan" in 10km **and** in 700m Pets, so "eric tan" is ambiguous in 2026.
3. Link a `name_key` between year X and year Y **only if it appears exactly once in X and exactly once in Y.** Decide this per pair of years: a name duplicated in 2026 can still link 2024↔2025.
4. Linking and pace comparison are separate: link on name alone (race can differ), but compute time change **only if both years are the same race and both rows are `COMPLETE` with `chip_time_sec > 0`.**

Columns: `name_key, year_from, year_to, race_from, race_to, same_race` (bool), `time_from_sec, time_to_sec, delta_sec` (blank unless same race and both valid; negative = faster).

Known limitation (for the report page): two different people who each have a unique name in their year can still be merged, because there's no participant ID across years. State this; don't try to solve it.

### 6. Summary printout at the end
- Rows per year × race (should match the table in step 2)
- `race_status` value counts per year. If anything other than `COMPLETE` appears, **flag it to the person.** It may bring back a partial finishers-vs-non-finishers view.
- **700m Kids 2024 check:** how many rows have `chip_time_sec > 0`. The 2024 race was labelled "E-cert only" and may be untimed. If most rows have no time, flag it; don't drop it automatically.
- Repeat runners: number linked per year pair, and how many are same-race with a valid `delta_sec`.

## Out of scope
- Gender/age analysis (no data)
- DNF (did not finish) rate (no registration data; only revisit if step 6 shows non-`COMPLETE` statuses)
- Any change to the live tracker
- Power BI itself. The person builds that in Power BI Desktop on Windows, from `output/`.

## Acceptance checks
- [ ] Counts per race match the step 2 table (or the gap is reported and the run stopped)
- [ ] `results.csv` has no duplicate `(year, participant_id)` pairs
- [ ] Both 2026 "Tan Sean"s appear in `results.csv` and neither appears in `repeat_runners.csv`
- [ ] "eric tan" does not link into or out of 2026
- [ ] Re-running the notebook makes no new API calls (everything comes from the cache)
- [ ] Nothing in `frontend/` or `backend/` changed