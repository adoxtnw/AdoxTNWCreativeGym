# MAP — everything outside a battle

The day, the network, the encounters, and what carries between them.

**The navigation loop from `../GDDs + Spreadsheets/AVUI_NAVIGATION_GDD.md` is in.** Pick a destination, ride
leg by leg through emotional space, and at every platform decide whether to bank what you
are carrying or push the wager further.

**The battle system is deliberately not connected.** Every encounter opens a debug screen
reading `BATTLE OCCURRED` with WIN / LOSS / FLED — but it builds a real §13 descriptor and
returns through the real `applyEncounterResult`, so the contract is exercised and hooking
the two apps together later is a change to one function in `src/encounter.js`.

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
| The debug battle stand-in | `src/encounter.js` |
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

| | kind | chance | on screen | per trip | life |
|---|---|---|---|---|---|
| **Track Segment** | `SEGMENT` | 25% | 8 | **unlimited** | rides to the edge |
| **Crystal Shard** | `CRYSTAL` | 9% | 2 | unlimited | rides to the edge |
| **Settled Echo** | `LOOT` | 12% | 3 | 12 | 4–8s |
| **Emotional Entity** | `ENEMY_PASSIVE` | 10% | 2 | 4 | 5–15s |
| **Hunter** | `ENEMY_AGGRO` | 5% | 1 | 2 | 8–14s |

`0` in `max_per_trip` means **unlimited** — Track Segments must never stop appearing, since
they are the thing the ride is about. Collectables leave by the bottom edge rather than by
expiring, and never fade before they get there.

**They move at the display's refresh rate while their animation stays at 12 fps.** A segment
crossing the screen at 12 fps jumps eight pixels between frames, so what is under your thumb
when you press is not what was there when you decided to press. Hit boxes are also much
bigger than the art — `travelTapR` is only the floor.

Every `travelRollSecs` (3), each type is offered **every free slot it has**, and each slot
is rolled independently. Rolling once per type would make a cap of fifteen unreachable —
at one success per three seconds against a life of one to three, there would never be more
than one on screen. Successes are then spread across the coming interval, so the window
fills steadily instead of pulsing.

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
is already alongside when you notice it. That is why a Settled Echo and an Emotional Echo
can carry the same payload and still feel nothing alike.

**Nothing owns a timer or a listener.** Every element is a plain object in one array,
drawn from it and spliced out when it expires — an element that registered its own
`setTimeout` or DOM node would leak one per spawn, and a ride produces dozens. Verified:
repeated rides end at zero live and zero queued, and the caps hold.

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

#### The audio files

`AVUI/MUSIC/` keeps the originals; **`MAP/audio/` holds web-ready AAC, and that is what
ships.** Same split as the spreadsheet and `data.js`: a source you edit, an artefact you
upload. Rise was 25 MB as WAV — not something to send down a phone connection. Converted
with `afconvert` (macOS, no install needed):

```bash
afconvert -f m4af -d aac -b 128000 "MUSIC/Rise.wav" "MAP/audio/rise.m4a"
```

34 MB → 6.9 MB total. Re-run that if you replace a track.

### Sound effects, synthesised

Effects are synthesised from the shared `sounds` sheet (`map_*` and `ui_*` rows) — no audio
files. The music is the exception, and it runs on the **clean bus**: putting a real
recording through the bit-crusher that makes the effects crunchy would only cost it a few
bits and replace its top end with aliasing.

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

`AVUI_COMBAT_GDD.md` §13 is the contract, and it is already specified:

- **§13.2 — what battle needs from here:** player `MaxMS`, `INIT`, emotional type, current
  loadout, encounter composition, and whether fleeing is allowed.
- **§13.3 — what battle returns:** `{outcome, ms, ec, rounds, rewards}`.
- **§13.1 — what persists:** MS and EC both carry between encounters within a day.
  Overload and statuses clear.

Neither system needs the other to be worked on. During map development
`startEncounter()` is a **stub** returning a fixture; battle already boots from its own
fixture. See `src/battle-bridge.js`.

## Where to look

| You want | Read |
|---|---|
| The map design | `../GDDs + Spreadsheets/AVUI_MAP_GDD.md` (yours to write) |
| How to build things here | `ARCHITECTURE.md` |
| The combat design | `../GDDs + Spreadsheets/AVUI_COMBAT_GDD.md` |
| The battle prototype | `../BATTLE SYSTEM/` |
