# NEURO-METRO: AVUI
## System Design Document: Player Account, Progression & Inventory
**Document Scope:** Meta-Progression, Economy, and Loadout Systems
**Platform:** Mobile Web (Portrait Orientation)

---

### 1. PLAYER ACCOUNT & PROFILE
*   **Player Naming:** Players input a custom name upon starting. This name appears above their location indicator (a stylized arrow) on the global Metro Map.
*   **Emotional Affinities:** During onboarding, players select up to `affinitySlots` (2) "Emotional Affinities" (e.g., Anger & Fear). **One is enough** — the slot count is a ceiling, not a requirement, and both screens that ask say so. 
    *   *Cosmetic Impact:* Dictates the UI color scheme of their map indicator, player name, and profile screen.
    *   *Mechanical Impact:* (System defined, values pending testing). Grants specific passive gameplay bonuses tied to the chosen emotion.
*   **Player Profile Card (Pause Menu):** Accessed via a dedicated button on the map UI. Displays the player's name, affinities, current loadout, currency balances, and active Line Keys.

### 2. SAVE SYSTEM & ANTI-EXPLOIT
*   **Save Triggers:** The game auto-saves *only* while the player is on the Map (docked at a station or in menus).
*   **Combat Disconnects:** There is no mid-battle saving or track-journey saving. If a player closes the game, drops connection, or refreshes the browser during a transit/battle, the game registers this as a **Defeat**, applying the standard penalty (loss of unbanked loot) and returning them to their departure station.
*   **Data Persisted:** Current Station, Inventory (Crystals, Move Sets, Armor, Keys), Equipped Loadout, Account Info.

---

### 3. PROGRESSION SYSTEM & EQUIPMENT SCALING
*   **No Base Levels:** The player character does not possess traditional XP or levels. 
*   **Emotional Armor (Mental Stamina Scaling):** Player power and survivability scale entirely through acquired equipment. Armor serves as a metaphor for the player's gathered life experience—never letting go of what you've learned, forging resilience. Each piece of Emotional Armor dictates:
    *   **MS Modifiers:** Defines the base and max Mental Stamina pool.
    *   **Emotional Layers:** Dictates which and how many specific emotion types are loaded into battle. **`BUILT` — 0 to 4 today**, and the ceiling is `maxLayers` (6) rather than however many columns the sheet happens to have: `armor` carries `layer1`..`layer4` and adding a fifth is a column here and a column in `layersOf()`, nothing else. `ARM_SCARS` grants one, most grant two, `ARM_STATIC` three and `ARM_FONDO` four.
    *   **Passive Effect:** 1 unique trait modifying survivability, defense, or utility. `BUILT` — see §5.

---

### 3b. PROGRESSION OBJECTIVES — **`BUILT`**
The Wandering Store (§4) is not the only way to acquire equipment, and it is not the first
one built. **Specific stations hold specific things**, and beating what waits there is how
you get them. One row of the `objectives` sheet per thing, and **no station is named
anywhere in the code**.

| column | |
|---|---|
| `station` | a `stations` id — where a floating, colour-coded **?** appears on the map |
| `emotion` | colour-codes that ? |
| `requirement` | the standardised test. `DEFEAT_BOSS` is the only verb implemented |
| `unit` | which `units` row the boss at that station fights as |
| `reward` | a pipe list of `KIND:ID` — `ARMOR:` and `SET:` add to what the profile **owns**, `KEY:` grants a Line Key |
| `once` | 1 retires the marker once cleared |
| `card_tag` | what the station panel warns: `ENTITY` or `TREASURE` |

The three that exist: **Fondo** leaves `ARM_FONDO` (four layers of Anger), **Sant Antoni**
leaves the Set of Rush, and **Urquinaona** holds the Line Manager, who has the key to Line 4.

> **`RULING` — the requirement is a vocabulary, not a condition.** A free-text condition per
> row would make every objective its own special case, checked in its own place, and the
> fifth would need code the way the first did.

> **`RULING` — rewards are owned, not worn.** `ARMOR` and `SET` go onto the shelf and change
> nothing about what the player is carrying. Turning up in new armor because you won a fight
> undoes whatever build they deliberately chose, at the one moment they are least expecting
> the game to touch it. A Line Key is the exception: it is not worn, it opens a line.

### 4. INVENTORY & ECONOMY
*   **Primary Currency (Emotion Crystals):** Defeating enemies and completing tracks rewards Emotion Crystals (Anger, Disgust, Joy, Sadness, Fear, Surprise). 
    *   *Mixed Costs:* Purchasing high-tier or highly complex items may require a mix of multiple crystal types (e.g., 100 Joy + 50 Sadness).
*   **The Wandering Store Network:** 
    *   **Mobility:** Stores are not static. Only ~5 stores exist per Metro Line, and they physically move between stations 3 times a day depending on the time of day.
    *   **Dynamic Inventory:** Store stock rotates dynamically based on a combination of RNG and the real-world weather/time of day mechanics.
    *   **The Trade-in Economy:** Purchasing advanced tiers of a Move Set requires both crystals *and* trading in the previous iteration (e.g., acquiring "Set of Anger IV" requires handing over "Set of Anger III").

---

### 5. COMBAT LOADOUT SYSTEM
The player's combat capabilities are strictly defined by their loadout, which must be configured *before* embarking on a trip. **Loadouts cannot be changed mid-journey or mid-battle.**

*   **Emotional Armor Slot:** Equips 1 piece of armor, determining MS limits and available Emotional Layers.
*   **Move Sets (Emotional Sets):** **`RULING` — sets are independent of layers.** They were originally specified as slotting *into* the layers the armor provides; they do not. **Armor governs MS and Emotional Layers; Move Sets govern the ability pool**, and the player carries `equippedSlots` (3) of them regardless of how many layers the armor grants. Wearing one-layer armor does not cost you two Move Sets. See `deriveStats()` in `MAP/src/gear.js`, which is the one place any of this is worked out.
    *   **1 to 4 Fixed Abilities.** The Set of Rush carries exactly one, deliberately — what it sells is its passive.
    *   **EC Modifiers:** Alters the maximum or starting Emotional Charge capacity.
    *   **1 Passive Effect:** A unique combat trait augmenting the playstyle of the set.
      **`BUILT` — two are live**, and both are the reason to carry a one-ability set:
      `PAS_JOLT` (Set of Jolt) returns `joltEc` (20) charge every time one of your attacks
      misses, and `PAS_RUSH` (Set of Rush) makes a critical earn `rushCritSlots` (3) extra
      line slots instead of `critSlots` (1). The rest are still named and inert.
