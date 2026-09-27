# Power BI Guide: NTUC Income Eco Run 2024–2026

A question-led guide to building a 4-page Power BI report from `analytics/output/`.
Each step has a **Goal**, a **Question** to work out yourself, a **Hint**, and an **Answer** (collapsed). Try the question before opening the answer.

**Total time:** about 15–20 hours for a first-time Power BI user. Stage 3 (DAX) takes the longest.

---

## 0. Before you start (15 min)

1. Install **Power BI Desktop** (free, Windows only) from the Microsoft Store.
2. Copy the `analytics/output/` folder to your Windows machine.
3. Read "Data facts" below. Every caveat there ends up on the Methodology page.

### Data facts

| Fact | Detail | What to do in Power BI |
|---|---|---|
| Size | `results`: 15,887 rows (2024: 4,603 · 2025: 5,103 · 2026: 6,181) | – |
| Completeness | Every race matches RaceRoster's official count, except 1 result in 2024 15km that RaceRoster counts but does not publish | Mention on the Methodology page |
| 700m Kids times are placeholders | Every kid in a year has the same time: 2024 = 1:00:00, 2025 = 7:00, 2026 = 10:00 | Count kids as participants; exclude them from every time and pace measure (step 3.7) |
| Non-finishers | Only 2 rows are not `COMPLETE` (2024 10km, `IN_PROGRESS`, no time) | Too few for a finish-rate view; they are already excluded from time measures |
| Unnamed runners | 29 rows in 2024 (26 in 10km, 3 in 5km) have no name, probably group bibs | They count as participants and are never linked as repeat runners |
| Fractional times | 14 times in 2024 had tenths of a second; they are rounded up to match RaceRoster's displayed time | – |
| Repeat runners | 2,796 links (2024→2025: 863 · 2024→2026: 703 · 2025→2026: 1,230), matched on names that are unique in both years, ignoring word order (2025 lists names first-name-first) | 1,948 have a time change; 74 of those are 700m Kids placeholder times, so exclude them (step 3.8) |
| No demographics | The API returns no gender or age | Say so on the Methodology page |

---

## Stage 1: Import and Power Query (2–3 h)

### 1.1 Load the three CSVs
**Goal:** `results`, `all_participants` and `repeat_runners` appear as tables in the Data pane.

**Question:** Power BI offers **Load** and **Transform Data** when you import a file. Which one lets you check the column types before anything is loaded, and why does that matter for `bib`?

**Hint:** some bibs start with a letter (`B349`), and others could have leading zeros.

<details><summary>Answer</summary>

Use **Get Data → Text/CSV → Transform Data**. This opens Power Query, where you can correct types before loading. If Power BI guesses `bib` as a number, text bibs like `B349` become errors and leading zeros disappear.
</details>

### 1.2 Set column types
**Goal:** every column has the right type.

**Question:** which columns should be **Whole Number**, which **Text**, and which **True/False**? What should happen to a blank `chip_time_sec`?

<details><summary>Answer</summary>

| Table | Whole Number | Text | True/False |
|---|---|---|---|
| results | year, race_id, chip_time_sec | race, participant_id, name, name_key, bib, chip_time, race_status | – |
| all_participants | year, race_id | race_name, participant_id, name, name_key | – |
| repeat_runners | year_from, year_to, time_from_sec, time_to_sec, delta_sec | name_key, race_from, race_to | same_race |

A blank `chip_time_sec` stays **null**. Don't replace it with 0, because a 0 would drag down every average and median.
</details>

### 1.3 Add a time-in-minutes column
**Goal:** a `chip_time_min` column in `results` for the histogram in Stage 4.

**Question:** should this be a Power Query column or a DAX measure? What is the difference between a value calculated per row and a value calculated per visual?

<details><summary>Answer</summary>

Use a Power Query column: **Add Column → Custom Column**, `[chip_time_sec] / 60`, type Decimal Number. It is a fixed value per row, which is what a histogram axis needs. A measure is recalculated per visual (for example, a median for whatever is filtered) and can't go on an axis as a per-runner value.
</details>

---

## Stage 2: Data model (2–3 h)

### 2.1 Build a race dimension
**Goal:** a small `DimRace` table with one row per race.

**Question:** the CSV has race names but no distances. Pace per km needs a distance. Where should that fact live: in `results` (repeated on 17,000 rows) or in a 6-row table? What else belongs in that table?

**Hint:** think about sort order. Alphabetically, "10km" sorts before "3km".

<details><summary>Answer</summary>

**Home → Enter Data**, name it `DimRace`:

| race | distance_km | race_order |
|---|---|---|
| 21.1km | 21.1 | 1 |
| 15km | 15 | 2 |
| 10km | 10 | 3 |
| 5km | 5 | 4 |
| 3km | 3 | 5 |
| 700m Kids | 0.7 | 6 |

Add a fourth column, `has_real_times`: TRUE for every race except 700m Kids, which is FALSE (see Data facts).

Then select `DimRace[race]` → **Column tools → Sort by column → race_order**. The race name matches the `race` column in the CSVs exactly, which is what the relationship joins on.
</details>

### 2.2 Build a year dimension
**Goal:** a `DimYear` table.

**Question:** can a table be created with a DAX formula instead of typed in? Why would a formula be better here?

<details><summary>Answer</summary>

**Modeling → New Table**: `DimYear = DISTINCT(results[year])`. It updates itself when 2027 is added to the CSV.
</details>

### 2.3 Create relationships
**Goal:** a star schema in **Model view**.

**Question:** which side of each relationship is "one" and which is "many"? `repeat_runners` has two years and two races. Which ones should it connect to, and why can't both connect at the same time?

**Hint:** Power BI allows only one *active* relationship between two tables.

<details><summary>Answer</summary>

| From (one) | To (many) | Active |
|---|---|---|
| DimRace[race] | results[race] | yes |
| DimYear[year] | results[year] | yes |
| DimRace[race] | repeat_runners[race_to] | yes |
| DimYear[year] | repeat_runners[year_to] | yes |

Link `repeat_runners` on the `_to` side, so a year slicer means "runners who came back in year X". Leave `all_participants` unconnected; it was only needed for the duplicate-name check in Python.

Interview point: "two facts sharing conformed dimensions" is standard star-schema vocabulary.
</details>

### 2.4 Hide what report users shouldn't drag in
**Question:** if `results[race]` and `DimRace[race]` both appear in the field list, which should visuals use, and what goes wrong if someone uses the other?

<details><summary>Answer</summary>

Always use `DimRace[race]`. A slicer on `results[race]` would not filter `repeat_runners`. Right-click the fact-table key columns (`results[race]`, `results[year]`, `repeat_runners[race_to]`, `repeat_runners[year_to]`) → **Hide in report view**.
</details>

---

## Stage 3: DAX measures (5–7 h)

Create an empty table to hold measures: **Enter Data** → name it `_Measures` → one dummy column, which you delete once the first measure is in. Put every measure there.

### 3.1 Count participants
**Goal:** `Participants`.

**Question:** what is the difference between `COUNT(results[participant_id])` and `COUNTROWS(results)`? When would they give different answers?

<details><summary>Answer</summary>

```DAX
Participants = COUNTROWS(results)
```
`COUNT` skips blanks in that column; `COUNTROWS` counts rows. The answers here are the same, but `COUNTROWS` says what you mean.
</details>

### 3.2 Median finish time
**Goal:** `Median Time (sec)`, using only valid times.

**Question:** which rows should be left out of a time calculation? How do you apply a filter *inside* a measure, whatever the visual is already filtering?

**Hint:** this is the key idea in DAX: `CALCULATE` changes the filter context.

<details><summary>Answer</summary>

```DAX
Median Time (sec) =
CALCULATE(
    MEDIAN(results[chip_time_sec]),
    results[race_status] = "COMPLETE",
    results[chip_time_sec] > 0
)
```
Use the same pattern for `Fastest Time (sec)` with `MIN`. Step 3.7 adds one more filter, for the kids' race.
</details>

### 3.3 Show seconds as h:mm:ss
**Goal:** `Median Time` displays as `2:16:11`.

**Question:** Power BI has no duration type. How do you turn 8,171 seconds into hours, minutes and seconds? Why can this text measure go in a card but not on a chart's value axis?

<details><summary>Answer</summary>

```DAX
Median Time =
VAR TotalSeconds = [Median Time (sec)]
VAR Hours = INT(TotalSeconds / 3600)
VAR Minutes = INT(MOD(TotalSeconds, 3600) / 60)
VAR Seconds = MOD(TotalSeconds, 60)
RETURN
    IF(
        ISBLANK(TotalSeconds),
        BLANK(),
        Hours & ":" & FORMAT(Minutes, "00") & ":" & FORMAT(Seconds, "00")
    )
```
It returns text, and charts need numbers. On charts, plot `Median Time (sec) / 60` as minutes.
</details>

### 3.4 Pace per km
**Goal:** `Median Pace (sec/km)` and a display version like `5:42 /km`.

**Question:** the distance lives in `DimRace`. How does a measure read a value from a dimension for the race currently in the visual, and what should it return if a visual shows several races at once?

<details><summary>Answer</summary>

```DAX
Median Pace (sec/km) =
DIVIDE([Median Time (sec)], SELECTEDVALUE(DimRace[distance_km]))
```
`SELECTEDVALUE` returns blank when more than one race is in context, so a total row shows blank instead of a meaningless mixed pace. `DIVIDE` handles divide-by-zero. The display version follows the same pattern as 3.3, with minutes and seconds only.
</details>

### 3.5 Year-on-year growth
**Goal:** `Participants PY` and `Participants YoY %`.

**Question:** in a visual filtered to 2026, how do you count 2025 instead? What should 2024 show, since there is no 2023?

<details><summary>Answer</summary>

```DAX
Participants PY =
VAR CurrentYear = SELECTEDVALUE(DimYear[year])
RETURN CALCULATE([Participants], DimYear[year] = CurrentYear - 1)

Participants YoY % =
DIVIDE([Participants] - [Participants PY], [Participants PY])
```
2024 shows blank, because `DIVIDE` by a blank returns blank. Format YoY % as a percentage.
</details>

### 3.6 Placings (calculated column)
**Goal:** a `Place` column in `results`. The API leaves placings blank.

**Question:** is a placing a per-row fact (column) or a per-visual summary (measure)? How do you compare one runner with everyone else in *their own* year and race?

**Hint:** inside a calculated column, save the current row's values in variables first.

<details><summary>Answer</summary>

**Table view → results → New Column**:
```DAX
Place =
VAR ThisYear = results[year]
VAR ThisRace = results[race]
VAR ThisTime = results[chip_time_sec]
VAR IsValid = results[race_status] = "COMPLETE" && ThisTime > 0
RETURN
    IF(
        IsValid,
        COUNTROWS(
            FILTER(
                results,
                results[year] = ThisYear
                    && results[race] = ThisRace
                    && results[race_status] = "COMPLETE"
                    && results[chip_time_sec] > 0
                    && results[chip_time_sec] < ThisTime
            )
        ) + 1
    )
```
Runners with the same time share a place, as in official results. It takes a few seconds to calculate; that's normal.
</details>

### 3.7 Exclude placeholder times
**Goal:** time measures ignore 700m Kids, whose "times" are placeholders.

**Question:** should you delete those rows, filter them in every visual, or handle them once in the model? Which choice would a reviewer trust most? Can a filter on `DimRace` affect a measure over `results`?

<details><summary>Answer</summary>

Handle it once, through the `has_real_times` column you added to `DimRace` in 2.1. Add it as a filter in the time measures:
```DAX
Median Time (sec) =
CALCULATE(
    MEDIAN(results[chip_time_sec]),
    results[race_status] = "COMPLETE",
    results[chip_time_sec] > 0,
    DimRace[has_real_times] = TRUE()
)
```
The filter on `DimRace` flows through the relationship to `results`. Kids still count towards `Participants`, and no chart shows a fake 1-hour kids' time. For `Place` (3.6), add `&& RELATED(DimRace[has_real_times])` to `IsValid`.
</details>

### 3.8 Repeat-runner measures
**Goal:** `Returners`, `Returners With Times`, `% Improved`, `Median Change (sec)`.

**Question:** `delta_sec` is negative when a runner got faster. How do you count only the rows where it's negative, and what should the denominator be?

<details><summary>Answer</summary>

```DAX
Returners = COUNTROWS(repeat_runners)

Returners With Times =
CALCULATE(COUNT(repeat_runners[delta_sec]), DimRace[has_real_times] = TRUE())

% Improved =
DIVIDE(
    CALCULATE(
        COUNTROWS(repeat_runners),
        repeat_runners[delta_sec] < 0,
        DimRace[has_real_times] = TRUE()
    ),
    [Returners With Times]
)

Median Change (sec) =
CALCULATE(MEDIAN(repeat_runners[delta_sec]), DimRace[has_real_times] = TRUE())
```
The denominator is only the rows with a `delta_sec`: same race, both years timed. Dividing by all returners would understate improvement. The `has_real_times` filter removes 74 kids whose "change" comes from placeholder times (1:00:00 in 2024 → 7:00 in 2025 isn't a real 53-minute improvement).
</details>

---

## Stage 4: Report pages (3–5 h)

Put a **Year** slicer and a **Race** slicer on every page, then **View → Sync slicers** so a selection carries across pages.

### Page 1: Overview
**Question:** what should a recruiter take from this page in 5 seconds?

<details><summary>Suggested layout</summary>

- Top row, cards: Participants (latest year), Participants YoY %, number of races, Returners.
- Clustered column chart: `DimRace[race]` on the axis, `DimYear[year]` as the legend, `Participants` as the value.
- Title that states the finding, e.g. "21.1km grew X% since 2024". Take X from your own card.
</details>

### Page 2: Race performance
**Question:** how do you show the *spread* of finish times, not just the average?

<details><summary>Suggested layout</summary>

- Histogram: right-click `chip_time_min` → **New group** → bin size 5, then a column chart of the bins against `Participants`. Filter to one race with the slicer.
- Table: race × year with Median Time, Fastest Time, Median Pace.
- Line chart: `DimYear[year]` against `Median Time (sec) / 60` per race, to see whether the field got faster.
</details>

### Drill-through: Race detail
**Question:** how can a user right-click a race on page 2 and jump to a page about only that race?

<details><summary>Answer</summary>

Create a new page and drag `DimRace[race]` into **Drill through** in the Visualizations pane. Add a table of name, bib, chip_time and Place, filtered to `Place <= 10`. Power BI adds a back button automatically.
</details>

### Page 3: Repeat runners
**Question:** what's the most interesting story in `repeat_runners`: who came back, who changed race, or who got faster?

<details><summary>Suggested layout</summary>

- Cards: Returners, % Improved, Median Change (as m:ss).
- Matrix: `race_from` rows × `race_to` columns, `Returners` as the value. This shows upgrades such as 10km → 21.1km.
- Histogram of `delta_sec / 60` for same-race returners.
- Caption: "Linked by exact unique name; see Methodology".
</details>

### Tooltip page
**Question:** can hovering over a column show a mini summary instead of one number?

<details><summary>Answer</summary>

Create a new page. In **Format → Page information**, turn **Allow use as tooltip** on and set the canvas to Tooltip size. Add Participants, Median Time and Fastest Time cards. Then, on a page-1 chart, go to **Format → General → Tooltips → Type: Report page** and pick it.
</details>

### Page 4: Methodology
**Goal:** show that you understand where the data came from and its limits.

<details><summary>Suggested content</summary>

- Pipeline: RaceRoster public API → Python notebook (cached, rate-limited, completeness-checked) → 3 CSVs → Power BI star schema.
- Completeness: every race matches RaceRoster's official count, apart from results RaceRoster hides (see Data facts).
- Limitations: no gender or age data from the API; name-based repeat-runner matching ignores word order, because 2025 lists names first-name-first (two different people with the same unique name can still be merged); unnamed participants excluded from matching; placeholder kids' times excluded from time measures.
</details>

---

## Stage 5: Polish and package (2–3 h)

1. **View → Themes → Customize current theme**: pick 2–3 colours and use them everywhere.
2. Give every visual a title that states a finding, not just "Participants by race".
3. **File → Export → Export to PDF** as a backup viewable without Power BI. Publishing to the web needs a work or school account.
4. Commit `EcoRun.pbix` and 3–4 screenshots to the repo, and add a short "Power BI report" section to the README.

### Interview questions to be ready for
- Why a star schema instead of one flat table?
- What is the difference between a calculated column and a measure? (Place vs Median Time)
- What does `CALCULATE` do to the filter context?
- How did you make sure no participants were missing? (completeness check against the official count)
