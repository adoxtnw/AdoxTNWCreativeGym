# NEURO-METRO: AVUI — Prototype 01 · "Line Battle"

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

## Pass 07 — smaller, SNES-era, mirrored layout

- **Everything roughly halved.** Gauges 30→16px, lanes 64→38, stations 48→28, tray icons 26→15,
  buttons and big tags all down proportionally. **The MS/EC value tags stayed large** — they are the
  only numbers on screen.
- **SNES era rather than Atari.** Neutrals moved from near-black to deep indigo menu boxes; every
  panel, bar, button and tag now has a vertical gradient and a **bevelled edge** (light inner top-left,
  dark inner bottom-right) instead of a flat fill and a hard black drop. The rings gained the same
  treatment — a lit outer edge and a shaded inner edge give each band volume. Shadows softened from
  pure black to a translucent drop. The pixel grid and palette are untouched.
- **Audio followed the same shift**: bit-crusher quantisation went from 5 steps to 12 and the
  low-pass opened from 5.4k to 7.2k — less Atari buzz, more SNES sample with reverb. It is one
  number, `crusherSteps` in the rules sheet, if you want the harshness back.
- **Layout mirrors**: enemy gauge at the very top, player gauge at the very bottom, with the enemy's
  line under theirs and the player's layers, line, tray and depart button stacked between.
- **The player's layers are now a very large circle** — radius 300 against a 5px slot spacing —
  so only the gentle top of the arc crosses the strip. No overlap with the enemy, and the curvature
  barely bows.

### Ring geometry changed
Radii used to taper toward a centre point (`maxR × (1 − pos/slots)^shrink`). They are now
`baseR − pos × spacing`, which decouples **how big the circle is** from **how tightly the layers
stack**. That is what makes a nearly flat arc possible: a huge `baseR` with a small `spacing`.
The enemy keeps a small `baseR` with proportional spacing, so it still reads as concentric.

## Pass 06 — the spreadsheet becomes the source of truth

### `config/avui-config.xlsx`
Upload this to Google Sheets. It is now where all game content lives.

| Sheet | What it is |
|---|---|
| **README** | conventions and the round-trip instructions |
| **emotions** | the six emotional types and their palette colours |
| **abilities** | everything a unit can do — 34 columns, 8 live today |
| **matchups** | **attack emotion × layer emotion → damage and charge.** Your synergy table |
| **units** | player and enemies: stats, starting layers, ability pool |
| **layer_types** | *reserved* — per-layer durability, on-break effects, passives |
| **status_effects** | *reserved* — buffs and debuffs |
| **synergies** | *reserved* — line-level combos (sequences, counts, positions) |
| **rules** | global tunables, each with a description |
| **sounds** | the runtime-synthesised SFX |
| **checks** | live formula validation — every row should read OK |

The row directly under each header marks the column **LIVE** (green — the game reads it today,
renaming it breaks things) or **planned** (yellow — inert until wired, safe to fill in early).

### Round trip
```
Google Sheets  →  File > Download > CSV (one per sheet)  →  python3 tools/build_data.py <folder>
```
That regenerates `data.js`. Reload. Nothing else to touch. Verified end to end: exporting all
eleven sheets and regenerating produced a byte-valid `data.js` that boots identically.

### The matchups table is the synergy engine
Interactions no longer live in code. `matchup()` reads the table: `*` is a wildcard, `NONE` means
the target has no layers, and **the highest `priority` row wins**, so a specific pairing always
beats a wildcard. Adding

```
JOY | SADNESS | 20 | 2.0 | 0 | CATHARSIS | absorb | absorb | 1
```

makes Joy hit Sadness layers for double damage under a new banner — no code change. Tested live:
damage went 35 → 70 and the tag read CATHARSIS.

### Other changes in this pass
- **Only the outermost layer glows**, colour-coded to its emotion, on its own canvas. Everything
  behind it renders unlit. The active layer is **2× thick**, the rest **~0.55×**.
- **Ability taps now land in execution order** — tap Sadness first and Sadness fires first.
- **Paced layer break**: flash → vanish (the rest ease outward) → beat → regrow from the centre at
  the back of the queue. Timings are in `rules` (`layerFlashMs`, `layerGapMs`, `layerRegrowMs`).
- **All chrome text removed.** Only the MS/EC value tags and the cost/power inside ability boxes
  remain. The freed vertical space went to the stage, the lanes and the tags.
- **Tags are ~2× larger**; the unlit part of each bar is roughly twice as bright.
- **Sound**: 13 cues, synthesised at runtime through a bit-crusher and a shared delay line — no
  audio files. Configured in the `sounds` sheet.

## Pass 05 — execution order, layer animation, readability

### Execution order
Stations fire **rightmost first, then leftward**. Everything that reasons about a line — resolution,
the build-phase preview, the enemy AI — routes through one helper (`execOrder`), so the order is defined
in exactly one place. The **terminus arrow moved to the left end and now points left**, marking the
direction of travel so the order is readable without instructions.

### Layer rings
- Inner layers are **smaller and thinner**. Band width is derived from the gap to the next slot in, so
  adjacent same-colour layers can never merge — the enemy's two Anger layers were previously reading as
  one thick red band.
- **Switch animation.** The struck layer is thrown to the centre at zero radius, vanishes, then **regrows
  outward** into the innermost slot as it takes last place in the queue. Every other layer eases one slot
  outward, growing and thickening as it comes forward. Verified frame by frame: `6.00 → 5.36 → 4.82 → …`
- **Breathing travels in waves** — each slot's pulse is phase-offset by its position, so the motion reads
  as radiating from the centre rather than everything throbbing together.
- **Player rings are much thinner** so they no longer crowd the enemy.

### Resolution readability
- The **struck layer flashes white**.
- The **executing station scales up 1.34× and double-glows** while it fires.
- **Big momentary tags** call out every outcome: the damage number, `ABSORBED! +n EC`,
  `OFF TYPE · NO CHARGE`, `BLOCKED`, `SHIELD UP`, `NO LAYER`. Several at once stack vertically.

### Bars
- The to-be-consumed segment now **breathes between black and white** instead of fading, for real contrast
  against the yellow charge.
- Layer pips removed, replaced by an `OUTER <EMOTION>` label.
- **MS tag** — white plate, bold black numerals — rides the ceiling chevron and moves with it.
- **EC tag** — yellow plate, bold black numerals — rides the leading edge of the charge fill.

## Pass 04 — layers, and a data-driven config

### All content now lives in `data.js`
`index.html` contains **no content values** — no ability numbers, no unit stats, no matchup multipliers.
Everything is CSV tables in `data.js`, parsed at boot:

| Table | One row per | Notes |
|---|---|---|
| `emotions` | emotion | id, display name, palette token, hex |
| `abilities` | ability | `kind` (DAMAGE/SHIELD), `power`, `emotion`, `hitsLayer`, `icon` |
| `units` | combatant | `maxMs`, `startEcPct`, `layers` (pipe-separated), `pool` |
| `rules` | tunable | line cap, matchup multipliers, rest charge, clash length… |

Keep these as sheets, export as CSV, paste between the backticks. Unknown columns are carried through
untouched, numbers auto-parse, `|` separates list values, `1`/`0`/`TRUE`/`FALSE` become booleans on the
columns named in `SCHEMA.bool`. Adding a new ability or a new enemy is a row — no code.

### Emotional layers
- Each unit has up to **6 layer slots** (`rules.maxLayers`), ordered, **outermost first**.
- The **outermost layer** takes the next attack. When hit, it **rotates to the back of the queue**.
- Abilities only rotate the queue if their `hitsLayer` column says so — Defend leaves layers untouched.
- **Enemy layers are the concentric rings**, now exactly 6 slots; empty slots render dark and the
  next-up ring breathes brighter.
- **Player layers are giant concentric rings rising from behind the UI**, same renderer, same rules.
- Both panels carry a **pip strip** showing the queue order with the next-up layer outlined.

### Matchup table (`rules`)
| | damage | charge to receiver |
|---|---|---|
| attack emotion **matches** outer layer | **×0.5** | **×1.0** |
| attack emotion **differs** | **×1.0** | **×0.0** |
| target has **no layers** | ×1.0 | ×0.0 |

### Real chevrons
The ceiling and the left cap are now actual **double chevrons**, both pointing the same direction, so the
sliding ceiling **nests into** the fixed cap as MS runs out.

### ⚠ Balance finding from automated play
**Off-type attacking is currently strictly dominant** — it does full damage *and* denies the target any
charge. Same-type does half damage *and* feeds them. Since Overflow still has no consequence, feeding the
enemy is pure downside, so there is never a reason to match a layer.

An automated all-off-type run won in 3 rounds with **both sides ending at 0 EC**: when nobody lands a
same-type hit, nobody generates charge, and the fight becomes a short burn-down of starting EC into
repeated RESTs. Same-type only becomes worth choosing once Break / Overload lands and pushing a target's
charge is a way to win. Worth keeping in mind before tuning these multipliers.

## Pass 03 — what changed

- **The ceiling is now a thick, glowing double chevron** (one zig, one zag), with a **mirrored chevron
  capping the left edge of the bar**. As MS falls the ceiling slides left toward the cap; at 0 MS the two
  mesh into a single solid glowing block — the moment of death is literally the two shapes fitting together.
- **The ceiling pulses red when MS drops below 18% of max**, so the last stretch feels like a countdown.
- **Unspent usable capacity glows** — faint cyan for you, faint red for the enemy.
- **Destroyed capacity** (MS you've lost) is very dark red, tiled with a pixel warning glyph in a darker red.
- **Charge past the ceiling** renders as a fast bright orange pulse over the destroyed region — your charge
  spilling into capacity you no longer have.
- **Every UI surface has pixelated staircase corners** — a 2-step cut at each corner via `clip-path`.
  The phone bezel keeps smooth corners; it's the device, not the game UI.
- **The clash:** when either side hits 0 MS, everything drops into slow motion for 4 seconds — the sprite
  falls from 12 fps to 3, a shockwave ring expands from the contact point, 64 pixel particles burst outward,
  and a white flash blooms and fades. Only then does the result screen appear.

> ### ⚠ RULES CHANGE: charge is no longer clamped at the ceiling
> Previously EC was hard-capped at current MS. It now **exceeds** the ceiling, which is what gives the orange
> overflow tint something to show. **Break / Overload consequences are still not implemented** — overflow is
> currently visual only, and the excess charge is freely spendable. This is deliberately the first half of
> the GDD's Overflow system: the state exists and is legible before it bites.

## Pass 02 — what changed

- **One unified gauge per unit, replacing the two separate bars.** The whole track is **MaxMS**. The lit
  section is **current MS** — your usable capacity. The hatched section to its right is **MS you've already
  lost**, i.e. capacity that is gone. The yellow fill inside the lit section is **EC**. The white tick is the
  ceiling. As you take damage the hatching eats leftward and the ceiling slides toward your charge: the
  squeeze is now a single readable image.
- **Build-phase previews.** Queueing abilities paints two projections:
  **white, glowing** on your own gauge — the EC this line will consume;
  **pink** on the enemy's gauge — the EC this line will charge *them* with.
- **EC is paid in full at DEPART**, before the first station fires, so during resolution the only gauge
  moving is the target's.
- **Gauges are ~2.4× thicker** (26px).
- **The enemy's line sits directly under their gauge**, at the top of the screen.
- **Hitstop + shake on damage.** Everything freezes — including the 12 fps sprite — for ~95 ms behind a white
  flash, then snaps into a stepped shake and stops hard.
- **Abilities are metro stations.** Each is a chunky hollow ring with the ability glyph inside, joined by
  thick coloured track segments and capped with a terminus arrow. Unbuilt slots are dashed grey line with
  ghost stations, so building a line reads as drawing a metro route.

## What's implemented

- Enemy **250 MS**, player **400 MS**.
- **ATTACK** — 20 EC, 35 MS damage. **DEFEND** — 10 EC, blocks the next single attack, then breaks.
- Line of up to **3 stations**, resolved left→right. **Your whole line resolves first, then the enemy's.**
- **Stepped resolution:** the lane zooms, travels to the next node, stops, fires, plays the effect, moves on.
  The lane auto-scrolls to keep the active node centred and may overflow the screen edges.
- Enemy rendered as breathing concentric rings on a 64×64 canvas, redrawn at a **locked 12 fps**, upscaled
  with nearest-neighbour. Rings drift outward from the centre while radius, band thickness and colour cycle.
  Every ring carries a 1px hard shadow offset down-right (Game & Watch style) plus a CSS bloom.
- The player has no sprite, per the Shin Megami Tensei first-person convention.

---

# ADDED BY ME — not in the brief

Listed because the brief didn't cover them and each one is a design decision you may want to overrule.

### Rules

1. **Where EC comes from, and how much you start with.** You specified EC *costs* but no economy.
   Following the GDD: **EC is gained 1:1 from MS damage taken**, and both units start at **40% of MaxMS**
   (player 160, enemy 100). There is no passive regeneration.
2. **EC is hard-capped at current MS.** The GDD's Overflow / Overload / Exhaustion systems are *not* built
   yet. Rather than fake them, EC simply cannot exceed the ceiling — and **the ceiling is drawn as a tick
   mark on the EC bar that visibly slides left as you take damage.** The core mechanic is legible from day
   one without any of its consequences existing yet. Enabling real overflow later is a one-line change in
   `applyAbility`.
3. **Line capacity = 3.** Without a cap, 160 EC buys 8 attacks = 280 damage and the 250-MS enemy dies on
   turn one. Paral·lel used 3–15 slots; 3 is the floor.
4. **The enemy's line is face-up during planning.** GDD §10 requires intent to be visible, and without it
   ordering your own line is a guess rather than a decision. This is the Slay the Spire intent read.
5. **REST.** Departing with an **empty** line grants **+15 EC**. Without this, two units at 0 EC deadlock
   permanently. The button relabels itself when your line is empty.
6. **A blocked attack generates no EC** for the defender (GDD §9). Defending protects your health *and*
   starves your fuel — so shields are a real trade, not free value.
7. **Shields persist until consumed** (no expiry timer). Simplest reading of "blocks 1 attack then breaks".
8. **Enemy AI.** Adds a DEFEND first if it's below 50% MS and unshielded, then fills remaining slots with
   as many ATTACKs as it can afford. Rests if it can afford nothing.

### Added in pass 02

15. **Projected-ceiling marker (red tick) on the enemy gauge.** You asked for the incoming-charge preview.
    On a unified bar that would be misleading on its own — attacks also *lower* the enemy's MS, which lowers
    their ceiling. The red tick shows where their ceiling will be after the line resolves, so you can read
    "charge goes up, ceiling comes down" as one picture.
16. **Lost MS is hatched, not merely empty**, so "capacity I no longer have" is distinguishable from
    "capacity I have but haven't charged".
17. **Player damage shakes the whole screen; enemy damage shakes only the sprite.** The player has no
    sprite to shake, so the screen stands in for their body.
18. **The DEPART button shows the charge it will cost** now that payment happens up front.
19. **Terminus arrows and dashed ghost track** — metro-map conventions that make an unfinished line read as
    unfinished rather than broken.

### Added in pass 03

20. **Proximity pulse on the ceiling.** "Ominous" needs a cue that changes, not just a static glow — so the
    chevron shifts to a fast red pulse once MS is under 18% of max.
21. **The overflow orange is produced by cycling fury → euphoria at ~3 Hz** rather than adding a 7th colour
    to the palette. It reads as bright orange while keeping the colour discipline you set. Trivially
    swappable for a literal orange if you'd rather.
22. **The particle burst is biased away from the nearest screen edge.** The enemy's gauge sits near the top,
    so an even radial burst would throw half its particles off-screen.
23. **Hard shadows are rebuilt with `filter: drop-shadow`.** `clip-path` clips `box-shadow` away entirely,
    so the Game & Watch shadow had to move to a filter, which follows the clipped alpha.
24. **The chevrons live in an unclipped wrapper around the gauge**, so they can overhang its top, bottom and
    left edges instead of being cut off by the gauge's own corner mask.

### Added in pass 04

25. **The 6 emotions are named Anger, Sadness, Joy, Apathy, Nostalgia, Calm** — one per palette colour.
    You named the first three; I filled the remaining three from the existing palette. This partially
    answers the GDD's open 4-vs-6 question (§7.3), and renames the GDD's Fury/Sorrow/Euphoria to your
    colloquial terms. Worth settling in the GDD before it spreads further.
26. **`hitsLayer` is a per-ability column**, not inferred from the ability kind — so a future buff or
    debuff *can* be made to hit a layer, which is what you described.
27. **`ecBasis` rule.** "Same type does 50% damage but 100% EC" is ambiguous about what the 100% is *of*.
    I made charge derive from the ability's **base power**, so a same-type hit gives full charge even
    though its damage is halved. Set `ecBasis` to `DEALT` in `data.js` for the other reading.
28. **Layer pip strips** in both panels. The rings show *which* layers exist; the pips show the queue
    **order** and which one is next, which the rings can't communicate on their own.
29. **A blocked attack does not rotate the layer queue** — the attack never landed. Configurable via
    `rules.shieldRotatesLayer`.
30. **The enemy AI reads the matchup table** and greedily picks the highest-damage option against the layer
    that will be outermost at that point in its own line. Change the multipliers and its behaviour changes
    with them; no AI code to touch.
31. **Typeless abilities** (blank `emotion`) never match a layer. Defend is typeless.

### Added in pass 05

32. **The EC tag sits below the bar, the MS tag above.** Both anchor horizontally, so they would overlap
    exactly when charge approaches the ceiling — which is the moment you most need to read both.
33. **The EC tag turns red when overcharged**, so the plate itself carries the warning.
34. **Tags flip their anchoring at the extremes** (left-aligned near 0, right-aligned near max) so they
    aren't sliced off by the panel's pixel-corner clip at full MS.
35. **The terminus arrow moved to the left end, pointing left.** With execution running right-to-left, an
    arrow still pointing right off the tail read as the wrong direction of travel.
36. **Ring band width is derived from the gap to the next slot**, not set as a fixed thickness. Without
    this, tapering the rings inward made adjacent rings touch and merge.
37. **Numeric MS/EC removed from the status row** — the tags carry those now. The row shows max MS and an
    overcharge warning instead.
38. **New ring tuning exposed in `data.js`**: `layerEase`, `layerWaveDelay`, `layerInnerShrink`,
    `layerFill`, and per-unit ring radius/thickness/breathe values.

### Added in pass 06

39. **Column names moved to `snake_case`** across every table (`hits_layer`, `max_ms`,
    `start_ec_pct`). Mixed conventions in a sheet you are going to live in would have been a
    permanent papercut.
40. **The CSV reader now handles quoted fields**, so notes and descriptions can contain commas.
    The converter re-quotes any cell that needs it on the way out.
41. **A `checks` sheet** with live formula validation — unknown emotion references, duplicate ids,
    blank pools. Every row should read OK.
42. **A `suggested_cost` / `cost_delta` pair** on the abilities sheet, applying the GDD's cost
    budget so you can see at a glance which abilities are mispriced. Stripped by the converter —
    they never reach the runtime.
43. **Ring band width is clamped to the slot gap.** Making the outer layer 2× thick made it
    swallow the layer behind it, which is why the enemy's second Anger layer had vanished.
44. **Reserved sheets carry one `enabled=0` example row** showing the intended format, so the
    shape of a future feature is legible before it is built.

### Added in pass 07

45. **The breathing wobble now translates a ring instead of squeezing it.** It was being applied at
    full strength to a ring's outer edge but 60% to its inner edge, so thin bands were pinched below
    one pixel and vanished entirely for part of every cycle — which is why the player's Sadness layer
    appeared to be missing.
46. **Bevel shading is skipped on bands under 3px.** On a 1px band the lit and shaded edges *were*
    the whole band, which turned every thin layer into a dark smear.
47. **The player ring canvas is deliberately low-resolution** (120×32 logical). A higher-resolution
    canvas made each layer a hairline once scaled; fewer, larger logical pixels keep the bands chunky
    and readable.
48. **MS tag stays above the bar and EC below on both units**, rather than mirroring vertically with
    the layout. A true mirror would have put the player's numbers in the opposite order to the
    enemy's, which reads as a different quantity rather than the same one.

### Interface / feel

9. **Tap-to-remove** from the line — you specified drag-to-reorder but no way to undo an add.
10. **A one-line readout** under the lanes narrating each step of resolution. Debug affordance for this
    stage; delete it once the animations speak for themselves.
11. **Win / lose overlay + restart**, and a **round counter**.
12. **Damage floats, white hit-flash on the enemy, screen shake.**
13. **Enemy given a placeholder name and type** — "THE COMMUTER", FURY. Cosmetic only; **types have no
    mechanical effect yet.**

---

# DEVIATIONS AND KNOWN GAPS

- **Colour count.** You asked for 6 emotions + dark gray + off-white. The 6 emotion colours and off-white
  are exact. The dark gray is **a 4-step ramp** (`--void` / `--dark` / `--panel` / `--line`) rather than a
  single value — pixel-art panels, borders, rails and hard shadows can't be separated with one flat gray.
  All four are the same hue; say the word and I'll collapse them.
- **No pixel font.** Glyphs are system monospace, uppercased and letter-spaced with hard drop-shadows.
  It reads retro but the letterforms are not literally pixels. Embedding a bitmap font is a contained
  follow-up.
- **Not implemented:** Overflow, the Break countdown, Overload, Exhaustion, emotional type advantage,
  statuses beyond Shield, initiative, multiple enemies, `reach`, and the meta/map layer.
- **Balance is untuned.** An all-ATTACK line wins in 3 rounds at roughly 225/400 MS remaining. DEFEND is
  currently weak — it costs tempo and denies you charge, with only one incoming attack to stop.
  That's expected at this stage, not a finished curve.

---

# GDD CONFLICT TO RESOLVE

`AVUI_COMBAT_GDD.md` **§6.3 rules exactly one action per unit per turn.** This prototype implements
multi-ability lines, which contradicts it. The line is the better fit for the game, so §6.3 needs
rewriting — and several things that hung off it (the cost-budget rule in §8.3, the encounter-length
targets in §11) are calibrated against one-action-per-turn and will need recalculating with line capacity
as the real constraint.
