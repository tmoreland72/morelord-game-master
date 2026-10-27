import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {CHECK_TYPES, SPECIALTIES, buildCheckRequest, checkChoices, defaultCheckId, moveSpecialty, resolveRollActors, specialtyOrder, visibleSpecialties} from "../scripts/roll-requests.mjs";

const skills = {prc: {label: "Perception"}, ste: {label: "Stealth"}};
const abilities = {str: {label: "Strength"}, wis: {label: "Wisdom"}};

test("the request builder keeps a valid skill or ability when the type changes", () => {
  assert.deepEqual(CHECK_TYPES.map(type => type.id), ["skill", "ability", "save"]);
  assert.equal(defaultCheckId("skill", checkChoices("skill", {skills, abilities}), "ste"), "ste");
  assert.equal(defaultCheckId("ability", checkChoices("ability", {skills, abilities}), "ste"), "wis");
  assert.equal(defaultCheckId("save", checkChoices("save", {skills, abilities}), "wis"), "wis");
  assert.equal(defaultCheckId("ability", [], "wis"), "");
  const srdSkills = {acr: {label: "Acrobatics"}, prc: {label: "Perception"}, thv: {label: "Thieves' Tools"}};
  const srdAbilities = {str: {label: "Strength"}, wis: {label: "Wisdom"}, hon: {label: "Honor"}};
  assert.deepEqual(checkChoices("skill", {skills: srdSkills, abilities: srdAbilities}).map(choice => choice.id), ["acr", "prc"]);
  assert.deepEqual(checkChoices("save", {skills: srdSkills, abilities: srdAbilities}).map(choice => choice.id), ["str", "wis"]);
  assert.deepEqual(checkChoices("ability", {skills: srdSkills, abilities: srdAbilities}), checkChoices("save", {skills: srdSkills, abilities: srdAbilities}));
});

test("changing the request type replaces the second dropdown with that type's SRD list", () => {
  const source = readFileSync(new URL("../scripts/main.mjs", import.meta.url), "utf8");
  const catalogs = source.slice(source.indexOf("function catalogs()"), source.indexOf("function checkBuilder()"));
  const refresh = source.slice(source.indexOf("function refreshCheckSelect"), source.indexOf("function specialtyGrid()"));
  const skills = Object.fromEntries(["acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv", "med", "nat", "prc", "prf", "per", "rel", "slt", "ste", "sur", "thv"].map(id => [id, {label: id}]));
  const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha", "hon"].map(id => [id, {label: id}]));
  const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[character]);
  const context = vm.createContext({
    CHECK_TYPES, checkChoices, defaultCheckId,
    CONFIG: {DND5E: {skills, abilities}},
    game: {i18n: {localize: text => text}},
    option: (id, name, selected) => `<option value="${escape(id)}" ${id === selected ? "selected" : ""}>${escape(name)}</option>`
  });
  vm.runInContext(`${catalogs}\n${refresh}`, context);
  const optionsOf = html => [...html.matchAll(/<option value="([^"]*)"([^>]*)>/g)].map(match => ({value: match[1], selected: /\bselected\b/.test(match[2])}));
  const cardFor = (type, current) => {
    const span = {textContent: "Skill"};
    const select = {value: current, closest: () => ({querySelector: () => span})};
    Object.defineProperty(select, "innerHTML", {set(html) {
      select.options = optionsOf(html);
      select.value = select.options.find(item => item.selected)?.value ?? select.value;
    }});
    return {span, select, querySelector(selector) {
      if (selector.includes("checkType")) return {value: type};
      if (selector.includes("checkId")) return select;
      return null;
    }};
  };
  const ability = cardFor("ability", "ste");
  context.card = ability;
  vm.runInContext("refreshCheckSelect(card)", context);
  assert.equal(ability.span.textContent, "Ability");
  assert.deepEqual(ability.select.options.map(item => item.value), ["str", "dex", "con", "int", "wis", "cha"]);
  assert.equal(ability.select.value, "wis");
  const save = cardFor("save", "str");
  context.card = save;
  vm.runInContext("refreshCheckSelect(card)", context);
  assert.equal(save.span.textContent, "Ability");
  assert.equal(save.select.value, "str");
  assert.deepEqual(save.select.options.map(item => item.value), ["str", "dex", "con", "int", "wis", "cha"]);
  const skill = cardFor("skill", "str");
  context.card = skill;
  vm.runInContext("refreshCheckSelect(card)", context);
  assert.equal(skill.span.textContent, "Skill");
  assert.equal(skill.select.value, "prc");
  assert.equal(skill.select.options.some(item => item.value === "thv"), false);
  assert.equal(skill.select.options.length, 18);
  assert.match(source, /if \(el\.name === "checkType"\) refreshCheckSelect\(card\);/);
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
