#!/usr/bin/env python3
"""
Regenerate data.js from spreadsheet CSV exports.

    python3 tools/build_data.py <folder-of-csvs>

In Google Sheets: File > Download > Comma-separated values, once per sheet.
Google names them like "battle-system-config - abilities.csv"; this matches on the part
after the last " - ", so you can drop the whole export folder in as-is.

Sheets that are reserved (layer_types, synergies) and the README/checks sheets
are ignored — nothing reads them yet.
"""
import sys, os, glob, re, csv, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _paths import app_root, csv_dir

# spreadsheet-side balancing helpers — meaningless at runtime, so they are
# stripped rather than shipped into data.js
# One declaration per table. Only the tables THIS app carries are emitted: a fixed
# block would call parseCSV(undefined) for anything absent and take the whole file
# down with it — which is precisely what happened the first time MAP was built.
CONST_FOR = {
 "emotions":       'const EMOTIONS  = byId(parseCSV(DATA.emotions));',
 "abilities":      'const ABILITIES = byId(parseCSV(DATA.abilities));',
 "units":          'const UNITS     = byId(parseCSV(DATA.units));',
 "rules":          'const RULES     = Object.fromEntries(parseCSV(DATA.rules).map(r=>[r.key,r.value]));',
 "sounds":         'const SOUNDS    = byId(parseCSV(DATA.sounds));',
 "matchups":       'const MATCHUPS  = parseCSV(DATA.matchups);',
 "dialogue":       'const DIALOGUE  = parseCSV(DATA.dialogue);',
 "status_effects": 'const STATUSES  = byId(parseCSV(DATA.status_effects).filter(r=>r.enabled));',
 "moments":        'const MOMENTS   = parseCSV(DATA.moments).filter(r=>r.enabled);',
 "loadouts":       'const LOADOUTS  = byId(parseCSV(DATA.loadouts).filter(r=>r.enabled));',
 "prompts":        'const PROMPTS   = parseCSV(DATA.prompts).filter(r=>r.enabled);',
 "stations":       'const STATIONS  = byId(parseCSV(DATA.stations).filter(r=>r.enabled));',
 "metro_lines":    'const LINES     = parseCSV(DATA.metro_lines).filter(r=>r.enabled);',
 "travel_elements":'const ELEMENTS  = byId(parseCSV(DATA.travel_elements).filter(r=>r.enabled));',
 "items":          'const ITEMS     = byId(parseCSV(DATA.items).filter(r=>r.enabled));',
 "armor":          'const ARMOR     = byId(parseCSV(DATA.armor).filter(r=>r.enabled));',
 "world_bands":    'const WORLD_BANDS = parseCSV(DATA.world_bands).filter(r=>r.enabled);',
 "city_status":    'const CITY_STATUS = parseCSV(DATA.city_status).filter(r=>r.enabled);',
 "objectives":     'const OBJECTIVES  = parseCSV(DATA.objectives).filter(r=>r.enabled);',
}

DROP_COLUMNS = {"suggested_cost", "cost_delta"}
HERE   = os.path.dirname(os.path.abspath(__file__))
# `--app "<name>"` picks which app receives the generated tables.
APP    = app_root()
OUT    = os.path.join(APP, "data.js")

# Which tables each app receives. One workbook, but an app only carries what it
# actually reads — otherwise MAP ships the whole ability list and BATTLE ships the
# whole network. `emotions` and `rules` are the shared spine and belong to both.
APP_TABLES = {
  "BATTLE SYSTEM": ["emotions", "abilities", "matchups", "units", "dialogue", "rules",
                    "sounds", "status_effects", "moments", "loadouts", "prompts"],
  # MAP's own sheets. More get added here as the map GDD defines them.
  "MAP":           ["emotions", "rules", "sounds", "units", "abilities", "loadouts",
                    "stations", "metro_lines", "travel_elements", "items", "armor",
                    "world_bands", "city_status", "objectives"],
}
TABLES = APP_TABLES.get(os.path.basename(APP), APP_TABLES["BATTLE SYSTEM"])
# Emitted in CONST_FOR's own order, not TABLES' — declaration order is part
# of the generated file, and reordering it would make every rebuild a diff.
CONSTS = "\n".join(v for k, v in CONST_FOR.items() if k in TABLES)

HEADER_COMMENTS = {
 "emotions":  "one row per emotion. `token` maps to the CSS palette variable.",
 "abilities": "kind DAMAGE|SHIELD · power = damage or shield charges · blank emotion = typeless\n   (never matches a layer) · hits_layer = whether a hit rotates the target's queue.",
 "matchups":  "attack emotion x layer emotion. '*' is a wildcard, 'NONE' means the target has\n   no layers. Highest priority wins, so a specific pair always beats a wildcard.\n   Adding a synergy is adding a row.",
 "units":     "layers are outermost-first and rotate as they take hits. pool = usable abilities.\n   tier is WEAK|REGULAR|STRONG and decides the SILHOUETTE, not the stats. spawn_lines is\n   line:weight, `*` for every line - where the map may produce this enemy.",
 "rules":     "global tunables, read by name.",
 "sounds":    "synthesised at runtime, no audio files. wave: square|sawtooth|triangle|sine|noise.",
 "prompts":   "the cue above the attack line; one is drawn at random each turn.",
 "loadouts":  "one Loadout per emotion. Slots are positional and a blank slot is a real\n   empty slot in the panel. A Loadout may hold any ability whose emotion set\n   includes its own emotion (see abilities.emotions).",
 "moments":   "title-screen mood line. day is MON..SUN or *; hours are BARCELONA local,\n   to_hour exclusive, and a band may wrap past midnight. Highest priority wins.",
 "status_effects": "one row per status. Abilities apply these by id via status_apply.\n   block_regen = layers held down; miss_chance = attacks the victim fluffs;\n   self_hits = the victim turns one of its own attacks on itself each turn.",
 "stations":  "one row per PLACE, not per stop: an interchange is a single station that\n   several lines call at. `lines` and `emotions` are that station's own — seeded\n   from the lines calling there, but free to diverge. `state` is the station's\n   condition and drives what the map shows and what it does to a player passing\n   through; blank means nothing special. x/y are schematic world units — the\n   renderer squares every link to 45 degrees, so they need only be roughly right.",
 "travel_elements": "what can appear around the train during a ride. `chance` is rolled\n   per element every `travelRollSecs`; `max_on_screen` caps how many may exist at once\n   and `max_per_trip` how many one ride may ever produce. life_min/life_max are seconds.\n   `drift` is how fast it moves relative to the track — above 1 reads as nearer the\n   camera. Every one of these is a BASE, scaled by the target station's `spawn` column\n   and by any temporary modifier in play.",
 "armor": "Emotional Armor (progression GDD 3). `ms_mod` is added to the player's base\n   MaxMS; layer1/layer2 are the Emotional Layers it grants in battle \u2014 blank means the\n   armor grants none. One `passive` per piece, resolved by ArmorFx in MAP/src/gear.js.\n   `cost` and `trade_in` are for the store, which does not exist yet.",
 "items": "PLACEHOLDERS. Item design is not written yet; these exist so the roll-and-lose\n   machinery has something to roll. `weight` is relative drop likelihood.",
 "city_status": "CITY-WIDE CONDITIONS. A status is a thing happening to Barcelona that\n   picks a SUBSET of stations on the lines it names and changes them: their attributes\n   multiply, and the map paints `fx` around them. `hours` holds one or more BARCELONA\n   local windows (7-10|17-20), to_hour exclusive, and a window may wrap past midnight.\n   `share` is the fraction of eligible stations affected \u2014 which ones is decided by a\n   hash of the station, the status and the current window, so every client picks the same\n   set and it holds still until the window ends. `emotions` drives the colours the effect\n   is drawn in; `blurb` is what the tag says when tapped.",
 "world_bands": "day / hour / weather -> multipliers on a station's live attributes. Every\n   MATCHING row multiplies, so BASE is the floor and the rest stack on it. Hours are\n   BARCELONA local and to_hour is exclusive; a band may wrap past midnight. `weather`\n   comes from WorldState (stubbed today, a real API later). Higher priority wins nothing\n   on its own \u2014 it only orders the rows for readability.",
 "metro_lines": "one row per line, `stations` in running order. Colour is not stored: it\n   comes from the emotion, so the map cannot drift out of step with battle.",
 "objectives": "PROGRESSION. One row per thing the player can earn and the place they earn\n   it. `station` is where the floating ? appears and `emotion` colour-codes it.\n   `requirement` is the standardised test — DEFEAT_BOSS means: travel there and beat the\n   boss, who fights as `unit`. `reward` is a pipe list of KIND:ID — ARMOR/SET add to what\n   the profile OWNS, KEY grants a Line Key. `once`=1 retires the marker when it is cleared.",
 "dialogue":  "what each enemy says. state: INTRO | WINNING | LOSING | DEFEAT. A battle picks one\n   persona at random from the rows matching the enemy's emotion.",
}

def js_literal(text):
    """Make a CSV body safe inside a JS template literal.

    THE SHEET IS PROSE. A notes column is written by a person, and a person
    writing about a `column` reaches for a backtick — which closes the template
    literal the CSV is embedded in and takes the whole of data.js down with a
    syntax error a long way from the cause. `${` does the same, quietly, by
    interpolating. Escaping here means the spreadsheet can contain any
    punctuation at all, which is the only way a data file should behave."""
    return text.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")

def find(folder, table):
    for p in glob.glob(os.path.join(folder, "*.csv")):
        stem = os.path.splitext(os.path.basename(p))[0]
        name = re.split(r"\s+-\s+", stem)[-1].strip().lower()
        if name == table:
            return p
    return None

def clean(path):
    """Strip the two banner rows the workbook carries (note + LIVE/planned tags),
    drop fully-empty rows, and re-emit tidy CSV."""
    with open(path, newline="", encoding="utf-8-sig") as fh:
        rows = [r for r in csv.reader(fh)]
    rows = [r for r in rows if any(c.strip() for c in r)]
    # the header row is the first one whose first cell is a known key column
    keys = {"id", "key", "attack_emotion", "emotion"}
    start = next((i for i, r in enumerate(rows) if r and r[0].strip() in keys), 0)
    rows = rows[start:]
    if len(rows) > 1 and rows[1] and rows[1][0].strip().upper() in ("LIVE", "PLANNED"):
        del rows[1]
    width = len(rows[0])
    keep = [i for i, h in enumerate(rows[0][:width]) if h.strip() not in DROP_COLUMNS]
    out = []
    for r in rows:
        r = (r + [""] * width)[:width]
        r = [r[i] for i in keep]
        cells = []
        for c in r:
            c = c.replace("\r", " ").replace("\n", " ").strip()
            if "," in c or '"' in c:          # re-quote so the JS reader sees one field
                c = '"' + c.replace('"', '""') + '"'
            cells.append(c)
        out.append(",".join(cells))
    return "\n".join(out)

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    folder = sys.argv[1]
    blocks, missing = [], []
    for t in TABLES:
        p = find(folder, t)
        if not p:
            missing.append(t); continue
        body = js_literal(clean(p))
        comment = HEADER_COMMENTS.get(t, "").replace("*/", "*\u200b/")
        blocks.append(f"/* --- {t} ---\n   {comment}  */\n{t}: `{body}`")
    if missing:
        print("! no CSV found for:", ", ".join(missing))
        print("  (keeping the existing block for those tables is not supported — "
              "export every sheet)")
        sys.exit(1)

    js = r'''/* =====================================================================
   NEURO-METRO: AVUI — DATA TABLES
   GENERATED by tools/build_data.py from the config spreadsheet.
   Edit the spreadsheet, export the sheets as CSV, re-run the script.
   Hand edits here are fine for a quick test but will be overwritten.
   ===================================================================== */

const SCHEMA = {
  bool: ["hits_layer", "enabled"],
  list: ["layers", "pool", "loadouts", "emotions", "lines", "stations", "spawn",
        "spawn_lines", "day", "weather", "keys", "drops", "reward"]
};

const DATA = {

''' + ",\n\n".join(blocks) + r'''
};

/* --- CSV reader: handles quoted fields, so notes may contain commas ---- */
function splitCSVLine(line){
  const out=[]; let cur="", q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(q){
      if(c==='"'){ if(line[i+1]==='"'){cur+='"'; i++;} else q=false; }
      else cur+=c;
    }else{
      if(c==='"') q=true;
      else if(c===",") { out.push(cur); cur=""; }
      else cur+=c;
    }
  }
  out.push(cur); return out;
}
function parseCSV(src){
  const lines = src.trim().split(/\r?\n/).filter(l=>l.trim()!=="");
  const head = splitCSVLine(lines.shift()).map(h=>h.trim());
  return lines.map(line=>{
    const cells = splitCSVLine(line);
    const row = {};
    head.forEach((h,i)=>{
      let v = (cells[i]??"").trim();
      if(SCHEMA.list.includes(h))      row[h] = v ? v.split("|").map(s=>s.trim()) : [];
      else if(SCHEMA.bool.includes(h)) row[h] = v==="1"||v.toUpperCase()==="TRUE";
      else if(v!=="" && !isNaN(Number(v))) row[h] = Number(v);
      else row[h] = v;
    });
    return row;
  });
}
const byId = rows => Object.fromEntries(rows.map(r=>[r.id,r]));

''' + CONSTS + '''
'''
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(js)
    print("wrote", os.path.relpath(OUT), "-", len(blocks), "tables")

if __name__ == "__main__":
    main()
