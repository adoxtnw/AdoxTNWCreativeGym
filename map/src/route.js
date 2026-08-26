"use strict";
/* NEURO-METRO: AVUI — MAP — getting from here to there
   Classic script (no ES modules) so the prototype still opens straight from
   file:// as well as from a static host. Load order is fixed in index.html;
   every file shares one global scope.

   A route is a list of LEGS, each one station to the next along a named line.
   The map is not a plain graph, because of GDD 2:

       You cannot change line at a junction without that line's Line Key.

   So the search runs over `(station, line)` pairs rather than over stations.
   Riding one more stop on the line you are already on is always allowed;
   ARRIVING on a line is what needs the key. Boarding at your current station
   counts as arriving, so a line you have no key for is not even boardable.

   Breadth-first, so the route found is the one with the fewest stops. When
   there is no route, the search reports WHICH KEY would have opened one — a
   refusal that just says "no" is useless to a player standing on a platform.  */

function routeBetween(fromId, toId, keys){
  if(fromId === toId) return {ok: true, legs: []};
  if(!STATIONS[fromId] || !STATIONS[toId]) return {ok: false, reason: "NO_SUCH_STATION"};
  const has = id => keys.indexOf(id) >= 0;

  const seen = Object.create(null);
  const q = [];
  const blockedBy = Object.create(null);   /* keys that turned a search back */

  (LINES_AT[fromId] || []).forEach(l => {
    if(!has(l.id)){ blockedBy[l.id] = true; return; }
    const k = fromId + "|" + l.id;
    seen[k] = {prev: null, leg: null};
    q.push({at: fromId, line: l, key: k});
  });
  if(!q.length) return {ok: false, reason: "NO_KEY", need: Object.keys(blockedBy)};

  let head = 0, found = null;
  while(head < q.length && !found){
    const cur = q[head++];
    /* one stop either way along the line we are riding */
    const idx = cur.line.stations.indexOf(cur.at);
    for(const step of [-1, 1]){
      const j = idx + step;
      if(j < 0 || j >= cur.line.stations.length) continue;
      const nxt = cur.line.stations[j], key = nxt + "|" + cur.line.id;
      if(seen[key]) continue;
      seen[key] = {prev: cur.key, leg: {from: cur.at, to: nxt, line: cur.line}};
      const node = {at: nxt, line: cur.line, key};
      q.push(node);
      if(nxt === toId){ found = node; break; }
    }
    if(found) break;
    /* or change line where we stand — this is the gate */
    (LINES_AT[cur.at] || []).forEach(l => {
      if(l.id === cur.line.id) return;
      if(!has(l.id)){ blockedBy[l.id] = true; return; }
      const key = cur.at + "|" + l.id;
      if(seen[key]) return;
      seen[key] = {prev: cur.key, leg: null};      /* a transfer is not a leg */
      q.push({at: cur.at, line: l, key});
    });
  }
  if(!found){
    const need = Object.keys(blockedBy);
    return {ok: false, reason: need.length ? "NO_KEY" : "UNREACHABLE", need};
  }
  const legs = [];
  for(let k = found.key; k; k = seen[k].prev)
    if(seen[k].leg) legs.unshift(seen[k].leg);
  return {ok: true, legs};
}

/* What the peek panel needs: can I get there, and if not, what is missing.

   The raw search reports every line it was turned back at, which over-answers —
   it lists four keys when any ONE of them might open the way, and a player
   reading that would think they needed all four. So each blocked line is
   re-tried on its own, and only the ones that actually help are named. Six
   extra searches at worst, run once on a tap. */
function routeFor(toId){
  const r = routeBetween(Player.at, toId, Player.keys);
  if(r.ok || r.reason !== "NO_KEY") return r;
  const helps = (r.need || []).filter(id =>
    routeBetween(Player.at, toId, Player.keys.concat([id])).ok);
  /* none alone is enough: the trip needs more than one key, so name them all */
  return {ok: false, reason: "NO_KEY",
          need: helps.length ? helps : (r.need || []),
          any: helps.length > 0};
}
/* Every station reachable with the keys in hand — used to shade the map. */
function reachableSet(){
  const out = Object.create(null);
  const has = id => Player.hasKey(id);
  const seenL = Object.create(null), stack = [];
  (LINES_AT[Player.at] || []).forEach(l => { if(has(l.id) && !seenL[l.id]){ seenL[l.id] = 1; stack.push(l); } });
  while(stack.length){
    const l = stack.pop();
    l.stations.forEach(sid => {
      out[sid] = true;
      (LINES_AT[sid] || []).forEach(o => {
        if(has(o.id) && !seenL[o.id]){ seenL[o.id] = 1; stack.push(o); }
      });
    });
  }
  return out;
}
