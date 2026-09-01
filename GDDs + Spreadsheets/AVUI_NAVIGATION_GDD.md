# NEURO-METRO: AVUI
## System Design Document: Map, Navigation & Meta Exploration
**Document Scope:** Meta-Exploration Module (Sibling to Combat System GDD)
**Platform:** Mobile Web (Portrait Orientation - HTML5 / CSS3 / JavaScript)
**Core Paradigm:** Non-Euclidean Metro Navigation, Risk/Reward Track Survival, Global World State

---

### 1. HIGH-LEVEL OVERVIEW
The meta-exploration system in *Neuro-Metro: AVUI* transforms the Barcelona Metro network into a surreal, non-Euclidean nightmare world. Players navigate between real stations, traveling through distorted transit tracks where space stretches, time warps, and emotional echoes manifest as physical entities. Every trip is a high-stakes wager: continue along the line for compounding rewards with no healing, or pull the emergency brake to secure partial loot at the next stop.

---

### 2. BARCELONA METRO MAP & NETWORK STRUCTURE

#### Global Map View
*   **Visual Layout:** Vector-styled, portrait-optimized representation of the full Barcelona Metro network (L1, L2, L3, L4, etc.).
*   **Player Position:** The player is docked at one specific station at any given time.
*   **Station Inspection (Peeking):** Tapping any station reveals its current real-time state, weather conditions, active modifiers, and enemy threat levels.
*   **Forward Track Projection:** A station's active state projects **backward onto the track segment preceding it** relative to the player's vector of travel. (e.g., Traveling from *Clot* to *Glòries* uses *Glòries*' current environmental modifiers for the track segment).

#### Junction Stations & Line Keys
*   **Line Transfer Restrictions:** Players cannot switch to a new Metro line at transfer junctions (e.g., *Passeig de Gràcia*, *Sagrada Família*) without possessing the target line's **Line Key**.
*   **Line Managers (Major Bosses):** Line Keys are progression-gate items awarded exclusively upon defeating the **Line Manager** commanding that specific transit line.

---

### 3. DYNAMIC WORLD STATE ENGINE

Station and track states fluctuate globally based on real-world inputs synced across all connected players.

#### Environment Modifiers
*   **Real-World Triggers:** Real-time Weather API (Barcelona coordinates), Hour of Day, and Day of the Week.
*   **Dynamic Attributes:**
    *   **Visibility / Fog:** Restricts the ability to preview station details from the global map view.
    *   **Enemy Density:** Alters spawn rates on tracks (1–3 second intervals).
    *   **Aggro Rating:** Probability that spawned enemies actively chase the train vs. passively floating past.
    *   **Track Diltransience:** Multiplier governing how many **Track Segments** are needed to bridge two adjacent stations.

---

### 4. THE TRACK JOURNEY (NEURO-METRO PHASE)

When a trip begins, the interface smoothly transitions from the macro map view into the micro track view.

```
+------------------------------------+
|  STATION: CLOT ---> GLÒRIES        |  <- Progress Header (Track Segments: 2/5)
+------------------------------------+
|                                    |
|    [ Floating Loot / Echoes ]      |  <- Fast fly-by objects (Quick Tap)
|                                    |
|          /|=========|\             |
|         / |  TRAIN  | \            |  <- Central Neuro-Metro Train
|        /  |=========|  \           |
|                                    |
|     [ Agro Enemy Chasing! ]        |  <- Tap to engage or get force-attacked
|                                    |
+------------------------------------+
| HEALTH: 85 MS | CHARGE: 20 EC      |  <- Persisted Combat State
+------------------------------------+
```

#### Non-Euclidean Track Loop
*   **Infinite Background Loop:** The background animates a continuous tunnel scroll until the trip conditions are satisfied.
*   **Track Segments:** The distance between stations is non-linear. To complete a station-to-station link, the player must collect a required number of **Track Segments** dropped by track events or earned through surviving interval rolls.
*   **Object Spawning Engine:** Every 1 to 3 seconds, the game rolls a random track event:
    *   **Stationary/Parallel Objects:** Drift alongside the train for several seconds.
    *   **Fly-by Objects:** Rocket past in the opposite direction (requires fast reflexes to tap for resources/loot).
    *   **Passive Enemies:** Tapping them initiates combat; ignoring them lets them fly past safely.
    *   **Agro Enemies:** Lock onto the train and force the player into combat after a brief countdown (`aggroLockSecs`, 5).
    *   **`RULING` — locking on is a property of the SPAWN, not of a separate object.** It was
        first built as its own `travel_elements` row, which made an ambusher a different *kind
        of thing* from an ordinary enemy competing for the same slice of the same roll — so
        making ambushes rarer made *enemies* rarer, and the two could never be tuned apart.
        There is one enemy row, and `aggroChance` (0.25) decides per spawn, multiplied by the
        target station's own **Aggro Rating** — which is what that modifier has always been
        for. `aggroTiers` gates it to `WEAK|REGULAR`: a hard fight you did not choose is a
        punishment, and the one thing that makes a STRONG enemy fair is that taking it on is a
        decision. Measured: WEAK 26.6%, REGULAR 25.5%, STRONG 0%.
    *   An enemy that has locked on wears a **colour-coded flashing ⚠** and a countdown ring
        `aggroRingThick` (2) pixels deep. The sign says *this one is coming*; the ring says
        *how long you have*.

#### Persistent Combat Rules
*   **Zero Recovery Rule:** Health (Mental Stamina) and Emotional Charge (EC) **do not automatically refill** between battles on the tracks.
*   **Resource Carryover:** Status conditions, damaged MS, and built-up EC persist from one track encounter to the next until the player safely exits at a station.
*   **Running away — `BUILT`.** Holding anywhere on the battle arena for `fleeHoldMs` (3s)
    closes a ring under the finger and abandons the fight, at a cost of `fleeSegmentCost` (5)
    **Track Segments** off the current leg, never below zero. It is deliberately not a button:
    a control that says *leave* every turn is an interface arguing against its own subject.
    The outcome is `FLED`, which is **not** a loss — nothing about the player's state is worse
    than it was, and the ride is not over.

---

### 5. STATION ARRIVAL & RISK/REWARD WAGER

Upon accumulating all required Track Segments for the current segment, the train approaches the next physical station.

#### Arrival Sequence
1.  **Visual Transition:** Station platform lighting appears; announcer audio plays (*"Propera parada: [Station Name]"*).
1b. **The Guardian announces itself — `BUILT`.** At the destination, a full-bleed banner holds
    for `guardianWarnMs` (3s) — **GUARDIAN ENTITY MANIFESTING** — and then the fight begins on
    its own. There is no button, because there is no choice, and offering one would be a lie
    about what a Guardian is. What the three seconds buy is the moment to read the room. A
    **Line Manager** gets different words *and shakes*: a Guardian manifests, which is a thing
    arriving; she appears, which is a thing that was always there deciding to be seen.
2.  **The Traveler's Dilemma Prompt:** The train pauses at the platform, offering two choices:

```
+---------------------------------------------------------+
|                  PROPERA PARADA: GLÒRIES                |
+---------------------------------------------------------+
| [ EXIT HERE ]                      [ CONTINUE TRIP ]    |
| - Secure Current Station           - Keep 100% Loot     |
| - Keep 60% Track Loot              - ZERO Recovery      |
| - Safe Checkpoint                  - Target Boss Ahead  |
+---------------------------------------------------------+
```

#### Risk / Reward Mechanics
*   **Choice A: Exit Station (Bank Partial Loot)**
    *   Player safely disembarks. The station becomes their new active checkpoint.
    *   **Penalty:** Player loses **40%** of all unbanked loot/resources collected during *this active trip*.
*   **Choice B: Continue Trip (Push the Wager)**
    *   Player stays on the train toward the next station.
    *   **Reward:** 100% of collected loot remains in the temporary vault.
    *   **Risk:** MS and EC remain at their current damaged/volatile values. No healing.
*   **Choice C: Final Destination & Station Boss**
    *   Reaching the target destination chosen on the map triggers a mandatory **Station Boss Encounter** (distinct from Line Managers).
    *   **Victory:** Unlocks 100% of accumulated trip loot, sets the destination as the new current station, and fully restores Mental Stamina.
    *   **Defeat at any point:** Wipes **90%** of collected trip loot and teleports the player back to their original departure station.

---

### 5b. WHICH SHEET DRIVES WHAT

Everything above is data. The workbook is `battle-system-config.xlsx`; nothing in this
document is a number a designer has to open a `.js` file to change.

| sheet | drives |
|---|---|
| `stations` | one row per **place** — `state`, `spawn`, `fog`, `threat`, `diltransience`, x/y |
| `metro_lines` | one row per line, `stations` in running order. Colour comes from the emotion |
| `travel_elements` | what appears around the train: chance, caps, life, drift, payload |
| `world_bands` | day / hour / weather → multipliers on a station's live attributes |
| `city_status` | conditions happening to Barcelona (Rush Hour), and which stations they land on |
| `objectives` | what can be earned, where, and the **?** that marks it (Progression GDD §3b) |
| `items` | placeholders, so the roll-and-lose machinery has something to roll |
| `rules` | every tunable named in this document |

### 6. DATA PERSISTENCE & GLOBAL SYNC ARCHITECTURE

*   **Player State Schema:** Tracks current docked station, inventory, unlocked Line Keys, equipped combat loadout, and unbanked vault items.
*   **Global Server Clock & Weather Engine:** Centralized server computes station modifiers based on time/weather and broadcasts state payloads to all connected web clients upon request.
*   **Session Anti-Exploit:** Trip state is tracked server-side or in local encrypted session locks. Force-closing the web browser mid-trip counts as a defeat, resetting the player to the departure station.
