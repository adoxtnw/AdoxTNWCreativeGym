# MAP — everything outside a battle

The day, the network, the encounters, and what carries between them.

**The navigation loop from `../GDDs + Spreadsheets/AVUI_NAVIGATION_GDD.md` is in.** Pick a destination, ride
leg by leg through emotional space, and at every platform decide whether to bank what you
are carrying or push the wager further.

**The battle system is connected.** An encounter mounts the real fight in a frame, hands it
a real §13 descriptor and takes the result back through the real `applyEncounterResult`.
The debug screen that used to read `BATTLE OCCURRED` with WIN / LOSS / FLED is gone: with a
real fight to hand off to, it was a second and drifting definition of what a result is.

**Which enemy you meet depends on which line you are riding.** Six enemies, three tiers,
each a row in the `units` sheet — see *Enemies on the ride* below.

## The run

```
tap a station → panel → TRAVEL HERE → route (Line Keys checked)
  leg: ZOOM → WIPE_IN → RIDING → ANNOUNCE → FLASH → BANNER
       └ segments needed = segBase × diltransience(target) × world state
       └ an aggro enemy locks on → encounter → back to the ride, MS/EC persisted
  intermediate platform → THE DILEMMA
       ├ EXIT     keep 60% of crystals, roll each item, dock here, run ends
       └ CONTINUE keep 100%, heal nothing, next leg
  destination → Station Boss → encounter
       ├ WIN  bank 100%, MS fully restored, dock here
       └ LOSS keep 10%, roll each item, thrown back to where you departed
```

Closing the browser mid-trip resolves as a defeat on next load, with the same 10% any
other defeat keeps — the in-flight vault is part of the save for exactly that reason.

| Concept | Where |
|---|---|
| Hour, day, weather → a station's live attributes | `src/world.js` |
| Docked station, MS/EC, crystals, items, Line Keys, the save | `src/player.js` |
| Paths across the network, gated by Line Keys | `src/route.js` |
| The multi-leg trip and the vault it is wagering | `src/run.js` |
| Station inspection, and choosing a destination | `src/peek.js` |
| Handing a fight to the battle system | `src/encounter.js`, `src/handoff.js` |
| Stats strip, route header, dilemma, encounter markup | `src/hud.js` |

**Crystals** are the currency, one per emotion, taken from the line you were riding.
**Items** are separate: they are rolled from the `items` sheet (placeholders) and lost by a
roll each rather than by a percentage.

**Line Keys** gate changing line at a junction. The player starts with L1 and L2 —
46 of 110 stations — and `Player.grantKey("L3")` opens the rest. The real source is
beating a Line Manager, which does not exist yet.

**World state** is a product: a station's own base × every matching row in `world_bands`.
Bands stack rather than one winning, so a stormy Saturday night is worse than either alone
(fog ×1.68 night × ×2.42 storm = ×4.36). Weather is derived from the date so every client
agrees without a server; `WorldState.weather()` is the seam a real API replaces.

---

## Enemies on the ride

An element row in `travel_elements` says an enemy *may* appear. **It does not say who** —
that comes from the `units` sheet, off each enemy's own `spawn_lines`, and it is rolled the
moment the element spawns rather than when it is tapped.

It has to be that early because it has to be *visible* that early. Tapping an enemy commits
you to a fight you cannot leave, so what you are taking on is readable while it is still
drifting past:

| | |
|---|---|
| **Its colour** | its own emotion, **not the line's**. Everything else on a ride is painted in the line's colour, which is what makes a line feel like a place; an enemy is the one thing that is not *of* the place |
| **Its shape** | the same silhouette it will wear in the fight — a triangle if it is weak, the round body if ordinary, a seven-pointed star if strong |
| **Its size** | roughly 10 / 13 / 20 pixels for weak / regular / strong |

`spawn_lines` is `line:weight`, pipe-separated. `L2:0.15|L5:0.15` is an uncommon sight on
either line. **`*` means every line, and a named line beats it rather than adding to it** —
`L1:1.0|*:0.6` is "1.0 at home, 0.6 elsewhere". The wildcard is not decoration: three lines
have no enemies of their own yet, and without it they would produce none at all.

`travel_elements.unit` still overrides the roll outright, for pinning one element to one
enemy. Blank means roll, and both enemy rows are blank.

## Saving, on a host with no server

The prototype is uploaded to GitHub Pages, which serves files and nothing else. There is
nowhere to save to — and `localStorage` is not somewhere to leave anything, because it is
per-browser, dies with "clear site data", and **on iOS is deleted after about seven days
without a visit**. A friend who plays and returns a fortnight later would find nothing.

So a save is something the player can **hold**:

| | |
|---|---|
| **The file** | a `.json` they download and can load back, on any device, forever. **This is the backup.** |
| **The code** | the same bytes as a pasteable string, for sending in a message |
| **Snapshots** | named saves parked in this browser, for trying things. They die with the browser — which is why they are not the backup |
| **Autosave** | still there, still only on the map (progression GDD §2) |

All four are the same bytes: `Player.toJSON()` is the only serialiser and
`Player.fromJSON()` the only reader. Three serialisers would drift, and the one that
drifted would be the one a friend needed.

Everything imported is **untrusted input** — a file from a phone, a code from a chat, a
JSON someone "fixed" by hand. It is parsed, never evaluated, wrapped in an envelope so a
foreign file is refused rather than half-loaded, and every field is checked against the
live tables on the way in.

**Character creation** runs on first boot (`src/create.js`) and puts the save file in front
of the player at the moment they first have something to lose. Its first screen has a way
*out* — **I HAVE A SAVE** — so someone returning to a wiped phone is never made to build a
second character to reach the first.

The Passenger Code (`NM-XXXX-XXXX`) names a save and tells two apart. It is **not a
password**, the UI says so, and nothing here asks for an email. It is also the key cloud
sync would use: `Vault.remote` is the hook, deliberately `null`.

## Deploying

Both apps are plain static folders — no build step, no bundler.

```
cd "AVUI/shared/tools"
python3 build_data.py ../config/csv --app MAP          # if the sheets changed
```

Then upload `AVUI/MAP/` beside the battle build, e.g. as
`.../AdoxTNWCreativeGym/proto-02-map/`. `data.js` is generated and must be uploaded with
it. Nothing needs a server, and everything still opens from `file://`.

## The menu

**The only non-map-anchored element on the map is the MENU button, upper left.** Zoom lives
on wheel, pinch and double-tap; your name, MS/EC and the **OVERFLOW** warning are drawn on
the canvas beside your marker, where the progression GDD puts the name and where combat
§13.1.3 needs the warning to be — visible without opening anything.

Four tabs, at the **bottom** of the screen where a thumb reaches, from
`AVUI_PROGRESSION_GDD.md`:

| | |
|---|---|
| **PROFILE** | name, Emotional Affinities, docked station, Line Keys |
| **LOADOUT** | armor, three Move Sets, and the stat block they add up to |
| **INVENTORY** | crystals (one per emotion) and items |
| **SAVE** | the file, the code, snapshots |

In **LOADOUT**, armor and Move Sets are drawn as sockets. **CHANGE** opens a picker of what
is not worn, sortable by type or name; tapping a set instead **opens its abilities**, drawn
exactly as the battle panel draws them — station ring, glyph, charge tail, shots. The two
questions ("swap this" and "what is in this?") get different targets on purpose. Armor shows
all six layer slots with the ones it grants filled, so how many you are *not* carrying is
visible too.

Stats are not a fourth tab because they are not a fourth thing: **MaxMS, the Emotional
Layers and the ability pool are arithmetic on the equipment** (`deriveStats()` in
`src/gear.js`). Nothing stores them — the player has no levels, so they *are* their kit.
Splitting them out would print the same numbers twice and invite them to disagree.

The menu only exists at `IDLE`. GDD §5 says loadouts cannot change mid-journey and §2 says
the game saves only on the map; both hold because the button is absent everywhere else,
rather than by a check inside each action.

**Move Sets are the `loadouts` sheet** under the name the progression GDD uses — one row,
two names, so nothing in the battle system had to move. Armor governs MaxMS and layers;
the player still carries three sets, per combat §13.4.

**Passives and affinity bonuses ship inert.** `ArmorFx`, `SetFx` and `AffinityFx` in
`src/gear.js` name them and print "pending design", because both GDDs say the values are
untested. Same registry shape as `StationFx` and `ElementFx`.

### Not built yet

Character creation and the progression save proper are deliberately out. The schema is
already v2 with `name`, `affinities`, `armor` and `sets`, and `load()` migrates a v1 save
forward — so the creation screen fills fields that exist rather than forcing a migration.
`Player.needsCreation()` is the hook it will test. Until then `Player.reset()` seeds a
default profile from the rules sheet.

The **Wandering Store Network** (§4) is not built. `cost` and `trade_in` columns are on
`armor`, `loadouts` and `items` so the data is ready for it.

## The surface it is played on

A pan-and-zoom view of a pixel-art metro network: **Barcelona L1–L6, 110 stations, 17 of
them interchanges**.

Each line carries an emotion, and the line's colour comes from it, so the map cannot
drift out of step with the battle palette:

| | L1 | L2 | L3 | L4 | L5 | L6 |
|---|---|---|---|---|---|---|
| | Anger | Surprise | Disgust | Joy | Sadness | Fear |

## What the view does

Drag to pan, wheel or pinch to zoom, double-click or the +/− buttons to step in and out.
Zoom is clamped between **fit** (the whole network, with a 22px margin) and **×3**, and
panning stops at the edge of the network — you cannot lose the map. Detail arrives as
you zoom: minor stops appear, then their names.

`?states=demo` scatters the reference station states so the machinery can be seen.

| File | What it is |
|---|---|
| `src/net.js` | Everything **derived** from the two sheets: routing, interchanges, label sides. The network itself is not here |
| `src/states.js` | The station-state registry — the seam the real states will plug into |
| `src/font.js` | A 3×5 bitmap font, because `fillText` antialiases and would upscale to mush |
| `src/mapview.js` | Camera, hand-written rasteriser, pan/zoom input |

Four things are worth knowing before editing:

- **The map is redrawn at every zoom, never scaled as a picture.** Geometry is
  transformed into buffer space and rasterised there, so nothing ever goes soft.
- **Links are squared off in code, not in the sheet.** A transit diagram only draws at
  0°, 45° or 90°; demanding that of 110 hand-placed stations is unmaintainable, so
  `squareLink()` does it. Station coordinates only have to be roughly right.
- **Names place themselves.** Each picks the side of its dot with the most empty space,
  and any name that would land on something already drawn is dropped — which is what
  makes zooming reveal the map rather than magnify a fixed picture.
- **Two clocks, on purpose.** Camera moves are immediate — they are direct manipulation
  and must sit under the finger. Anything that animates *by itself* runs off `frame` at
  12 fps, like the rest of the game. New animation belongs on `frame`.

## One leg of a ride

You start at **Clot**. A leg is one station to the next; the run above strings them
together. A ride is a cutscene with one button in it, so map input is refused for its
duration — except for tapping the things flying past.

| Phase | Frames @12fps | What happens |
|---|---|---|
| `ZOOM` | 8 | the camera drops onto the station you are leaving |
| `WIPE_IN` | 9 | a circle opens out of it onto the travel screen |
| `RIDING` | — | pulls away, settles at line speed, until the bar fills (or **END**, debug) |
| `ANNOUNCE` | 17 | *Propera parada… [STATION]* across the top |
| `FLASH` | 11 | white floods down from the top edge as the train leaves the frame |
| `BANNER` | 30 | the arrival card: colour-coded band, station name |
| `DILEMMA` | — | intermediate platform: bank or push on |
| `BOSSWAIT` | — | the destination: the Station Boss |
| `ENCOUNTER` | — | a fight on the track; the ride is paused, not torn down |
| `WIPE_OUT` | 10 | a circle opens back onto the map |
| `ARRIVE` | 13 | the marker slides to the new station, camera following |

Everything above is counted in **clock frames, not milliseconds** — the whole sequence
runs on the same 12 fps clock as the things animating inside it, which is also what makes
it deterministic to test.

**The two screens are one buffer.** The map and the travel scene are rasterised by the
same code into the same pixels, so a wipe between them is not a composite of two
canvases — it is a clip (`clipC`). Note that anything clearing the screen has to go
through `fillScene()`, not `buf.fill()`: the latter writes the typed array directly and
sails straight past the clip.

### The travel screen

### Leaving is the slowest thing in the game

The departure runs for three seconds (`departSecs`) before the wipe, and all of it moves at
once:

- the camera **falls into the station you are standing on**, on an accelerating curve — it
  is still speeding up when the wipe takes over, so the two read as one movement rather
  than a move that settles and then a second effect;
- the whole frame **drains to the departure line's colour**, so by the time the wipe opens
  there is nothing outside it worth looking at. That is what stops the wipe reading as a
  panel swap;
- the map's music **fades out while the ride's fades in**, across the whole three seconds.

That last one is the single exception to the rule that music changes are cuts. Everywhere
else an abrupt start is what makes a change of place feel deliberate; departure is the one
moment that is meant to feel long, and it is the only transition the player chose.


Neuro-Metro runs through emotional space, not tunnels, so behind the train are three
parallax depths of the line's own emotion — a circular gradient wider than the screen
(slowest), a repeating motif belonging to the emotion (Anger is fire), and dust nearest
the camera (fastest). Motifs live in the `EmotionField` registry, one per emotion, same
shape as `StationFx`.

The train is a **placeholder rectangle** — a fixed 34px wide, roughly a quarter of the
buffer, with its lead car's nose at half the screen height. Swap `drawTrain()` when the
SVG arrives; nothing else needs to change.

### What rides with you

Things appear around the train during a ride. **Every knob is a row in
`travel_elements`** — probability, how many may exist at once, how many one ride may ever
produce, how long each lasts, size, and how fast it drifts relative to the track:

**Three things exist, and nothing else**: Track Segments, Crystals, and enemies.

| | kind | share of a roll | on screen | per trip | life |
|---|---|---|---|---|---|
| **Track Segment** | `SEGMENT` | 55% | 5 | **unlimited** | rides to the edge |
| **Emotional Entity** | `ENEMY_PASSIVE` | 14% | 2 | 4 | 5–15s |
| **Crystal Shard** | `CRYSTAL` | 10% | 2 | unlimited | rides to the edge |
| **Hunter** | `ENEMY_AGGRO` | 6% | 1 | 2 | 8–14s |
| *nothing at all* | — | **15%** | — | — | — |

`0` in `max_per_trip` means **unlimited** — Track Segments must never stop appearing, since
they are the thing the ride is about. Collectables leave by the bottom edge rather than by
expiring, and never fade before they get there.

**They move at the display's refresh rate while their animation stays at 12 fps.** A segment
crossing the screen at 12 fps jumps eight pixels between frames, so what is under your thumb
when you press is not what was there when you decided to press. Hit boxes are also much
bigger than the art — `travelTapR` is only the floor.

#### One roll, at most one thing, often nothing

The roll comes round every 1–3 seconds (`rollMinSecs`/`rollMaxSecs`, squeezed toward the
fast end by the target station's enemy density) and produces **at most one element**. Every
eligible kind's chance is a slice of the same single draw, so the kinds compete for one
outcome instead of each flipping its own coin — and **whatever the slices do not cover is
the chance that the roll produces nothing**. That gap is the point: a ride needs quiet
stretches, and it means the interval has to come round again before anything can appear.

**At most `travelMaxLive` (5) may be out at once, all kinds together.** When the timer comes
round on a full board the roll is not skipped and rescheduled — it is **held**, so the
instant something leaves the frame or is tapped away, the next roll happens. Skipping
instead would leave a busy stretch silent for another whole interval after it finally
cleared.

A kind that has hit its own per-kind ceiling is simply not offered a slice, which hands its
share of the draw to the empty remainder: a board thick with segments goes quieter rather
than substituting something else in.

**Every segment hangs at its own angle** and turns at its own rate, half of them each way.
They are identical squares otherwise, and a stream of identical squares all square to the
frame reads as one repeated sprite rather than as debris.

#### There are no items

`payload: ITEM` is gone and the `items` sheet is empty. Item design is not written, and a
payload of placeholders is worse than an empty pocket — it fills Baggage with things that
mean nothing and teaches the player they are worthless. The sheet and the vault's `items`
array both survive, so the machinery has a shape to fill when the design exists.

#### The Emotional Trip bar

Edge to edge, because an inset bar reads as a widget sitting on the screen and one that runs
off both sides reads as part of the vehicle.

It **chases the count rather than jumping to it**: a collected segment sets off a tween
(`tripFillMs`) on an ease that overshoots slightly and comes back, so the fill reads as
something with weight arriving rather than a value being assigned. The bar flashes white
(`tripFlashMs`) and `map_tripup` sounds as it lands — the one reward the ride has. The
*number* beside it ticks over immediately, so the true count is never hidden by the
animation, and a collected segment flies to the fill's leading edge **as drawn**, not as
counted.

**Rates are a product, not a constant:**

```
chance  =  sheet base  ×  target station  ×  temporary modifiers
```

The station is the one you are travelling **to** — its `spawn` column, `ELEMENT:multiplier`
pipe-separated (`TRACK_SEGMENT:1.6|EMOTIONAL_ENTITY:0.5`). It ships blank, meaning ×1;
those values are yours to set. Temporary modifiers are the seam for **weather and time of
day**, not built yet: `TravelMods.add(tag, mods, seconds)` is wired, expires on its own,
and multiplies into the same product.

**Track Segments** are distorted blobbing squares beating between white and the line
colour. Tap one and it flies to the **Emotional Trip** bar — which uses the same
undulating silhouette as the battle gauge, from the same `barWave*` / `ecWave*` rules.
**Filling it completes the leg**; the END button stays as a debug escape. How many are
needed is not fixed: it is `segBase × diltransience(target station) × world state`, so a
stormy night stretches the same link from four segments to nine.

Enemies come in the GDD's two flavours. **`ENEMY_PASSIVE`** floats past minding its own
business — tap it to pick the fight, ignore it and it costs nothing. **`ENEMY_AGGRO`**
locks on with a countdown ring and forces the encounter when it runs out. Both route to
the debug battle screen.

**Motion** is separate from kind: `FLYBY` enters from the top and rockets past, `PARALLEL`
is already alongside when you notice it. That is why an enemy and a crystal can share a
screen and feel nothing alike.

**Nothing owns a timer or a listener.** Every element is a plain object in one array,
drawn from it and spliced out when it expires — an element that registered its own
`setTimeout` or DOM node would leak one per spawn, and a ride produces dozens. Verified:
repeated rides end at zero live, and the caps hold.

### Sound and music

Two tracks, and **silence is the third state**:

| | | |
|---|---|---|
| **MAP** | Rise | the network, the menus, standing on a platform |
| **RIDE** | Jump to win | from the wipe opening until the flood of white |
| *(none)* | — | the arrival card: a station is quiet, only the interface makes noise |

A change is a **cut, not a dissolve**: the outgoing track fades out over 380ms while the
incoming one starts at full volume immediately. Fading the new one up would smear every
transition; waiting for the old one to finish would leave a hole where the game wants
momentum.

What plays is stated as a **fact about the phase** (`musicForPhase()`), not as start/stop
calls scattered through the journey — one place to read, one place to change.

**Nothing plays until the player touches the screen.** Browsers refuse audio before a
gesture, so the first press anywhere unlocks it and starts whatever the phase wants.

**Every button in the app gets its voice from one delegated listener** (`uiSoundFor()` in
`mapview.js`). Adding a sound to a new control is a line there, not a line in whatever wired
that control — and nothing can double up by both delegating and handling its own noise.

#### Levelling

**Every song in the game is levelled to the same measured loudness**, not to a number
someone liked. The measure is busy-half RMS — the file split into blocks, the loudest half
averaged — because a plain average makes a track with long quiet passages read soft when its
busy parts are as loud as anything else, and the busy parts are what the ear compares.

| | file | gain | played |
|---|---|---|---|
| rise (map) | −9.2 dBFS | ×0.46 | −15.9 |
| ride | −10.6 dBFS | ×0.54 | −16.0 |
| battle | −20.1 dBFS | ×1.60 | −16.0 |

A 19.3 dB spread, now 0.1 dB.

Two things were wrong at once. The battle theme is **mastered about 10 dB quieter** than the
map's two, and it was also being attenuated twice — `musicVolume` 0.30 through a `cleanBus`
of 0.7, so the sheet said 0.30 and the theme played at 0.21. Nothing but music goes through
that bus, so it is unity now and `musicVolume` means what it says.

`musicVolume` is **above 1 on purpose**: it is a gain, not a percentage. The battle file
peaks at −5.2 dBFS, so ×1.6 still lands at −1.1 and cannot clip.

The target is −16.0 rather than the −14.4 the map's tracks used to sit at, because matching
that would have needed a battle gain that clipped. Losing 1.5 dB on two tracks is inaudible;
leaving the third 19 dB down was not.

**If a track is replaced, re-measure and re-derive** — the gains are only correct for these
files. The battle's opening lands 1.5 dB under its own loop, which is how it was mastered
and is left alone.

#### The audio files

`AVUI/MUSIC/` keeps the originals; **`MAP/audio/` holds web-ready AAC, and that is what
ships.** Same split as the spreadsheet and `data.js`: a source you edit, an artefact you
upload. Rise was 25 MB as WAV — not something to send down a phone connection. Converted
with `afconvert` (macOS, no install needed):

```bash
afconvert -f m4af -d aac -b 128000 "MUSIC/Rise.wav" "MAP/audio/rise.m4a"
```

34 MB → 6.9 MB total. Re-run that if you replace a track.

#### Why the music avoids Web Audio

Feeding a media element into `createMediaElementSource` subjects it to a CORS check, and a
failed check **does not throw — the graph silently outputs nothing**. On `file://` every
origin is opaque, so that check can never pass: the music would be mute while every
synthesised effect kept working, which is a miserable thing to diagnose. The graph was only
ever holding a gain node for fading, and `<audio>.volume` does that with none of the risk.

### Sound effects, synthesised

Effects are synthesised from the shared `sounds` sheet (`map_*` and `ui_*` rows) — no audio
files. **The music does not go through that graph at all** — it is plain `<audio>` elements
with their own `volume`. Routing a recording through the bit-crusher would only cost it a
few bits and replace its top end with aliasing, and routing it through Web Audio at all
carries a nastier risk: see below.

## The rules about MS and EC

**The map is where you are whole.** Mental Stamina only moves during a ride, so standing on
the network it is always full, and EC is always at its resting level. That is a rule about
the game rather than a display trick — the values really are restored, in one place
(`Player.restOnMap()`, called when the phase returns to IDLE), so there is no way to reach
the map in a half-spent state.

It also makes the two numbers on the profile card worth reading: they say what the
**equipment** gives you, not where some previous fight happened to leave you.

**EC rests at half of MaxMS**, plus whatever the equipment says — `start_ec_pct` on the
player's row in `units` (0.5), then every equipped set's `ec_mod`. It is derived, never
stored: writing it into the profile would freeze it at whatever loadout was worn when it was
written, and it would disagree with the armor on the player's back for ever.

**Losing a fight is not losing the ride.** A defeat used to zero MS outright, which made
every loss the end of a run. It costs a large share of MS instead, and the run ends only
when MS reaches **zero** — so a bad fight early is something you carry, and choosing to keep
going with it is exactly the wager the Traveler's Dilemma asks about.

The debug encounter screen gained a **WIPED** button for that reason: with the rule in
place, the one outcome that actually ends a run is otherwise the one nobody can test.

One case the rule does not settle on its own is being beaten by the Station Boss while still
standing. The station is not taken, so it is not a win — but the run is not lost either, so
it resolves the way stepping off early does, with the exit share rather than everything.

## The pause menu

### PROFILE is a card, not a list

Everything about the passenger is crammed onto one object. That is not decoration: a list
of headed sections says *here are five unrelated facts*, and a card says *this is you, and
these are the things printed on you* — which is the claim the game is actually making. It
sits askew, drifts, and throws its shadow a long way down and right, so it reads as a
physical thing lying **on** the interface rather than another panel built into it.

- **The photo is not a photo.** An 8×8 silhouette on the same grid as every other glyph, so
  it belongs to the same alphabet. Deliberately anonymous — a face would be a claim about
  who the player is that the game has no business making.
- **Keys are stamps.** A key is a thing stamped into a travel card, so it is drawn as one:
  the line's emotion symbol struck into a disc. Unearned ones stay as empty grey rings
  rather than vanishing — the shape of what is missing is the whole point of a stamp page.
  Six in one row, always; five-and-one reads as a mistake rather than as a card with six
  spaces on it.
- **The bar is the battle system's bar.** `src/gauge.js` is a verbatim port — the same
  per-pixel renderer reading the same constants out of the same rules sheet, so the number
  you carry between fights is drawn by the code that will draw it during one. Two changes,
  both forced: the accent came from `u === S.player` and is now passed in, and `wave` became
  `gwave` because one shared global scope cannot hold two.

The stat block moved here from LOADOUT. It used to be printed beside the slots that produce
it, which was the right instinct — but the same four numbers on two tabs is an invitation
for them to disagree, and the card is where a player looks for *what am I*.

### What a move does

The `i` button is the battle system's, ported whole: same `data-a` hook, same wiring, same
`{KEYWORD}` / `*emphasis*` markup, same stat chips, same keyword colours (`{EC}` has none of
its own — it takes the scrolling ramp, because Emotional Charge is not one emotion). Blurbs
are written once in the sheet, so a line edited for a fight reads correctly in the pause
menu on the next rebuild.

It stops propagation, because it sits inside a card whose own click toggles the abilities
panel — without that, asking what a move does would also collapse the list you were reading.

### Motion

Four movements, all from one idea: things arrive **from below**, because the menu comes up
from the bottom edge where the button that opens it lives.

| | |
|---|---|
| opening | every element rises in turn, `--si` set per element in `stagger()` |
| closing | a quick fade, no movement |
| changing tab | the body slides up; the frame does not move |
| abilities panel | scales open from its top edge, with a triangle that inverts |

The stagger is capped at twelve. Past that it stops reading as choreography and starts
reading as the interface being slow.

Closing is deliberately **not** symmetrical with opening. Arriving is worth watching;
leaving is something the player has already decided on, and animating it just puts a delay
between the tap and the map coming back. `Menu.open` goes false immediately while the panel
is left up for the fade, so the map is interactive on the tap rather than 140ms later.

## One language for every panel

The travel popup set the house style, and everything the player meets now wears it:

- **`.framed`** — a thick stroke that *scrolls*, with the panel's own dark ground inset
  inside it. The gradient arrives as `--frame`, so the same three rules dress the travel
  popup (the lines the trip will ride), the platform decision, and the encounter.
- **`.bigbtn`** — big, corner-cut, hard black stroke, hard drop. `.go` wears the moving
  gradient, because the eye should land on the choice that carries the risk.
- **`--ride`** — the colour of the line under the train right now, published on the root
  element whenever the HUD syncs. A panel opts in by naming it; nothing is threaded through
  the markup. The leg header, the platform decision, the encounter and the Baggage screen
  all take it, so a red-line run is red all the way through.

The travel popup's gradient still comes from the *trip* (`--trip`), because a journey that
changes lines should say so before you board. Once you are aboard there is only one line
under you, so everything else uses `--ride`.

## What the city is doing

A **city status** is a condition Barcelona is in. It is not a station state: a state is a
property of a *place* and lives in the stations sheet; a status happens to the *city* and
then picks which places it lands on. Hence its own sheet, `city_status`, and its own
registry.

Three things follow from one being active:

1. the top of the map grows a **tag** for it, which explains itself when tapped — the same
   bubble the battle system explains an ability with;
2. the stations it landed on have their **live attributes multiplied**, so it is doing
   something whether or not anyone reads the tag;
3. the map **paints something around those stations**, so the tag is never the only
   evidence.

### Rush Hour, the reference status

| | |
|---|---|
| emotions | `DISGUST\|ANGER` — drawn as a mix, never averaged |
| lines | `L1\|L2\|L5` |
| when | weekdays, `7-10` and `17-20` Barcelona local |
| share | 40% of the eligible stations |
| does | `density ×1.6`, `aggro ×1.5` |
| looks like | a ring of green and red dots that will not hold still |

The shake is the idea: a crowded platform is not a glow, it is a lot of small things
jostling, so every dot is thrown a pixel or two off its place on the ring **on its own
phase** — jitter them together and the ring shivers as one piece, which reads as a wobbling
circle rather than a crowd.

### Which stations, and why it has to be decided that way

Picking at random per client would mean two people playing the same city at the same moment
see different maps. Re-rolling per frame would mean the set changes while you look at it.
Both are the bug the weather already solved, so the answer is the same: **a hash of the
station, the status, and the current window.** Stable for the length of the window,
identical on every device, and nothing is sent anywhere.

The window *index* is part of that hash, so the morning rush and the evening rush land on
different stations rather than repeating the same set twice a day. A status that would land
on nothing is given the one station it came closest to affecting — a tag over an untouched
map reads as a bug.

### Seeing it out of hours

Rush Hour is only really happening for six hours on a weekday, which is a long time to wait
while building it:

```bash
open "http://localhost:8178/?status=RUSH_HOUR"
```

`?status=none` holds everything off; `CityStatus.force("RUSH_HOUR")` does the same from the
console, and `force(null)` gives the clock back.

### A trap worth knowing

`emotions` and `lines` are **list columns**, so the parser hands them back already split;
`hours` and `day` are not. Reading a cell as the wrong one of those fails *silently* — the
pipes survive into a single string, nothing matches, and the feature simply never happens.
Every cell in `city.js` goes through `listOf()`, which takes either.

## Station states

A **state** is a condition a place is in: what the map shows there, and what it does to
a player passing through, in either direction. **The states are not designed yet**, so
none is asserted as real. What exists is the seam:

`StationFx.define(id, spec)`, with every hook optional and all of them pure paint —
`under` (haloes, behind the dot) · `ring` / `fill` (colour changes) · `over` (sprites,
particles) · `ink` (the name) · `live` (does it animate). A spec is handed a painter
rather than the frame buffer, so states keep working if the rasteriser is replaced.
Unknown states degrade to a plain station instead of throwing.

The shape is borrowed from battle's `AbilityFx` deliberately — same three properties: an
id that comes from data, a fallback, and fire-and-forget paint hooks.

`SURGE`, `HAZE` and `SHUT` are **placeholders**, one per hook family (colour change,
particles, sprite), there so the plumbing is provably alive. Every station's `state` in
the spreadsheet is blank, so nothing renders until the design says it should.

## Running it

```bash
python3 ../shared/tools/serve.py --app MAP
```

## Rebuilding content

```bash
cd ../shared/tools
python3 export_csv.py
python3 build_data.py ../config/csv --app MAP
```

The spreadsheet and tooling are **shared with BATTLE SYSTEM** and live in `AVUI/shared/`.
Map content becomes new sheets in that one workbook — the emotions table is the spine of
both systems and must exist exactly once.

## The seam with battle

**It is connected now.** The title screen leads here, and tapping an enemy on a ride hands
the fight to the battle system — which the map mounts in a frame rather than navigating to.

### Why a frame

The ride has to be waiting when the fight ends: mid-travel, at line speed, same elements in
the air. Navigating away and back would throw all of that on the floor and the train would
pull out from a standing start on the other side. A frame leaves the map running in memory,
untouched — which is also why neither prototype had to be rebuilt for this. The battle
system is not imported, it is **asked**.

They speak by `postMessage`, not by reaching across into `contentWindow`: under `file://`
every origin is opaque and direct access is refused, while `postMessage` crosses an opaque
boundary happily. This has to keep opening off the disk.

```
MAP                                        BATTLE (in the frame)
  mount, ?handoff=1  ─────────────────────▶ boots, title removed, waits
  {AVUI_START, descriptor}  ──────────────▶ applies it, runs intro()
                                            …the fight…
  ◀────────────── {AVUI_RESULT, result}     results panel, then the player taps
  fade to white, unmount, ride resumes
```

**Off the disk, the battle theme cannot autoplay — and that is a browser rule, not a bug.**
Every `file://` document has an opaque origin: a Permissions Policy feature cannot be granted
to one, so the `allow="autoplay"` below is ignored there, and user activation only propagates
to *same-origin* descendants, so the tap that started the fight cannot reach the frame
either. The theme waits for the first touch inside the fight instead. Over http — which is
what the deployed build is — it plays over the intro as intended. Locally:

```bash
python3 "AVUI/shared/tools/serve.py" --all 8180
```

The frame is mounted with `allow="autoplay"`. A frame is not given the parent's right to
make noise — it has no user activation of its own, since the tap that started the fight
happened in the map's document — so without the grant the battle's theme cannot start until
someone presses something inside it. With it, the theme plays over the intro, where it was
written to.

**The frame speaks first.** The map waits for `AVUI_READY` before sending anything — a timer
would be a race against however long fourteen scripts take to parse on a cold phone.

### What crosses

The shapes are the ones `battle-bridge.js` has described since before there was anything to
fill them in — §13.2 out, §13.3 back — and they did not have to change. The map is the
authority on the player: MS ceiling and Emotional Layers from the armor, the ability pool
from the three Move Sets. Reading `units.player` on the far side would quietly fight a whole
progression system, so `handoff.js` overwrites the sheet's defaults with what the map sent.
Verified: a fight opens at the map's 480 MS / 240 EC, not the sheet's 400 / 200.

### What a won fight leaves

`drops` on the **enemy's own row**, as `kind:amount:chance` —
`CRYSTAL:2:0.75|SEGMENT:3:0.55|ORB:1:0.40`. Every kind is rolled **separately**, so one
enemy can leave everything, something or nothing; a single roll across all three would make
the good haul and the empty one the same event. The amount is "up to".

Each lands through the machinery that already handles it: crystals in the vault, segments
through the trip bar's own tween and `map_tripup`, orbs adding `orbMsPct` of MaxMS. **Orbs
only mean anything mid-ride** — MS is restored in full on the map — so a Stamina Orb is a
decision about whether *this* ride continues, which is the same reason MS is the only thing
that ends a run.

### The sequence

Tapping an enemy is the same **kind** of event as leaving a station, so it is the same piece
of theatre: the travel scene floods with the enemy's colour (`departWash`, same curve), then
a circular wipe opens onto the frame — where battle's own diagonal-line intro is already
running into its own wipe. Coming back is a fade to white that covers the frame's teardown.

You return to a train **already at line speed**. `J.f` drives the acceleration ramp, so
restoring it exactly would put a fight in the first seconds of a ride back at a crawl — the
player would watch the train pull away a second time having just won something.

### Who is riding — asked once, at the door

A first-time player is asked their name and their affinities **on the title screen**, the
moment they tap ENTER THE NEURO METRO and before the transition runs. It goes there rather
than on the map because that is the door: someone who has just decided to go in should be
asked who is going in, not shown a city and interrupted.

It happens once per **save**, not per session — the check is for a map profile, so coming
back out to the title from the pause menu and going in again never asks twice.

**What it leaves behind is deliberately tiny**: a name and up to two affinities, under
`nm.avui.newpassenger`. It does not write a profile. The map owns what a profile is — armor,
keys, crystals, schema version — and a second app writing that structure would be a second
definition of it, out of date the first time this one changes. Two fields is a message; a
profile is a claim. `Player.claimNewPassenger()` reads it, builds the real profile, and
**consumes the key** — left in place it would overwrite the profile of someone who later
renamed themselves, every time they opened the game.

The map's own creation screen stays as the fallback for anyone who reaches the map without
having been asked. It is simply never owed, so it is never shown and dismissed.

**The pace is the point.** Every element arrives on its own, and the six emotions take a
full second each, rising as they fade in, each waiting for the last. Measured: 2799, 3801,
4810, 5878, 6934, 8017ms. Six seconds to meet six emotions is slow for a menu and about
right for the only moment in the game that asks the player what they are.

Selecting is tapping: a bright thick stroke glows on the chosen. Re-tap releases. Two is the
ceiling, and a third tap releases the **oldest** rather than being ignored — a control that
does nothing reads as broken. PROCEED is visible but dead until at least one is held, so its
condition is legible as a condition.

### The door, both ways

**In.** The title screen's button — **ENTER THE NEURO METRO** — fades its *content* out over
three quarters of a second and navigates here with `?enter=1`. It fades the content rather
than the whole title because `.title` **is** the black: fading all of it would reveal the
battle screen sitting behind it for half a second, which is the one place the player is not
going. What is left is plain black.

The map then opens the **same circular wipe** the battle handoff uses, out of that same
black. So a page load in the middle of a transition is invisible: both halves meet on the
same colour, and what the hole opens onto is the city. Nothing new was drawn for it —
`battleWipeReveal()` was already there, which is the payoff for having put the curtain in
one place.

**Out.** The SAVE tab ends with **MAIN SCREEN**. It lives there and nowhere else on purpose:
that is the one tab where the player is already thinking about what survives, so a warning
about leaving mid-run can be read in the same breath as the button that downloads the file.
It saves before it goes — the game saves on the map anyway, but this is the one action that
walks away from the page, and a profile edited in the menu and not yet written would be gone
with no way back to ask about it.

There is no confirm dialog, even mid-run. The section says plainly what leaving costs, and a
run is not a thing worth trapping someone in.

### Running both locally

`serve.sh` in **either** app now serves the WHOLE WORKSPACE, not just that app. It has to:
the two prototypes link to each other as siblings (`../MAP/`, `../BATTLE SYSTEM/`), which is
what they are in the upload — and a server rooted *inside* one app puts those paths above
its own root, so every cross-app link 404s. The map cannot open a battle and the title
screen cannot reach the map.

```bash
"AVUI/BATTLE SYSTEM/serve.sh"      # or MAP/serve.sh — same workspace, different port
```

Then start at `http://<ip>:<port>/BATTLE%20SYSTEM/index.html`.

**The dev server is case-sensitive on purpose.** macOS filesystems are not, so
`/map/index.html`, `/Map/Index.html` and `/battle%20system/…` all resolve here — and all
404 on GitHub Pages, which is Linux. That asymmetry is how a stray lowercase gets into a
link, a bookmark or a note and survives: nothing local ever objects. `serve.py` now refuses
a wrong-case path and names the right one:

```
404 — wrong case.
  you asked for : /map/index.html
  the real path : /MAP/index.html
```

### Where the other app lives — and why the name is not trusted

Every link between the two apps is built from one constant per app — `BATTLE_APP` in
`MAP/src/util.js`, `MAP_APP` in `BATTLE SYSTEM/src/util.js`. **But the name is not asserted,
it is confirmed.**

A case-only rename is invisible to git on macOS (`core.ignorecase` defaults to true), so a
folder committed once as `map` stays `map` in the repository however many times it is
renamed on disk — and Pages serves what the repository says, on Linux, where case is not
negotiable. The link then works on the machine that wrote it and 404s for everyone else.

So at load each app probes the plausible spellings of its sibling — as configured, lower,
upper, hyphenated, joined — and keeps the first that answers a `HEAD`. Verified against a
copy of the deploy with **both folders lowercased and served case-strictly**: configured
`MAP` resolved `../map/`, configured `BATTLE SYSTEM` resolved `../battle%20system/`, and a
fight mounted and ran through it.

`file://` cannot be probed (fetch refuses an opaque origin), so there the literal name is
used — correct, because a local disk is the one place the name really is what it says.

**This makes the deploy survivable, not correct.** The tidy fix is still to get the
repository agreeing with the disk:

```bash
git config core.ignorecase false
git mv MAP map-tmp && git mv map-tmp MAP        # forces the rename to be recorded
```



Every link between the two is built from **one constant per app** — `BATTLE_APP` in
`MAP/src/util.js`, `MAP_APP` in `BATTLE SYSTEM/src/util.js`. Renaming a folder is one line,
not a hunt through three files. Both go through a helper that encodes the name, so
`BATTLE SYSTEM` emits `../BATTLE%20SYSTEM/…` rather than a raw space, which a strict server
is entitled to reject.



The debug "battle occurred" panel is **gone**. It existed so map flow could be built with no
battle system to hand off to; with a real one, it was a second and drifting definition of
what an encounter result is — and it was appearing over real fights, because `Encounter.open`
is true for both.

## Where to look

| You want | Read |
|---|---|
| The map design | `../GDDs + Spreadsheets/AVUI_MAP_GDD.md` (yours to write) |
| How to build things here | `ARCHITECTURE.md` |
| The combat design | `../GDDs + Spreadsheets/AVUI_COMBAT_GDD.md` |
| The battle prototype | `../BATTLE SYSTEM/` |
