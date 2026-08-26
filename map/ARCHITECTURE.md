# MAP — architecture

This file exists so the map is built to the conventions that were learned the hard way in
the battle prototype, rather than rediscovering them.

**What is built:** the network view (Barcelona L1–L6) and the navigation loop on top of
it — routing, multi-leg runs, the Traveler's Dilemma, world state, and the vault.
**What is not:** the battle system, deliberately; encounters open a debug screen. See
`README.md` for the loop.

## How the picture is made

Everything is **rasterised by hand** into a low-resolution `ImageData` and upscaled by an
integer factor with `image-rendering:pixelated` — the same technique as battle's rings and
gauges. Canvas strokes are not used anywhere: `imageSmoothingEnabled` governs image
*scaling* only, so a stroked line antialiases into grey half-pixels regardless, and
upscaling those gives soft-edged blocks instead of pixel art. `fillText` has the same
problem, which is why `src/font.js` is a hand-drawn 3×5 font.

The map is **redrawn at every zoom, never scaled as a picture**: geometry is transformed
into buffer space and rasterised there. That is what lets zoom be continuous without
breaking the medium.

Two derived-not-authored rules keep 110 stations maintainable:

- **`squareLink()` squares every link to 0°, 45° or 90°.** A diagram that draws at other
  angles reads as a mistake, but demanding exact angles of hand-placed coordinates is not
  something anyone could maintain. The sheet only has to be roughly right.
- **Names place themselves**, on the side of the dot with the most empty track, and any
  name that would land on something already drawn is dropped. There is no zoom at which
  110 names fit; the alternative to dropping them is illegible mush.

### Two clocks, deliberately

The single-clock rule below is about **animation cadence**. Camera moves — panning, and
the eased zoom — are exempt: they are direct manipulation, and quantising the map's
position under the finger to 83 ms reads as broken rather than as stylised. Everything
that animates *by itself* runs off `frame` at 12 fps, and new animation belongs there.

### A wipe is a clip, not a second canvas

Because the map and the travel screen are rasterised by the same code into the same
buffer, revealing one through the other only needs every write to ask whether it falls
inside a circle — `clipC` in `mapview.js`. That is the entire mechanism.

The trap: **anything clearing the screen must go through `fillScene()`**. `buf.fill()`
writes the typed array directly and so never consults the clip, which meant the incoming
screen erased the outgoing one rather than being revealed through it — the wipe showed a
hole onto a void. Three separate clears had that bug at once.

### Sequences count frames, not milliseconds

The whole ride (`journey.js`) is a phase table with lengths in 12 fps clock frames. That
keeps it in step with everything animating inside it, and makes it deterministic to drive
from a test — you can step the clock by hand and assert on each phase.

While a sequence is running, **map input is refused**. A wipe is anchored to a screen
position; letting the player pan underneath one tears it apart.

### State the fact, do not fire the events

What music should be playing is a property of the phase (`musicForPhase()`), and every
button's sound is a property of the button (`uiSoundFor()`). Both are single tables
consulted from one place. The alternative — a `musicStart()` here, a `sfx()` there — is how
a transition ends up silent because one of five call sites was missed, or doubled because
two of them fired.

`Music.set()` is idempotent and checks whether the track it believes is playing is
*actually* sounding; a track left paused by a fade that was immediately re-requested would
otherwise satisfy `cur === want` while the game sat in dead air.

### Serve the container type, not the codec

Python's table calls a `.m4a` `audio/mp4a-latm` — the raw stream type, not the container —
and some browsers refuse to decode audio under it. `serve.py` overrides it. GitHub Pages
gets this right on its own, so without the override music would work deployed and fail
while being built, which is the worst way round.

### The things you tap move on the display's clock

Everything in this game steps at 12 fps — and the elements' own animation still does: a
prism turns, a segment beats, a countdown ring closes, all on `frame`. But their POSITION
integrates in `stepElementsSmooth(dt)`, called every rAF frame.

That is a gameplay decision. These are small objects crossing the screen at speed, hit with
a thumb; at 12 fps a segment jumps eight pixels between frames, so the thing under the
finger when you press is not the thing that was there when you decided to. The track and the
parallax behind them stay stepped, so the medium is intact.

Two consequences worth keeping:

- **Hit boxes are much bigger than the art.** A fingertip covers far more than nine pixels
  and hides what it is aiming at. The reach is the element's own size scaled up, with
  `travelTapR` as a floor.
- **A collectable leaves by the bottom edge, never by expiring.** Its lifetime is a safety
  net for something that stops moving, not a timer. One that dissolves mid-screen is one the
  player was still reaching for. Enemies do expire — floating away is what they are for.

### A phase change must follow the thing it describes

`encounterOnTrack` set `J.phase = "ENCOUNTER"` before calling `Encounter.start()`. Two
enemies can trigger in the same frame — a Hunter's countdown expiring while a passive one is
tapped — and `start()` refuses the second because one is already open. The phase had already
moved, so the refused call left the game in ENCOUNTER with nothing to resume it, and the
first one's callback restored a "previous phase" that was itself ENCOUNTER. **The ride
simply stopped.** Change the phase only once the thing it names has actually happened.

### Spawned things are plain objects in one array

No element owns a timer, a listener or a DOM node. It is a record in `Trip.live`, aged by
frame count and spliced out when it expires — because anything else leaks one per spawn,
and a ride produces dozens. `resetTrip()` emptying the arrays *is* the destruction; there
is nothing else holding a reference.

Rates are resolved as a **product** — sheet base × target station × temporary modifiers —
so weather and time of day can be added later by pushing into `TravelMods` without
touching the spawner.

### The interface is the battle system's, rebuilt not re-imported

The menu wears battle's shapes — `.pxr` cut corners, `--bevel`, hard offset shadows, the
mint stamina tag and the rainbow charge tag, the station ring an ability sits in. All of it
is **re-declared** in `styles/map.css` and `src/glyphs.js`, because the two apps are
siblings and must not reach into each other's source. What they genuinely share is the
DATA: `abilities.icon` names a key both apps hold, so a new icon is added in both and the
sheet keeps pointing at the same name.

**The ramp scrolls on the game clock**, not on a CSS animation — `rampStep()` in
`mapview.js` writes `--rampPos` at 12 fps. A smoothly sliding gradient beside stepped art
is instantly the wrong medium.

**The map keeps rendering behind the menu.** It is a live canvas, so rather than covering it
the menu pushes it back with `backdrop-filter` — blurred and dimmed, present but plainly out
of reach.

**Tabs live at the bottom.** `.mbody` comes first in the DOM and `.mhead` is `order:2`, so
reading order stays sensible while the reachable edge belongs to the thumb. The MENU button
sits on that same edge, so it hides whenever the menu is open.

### A save must be something the player can hold

There is no server, and browser storage is not storage: iOS deletes it after about a week
idle. So the durable save is a **file the player downloads**, with a pasteable code as a
convenience and `localStorage` as the working copy. `Player.toJSON()` / `fromJSON()` are the
only serialiser and reader; autosave, code and file are the same bytes, so none can drift.

Exports carry an **envelope** (game id, kind, version) so a foreign JSON is refused instead
of half-loading, and codes carry a checksum because chat apps truncate long strings — without
it a clipped paste decodes to plausible JSON and silently installs half a profile.

**Never seed an identity.** `seedProfile()` fills the starting kit only. Seeding a name and
affinities is what stops `needsCreation()` from ever being true, and then nobody is ever
asked who they are — which is exactly how creation failed to appear the first time.

### One global scope means one declaration

Every file shares a scope, so two files declaring `const num` is not shadowing — it is a
SyntaxError that kills whichever loads second, and the symptom is a feature that looks
like it was never wired up. Shared helpers go in `src/util.js`; nothing else may declare
them.

### The workbook is the source, not the CSVs

`export_csv.py` regenerates every CSV **from the workbook**. Adding a row to a CSV by hand
therefore survives exactly until the next export — a whole session's worth of tunables was
lost that way before it was noticed. New rows go in `build_workbook.py`'s seed.

`_seed()` reads a sheet back out of its own exported CSV, so it has to skip the banner rows
`sheet()` writes. It did not, and on the second round-trip took the notes banner as the
header, collapsing six tables to one column each. It now finds the header the way
`build_data.clean()` does, and refuses to rebuild from a CSV whose header looks wrong.
**The round-trip must be idempotent — run it twice and diff.**

### Stats are derived, never stored

The progression GDD gives the player no levels: MaxMS, the Emotional Layers and the ability
pool are arithmetic over the equipped armor and sets (`deriveStats()`, `src/gear.js`).
`Player.maxMs` is a getter over that, so there is no second copy to go stale when armor
changes. The §13 descriptor is filled from the same function.

### Resolved values are products, everywhere

Spawn chance, a station's fog, how far apart two stations are — none of these is a
constant. Each is `own base × every modifier that applies`, and the modifiers multiply
rather than one winning. That is what lets a stormy Saturday night be worse than either
a storm or a Saturday night, and it is why `world_bands` has a `BASE` row: the floor is
data, not a magic 1 in code.

The same shape appears in `chanceOf()` (elements), `stationAttrs()` (world) and
`segmentsFor()` (distance). Adding weather from a real API, or a temporary curse, means
pushing another factor into the product — never editing the consumers.

### An ending must be a no-op when nothing is running

`Run.exitHere/winBoss/defeat` all bail if `active` is false. Without that, an ending fired
at the wrong moment banks a phantom vault against whatever `from` and `dest` were left
over from the previous trip, and teleports the player somewhere they never departed from.
Found by a test that started a run while the previous wipe was still playing.

### The in-flight vault is part of the save

Closing the browser mid-trip is defined as a defeat (GDD 6), and a defeat keeps
`defeatKeepPct`. It cannot keep a tenth of something that was never written down, so
`Run.mark()` snapshots the vault every time it moves. Otherwise force-closing is harsher
than losing, which is the wrong incentive to build into an anti-exploit rule.

### `blendPx` clamps; it must not mask

Tints are deliberately overdriven past white (`mix(col, 1.45)`) to make a thing stand out
against a field of its own hue. That pushes a channel over 255, and masking with `& 0xff`
**wraps** it: anger's red went 332, came back 76, and Track Segments on the red line
rendered blue. Clamp every channel on the way into the buffer.

### The turbulence filter constrains line weight

The whole map swims inside the same `feTurbulence` + `feDisplacementMap` the battle title
art uses. It displaces by several screen pixels, and **a one-pixel line simply comes apart
under it** — at fit zoom the network rendered as dashes. Nothing may be drawn thinner than
two pixels while that filter is on.

## This is a game, not a page

The same distinction that settles most arguments in `../BATTLE SYSTEM/`:

- **There is one clock.** The battle system runs everything at 12 fps from a single
  `tick()`, with CSS animations stepped to land on the same frames. Anything that animates
  itself independently drifts out of step and reads as the wrong medium. Whatever the map
  needs — a train moving, a timetable advancing — hangs off one clock.
- **Simulation and presentation are separate, and simulation wins.** The ledger changes
  the instant a rule says so; what the player sees is a reaction to that, never a gate on
  it.
- **Content lives in the spreadsheet.** Stations, lines, encounters, events and every
  tunable number are rows in `../shared/config/csv/` (generated) and
`../GDDs + Spreadsheets/` (the workbook). If a designer has to open a `.js` file,
  that is a design flaw.
- **Effects are fire-and-forget.** They never block the turn loop and never own state the
  rules need.

## The seam with battle

`src/battle-bridge.js` is the entire interface, and every field in it comes from
`../GDDs + Spreadsheets/AVUI_COMBAT_GDD.md` §13 — nothing there is invented.

`src/encounter.js` is the ONLY file that references a battle. It shows a debug screen
(`BATTLE OCCURRED`, WIN / LOSS / FLED) but builds a real descriptor and returns through
the real `applyEncounterResult`, so the contract is exercised on every encounter and MS/EC
persist exactly as they will when a battle is doing the arithmetic. **The map is never
blocked on the battle system and cannot break it**; connecting them is a change to one
function in that file.

The one rule that shapes the whole layer is §13.1: **MS and EC persist between
encounters.** Overflow is derived from them, so it persists implicitly. That is why the
map needs a calm-down verb, and why it must show the player's state outside combat.

## What is shared, and what is not

| Shared, in `../shared/` | Per-app |
|---|---|
| The spreadsheet — one emotions table for the whole game | `src/`, `styles/`, `index.html` |
| The build tooling (`--app` selects the target) | The generated `data.js` |

The emotions table is the spine of both systems. It must exist exactly once. Everything
else starts separate and is only extracted into `shared/` when a change genuinely has to
be made in two places — not before, because extracting the wrong abstraction early is
worse than a little duplication.

## Conventions worth inheriting

These were each paid for with a bug in the battle prototype:

- **Animate `transform`, `opacity` and `filter`.** Never `clip-path`, never layout
  properties — and never leave an animation `fill`ing, because a filled clip-path outlives
  its animation and clips children for ever.
- **`window.innerWidth` is not the game's width.** The frame is capped; on desktop the
  window is several times that. Size from the frame, and clamp.
- **A width of zero silently becomes a tall stack of text.** Anything rasterising wrapped
  text must survive a hidden tab reporting nothing, and redraw on resize.
- **A centred column that overflows loses its top, silently.** Designate one element to
  give way.
- **`font-weight` alone does not make text bold on mobile** — most mobile monospace
  fallbacks ship no bold face. `-webkit-text-stroke` is what actually thickens glyphs.
- **A tag about a subject belongs on that subject**, not centre-screen, or two events read
  as one firing twice.
- **Serve with `../shared/tools/serve.py`, never `python3 -m http.server`** — it stamps
  asset URLs with their mtime, and without that the browser runs cached copies of files
  you just edited.

Full reasoning for each is in `../BATTLE SYSTEM/ARCHITECTURE.md`.
