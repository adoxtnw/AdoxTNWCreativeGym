# Neuro Metro: AVUI — BATTLE SYSTEM · architecture

How the battle system is put together, and where a new thing goes.

## This is a game, not a page

The distinction decides most of the arguments in this codebase:

- **There is one clock.** `tick()` in `rings.js` runs at 12 fps and is the only
  heartbeat: canvas repaints, layer motion, bar tweens and the shared gradient all
  advance on it. Anything that animates itself independently will drift out of step
  and read as the wrong medium. CSS animations are allowed, but they must be
  `steps(duration / 83ms)` so they land on the same frames.
- **Simulation and presentation are separate, and simulation wins.** The ledger
  (`ms`, `ec`, `layers`, `statuses`) changes the instant a rule says so. What the
  player sees is a reaction to that, never a gate on it.
- **Content lives in the spreadsheet.** Abilities, statuses, sounds, phrases and every
  tunable number are rows. Adding an ability is a row; adding a *kind* of ability is
  one `Kinds.define()`. If a designer has to open a `.js` file, that is a design flaw.
- **Effects are fire-and-forget.** A hit throws a number and moves on. Nothing in
  `fx.js` may block the turn loop or own state the rules need.
- **The interface is diegetic.** There is no button bar: the line is the control
  surface. Tap a station to remove it, tap the line to open Emotions, tap DEPART.

### Loadouts
A **Loadout** is one emotion's set of ability slots; the player carries `equippedSlots`
of them and they *are* the panel's pagination. Slots are POSITIONAL — a blank `slot3` is
a real, visible empty cell — which is why the sheet uses four columns rather than one
pipe list.

- `unit.pool` is **derived** for a unit that has loadouts: always-on actions
  (`abilities.action`) plus the union of the equipped sets. A unit with no loadouts (the
  enemy) keeps its flat `pool` column and behaves exactly as before.
- `abilities.emotions` is the **hybrid hook**: blank means "just my own emotion", and
  `abilityFitsLoadout()` lets a future multi-emotion ability sit in a Loadout of any of
  its emotions. Nothing is hybrid yet; adding one is a row edit.
- **`equipLoadout(u, slot, id)` is the single seam** a future equip screen uses. It works
  today. What makes it safe is that `buildPanel()` and `renderLoadoutBar()` are markup
  only and re-callable, while every gesture listener lives in `wirePanelGestures()`,
  which runs once. Rebuilding the panel therefore cannot stack handlers — there is a
  regression test for exactly this.

### Ability effects
What an ability *looks* like when it lands is kept apart from what it *does*.
`AbilityFx` in `src/fx.js` resolves **ability id -> kind -> default**, so a bespoke
effect for one ability is a single call and nothing else moves:

```js
AbilityFx.define("HVY_JOY", { hit(ctx){ /* only Mania does this */ } });
AbilityFx.defineKind("DEBUFF", { apply(ctx){ /* every debuff does this */ } });
```

Two hooks today: **`hit`** (an attack connects) and **`apply`** (a status takes hold).
`ctx` is `{ab, actor, target, st?, matchup?}`. Effects are fire-and-forget — they never
block the turn loop and never touch the ledger.

### Where to add things
| You want to add | You touch |
|---|---|
| an ability | a row in `abilities` |
| a new *behaviour* for abilities | `Kinds.define()` in `kinds.js` |
| a status effect | a row in `status_effects` + one reader |
| a visual reaction to a hit | `AbilityFx.define()` / `defineKind()` in `fx.js` |
| a line of flavour text | a row in `prompts` |
| a rule that spans turns | `hooks.js` |
| a tunable number | a row in `rules` — never a literal |
| an ability set | a row in `loadouts`; equip it via `units.loadouts` |

## Ground rules

1. **Content lives in the spreadsheet, never in code.** `config/avui-config.xlsx`
   → CSV export → `tools/build_data.py` → `data.js`. If you are typing a number
   into `src/`, stop and ask whether it is a *rule* (spreadsheet) or a
   *mechanism* (code).
2. **Classic scripts, not ES modules.** Modules are blocked over `file://`, and
   this has to open by double-clicking `index.html`. Every file shares one
   global scope; the `<script>` order in `index.html` *is* the dependency graph.
3. **`index.html` is markup.** No styles, no behaviour.
4. **Generated files are never hand-edited**: `data.js`, `music.js`.

## Layout

```
index.html            markup + documented load order
styles/game.css       one stylesheet, ordered tokens → frame → HUD → fx → screens
config/               the spreadsheet — the source of truth for content
sources/              the .mid, the dialogue CSV, and Bars_Reference_001.svg
tools/                serve.py           dev server: no-store + mtime-stamped assets
                      build_workbook.py  rebuild the spreadsheet's structure
                      build_data.py      CSV export  → data.js
                      build_music.py     .mid        → music.js
src/
  util.js       $, sleep, waitAnim, colour helpers
  art.js        pixel glyphs, station/chevron/charge SVG builders
  audio.js      audio graph, sound effects, theme transport
  hooks.js      event bus — attachment points for cross-cutting mechanics
  model.js      units, line slots, layer queue, overload
  kinds.js      ABILITY KIND REGISTRY  ← most new mechanics land here
  rules.js      matchup lookup + dry-run projection
  gauge.js      the MS/EC bar — per-pixel canvas, geometry from the reference SVG
  rings.js      emotional-layer rendering (canvas)
  view.js       gauges, lanes, ability panel (DOM)
  fx.js         tags, flying strikes, shakes, layer break/regrow
  dialogue.js   personas, speech bubbles, backdrop tint
  battle.js     resolution order, enemy AI, the turn loop
  screens.js    opening sequence, enemy defeat
  main.js       boot + input wiring
```

## The two extension points

### Adding an enemy
Add a row to the **units** sheet with `tags` = `ENEMY`. Three columns do the work
that used to need code:

- **`tier`** — `WEAK` / `REGULAR` / `STRONG`. **It is not a stat.** Nothing reads it
  as one; it picks the silhouette (see *A tier is a shape*) and narrows which
  personas can speak. Blank or unknown behaves as REGULAR.
- **`spawn_lines`** — where the map may produce it, as `line:weight`. `L2:0.15|L5:0.15`
  is an uncommon sight on either. `*` is every line, and a named line **beats** the
  wildcard rather than adding to it. Leave a line out and it never appears there.
- **`pool`** — its abilities. Keep it mostly its own emotion, or the emotion means
  nothing.

If you want it to sound like itself rather than like everything else of its emotion,
give it personas in `dialogue` carrying its tier, all four states each.

Nothing else is needed. `build_workbook.py` refuses to build if any of those
references is dangling.

### Adding an ability
Add a row to the **abilities** sheet. If its `kind` already exists, you are done
— no code. Point a unit's `pool` at its id.

### Adding a status
Add a row to `status_effects`, point an ability's `status_apply` / `status_duration`
at it, and add ONE reader for whatever column it introduces. Existing statuses keep
working because every reader sums across all active statuses rather than naming one.
Note the AI needs teaching too: `buildEnemyLine` scores on damage-per-slot, so a
DEBUFF scores zero and would never be chosen — it gets its own explicit branch.

### Adding an ability *kind*
One `Kinds.define()` in `src/kinds.js`. Each kind declares **two** things:

```js
Kinds.define("DRAIN", {
  project({A, D, ab}){ D.ec -= ab.power; A.ec += ab.power; },   // dry run, pure
  async run({actor, target, ab, onEnemy, stationEl}){ ... }     // live effect
});
```

`project` is not optional in spirit. It is what the **build-phase preview** and
the **enemy AI** read. A kind without one is invisible to both — the ability
would work when fired but show nothing while planning, and the AI would value it
at zero. This split exists because exactly that bug shipped: `simulate()` used to
understand `DAMAGE` only, so Recharge, Feed and Self Harm were silently missing
from every projection.

### Adding a mechanic that cuts across turns
Statuses, passives, synergies — attach to `Hooks` instead of editing `battle.js`:

```js
Hooks.on("damage:dealt", ({defender, amount}) => { ... });
```

Events: `battle:start`, `round:start`, `round:end`, `line:depart`,
`station:fire`, `charge:tick`, `damage:dealt`, `layer:broken`, `layers:regrown`,
`unit:defeated`. `emit` awaits each listener, so a listener may animate.

## Data shapes worth knowing

- **`unit.line`** is a **fixed array of `RULES.lineCap` slots**, not a list.
  `null` is an empty slot. Index 0 always fires first; *rendering* applies the
  travel direction (`unit.dir`), the data never does. Entries are
  `{ab, charge:boolean, locked?:boolean}`; a multi-slot ability occupies
  consecutive slots with its charge segments immediately before it.
- **`unit.layers`** is the live queue, outermost first. A broken layer moves to
  `unit.broken` and only returns at `round:end`. The queue is **re-shuffled every
  round** (`shuffleLayersEachRound`), so which emotion is outermost — and so
  which attack is profitable — changes between turns.
- **`unit.cursor`** is how far through its own line a unit has resolved. It lives
  on the unit rather than in the loop — a holdover from when a charge segment let
  the opponent act out of turn. That interrupt is gone (see `bonusSlots`), so the
  cursor could now be local; it stays on the unit because resolution is still
  restartable from a known point.
- **`unit.lineCap` / `unit.maxBonus`** come from the unit's own row (`line_cap`,
  `max_bonus_slots`), not from a global — the two sides are tuned separately. The
  `RULES` values of the same name are only the fallback when a row leaves them blank.
- **`unit.statuses`** is `{statusId: roundsLeft}`. What a status DOES lives in the
  `status_effects` sheet, not in code: `block_regen` holds broken layers down,
  `miss_chance` makes attacks fluff, `self_hits` turns one of the victim's own
  attacks on itself each round end. Readers (`regenBlocked`, `missChance`,
  `runSelfHits`) sum over whatever statuses are active, so adding a status is
  adding a row plus one reader — no existing code changes.
- **`layer.temp`** marks a layer GROWN by an ADDLAYER ability. `breakLayer` never
  files a temp layer into `broken`, so it is gone for good rather than regrowing.
- **`unit.used`** is `{abilityId: shotsSpent}`. An ability may only be added to the
  line while it has shots left (`usesLeft`), and shots **carry over between turns** —
  nothing refills at end of round. Emptying the pool is what puts the ability on
  cooldown (`commitUses`), and finishing that cooldown is what refills it
  (`tickCooldowns`). Because `usesLeft` counts what is currently ON the line, pulling
  an ability back off returns its shot with no extra bookkeeping.
- **`unit.extra`** is one entry per slot past `lineCap`, naming what KIND it is.
  Two kinds exist and they behave differently, which is why a bare count no longer
  suffices: **OVERLOAD** slots are forced on you, `locked`, drawn in the OPPONENT's
  stamina colour, and rebuilt from scratch every turn; **CRIT** slots are earned by a
  critical and last exactly one line. `slotKind(u,i)` reads it; `addExtra`/`dropExtra`
  maintain it. Charging no longer grants anything — that rule is retired.
- **Overload is DERIVED, never stored.** It lasts while `ec > ms`, so it must not live
  in `unit.statuses`: `tickStatuses()` decrements every entry it finds and would tick it
  away. `isOverloaded()` is the test, and `renderStatuses()` merges it in at draw time. They are always
  the tail of `unit.line`, so `isBonusSlot(u,i)` is just `i >= u.lineCap`, and
  they last exactly one turn because `grantBonusSlots` recomputes from scratch
  each round rather than decrementing a timer. This replaced the charge *interrupt*,
  which was disorienting: it punished you with an event you could not see coming,
  where a dashed slot on the opponent's line is visible before it matters.
- **`unit.cooldowns`** is `{abilityId: turnsLeft}`. Using an ability stamps
  `cooldown + 1`, and every stamp ticks down once at `round:end` — so a cooldown
  of 1 means "not next turn, yes the turn after".
- **`unit.shownMs` / `unit.shownEc`** are what the bar draws; `ms`/`ec` are the
  truth. Hits change the truth at once and queue an indicator in `unit.pending`;
  `settle()` in `src/fx.js` walks them onto the bar afterwards. Only the display is
  deferred — never the simulation. Anything that reads a unit's health for *rules*
  must use `ms`/`ec`; anything drawing it must use the `shown` pair.
- **`unit.pending` is gone.** Damage and charge are applied the moment they land;
  `hitFeedback()` throws a floating number beside the fighter and snaps the bar.
  There is no deferred settlement, no accumulating tag, no ball of light. `settle()`
  survives only as a no-op that reconciles `shown*` and checks Overload, so callers
  did not all have to change at once.
- ~~**`unit.pending`** held AT MOST TWO entries — one `MS`, one `EC` — because
  `queueDelta()` folds each new hit into the tag already standing rather than
  posting another. The tag grows and breathes faster as its running total
  approaches that unit's `maxMs`. `morphAll()` turns them into balls at once,
  then each ball flies into the bar one at a time. Each landing
  tweens the bar over `barTweenMs`, but the *next* ball launches `ballFlyMs`
  before that tween ends — so a bar change still reads as a full second while
  five of them take ~6.3 s rather than ~10 s.
- **Projection scratch objects** are `{ms, ec, shield, msMax, layers:[id]}` —
  plain data, never the real units.

## Two canvases, one clock

`src/rings.js` and `src/gauge.js` both draw pixel art by writing `ImageData` at a
small logical size and letting `image-rendering: pixelated` upscale it. Both are
driven by the single 12 fps `tick()` in `rings.js`.

The bar repaints every frame so its waves move, but **the DOM work around it must
not run on the animation clock**. `renderStats()` caches what the renderer needs in
`GaugeView.targets`; `tick()` calls `redrawGauges()`, which repaints only the two
canvases. `redrawGauges()` is guarded because `rings.js` ticks once at load — before
`view.js` has even been parsed. An unguarded call there throws, `setFps(12)` never
runs, and the entire animation loop silently dies.

Bar geometry is ported from `sources/Bars_Reference_001.svg`. Its measurements are
recorded at the top of `src/gauge.js`; every derived constant is a rule in the
spreadsheet, not a literal in the renderer.

## A tier is a shape, and the shape is one function

An enemy's tier is drawn, not printed: WEAK wears concentric **triangles**, STRONG
concentric **seven-pointed stars**, REGULAR the original circles. That is the whole
of the warning the player gets, on the ride and in the fight both.

`paint()` already decided which band a pixel was in by asking how far it was from
the centre. A shape is simply a different answer to that question:

```
distance = hypot(dx, dy) / f(angle),      f in (0,1]
```

`f` is 1 where the shape reaches furthest — a vertex, a star's point — and less
everywhere else, so **every shape is inscribed in the circle the rings were already
tuned for**. Layer geometry, breathing and spacing know nothing about any of it, and
the player's rings pass no shape at all and are exactly the circles they always were.

**The trap, and it is not obvious.** Bands are constant in *shape* space, so their
thickness in PIXELS is multiplied by `f`. A true triangle has `f = 0.5` along its
flats, which puts the 1.8px inner rings under one pixel there — they break into
dashes and then vanish, and the sprite still looks like a sprite. Three rules in the
sheet exist only to hold that line: `enemyTriRound`, `enemyShapeFill`,
`enemyShapeBreathe`.

**`enemyShapeFill` has a ceiling as well as a floor.** Raise it until the rings stop
breaking and keep going, and the gaps between bands drop under a pixel: the rings
merge into one solid shape, which is a filled triangle rather than concentric ones.

Run `node shared/tools/check_rings.js` after touching any of it. It reads the real
`rings.js` and the real `data.js` and measures the widest gap in every ring of every
enemy, in pixels of arc, through a full breath. An unbroken ring scores about 1; the
circle enemies are the calibration.

## `refreshEnemyShape()` — the rings are sized per FIGHT, not per frame

`E_CFG` is built once, because rebuilding it sixty times a second to read three
unchanged rules would be wasteful. That makes it stale the moment `S.enemy` is
replaced — which is exactly what arriving from the map does. Anything that swaps the
enemy must call `refreshEnemyShape()`, or a strong enemy is drawn at the size of
whatever this page happened to boot with.

## Two output buses, and why

```
sfxBus  -> master -> crusher (12-step) -> lowpass 7.2kHz -> destination
musicBus ------------------------------> cleanBus -------> destination
```

The crusher and the lowpass are what make the SYNTHESISED effects crunchy. Anything
already recorded must take `cleanBus` instead. This was not obvious while the theme
was a MIDI played on square waves: squares already sit at the quantiser's extremes,
so crushing them was very nearly a no-op, and the theme rode the SFX chain harmlessly
for twenty passes. A recorded mix does not survive it — measured, that chain took the
theme from ~52,900 distinct sample levels to ~780 and multiplied its high-frequency
energy by 5.6 in aliasing.

`cleanBus` carries the same 0.7 gain as `master`, so moving the music across changed
its level not at all.

**`audioReport()`** dumps what the platform actually gave us — sample rate, channel
counts, latency, whether the element fallback is in play. Run it in a console on the
device when audio misbehaves somewhere you cannot attach a debugger.

## The theme is two files

`audio/theme-opening.wav` plays once; `audio/theme-loop.wav` loops for ever. The
handoff has to be **seamless**, so both are decoded to PCM up front and the loop is
scheduled on the audio clock at exactly `t0 + opening.duration`. That is
sample-accurate — an `ended` handler or a `setTimeout` would leave an audible seam.
`fetch` is blocked on `file://`, so a `<audio>`-element fallback covers opening the
page straight off disk; it cannot be gapless, and that is the trade.

The MIDI theme this replaced is gone (`music.js` deleted, `tools/build_music.py`
marked superseded).

## Tooltips and blurbs

Player-facing text lives in the sheet (`abilities.blurb`, `status_effects.blurb`), never
in code, and carries two marks: `*text*` for emphasis and `{TOKEN}` for a colour-coded
keyword. `tipMarkup()` in `view.js` resolves them against `KW_COLOR`; an unknown token
degrades to plain ink rather than breaking the tooltip. Abilities open on a long press
(`longPressMs`), statuses on a tap; anything else on screen closes it.

The long press has to cooperate with the page swipe: movement past the drag threshold
cancels the timer, and once a tooltip has opened the click that follows is swallowed so
the press does not also place the ability.

## The build interface has no buttons

The EMOTIONS and DEPART buttons are gone; the line itself carries both jobs.

- Tapping a **station** removes that ability.
- Tapping the **terminus arrow** departs — it already points where the line will
  travel, so tapping it means "send it". `.lane.ready` pulses it once there is
  something to send.
- Tapping **anywhere else on the line** opens Emotions. The three are ordered by
  specificity inside one listener, so they cannot fight.

`abilities.action` marks the abilities that live outside the pagination (Defend,
Recharge). Which ones those are is content, in the sheet — `buildActions()` and
`buildPanel()` split the pool on that flag, and both wire their rows through the
same `wireAbilityRow()`.

## Layers: like does not break like

- A hit whose emotion **matches the outermost layer** does not break it. The layer
  still absorbs (half damage), the stamina still goes, but the queue does not move.
  Tested on `layer.e === ab.emotion` directly rather than through the matchup label,
  because that is the rule as stated.
- Breaking the **last** layer sets `unit.stunned = RULES.stunTurns`. A stunned unit
  skips `resolveLine` entirely and `regrowLayers` returns early, so nothing comes back
  that turn either. The counter ticks down at `round:end`, *after* regrowth was
  already skipped — order matters.

## The line always travels one way

`parkLine()` puts the whole track off-centre on the side it will travel FROM — left
for you, right for the enemy — and each station is then centred in turn, so the motion
reads as one continuous sweep instead of the track jumping back and forth to whichever
station is next. At the end the line **runs out the far side** and is reset with the
transition suppressed; cutting straight back to zero was a visible jump between the
last station and the turn changing hands.

## Criticals
`crit_chance` on the ability (falling back to `RULES.critChance`) plus `critBonus(u)`,
which sums `crit_mult` across active statuses — the same "readers sum across whatever is
active" shape as `regenBlocked()` and `missChance()`, so a future buff only fills in a
column. Rolled in `DAMAGE.run()` and **never in `project()`**: the build-phase preview
has to stay deterministic or it would promise a number the game then contradicts.
Whoever lands one earns a CRIT slot for their next line, and the whole beat is
**awaited** by the attack that caused it — the tag holds for `critHoldMs`, the screen
washes once in the attacking emotion, the earned slot flies from the tag into that
fighter's line, and only then does the next station fire.

The slot is granted **at the moment of the crit** so it can be seen arriving, which is
why `critFresh` exists: the end-of-round sweep keeps a slot that has not yet had a line
built with it, and drops anything older. The thing that flies is a **ghost** — the real
slot appears at the next build — because re-rendering the track mid-resolution would
destroy the station elements `resolveLine` is still holding.

## Pacing

A station's budget depends on what it does: anything with `status_apply` gets
`statusStepMs` (2000) so the player can read it, everything else `attackStepMs` (600).
The step is padded to a deadline rather than
built from fixed sleeps: whatever the ability spent on its own animations, the step
is topped up to the same total. That keeps the rhythm even across abilities that do
very different amounts of work. It can only pad a short step — an ability whose
internals exceed the budget will overrun, so `flyMs`, `impactFlashMs`,
`impactShakeMs`, `layerFlashMs` and `layerGapMs` all have to fit inside it.

## Conventions

- **Never `setPointerCapture` on pointerdown if a click has to land underneath.**
  Capturing retargets the `click` that follows to the capturing element, so the
  handler on the child never runs — which silently stopped every ability tap in
  the Emotions panel. Capture only once the gesture is genuinely a drag, and
  release it on pointerup. Note that dispatching `el.click()` in a test CANNOT
  catch this: it bypasses the pointer path entirely. Verify taps by asserting
  `hasPointerCapture()` is false after a plain pointerdown.
- **An animated `filter` wipes a static one.** The tags carry their mint/rose
  bloom in `filter`, and the breathing animation also drives `filter` — so the
  bloom has to be repeated inside the keyframes or it vanishes the moment the
  animation starts. Same trap as the `animation` shorthand and `--anims`.

- **Position overlays from layout geometry (`offsetLeft`/`offsetWidth`), not
  `getBoundingClientRect()`.** A client rect includes transforms, and the enemy
  sprite is permanently mid-transform (entrance scale plus the idle float). Using
  a client rect scattered the indicators across a 55×31 transient box instead of
  the real 186×186 one, bunching them below the sprite. `zoneBox()` in `src/fx.js`
  walks `offset*` up to `#screen` and is immune to it.
- **Scatter deterministically, not randomly.** Independent random draws clump.
  Indicators step across the field by the golden angle and cycle four vertical
  lanes; four rather than three because with three, the 2nd and 5th pill of a
  line share a lane at neighbouring x and overlap.

- **Pixel art is drawn small and upscaled by a WHOLE number.** `rings.js`,
  `gauge.js` and the intro line all rasterise at a low logical size and scale up
  with `image-rendering: pixelated`. A non-integral factor (3200/533 = 6.004)
  makes nearest-neighbour widen the odd column to 7px and the edges crawl — the
  intro canvas is 3198px wide precisely so the factor is exactly 6.
- **Scale an entity by its OWN box, not its container.** The entrance animation
  used to run on `#stage`, which is `flex:1` and far taller than the sprite, so it
  pivoted about the stage's centre and read as growing out of its bottom-left
  corner. It runs on `.enemyholder`, whose box is the sprite's box.
- **A mask reveals what is BEHIND its own element, not behind the page.** The wipe
  canvas and the metro rail are both children of `.intro`, so the transparent hole
  showed the rail sitting underneath rather than the background. Anything that must
  not be revealed has to be *out* of the masked element, not merely under it.
- **Nothing may sit waiting behind a curtain.** `.stage` is exempt from the preintro
  blackout so the enemy can rise while it is still on — which meant the entity was
  fully visible behind the wipe and got revealed early, then flashed as its own
  entrance restarted it from `opacity:0`.
- **A staged entrance must hide its elements BEFORE the blackout lifts.** Removing
  `preintro` reveals everything at once; without a per-element hold the later ones
  sit visible for hundreds of milliseconds and then animate, which reads as a flash
  followed by things moving for no reason.
- **A growing shape does not reveal anything — a mask does.** The opening wipe was
  a black disc expanding over a black field, which is why it never read. The wipe
  canvas is now the CURTAIN itself: opaque black everywhere, transparent inside the
  circle, so the battle background shows through the hole.
- **Anything sequenced during the opening must not depend on rAF.** It is suspended
  outright on a hidden tab, so `wipeReveal` runs on a timer with a safety timeout;
  otherwise the opening hangs for ever on a backgrounded tab.
- **An idle animation can push an element into the thing it was cleared from.** The
  shields sat outside their lanes at rest and *still* ended up inside them, because
  the wave animation lifted them 8px and scaled them 1.14 — and for the enemy, whose
  shields hang below the lane, "up" means "into it". Measuring one frame at rest said
  it was fine; sampling across the whole cycle found it. Mirror the motion per side
  and size the clearance for travel + scale.
- **For a gradient BORDER, use `border-image`.** Two other approaches failed here:
  `mask-composite` did not render at all, and a `z-index:-1` pseudo-element painted
  *above* the parent's background rather than behind it, flooding the whole lane
  with colour instead of ringing it.
- **Never delete CSS by slicing between two markers.** A Pass 33 cleanup removed
  everything between `.ind` and a later comment to drop some dead rules, and took the
  tooltip and status-tag styles with it. An element with no rule is not obviously
  broken — it silently becomes `position:static` and flows to the bottom of the page.
  Delete rules by name, and assert the survivors afterwards.
- **A centred flex track does not start at its container's edge.** Any maths that
  positions a station must include `track.offsetLeft`; leaving it out puts every
  station off by a constant, which reads as a line that slides but never arrives.
- **Never put a quoted `url()` in a style ATTRIBUTE.** The double quote ends the
  attribute, the whole declaration becomes invalid, and the element silently renders
  with no background at all. Percent-encoded data URIs need no quotes.
- **Position effects from the SCREEN, not from the target's box, when the box may be
  full-width.** The enemy's zone is its 186px sprite, so "just outside it" reads well;
  the player's zone is the full-width layer strip, so the same maths threw every player
  number off both edges of the phone and they were never seen at all.
- **`font-weight` alone does not make text bold on mobile.** Most mobile monospace
  fallbacks ship no bold face, so raising the weight changes nothing and every label
  renders hairline-thin. `-webkit-text-stroke` in `currentColor` is what actually
  thickens the glyphs, on every device.
- **`tools/stamp.py` writes `build.js` — run it LAST, before packaging.** It reports
  the newest mtime across `src/`, `styles/` and the generated tables, so the title
  screen says when the GAME changed rather than when the script ran. Version comes
  from the highest `## Pass NN` in the README, so nobody has to remember to bump it.
- **`window.innerWidth` is NOT the game's width.** The phone frame is capped at
  `frameMaxW`; on desktop the window is several times that. Anything sized from the
  window will be drawn outside the frame — and a box wider than its container cannot be
  centred by `margin:auto`, so it left-aligns and its contents land off-screen. Take the
  first of screen -> frame -> window that reports anything, and clamp to `frameMaxW`.
- **A width of zero silently becomes a tall stack of text.** Anything that rasterises
  wrapped text at a fixed width must take the WIDEST width available — a hidden tab
  reports nothing, and an un-laid-out wrapper reports nothing — and must redraw on
  resize, or it bakes in whatever was true at boot.
- **A centred column that overflows loses its TOP, silently.** `.title` centres its
  content, so on a short phone the mood line rendered perfectly and sat above the
  viewport. Anything full-screen must have one element designated to give way — here
  the logo — or the first thing off the edge is whatever is at the top.
- **A tag about a FIGHTER belongs on that fighter.** Centre-screen tags cannot say who
  they are about, so when both sides suffer the same thing in one round the two
  announcements read as one firing twice. `unitTag()` places it on the body; `bigTag()`
  is for things that happen to the whole battle.
- **Serve with `tools/serve.py`, never `python3 -m http.server`.** It stamps each
  local asset URL with its modification time. Without that, browsers happily run
  a cached copy of a module you just edited — the code is right, it simply never
  runs, and nothing tells you.

- Anything awaiting a CSS/WAAPI animation must go through **`waitAnim`**, which
  races the promise against a timer. A backgrounded tab throttles animations and
  `.finished` may never resolve — that once froze the opening permanently.
- A CSS **animation overrides a plain declaration**. To hide something that
  animates `opacity`, gate it on an un-animated wrapper. Verifying that a class
  was applied is *not* verifying the element is hidden.
- Class names are shared across the whole document; `.over` (game-over overlay)
  once collided with an `over` state class and stretched a tag full-screen.
  Prefer specific names.
