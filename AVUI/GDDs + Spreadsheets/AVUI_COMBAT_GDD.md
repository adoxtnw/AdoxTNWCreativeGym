# NEURO-METRO: AVUI — COMBAT SYSTEM
### Game Design Document · Module 1 of 2

| | |
|---|---|
| **Project** | Neuro-Metro: AVUI (Catalan: *"today"*) |
| **Platform** | Mobile, **portrait** orientation |
| **Module** | Combat (sibling to `AVUI_MAP_GDD.md` — Meta + Map Exploration, in progress) |
| **Version** | **0.3** — rewritten against the built prototype |
| **Status** | **Built and playable.** This document describes what exists. |
| **Prototype** | `BATTLE SYSTEM/` — see its `ARCHITECTURE.md` for implementation rules |

---

## 0. HOW TO USE THIS DOCUMENT

**If you are an agent or collaborator picking this up cold:** read **§1–§7** for the simulation loop, then **§16** before you write anything. §16 is a list of traps this project has already fallen into — most of them looked correct in the code *and* in a screenshot, and were only found by measuring.

Markers used throughout:

- **`BUILT`** — this exists in `BATTLE SYSTEM/` and runs. The code is authoritative; if they disagree, the code is right and this document is stale.
- **`NOT BUILT`** / **`SPECIFIED, NOT BUILT`** — designed here, never implemented. **Do not assume it is live.**
- **`RULING`** — a settled decision. Do not silently re-open these; they are load-bearing, and several were re-opened once already and reverted.
- **`OPEN`** — a genuine unresolved question. Do not invent an answer and build on it without flagging.
- **`WARNING`** — a trap. See §16 for the full list.

> **Values are not in this document.** Every tunable is a row in `shared config → rules` (109 of them). Tables here are reading aids. **If this file and the spreadsheet disagree, the spreadsheet wins.**

### Sibling-document contract
This project has exactly two design documents and they must stay in sync:

1. **`AVUI_COMBAT_GDD.md`** (this file) — everything that happens inside an encounter.
2. **`AVUI_META_GDD.md`** — the map, the day, progression, encounters-as-map-events. **Not yet written.**

The shared surface between them is specified in **§13 (Interface With the Meta Module)**. Any change to §13 must be reflected in both files in the same edit. If the two documents disagree, **§13 of this file is authoritative for combat-facing state**, and the meta document is authoritative for everything outside an encounter.

### Relationship to PARALEL
*Paral·lel* is a **separate spin-off** with a different combat system (the Metro Attack Line / Transfer). AVUI **does not inherit its mechanics.** AVUI borrows only its **visual vocabulary** — metro lines, hollow-ring stations, filled nodes, dashed transfer bands, line-colour coding (see §12). Do not import Paral·lel's element wheel, timing model, or code.

---

## 1. DESIGN PILLARS

1. **Your damage is your fuel.** Getting hurt is how you gain the resource you act with. There is no passive regeneration. Combat is a conversation you can only afford to have by being wounded by it.
2. **The safe window is a tightrope, and it narrows.** You must keep Emotional Charge between zero and your current Mental Stamina. Both ends are lethal, and taking damage pushes you toward *both* at once.
3. **Losing control is a mechanic, not a punishment.** Overload is deterministic, telegraphed, and — with planning — *usable*. Breaking down on purpose at the right moment is a legitimate strategy.
4. **Every rule is symmetric.** Player and enemies run on identical resource rules. This is what makes manipulating an enemy's emotional state a real system instead of a gimmick.
5. **The day is one long fight.** Stamina and Charge persist across encounters (§13). There is no free reset. Winning a fight badly is a real cost.

---

## 2. GLOSSARY

| Term | Meaning |
|---|---|
| **MS** | Mental Stamina. Health, *and* the ceiling on safe Emotional Charge. |
| **MaxMS** | A unit's maximum Mental Stamina. Used as the scaling unit for almost every formula. |
| **EC** | Emotional Charge. The resource spent to act. |
| **The Band** | The safe window `0 < EC ≤ MS`. |
| **Overflow** | `max(0, EC − MS)`. How far past the ceiling you are. |
| **Break Countdown** | Turns remaining before Overflow becomes Overload. Displayed as `BREAK IN n`. |
| **Overload** | Loss of agency. Deterministic and telegraphed. |
| **Exhaustion** | `EC = 0`. Cannot act meaningfully; badly vulnerable. |
| **Unit** | Any combatant — player or enemy. All rules apply to both. |
| **Round** | One pass through all living units in initiative order. |
| **Turn** | One unit's single action within a round. |

Throughout this document, **a value written as a percentage is a percentage of that unit's `MaxMS`.** This makes every ability portable across units of different sizes and is the single most important convention here.

---

## 3. THE RESOURCE MODEL

### 3.1 Mental Stamina (MS)
- Doubles as **health** and as **the Overflow ceiling**.
- Reaches 0 → unit is defeated. Player MS reaching 0 ends the encounter in failure.
- MS lost is not permanent within a run — it can be healed (§8), but healing is expensive and competes with acting.

> **`RULING`** — v0.1 said damage "permanently reduces MS for the duration of the encounter" while also listing a heal ability. MS is **restorable**. It simply does not restore on its own.

### 3.2 Emotional Charge (EC)
- Spent to act. **No passive regeneration, ever.**
- EC has three sources:
  1. **Taking MS damage** (the main one),
  2. **Self-inflicted MS damage**,
  3. **Explicit charge effects** on abilities (including forced charge dumped onto an enemy).

### 3.3 EC generation formula

```
ECgain = MSlost × unit.ECRate × typeMod × exhaustionMod
```

| Factor | Value |
|---|---|
| `MSlost` | Actual MS removed, after all damage modifiers. |
| `unit.ECRate` | Per-type multiplier (§7). Default `1.0`. |
| `typeMod` | `1.5` if the incoming attack is Strong against this unit, `0.5` if Weak, else `1.0`. |
| `exhaustionMod` | `0.5` if the unit is currently Exhausted, else `1.0`. |

> **`RULING` — Self-damage generates EC.** v0.1's Example A showed a unit take 10 self-damage and gain 0 EC, which directly contradicted §4's claim that Apathy *"requires self-harm abilities to fuel EC."* Self-inflicted MS loss now generates EC by the same formula. This is what makes Apathy function at all.

> **`RULING` — Overkill does not generate.** Damage in excess of a unit's remaining MS is discarded. A dead unit gains nothing.

> **`RULING` — Healing does not reduce EC.** Restoring MS *raises the ceiling*, which relieves Overflow. That is healing's second, deliberate purpose.

---

## 4. THE BAND AND OVERLOAD

This is the heart of the game.

### 4.1 The squeeze
Taking damage **raises EC** and **lowers MS**. The safe window therefore closes from both ends at once. That is intended — it is what makes the back half of a fight feel like losing your grip.

### 4.2 Overflow

```
Overflow = max(0, EC − MS)          // the ceiling is CURRENT MS, not MaxMS
```

Note the threshold is `EC > MS`, not `EC ≥ MS`. Sitting at exactly `EC = MS` is the perfect, maximally-charged, still-safe position. Rewarding that razor's edge is deliberate.

### 4.3 Overload is immediate — **`RULING`, and it reverses v0.2**

> **`BUILT`** — v0.2 specified a **Break Countdown** giving 1–3 turns of grace. **That was never implemented and has been abandoned.** The prototype flips the moment `EC > MS`, checked once per round when the line is built.

The countdown was dropped because the line model made it redundant: you already commit a whole line a turn ahead, so the "turn to react" the fuse was buying you is the turn you spend building. A second grace period on top read as nothing happening.

**What actually happens** (`applyOverload`, `src/model.js`):

```
slots = max(1, ceil(Overflow / (overloadSlotPer × MaxMS)))    // overloadSlotPer = 0.25
```

- Those slots are **appended to the end of the line**, past `lineCap`, as `extra` entries of kind `OVERLOAD`.
- Each is filled with a **locked** station the player cannot remove.
- **All forced stations in one event are the same ability** — Self Harm **or** Feed, never a mix.
- They are **rebuilt from scratch every round**: the previous round's are dropped before measuring, so they never accumulate.
- Overload **clears the moment `EC ≤ MS`**. There is no duration.

Forced stations are drawn in the **opponent's** stamina colour, thick-dotted and glowing, so a corrupted station reads as something done *to* you rather than something you chose.

### 4.4 Overload is also a status
It appears in the status row with its own tag and tooltip. **It is derived, never stored** — see the warning in §16.2.

---
## 5. UNIT STATES

### 5.1 Normal
`EC ≤ MS`. Everything behaves as specified.

### 5.2 OVERLOAD — `EC > MS`
Your line is invaded. See §4.3. **Built and current.**

### 5.3 STUNNED
Breaking a unit's **last layer** stuns it for `stunTurns` (1). A stunned unit:

- **skips its entire line** — `resolveLine` returns immediately;
- **regrows nothing** that round — `regrowLayers` returns early.

The counter ticks down at round end, *after* regrowth has already been skipped. That order matters: tick first and the stun refunds itself.

### 5.4 EXHAUSTION — **`SPECIFIED, NOT BUILT`**
v0.2 specified `EC = 0` as a punishing state (×1.5 damage taken, ×0.5 EC generated). **No part of this exists in the prototype.** It is recorded here because the design intent still seems sound, not because it is live. Anyone implementing it should treat it as new work and re-check it against the shot/cooldown economy, which did not exist when it was written.

---
## 6. TURN STRUCTURE AND ORDER OF OPERATIONS

> **This section is the specification for the simulation loop. It is written from the loop as built** (`depart()` in `src/battle.js`), not from intent.

### 6.1 The round

A round is one pass of `depart()`:

```
BUILD                     player fills their line, then taps DEPART
  ↓
player line resolves      station by station, each centred before it fires
  ↓
enemy line resolves
  ↓
self-hits                 statuses with `self_hits` fire (SAD)
  ↓
round:end                 layers regrow · cooldowns tick · statuses tick · stun ticks
  ↓                       layers reshuffle · round++
  ↓
CRIT slots swept          a slot that already had its line is dropped
  ↓
player line cleared · Overload recomputed · enemy line built by the AI
  ↓
BUILD
```

Both sides commit a whole line in advance and watch it play out. **There is no interleaving** — the player's line runs to completion, then the enemy's.

### 6.2 Initiative — **`NOT BUILT`**
v0.2 specified an `INIT` stat and an initiative order. **None of it exists.** Order is fixed: player line, then enemy line. If a party or multi-enemy encounter is ever added, this is where it has to be designed properly rather than assumed.

### 6.3 Action economy — the line

| | |
|---|---|
| **Permanent slots** | `lineCap` — **3** per side (per-unit, `units.line_cap`) |
| **Extra slots** | `unit.extra[]`, one entry per slot past `lineCap`, each naming its **kind** |
| **Hard cap** | `maxExtraSlots` — **6** |

Two kinds of extra slot exist and they behave differently:

| Kind | Origin | Lifetime | Look |
|---|---|---|---|
| `OVERLOAD` | forced by §4.3 | rebuilt every round | opponent's stamina colour, thick dotted, locked |
| `CRIT` | earned by a critical (§8.5) | exactly one line | off-palette white, free to fill |

A **charge segment** occupies a slot and delays what follows. It costs time and nothing else.

> **`RULING`** — charging used to hand the *opponent* something: first an out-of-turn interrupt, then a temporary slot. **Both are retired.** The interrupt punished you with an event you could not see coming; the slot grant made every heavy attack a gift. Do not reintroduce either without solving the readability problem that killed them.

### 6.4 Resolution order — per individual hit

For each non-charge station, in order:

1. slide the station to the **centre of the lane** and wait for it to arrive (`lineTravelMs`)
2. flash it (`lineFlashMs`)
3. **miss check** — `missChance(actor)`, summed across active statuses. A miss ends the hit here.
4. **shield check** — a shield absorbs the hit entirely and is consumed
5. **matchup** — `matchup(outermost layer emotion, attack emotion)` → `dmg_mult`, `ec_mult`
6. **critical roll** — `crit_chance` (ability, else `RULES.critChance`) + `critBonus(actor)`
7. **damage** — `round(power × dmg_mult × (crit ? critMult : 1))`, clamped to target MS
8. **EC to the target** — `ecFrom()`, i.e. `round(power_or_dealt × ec_mult)`
9. **apply immediately**, then react: floating numbers, shards, sounds
10. **layer break** — only if `hits_layer` **and the hit was not resisted** (§7.2)
11. **pad the step** to its budget (§11.2) so the rhythm stays even

Steps 6–7 are rolled **in `run()` only, never in `project()`**. The build-phase preview must stay deterministic or it promises a number the game then contradicts.

### 6.5 When state flags update
`overloaded` is recomputed once per round, when the line is built. Statuses tick once, at round end.

---
## 7. EMOTIONAL TYPES

### 7.1 The wheel
Six emotions, and the order is load-bearing — it is the gradient order used everywhere in the UI:

**ANGER → SURPRISE → DISGUST → JOY → SADNESS → FEAR**

| Emotion | Hex | Glyph |
|---|---|---|
| Anger | `#e53859` | BOLT |
| Surprise | `#724082` | BURST |
| Disgust | `#56a36a` | ROT |
| Joy | `#fcc336` | SPARK |
| Sadness | `#3d66c1` | DROP |
| Fear | `#929fa5` | EYE |

These are the official values and they live in the `emotions` sheet. **Nothing may hardcode them.**

### 7.2 What a matchup does
Interactions come entirely from the `matchups` sheet — attack emotion × layer emotion, highest `priority` wins, `*` is a wildcard:

| Case | `dmg_mult` | `ec_mult` | Reads as |
|---|---|---|---|
| No layers left | **×2** | 0 | `EXPOSED!` |
| Same emotion as the layer | **×0.5** | 1 | `ABSORBED!` |
| Anything else | ×1 | 0 | `OFF TYPE` |

> **`RULING` — like does not break like.** A hit whose emotion **matches** the outermost layer does **not** break it. The layer still absorbs (half damage), the stamina still goes, but the queue does not move. Announced by a **RESISTED** tag in that layer's colour over two descending notes.
>
> This is tested on `layer.e === ab.emotion` directly, **not** through the matchup label, because that is the rule as stated. If you retune the matchups table, this rule does not follow it.

### 7.3 Layers
A unit's layers are a queue, outermost first. Breaking one moves it to `broken`; it returns at round end unless something is holding it down (§9). The queue is **reshuffled every round** (`shuffleLayersEachRound`), so which attack is profitable changes turn to turn.

Layers **grown** by an ADDLAYER ability are marked `temp` and are **never filed for regrowth** — once broken they are gone.

---
## 8. ABILITIES

### 8.1 Schema
One row per ability in the `abilities` sheet. The columns the game reads:

| Column | Meaning |
|---|---|
| `kind` | which behaviour runs it — see §8.2 |
| `emotion` | its type; blank = typeless (never matches a layer) |
| `emotions` | **hybrid hook** — pipe list. Blank means "just my own". A hybrid may sit in a Loadout of *any* of its emotions |
| `cost` | EC to place it on the line |
| `power` | damage, shield charges, EC gained, or layers grown, per `kind` |
| `charge` | charge segments placed *before* it, each occupying a slot |
| `hits_layer` | whether a landed hit cracks the outermost layer |
| `uses` | **shots** — see §8.4 |
| `cooldown` | whole turns out, **once shots are exhausted** |
| `crit_chance` | blank falls through to `RULES.critChance` |
| `action` | 1 = always available, outside the Loadout pagination |
| `status_apply` / `status_duration` | the status it hangs on the target |
| `blurb` | the tooltip line — `*emphasis*` and `{TOKEN}` for colour-coded keywords |

### 8.2 Ability kinds
Behaviour lives in a registry (`Kinds.define()`, `src/kinds.js`). Each kind declares **two** things and both matter: `project()` — pure, synchronous, no DOM, feeds the build preview *and* the AI — and `run()` — the live effect. **A kind without a projection is invisible to both.**

| Kind | Does |
|---|---|
| `DAMAGE` | the ordinary attack |
| `SHIELD` | absorbs the next hit outright |
| `CHARGE` | buys EC with your own MS |
| `ADDLAYER` | grows a **temporary** layer on yourself |
| `DEBUFF` | hangs a status on the target |
| `HEAL` | takes your own MS back, clamped to MaxMS |
| `SELFHARM` | Overload-forced; costs you MS |
| `FEED` | Overload-forced; heals your **opponent** |

`HEAL` and `FEED` are deliberately **not** one kind: `FEED` heals the other side, because it
is the punishment Overload forces into your line. Clamping `HEAL` to MaxMS is not tidiness —
MS is also the ceiling EC must stay under, so a heal that overshot would hand out headroom
the armor never granted.

### 8.3 The ability set — **`BUILT`**

> v0.2 said "the entire ability set is undesigned". It is designed and running. This is it.
> **Nineteen abilities.** Surprise and Joy were filled out in v0.4 — Surprise had a metro
> line, a Loadout and no abilities at all, so a Surprise enemy could only fight with
> borrowed emotions. Disgust and Fear are still thin; see §15.

| Ability | Emotion | Kind | Power | Cost | Chg | Shots | Effect |
|---|---|---|---|---|---|---|---|
| **Heated Punch** | Anger | DAMAGE | 35 | 20 | – | 3 | cracks a layer |
| **Cold Shoulder** | Sadness | DAMAGE | 35 | 20 | – | 3 | cracks a layer |
| **Manic Grin** | Joy | DAMAGE | 35 | 20 | – | 3 | cracks a layer |
| **Sucker Punch** | Surprise | DAMAGE | 35 | 20 | – | 3 | cracks a layer |
| **Rage** | Anger | DAMAGE | 90 | 45 | 2 | 2 | heavy |
| **Grief** | Sadness | DAMAGE | 90 | 45 | 2 | 2 | heavy |
| **Mania** | Joy | DAMAGE | 130 | 60 | 3 | 2 | the hardest hit there is |
| **Whiplash** | Surprise | DAMAGE | 90 | 45 | 2 | 2 | heavy |
| **Bile** | Disgust | ADDLAYER | 1 | 15 | – | 2 | grows a layer that never regrows |
| **Bristle** | Anger | ADDLAYER | 1 | 15 | – | 2 | grows a layer that never regrows |
| **Good Vibes** | Joy | ADDLAYER | 1 | 15 | – | 2 | grows a layer that never regrows |
| **Fester** | Disgust | DEBUFF | – | 25 | – | 2 | `NO_REGEN` for 2 turns |
| **Self-Harm** | Sadness | DEBUFF | – | 30 | – | 2 | `SAD` for 2 turns |
| **Blinded by Hate** | Anger | DEBUFF | – | 30 | – | 2 | `BLINDED` for 2 turns · *enemy pool* |
| **Out of Nowhere** | Surprise | DEBUFF | – | 25 | – | 2 | `RATTLED` for 2 turns |
| **Drug Hit** | Surprise | DAMAGE | 35 | 20 | – | 3 | cracks a layer **and** `DIZZY` for 1 turn |
| **Sour Note** | Disgust | DAMAGE | 14 | 12 | – | 3 | a fifth of a Heated Punch, on purpose |
| **Spoilage** | Disgust | DAMAGE | 10 | 18 | – | 3 | chips, and `NO_REGEN` for 1 turn |
| **Turn the Stomach** | Disgust | DEBUFF | – | 30 | – | 2 | `NAUSEOUS` for 2 turns |
| **Let It Rot** | Disgust | DEBUFF | – | 32 | – | 2 | `SPOILED` for 3 turns |
| **Self-Respect** | Disgust | HEAL | 45 | 35 | – | **1** | 3-turn cooldown · the only heal |
| **Block** | — | SHIELD | 1 | 10 | – | 3 | **Action** — always available |
| **Recharge** | — | CHARGE | 20 | 0 | – | 3 | **Action** — +20 EC for 5 MS |
| *Self Harm* | — | SELFHARM | 25 | 0 | – | ∞ | Overload-forced, locked |
| *Feed* | — | FEED | 30 | 0 | – | ∞ | Overload-forced, locked |

**Actions** (`action = 1`) sit outside the Loadout system, always on screen inside the panel. Everything else is reached through a Loadout.

### 8.4 Shots — **`RULING`, and it replaced per-use cooldowns**

An ability can only be added to the line while it has **shots** left.

- Shots are **not** refilled each turn — whatever you do not spend is still there next turn.
- **Emptying the pool is what starts the cooldown.** Cooldown is no longer stamped on every use.
- **Finishing the cooldown refills the pool.**
- Pulling an ability back off the line **returns its shot immediately**, because `usesLeft()` counts what is currently *on* the line rather than tracking placements separately.

Shots are keyed by ability id, so a future hybrid sitting in two equipped Loadouts shares one pool. That follows the existing model; it is documented, not accidental.

> **Balance note.** With a 3-slot line, spending three shots of one ability costs your *entire* line, so cooldowns are rare in practice — roughly two per five-round fight. Shots read as a slow drain; **the 3-slot line is the real constraint.**

### 8.5 Criticals — **`BUILT`**

| | |
|---|---|
| Base chance | `RULES.critChance` = **5%**, overridable per ability |
| Modifier | `critBonus(u)` sums `crit_mult` across active statuses |
| Effect | damage **×`critMult`** (2) |
| Reward | **whoever lands it** earns one `CRIT` slot for their next line |

The whole beat is **awaited by the attack that caused it**: CRITICAL holds for `critHoldMs` (1s), the screen washes once in the attacking emotion, the earned slot flies from the tag into that fighter's line, and only then does the next station fire.

The slot is granted **at the moment of the crit** so it can be seen arriving — which is why `critFresh` exists (see §16.4).

### 8.6 Loadouts — **`BUILT`**

A **Loadout** is one emotion's set of `loadoutSlots` (4) ability slots. Six exist, one per emotion; the player carries `equippedSlots` (3) into a fight, and **they are the ability panel's pagination**.

- Slots are **positional** — a blank slot is a real, visible empty cell, which is why the sheet uses four columns rather than one list.
- `unit.pool` is **derived** for a unit with Loadouts: always-on Actions ∪ the equipped sets. A unit with none (the enemy) keeps its flat `pool` column and is unaffected.
- **`equipLoadout(u, slot, id)` is the seam** a future equip screen uses. It works today.

| Loadout | Slots |
|---|---|
| Anger | Heated Punch · Rage · Bristle · — |
| Sadness | Cold Shoulder · Grief · Self-Harm · — |
| Joy | Manic Grin · Mania · Good Vibes · — |
| Surprise | Sucker Punch · Whiplash · Out of Nowhere · — |
| Disgust | Bile · Fester · — · — |
| Fear | empty, awaiting content |

> **`OPEN`** — Disgust carries two abilities and Fear is an empty shell, and Fear has no
> enemy either. The map layer is where Loadouts are found and swapped (§13.5), so filling
> them is partly a meta-side question.

---
## 9. STATUS EFFECTS

One row per status in `status_effects`. What a status *does* lives in its columns, so **adding a status is a row plus one reader** — every reader sums across whatever is active, exactly like `regenBlocked()` and `missChance()` do.

| Status | From | Dur | Effect |
|---|---|---|---|
| **Rotting** | Fester | 2 | `block_regen = 2` — holds 2 broken layers down; they stay broken |
| **Sad** | Self-Harm | 2 | `self_hits = 1` — at each round end the victim turns one of its **own** attacks on itself |
| **Blinded** | Blinded by Hate | 2 | `miss_chance = 0.5` — half its attacks miss outright |
| **Rattled** | Out of Nowhere | 2 | `miss_chance = 0.35` — a third of its attacks go wide |
| **Dizzy** | Drug Hit | **1** | `miss_chance = 0.5` — Blinded's rate, for a single turn |
| **Nauseous** | Turn the Stomach | 2 | `miss_chance = 0.4` **and** `self_hits = 1` — two levers in one slot |
| **Spoiled** | Let It Rot | **3** | `block_regen = 3` and `crit_mult = -0.045` — layers held down, and nothing goes your way |
| **Overload** | derived (§4.3) | — | not timed; lasts while `EC > MS` |

Reader columns available today: `block_regen`, `miss_chance`, `self_hits`, `crit_mult`.
Everything else on that sheet is still marked *planned*, and a status leaning on one of those
would quietly do nothing — which is why the Disgust kit above is built only from these four.
`Spoiled` is the only status that touches `crit_mult`: −0.045 against a base `critChance` of
0.05 leaves half a percent, and *not quite never* is worse to play against than never.

**A DAMAGE ability may also hang a status.** Drug Hit was the first; `Kinds.DAMAGE` reads
`status_apply` the way `DEBUFF` always has, so an attack that staggers is two cells rather
than a special case.

> **`RULING` — `missChance()` takes the HIGHEST, it does not sum.** Two miss statuses on
> one unit are not additive, so Rattled landing on someone already Blinded is simply
> Blinded. That is why Surprise's version is cheaper than Anger's and why stacking them is
> not a strategy. Note this differs from `block_regen` and `self_hits`, which *do* sum —
> the reader decides, per column.

**Status tags carry the name of the ABILITY that applied them**, not the emotion — "BLINDED BY HATE" tells you what hit you; "BLINDED" only tells you the colour.

---
## 10. ENEMY AI

`buildEnemyLine()` in `src/battle.js`. It builds a whole line each round from its flat `pool`.

**`ai_profile` decides which of these brains it uses.** `GREEDY_MAX_DAMAGE` is the default
and what every enemy shared until an enemy needed to fight differently; `DEBUFF_FIRST` takes
every debuff it can afford that would actually land, then fills what is left. Measured over
200 line builds for The Damp: 25.9% status-carrying picks under the default, **86.4%** under
`DEBUFF_FIRST`. The scoring is damage-per-slot, so an ability whose value is not damage will
never be chosen — either give the kind a `project()` that expresses its worth, or give the
unit a profile that knows to want it.

1. **Shield** — if below half MS with no shield up and it can afford one.
2. **Debuff** — gated on `aiDebuffChance` (0.5) and on the target **not already carrying** that status.
2b. **Grow a layer** — gated on `aiGrowChance` (0.45), on having a layer slot free, and preferring an emotion the player is **not** carrying, since like does not break like and a layer the player can absorb buys nothing.
3. **Fill** the rest by score: `power × matchup(outermost layer).dmg ÷ slots occupied`, so a slow heavy hitter is weighed against the quick ones it displaces.
   - `aiChargeBias` (0.55) — leans toward charged abilities.
   - `aiVarietyChance` (0.22) — occasionally takes a random affordable attack instead of its best.
4. **Top up** with a CHARGE ability rather than idling, if it can spare the stamina.

Everything respects cooldowns **and shots**.

> **`WARNING`** — the AI scores on **damage per slot**, so anything dealing no damage scores zero and would never be chosen. That is why debuffs and layer-growers each need their own explicit branch. **Any future non-damaging kind needs the same, or it will sit in the pool unused and look broken.**
>
> This is not hypothetical. `ADDLAYER` had no branch until v0.4, so **Bristle and Bile sat
> in every pool that held them and were never once chosen** — and it does not read as a
> bug, it reads as an enemy that happens to do the same two things every round. Confirmed
> by building forty lines per enemy and listing which abilities ever appeared.

---
## 10A. THE ENEMIES — **`BUILT`, NEW in v0.4**

Six rows in `units`, and **an enemy is nothing but a row**. Adding one needs no code.

| Name | id | Tier | Emotion | MS | Layers | Slots | Where the map produces it |
|---|---|---|---|---|---|---|---|
| The Commuter | `enemy` | REGULAR | Anger | 250 | 3 | 3 | `L1:1.0` · `*:0.6` |
| The Enforcer | `enemy_anger_strong` | **STRONG** | Anger | 330 | 4 | 3 | `L1:0.5` |
| The Interruption | `enemy_surprise` | REGULAR | Surprise | 240 | 3 | 3 | `L2:1.0` |
| The Reversal | `enemy_surprise_strong` | **STRONG** | Surprise | 320 | 4 | 3 | `L2:0.45` |
| The Straggler | `enemy_sadness_weak` | **WEAK** | Sadness | 150 | 2 | **2** | `L2:0.15` · `L5:0.15` |
| The Reveller | `enemy_joy_weak` | **WEAK** | Joy | 150 | 2 | **2** | `L2:0.15` |

### 10A.1 Tier — **`RULING`: a tier is a silhouette, not a stat**

Nothing in the simulation reads `tier`. It does exactly two things, and both are about
telling the player what they are looking at:

| Tier | In the fight | On the ride |
|---|---|---|
| **WEAK** | concentric **triangles**, point up, smaller | a small triangle, ~10px |
| **REGULAR** | concentric **circles** — the original | the round body, 13px |
| **STRONG** | concentric **seven-pointed stars**, larger | a large star, ~20px |

What actually makes a strong enemy strong is its row: more MS, more layers, a deeper
pool. The shape only lets you *see* that coming. See §12 for how it is drawn and §16.12
for what it broke.

### 10A.2 `spawn_lines` — where an enemy lives

`line:weight`, pipe-separated. The weights are **relative**, drawn against each other; they
do not decide how *often* an enemy appears at all (that is the element row's `chance`),
only which one it is once the ride has decided to produce something.

Measured over 20,000 draws per line:

```
L1  Commuter 66.8%   Enforcer 33.2%
L2  Interruption 42.4%  Commuter 25.6%  Reversal 19.2%  Straggler 6.5%  Reveller 6.3%
L5  Commuter 80.1%   Straggler 19.9%
L3 / L4 / L6  Commuter 100%
```

**`*` is every line, and a named line beats it rather than adding to it** — `L1:1.0|*:0.6`
means 1.0 at home and 0.6 elsewhere, not 1.6 at home. It is not decoration: three lines
have no units of their own yet, and without a wildcard they would produce no enemies at
all.

> **Design note on the two weak ones.** Both name **L2** and the Straggler is uncommon even
> on Sadness's own L5. That makes Line 2 — Surprise's line — the one where the wrong people
> end up, which is a reading of Surprise worth keeping. Give Joy its own regular by adding
> `|L4:1.0` to the Reveller: one cell.

### 10A.3 Enemies mostly attack in their own type

Of the abilities that carry a type at all: The Enforcer is 4/5 Anger, The Reversal 3/5
Surprise, The Straggler 2/2 Sadness, The Reveller 2/2 Joy. The Commuter is deliberately
the generalist it always was.

**The off-type ability in a strong enemy's pool is the counter to being read.** The
Reversal carries `GEN_ANGER` so it can grow a layer that does *not* absorb Surprise, for
the player who turned up dressed for Surprise.

Weak enemies carry **no heavy**. A weak enemy chips; giving one a 90-power charged attack
would make it the same fight as everything else, only shorter.

### 10A.4 Personas are narrowed by tier

`dialogue` rows may carry a `tier`. An enemy uses the rows matching its emotion **and** its
tier; if there are none it falls back to the rows whose tier is blank.

> **`RULING` — blank means ANY tier, not "no tier".** The thirty original personas stay
> available to every enemy of their emotion. Without this The Enforcer would speak The
> Commuter's lines, because both are Anger — and an enemy twice the size sounding exactly
> like the ordinary one throws away everything the silhouette just said.

Twelve tier-scoped personas exist: The Bailiff / The Riot Line / The Developer (strong
Anger), The Verdict / The Blackout / The Collapse (strong Surprise), The Sleepless / The
Unread Message / The Last One Out (weak Sadness), The Last Round / The Hen Party / The
Busker (weak Joy).

**A persona needs all four states** (`INTRO`, `WINNING`, `LOSING`, `DEFEAT`) or the enemy
falls silent at the moment it was about to be interesting. `build_workbook.py` refuses to
build otherwise.

---
## 11. TUNING — LIVE VALUES

> **Every number below is a row in the `rules` sheet.** There are **109** of them. This table is a reading aid, **not the source of truth** — if it disagrees with the spreadsheet, the spreadsheet is right.
>
> **No content value may be a literal in code.** Adding a tunable means adding a row, not a constant.

### 11.1 The fight

| Rule | Value | |
|---|---|---|
| `lineCap` | 3 | permanent slots per side |
| `maxExtraSlots` | 6 | hard cap on extra slots of any kind |
| `overloadSlotPer` | 0.25 | fraction of MaxMS of overflow per forced slot |
| `stunTurns` | 1 | turns lost when the last layer breaks |
| `restEc` | 15 | EC gained by departing an empty line |
| `maxLayers` | 6 | |
| `critChance` / `critMult` | 0.05 / 2 | |
| Player / enemy MaxMS | 400 / 250 | `units` sheet |
| Starting EC | 40% of MaxMS | |

### 11.2 Pacing — **the budget per station**

A station's total time depends on **what it does**, and the step is padded to a deadline rather than built from fixed sleeps, so the rhythm stays even across abilities doing very different work:

| Station | Budget | |
|---|---|---|
| attack, shield, charge, add-layer | `attackStepMs` = **600 ms** | brisk |
| **anything applying a status** | `statusStepMs` = **2000 ms** | so it can be read |

Inside that budget: `lineTravelMs` 200 (the slide to centre, **awaited** — see §16.5) · `lineFlashMs` 90 · `flyMs` 120 · impact 45 + 85 · layer break 50 + 18.

A **critical** deliberately overruns: `critHoldMs` 1000 + `critSlotFlyMs` 520, all awaited.
**How many slots it earns is a rule, not a constant**: `critSlots` (1) for everyone, and a
passive may override it — `PAS_RUSH` makes it `rushCritSlots` (3). One flight each, so they
can be counted. `addExtra` still stops at `maxExtraSlots`, so three may land as fewer on a
line already carrying Overload.

### 11.3 What to watch in playtest

- **Off-type attacking dominates and starves both economies.** Recurring across every automated run.
- **Whoever strips layers first tends to close it out** — `EXPOSED` is ×2 and stunning on the last break compounds it.
- With a 3-slot line, **cooldowns rarely fire** (§8.4). If you want them to bite, lower `uses`; do not raise the line cap.

---
## 12. PRESENTATION

> Read `BATTLE SYSTEM/ARCHITECTURE.md` alongside this. It carries the implementation rules; this is the design intent.

### 12.1 It is a game, not a page
The distinction settles most arguments in this codebase:

- **There is one clock.** `tick()` in `src/rings.js` runs at **12 fps** and is the only heartbeat: canvas repaints, layer motion, bar tweens and the shared gradient all advance on it. CSS animations are allowed **only** as `steps(duration ÷ 83 ms)` so they land on the same frames. A smooth loop beside a stepped one instantly reads as the wrong medium.
- **Simulation and presentation are separate, and simulation wins.** The ledger changes the instant a rule says so; what the player sees is a reaction, never a gate.
- **Effects are fire-and-forget.** Nothing in `fx.js` may block the turn loop or own state the rules need. The critical beat is the one deliberate exception, and it is awaited explicitly.

### 12.2 Pixel art is drawn, not filtered
The rings, the gauges, the intro line and the title's mood line are all **rasterised at a small logical size and upscaled with `image-rendering: pixelated`**, by a **whole-number** factor. A non-integral factor makes nearest-neighbour widen the odd column and the edges crawl.

### 12.3 The interface is diegetic
There is no button bar. **The line is the control surface**: tap a station to remove it, tap the line to open Emotions, tap DEPART. The three Loadout buttons are the pagination.

### 12.4 One shape language
Every chip in the game — value tags, cost pills, status tags, tooltip stats, INFO — shares `--chipPad`, `--chipFont`, `--chipDrop`, `--chipInk`. **To make one stand out, change its background, never its geometry.**

### 12.5 One gradient
The emotion ramp is a **single sheet anchored to the viewport** (`background-attachment: fixed`), scrolling on the game clock, one loop every `frameMaxW ÷ 3`. Every element that shows it reveals the *same slice* of the *same* sheet, as if masked out of it. Per-element animations drift out of phase and cost one animation each — do not go back to them.

### 12.6 Damage reads like a brawler
Numbers are thrown beside the fighter, not attached to the bar: **MS up the right, EC up the left**, sized by the hit as a fraction of that fighter's whole stamina bar, rising and fading (600 / 600+300 / 400 ms). Overlap is expected.

### 12.7 Effects are pluggable
`AbilityFx` resolves **ability id → kind → default**, so a bespoke effect for one ability is one call and nothing else moves:

```js
AbilityFx.define("HVY_JOY", { hit(ctx){ /* only Mania does this */ } });
AbilityFx.defineKind("DEBUFF", { apply(ctx){ /* every debuff */ } });
```

Hooks today: **`hit`** (an attack connects) and **`apply`** (a status takes hold).

### 12.8 A tier is a shape — **`NEW in v0.4`**
An enemy's tier is **drawn, not printed**. There is no "STRONG" label anywhere; there is a
star instead. Weak is a triangle, regular a circle, strong a seven-pointed star, and the
enemy wears the same silhouette floating past on a ride as it does in the fight — so the
decision to take a fight is made on the same information the fight then confirms.

`paint()` already decided which band a pixel was in by asking how far it was from the
centre. A shape is a different answer to that question:

```
distance = hypot(dx, dy) / f(angle),      f in (0,1]
```

`f` is 1 where the shape reaches furthest, so **every shape is inscribed in the circle the
rings were already tuned for**. Layer geometry, breathing and spacing know nothing about
it, and the player's rings pass no shape and are exactly the circles they always were.

The silhouette **turns slowly** (`enemyShapeSpin`). A polygon that never moves reads as a
logo; the same polygon drifting a fraction of a degree a frame reads as a creature holding
still.

Three rules exist only to keep the rings from breaking under this, and they are not
cosmetic — see §16.12. Run `node shared/tools/check_rings.js` after touching any of them.

---
## 13. INTERFACE WITH THE META MODULE

> **The meta + map document does not exist yet.** This section is the contract it must satisfy. **Keep it identical in both files.**

### 13.1 Persistence — **`RULING`: MS and EC both persist across encounters within a day.**

| State | Between encounters |
|---|---|
| **MS** | **Persists.** Restored only by explicit map events (rest, food, a quiet carriage). |
| **EC** | **Persists in full.** |
| **Overflow** | Derived from MS and EC, so it **persists implicitly**. You can begin an encounter already Overflowing — and therefore already Overloaded, since Overload is now immediate (§4.3). |
| **Overload** | **Cleared** at encounter end. |
| **Statuses** | **Cleared** at encounter end. |

This is the connective tissue between the two modules and the reason the game is called *today*. Consequences the meta document must handle:

1. **Ending a fight badly is a persistent cost.** Winning at 15 MS with 60 EC means walking into the next encounter one hit from breaking.
2. **The map needs a "calm down" verb** — an action that costs time (not MS) to shed EC and/or restore MS. This is the meta layer's primary pacing lever and its main tension with whatever time pressure the day imposes.
3. **Overflow must be visible on the map**, not just in combat. The player has to be able to see they are in no state for another fight.
4. **Fleeing an encounter** must be defined. Combat assumes it may exist but does not specify it.

### 13.2 What combat needs *from* the meta module
- Player `MaxMS`, emotional type, and **the three equipped Loadouts** at encounter start.
- Encounter composition (enemy types, counts, levels) and any modifiers.
- Whether fleeing is permitted for this encounter.

> `INIT` was in this list in v0.2. **There is no initiative system** (§6.2); do not send it.

### 13.3 What combat returns *to* the meta module
- Outcome (`WIN` / `LOSS` / `FLED`), final MS and EC, rounds elapsed, and any rewards.

### 13.4 Loadouts — **`NEW in v0.3, MIRROR THIS`**

The battle system carries **six Loadouts, one per emotion**, and equips `equippedSlots` (3). **The map is where they are found, filled and swapped.** Combat only ever reads them.

- Combat needs: three Loadout ids at encounter start (`units.loadouts`).
- Combat guarantees: it never mutates them.
- The seam already exists and works: **`equipLoadout(unit, slotIndex, loadoutId)`**.
- A Loadout holds abilities of **its own emotion**; a future ability belonging to several emotions may sit in a Loadout of any of them (`abilities.emotions`).

Today Joy has only two abilities and Surprise/Fear are empty. **Filling them is a meta-side content question**, not a combat one.

### 13.5 Deferred
The **shape of the map and the day** is deliberately not specified here. It is close to — but not exactly — a timetable-driven metro network. Decided against writing it as speculation.

---

## 14. A WORKED ROUND

> v0.2's two examples walked through the **Break Countdown** and **Exhaustion**, neither of which was built. They have been replaced with one round of the system as it actually runs.

**Setup.** Player 400 MaxMS, at 210 MS / 190 EC. Enemy 250 MaxMS, at 160 MS, layers `[ANGER, ANGER, SADNESS]`. Player carries Anger / Sadness / Joy.

**Build.** 3 slots. The player taps the line, pages to Sadness, and places **Cold Shoulder** (20 EC) and **Grief** (45 EC, 2 charge — which fills the remaining two slots with charge segments, so Grief itself does not fit). They back Grief out; its shots return. They place **Cold Shoulder** ×2 and **Block**. Line cost 50 EC.

**Depart.** EC drops to 140. The line flashes white three times, parks off to the left, and travels right.

1. **Cold Shoulder** centres, flashes, strikes. Outermost layer is ANGER → `OFF TYPE`, ×1 → 35 damage. Crit roll fails. Layer cracks. Enemy 125 MS. Numbers throw up the right of the enemy; three sadness shards flash.
2. **Cold Shoulder** again. Outermost is now ANGER → 35. **Crit** — CRITICAL holds a second, the screen washes anger-red, and a slot flies into the player's line. 70 damage. Enemy 55 MS.
3. **Block** — a shield goes up. Step padded to 600 ms.

**Enemy line.** Three stations. One is **Blinded by Hate**: the station takes **2000 ms**, the player's body distorts, a red bloom swells, and the tag flies to the status row reading **BLINDED BY HATE 2**. Its two attacks: the first is absorbed by the shield; the second rolls the miss check at 0.5 and **misses**.

**Round end.** No self-hits. The enemy's broken layer regrows. Cooldowns and statuses tick. Layers reshuffle.

**Overload check.** Player EC 140 ≤ MS 210 → clear. Had the player instead pushed to 260 EC, `ceil(50 / (0.25 × 400)) = 1` forced slot would be appended, locked, in the enemy's rose colour, holding Self Harm **or** Feed.

**Next build.** The player has **4 slots** — three permanent plus the CRIT slot earned in step 2. It is gone the round after.

---
## 15. OPEN QUESTIONS

1. **`OPEN`** Party size. Everything here assumes **one player unit vs one enemy**. The prototype has never run 1-vs-N; action economy, targeting and the AI spec all assume a single opponent.
2. **`OPEN`** Is fleeing permitted, and what does it cost? (§13.1)
3. **`OPEN`** **Surprise and Fear have no abilities**, and Joy has only two. Loadouts for them are empty shells. (§8.6)
4. **`OPEN`** Should **Exhaustion** (§5.4) be built? It is specified and unimplemented. The shot economy did not exist when it was designed.
5. **`OPEN`** Off-type attacking dominates in every automated playtest (§11.3). Is that a tuning problem or a missing mechanic?
6. **`OPEN`** Ability acquisition — meta-side, but combat needs to know whether Loadouts can be edited mid-day.
7. **`RESOLVED in v0.3`** ~~The ability set is undesigned~~ — §8.3.
8. **`RESOLVED in v0.3`** ~~Do AVUI's four emotions map onto PARALEL's six~~ — AVUI has **six**, listed in §7.1 with official hexes.

---
---

## 16. WARNINGS — TRAPS THIS PROJECT HAS ALREADY FALLEN INTO

> Every one of these cost real debugging time. They are listed because each was **invisible until measured** — the code looked right, and in most cases a screenshot looked right too.

### 16.1 Verify the mechanism, not a proxy for it
The single most expensive habit. Examples that shipped bugs:

- Ability taps stopped working entirely. The test called `row.click()` directly, which **bypasses the pointer path** and could never have caught it. The cause was `setPointerCapture` on *pointerdown*, which retargets the following `click` to the capturing element. **Verify a tap by asserting `hasPointerCapture()` is false after a plain pointerdown.**
- Shields sat inside the attack line across two passes. The first fix measured them **at rest** and passed; the idle wave animation lifted them 8px into the lane. **Sample across a whole animation cycle, not one frame.**

### 16.2 Overload is derived and must never be stored
`tickStatuses()` decrements every entry it finds. Put Overload in `unit.statuses` and it ticks itself away. It lives outside and is merged in at render time.

### 16.3 `applyOverload` must clear its own slots before measuring
It is called from two places and **appends**. Without dropping the previous round's forced slots first, they accumulate every round until the line is nothing but forced stations.

### 16.4 A CRIT slot is granted mid-line and must survive exactly one build
It is added the moment the crit lands so it can be *seen* arriving. The end-of-round sweep therefore has to tell a slot that has not yet had a line (`critFresh`) from one that has — otherwise it sweeps away the slot the player just watched fly in.

### 16.5 Never fire an ability before its station has arrived
The station is told to slide to centre and the slide takes `lineTravelMs`. Firing 40 ms later meant the symbol launched from wherever the line happened to be mid-travel. **Also**: take the launch point from the **lane's centre**, not the station's rect — the rect is only correct once the transition has visually settled.

### 16.6 Animation state that outlives its animation
- **Never leave a WAAPI animation `fill`ing.** A filled `clip-path` stays on the element for ever — and a clip-path on a container clips children positioned *outside* its box. That is what made the DEPART button invisible. Cancel on finish.
- **Never animate `clip-path`** for an entrance; it is among the most expensive properties and leaves this residue. Use `transform` + `opacity`.
- **An animated `filter` wipes a static one.** If an element carries a bloom in `filter` and something animates `filter`, repeat the bloom inside the keyframes.
- **A CSS `animation` shorthand replaces the whole list.** Hold shared animation lists in a custom property so one rule can prepend to them.

### 16.7 Measurement traps in layout
- **A width of zero silently becomes a tall stack of text.** A hidden tab and an un-laid-out wrapper both report 0. Anything rasterising wrapped text must fall back through sources **and redraw on resize**.
- **`window.innerWidth` is NOT the game's width.** The frame is capped at `frameMaxW`; on desktop the window is several times that. A box wider than its container cannot be centred by `margin:auto` — it left-aligns and its contents land off-screen.
- **A centred column that overflows loses its TOP, silently.** Anything full-screen needs one element designated to give way.
- **`getBoundingClientRect()` includes transforms.** The enemy sprite is permanently mid-transform; use `offsetLeft`/`offsetTop` for layout positions.
- **A centred flex track does not start at its container's edge.** Any maths positioning a station must include `track.offsetLeft`.

### 16.8 Audio
- **Recorded audio must not go through the SFX chain.** The theme spent a pass routed through the 12-step bit-crusher and a 7.2 kHz lowpass — measured, it collapsed the mix from ~52,900 distinct sample levels to ~780 and multiplied its high-frequency energy by 5.6. Synthesised blips survive that; a recorded mix does not. `cleanBus` exists for this.
- **A seamless loop must be scheduled on the audio clock**, at `t0 + opening.duration`. An `ended` handler or a timer leaves an audible seam.

### 16.9 Fonts
**`font-weight` alone does not make text bold on mobile.** Most mobile monospace fallbacks ship no bold face, so raising the weight changes nothing and every label renders hairline-thin. `-webkit-text-stroke` in `currentColor` is what actually thickens glyphs.

### 16.10 Delete CSS by name, never by slicing between markers
A cleanup pass removed everything between two anchors and took the tooltip and status-tag rules with it. An element with no rule is not obviously broken — it silently becomes `position: static` and flows to the bottom of the page.

### 16.11 A tag about a fighter belongs on that fighter
Centre-screen tags cannot say who they are about. When both sides suffer the same thing in one round, two legitimate announcements read as one firing twice. `unitTag()` places it on the body; `bigTag()` is for things that happen to the whole battle.

### 16.12 A shape does not just bend a ring, it thins it
Ring bands are constant in *shape* space, so their thickness in **pixels** is multiplied by
the same factor that bends the outline. A true triangle is at half its radius along the
flats, which put the 1.8px inner rings under one pixel there: they broke into dashes, then
vanished — and the sprite still looked like a sprite. `enemyTriRound`, `enemyShapeFill` and
`enemyShapeBreathe` exist only to hold that line.

**`enemyShapeFill` has a ceiling as well as a floor.** At 2.0 every ring passed the check
and the sprite was wrong anyway: the gaps between bands fell under a pixel and the rings
merged into a solid shape — a *filled* triangle rather than concentric ones. Both failures
look like "the art is a bit off"; only one of them is caught by asking whether the rings
survive.

### 16.13 Three ways to measure the same thing, two of them wrong
`shared/tools/check_rings.js` was written three times, and the first two versions **both
accused the plain circle enemies** — which have looked correct since the day they were
drawn. That is the tell: when a new check condemns something already known to be good, the
check is what is broken.

- A **ray** fired from the centre rounds to integer pixels, so it steps clean past bands
  that *are* drawn, just not on that exact line.
- **Fixed angular sectors** cannot work across ring sizes: the innermost ring is about
  twenty-five pixels round in total, so most of seventy-two five-degree sectors are empty
  by geometry, not by fault.
- What actually reads as a broken ring is a **gap**: the widest angular distance between
  two consecutive pixels of the same band, converted to pixels of arc at that band's own
  radius. An unbroken ring scores about 1, whatever its size.

**Calibrate a new visual check against something already known to be right**, and make the
number mean something before trusting the verdict.

### 16.14 A dangling id in a pipe list is a balance change nobody made
`pool.map(a => ABILITIES[a]).filter(Boolean)` drops an ability id that does not exist. It
does not throw, nothing looks broken, and the enemy simply fights with one fewer ability
than it was designed with. The `checks` sheet cannot see inside `"ATK_ANGER|HVY_ANGER"`
either — and those hand-typed pipe lists are the references most likely to be wrong.
`build_workbook.py` validates them at build time and refuses to build on one.

Two of the sheet's own formulas had already rotted the same silent way: one counted
"enabled abilities" against a hard-coded 10 when there were 15, and another validated
`units` column G for a blank pool, which stopped being `pool` the moment the sheet grew a
column. **A validation row that goes red because the game grew teaches everyone to ignore
the validation sheet.**

---

## 17. ANIMATION AND PACING GUIDELINES

> House rules. They are also written at the top of `styles/game.css`, because that is where they get broken.

### 17.1 Twelve frames a second, everywhere
One clock. Every CSS loop is `steps(duration ÷ 83 ms)` — **there are currently zero non-stepped looping animations**, and that is a property worth keeping. Check it with a grep for `ease-in-out infinite` before shipping.

**Why it matters beyond taste:** `setInterval(tick, 83)` drifts badly — measured gaps averaged **115 ms and spiked to 334 ms** against a nominal 83, while `tick()` itself cost 1.1 ms. The clock is a fixed-step `requestAnimationFrame` loop with a **watchdog timer**, because rAF is *suspended outright* on a hidden tab, not throttled.

### 17.2 Pace by what a thing means
| Beat | Budget | Why |
|---|---|---|
| an attack | **600 ms** | brisk; the rhythm of the fight |
| a status landing | **2000 ms** | the player has to read what just happened |
| a critical | **~1520 ms**, awaited | hold, wash, the earned slot flies in |
| a bar change | ~1000 ms | it was 2 s once and dragged badly |
| a floating number | 600 in / 900 hold / 400 out | |

**Pad to a deadline, never sum fixed sleeps.** Padding keeps the rhythm even across abilities doing very different amounts of work. It can only *lengthen* a short step — anything whose internals exceed the budget will overrun, so the constituent timings have to fit inside it.

### 17.3 Nothing overlaps
Two effects on screen at once read as a bug. Effects are fire-and-forget, but the *step budget* is what keeps them apart. When adding an effect, ask what budget its station has.

### 17.4 Animate `transform`, `opacity`, `filter`
Never layout properties. Never `clip-path`. Prefer one animated `drop-shadow` to two — an animated `filter` repaints every frame, and it was measurably costing frame budget with four tags breathing at once.

### 17.5 Do not animate what nobody can see
A closed Emotions panel was running 19 animations every frame — eight floating depictions and seven rainbow pills. `animation-play-state: paused` on a closed panel took running animations from 37 to 18.

### 17.6 Upscale by whole numbers
Pixel art is drawn small and scaled up by an **integer** factor. 3200 ÷ 533 = 6.004 makes nearest-neighbour widen the odd column and the edges crawl.

---

## 18. CHANGELOG

**v0.4** — **Five more enemies, and a tier you can see.** §10A is new: six enemies rather
than one, each a row in `units`, placed on the network by `spawn_lines`. `tier` is
introduced as a **silhouette, not a stat** (§10A.1, §12.8) — weak wears concentric
triangles, strong concentric seven-pointed stars, on the ride and in the fight alike, and
an enemy on a ride is painted in **its own emotion rather than the line's**.

Surprise gained the three-piece kit it never had (§8.3) and a status of its own, `RATTLED`
(§9); Joy gained `GEN_JOY`, filling both Loadouts. Personas are now narrowed by tier
(§10A.4), with twelve new ones.

Four warnings added: §16.12 a shape thins the rings it bends, §16.13 two of three ways to
measure that were wrong and both accused known-good art, §16.14 a dangling id in a pipe
list is a silent balance change. §9 records the ruling that `missChance()` takes the
highest rather than summing.

**v0.2** — Reworked from v0.1. Resolved five internal contradictions (Example B's unnoticed Overload; `Repress` being unable to cure Exhaustion; Apathy's self-harm generating no EC; Overload's two conflicting exit conditions; "permanent" MS loss vs. a heal ability). Replaced the instant `EC ≥ MS` flip with the **Overflow gauge**; made Overload **deterministic and telegraphed**; fixed **Exhaustion** into a real penalty by halving EC gain; **halved all ability costs** and added a cost-budget rule; rebuilt the type chart as a **closed 4-cycle**; added turn structure, order of operations, initiative, action economy, status system, AI spec, tuning budgets, and the **meta-module interface**. Locked persistence: MS and EC carry across the day.

Also flagged v0.1's ability list as **fabricated and non-canonical**, demoted it to explicit throwaway scaffolding, and replaced it with a **role checklist** (§8.4.1) for the from-scratch ability design pass.

**v0.3** — **Rewritten against the built prototype** (39 passes). This version describes what exists; where v0.2 specified something that was never built, it now says so explicitly rather than reading as current.

*Abandoned:* the **Break Countdown** (§4.3 — Overload is immediate), **initiative** (§6.2), the Overload **forced-action/wildTarget** model (§4.3 — forced stations are appended instead), and the charge→opponent-slot rule (§6.3, retired twice). **Exhaustion** (§5.4) is marked specified-but-not-built.

*Now documented as built:* the **line model** with typed extra slots · **shots** replacing per-use cooldowns · **criticals** · **Loadouts** · the **status system** and its reader columns · **like-does-not-break-like** · **stun on last layer break** · the real **ability set** (26) · the real **tuning values** (179 rules) · the **AI** and its
`ai_profile` column · the **HEAL** kind · **progression objectives** (see the Progression
GDD) · the **Line Manager** set pieces.

*Added:* §16 **Warnings** — eleven traps this project already fell into, each with the measurement that caught it. §17 **Animation and pacing guidelines**. §13.4 **Loadouts** as a meta contract, marked `MIRROR THIS`.

**v0.2a** — Flagged §6.3 as superseded by prototype 01's multi-ability line model. Numbers in §8.3/§11 pending recalculation.

**v0.1** — Initial draft, partly hallucinated. Archived at `_ARCHIVE_v0.1_combat_gdd.md`.
