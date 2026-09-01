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

**And she is drawn 1.5x larger** (`units.scale`, carried by every station boss). By
`transform`, not by layout: the ring canvas is 64px across and the rings already breathe to
its edge, so scaling the *geometry* would push her through the buffer wall and clip her.
Scaling the display is also the only way she can overhang the arena, which is the point of
her being bigger.

*And it silently did nothing for three passes.* `transform` is ONE property. `.sprwrap`
carried a static `transform:scale(var(--esc))` **and** ran the `hover` bob — and a running
animation does not compose with the static declaration, it replaces it. The computed transform
was `matrix(1,0,0,1,0,2.4)`: the bob, at scale 1. `--esc` was being set to 1.5 correctly the
whole time and had no effect on anything, which is exactly why it kept looking undone. The
scale is now written into both ends of the `hover` keyframes, where the animation cannot
overwrite it. Worth remembering the shape of this one: **the value was right, the property was
already spoken for.**

`--esc` is set on `.enemyholder` rather than on the sprite, so it inherits to the name plate
too — the sprite scales about its own centre, so a boss at 1.5x grows ~47px upward and walked
straight over a name parked 30px above the box. The plate's offset is derived from the same
variable, so a bigger boss later moves it further on its own.

**A theme may be one file now.** `theme_opening` blank with `theme_loop` filled in simply
loops from the first sample — the original theme being a run-up plus a body is a property of
*that recording*, not of what a theme is. The pair is chosen together and never a column at
a time, or a unit supplying only a loop inherits the default theme's opening and plays
thirty seconds of the wrong music first.

## The first heal

`LO_DISGUST` carries **Self-Respect** — 45 MS back, 35 EC, **one use, three-turn cooldown**.
Disgust is the right colour for it: the set is otherwise entirely about what you cannot stand
in somebody else, and this is the same feeling turned around.

It needed a new `HEAL` kind. `FEED` already heals, but it heals the **opponent** — it is the
punishment Overload forces into your line — so reusing it would have been reusing the word
rather than the behaviour. `power` carries the amount, the way it does for shield charges,
grown layers and charge gained; the sheet's `heal` column is still marked *planned* and using
it would have put this one ability's magnitude in a different cell from everybody else's.

**Clamped to MaxMS, and that is not tidiness.** MS is also the ceiling Emotional Charge has to
stay under, so a heal that overshot would quietly hand out headroom the armor never granted.

| from | to |
|---|---|
| 200 | 245 |
| 380 | 400 (not 425) |
| 400 | 400 |

The build-phase projection agrees with the live result, so the preview never promises a number
the fight then contradicts.

## `ai_profile`: how an enemy decides

The column had existed since the sheet did and nothing read it, so every enemy in the game
shared one brain. That is fine until an enemy's whole idea is that it fights differently.

| | |
|---|---|
| `GREEDY_MAX_DAMAGE` | the default. Takes at most **one** debuff a round and spends the rest of the line on damage |
| `DEBUFF_FIRST` | takes **every** debuff it can afford that would actually land, then fills what is left |

With one brain for everybody, The Damp — an enemy built entirely around status — spent 62% of
its slots on the feeblest attack in the game and landed a status a quarter of the time.
Measured over 200 line builds:

| | status-carrying picks |
|---|---|
| `GREEDY_MAX_DAMAGE` | 25.9% |
| `DEBUFF_FIRST` | **86.4%** |

It cannot loop for ever — each debuff costs charge and a slot, and affordability is re-tested
every time round — and it will not repeat a status the target already has, so against a fully
saturated player it drops straight back to chipping (17.3%) rather than wasting the line. An
attack that also *hangs* something scores x4 for this profile, because its damage is all the
scoring can see and for a 10-power chip that is nearly nothing.

## Music: streamed or decoded

`decodeAudioData` holds a whole track as Float32 PCM, which is a far bigger number than the
file size suggests — 44100 x 2 channels x 4 bytes is **337 KB per second**:

| | | decoded |
|---|---|---|
| `theme-opening.wav` | 14.8s | 5.0 MB |
| `theme-loop.wav` | 73.7s | 24.8 MB |
| `line-manager.m4a` | 204.4s | 68.8 MB |
| `line-manager-phase2.m4a` | 106.7s | 35.9 MB |
| | | **134.4 MB** |

Decoding buys exactly one thing: scheduling the loop at `t0 + opening.duration` on the audio
clock, sample-accurately, so the two halves of the original theme meet without a click. **A
track handed over as one file has no such join**, so `startMusic()` streams it through an
`<audio loop>` element instead and 105 MB of the table above is never allocated. Paying that
for a gapless transition which does not exist is how a phone runs out of memory in the middle
of a boss fight.

Element volume is capped at 0..1, so a streamed track cannot be lifted by `musicVolume` (1.6)
the way a decoded one is. The two streamed tracks are therefore mastered to where the decoded
theme *ends up* — busy RMS -15.5 dBFS, which is -19.6 plus that 1.6x — so the two paths match
by construction rather than by a gain applied at one end only. Re-measure if either is
replaced.

See also `?fx=` in `../MAP/README.md`: the title logo and the first-run dot field are animated
feTurbulence filters too, and are dropped at `fx=lite`.

## Every sheet in the workbook

`GDDs + Spreadsheets/battle-system-config.xlsx` is the single source of truth for content.
Four of these had never been named in any document, which is how a sheet quietly stops
existing.

| sheet | what it decides | read by |
|---|---|---|
| `emotions` | the palette, icons and backdrop tints. The spine both apps share | both |
| `abilities` | every ability. `kind` picks the behaviour from `Kinds` | battle |
| `loadouts` | Move Sets — 1 to 4 abilities, an `ec_mod` and one passive | both |
| `matchups` | attack emotion × layer emotion. **Adding a synergy is adding a row** | battle |
| `units` | every combatant. Also `tier`, `spawn_lines`, `drops`, `ai_profile`, `role`, `scale` | both |
| `dialogue` | who an enemy is today. Four states, or it falls silent | battle |
| `status_effects` | one row per status; its columns are what it *does* | battle |
| `rules` | 179 global tunables, read by name | both |
| `sounds` | every effect, synthesised at runtime — there are no sfx files | both |
| `prompts` | the cue above the attack line, drawn at random each turn | battle |
| `moments` | the title screen's mood line — *"Barcelona, Sunday, …"* | battle |
| `stations` | one row per **place**, not per stop | map |
| `metro_lines` | one row per line, `stations` in running order | map |
| `travel_elements` | what appears around the train on a ride | map |
| `objectives` | what can be earned, where, and the **?** that marks it | map |
| `armor` | Emotional Armor: `ms_mod` and `layer1`..`layer4` | map |
| `items` | placeholders, so the roll-and-lose machinery has something to roll | map |
| `world_bands` | day / hour / weather → multipliers on a station's attributes | map |
| `city_status` | conditions happening to Barcelona, and where they land | map |
| `layer_types` | **reserved.** Layers are plain emotions today | — |
| `synergies` | **reserved.** Line-level combos | — |
| `README` / `checks` | the workbook's own notes, and live validation formulas | — |

`layer_types` and `synergies` are deliberately empty: they hold a shape for a design that is
not written yet. Everything else is live.

## Where to look

| You want | Read |
|---|---|
| How this is built and why | `ARCHITECTURE.md` |
| What changed, pass by pass | `CHANGELOG.md` |
| The combat design | `../GDDs + Spreadsheets/AVUI_COMBAT_GDD.md` |
| The seam with the map | `../GDDs + Spreadsheets/AVUI_COMBAT_GDD.md` §13 |
