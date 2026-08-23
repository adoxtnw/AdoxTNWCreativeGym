# NEURO-METRO: AVUI — architecture

How the prototype is put together, and where a new thing goes.

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

### Adding an ability
Add a row to the **abilities** sheet. If its `kind` already exists, you are done
— no code. Point a unit's `pool` at its id.

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
- **`unit.used`** is `{abilityId: shotsSpent}`. An ability may only be added to the
  line while it has shots left (`usesLeft`), and shots **carry over between turns** —
  nothing refills at end of round. Emptying the pool is what puts the ability on
  cooldown (`commitUses`), and finishing that cooldown is what refills it
  (`tickCooldowns`). Because `usesLeft` counts what is currently ON the line, pulling
  an ability back off returns its shot with no extra bookkeeping.
- **`unit.bonusSlots`** are TEMPORARY line slots, granted one per charge segment
  the *opponent* laid down last turn and capped by `unit.maxBonus`. They are always
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
- **`unit.pending`** holds AT MOST TWO entries — one `MS`, one `EC` — because
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
