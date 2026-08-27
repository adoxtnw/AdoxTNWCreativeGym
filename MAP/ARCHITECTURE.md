# MAP — architecture

This file exists so the map is built to the conventions that were learned the hard way in
the battle prototype, rather than rediscovering them.

**What is built:** the network view (Barcelona L1–L6) and the navigation loop on top of
it — routing, multi-leg runs, the Traveler's Dilemma, world state, and the vault.
**What is not:** nothing structural — the battle system is connected and an encounter
mounts the real fight. See `README.md` for the loop.

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

### A case-insensitive filesystem hides a case-sensitive deploy

macOS compares filenames without case; Linux does not, and GitHub Pages is Linux. So a
wrong-case URL is served happily on the machine it was written on and 404s the moment it is
uploaded — which is exactly how a lowercase `map/` gets into a link and survives long enough
that nobody remembers writing it.

The dev server now refuses a path whose case does not match the real file and names the
correct spelling. It is the only place that asymmetry can be caught cheaply: the alternative
is finding out from a deployed 404, with no clue which of a hundred references is wrong.

The same reasoning gave each app ONE constant naming the other's folder. Three hardcoded
copies of a name is three places for a rename to be half-applied.

### file:// is not a lesser http, it is a different origin model

Every `file://` document has an **opaque** origin. Two things follow that no amount of code
works around: a Permissions Policy feature cannot be delegated to an opaque origin, so
`allow="autoplay"` is ignored; and user activation propagates only to *same-origin*
descendants, so a tap in the parent never reaches the frame.

This prototype is deliberately built to open off the disk, and almost all of it does —
which makes the exceptions worth naming rather than rediscovering. `postMessage` crosses an
opaque boundary fine, and that is why the bridge speaks over it. Audio autoplay does not
cross, and cannot be made to.

### Autoplay is a permission, and a frame is not given it

A frame does not inherit the parent's right to make noise. Under `file://` it is a different
origin outright, and even same-origin it has no user activation of its own — the tap that
started the fight happened in the *parent's* document. So the battle's AudioContext could
not leave `suspended`, and its theme sat silent behind an intro written to play over it.

`allow="autoplay"` on the iframe delegates the permission the parent already earned. That is
the fix; starting the music on the first press inside the frame was a workaround for not
having asked.

There is a second trap underneath it: `startMusic()` sets `musicOn = true` whether or not
the `resume()` was allowed, so a refusal was **permanent** — every later attempt early-
returned on a flag that said the music was already playing. `audioAwake()` resumes the
context instead of restarting the music, which works because a suspended context's clock is
stopped: sources already scheduled begin from their first note when it wakes.

### A lookup table tested in order can hold two contradictory answers

`musicForPhase()` reads as a list of rules, but it is a sequence of early
returns — so the FIRST match wins and anything later is unreachable for that
phase. `ENCOUNTER` was in the "play the ride's theme" branch from when an
encounter was a debug panel over a paused ride. Adding it to the silence branch
below did not change anything: the table now said two opposite things about the
same phase and the earlier one quietly won.

Adding a case to an ordered table is not enough — the existing cases have to be
checked for one that already claims it.

### A blacklist forgets; a whitelist refuses

The battle system blacks out every child of `#screen` before the intro, as
`:not(.intro):not(.flash):not(.stage)…`. A new screen added to that container is therefore
hidden by default — built, inserted, measured correctly, animated, and invisible. Nothing
warns, because being at `opacity:0` is what the rule is for.

That is the right way round: a whitelist fails safe (a stray element stays dark) where a
blacklist would fail open (a stray element flashes over the intro). The cost is that
anything genuinely meant to be seen early has to be named, and the only symptom of
forgetting is a screen that does not appear.

### SCHEMA.list is keyed by column NAME, not by sheet

`day` was made a list column so the map's `world_bands` could hold `MON|TUE|WED`. That
retyped **every** `day` column in **every** sheet, in both apps — including the battle
system's `moments`, whose matcher compared it as a string:

```js
m.day === "*" || m.day === now.day        // an array is never equal to either
```

Nothing threw. The comparison simply stopped matching, every hour fell through to the bare
"Barcelona, Thursday.", and twenty-eight written lines quietly stopped appearing. The
failure was in one app, caused by a change made for the other, in a file neither of them
owns.

Two rules follow. Adding a name to `SCHEMA.list` is a change to **both apps** and needs a
grep for that column across both. And any code reading a spreadsheet cell should tolerate
either shape — the map does this with `listOf()`, and `momentDayOK()` is the same idea on
the battle side.

### A sheet can ask for art that does not exist

`emotions.icon` names `BURST` for Surprise, and neither app's `ICONS` table had it — so
`iconSVG` fell back to `BOLT` and Surprise wore Anger's symbol everywhere a glyph was drawn
from the sheet, including the profile card's key stamps. The fallback is right (an unknown
key must not throw) but it is also silent, so the mismatch survived until something drew all
six side by side.

### Deleting by anchors deletes what moved in between

Removing the debug encounter's CSS meant cutting "from the DEBUG marker to the MENU header".
The whole metro-card section had been *inserted* between those two anchors weeks later, so
the cut took it with it. Nothing threw and nothing logged — the PROFILE tab simply rendered
as unstyled markup, a giant silhouette above a list of words.

Two anchors bound a region whose contents had changed since the anchors were chosen. When a
range delete is unavoidable, name what is expected inside it and check the count afterwards;
a `grep -c` for the classes that should survive would have caught this before the screenshot
did.

### A stand-in outlives its purpose and starts lying

The debug encounter panel keyed off `Encounter.open`, which is true for a real
fight as well as a fake one, so it drew itself over actual battles. It had also
become a second definition of what an encounter result is, with its own
`choose()` applying its own numbers. Deleted rather than gated: once the real
path exists, a stand-in that shares its state is a bug waiting for the next
person to trust it.

### A throw in a Promise executor is a rejection, not a skipped frame

The battle curtain runs `draw()` once synchronously before its executor returns. A zero-size
rect made `createImageData` throw there — and because the throw happened *inside the
executor*, it rejected the promise. `launch()` caught the rejection, concluded the fight had
not happened, and handed back a blank result. **One bad rectangle silently skipped the entire
battle**, and the ride resumed as though the player had declined it.

Two lessons, both applied: anything that draws must survive a zero rect (`resize()` has
guarded this since the map was built), and a `catch` that substitutes a plausible fallback
has to *say so* — a failure that looks like a feature is worse than a crash.

### The spreadsheet is prose, so the generator must escape it

`data.js` embeds each CSV in a template literal. A notes column is written by a person, and a
person writing about a `column` reaches for a backtick — which closes the literal and takes
the whole file down with a syntax error a long way from its cause. `${` does the same, more
quietly, by interpolating.

`build_data.py` escapes both now. A data pipeline that can be broken by punctuation in a
comment is a trap, not a constraint on how comments may be written.

### An invisible element with no pointer-events fails silently

`.hud` is `pointer-events:none` so the map underneath stays reachable, and every panel in it
has to opt back in. The tooltip's dismissal veil never did — so it never received the press
that was meant to close the bubble, and tips stayed up for ever. Nothing threw, and the veil
is invisible by design, so there was nothing to look at either.

Anything added to the HUD needs `pointer-events:auto` the moment it is expected to be
pressed, and an element whose whole job is to catch presses is the easiest one to forget.

### A listener on an ancestor is not blocked by pointer-events

The map's gestures are bound to `#screen`, which is an **ancestor** of every panel. An event
that lands on an open menu still bubbles down to those listeners, and `pointer-events:auto`
on the panel does nothing about it. `pointerdown` had a `Menu.open` guard; `wheel` and
`dblclick` never got one, so the map could still be zoomed by scrolling or double-tapping
over an open menu.

Three copies of the same list are what let them drift apart, so there is now one predicate —
`blocked()` — and anything added to `bindInput` has to use it.

### Two rules, equal specificity: the later one wins

Three separate regressions in one pass, all the same shape. `.bigbtn{position:relative}`
sat after `.endbtn{position:absolute}` and threw END out of its corner into the top of the
frame. `.framed{position:relative}` sat after `.peek,.dilemma{position:absolute}` and
unpinned the platform decision the same way. Nothing threw; the buttons simply appeared
somewhere else.

The fix differs by case, and the difference is the point:

- `.bigbtn` never needed `position` — it has no pseudo-elements to contain, so the
  declaration was removed outright.
- `.framed` genuinely needs it for its two stroke layers, so **the block moved above** the
  panels that use it. A utility that carries `position` has to be written before anything
  that positions itself.

### A clip-path clips the children too

`.pxr` cuts an element's corners — and everything inside it, pseudo-elements included. Two
things fell out of that:

- The menu button could not be both corner-cut and ringed, because the ring hung off
  `::after` and got sliced. Pixel-art strokes are just rectangles, so the button is three
  stacked rectangles — ramp, black, face — each cut with its own slightly smaller radii so
  the corner steps nest. What shows between the layers *is* the stroke.
- The travel popup's close button deliberately overhangs the panel's top edge, so cutting
  the panel sliced the button in half. The corners moved onto `::before` and `::after` — the
  only two things that need the shape — and the panel itself no longer clips anything.

The same reasoning explains why `.bigbtn` uses an **inset** box-shadow for its stroke and a
`filter: drop-shadow` for its drop: an ordinary border is drawn outside the clip and gets
sliced at every step, and a box-shadow drop is cast from the unclipped box.

### A class name is a global

`.cbox` was the character-creation card. Adding a second `.cbox` for the city chips gave
every chip `width:100%`, so the bar stacked into five full-width bands — and nothing threw,
nothing logged, the CSS just quietly meant something else. In a stylesheet with no scoping,
a new class name has to be grepped for before it is used. The chips are `.citybox` now.

### Ask the clock, do not be told

Nothing pushes the hour, the weather or a status change at the HUD. The city bar asks what
time it is, builds a key out of the answer, and rebuilds its markup **only when that key
changed** — so it can be called from every HUD sync and from the game clock five times a
minute without restarting a single animation. The alternative, an event fired when the hour
rolls over, needs something to own a timer, and would still be wrong the first time a phone
came back from sleep.

### The buffer is bigger than the frame

`W` and `H` still mean the size of the VISIBLE frame, and everything that lays anything out
— the trip bar, the train, a label deciding whether it fits — still measures against them.
What changed is that the buffer carries a margin of `MX` by `MY` around that frame, and the
canvas element is drawn that much larger and centred, so the margin hangs off all four sides
and `.screen`'s `overflow:hidden` clips it away.

It exists for the lean. A rectangle turned by 20 degrees no longer covers the frame, and the
corners swinging inward were showing the void past the edge of the map. Scaling the canvas
up to cover would also have worked — and would have zoomed the art by nearly three quarters
on a tall frame. Rendering MORE MAP instead costs a few thousand pixels and leaves both the
framing and the pixel scale exactly as they were.

The margin is free because the projection puts world `cam.x, cam.y` at the buffer's centre:
a symmetric margin moves nothing, it only reveals more. What it does cost is vigilance —
every cull written as `x > W + k` has to become `x > W + MX + k`, or the margin fills with
nothing and the void comes back in a new shape. `local()` has to subtract it too, since the
canvas's top-left is now outside the frame.

### One eased number carries a whole pose

The lean multiplies EVERYTHING it does — angle, extra zoom, drift — by a single `k` that
eases from 0 to 1 and back. So the tilt arrives and leaves instead of appearing, the sway is
already at its right phase when it gets there, and there is one number to reason about
rather than three animations to keep in step. `leanOff()` only clears a flag; the transform
is dropped at the far end, once `k` reaches zero and there is genuinely nothing to draw.

It runs on the display's clock, not the 12 fps game clock: it is a camera move, and a camera
move that steps twelve times a second is a stutter, not a medium.

### A failure that is silence, not an error

`createMediaElementSource` applies a CORS check to whatever it is given, and when the check
fails the node does not throw — it outputs silence. Under `file://` it can never pass. The
music therefore stays out of the graph entirely and fades through `<audio>.volume`; the
synthesised effects, which have no origin to check, keep the crusher and the delay.

The general shape: prefer the plainer mechanism when the fancier one can fail *quietly*.

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

### What an enemy IS is decided at spawn, not at tap

An element row says an enemy may appear. It does not say who: that comes from the units
sheet, off each enemy's `spawn_lines`, rolled the moment the element is created.

**It has to be decided that early, because it has to be visible that early.** Tapping an
enemy commits you to a fight you cannot leave, so what you are taking on has to be
readable while it is still drifting past — from its silhouette (the same triangle, circle
or star it will wear in the fight), its size, and its colour.

**Its colour is its own emotion, not the line's.** Everything else on a ride is painted in
the line's emotion, which is what makes a line feel like a place. An enemy is the one
thing that is not *of* the place, and that is the only reason it is allowed to break the
palette.

The chosen unit then travels with the encounter — `{id, station, unit}` — through **both**
paths that can start a fight: a tap on a passive one, and a Hunter's countdown running
out. Miss either and the fight looks the unit up off the element row instead, and every
ride is the same opponent. `travel_elements.unit` is still there as a hard override for
pinning one element to one enemy; blank means roll.

### `*` in `spawn_lines` is a fallback, not decoration

Three of the six lines have no units of their own. Without a wildcard entry they would
produce no enemies at all — the roll would come up empty and the ride would be silent.
The Commuter carries `L1:1.0|*:0.6`, so it rides every line. A named line **beats** the
wildcard rather than adding to it, or being at home would mean 1.6.

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

`src/encounter.js` is the ONLY file that references a battle. It builds a real descriptor,
mounts the real fight, and returns through the real `applyEncounterResult`, so MS and EC
persist exactly as §13 says they do. It also carries **which enemy** — the unit the element
chose when it spawned — and both paths that can start a fight have to pass it: a tap on a
passive enemy, and a Hunter's countdown running out. Miss either and the fight looks the
unit up off the element row instead, and every ride is the same opponent.

The debug screen that used to stand in for the fight (`BATTLE OCCURRED`, WIN / LOSS / FLED)
is gone: with a real fight to hand off to it was a second and drifting definition of what a
result is.

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
