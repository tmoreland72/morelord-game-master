import test from "node:test";
import assert from "node:assert/strict";
import { addSide, addUnit, averageDamage, createBattle, endBattle, grantHero, removeSide, resetBattle, resolveRound, roundCard, unitStatus, updateUnit } from "../scripts/mass-battle.mjs";

const ids = () => { let n = 0; return () => `id${++n}`; };

function battle() {
  const randomId = ids();
  let state = createBattle(randomId);
  state = addUnit(state, state.sides[0].id, {name: "Archers", count: 4, ac: 12, attackBonus: 4, damage: 5, hp: 6, moraleDc: 10, moraleMod: 0}, randomId);
  state = addUnit(state, state.sides[1].id, {name: "Guards", count: 4, ac: 15, attackBonus: 3, damage: 8, hp: 10, moraleDc: 10, moraleMod: 1}, randomId);
  const archers = state.sides[0].units[0];
  const guards = state.sides[1].units[0];
  state = updateUnit(state, archers.id, {targetId: guards.id});
  state = updateUnit(state, guards.id, {targetId: archers.id});
  return state;
}

test("mass battle attacks, casualties, carryover, morale, and destruction stay generic", () => {
  assert.equal(averageDamage("2d6+3"), 10);
  assert.equal(averageDamage("1d8"), 5);
  assert.equal(averageDamage("not dice"), null);

  let state = battle();
  state.sides[1].units[0].hp = 6;
  const dice = [16, 1];
  let cursor = 0;
  const first = resolveRound(state, () => dice[cursor++]);
  const attack = first.events[0];
  assert.equal(attack.attacker, "Archers");
  assert.equal(attack.hit, true);
  assert.equal(attack.total, 20);
  assert.equal(attack.damage, 20);
  assert.equal(attack.casualties, 3);
  assert.equal(attack.remaining, 1);
  assert.equal(first.battle.sides[1].units[0].carried, 2);
  assert.equal(attack.morale.success, false);
  assert.equal(first.battle.sides[1].units[0].routed, true);
  assert.equal(first.events.length, 1);

  const fresh = battle();
  fresh.sides[1].units[0].hp = 8;
  fresh.damageCap = 12;
  const rolls = [18, 1, 18, 1];
  let rollIndex = 0;
  const roll = () => rolls[rollIndex++];
  const cappedRound = resolveRound(fresh, roll);
  assert.equal(cappedRound.events[0].damage, 12);
  assert.equal(cappedRound.events[0].casualties, 1);
  assert.equal(cappedRound.battle.sides[1].units[0].carried, 4);
  assert.equal(cappedRound.events[0].morale, null);
  assert.equal(cappedRound.events[1].hit, false);

  const follow = resolveRound(cappedRound.battle, roll);
  assert.equal(follow.events[0].casualties, 2);
  assert.equal(follow.battle.sides[1].units[0].carried, 0);

  const killIds = ids();
  let kill = createBattle(killIds);
  kill = addUnit(kill, kill.sides[0].id, {name: "Bolt", count: 1, ac: 10, attackBonus: 0, damage: 30, hp: 5}, killIds);
  kill = addUnit(kill, kill.sides[1].id, {name: "Brute", count: 2, ac: 10, attackBonus: 0, damage: 1, hp: 5, moraleMod: 5, moraleDc: 10}, killIds);
  kill = updateUnit(kill, kill.sides[0].units[0].id, {targetId: kill.sides[1].units[0].id});
  const destroyed = resolveRound(kill, () => 15);
  assert.equal(destroyed.events[0].destroyed, true);
  assert.equal(destroyed.events[0].morale, null);
  assert.equal(destroyed.battle.sides[1].units[0].living, 0);

  const again = resolveRound(first.battle, () => 20);
  assert.equal(again.events[0].morale, null);
  assert.match(unitStatus(first.battle.sides[1].units[0]), /^1\/4 Routed$/);
  assert.doesNotMatch(unitStatus(first.battle.sides[0].units[0]), /damage|hits/i);
});

test("hero bonuses last one round and battle setup can reset", () => {
  let state = battle();
  const archer = state.sides[0].units[0].id;
  state = updateBattleHero(state, archer);
  state = grantHero(state, {requestId: "req", total: 16});
  assert.equal(state.sides[0].units[0].heroAttack, 2);
  const ignored = grantHero(state, {requestId: "req", total: 30});
  assert.equal(ignored, state);
  const round = resolveRound(state, () => 10);
  assert.equal(round.events[0].total, 16);
  assert.equal(round.battle.sides[0].units[0].heroAttack, 0);

  let adv = updateBattleHero(battle(), battle().sides[0].units[0].id, "advantage");
  adv = grantHero(adv, {requestId: "req", total: 18});
  const advRolls = [2, 19, 1];
  let index = 0;
  const advRound = resolveRound(adv, () => advRolls[index++]);
  assert.equal(advRound.events[0].die, 19);

  const reset = resetBattle(round.battle);
  assert.equal(reset.round, 0);
  assert.equal(reset.sides[1].units[0].living, 4);
  assert.equal(reset.sides[1].units[0].routed, false);
  const randomId = ids();
  const ended = endBattle(randomId);
  assert.equal(ended.sides.length, 2);
  assert.equal(ended.sides[0].units.length, 0);
  const added = addSide(ended, "Side C", randomId);
  assert.equal(added.sides.length, 3);
  assert.throws(() => removeSide(ended, ended.sides[0].id));
  assert.equal(removeSide(added, added.sides[2].id).sides.length, 2);
  assert.match(roundCard(1, [{type: "attack", attacker: "<Archers>", target: "Guards", total: 12, ac: 15, hit: false, damage: 0, casualties: 0, remaining: 4, destroyed: false, routed: false, morale: null}]), /&lt;Archers&gt;/);
});

function updateBattleHero(battle, unitId, bonus = "attack") {
  return {...battle, hero: {...battle.hero, unitId, bonus, attackBonus: 2, dc: 15, requestId: "req", grantedRequestId: ""}};
}
