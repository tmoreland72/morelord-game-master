import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {CHECK_TYPES, SPECIALTIES, buildCheckRequest, characterFieldVisible, checkChoices, defaultCheckId, moveSpecialty, playerCharacterChoices, resolveRollActors, specialtyOrder, visibleSpecialties} from "../scripts/roll-requests.mjs";

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

test("changing who rolls shows and hides the character field without a refresh", async () => {
  assert.equal(characterFieldVisible("player"), true);
  assert.equal(characterFieldVisible("party"), false);
  assert.equal(characterFieldVisible("tokens"), false);
  const source = readFileSync(new URL("../scripts/main.mjs", import.meta.url), "utf8");
  const css = readFileSync(new URL("../styles/game-master.css", import.meta.url), "utf8");
  assert.match(source, /data-mlgm-character-field\$\{characterFieldVisible\(scope\) \? "" : " hidden"\}/);
  assert.doesNotMatch(source, /scope === "player" \? inlineField\("Character"/);
  assert.match(source, /if \(card\?\.dataset\.rollCard === "check"\) syncCharacterField\(card\);/);
  assert.match(css, /data-mlgm-character-field\]\[hidden\] \{ display:none!important; \}/);
  const sync = source.slice(source.indexOf("function syncCharacterField"), source.indexOf("function specialtyGrid"));
  const change = source.slice(source.indexOf("async function onChange"), source.indexOf("function volumeFromPercent"));
  const character = {value: "ada"};
  const scope = {name: "scope", value: "party"};
  const field = {
    hidden: true,
    value: character.value,
    style: {
      display: "none",
      setProperty(_name, value) { this.display = value; },
      removeProperty() { this.display = ""; }
    }
  };
  const card = {
    dataset: {rollCard: "check"},
    querySelector(selector) {
      if (selector === "[data-mlgm-character-field]") return field;
      if (selector.includes("scope")) return scope;
      return null;
    }
  };
  const saved = [];
  let rendered = 0;
  const context = vm.createContext({
    characterFieldVisible,
    tab: "rolls",
    state: {last: {check: {scope: "party", actorId: "ada"}}},
    card,
    render() { rendered += 1; },
    readBuilder: () => ({scope: scope.value, actorId: character.value}),
    persist: async changeFn => {
      const next = {last: {check: {}}};
      changeFn(next);
      saved.push(next.last.check.scope);
    }
  });
  vm.runInContext(`${sync}\n${change}`, context);
  const choose = async (value, target = scope) => {
    scope.value = value;
    context.event = {target};
    await vm.runInContext("onChange(event)", context);
  };
  scope.closest = selector => selector === "[data-roll-card]" ? card : null;
  await choose("player");
  assert.equal(field.hidden, false);
  assert.equal(field.style.display, "");
  assert.equal(rendered, 0);
  assert.deepEqual(saved, ["player"]);
  assert.equal(context.state.last.check.scope, "player");
  assert.equal(character.value, "ada");
  const option = {name: "", closest: selector => selector === "[data-roll-card]" ? card : null};
  await choose("party", option);
  assert.equal(field.hidden, true);
  assert.equal(field.style.display, "none");
  assert.equal(rendered, 0);
  assert.deepEqual(saved, ["player", "party"]);
  assert.equal(character.value, "ada");
  await choose("tokens", option);
  assert.equal(field.hidden, true);
  assert.equal(rendered, 0);
  await choose("player", option);
  assert.equal(field.hidden, false);
  assert.equal(rendered, 0);
  assert.equal(character.value, "ada");
});

test("who rolls uses the party, selected party tokens, or one player character", () => {
  assert.deepEqual(playerCharacterChoices([
    {id: "npc", type: "npc", name: "Wolf"},
    {id: "b", type: "character", name: "Bran"},
    {id: "a", type: "character", name: "Ada"},
    {type: "character", name: "Nameless"}
  ]), [{id: "a", name: "Ada"}, {id: "b", name: "Bran"}]);
  assert.deepEqual(resolveRollActors({scope: "party", partyIds: ["a", "b", "a"], selectedActorIds: ["a"]}), ["a", "b"]);
  assert.deepEqual(resolveRollActors({scope: "tokens", partyIds: ["a", "b"], selectedActorIds: ["b", "c", "b"]}), ["b"]);
  assert.deepEqual(resolveRollActors({scope: "player", actorId: "c", partyIds: [], characterIds: ["a", "c"]}), ["c"]);
  assert.throws(() => resolveRollActors({scope: "tokens", partyIds: ["a"], selectedActorIds: ["c"]}), /party character token/);
  assert.equal(resolveRollActors({scope: "player", actorId: "", characterIds: ["a"]}), null);
  assert.equal(resolveRollActors({scope: "player", actorId: "npc", partyIds: ["npc"], characterIds: ["a"]}), null);
  assert.throws(() => resolveRollActors({scope: "party", partyIds: []}), /Player Settings/);
});

test("sending one character with nobody chosen warns and leaves the form", async () => {
  const source = readFileSync(new URL("../scripts/main.mjs", import.meta.url), "utf8");
  const builder = source.slice(source.indexOf("function checkBuilder"), source.indexOf("function refreshCheckSelect"));
  assert.match(builder, /playerCharacters\(\)/);
  assert.match(builder, /option\("", "Choose a character", actorId\)/);
  assert.match(builder, /<span>Character<\/span>/);
  assert.match(builder, /disabled: scope === "party" && !partyIds\.length/);
  assert.doesNotMatch(builder, /partyActorIds\(\)\.map/);
  const send = source.slice(source.indexOf("async function sendCheck"), source.indexOf("async function sendBulkCoins"));
  assert.match(send, /ui\.notifications\.warn\("Choose a character\."\)/);
  assert.doesNotMatch(send, /notifications\.error/);
  const requests = readFileSync(new URL("../scripts/requests.mjs", import.meta.url), "utf8");
  assert.match(requests, /const singleCharacter = actorIds\.length === 1 && \["skill", "ability", "save"\]\.includes\(kind\)/);
  assert.match(requests, /actor\?\.type === "character"/);
  const warnings = [];
  const persisted = [];
  const created = [];
  let rendered = 0;
  const context = vm.createContext({
    saving: Promise.resolve(),
    readBuilder: () => ({scope: "player", checkType: "skill", checkId: "prc", dc: 12, actorId: "", blind: false}),
    resolveRollActors,
    partyActorIds: () => [],
    selectedTokenActorIds: () => [],
    playerCharacters: () => [{id: "ada", name: "Ada"}, {id: "bran", name: "Bran"}],
    persist: async change => { persisted.push(change); },
    createRequest: async config => { created.push(config); return {id: "message"}; },
    buildCheckRequest,
    ui: {notifications: {warn: message => warnings.push(message), error: message => warnings.push(`error:${message}`)}},
    render() { rendered += 1; }
  });
  vm.runInContext(send, context);
  await vm.runInContext("sendCheck()", context);
  assert.deepEqual(warnings, ["Choose a character."]);
  assert.deepEqual(persisted, []);
  assert.deepEqual(created, []);
  assert.equal(rendered, 0);
  context.readBuilder = () => ({scope: "player", checkType: "skill", checkId: "prc", dc: 12, actorId: "bran", blind: true});
  await vm.runInContext("sendCheck()", context);
  assert.deepEqual(warnings, ["Choose a character."]);
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].actorIds, ["bran"]);
  assert.equal(created[0].blind, true);
  assert.equal(rendered, 0);
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
