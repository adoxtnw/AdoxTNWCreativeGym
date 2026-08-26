"use strict";
/* NEURO-METRO: AVUI — MAP — the pause menu
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   THE ONLY BUTTON ON THE MAP opens this. Everything the player is — name,
   affinities, armor, sets, purse, keys — lives behind it, so the map itself can
   stay a map.

   THREE TABS, not six. Stats are not their own screen because they are not
   their own thing: MaxMS, the Emotional Layers and the ability pool are
   ARITHMETIC ON THE EQUIPMENT, so they are printed beside the slots that
   produce them. Splitting them would show the same numbers twice and invite
   them to disagree.

     PROFILE    who you are: name, affinities, where you are docked, Line Keys
     LOADOUT    armor, three Move Sets, and the stat block they add up to
     INVENTORY  crystals, one per emotion, and items
     SAVE       the file, the code, and snapshots — see vault.js for why the
                file is the one that actually matters

   IT ONLY OPENS ON THE MAP. Progression GDD 5 — loadouts cannot change mid
   journey or mid battle — and GDD 2, the game saves only while on the map. Both
   are satisfied by the button simply not existing anywhere else (see syncHud in
   journey.js), rather than by a check inside each action.                    */

const Menu = {
  open: false,
  tab: "PROFILE",

  show(t){ this.open = true; if(t) this.tab = t; this.render(); syncHud(); dirty = true; },
  hide(){ this.open = false; this.pick = null; this.openSet = null; this.msg = "";
          this.render(); syncHud(); dirty = true; },
  toggle(){ this.open ? this.hide() : this.show(); },
  go(t){ this.tab = t; this.render(); },

  render(){
    const el = $("menu"); if(!el) return;
    el.classList.toggle("show", this.open);
    if(!this.open){ el.innerHTML = ""; return; }
    const tabs = ["PROFILE", "LOADOUT", "INVENTORY", "SAVE"];
    el.innerHTML =
      '<div class="mhead">' +
        '<div class="mtabs">' + tabs.map(t =>
          '<button class="mtab hudbtn' + (t === this.tab ? ' on' : '') +
          '" data-tab="' + t + '">' + t + '</button>').join("") + '</div>' +
        '<button class="mclose hudbtn" id="menuClose">&times;</button>' +
      '</div>' +
      '<div class="mbody">' + this.body() + '</div>' + this.picker();

    el.querySelectorAll(".mtab").forEach(b =>
      b.addEventListener("click", () => Menu.go(b.dataset.tab)));
    $("menuClose").addEventListener("click", () => Menu.hide());
    this.bind();
  },

  body(){
    if(this.tab === "PROFILE")   return this.profile();
    if(this.tab === "LOADOUT")   return this.loadout();
    if(this.tab === "SAVE")      return this.save();
    return this.inventory();
  },

  /* ---------------------------------------------------------- PROFILE ---- */
  profile(){
    const aff = Player.affinities.map(e =>
      '<span class="pill" style="background:' + EMOTIONS[e].hex + '">' +
      esc(EMOTIONS[e].name) + '</span>').join("");
    const bonuses = Player.affinities.map(e => {
      const fx = AffinityFx.of(EMOTIONS[e].affinity_bonus);
      return '<li>' + esc(fx.blurb) + '</li>';
    }).join("");
    const keys = LINES.map(l => {
      const has = Player.hasKey(l.id);
      return '<span class="pill key' + (has ? '' : ' off') + '" style="' +
        (has ? 'background:' + EMOTIONS[l.emotion].hex : '') + '">' + l.id + '</span>';
    }).join("");
    return '' +
      '<h3 style="color:' + Player.affinityHex(0) + '">' + esc(Player.name) +
        '<button class="editbtn hudbtn" id="mEditName" title="Change your name">' +
        '<i class="sym">' + glyphSVG("GLASS") + '</i></button></h3>' +
      sect("Affinities", '<div class="pills">' + aff + '</div>' +
           '<ul class="pending">' + bonuses + '</ul>', "SPARK") +
      sect("Passenger Code", '<p class="code2">' + esc(Player.code || "\u2014") + '</p>',
           "FLOPPY") +
      sect("Docked at", '<p class="big">' +
           esc((STATIONS[Player.at] || {}).name || "\u2014") + '</p>', "DISC") +
      sect("Line Keys", '<div class="pills">' + keys + '</div>' +
           '<p class="hint">Keys come from Line Managers, which do not exist yet.</p>',
           "KEY");
  },

  /* ---------------------------------------------------------- LOADOUT ---- */
  /* Armor and Move Sets are drawn as SOCKETS — a dashed outline you drop
     something into — so an empty slot reads as a hole rather than a missing
     row. Every slot carries a CHANGE button that opens the picker; tapping the
     set itself opens its abilities instead, because "what is in this?" and
     "swap this" are different questions and should not share a target. */
  loadout(){
    const st = Player.stats();
    const n = RULES.equippedSlots || 3;

    const stats =
      '<dl class="stats2">' +
        '<dt>Mental Stamina</dt><dd><span class="tag ms">' + st.maxMs + '</span></dd>' +
        '<dt>Emotional Charge</dt><dd><span class="tag ec ramp">' + st.maxEc + '</span></dd>' +
        '<dt>Layers</dt><dd>' + layers6(st.layers) + '</dd>' +
        '<dt>Abilities</dt><dd><span class="big">' + st.pool.length + '</span></dd>' +
      '</dl>';

    const a = ARMOR[Player.armor];
    const armorSlot =
      '<div class="slotwrap' + (a ? ' filled' : '') + ' pxr">' +
        (a ? armorCard(a, false) : '<div class="slot empty pxr">EMPTY</div>') +
        '<div class="slotrow"><button class="chgbtn pxr hudbtn" data-pick="ARMOR">CHANGE</button></div>' +
      '</div>';

    let slots = "";
    for(let i = 0; i < n; i++){
      const id = Player.sets[i], sset = id && LOADOUTS[id];
      slots += '<div class="slotwrap' + (sset ? ' filled' : '') + ' pxr">' +
        (sset ? setCard(sset, i) : '<div class="slot empty pxr">EMPTY SLOT ' + (i + 1) + '</div>') +
        '<div class="slotrow">' +
          '<button class="chgbtn pxr hudbtn" data-pick="SET" data-slot="' + i + '">CHANGE</button>' +
        '</div>' +
        (this.openSet === id && sset ? abilityPanel(sset) : "") +
      '</div>';
    }

    return stats +
      sect("Emotional Armor", armorSlot, "SHIELD") +
      sect("Move Sets", slots, "BOLT") +
      '<p class="hint">Loadouts cannot be changed once a trip has begun.</p>';
  },

  /* -------------------------------------------------------- INVENTORY ---- */
  inventory(){
    const cry = Object.keys(EMOTIONS).map((e, i) =>
      '<div class="cline"><span class="dot" style="background:' + EMOTIONS[e].hex +
      ';--fd:' + (i * 0.27).toFixed(2) + 's"></span>' +
      esc(EMOTIONS[e].name) + '<b>' + (Player.crystals[e] || 0) + '</b></div>').join("");
    /* items stack: the same id held twice is one line with a count */
    const count = {};
    Player.items.forEach(i => { count[i] = (count[i] || 0) + 1; });
    const items = Object.keys(count).map((i, n) => {
      const it = ITEMS[i];
      return '<div class="cline"><span class="dot" style="background:' +
        (it && EMOTIONS[it.emotion] ? EMOTIONS[it.emotion].hex : "#5c5348") +
        ';--fd:' + (n * 0.31).toFixed(2) + 's"></span>' +
        esc(it ? it.name : i) + '<b>' + count[i] + '</b></div>';
    }).join("");
    return sect("Emotion Crystals", cry, "DISC") +
      sect("Items", items || '<p class="hint">Nothing yet.</p>', "BAG") +
      '<p class="hint">Spending them needs the Wandering Store, which is not built.</p>';
  },

  /* ------------------------------------------------------------- SAVE ---- */
  msg: "",
  save(){
    const snaps = Vault.snapNames();
    return '' +
      '<div class="warn2">This game has no server. Your progress lives in this ' +
      'browser, and phones clear that after about a week idle. <b>The file is ' +
      'the only copy that survives.</b></div>' +
      sect("Your save",
        '<button class="cbtn go hudbtn" id="vFile">DOWNLOAD SAVE FILE</button>' +
        '<button class="cbtn hudbtn" id="vCode">COPY SAVE CODE</button>') +
      sect("Load a save",
        '<p class="hint">This replaces what you are playing now. Download the ' +
        'current one first if you want to keep it.</p>' +
        '<button class="cbtn hudbtn" id="vPick">CHOOSE A SAVE FILE</button>' +
        '<textarea class="cin tall" id="vPaste" spellcheck="false" ' +
          'placeholder="or paste a save code"></textarea>' +
        '<button class="cbtn hudbtn" id="vLoad">LOAD CODE</button>') +
      sect("Snapshots",
        '<p class="hint">Parked in this browser, for trying things. They die with ' +
        'it &mdash; the file is the backup.</p>' +
        '<div class="srow"><input class="cin" id="vSnapName" maxlength="24" ' +
          'placeholder="name"><button class="cbtn hudbtn" id="vSnapSave">SAVE</button></div>' +
        (snaps.length ? snaps.map(n =>
          '<div class="snap"><b>' + esc(n) + '</b>' +
          '<button class="lnk hudbtn" data-snapload="' + esc(n) + '">load</button>' +
          '<button class="lnk hudbtn" data-snapdrop="' + esc(n) + '">delete</button></div>'
        ).join("") : '<p class="hint">None yet.</p>')) +
      (this.msg ? '<p class="cnote">' + esc(this.msg) + '</p>' : '');
  },
  say(m){ this.msg = m; sfx("ui_deny"); this.render(); },

  /* -------------------------------------------------------- THE PICKER ---
     A separate window over the menu, listing what is NOT worn. Sorting is
     deliberately plain — by name, by type — because with a handful of items a
     filter would be more chrome than help, and the list only grows. */
  pick: null,          /* {kind:"ARMOR"|"SET", slot} while the picker is open */
  sortBy: "TYPE",
  openSet: null,       /* which Move Set has its abilities showing */

  picker(){
    if(!this.pick) return "";
    const isArmor = this.pick.kind === "ARMOR";
    const worn = isArmor ? [Player.armor] : Player.sets;
    let list = (isArmor ? Player.ownedArmor : Player.ownedSets)
      .filter(id => worn.indexOf(id) < 0)
      .map(id => (isArmor ? ARMOR : LOADOUTS)[id]).filter(Boolean);

    list.sort((x, y) => this.sortBy === "NAME"
      ? String(x.name).localeCompare(String(y.name))
      : (isArmor ? num(x.tier, 1) - num(y.tier, 1) || String(x.name).localeCompare(String(y.name))
                 : String(x.emotion).localeCompare(String(y.emotion))
                   || num(x.tier, 1) - num(y.tier, 1)));

    const sorts = ["TYPE", "NAME"].map(k =>
      '<button class="sortbtn hudbtn' + (this.sortBy === k ? ' on' : '') +
      '" data-sort="' + k + '">' + k + '</button>').join("");

    return '<div class="picker" id="picker">' +
      '<div class="phead"><b>' + (isArmor ? "CHOOSE ARMOR"
        : "SLOT " + (this.pick.slot + 1)) + '</b>' +
        '<span class="sorts">' + sorts + '</span>' +
        '<button class="mclose pxr hudbtn" id="pkClose">&times;</button></div>' +
      '<div class="pbody">' +
        (list.length ? list.map(o => isArmor ? armorCard(o, true) : setCard(o, null)).join("")
                     : '<p class="hint">Nothing else owned.</p>') +
        (isArmor ? "" :
          '<button class="chgbtn pxr wide hudbtn" data-setpick="">LEAVE SLOT EMPTY</button>') +
      '</div></div>';
  },

  /* ------------------------------------------------------------- wiring -- */
  pick: null,
  bind(){
    const el = $("menu");
    const on = (id, fn) => { const e = $(id); if(e) e.addEventListener("click", fn); };
    const each = (sel, fn) => el.querySelectorAll(sel).forEach(fn);

    /* ---- loadout: open the picker ---- */
    each("[data-pick]", b => b.addEventListener("click", () => {
      Menu.pick = {kind: b.dataset.pick, slot: +(b.dataset.slot || 0)};
      Menu.openSet = null;
      Menu.render();
    }));
    on("pkClose", () => { Menu.pick = null; Menu.render(); });
    each("[data-sort]", b => b.addEventListener("click", () => {
      Menu.sortBy = b.dataset.sort; Menu.render();
    }));

    /* ---- the same card means two things, decided by WHERE it is ----
       inside the picker it equips; on the loadout screen it opens the set's
       abilities. Sharing one target for "swap this" and "what is in this?"
       would make every glance a commitment. */
    each("[data-armor]", b => b.addEventListener("click", () => {
      if(!Menu.pick) return;
      Player.equipArmor(b.dataset.armor); Menu.pick = null; Menu.render();
    }));
    each("[data-openset]", b => b.addEventListener("click", () => {
      const id = b.dataset.openset;
      if(Menu.pick){ Player.equipSet(Menu.pick.slot, id); Menu.pick = null; }
      else Menu.openSet = Menu.openSet === id ? null : id;
      Menu.render();
    }));
    each("[data-setpick]", b => b.addEventListener("click", () => {
      if(!Menu.pick) return;
      Player.equipSet(Menu.pick.slot, ""); Menu.pick = null; Menu.render();
    }));

    /* ---- profile: rename in place ---- */
    on("mEditName", () => {
      const next = window.prompt("Your name on the map:", Player.name);
      if(next == null) return;
      const clean = sanitiseName(next);
      if(!clean) return Menu.say("A name cannot be empty.");
      Player.name = clean; Player.save(); Menu.render(); dirty = true;
    });

    /* ---- saves ---- */
    on("vFile", () => { const r = Vault.exportFile();
      Menu.say(r.ok ? "Downloaded " + r.name : r.why); });
    on("vCode", () => {
      const r = Vault.exportCode();
      if(!r.ok) return Menu.say(r.why);
      copyText(r.code, ok => Menu.say(ok ? "Save code copied to the clipboard."
                                         : "Could not copy \u2014 the code is in the box below."));
      const t = $("vPaste"); if(t) t.value = r.code;
    });
    on("vPick", () => $("saveFile").click());
    on("vLoad", () => Menu.afterLoad(Vault.importCode(($("vPaste") || {}).value)));
    on("vSnapSave", () => {
      const r = Vault.snapSave(($("vSnapName") || {}).value);
      Menu.say(r.ok ? "Snapshot \"" + r.name + "\" saved." : r.why);
    });
    each("[data-snapload]", b => b.addEventListener("click",
      () => Menu.afterLoad(Vault.snapLoad(b.dataset.snapload))));
    each("[data-snapdrop]", b => b.addEventListener("click",
      () => { Vault.snapDrop(b.dataset.snapdrop); Menu.say("Deleted."); }));
  }
};

/* A load has moved the player somewhere else entirely, so the map has to be
   told rather than left pointing at the old station. */
Menu.afterLoad = function(r){
  if(!r || !r.ok) return Menu.say((r && r.why) || "Could not load that.");
  Menu.msg = "";
  Menu.hide();
  enterNetwork(r.interrupted);
};

/* THE SIX LAYER SLOTS a unit has (rules.maxLayers). An armor fills nought to
   two of them, so the rest are shown empty rather than hidden — how many you
   are NOT carrying is the useful half of the comparison. */
function layers6(list){
  const max = RULES.maxLayers || 6;
  let out = '<div class="layers6">';
  for(let i = 0; i < max; i++){
    const e = list[i];
    out += '<i class="lay' + (e ? ' on' : '') + '"' +
      (e ? ' style="background:' + EMOTIONS[e].hex + '" title="' + esc(EMOTIONS[e].name) + '"' : '') +
      '></i>';
  }
  return out + '</div>';
}
function armorCard(a, pickable){
  const fx = ArmorFx.of(a.passive);
  const ls = [a.layer1, a.layer2].filter(l => l && EMOTIONS[l]);
  const col = ls.length ? EMOTIONS[ls[0]].hex : "var(--mint)";
  const fd = ((a.id.length * 7) % 20) / 10;
  return '<button class="card pxr' + (pickable ? '' : ' on') + '" data-armor="' + a.id + '"' +
    ' style="--emo:' + col + '">' +
    '<i class="sym" style="--fd:' + fd + 's">' + glyphSVG("SHIELD") + '</i>' +
    '<span class="cardtxt"><b>' + esc(a.name) + '</b>' +
      '<small>+' + num(a.ms_mod, 0) + ' MS &middot; tier ' + num(a.tier, 1) + '</small>' +
      layers6(ls) +
      '<small class="pas">' + esc(fx.blurb) + '</small></span></button>';
}
function setCard(s, slot){
  const col = EMOTIONS[s.emotion] ? EMOTIONS[s.emotion].hex : "var(--mint)";
  const moves = setMoves(s);
  const icon = (moves.length && ABILITIES[moves[0]].icon) || "SPARK";
  const fd = ((s.id.length * 7) % 20) / 10;
  return '<button class="card pxr" data-openset="' + s.id + '"' +
    (slot != null ? ' data-slot="' + slot + '"' : '') + ' style="--emo:' + col + '">' +
    '<i class="sym" style="--fd:' + fd + 's">' + glyphSVG(icon) + '</i>' +
    '<span class="cardtxt"><b>' + setName(s) + '</b>' +
      '<small>' + moves.length + ' moves &middot; ' +
        (num(s.ec_mod, 0) >= 0 ? "+" : "") + num(s.ec_mod, 0) + ' EC &middot; tap to see</small>' +
    '</span></button>';
}
/* The abilities inside a set, drawn the way the battle panel draws them. */
function abilityPanel(s){
  const moves = setMoves(s);
  if(!moves.length) return '<p class="hint">This set has no abilities yet.</p>';
  return '<div class="abpage">' + moves.map(id => abilCard(ABILITIES[id])).join("") + '</div>';
}

/* Every heading carries a symbol, and every symbol breathes — a still glyph in
   a moving interface reads as an asset that failed to load. The delay is
   derived from the title, so two headings never bob in step. */
const sect = (t, inner, icon) => {
  const fd = ((t.length * 7) % 20) / 10;
  const sym = icon ? '<i class="sym" style="--fd:' + fd + 's">' + glyphSVG(icon) + '</i>' : '';
  return '<section><h4>' + sym + t + '</h4>' + inner + '</section>';
};
/* An ability drawn exactly as the battle panel draws it: the charge tail, then
   the station ring wearing the ability's glyph, then the name. Same markup,
   same classes, same shapes — the point of showing a Move Set's contents here
   is that they are recognisably the same objects. */
function abilCard(a){
  const col = abAccent(a);
  let line = "";
  const shown = Math.min(a.charge || 0, RULES.chargeShownMax || 3);
  for(let i = 0; i < shown; i++)
    line += '<div class="link" style="color:' + col + '"></div>' +
            '<div class="station chg" style="color:' + col + '">' + chargeSVG() + '</div>';
  line += '<div class="link" style="color:' + col + '"></div>' +
          '<div class="station" style="color:' + col + '">' + stationSVG(a.icon) + '</div>';
  const bob = ((a.id.length * 7) % 20) / 10;
  return '<div class="abrow pxr" style="--emo:' + col + ';--fd:' + bob + 's">' +
    (a.uses ? '<div class="shots">' +
       Array.from({length: a.uses}, () => '<div class="shot"></div>').join("") + '</div>' : '') +
    '<div class="abline">' + line + '</div>' +
    '<div class="abinfo"><div class="abname">' + esc(a.name.toUpperCase()) + '</div>' +
    '<div class="abcost">' + num(a.cost, 0) + ' EC</div></div></div>';
}
/* The GDD writes sets as "Set of Anger II". The sheet keeps the short name
   because the battle system prints it on a button, so the tier is appended
   here — presentation over the same data, not a second name to maintain. */
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI"];
const setName = s => esc(s.name) + " " + (ROMAN[num(s.tier, 1)] || num(s.tier, 1));
const setMoves = s => ["slot1","slot2","slot3","slot4"]
  .map(k => s[k]).filter(a => a && ABILITIES[a]);
