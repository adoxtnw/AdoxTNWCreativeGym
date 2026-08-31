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

## Looking at one enemy without riding for it

The title screen leads to the **map**, and a fight only ever starts by tapping something on
a ride — so there is no way to see a new enemy without riding until one turns up.

```
index.html?enemy=enemy_surprise_strong
```

loads that units row's sprite, backdrop and persona and stops there. **A look, not a
fight.** An id the sheet does not have is ignored rather than being an error.

## Checking the enemy silhouettes

```bash
node ../shared/tools/check_rings.js
```

An enemy's tier is drawn as a shape — weak is concentric triangles, strong concentric
seven-pointed stars — and a shape squeezes the pixel thickness of every ring it bends. Thin
rings break into dashes and then vanish, and the sprite still looks like a sprite. This
measures the widest gap in every ring of every enemy, through a full breath; an unbroken
ring scores about **1**, and the circle enemies are the calibration. Run it after touching
`enemyTriRound`, `enemyShapeFill`, `enemyShapeBreathe`, `enemyStarInner` or the ring
geometry.

## Running away

**Hold anywhere on the arena and a ring closes under your finger.** Three seconds, and you
are out of the fight — at a cost of `fleeSegmentCost` (5) Track Segments off the ride you
were in the middle of.

Never a button. A control that says *leave* every turn is an interface arguing against its
own subject; a hold is invisible until you go looking for it, takes three seconds of
deciding, and is abandoned by letting go. It is available and it is never offered.

And it costs **segments**, not stamina and not crystals: segments are what the ride is
actually spending, so an escape is paid for in the units of the journey it interrupted.
Someone who runs from everything never arrives.

`src/escape.js`. It refuses on the controls (they have their own gestures — a long press
opens an ability tooltip, a swipe pages the panel), during the opening, mid-resolution,
during a Line Manager's second wind, and once the fight is over. It re-checks at the moment
it fires, because three seconds is long enough for the fight to have moved on under the
finger. `finish("flee")` is a third ending: the map is told `FLED`, which is not a loss.

## What a LINE MANAGER does that nothing else does

Keyed off `units.role` = `LINE_MANAGER`, so all six of them inherit the whole sequence from
one cell each. Nothing in `src/boss.js` knows which one.

**The second wind.** She cannot be killed below `bossPhaseAt` (20%). The music and the
interface go — leaving the arena and your own layers, and nothing else — she says what she
is, the screen flashes `bossFlashes` times, and she pulls herself back to `bossPhaseTo`
(50%) over five whole seconds. Then one more flash and a different song. That five seconds
is the fight being taken away from you and handed back, on purpose.

*Why the gate intercepts the killing blow.* "At 20%" cannot mean "when the bar lands on
20%": a heavy hit goes from 34% to below zero and never passes through it, and she would
simply die with her set piece unplayed. The test is `ms <= 20%`, which includes dead, and
the first thing the gate does is put her back on the line.

*And why she keeps her charge.* Charge is measured against the MS ceiling, so halving hers
left what she was holding sitting above it — the boss who had just declared herself the
embodiment of an emotion came back **overloaded**, feeding the player and hurting herself.
The rule is right; that is the wrong moment for it.

**The fall.** No particle burst and no clash wave. The music stops, she gets two parting
lines rather than one (`DEFEAT` then `DEFEAT2` — states only a Line Manager reaches), and
then she shakes her way off the bottom of the screen over `bossSinkMs` (7s). A thing that
was the embodiment of an emotion does not pop.

**And she is drawn 1.5x larger** (`units.scale`). By `transform`, not by layout: the ring
canvas is 64px across and the rings already breathe to its edge, so scaling the *geometry*
would push her through the buffer wall and clip her. Scaling the display is also the only
way she can overhang the arena, which is the point of her being bigger.

**A theme may be one file now.** `theme_opening` blank with `theme_loop` filled in simply
loops from the first sample — the original theme being a run-up plus a body is a property of
*that recording*, not of what a theme is. The pair is chosen together and never a column at
a time, or a unit supplying only a loop inherits the default theme's opening and plays
thirty seconds of the wrong music first.

## Where to look

| You want | Read |
|---|---|
| How this is built and why | `ARCHITECTURE.md` |
| What changed, pass by pass | `CHANGELOG.md` |
| The combat design | `../GDDs + Spreadsheets/AVUI_COMBAT_GDD.md` |
| The seam with the map | `../GDDs + Spreadsheets/AVUI_COMBAT_GDD.md` §13 |
