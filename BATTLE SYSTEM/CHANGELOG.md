# BATTLE SYSTEM — changelog

Every pass, newest first. Split out of `README.md` so that answering "how do I run
this" no longer means loading 41 passes of history.

Read `ARCHITECTURE.md` first — it is the current-state document. This file is the
record of how it got that way.

---

## Pass 40 — five more enemies, and a tier you can see

There was **one** enemy in the game. There are six, and which one you meet depends on
which line you are riding.

| id | name | tier | emotion | MS | layers | line slots | where the map produces it |
|---|---|---|---|---|---|---|---|
| `enemy` | The Commuter | REGULAR | Anger | 250 | 3 | 3 | `L1:1.0` and `*:0.6` — every line |
| `enemy_anger_strong` | The Enforcer | **STRONG** | Anger | 330 | **4** | 3 | `L1:0.5` |
| `enemy_surprise` | The Interruption | REGULAR | Surprise | 240 | 3 | 3 | `L2:1.0` |
| `enemy_surprise_strong` | The Reversal | **STRONG** | Surprise | 320 | **4** | 3 | `L2:0.45` |
| `enemy_sadness_weak` | The Straggler | **WEAK** | Sadness | 150 | **2** | **2** | `L2:0.15` · `L5:0.15` |
| `enemy_joy_weak` | The Reveller | **WEAK** | Joy | 150 | **2** | **2** | `L2:0.15` |

Measured over 20,000 draws per line, against the sheet:

```
L1  Commuter 66.8%   Enforcer 33.2%
L2  Interruption 42.4%  Commuter 25.6%  Reversal 19.2%  Straggler 6.5%  Reveller 6.3%
L5  Commuter 80.1%   Straggler 19.9%
L3 / L4 / L6  Commuter 100%
```

**The `*` in `spawn_lines` is load-bearing.** Three lines have no units of their own yet,
and without a wildcard they would produce no enemies at all. The Commuter rides
everywhere, which is both the joke and the fallback. A named line beats the wildcard
rather than adding to it, so `L1:1.0|*:0.6` means *1.0 at home, 0.6 elsewhere*.

### Surprise had a line, a Loadout and no abilities

`LO_SURPRISE` was empty and the sheet said so. A Surprise enemy could only have fought
with borrowed emotions, so Surprise got the same three-piece kit Anger and Sadness have:
**Sucker Punch** (20/35), **Whiplash** (45/90, charges), and **Out of Nowhere**, which
applies a new status — **RATTLED**, a third of attacks going wide, softer and cheaper
than Anger's BLINDED. `missChance()` takes the highest of everything on a unit rather
than summing, so Rattled and Blinded together are just Blinded.

Joy had two abilities, both attacks, which made "mostly its own type" impossible for a
weak Joy enemy without handing it the hardest hit in the game. It gets **Good Vibes**,
the Bristle/Bile shape. `LO_JOY` and `LO_SURPRISE` are now both full.

**No enemy is single-typed and none is a grab-bag.** Of the abilities that have a type
at all: The Enforcer 4/5 Anger, The Reversal 3/5 Surprise, The Straggler 2/2 Sadness,
The Reveller 2/2 Joy. The Commuter stays the generalist it always was.

### A tier is a silhouette

Not a stat. Nothing reads `tier` as one — it picks the shape and narrows the dialogue.

- **WEAK** — concentric **triangles**, point up, and smaller.
- **REGULAR** — the concentric circles, unchanged.
- **STRONG** — concentric **seven-pointed stars**, and larger.

`paint()` already decided which band a pixel was in by asking how far it was from the
centre. A shape is a different answer to that question — `distance = hypot / f(angle)`,
where `f` is 1 where the shape reaches furthest — so every shape is inscribed in the
circle the rings were already tuned for, and the player's rings, which pass no shape at
all, are exactly the circles they have always been.

**Which broke every ring, and it took three tries to measure why.**

Bands are constant in shape space, so their thickness in PIXELS gets multiplied by `f`.
A true triangle has `f = 0.5` along its flats, which put the 1.8px inner rings under one
pixel there: they broke into dashes and then vanished. Three rules fix it, all in the
sheet — `enemyTriRound` (pull the triangle back toward a circle until its rings survive),
`enemyShapeFill` (thicker bands), `enemyShapeBreathe` (less breathing, so neighbouring
bands stop closing on each other).

`shared/tools/check_rings.js` is what settled it, and **its first two versions were both
wrong, in the same direction — they accused the plain circle enemies, which have looked
correct since the day they were drawn.** A ray from the centre rounds to integer pixels
and steps past bands that are drawn. Fixed angular sectors cannot work across ring sizes:
the innermost ring is twenty-five pixels round in total, so most of seventy-two
five-degree sectors are empty by geometry. What reads as a broken ring is a **gap** — so
it measures the widest angular gap between consecutive pixels of a band, in pixels of arc
at that band's own radius. An unbroken ring scores about 1.

```
enemy                   REGULAR/CIRCLE    [1.2 1.4 1.2 1.1 1.1 1.1]
enemy_anger_strong      STRONG/STAR       [1.4 1.8 1.8 1.6 1.6 1.4]
enemy_sadness_weak      WEAK/TRIANGLE     [1.3 1.7 1.3 1.3 1.3 1.5]
```

With the tuning off (`fill 1.0`, `breathe 1.0`) the same enemies score **5.7** and
**11.1**. It earns its place.

**`enemyShapeFill` has a ceiling as well as a floor.** At 2.0 every ring passed and the
sprite was wrong anyway: the gaps between bands dropped under a pixel and the rings
merged into one solid shape — a filled triangle rather than concentric ones. It sits at
1.6, which is the only value that survives both.

### On the ride, before you commit to anything

Tapping an enemy starts a fight you cannot leave, so what you are taking on is decided at
**spawn**, not at tap, and it is readable while it is still drifting past:

- **its own colour, not the line's.** Everything else on a ride is painted in the line's
  emotion, which is what makes a line feel like a place. An enemy is the one thing that
  is not *of* the place.
- **the same silhouette it will wear in the fight** — triangle, round, or star.
- **size**: 10 / 13 / 20 pixels for weak / regular / strong.

Verified on a real L2 ride: `enemy_surprise` (114,64,130) at 13, `enemy_surprise_strong`
at 20, and `enemy` (229,56,89) at 13 — three different colours and two different sizes on
one line. Both encounter paths carry the chosen unit through: tapping one, and a Hunter's
countdown expiring. The forced one landed on The Interruption, drew a circle, and painted
the backdrop, the name and the bubble in Surprise purple.

### Enemies that sound like themselves

A persona is picked at random from the rows matching the enemy's emotion — that is where
its name and all four of its lines come from. Without more than that, The Enforcer would
have spoken The Commuter's lines, because both are Anger, and an enemy twice the size
sounding exactly like the ordinary one throws away everything the sprite just said.

So `dialogue` has a `tier` column, and **blank means ANY tier, not "no tier"**: an enemy
uses the rows carrying its own tier, and falls back to the blank ones if there are none.
The thirty imported personas stay available to everyone. Twelve new ones, all four states
each — The Bailiff, The Riot Line and The Developer for strong Anger; The Verdict, The
Blackout and The Collapse for strong Surprise; The Sleepless, The Unread Message and The
Last One Out for weak Sadness; The Last Round, The Hen Party and The Busker for weak Joy.

### The AI had never once used a layer-grower

Building forty lines for each new enemy and listing which abilities ever appeared turned
up a nine-month-old hole: **`ADDLAYER` had no branch in `buildEnemyLine`.** The scoring is
damage per slot, a grown layer deals none, so Bristle and Bile were in pools and never
chosen — and it does not read as a bug, it reads as an enemy that happens to do the same
two things every round. The Reveller made it visible because `GEN_JOY` was half its typed
pool: **one distinct line, forty times out of forty.**

It gets a branch beside the debuff one, on `aiGrowChance` (0.45), gated on having a layer
slot free and preferring an emotion the player is **not** carrying — like does not break
like, so a layer the player can absorb buys nothing. After: The Reveller uses `GEN_JOY`,
The Enforcer uses `GEN_ANGER`, and The Reversal actually does the thing its design note
claimed it did.

### Things that were already broken

- **`stamp.py` was reading the wrong file.** The pass history moved to `CHANGELOG.md` and
  this went on reading `README.md`, which no longer has a single Pass heading — so the
  title screen's version quietly froze. A stamp that stops moving is worse than none.
- **Two `checks` formulas had rotted.** One counted "enabled abilities" against a
  hard-coded 10 when there were 15, and read the wrong column for `enabled` besides;
  another validated `units` column G for a blank pool, which stopped being `pool` the
  moment the sheet grew a column. Both replaced with structural checks that cannot go red
  just because the game grew.
- **Pipe lists were never validated at all.** A unit's pool, its loadouts, its
  spawn_lines, a Loadout's slots — a spreadsheet cannot look inside
  `"ATK_ANGER|HVY_ANGER"`, and those are the references most likely to be wrong because
  they are the ones typed by hand. A dangling id does not crash anything: the pool is
  built with `.filter(Boolean)`, so the enemy just fights with one fewer ability than it
  was designed with. **A balance change nobody made.** `build_workbook.py` now refuses to
  build on one, and checks that every persona can say all four things.

### `?enemy=<units row id>`

A look, not a fight. The title screen leads to the map and a fight only ever starts by
tapping something on a ride, which left no way to see a new enemy without riding until one
turned up. This loads the sprite, the backdrop and the persona for any units row, runs the
real opening, and stops there. Without the parameter nothing in that block runs.

**It hides the title screen; it does not remove it, and that distinction took two goes.**
`handoff.js` removes it, so this copied that — and `#title` turns out to be where a great
deal else lives. `#confrontBtn` and `#howtoBtn` are inside it, so main.js threw on the
next line and **stopped halfway through, silently**, with every statement below it never
running; the opening's own canvases are in there too, so `intro()` reached into null as
well. Both failures looked identical from outside: a black screen. `display:none` takes it
off the screen and out of the tab order and leaves everything where the rest of the file
expects it.

---

## Pass 39.3 — the critical beat

A critical is now a moment rather than a flicker. When one lands:

1. **CRITICAL holds for a full second** (`critHoldMs`).
2. The screen **washes once** in the colour of the attack that caused it.
3. The earned slot **flies out of the tag and into the attacker's line**, so where the
   reward came from is visible rather than inferred.
4. Only then does the next station fire — the whole beat is **awaited** by the attack.

Measured: **1945ms** end to end, tag on screen throughout, flash and flight both
observed, one slot granted, nothing left behind afterwards.

**Two things this needed.** The slot is granted the moment the crit lands, so it can be
seen arriving — which means the end-of-round sweep had to learn the difference between a
slot that has already had its line and one that has not (`critFresh`). Verified: granted
mid-line, the line grows 3 -> 4 for the build you actually use it in, then back to 3.

And the thing that flies is a **ghost**, not the real station. Re-rendering the track
mid-resolution would destroy the very station elements `resolveLine` is still holding a
reference to; the real slot appears at the next build.

### Verified
A battle to completion with the odds raised so the beat fired three times: line bounded,
shot invariant held, **zero duplicate tags**, no strays, no errors.

## Pass 39.2 — the mood line on desktop, and a duplicate tag

### It was invisible on desktop for the opposite reason
On a phone the mood line was pushed off the top by an overflowing column. On desktop it
was **drawn outside the frame**.

My fix for the first bug took the *widest* width anything reported, to guard against a
zero. But on desktop `window.innerWidth` is the whole browser window — ~1400px — while
the phone frame is 420. The canvas was built 1384px wide, and a box wider than its
container cannot be centred by `margin:auto`, so it left-aligned and the centred text
landed hundreds of pixels to the right, clipped away by `overflow:hidden`.

It now takes the **first source that reports anything** — screen, then frame, then window
— and is hard-clamped to `frameMaxW`. Verified at 1400x900: the canvas is 398px, sits
inside the 420px frame, and paints 1163 pixels across three lines.

### STUNNED fired twice
`breakLayer` threw the big colour-coded tag when the last layer broke, and `resolveLine`
threw a small white one when that unit's line was skipped — the same round, one event.
The small one is gone; the sound and the skipped line carry it.

**Audited the rest rather than assuming** — and the audit found a second one. Every
`bigTag` call was wrapped for a full battle, recording any two identical tags within a
second: **"SELF HARM" fired twice, 699ms apart.**

Those were two legitimate events — the enemy turning on itself, then the player — but a
centre-screen tag cannot say *whose* it is, so one round of mutual Sadness reads as one
announcement stuttering. Tags that belong to a fighter now appear **over that fighter**
(`unitTag()`), which is also how HEALED reads now. Re-audited: **zero duplicate pairs**.

A stun yields **exactly one** tag (`overload` class), and Overload's Self-Harm yields one.

## Pass 39.1 — build stamp, stronger distortion, a pixel mood line

### The title screen says what it is
Version and last-modified, in yellow at the foot of the title screen —
`v0.39 · 26 Aug 2026 00:03`.

Generated by **`tools/stamp.py`**, not hand-written, so it cannot go stale: it reports
the newest mtime across `src/`, `styles/` and the generated tables, and takes its version
from the highest `## Pass NN` in this file. Run it last, before packaging.

### The distortion actually distorts now
It was far too polite to survive a small bright phone screen. Peak skew went **6° → 18°**,
peak blur **1.5px → 5px**, and it now inverts and blows out on the peaks. The duration is
also driven from `RULES.statusFxMs` rather than a CSS default that could drift away from it.

### The mood line is genuinely pixelated
Not just un-antialiased text — it is **rasterised small onto a canvas and upscaled with
nearest-neighbour**, the same technique the rings, the gauges and the intro line use.
White, twice the size (10px → **20px displayed**, a clean 2× upscale), with a faint bloom.

**Two bugs worth naming.** It first rendered as a five-line stack overflowing the screen:
the width was measured from a single source, and in a hidden tab — or before the wrapper
is laid out — that reports **zero**, which wraps every word onto its own line. It now
takes the widest width anything reports and **redraws on resize**.

Then it vanished entirely on a real phone. It was rendering perfectly — *above the
viewport*. The title screen's content (a full-width square logo, blurb, two buttons) is
**745px tall on a 660px screen**, and because `.title` centres its content the overflow
pushed the top clean off. The build stamp survived only because it is absolutely
positioned to the viewport rather than to the column.

The title screen now **fits any viewport**: the logo is the element that gives way
(`flex:0 1 auto; max-height:44vh`, `object-fit:contain`), everything else holds its size.
Verified across eight phone geometries from **320x568 to 375x812** — mood line and
CONFRONT button fully visible in all of them.

## Pass 39 — the wave was drawn under the brackets

### The bar's wave poked past its own end caps
The wavy silhouette was drawn for **every** column of the bar, including the ones the
end caps occupy. A cap is a rounded rectangle, so its corner pixels are deliberately cut
away — and the wave, drawn underneath, showed through exactly there. It read as the
silhouette protruding past the bracket.

The living bar is now clipped to strictly **between** the two caps. The one exception is
charge that has spilled past the ceiling during an Overload, which still has to draw.

Verified by rendering the gauge offscreen and inspecting pixels: **both caps' cut corners
are empty**, **nothing lights beyond the right bracket**, and the clip is not too
aggressive — **726 pixels of bar body** still fill the span between the brackets, and an
overcharged bar still spills **476 pixels** past the ceiling.

### Names
`DEFEND` is **Block** and `RECHARGE` is back to **Recharge**.

### Verified
7-round battle, no errors, no strays, shot invariant held.

## Pass 38 — criticals, Overload as a status, and a legibility pass

### The charge rule is retired
Charging no longer buys the opponent a slot. It costs only time now. That freed the
temporary-slot machinery, which two new features needed — with different meanings, so a
bare count became a list of **kinds**:

```js
unit.extra = ["OVERLOAD", "OVERLOAD", "CRIT"]
```

**OVERLOAD** slots are forced on you, locked, and drawn in the **opponent's** stamina
colour (rose on your line, mint on theirs) with a thick dotted glowing ring — a corrupted
station should read as something done *to* you. **CRIT** slots are earned and last
exactly one line.

### Overload is a state you can read
It now **appends** its forced stations at the end of the line instead of scattering them
into random gaps, and they are all **one** ability — turning on yourself, or feeding the
opponent, never a mix.

It also became a **status tag**, on the shared scrolling ramp, pulsing hard, with its own
tooltip. **No number**, because unlike every other status it is not timed — it lasts
while your charge is over your stamina, and the tooltip says so.

That needed care: `tickStatuses()` decrements every entry it finds, so Overload is
**derived and never stored** in `unit.statuses` — it is merged in at render time.
Verified: it survives a tick, and forcing it twice does not accumulate slots.

### Criticals
5% by default, per-ability via `crit_chance`, and shiftable by statuses through
`crit_mult` — the same "sum across active statuses" shape `missChance()` already uses.
2× damage, a **CRITICAL** tag thrown near the impact, and **whoever lands it earns a slot**
for their next line.

Rolled in `run()` and never in `project()`: verified deterministic across 40 projections,
so the build preview can't promise a number the game contradicts. Verified live: 140
damage against 70 normal, tag shown, slot granted, and **gone the line after**.

### Pacing
A station's budget now depends on what it does — `statusStepMs` (2000) for anything
applying a status, `attackStepMs` (600) for everything else. Measured: a Fester station
took **2682ms**, plain attacks stayed ~846ms.

### Effects
- **Self-harm boomerangs**: the symbol commits nearly all the way to the opponent, hangs,
  then snaps home. My first attempt read as a drift, because on this layout your own body
  sits only ~45px short of the enemy — the keyframes showed `[0,-99,-60,-82]`, an
  ambiguous wobble. Now `[0,-121,-121,-48]`: a committed apex and a 73px return.
- **Healing** draws mint upward action lines.
- The backdrop's emotion gradient moved to the **top** of the screen.
- EC gradients scroll **twice as fast**.

### Legibility
**`font-weight` alone was never going to fix this.** Most mobile monospace fallbacks ship
no bold face, so raising the weight changes nothing and every label stays hairline-thin —
which is exactly what you were seeing. The fix that works on every device is
`-webkit-text-stroke` in `currentColor`, now at weight 900 with a 0.6px stroke.

Also: tooltip stat chips take the bar tags' pixel-rounded corners; all EC text is white;
the enemy's stamina tag is pale pink and yours is mint.

### Names
Anger → **Heated Punch**, Sadness → **Cold Shoulder**, Joy → **Manic Grin**,
Defend → **Brace**, Recharge → **Second Wind**, Rot → **Fester**. Rage, Grief, Mania,
Bile, Bristle and Blinded by Hate already read well and stayed.

### Verified
All eight checks from the plan. A 9-round battle with two Overloads firing, line length
bounded at `lineCap + maxExtraSlots`, `overUses 0`, no errors, no strays.

## Pass 37 — impact, buffs, statuses

### Abilities now have effects, and they are pluggable
`AbilityFx` resolves **ability id -> kind -> default**, so a bespoke effect for one
ability is a single call and nothing else moves:

```js
AbilityFx.define("HVY_JOY", { hit(ctx){ /* only Mania does this */ } });
```

Two hooks today — `hit` when an attack connects, `apply` when a status takes hold. They
are fire-and-forget: they never block the turn loop and never touch the ledger.

- **Attacks** throw **three shards** of the attack's own emotion around where they land,
  randomly placed, randomly sized, flashing — each emotion with **its own impact sound**
  (`emotions.sfx`, six new rows).
- **Buffs and debuffs** draw **action lines** over the body: streaking **up** for a lift,
  **down** for a drag, with a rising or falling sting.
- **Statuses** take a full second: the body **distorts**, a **great bloom** of the
  status's colour swells behind it, and the name flies from the body to the row its tag
  will occupy. Status tags now carry the **ability's** name — "BLINDED BY HATE" tells you
  what hit you; "BLINDED" only told you the colour.

### Bug: the player never saw their own damage numbers
`floatNum` placed MS just outside the target's box. The enemy's box is its 186px sprite,
so that reads well — but **the player's box is the full-width layer strip**, so every
player number spawned past the left or right edge of the phone and was never visible.
Bands are measured from the **screen** now. Verified across a battle: **18 player numbers,
22 enemy, 0 off-screen.**

Numbers also linger `fnumLingerMs` (300ms) longer, as asked.

### Also
- **Loadout buttons open the panel** to their page, not just page it.
- **The cue rotates** — 15 phrases in a new `prompts` sheet, redrawn each turn.
  "Your move." / "R U OK?" / "Let it out."
- **The player's line is thin and white again**, same 2px rule as the enemy's, glow kept.
- **The backdrop tint is much brighter**: it was using `bg_hex`, which is nearly black.
  It now blooms the emotion's *real* colour up from the floor at `backdropGlow` strength.

### Verified
8-round battle: 13 shard bursts, 16 action-line effects, statuses applying, 0 off-screen
numbers, `overUses 0`, no errors, no strays. Player lane confirmed white at 2px, matching
the enemy's exactly.

## Pass 36 — Loadouts

Pagination is now the loadout system. The three anonymous pages became the three
**Loadouts you carry into battle**, and the dots became three coloured emotion buttons.

### The system
A **Loadout** is one emotion's set of four ability slots. Six exist — one per emotion —
and the player carries three (`units.loadouts`). Slots are **positional**, so a blank
slot is a real, visible empty cell rather than a missing entry; that is why the sheet
uses four columns instead of one list.

| Loadout | Slots |
|---|---|
| Anger | Anger, Rage, Bristle, — |
| Sadness | Sadness, Grief, Self-Harm, — |
| Joy | Joy, Mania, —, — |
| Disgust | Bile, Rot, —, — |
| Surprise / Fear | empty, awaiting content |

`unit.pool` is **derived** now: always-on Actions plus the union of the equipped sets.
A unit with no loadouts — the enemy — keeps its flat `pool` column, so `buildEnemyLine`
is untouched and the AI carries no risk from this change.

### Hybrid-ready
`abilities.emotions` is a new list column: blank means "just my own emotion".
`abilityFitsLoadout()` lets a future ability belonging to several emotions sit in a
Loadout of **any** of them. Nothing is hybrid today; adding one is a row edit.

### Layout
Defend and Recharge moved **into** the panel, in the strip the page dots vacated. The
three Loadout buttons took their place below: fully coloured, gradient into a darker
shade of the same emotion, that emotion's glyph tiled large and faint behind and panning
diagonally, and all three undulating on a staggered float. The side triangles are gone —
three labelled buttons say "there is a page that way" better than an arrow did.

### Built for the equip screen that does not exist yet
`equipLoadout(unit, slot, id)` works today and is the single seam a future equip screen
will use. What makes it safe is a split: `buildPanel()` and `renderLoadoutBar()` are
markup only and re-callable, while every gesture listener lives in `wirePanelGestures()`,
which runs once. **Regression test:** a pointer probe counts 1 handler before and 1 after
two `equipLoadout()` calls — rebuilding cannot stack listeners.

### Two bugs caught while building
- **The buttons rendered colourless.** `patternURI()` returned `url("data:…")`, and that
  double quote — written into a style *attribute* — ended the attribute, invalidating the
  whole `background-image`. Percent-encoded data URIs need no quotes.
- **The Actions strip hung out of the panel.** `.abilscroll` still carried
  `height:calc(100% - 18px)`, reserving room for the dots that no longer exist. The panel
  is content-sized via `max-height` now, so adding or resizing a row can never clip it again.

### Verified
6 checks from the plan, all passing: 6 loadouts parsed and 3 equipped; 3 pages x 4 cells
with 4 empty slots carrying no `data-a` and refusing 20 clicks across a battle; each
button pages and marks itself; Actions still place from their new home; the re-entrancy
probe holds at 1; and a full battle to completion with `overUses 0`, Overload still
forcing stations, no errors, no strays. Plus the house rules: **zero non-`steps()` loops**
and every `.ramp` user still on one shared position.

## Pass 35 — the strike leaves from the middle

### The symbol was flying out of the wrong place
Two faults stacked. The station was told to slide to the centre and the ability fired
**40ms later**, while the slide takes 200 — so the symbol left from wherever the line
happened to be mid-travel. And `flyStrike` took its origin from the station's *rect*,
which is only correct once that slide has visually settled.

The loop now waits `lineTravelMs` for the station to actually arrive, flashes for
`lineFlashMs`, and only then strikes. And the launch point is taken from the **lane's
centre** rather than the station's rect — the same point by construction, but true even
if the transition is mid-flight.

Measured across a battle: **11 of 11 strikes launched at 0px from the lane centre.**

### Ability boxes
- The `×2` shorthand is reverted: the **charge tail is drawn as stations again**, capped
  at `chargeShownMax` (2) with tighter links so a long charge is no wider than a short one.
- **INFO is a letter `i`**, half again as large (20 → 30px).
- Boxes are **102 → 65px** tall with *nothing inside them changed* — the grid rows are
  content-sized now, so trimming the box padding actually shortens the box instead of the
  row just redistributing the space. The panel came down from 243 to 187px with it.

### Tooltips
No repeated ability name — the bubble already points at it. No shot count. Text is
**14px, exactly the size of the ability name**, and the bubble scaled down to suit
(padding 12→8px, max-width 88→76%). Hard black drop, no blur. The cost and payload chips
are now **the value tags from the bars** — same shape, same rounding, same wobble.

Descriptions lead with what a thing *is*: **Attack / Defence / Buff / Debuff / Status**,
then what else it does. "Attack. Cracks the outermost LAYER." rather than naming an
emotion the icon already shows.

### Verified
Centring maths exact 14/14, strike launch 0px 11/11, no errors, no strays.

> **Still not visually confirmable here:** this pane freezes CSS transitions, so the
> panel's height and the track's transform never leave their start values. I proved both
> by suppressing the transition and measuring (panel resolves to 243.594px = 30dvh,
> boxes to 65px) — the cascade is correct, but how the slide *reads* in motion is yours
> to judge.

## Pass 34 — two bugs I caused, and their fixes

### Tooltips fell to the bottom of the screen
**I deleted their CSS.** The Pass 33 cleanup spliced out everything between the old
`.ind` block and the OVERLOAD marker to remove the dead tag/ball styles — and the
tooltip rules lived inside that range. With no `.tip` rule the element was
`position:static`, so the coordinates JS computed were simply ignored and it flowed to
the end of the document.

The same splice also took **every status-tag rule** with it, which had not been noticed
yet — the status tags were rendering unstyled.

All of it is restored, rewritten to the new conventions: shared chip tokens, `steps()`
timing, and the viewport-anchored ramp.

### Stations were not executing in the middle
`centerStation()` computed the station's position as `st.offsetLeft` inside the track —
but `.lane` centres its track, so the track itself starts ~68px in. Every station was
off by exactly that much, and because the error was constant the line looked like it was
sliding without ever arriving.

The centre is now `track.offsetLeft + st.offsetLeft + st.offsetWidth/2`, shared by
`centerStation()` and `parkLine()` so they cannot disagree.

Verified by checking the maths directly at every station of a full battle: **error 0px,
10 of 10.**

### Verified
3-round battle: centring error 0px x10, DEPART visible and topmost 3/3, tooltips
correctly positioned and sized 3/3, 12 floating numbers, no errors, no strays.

> **What this environment cannot show me:** the test browser runs hidden, which freezes
> CSS transitions and animations — the track's *computed* transform stays at its parked
> value even when the correct one is set inline. So I verified the centring arithmetically
> rather than visually. The inline transform is provably the value that puts the station
> dead centre; whether the glide between stations reads well is something only you can see.

## Pass 33 — quality pass, and the DEPART bug

### The DEPART bug: an animation that never let go
The button was there the whole time — `display:block`, `opacity:1`, correct rect —
and invisible. `.lane-wrap` was carrying **`clip-path: inset(100% 0 0)`**, left behind
by the entrance animation, which ran with `fill:"both"`.

Two faults in one line. A filled animation holds its keyframe **for ever**, and a
clip-path on a container clips children positioned **outside** its box — which is
exactly where DEPART sits. Even the *finished* keyframe, `inset(0 0 0 0)`, would have
erased it.

Fixed at the root rather than patched: the entrance no longer animates `clip-path` at
all (it is also among the most expensive properties to animate) — it uses `transform`
and `opacity`, which composite on the GPU and leave nothing behind — and the animation
is cancelled on finish. DEPART also moved into a **zero-height slot** of its own, so no
ancestor can clip it and it cannot push the layout when it appears.

Verified across a battle: visible and topmost **5 times out of 5** (it was 1 of 5), and
**zero containers** left carrying a clip-path.

### One gradient, shared by everything
Every element that shows the emotion ramp now reveals **the same moving sheet**:
`background-attachment:fixed` anchors it to the viewport rather than to each element,
so a tag, a border and a number all show the same slice — as if they were masks cut out
of one sheet underneath.

It is also **tight**: one loop is `33.334vw`, measured at **125.003px on a 375px screen —
exactly three loops across**.

And it is driven by the **game clock**, not by per-element CSS animations. Those drifted
out of phase with each other (measured: two different positions on screen at once) and
cost one animation per element. It is now a single custom-property write per frame, and
all users measure identical.

### Everything ticks at 12 fps
Every looping CSS animation was converted from `ease-in-out`/`linear` to
`steps(duration / 83ms)` — **zero smooth loops remain**. A smooth loop beside a stepped
one reads as the wrong medium, and that included the intro, the enemy's hover, the floor
light and the title logo.

### One shape language
Every chip in the game — value tags, cost pills, status tags, tooltip stats, the INFO
button — now shares `--chipPad`, `--chipFont`, `--chipDrop`, `--chipInk`: same padding,
same ink, one hard pixel drop, no blur. **To make one stand out, change its background,
never its geometry.** The house rules are written at the top of the stylesheet.

### Dead code
`morphAll`, `flyDelta`, `tagStyle`, `crash` and `chevronSVG` are gone — all of them
belonged to systems replaced in earlier passes. Zero references remain.

### Architecture
`ARCHITECTURE.md` now opens with **"this is a game, not a page"** and the consequences:
one clock, simulation before presentation, content in the spreadsheet, effects
fire-and-forget, and a diegetic interface. Plus a table of where to add what.

### Verified
5-round battle: 26 floating numbers, DEPART 5/5, **0 shield intrusions**, **0 clip-path
leaks**, no errors, no strays, bars converged, clock alive.

## Pass 32 — floating numbers, one-way lines, and the shield bug for real

### Damage is a number thrown in the air now
The accumulate-into-a-tag-then-fly-it-to-the-bar system is **gone**. Damage and charge
apply **the instant they land**, and what you see is a bare number beside the fighter,
beat-'em-up style.

- **MS up the right**, **EC up the left**, so the two never queue for the same space
- `+XX` / `−XX`, no box, no background
- **mint** for you, **pale pink** for the enemy, **moving rainbow** for charge
- size scales with the hit as a fraction of that fighter's whole stamina bar
- rise + fade in (0.6s), ease to a stop (0.6s), fade out (0.4s); overlapping is fine

Verified across a battle: **13 MS numbers all on the right, 4 EC all on the left**, zero
on the wrong side, sizes spanning 20.5–38.9px across six distinct values.

### The shield bug, actually found this time
Last pass I moved the shields outside their lanes and measured them clear — **at rest**.
They still ended up inside, because the idle `shwave` animation lifts each shield 8px and
scales it 1.14, and for the enemy — whose shields hang *below* the lane — "up" means
"into it". The wave is now mirrored per side and the clearance covers travel plus scale.
Sampled across the whole cycle this time: **zero intrusions in a full battle**.

### The line only ever travels one way
`parkLine()` puts the whole track off-centre on the side it will travel **from** — left
for you, right for the enemy — then each station is centred in turn. One continuous
sweep instead of the track darting back and forth to whichever station is next.

At the end the line **runs out the far side** and resets with the transition suppressed.
Cutting straight back to zero was the jump you saw between the enemy's last ability and
the turn changing hands.

### DEPART
Bigger text, shorter, gradient border, floats, and **disappears the moment it is tapped**.
It is `position:absolute` against the lane now, so appearing no longer shoves the whole
interface down.

### Also
- Ability glyphs shrank (52→42px, charge 30→24px) to give the enemy back some sky.
- **RESISTED** appears over the enemy, just below its centre.

### Verified
5-round battle: 19 floating numbers, 1 resist, 2 stuns, 9 line-parks, **0 shield
intrusions**, no errors, no strays, bars converged.

> **One thing I could not confirm here:** the DEPART button reports fully visible
> (display, opacity, pointer-events, z-index, and a sane rect above the lane) and is
> functionally proven — it showed and was clicked five times, driving every round — but
> this test browser returns stale frames and froze animation timelines all session, so I
> could not get a trustworthy *visual* check of it. Worth an eyeball on device.

## Pass 31 — layers that resist, and a tighter build screen

### Layers: like does not break like
A hit whose emotion **matches the outermost layer no longer breaks it**. The layer
still absorbs the blow and the stamina still goes, but the queue does not move. It is
announced by a big **RESISTED** tag in that layer's colour, shaking sideways, over two
descending notes.

Breaking the **last** layer now **stuns** for a turn: that unit skips its line entirely
and regrows nothing. The counter ticks down at round end, *after* regrowth was already
skipped — order matters, or the stun would refund itself.

Verified in a live battle: 2 resists, 1 stun, and a skipped line, with the unit tests
confirming same-emotion leaves the layer standing while off-type still breaks it.

### Bug: shields were drawn inside the attack line
`.shieldrow` was pulled back with `margin:-10px`, which sat it on top of the lane
instead of beside it. They now sit above yours and below the enemy's, as intended.

### The build screen got its space back
- MS and EC tags left their sliding anchors and now sit **side by side** — above the
  enemy's bar, below yours. The bar container dropped from **106px to 62px**, and both
  bars stay visible with the panel open.
- The dead band between your layers and your line is gone: the cue, the status tags and
  DEPART **overlay the layer arc** instead of demanding their own band.
- **DEPART is its own button** again — big, white, glowing, centred above the line, and
  only present once you have placed something. The terminus arrow goes back to being
  purely a direction indicator.
- Defend and Recharge **appear only with the panel**, since that is when they are useful.

### Ability boxes
- A charged ability now draws **one charge station and a multiplier** (`×2`, `×3`)
  instead of two or three stations — the long ones were three times as wide for no
  extra information.
- **INFO became a magnifier chip** in the top-right corner, breathing bright and dim.

### The line looks tappable
Thicker ring, and the rainbow **scrolls** now (`border-image` cannot animate its
position, so the ring is a padded wrapper whose background moves and whose centre the
lane covers). It breathes a glow, and the cue triangle is larger and wobbles fast.

### Verified
3-round battle to completion, no errors, no strays, shot invariant held, every depart
through the new button.

## Pass 30 — no buttons, faster attacks, Actions

### The build interface lost its buttons
EMOTIONS and DEPART are gone. **The line does both jobs:**

- tap a **station** -> removes that ability
- tap the **terminus arrow** -> departs (it already points where the line will
  travel, so tapping it means "send it"). It pulses once there is something to send.
- tap **anywhere else on the line** -> opens Emotions

The line's border is a rainbow ring following the charge gradient, with a floating
**EMOTIONS ▼** cue above it that fades out while the panel is open.

> **My call, flagged:** you said both buttons disappear but did not say how departing
> works. I put it on the terminus arrow, since that arrow was being added anyway and
> already means "this way". Easy to move if you had something else in mind.

### Actions
Defend and Recharge are now **Actions**: always present, never paginated, in the strip
the buttons vacated. `abilities.action` is a column in the sheet, so which abilities
are actions stays content rather than code. The Emotions panel now holds the other 10
across 3 pages.

### Attacks take 0.6s
Each executed station is padded to a **deadline** rather than built from fixed sleeps —
whatever the ability spent on its own animations, the step tops up to the same total.
That keeps the rhythm even across abilities doing very different work.

Getting there meant trimming everything that runs inside an attack, since the internals
alone were over budget: `flyMs` 420->120, impact 365->130, layer break 500->68.

Measured across a battle: **median 608ms** (min 551), 5 of 7 samples within 80ms of
target. The occasional ~770ms outlier is most likely a measurement artifact — the test
pane is hidden, so WAAPI animations never resolve and `waitAnim` always falls through
to its fallback timer instead of the real duration.

### The line flashes before it runs
Three white frames on whichever line is about to execute, so the eye is already there
when the first station fires. Fired 8 times across a 4-round fight — both sides, every
round.

### Ability boxes and tooltips
The EC/DMG pills are gone from the boxes; an **INFO** tag took their place and the
numbers moved into the tooltip as a stat line. The tooltip is now a **speech bubble**
with a tail pointing down at whatever opened it, at **twice the type size**, bordered in
that ability's emotion colour. Blurbs were rewritten to a single terse line to suit it.

### The lines are centred, with a thick pixel arrow
Both lines sit centred in their bar. The terminus is drawn on the same 8x8 pixel grid
as the station glyphs — a CSS border triangle has a smooth diagonal, which is the wrong
medium here. It points **right** for you and **left** for the enemy, matching each
line's travel.

### Verified
4-round battle to completion, every depart through the terminus, no errors, no strays,
shot invariant held.

## Pass 29 — the theme was going through the bit-crusher

### What was wrong
The music was routed through the **sound-effects** chain: a 12-step bit-crusher and a
7.2 kHz lowpass. Those exist to make the synthesised blips crunchy. The theme has been
on that path since the beginning — and it did not matter, because the theme *was* a
MIDI played on square waves, and squares already sit at the quantiser's extremes, so
crushing them was very nearly a no-op.

Replacing it with a recorded mix (Pass 26) changed that completely, and I did not move
the routing.

Rendered offline through the real chain:

| path | distinct sample levels | HF energy |
|---|---|---|
| clean | **52,915** | 0.0000323 |
| through the crusher | **783** | 0.000182 — **5.6x**, pure aliasing |
| + the 7.2 kHz lowpass | 7,678 | 0.0000168 — **half** the clean HF |

783 levels is roughly 2-3 bits: at `musicVolume 0.3 x master 0.7` the mix only spans
about 2.5 of the quantiser's 12 steps. That is the crunch and the distortion. The
lowpass then removes everything above 7.2 kHz — hats, cymbals, high leads — which is
the "muted instruments".

### The fix
A second output bus. Recorded audio goes straight out; synthesised effects keep the
crusher.

```
sfxBus  -> master -> crusher -> lowpass -> destination
musicBus ---------------------> cleanBus -> destination
```

`cleanBus` carries the same 0.7 gain as `master`, so **the level is unchanged** —
effective music gain is 0.21 before and after. Verified on the live graph: with the
theme playing, 7.2-12 kHz now sits only 8.8 dB under the mid band, a natural rolloff
rather than a filter cliff.

I also ruled out mono-downmix cancellation as a cause — summing L+R loses only 0.48 dB,
so nothing in the track is phase-cancelling.

### Honest limit
This bug degraded the theme on **every** platform, not just Android. I cannot explain
from here why it was tolerable on desktop and obvious on the Pixel — most likely a
small speaker emphasises exactly the midrange where 2-bit quantisation noise sits — and
I cannot verify an Android-only factor without the device.

If it still sounds wrong on the phone, run **`audioReport()`** in a console there: it
reports sample rate, channel counts, latency, whether the theme decoded, and whether
the `<audio>` fallback is in play. That is the part that cannot be checked from a desktop.

## Pass 28 — the opening, actually fixed

Pass 27's opening was broken in three separate ways. All three shared one root cause:
**things were visible that should not have been yet.**

### The metro line showed through the mask
The wipe canvas and the rail are both children of `.intro`. A mask reveals what is
behind *its own element* — so the transparent hole showed the rail sitting underneath
it, not the background. The rail is now removed the instant the mask takes over.

### The entity showed through, then flashed away
`.stage` is deliberately exempt from the preintro blackout so the enemy can rise while
it is still on. Nothing else hid it, so the entity sat there fully visible behind the
curtain, got revealed early by the hole, and then appeared to vanish when its own
entrance restarted it from `opacity:0`. The stage is now explicitly hidden until the
rise.

### The interface flashed in, then moved
Removing `preintro` reveals every element at once. Each then animated in turn, so the
later ones sat fully visible for hundreds of milliseconds before their entrance ran.
Every element is now held hidden until its own animation begins, and `revealInterface`
lifts the blackout itself rather than having it lifted beforehand.

### Verified by timeline
| moment | rail | stage | ePanel | pPanel | btnrow |
|---|---|---|---|---|---|
| boot | block | 1.00 | 0 | 0 | 0 |
| wipe start | block | **0.00** | 0 | 0 | 0 |
| wipe mid | **none** | 0.00 | 0 | 0 | 0 |
| reveal start | gone | 1.00 | 0 | 0 | 0 |
| ePanel enters | gone | 1.00 | **0.00** | 0 | 0 |
| btnrow enters | gone | 1.00 | 1.00 | **1.00** | **0.00** |

Each element is still at zero when its own entrance begins. Full battle to completion
afterwards, no errors.

## Pass 27 — tooltips, the real wipe, and the interface drawing itself in

### Tooltips
**Long-press an ability**, **tap a status**. Both blurbs live in the spreadsheet
(`abilities.blurb`, `status_effects.blurb`) and carry two marks: `*text*` for emphasis
and `{TOKEN}` for a colour-coded keyword — `{ANGER}` in anger red, `{EC}` on the moving
rainbow, `{MS}` in stamina mint. An unknown token degrades to plain ink.

The long press cooperates with the page swipe: movement past the drag threshold cancels
it, and once the tooltip is open the click that follows is swallowed so the press does
not also place the ability. Verified: short tap places and opens nothing; long press
opens and places nothing. Anything else on screen closes it.

### Status tags moved and grew
Now **below the enemy's attack line** and **above yours**. Bigger (27px tall), with a
long hard **pure-black** double drop and a **breathing inner glow** in the status's own
colour. Tapping one explains it and says how many turns are left.

They also needed `z-index` — `.stage` paints at z-index 1 and was burying them.

### The wipe is an actual mask now
It was a black disc growing on a black field, which is exactly why it never read as
revealing anything. The wipe canvas is now the **curtain itself**: opaque black
everywhere, **transparent inside the circle**, so the battle background is revealed
through the hole. Its leading edge is a thick ring drawn at the same 1/6 scale as the
metro line, so the stroke is pixelated and heavy instead of a hairline.

Measured across the sweep: curtain 8562 -> 1120 px, transparent hole 0 -> 6916 px, ring
present in every frame.

### The interface draws itself in
The white flash is gone. Each element now arrives like a blade leaving its sheath — a
hard directional clip-wipe with a bright edge — **enemy first from the top, then yours
from below**, overlapping so the next starts before the last lands. Lower-pitched sound
for the enemy (`sheatheE`), higher for you (`sheatheP`). Verified: 3 enemy elements then
5 player ones, strictly in that order.

### Phone behaviour
Fullscreen and a **wake lock** are requested from the CONFRONT EMOTION tap — the one
gesture the platform gives us. Fullscreen is gated on a coarse pointer, so a desktop
browser is not yanked fullscreen by a prototype. Leaving the app **suspends the
AudioContext** rather than stopping the music, so the theme resumes exactly where it
left off; stopping and restarting would lose the opening/loop handoff.

### Verified
Full battle to completion, no errors, no strays, shot invariant held.

## Pass 26 — the real theme, and a title screen

### The theme is two files now, joined seamlessly
`audio/theme-opening.wav` (14.75s) plays once; `audio/theme-loop.wav` (73.72s) loops
for ever. Both are decoded to PCM up front and the loop is **scheduled on the audio
clock** at exactly `t0 + opening.duration` — an `ended` handler or a timer would leave
an audible seam. Measured: opening starts at 11.648s, loop at 26.40125s, **gap of
exactly 0**.

`fetch` is blocked on `file://`, so there is an `<audio>`-element fallback for opening
the page straight off disk. That one cannot be gapless — the trade is stated rather
than hidden. The old MIDI theme is gone (`music.js` deleted).

### Title screen
The logo sits in a **screen-wide square frame**, carrying two effects:

- a **colour-dodged glow** drifting through all six emotion hexes and breathing in
  opacity (0.14 -> 0.40). The frame is `isolation: isolate` — without it the dodge
  would blend against the black page instead of the logo, and dodge against black is
  a no-op, so the effect would silently not exist.
- a permanent **faint swim** from an SVG turbulence + displacement filter.

Below it, the blurb. Above it, **Barcelona's current moment**: "Barcelona, Monday, too
late to be anything but honest."

The 28 phrases live in a new **`moments` sheet** — banded by Barcelona local hour, with
weekday-specific lines (Friday night: *a night to finally be free*) that outrank the
everyday ones by priority. Verified: **no uncovered hour** across all 7x24 combinations.

**On "get it from an API":** the clock is `Intl.DateTimeFormat` with
`timeZone: "Europe/Madrid"`, not a network time service. It reads Barcelona's true
local time — through DST, from the browser's own IANA database — for a player in any
timezone, costs nothing, and still works off disk. A remote clock would be one more
thing to fail and no more correct. `barcelonaNow()` is the single swap point if you
want a networked source.

### Two details
- **The intro line is pixelated.** It was DOM boxes with `border-radius` and
  `box-shadow` — smooth, anti-aliased, the wrong medium next to the rings and gauges.
  It is now rasterised by hand into a 533x16 canvas (`ctx.arc` would have
  anti-aliased the rings straight back). Verified: **only two luminance values, 0 and
  255, zero anti-aliased pixels**, upscaled by exactly 6.
- **The entity scales from its own centre.** The entrance ran on `#stage`, which is
  `flex:1` and far taller than the sprite, so it pivoted about the stage's centre and
  read as growing out of its bottom-left corner. It now runs on `.enemyholder`, whose
  box *is* the sprite's box — confirmed `transform-origin: 93px 93px` on a 186x186 box.

### Note on size
The WAVs are 15MB and I left them untouched rather than quietly re-encoding your
audio. That is most of the package. Say the word and I will convert them.

## Pass 25 — statuses, grown layers, and the clock

### The clock: measured, then fixed
The animation was skippy because `setInterval(tick, 83)` **drifts**. Measured over a
battle: gaps averaged **115ms and spiked to 334ms** against a nominal 83ms, while
`tick()` itself only cost **1.1ms**. The work was never the problem; the scheduling was.

The clock is now a fixed step driven by `requestAnimationFrame`, so it lands on real
compositor frames, with the accumulator clamped to one step so a stall cannot spiral
into catch-up ticks.

**A regression I caught doing this:** rAF is *suspended outright* on a hidden tab, not
throttled — my first version froze the game completely when the tab lost focus. There
is now a watchdog timer that steps the clock whenever rAF has gone quiet, so a hidden
tab keeps simulating (at the browser's throttled timer rate) instead of stopping dead.

Also: a **closed Emotions panel was still running 19 animations** every frame — 8
floating depictions and 7 rainbow pills nobody could see. They are paused while it is
closed, measured at 37 running -> 18.

### New abilities
| Ability | Emotion | What it does |
|---|---|---|
| **Bile** | Disgust | Grows an extra Disgust layer |
| **Bristle** | Anger | Grows an extra Anger layer |
| **Rot** | Disgust | For 2 turns the target cannot regrow **2** of its broken layers |
| **Self-Harm** | Sadness | For 2 turns the target turns one of its **own attacks on itself** each round |
| **Blinded by Hate** | Anger | *(enemy)* The target **misses half** its attacks for 2 turns |

**Grown layers are temporary**: `breakLayer` never files them for regrowth, so once
broken they are gone for good.

Statuses live in the `status_effects` sheet — `block_regen`, `miss_chance`, `self_hits`
— and every reader sums across whatever is active, so adding a status is a row plus one
reader. Active statuses show as **small pixel tags** with the applying ability's symbol
and the rounds left, under the enemy's gauge and over yours.

### The AI had to be taught
`buildEnemyLine` scores abilities on **damage per slot**, so a DEBUFF scores zero and
would never be picked — Blinded by Hate would have sat in the enemy's pool unused. It
now gets an explicit branch, gated on `aiDebuffChance` and on the target not already
carrying that status.

### Verified
Temp layers: breaking a grown layer files nothing, and it does not come back. Rot: 3
broken layers, only 1 regrew while 2 were held, still held the next round, all 3 back
on expiry. Self-Harm: enemy 250 -> 215 from its own attack. Blinded: 0.5 when applied,
0 when clean, **sampled 0.505 over 4000 trials**. Full battle to completion, no errors,
shot invariant held.

**Not observed in play:** the miss never actually fired during a battle run, because the
enemy applies Blinded late and the scripted player was rarely attacking while carrying
it. The roll itself is proven by the 4000-trial test, but it has not yet been seen
mid-fight.

## Pass 24 — the tap bug, and a pass on the look

### Bug: tapping an ability did nothing
**I introduced this in Pass 22 and my own test missed it.** The swipe handler called
`setPointerCapture` on *pointerdown*, and capturing retargets the `click` that follows
to the capturing element — so the click never reached the `.abrow` underneath and no
ability could be added to the line.

My Pass 22 test called `row.click()` directly, which bypasses the pointer path
entirely and therefore could never have caught it. Capture is now taken only once the
gesture is genuinely a **drag**, and released on pointerup; the fix is verified by
asserting `hasPointerCapture()` is false after a plain tap, which is the actual failure
condition rather than a proxy for it.

### The charge bar now has a bar inside it
The colour-dodge overlay is gone — it washed the whole gauge out. In its place, the
renderer draws a **second charge bar inside the first**: same wave, same gradient,
**half the thickness**, colour-dodged over the outer one so the core of the fill blooms.
`ecInnerFrac` and `ecInnerAmt` are rules, and `ecInnerAmt` is deliberately below 1 —
dodging at full strength blows the hue out to white.

### Tags
Smaller to start (26px -> 18px, growth unchanged), and they **float much further and
faster** (±16px at 1.05s, was ±6px at 2.6s). The ball of light they morph into is **3x
larger** (16px -> 48px, measured at 48 in play).

**MS tags now carry the bars' own colours** — flat `--mint` for you, flat `--rose` for
the enemy, with the same drop-shadow bloom the gauges use. **EC tags are pointy**, a
rectangle ending in sideways triangles, with white text.

### Ability boxes
Each box is **bordered in its own ability's colour**, and the depiction **floats up and
down** on a per-ability offset so the four do not bob in lockstep. Icons, names and
pills are all larger and the box packs them evenly, so the wasted vertical space is
gone. Shot dots are **twice the size**.

Defend and Recharge no longer borrow **FEAR's grey** — typeless abilities take the
stamina mint in the panel instead, via `abAccent()`, so they stop reading as an emotion
they are not.

### Verified
Full battle to completion, no errors: taps place, swipe-clicks stay swallowed, the shot
invariant held, tags capped at four, ball measured at 48px.

## Pass 23 — shots, whole-box cooldowns, a three-slot line

### Abilities have shots, and shots are what run out
Every ability now carries a **`uses`** column: how many times it can be added to the
line. Weak abilities get **3**, the charged heavies get **2**. Shots are **not
refilled each turn** — whatever you do not spend is still there next turn.

**Emptying the pool is what starts the cooldown**, and finishing the cooldown is what
refills it. Cooldown is no longer stamped every time you use something. Pulling an
ability back off the line returns its shot immediately, because `usesLeft` counts what
is currently *on* the line rather than tracking placements separately.

Remaining shots are **tiny dots down the left edge of each box**, in the ability's own
emotion colour; spent ones go grey.

### Cooldown takes the whole box
The `COOLDOWN 2` caption is gone. A cooling ability is **blacked out entirely** and the
box shows nothing but the **number of turns left**, large, at low opacity, tinted with
that ability's emotion.

### The line is three slots
Both lines drop from six to **three permanent slots**, with up to **six temporary
ones** on top. These are now **per-unit** (`line_cap`, `max_bonus_slots` on the units
row), so the two sides can be tuned apart; the old global `RULES` values survive only
as the fallback when a row leaves them blank.

### Verified
Placement stops at zero shots and the fourth click is refused; removing from the line
hands the shot straight back; a partly-spent pool carries into the next turn without
cooling; exhausting it starts the cooldown and serving that cooldown refills to full.
Across a whole battle the invariant held — **no ability ever appeared on a line more
times than it had shots** — with two cooldown cycles observed, lines reaching 3+2, and
no errors.

### Balance note
With only three slots, spending three shots of one ability costs your **entire line**,
so cooldowns are now rare — I saw two in a five-round fight. Shots mostly act as a
slow drain rather than a per-turn limit. If you want cooldowns to bite, either lower
`uses` or accept that the three-slot line is already the real constraint. This was
also the first run the scripted player **won** (LINE CLEAR, round 5); the shorter line
appears to slow the enemy more than the player, since the enemy's extra slots only
arrive when the player charges.

## Pass 22 — mobile for real: paged panel, temporary slots, one tag per bar

### The Emotions panel is paged, not scrolled
Four abilities to a page in a 2x2 grid. Position is shown by **dots** (the one you
are on simply grows); the **triangles** on either side are only indicators that a
page exists that way. No labels, no words.

Paging is a **swipe**, built on Pointer Events so one code path serves a finger and
a mouse alike — which is what keeps a phone-only game playable in a desktop browser.
The pages follow the drag, snap back if you do not clear `swipeMinPx`, and a tap that
turned into a swipe is swallowed rather than placing an ability.

### Charging no longer interrupts — it hands the opponent room
The old rule fired the opponent's next station out of turn whenever you held on a
charge segment. It read as chaos: you were punished by an event you could not see
coming. **Every charge segment now grants the OPPONENT one temporary slot on their
line next turn**, capped at `maxBonusSlots`. Same shape of cost — charging gives the
other side more room — but it is visible before it matters.

Temporary slots are drawn **dashed and slowly rotating**, on either line, filled or
empty. They are always the tail of the line, so "is this slot temporary" is just
`i >= lineCap`, and they last exactly one turn because the grant is recomputed from
scratch each round rather than counted down.

### One MS tag and one EC tag per fighter
Five hits used to post five pills and the eye had nowhere to rest. Now each fighter
has at most **one stamina tag and one charge tag**, and every hit **folds into the
total already standing** — `-18` becomes `-43` becomes `-116`, with a kick each time.

They are twice the size, far bolder, and **the more a tag holds the bigger it grows
and the harder and faster it breathes** — both scaled against that fighter's own max
stamina, so the same hit reads as more dangerous on a frailer opponent. Scale is
clamped to the screen width, since a tag holding a whole stamina bar would otherwise
be wider than the phone.

**Damage numbers and matchup labels are gone** (`-35`, `RESONANT`, `OFF-TYPE`...).
The accumulating tags carry that now, and the matchup still speaks through its sound.
Event tags stay: BLOCKED, SHIELD UP, SELF HARM, FED THE ENEMY, OVERLOAD, LINE INVADED.

### A centred inner glow on the charge
Colour-dodge, off-white, 35%. It is centred on the **charge fill** rather than the
gauge, so it tracks the fill as it grows instead of washing the whole bar out — the
first attempt dodged the entire bar to near-white and lost the rainbow underneath.

### Verified
Full battle to completion, no errors: swipe paging both directions and refusing to
run past either end, taps still placing while swipe-clicks are swallowed, charge
grants confirmed (2 segments each side -> both lines 6 -> 8, four dashed stations
drawn), tags never exceeding four on screen (two per fighter), and scale clamped to
258px of a 375px screen at a full stamina bar's worth.

## Pass 21 — indicators scatter, bars breathe

### The tags float around the fighter, then converge
Every hit posts its pill at its own spot **around the enemy or over your own layer
strip**, drifting up and down on its own timing. When the line ends they **all morph
into balls of light at once**, then stream into the bar one at a time.

Placement is stratified rather than random — pills step across the field by the
golden angle and cycle through four vertical lanes. Independent random draws clump;
this doesn't. Verified with five simultaneous deltas: **zero overlapping pairs**.

### Bars take a full second, and the empty stretch stops glowing
Each landing **tweens the bar over one second** (`barTweenMs`) at the 12 fps clock
instead of snapping. The next ball launches `ballFlyMs` *before* that tween ends, so
a bar change still reads as a full second without the flights stacking on top —
five deltas settle in **6.3 s** rather than **10.0 s**.

The unlit stretch of the bar is now drawn to a **second canvas with no filter**, so
the mint/rose glow belongs only to the living wavy part. OVERLOAD's slow motion and
tag now hold for **2 s** (`overloadHoldMs`).

### The charge gradient scrolls, seamlessly
The six emotion colours are treated as a **ring, not a line** — after Fear the ramp
wraps back into Anger, so it can scroll for ever with no seam. That hard grey→red
edge is gone; the three CSS gradients that show the ramp are closed the same way.

### ⚠ Bug found while testing this
The indicators bunched into a small patch *below* the enemy instead of spreading
over it. Cause: placement used `getBoundingClientRect()`, which **includes
transforms** — and the enemy sprite is permanently mid-transform (entrance scale
plus the idle float). It was scattering pills across a 55×31 transient box rather
than the real 186×186 one. Placement now walks `offsetLeft`/`offsetTop`, which
ignore transforms. The ball's flight target had the same latent bug (the gauge
shakes when hit) and was fixed with it.

### Pacing note
Settlement is now ~**1.27 s per hit**, down from ~2.0 s. That is the honest cost of
"one second each" — a five-hit line runs 6.3 s. If it still drags in play,
`barTweenMs` is the dial, and it's in the sheet.

## Pass 20 — hits land one at a time

### The enemy's bar is pale warm pink
`--rose #ffc2cd` against the player's `--mint #b0ffe1` — stroke, end caps, arcs and
the canvas glow all follow, so the two bars are never confused at a glance.

### Damage no longer moves the bar mid-line
The bar now renders `shownMs` / `shownEc`, which **lag** the true ledger. During a
line, each hit changes the ledger immediately — so the rules, the death check and
the layer logic all stay exactly as correct as before — but only posts an
**indicator pill** on screen. The bars hold still.

Between the two lines (and again before the next round) `settle()` walks the queue:
each pill **morphs into a ball of light**, arcs across in a curve, and the bar only
moves when it lands — together with the shake, the flash, and a burst of **crash
particles**. Multicolour for charge, mint for the player's stamina, rose for the
enemy's.

Deferring only the *presentation* rather than the simulation is what keeps this
safe: nothing about resolution order, EXPOSED, cooldowns or the charge interrupt
changed. Death settles the queue first, so the bar reaches zero before the clash.

### OVERLOAD is now an event
The moment charge passes the ceiling: everything drops to 3 fps, the screen shakes,
and a large **OVERLOAD!** tag hits. For as long as it lasts, that unit's panel
border **strobes through the six emotion colours**. It clears when charge falls back
under the ceiling, and at the end of the fight.

### ⚠ Bug found while testing this
Overcharge was **invisible on the bar**. The destroyed-capacity branch ran before
the overflow band could draw, so charge spilled past the ceiling into a region that
had already been painted dead. It now renders as a hot orange band past the ceiling
cap, capped by the crescent.

### Pacing note
Settlement costs roughly **490 ms per hit** (`ballFlyMs` 330 + `settleStepMs` 70 +
the morph). A busy round with a dozen deltas adds ~6 s. I already cut this from
820 ms once; both numbers are rules in the sheet if you want it faster still.

## Pass 19 — the bar is drawn, not stacked

### Official emotion colours, project-wide
Taken from `sources/Bars_Reference_001.svg`, which also fixes the gradient order —
the reference puts the six at even 20% stops:

| | | | | | |
|---|---|---|---|---|---|
| ANGER `#e53859` | SURPRISE `#724082` | DISGUST `#56a36a` | JOY `#fcc336` | SADNESS `#3d66c1` | FEAR `#929fa5` |

Set once in `tools/build_workbook.py` → workbook → `data.js`, and once in the CSS
`:root`. Everything downstream — stations, rings, bubbles, cards, particles, backdrop
tints — reads through `emoHex()`, so it all followed. Audited: no placeholder hex
survives anywhere in `src`, `styles`, `tools` or `data.js`.

### The bar is now a pixel canvas
It was a stack of `<div>`s with a squiggle image laid *over* it. Your mockup needs the
bar's **actual silhouette** to undulate, which divs cannot do. `src/gauge.js` draws it
per-pixel on a 134×22 canvas upscaled ×2.6 with `image-rendering: pixelated` — the same
technique `src/rings.js` already uses for the layer rings, so pixelation is inherent
rather than a filter.

Ported from the reference SVG:
- **Scalloped silhouette** — the reference chains alternating bezier arcs; a half-period
  sine reads identically and costs nothing. Mirrored top and bottom, so the bar pinches
  and bulges.
- **The charge fill's own wave** — much longer and shallower than the silhouette's.
- **Arc texture** — big semicircles (radius 12.6, spacing 3.1) struck from centres
  marching along the bar, so only a shallow slice of each shows. In the reference they
  run the full length at 11% color-dodge; they only *read* against the unlit stretch,
  which is what you asked for, so that is where they are drawn.
- **The white crescent** is the rounded end-cap of the charge capsule.
- **Mint end caps** at zero and at the stamina ceiling, replacing the chevrons.
- **Destroyed capacity** as the reference's plum-rimmed box.

Every constant — canvas size, wave amplitudes and periods, band fraction, arc spacing
and radius, cap size — is a rule in the spreadsheet.

### Deviations from the reference, on purpose
- **The rainbow stays fixed to the bar and is revealed by the charge**, rather than being
  squeezed into the filled portion as the static mockup shows. That was your earlier
  explicit instruction ("gradient always screen wide, only visible in the charged part"),
  and a still image cannot distinguish the two.
- **The charge fill is ~0.82 of the bar interior**, per the reference — superseding the
  "one third as thick" from last pass. Say the word if you want the thinner band back;
  it is one rule (`ecBandFrac`).
- **Caps are ~1.8× the bar height**, not the reference's ~2.5×, which would have cost
  another ~30px of screen per bar.

### ⚠ Bug caught during the rewrite
Driving the bar from the 12 fps tick meant calling `renderStats()` there — but `rings.js`
ticks **once at load, before `view.js` is parsed**. That threw, `setFps(12)` never ran,
and the whole animation loop died: rings blank, nothing moved. Fixed by splitting the
canvas repaint (`redrawGauges()`, guarded) from the DOM work.

## Pass 18 — charge band, wave bracket

- **Emotional Charge is now a slim band, one third the bar's height, centred
  inside Mental Stamina.** The two quantities no longer read as the same object:
  MS is the container, EC is the thing riding inside it. The spend and incoming-
  charge previews ride the same band; the destroyed-capacity hatching and the
  unlit capacity still fill the full height, because those are stamina.
- **The white MS bracket is a wave** — a tiled pixel squiggle top and bottom,
  drifting slowly in opposite directions, in the spirit of Android's media
  scrubber but stepped so it stays in the same visual language as everything
  else. Generated in `src/art.js` like the warning glyph, exposed as `--wavepat`.

### ⚠ Tooling — stale modules were silently ignored
Chasing why the wave would not appear turned up something worse than the wave:
the browser was serving a **cached `src/art.js` from before the edit** (3,332
bytes against the server's 4,059). The code was correct and simply never ran.
Now that behaviour is split across a dozen files this is a trap that will bite
repeatedly, and `Cache-Control: no-store` does not fix it — that governs
responses the browser is *about* to make, while an entry already cached under
older headers is still reused.

`tools/serve.py` is the fix: a dev server that sends no-store **and rewrites
`index.html` on the fly so every local asset URL carries its own modification
time**. A changing URL cannot be served from cache. Files on disk are untouched,
so nothing ships with query strings in it.

```bash
python3 tools/serve.py        # http://localhost:8177
```

## Pass 17 — cooldowns, shifting layers, charge interrupts

### The emotion set changed
The colours you asked for (red, purple, green, yellow, blue, light-grey Fear) are
the **dialogue sheet's** six, not the ones the game was running. So the set is now
**Anger · Disgust · Sadness · Fear · Joy · Surprise**, replacing Apathy, Nostalgia
and Calm. This settles the open question the GDD flags in §7.3 — and it makes all
**120 dialogue lines reachable**; 60 of them previously belonged to emotions no
enemy could have.

### Cooldowns
`cooldown` is live in the abilities sheet, set to **1 turn on everything a player
chooses** (0 on the Overload-forced ones, which you do not choose). Using an
ability stamps `cooldown + 1` and every stamp ticks down once at round end, so a
cooldown of 1 means *not next turn, yes the turn after*. Cards grey out and show
`COOLDOWN n`. The enemy AI respects its own cooldowns.

### Layers re-shuffle every round
Both sides' layer queues are re-ordered at the start of each round, so the same
opening never works twice — the profitable emotion moves.

### Charging hands the opponent a turn
**My reading of the rule, since the lines resolve one after the other:** while a
unit holds on a charge segment, the *opponent* acts out of turn — their next
unspent station fires immediately. If that station is itself a charge segment,
their charge advances by one instead. Charging is now a real gamble rather than
just a delay. Verified: 4 interrupts in one automated battle.

This is why each unit carries a `cursor` — both lines are now consumed across the
whole round rather than strictly one then the other.

### The enemy charges too
It has all three heavy abilities, and `aiChargeBias` (0.55) makes it prefer a
charged one when it can afford it — it opened one test battle with two heavies
filling all six slots.

### Interface
- **Warm dark grey neutrals.** The interface no longer competes with the palette:
  colour is reserved for the six emotions, with `--muted` for secondary text and
  `--ok` for shields — deliberately *not* an emotion colour, since light grey now
  means Fear.
- **The EMOTIONS panel is a 2-column grid** of cards with much larger symbols and
  charge segments.
- **Shields ride the attack lines** — the player's sitting on top of theirs, the
  enemy's just under theirs — large, glowing, rolling through a wave.
- EC and DMG pills got pixel-rounded corners.

## Toolchain

| Command | What it does |
|---|---|
| `python3 tools/serve.py` | local dev server on :8177 — **use this, not `http.server`** |
| `python3 tools/build_data.py <csv-folder>` | spreadsheet CSV export → `data.js` |
| `python3 tools/build_music.py "sources/Theme Song 8_bit.mid"` | `.mid` → `music.js` |
| `python3 tools/build_workbook.py` | rebuilds `config/avui-config.xlsx` **structure** — run only when adding a sheet or column; it overwrites balancing done in Sheets |

Read **`ARCHITECTURE.md`** before adding anything.

## Pass 16 — quality pass: structure for growth

**See `ARCHITECTURE.md`** — where things live and where a new thing goes.

### The file was 1,514 lines. Now it is markup.
`index.html` held markup, 400 lines of CSS and 1,000 lines of JavaScript. It is
now markup plus a documented load order. Behaviour moved to fourteen files in
`src/`, styles to `styles/game.css`. The split was done mechanically and verified
byte-identical before anything was changed, so the move carried no behaviour risk
on its own.

### Ability kinds are a registry, not an if-chain
`applyAbility` was a chain of `if(ab.kind==="…")` with `DAMAGE` as the silent
fallthrough — a typo'd kind became an attack. It is now one line that dispatches
into `src/kinds.js`. Adding a kind is one `Kinds.define()` and nothing in
`battle.js` changes.

### ⚠ Bug the registry exposed: projections ignored most kinds
`simulate()` — which drives **the build-phase preview and the enemy AI** — began
with `if(ab.kind!=="DAMAGE") continue;`. So `SHIELD`, `CHARGE`, `SELFHARM` and
`FEED` were invisible to both: queueing a Recharge showed no charge gain on your
bar, an Overload-forced Feed showed no heal on theirs, and the AI valued all of
them at zero. Every kind now declares its own `project()` beside its `run()`, so
a new kind is correct in previews **by construction**. The projection also covers
*both* sides now, so abilities acting on you preview on your own bar.

### Hooks for mechanics that cut across the turn loop
`src/hooks.js` — statuses, passives and synergies can attach to `round:start`,
`damage:dealt`, `layer:broken`, `unit:defeated` and six more instead of editing
the loop. Verified firing in a real battle: 23 `station:fire`, 13 `damage:dealt`,
10 `layer:broken`, 1 `unit:defeated`.

### CSS cleaned
Later passes had appended overrides rather than editing rules in place. Removed
two dead rules — including a whole chevron-tiling background that a later
`content:none` had killed, along with the `--chevpat` generator still building it
every load — folded three split rules together, and dropped a duplicate keyframe.
Cascade order is otherwise untouched, so nothing moved visually.

## Pass 15 — audio mix, and two real bugs

### Audio
- **HOW TO PLAY is silent.** The theme used to start there because a fallback listener began playback
  on the *first pointerdown anywhere*, and that button was often the first thing tapped. Only
  CONFRONT EMOTION starts it now.
- **The theme fades out over 900 ms when the battle ends** (`musicFadeMs`), and the scheduler stops
  with it. Measured ramp: 0.5 → 0.12 → 0.03 → 0.0001.
- **Sound effects and music are on separate buses** — `sfxVolume` (1.05) against `musicVolume`
  (0.30), so effects sit well above the theme instead of under it. Both are in the rules sheet.
- **The tap is much louder and higher** (gain 0.20 → 0.46, 980→1460 Hz), which cuts through the mix
  far better than the old low blip. Remove got the same treatment.
- **The audio graph is built while the title screen is up** — context, buses, crusher curve and
  noise buffer — so CONFRONT EMOTION only resumes it. Measured **2.7 ms** from tap to first notes
  scheduled, with a 60 ms lead-in.

### ⚠ Bug — a backgrounded tab froze the opening forever
The opening sequence awaited `animation.finished`. A browser throttles animations in a hidden tab,
so if the player switched away during the intro the promise never resolved, the sequence stalled at
whatever step it had reached, and **the game never started** — no error, no recovery. Every awaited
animation now races a timer (`waitAnim`), so the sequence always advances. Verified: the whole
battle now runs to completion with `document.hidden === true`.

### ⚠ Bug — a class-name collision turned a tag into a full-screen overlay
The overcharged EC tag was given the class `over`, which is also the game-over overlay's class. The
generic `.over` rule (`position:absolute; inset:0; z-index:40`) matched the tag too, so going
overcharged would stretch it across the whole screen. Renamed to `overcharged`.

## Pass 14 — labelled tags

- **Tags name their units**: `280 MS` on the white plate, `210 EC` on the charge plate.
- **The EC tag is rainbow**, drifting on the same 7-second cycle as the charge fill and the cost
  pills, so charge reads as one colour language wherever it appears. Overcharge no longer swaps the
  plate to red — it keeps the rainbow and gains a red outline and glow, so the identity survives the
  warning.
- **The bar fill is 1.5× thicker** (19px → 28px). The white span strokes, the chevrons and the edge
  filament all keep their previous weight.

## Pass 13 — reading the bar

- **A thick white stroke now runs along the bar itself between the two chevrons**, top and bottom,
  bracketing the stretch of Mental Stamina still standing. *(Pass 07 put the white rim on the
  chevrons' inner faces instead — a misreading of the same request. Both are now present, and the
  span stroke is the one that actually communicates it.)*
- **A hot yellow filament marks the leading edge of the charge**, so the boundary between charge and
  unlit capacity is unmistakable.
- **Unlit capacity is roughly twice as bright** on both bars — teal for you, red for the enemy.
- The gauge grew from 16px to 19px. A 3px stroke top and bottom plus its glow was eating most of a
  16px bar, leaving almost none of the fill it was supposed to be bracketing.

## Pass 12 — Overload bites, and the lines breathe

### Overload finally has consequences
Charge above your ceiling and, at the start of the round, **random slots on your line are taken over
by things you did not choose**:
- **Self Harm** — 25 MS off your own stamina.
- **Feed** — heals your opponent for 30.

They are **locked**: tapping one refuses instead of removing it. The number forced in scales with how
far over you are (`overloadSlotPer`, one more slot per 25% of max MS of overflow), and is capped so
at least one slot always stays yours. The rules are symmetric — **the enemy overloads too**.

This required the line to become a **fixed array of slots** rather than a dense list, so a locked
station can hold a specific position while you build around it. Multi-slot abilities now need that
many *consecutive* free slots, which is a real constraint once Overload has punched holes in the line.

### The enemy varies
`aiVarietyChance` (0.22) makes the AI take a random affordable attack instead of its best one, so its
Sadness and Joy attacks surface occasionally instead of never — its scoring otherwise always picked
whichever emotion was off-type against you.

### Idle motion
- **Line stations** swell, glow and bob on a wave running in each line's direction of travel — left
  to right for the player, right to left for the enemy. It stops during resolution so the firing
  station is the only thing moving.
- **Empty layer slots** ride the same wave in the opposite direction, centre outward, breathing
  between two greys instead of glowing.

### HOW TO PLAY
Type roughly doubled, five steps, still one screen at 375×812. Now states outright that **EC is your
fuel and MS is both your life *and* the ceiling your EC must stay under**, with a fifth step for
Overload.

### Opening, revised
The screen-wide name banner is gone. Instead the **persona's name resolves over the enemy one letter
at a time**, larger and pulsing while it types, then settling into the permanent floating label it
stays as for the rest of the battle. **The floor light stays dark until the interface arrives**, so
the enemy hangs in nothing until the moment the fight actually starts.

> The reveal gate had to move to a **wrapper element**. `floorpulse` animates `opacity` in its own
> keyframes, and a running CSS animation overrides a plain `opacity` declaration — so hiding the
> light by setting `opacity:0` on the same element did nothing at all. The wrapper is not animated,
> so its opacity multiplies with the pulse instead of losing to it. Worth remembering: **verifying a
> class was applied is not verifying the element is hidden.**

### Fix — the intro line typed invisibly
The speech bubble is a child of `.screen`, and the pre-intro blackout rule sets `opacity:0` on
children it does not exempt. So the enemy's opening line typed out its whole life unseen, and then
its fade-*out* animation briefly overrode the CSS — which is the "blinks for a microsecond" before
the UI appears. The bubble is now exempt from the blackout.

## Pass 11 — front end, Recharge

- **HOW TO PLAY** sits under CONFRONT EMOTION on the title screen, rewritten around the fiction:
  a lead line (*"Emotional Entities wander the line. Confront them without losing yourself."*) and
  four colour-coded steps — **CONFRONT** (break their emotional layers before they break yours),
  **SUMMON** (spend Emotional Charge to summon abilities onto your Metro Line), **MATCH** (a layer
  struck with its own emotion absorbs the blow), **REGULATE** (never let Charge pass your Mental
  Stamina). 84 words: about **13 seconds** skimming the headings, longer read word for word.
  Fits on one screen at 375×812 without scrolling.
- **Recharge** — a new ability: **+20 EC, −5 of your own MS**, costs nothing to cast. Because MS is
  also the charge ceiling, paying stamina for charge narrows your own band from both sides, which
  is the tension the whole system is built on. It takes a line slot like anything else, so the
  real cost is the attack it displaces.
  - Added to both pools. The **enemy AI reaches for it when it cannot afford an attack**, instead
    of idling on REST.
  - Self-damage is clamped to leave at least 1 MS — a unit cannot recharge itself to death.
  - The speech bubble was rebuilt: an unclipped wrapper carries the tail and the drop shadow, with
    the black stroke and the coloured body as two stacked pixel-cornered plates behind it, so the
    corners stay pixelated while the tail still escapes the clip.

## Pass 10 — title screen, enemy dialogue, identity

- **Title screen.** Black, the game's name, one button: **CONFRONT EMOTION**. Nothing runs until it
  is pressed — and that press is also the gesture browsers require before audio, so the theme now
  starts exactly when the game does.
- **Enemy dialogue.** `neuro_metro_avui_enemy_dialogues.csv` is imported into the workbook as a
  **dialogue** sheet and flows through the same CSV pipeline. Speech bubbles are solid emotion
  colour, white text with a hard black shadow, a tail pointing at the speaker, typed **letter by
  letter** with a blip per character, held **3 seconds after the last letter**, then faded.
  - `INTRO` — after the reveal banner
  - `WINNING` — first time the player drops below 20% MS
  - `LOSING` — first time this enemy drops below 20% MS
  - `DEFEAT` — as the enemy comes apart
- **A different persona every battle.** One is drawn at random from the personas matching the
  enemy's emotion, so the same enemy type speaks with a different voice each run. Anger has five:
  The Evicted, The Exploited, The Betrayed, The Vandal, The Denied.
- **The persona's name hangs over the enemy** for the whole battle, colour-coded and drifting.
- **The backdrop takes the enemy's colour** — a `bg_hex` column on the emotions sheet. Anger fights
  happen against dark red bleeding up into black.

### Fixes in this pass
- **The intro was never visible.** `.introtrack` sat at `left:0` of a 2200px rail, so the stations
  ran 1100px off-centre and never crossed the screen. The track origin is now the rail's centre;
  verified by measurement — the fourth station lands dead centre.
- **The wipe was black on black,** and at `280vmax` it covered the screen almost instantly. It is
  now sized to just cover the diagonal and carries a blazing white leading edge, so it reads as a
  circle sweeping outward. The three white flashes fire *during* it.
- **The rainbow charge now loops seamlessly.** One tile is half a screen wide, the gradient starts
  and ends on the same hue, and the animation shifts by exactly one tile.
- **The chevron strokes were invisible** because the body was also pure white. The rim is now black
  on every side *except* the one facing the other chevron, which is pure white — so the span of
  Mental Stamina between them is outlined.
- **The EMOTIONS panel eases open and closed** on height and opacity, and **the enemy sits behind
  the interface** (stage `z-index:1`, panels `3`).
- **The enemy's arrival is nastier**: it lurches up, overshoots, shudders and settles, stepped at
  roughly 12 fps.

### ⚠ The dialogue CSV uses a different set of six emotions
The sheet is built on **Anger, Disgust, Sadness, Fear, Joy, Surprise**. The game is built on
**Anger, Sadness, Joy, Apathy, Nostalgia, Calm**. Only three line up — **Disgust, Fear and Surprise
have 60 lines that nothing can currently speak, and Apathy, Nostalgia and Calm enemies have nothing
to say.** Nothing breaks; the rows simply never match. This is the same open question the GDD flags
in §7.3, now with content riding on it. Worth settling which six the game actually has.

## Pass 09 — opening sequence, music, presence

### Music
`Theme Song 8_bit.mid` is converted by `tools/build_music.py` into `music.js` — a plain note list
that **the prototype's own WebAudio synth plays back**. No audio file is fetched and no MIDI is
parsed in the browser, so it works from `file://` as well as from a server, and the theme runs
through the same bit-crusher as the sound effects.

```
python3 tools/build_music.py "sources/Theme Song 8_bit.mid"
```

Track names pick the voice: lead guitars → square, bass → triangle, drums → noise, and so on
(`VOICES` at the top of the script). 8 tracks, 3,637 notes, an 89-second loop. Notes are scheduled
on a rolling 300 ms lookahead rather than all at once.

**Browsers will not start audio before a gesture**, so the theme begins on your first tap and loops
from there. Nothing else changes.

### Opening sequence
Black screen → a metro line sweeps in diagonally from the top right, three stations flying past
before the fourth stops dead centre → a black circle swells out of the middle while the screen
strobes off-white three times → the wipe hands over to the enemy rising into place → a screen-wide
banner with its name → and only then does the interface fade in.

### Presence
- **The background darkens toward the top** of the screen.
- **The enemy hovers**, and casts an ellipse of light on the floor beneath it in the colour of its
  outer layer. The pool tightens and brightens as the enemy sinks, widens and dims as it rises —
  exactly counter to the hover, the way a point light over a floor behaves.
- **Defeat**: the enemy's layers come apart and tumble to the floor.

### Bars
- The chevron tiling **inside** the bars is gone — the markers carry that language now.
- The markers are **1.5× thicker, far brighter**, and carry a **black stroke all the way round**
  plus a **pure white stroke only on the face turned toward the other chevron**, so the stretch of
  Mental Stamina still standing between them is outlined on both ends.

## Pass 08 — charge segments, the EMOTIONS panel, deferred layers

- **Lines are 6 segments.** The player's travels **right**, the enemy's travels **left**. The
  terminus arrow now sits at the **head** of each line, marking the segment that fires first and
  therefore the direction the rest execute in.
- **Charge segments.** An ability can declare `charge` in the spreadsheet; each charge consumes a
  line slot ahead of it. `Rage` and `Grief` cost 2, `Mania` costs 3 — so one heavy ability eats
  half the line and locks out the rest. During resolution a charge segment does nothing but hold,
  each one a semitone-ish step higher than the last, until the ability itself lands.
- **The EMOTIONS panel.** The always-on tray is gone. A button opens a scrollable bottom sheet
  about a third of the screen tall; the stage compresses so everything moves up. Each ability is
  drawn as a **line fragment** with its charge segments, its name in bold, its cost as a
  **rainbow pill** (`-45 EC`) and its effect as a **white pill** (`90 DMG`).
- **Abilities fly.** When a station fires, it lifts off the line, scales up and strikes the
  target's outer layer, so what was executed and where it landed are the same gesture.
- **Layers no longer regenerate mid-turn.** A struck layer flashes, breaks and stays gone. Every
  broken layer returns to the back of the queue **when the round ends**. Being hit with **no layers
  left is EXPOSED: double damage and zero charge.**
- **Rainbow charge.** The EC fill is a screen-wide rainbow that drifts slowly, visible only where
  charge actually reaches.
- **Chevrons everywhere.** The markers are now a **single thick solid chevron**, and the bar's own
  segmentation is the same chevron tiled, so the interior and the ends read as one system. The left
  chevron is anchored and still; the right one **breathes**, and **strobes and shakes** when it is
  driven down. The whole gauge block shakes and flashes magenta on damage.
- **Idle motion**: the MS and EC tags drift slowly up and down; the warning glyph in destroyed
  capacity is twice as large and scrolls diagonally.
- **Shield break**: the shield splits in two and the halves tumble away.

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

### Added in pass 08

49. **`unit.line` is now stored in execution order** (index 0 always fires first) and *rendering*
    applies direction, rather than the data being stored visually and reversed everywhere it is
    read. With two units travelling opposite ways and multi-slot abilities, the old scheme had four
    places that each had to get the reversal right.
50. **Drag-to-reorder is currently off.** Moving a station would have to drag its charge segments
    with it as a group, and a half-working version is worse than none. Tapping any segment removes
    the whole ability, charges included. Worth restoring once the grouping settles.
51. **The AI scores heavy abilities per slot**, not per cast, so a 3-slot nuke is weighed against
    the three quick attacks it displaces.
52. **A `charge` column and a `line_dir` column** were added to the spreadsheet, along with
    `chargeStepMs`, `flyMs` and `layerRegenAtTurnEnd` in rules — all reached the game through the
    CSV pipeline rather than being typed into the code.

### ⚠⚠ Balance finding — the fight is now decided on turn one
With **6-slot lines**, whoever strips the other's layers first wins outright. An automated run had
the player queue three cheap attacks — breaking all three enemy layers, since broken layers no
longer return mid-round — and then land `Rage` into the empty stack for **180 damage** on a 250 MS
enemy. **Won in round 1, at full health, untouched.**

The same rule killed the player in round 2 in pass 08's run. It is not that EXPOSED is too strong
in one direction; it is that **line length, layer count and the EXPOSED multiplier now multiply
together**, and going first decides it. Three dials, all in the spreadsheet:
`lineCap`, each unit's `layers`, and the `*,NONE` row's `dmg_mult`.

### ⚠ Earlier balance finding
EXPOSED is brutal in combination with deferred regeneration. The player has 2 layers against a
6-segment enemy line, so both break in the first two hits and **every remaining station lands at
double damage**. An automated run lost in **round 2**. The rule works exactly as specified — but
layer count, line length and the EXPOSED multiplier are now tightly coupled, and 2 layers against
6 segments is not a survivable ratio. Worth deciding whether players get more layers, whether
regeneration is partial, or whether EXPOSED is less than 2×.

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
