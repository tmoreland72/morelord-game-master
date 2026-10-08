import { escapeHTML as e } from "./core.mjs";

const defaultId = () => Math.random().toString(36).slice(2, 10);

export function averageDamage(formula) {
  const text = String(formula ?? "").replace(/\s/g, "");
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  const match = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(text);
  if (!match) return null;
  const dice = Number(match[1] || 1);
  const faces = Number(match[2]);
  const modifier = Number(match[3] || 0);
  return Math.max(0, Math.round(dice * (faces + 1) / 2 + modifier));
}

export function emptyHero() {
  return {unitId: "", bonus: "attack", attackBonus: 2, dc: 15, checkType: "skill", checkId: "", actorId: "", requestId: "", grantedRequestId: ""};
}

function makeSide(name, randomId) {
  return {id: randomId(), name, dropCount: 1, units: []};
}

export function createBattle(randomId = defaultId) {
  return {round: 0, blind: false, damageCap: null, sides: [makeSide("Side A", randomId), makeSide("Side B", randomId)], hero: emptyHero()};
}

function clone(battle) {
  return structuredClone(battle);
}

function whole(value, fallback, minimum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) return fallback;
  return number;
}

export function unitStatus(unit) {
  const state = unit.living <= 0 ? "Destroyed" : unit.routed ? "Routed" : "Ready";
  const bonus = unit.heroAdvantage ? " · advantage" : unit.heroAttack ? ` · +${unit.heroAttack}` : "";
  return `${unit.living}/${unit.count} ${state}${bonus}`;
}

export function addSide(battle, name = "Side", randomId = defaultId) {
  const next = clone(battle);
  next.sides.push(makeSide(String(name || "Side").trim() || "Side", randomId));
  return next;
}

export function removeSide(battle, sideId) {
  if (battle.sides.length <= 2) throw new Error("A battle keeps at least two sides.");
  const next = clone(battle);
  next.sides = next.sides.filter(side => side.id !== sideId);
  if (next.sides.length === battle.sides.length) throw new Error("That side is no longer in the battle.");
  return next;
}

export function addUnit(battle, sideId, profile, randomId = defaultId) {
  const count = whole(profile.count, 0, 1);
  const hp = whole(profile.hp, 0, 1);
  if (!count) throw new Error("Enter a unit count of at least 1.");
  if (!hp) throw new Error("Hit points per creature must be at least 1.");
  const next = clone(battle);
  const side = next.sides.find(item => item.id === sideId);
  if (!side) throw new Error("Choose a side for the unit.");
  side.units.push({
    id: randomId(),
    name: String(profile.name || "Unit").trim() || "Unit",
    actorUuid: profile.actorUuid ?? "",
    count,
    living: count,
    ac: whole(profile.ac, 10, -100),
    attackBonus: whole(profile.attackBonus, 0, -100),
    damage: whole(profile.damage, 0, 0),
    hp,
    carried: 0,
    moraleDc: whole(profile.moraleDc, 10, 0),
    moraleMod: whole(profile.moraleMod, 0, -100),
    moraleTested: false,
    routed: false,
    targetId: "",
    heroAttack: 0,
    heroAdvantage: false
  });
  return next;
}

export function updateUnit(battle, unitId, patch) {
  const next = clone(battle);
  const unit = next.sides.flatMap(side => side.units).find(item => item.id === unitId);
  if (!unit) throw new Error("That unit is no longer in the battle.");
  if ("name" in patch) unit.name = String(patch.name || "Unit").trim() || "Unit";
  if ("count" in patch) unit.count = whole(patch.count, unit.count, 1);
  if ("ac" in patch) unit.ac = whole(patch.ac, unit.ac, -100);
  if ("attackBonus" in patch) unit.attackBonus = whole(patch.attackBonus, unit.attackBonus, -100);
  if ("damage" in patch) unit.damage = whole(patch.damage, unit.damage, 0);
  if ("hp" in patch) unit.hp = whole(patch.hp, unit.hp, 1);
  if ("moraleDc" in patch) unit.moraleDc = whole(patch.moraleDc, unit.moraleDc, 0);
  if ("moraleMod" in patch) unit.moraleMod = whole(patch.moraleMod, unit.moraleMod, -100);
  if ("targetId" in patch) unit.targetId = patch.targetId || "";
  if ("living" in patch) unit.living = Math.min(unit.count, Math.max(0, whole(patch.living, unit.living, 0)));
  if (unit.living > unit.count) unit.living = unit.count;
  if (unit.living <= 0) unit.routed = false;
  return next;
}

export function removeUnit(battle, unitId) {
  const next = clone(battle);
  let removed = false;
  for (const side of next.sides) {
    const before = side.units.length;
    side.units = side.units.filter(unit => unit.id !== unitId);
    removed ||= side.units.length !== before;
  }
  if (!removed) throw new Error("That unit is no longer in the battle.");
  return next;
}

export function updateBattle(battle, patch) {
  const next = clone(battle);
  if ("blind" in patch) next.blind = patch.blind === true;
  if ("damageCap" in patch) next.damageCap = patch.damageCap == null || patch.damageCap === "" ? null : whole(patch.damageCap, next.damageCap, 0);
  if ("sideName" in patch) {
    const side = next.sides.find(item => item.id === patch.sideId);
    if (side) side.name = String(patch.sideName || "Side").trim() || "Side";
  }
  if ("dropCount" in patch) {
    const side = next.sides.find(item => item.id === patch.sideId);
    if (side) side.dropCount = whole(patch.dropCount, side.dropCount, 1);
  }
  if (patch.hero) next.hero = {...next.hero, ...patch.hero};
  return next;
}

function locate(battle, unitId) {
  for (const side of battle.sides) {
    const unit = side.units.find(item => item.id === unitId);
    if (unit) return {side, unit};
  }
  return null;
}

function d20(roll) {
  const value = roll();
  if (!Number.isInteger(value) || value < 1 || value > 20) throw new Error("Battle rolls must be a d20 from 1 to 20.");
  return value;
}

function applyHit(target, damage, roll) {
  const hp = Math.max(1, target.hp);
  const before = target.living;
  const pool = target.carried + damage;
  const casualties = Math.min(target.living, Math.floor(pool / hp));
  target.living -= casualties;
  target.carried = target.living === 0 ? 0 : pool - casualties * hp;
  let morale = null;
  if (target.living === 0) target.routed = false;
  else if (!target.moraleTested && before * 2 >= target.count && target.living * 2 < target.count) {
    const die = d20(roll);
    const total = die + target.moraleMod;
    const success = total >= target.moraleDc;
    target.moraleTested = true;
    if (!success) target.routed = true;
    morale = {die, total, dc: target.moraleDc, success};
  }
  return {casualties, morale};
}

export function resolveRound(battle, roll) {
  const next = clone(battle);
  next.round += 1;
  const events = [];
  const order = next.sides.flatMap(side => side.units.map(unit => ({side, unit})));
  for (const {side, unit} of order) {
    if (unit.living <= 0 || unit.routed) continue;
    const target = locate(next, unit.targetId);
    if (!target || target.unit.living <= 0 || target.side.id === side.id) {
      events.push({type: "hold", attacker: unit.name});
      continue;
    }
    const die = unit.heroAdvantage ? Math.max(d20(roll), d20(roll)) : d20(roll);
    const total = die + unit.attackBonus + unit.heroAttack;
    const hit = total >= target.unit.ac;
    let damage = 0;
    let casualties = 0;
    let morale = null;
    if (hit) {
      damage = unit.damage * unit.living;
      if (next.damageCap != null) damage = Math.min(damage, next.damageCap);
      const applied = applyHit(target.unit, damage, roll);
      casualties = applied.casualties;
      morale = applied.morale;
    }
    events.push({type: "attack", attacker: unit.name, target: target.unit.name, die, total, ac: target.unit.ac, hit, damage, casualties, remaining: target.unit.living, destroyed: target.unit.living <= 0, routed: target.unit.routed, morale});
  }
  for (const unit of next.sides.flatMap(side => side.units)) {
    unit.heroAttack = 0;
    unit.heroAdvantage = false;
  }
  return {battle: next, events};
}

export function grantHero(battle, {requestId, total, success}) {
  if (!battle.hero?.requestId || battle.hero.requestId !== requestId || battle.hero.grantedRequestId === requestId) return battle;
  const next = clone(battle);
  next.hero.grantedRequestId = requestId;
  const passed = success === true || (success !== false && Number.isFinite(total) && total >= next.hero.dc);
  const found = locate(next, next.hero.unitId);
  if (passed && found && found.unit.living > 0) {
    if (next.hero.bonus === "advantage") found.unit.heroAdvantage = true;
    else found.unit.heroAttack = whole(next.hero.attackBonus, 2, -100);
  }
  return next;
}

export function resetBattle(battle) {
  const next = clone(battle);
  next.round = 0;
  next.hero = {...next.hero, requestId: "", grantedRequestId: ""};
  for (const unit of next.sides.flatMap(side => side.units)) {
    unit.living = unit.count;
    unit.carried = 0;
    unit.routed = false;
    unit.moraleTested = false;
    unit.heroAttack = 0;
    unit.heroAdvantage = false;
  }
  return next;
}

export function endBattle(randomId = defaultId) {
  return createBattle(randomId);
}

export function roundCard(round, events) {
  const rows = events.map(event => {
    if (event.type === "hold") return `<p>${e(event.attacker)} holds.</p>`;
    const hit = event.hit ? `hits AC ${e(event.ac)} for ${e(event.damage)} damage, ${e(event.casualties)} casualties, ${e(event.remaining)} remain` : `misses AC ${e(event.ac)}`;
    const morale = event.morale ? ` Morale ${e(event.morale.total)} vs DC ${e(event.morale.dc)}: ${event.morale.success ? "stands" : "routed"}.` : "";
    const end = event.destroyed ? " Destroyed." : event.routed && !event.morale ? " Routed." : "";
    return `<p>${e(event.attacker)} ${e(event.total)} ${hit}.${morale}${end}</p>`;
  }).join("") || "<p>No units attacked.</p>";
  return `<section class="ml-chat-card ml-stack"><h3>Mass Combat · Round ${e(round)}</h3>${rows}<p class="notes">Experimental prototype.</p></section>`;
}
