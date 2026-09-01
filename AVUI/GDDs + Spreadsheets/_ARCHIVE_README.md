# The `_ARCHIVE_v0.1_*` files are not the game's data

They are the **first-pass design sketches**, kept for reference. Every one of them has since
been superseded by a sheet in `battle-system-config.xlsx`, and where they disagree with that
workbook, **the workbook is right and these are wrong**.

They were renamed rather than deleted because they were a live hazard: opening
`neuro_metro_avui_armor_config.csv` told you armor had four pieces with **two** layer slots
and no passives, while the game had six pieces with up to **four** and every passive filled.

| archived file | superseded by | how they disagree |
|---|---|---|
| `_ARCHIVE_v0.1_armor_config.csv` | the **`armor`** sheet | different ids (`ARM_01` vs `ARM_SCARS`), no `layer3`/`layer4`, no passives, and missing `ARM_STATIC` and `ARM_FONDO` |
| `_ARCHIVE_v0.1_moveset_config.csv` | the **`loadouts`** sheet | different ids (`ANG_01` vs `LO_ANGER`) and abilities that do not exist (Venting Strike, Spiteful Block, Furious Lash…) |
| `_ARCHIVE_v0.1_affinity_config.csv` | the **`emotions`** sheet | different ids (`AFF_01` vs `ANGER`) and different hexes — Anger is `#e53859` in the game, not `#FF2222` |
| `_ARCHIVE_v0.1_combat_gdd.md` | `AVUI_COMBAT_GDD.md` | the v0.1 combat design |

**There is one source of truth for content, and it is the workbook.** It compiles
workbook → CSV → `data.js` via `../REBUILD.command`; nothing reads these files.
