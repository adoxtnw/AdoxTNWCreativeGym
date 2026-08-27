# Neuro Metro: AVUI — BATTLE SYSTEM

Everything that happens *inside* a fight. The map and the meta layer live in
their own prototype; the two are kept apart until both are settled.

A single self-contained `index.html`. No build step, no dependencies, no network calls.

## Run it

- **Desktop:** double-click `index.html`. It renders inside a phone frame.
- **Phone:** open `index.html` from local storage, or host it (below).
- **GitHub:** push this folder and enable **GitHub Pages**, then share
  `https://<user>.github.io/<repo>/proto-01-line-battle/`.
  A `raw.githubusercontent.com` URL will **not** work — GitHub serves raw HTML as `text/plain`, so
  the browser shows source instead of the game. Pages (or any static host) is required.

## Controls

| Action | Input |
|---|---|
| Add ability to your line | Tap it in the tray |
| Reorder the line | Drag a node left/right |
| Remove from the line | Tap a node in the line |
| Resolve the turn | **DEPART** |

## Running it

```bash
python3 ../shared/tools/serve.py --app "BATTLE SYSTEM"
```

Never `python3 -m http.server` — `serve.py` stamps every asset URL with its mtime, and
without that the browser will happily run a cached copy of a file you just edited.

## Rebuilding content

All content and tuning lives in the spreadsheet, never in code:

```bash
cd ../shared/tools
python3 build_workbook.py --app "BATTLE SYSTEM"     # seeds -> the workbook
python3 export_csv.py                                # workbook -> CSV
python3 build_data.py ../config/csv --app "BATTLE SYSTEM"   # CSV -> data.js
python3 stamp.py --app "BATTLE SYSTEM"               # version + modified stamp
```

The tooling and the spreadsheet are **shared with MAP** and live in `AVUI/shared/`.
The emotions table is the spine of both systems, so it exists exactly once.

## Where to look

| You want | Read |
|---|---|
| How this is built and why | `ARCHITECTURE.md` |
| What changed, pass by pass | `CHANGELOG.md` |
| The combat design | `../GDDs + Spreadsheets/AVUI_COMBAT_GDD.md` |
| The seam with the map | `../GDDs + Spreadsheets/AVUI_COMBAT_GDD.md` §13 |
