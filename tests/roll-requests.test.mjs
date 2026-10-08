import test from "node:test";
import assert from "node:assert/strict";
import {CHECK_TYPES, SPECIALTIES, buildCheckRequest, checkChoices, defaultCheckId, moveSpecialty, resolveRollActors, specialtyOrder, visibleSpecialties} from "../scripts/roll-requests.mjs";

const skills = {prc: {label: "Perception"}, ste: {label: "Stealth"}};
const abilities = {str: {label: "Strength"}, wis: {label: "Wisdom"}};

test("the request builder keeps a valid skill or ability when the type changes", () => {
  assert.deepEqual(CHECK_TYPES.map(type => type.id), ["skill", "ability", "save"]);
  assert.equal(defaultCheckId("skill", checkChoices("skill", {skills, abilities}), "ste"), "ste");
  assert.equal(defaultCheckId("ability", checkChoices("ability", {skills, abilities}), "ste"), "wis");
  assert.equal(defaultCheckId("save", checkChoices("save", {skills, abilities}), "wis"), "wis");
  assert.equal(defaultCheckId("ability", [], "wis"), "");
});

test("who rolls uses the party, selected party tokens, or one player", () => {
  assert.deepEqual(resolveRollActors({scope: "party", partyIds: ["a", "b", "a"], selectedActorIds: ["a"]}), ["a", "b"]);
  assert.deepEqual(resolveRollActors({scope: "tokens", partyIds: ["a", "b"], selectedActorIds: ["b", "c", "b"]}), ["b"]);
  assert.deepEqual(resolveRollActors({scope: "player", actorId: "a", partyIds: ["a", "b"]}), ["a"]);
  assert.throws(() => resolveRollActors({scope: "tokens", partyIds: ["a"], selectedActorIds: ["c"]}), /party character token/);
  assert.throws(() => resolveRollActors({scope: "player", actorId: "c", partyIds: ["a"]}), /Player Settings/);
  assert.throws(() => resolveRollActors({scope: "party", partyIds: []}), /Player Settings/);
});

test("specialty requests stay visible until this world hides them", () => {
  assert.deepEqual(visibleSpecialties({}), SPECIALTIES.map(specialty => specialty.id));
  assert.deepEqual(visibleSpecialties({showFate: false, showEncounter: true}), ["encounter", "search", "foraging", "death"]);
  assert.deepEqual(specialtyOrder(["fate", "death", "missing", "fate"]), ["fate", "death", "encounter", "search", "foraging"]);
  const order = moveSpecialty(["fate", "death", "encounter", "search", "foraging"], "death", "fate");
  assert.deepEqual(order, ["death", "fate", "encounter", "search", "foraging"]);
  assert.deepEqual(moveSpecialty(order, "death", "death"), order);
  assert.deepEqual(visibleSpecialties({showDeathSave: false}, order), ["fate", "encounter", "search", "foraging"]);
  assert.equal(order[0], "death");
  assert.deepEqual(buildCheckRequest({type: "save", checkId: "dex", dc: 12, blind: false, actorIds: ["a"]}), {kind: "save", ability: "dex", dc: 12, blind: false, actorIds: ["a"]});
  assert.equal(buildCheckRequest({type: "skill", checkId: "prc", dc: null, blind: true, actorIds: ["a"]}).skill, "prc");
});
