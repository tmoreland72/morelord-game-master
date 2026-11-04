import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ContextualSocketService} from "../../morelord-core/scripts/services/contextual-socket-service.js";
import * as users from "../../morelord-core/scripts/services/user-service.js";
import * as participation from "../../morelord-core/scripts/ui/actor-participation.js";
import {actorIdentity} from "../../morelord-core/scripts/ui/actor-identity.js";
import * as currency from "../../morelord-core/scripts/services/currency-service.js";
import {
  HOARD_BANDS, addHoardCoins, auditTreasure, commitHoardStep, describeRow, emptyHoardState, findSrdItem,
  hoardCardHTML, hoardCoinPurse, loadTreasure, lookupKey, needsGmPlace, nextHoardStep, rangeIssues, resolveSpellScroll
} from "../scripts/treasure.mjs";
import {initializeRequests, createRequest, placeHoardItem, registerRequestRenderers} from "../scripts/requests.mjs";

const ID = "morelord-game-master";
const rowAt = (hoard, roll) => hoard.rows.find(row => roll >= row.min && roll <= row.max);

test("treasure tables cover d100 and map every SRD name to a lookup key", async () => {
  const data = await loadTreasure();
  assert.deepEqual(auditTreasure(data), []);
  assert.deepEqual(data.hoards.map(hoard => hoard.id), HOARD_BANDS.map(band => band.id));
  assert.equal(data.hoards.every(hoard => hoard.coins == null), true);
  const names = data.tables.flatMap(table => table.rows.map(row => row.name));
  assert.equal(names.includes("Bead of Nourishment"), true);
  assert.equal(names.includes("Energy Bow"), true);
  assert.equal(names.includes("Weapon of Warning"), true);
  assert.equal(names.includes("Potion of Healing"), true);
  assert.equal(names.includes("Dragon Orb"), false);
  assert.equal(names.includes("Mysterious Deck"), false);
  for (const name of names) {
    const key = lookupKey(name);
    assert.match(key, /^[a-z0-9]+$/);
    assert.equal(lookupKey(name), key);
  }
  assert.equal(lookupKey("Spell Scroll (level 3)"), "spellscrolllevel3");
  assert.equal(findSrdItem(new Map([[lookupKey("Spell Scroll (Level 3)"), {name: "Spell Scroll (Level 3)", uuid: "Item.scroll"}]]), "Spell Scroll (level 3)").uuid, "Item.scroll");
  const source = readFileSync(new URL("../data/srd-treasure.json", import.meta.url), "utf8");
  for (const banned of ["Deck of Many Things", "Orb of Dragonkind", "Apparatus of Kwalish", "morelord-compendium", "Magic Item Table"]) assert.equal(source.includes(banned), false, banned);
  const treasureSource = readFileSync(new URL("../scripts/treasure.mjs", import.meta.url), "utf8");
  assert.equal(treasureSource.includes("morelord-compendium"), false);
  assert.doesNotMatch(treasureSource, /img:.*gem-pile-gold\.webp/);
  assert.match(treasureSource, /icons\/commodities\/treasure\/brooch-crown-gold\.webp/);
  assert.match(treasureSource, /Foundry 14\.369/);
  assert.equal(readFileSync(new URL("../module.json", import.meta.url), "utf8").includes("morelord-craftworks"), false);
  assert.deepEqual(rangeIssues([{min: 1, max: 99}], 100), [100]);
  const low = data.hoards[0];
  const high = data.hoards[1];
  assert.equal(describeRow(rowAt(low, 1)), "No treasure");
  assert.equal(describeRow(rowAt(high, 4)), "No treasure");
  assert.deepEqual(rowAt(low, 7).valuables[0], {kind: "gems", dice: 2, sides: 6, each: {gp: 10}});
  assert.deepEqual(rowAt(low, 17).valuables[0], {kind: "art", dice: 2, sides: 4, each: {gp: 25}});
  assert.deepEqual(rowAt(low, 27).valuables[0], {kind: "gems", dice: 2, sides: 6, each: {gp: 50}});
  assert.equal(rowAt(low, 37).magic[0].tables[0], "common");
  assert.equal(rowAt(low, 37).magic[0].sides, 6);
  assert.equal(rowAt(low, 61).magic[0].tables[0], "uncommon");
  assert.deepEqual(rowAt(low, 86).magic[0].tables, ["rare-1", "rare-2"]);
  assert.equal(rowAt(low, 86).valuables[0].kind, "art");
  assert.equal(rowAt(low, 86).valuables[0].each.gp, 25);
  assert.equal(rowAt(low, 100).magic[0].count, 1);
  assert.equal(rowAt(low, 100).magic[0].tables[0], "very-rare");
  assert.deepEqual(rowAt(high, 23).valuables[0], {kind: "art", dice: 2, sides: 4, each: {gp: 250}});
  assert.equal(rowAt(high, 29).magic[0].tables[0], "common");
  assert.equal(rowAt(high, 75).magic[0].count, 1);
  assert.deepEqual(rowAt(high, 75).magic[0].tables, ["rare-1", "rare-2"]);
  assert.equal(rowAt(high, 95).magic[0].tables[0], "very-rare");
  assert.equal(rowAt(high, 95).magic[0].sides, 4);
  assert.equal(rowAt(high, 99).magic[0].count, 1);
  assert.equal(rowAt(low, 1).valuables.length + rowAt(low, 1).magic.length, 0);
});

test("hoard coins use one denomination and Core addCoins when it exists", async () => {
  assert.deepEqual(hoardCoinPurse(0), {});
  assert.deepEqual(hoardCoinPurse(9), {cp: 9});
  assert.deepEqual(hoardCoinPurse(15), {sp: 2});
  assert.deepEqual(hoardCoinPurse(50), {sp: 5});
  assert.deepEqual(hoardCoinPurse(100), {gp: 1});
  assert.deepEqual(hoardCoinPurse(250), {gp: 3});
  assert.deepEqual(hoardCoinPurse(3050), {gp: 31});
  for (const purse of [hoardCoinPurse(9), hoardCoinPurse(50), hoardCoinPurse(3050)]) {
    assert.equal("pp" in purse || "ep" in purse, false);
  }
  const seen = [];
  const actor = {name: "Aster", system: {currency: {pp: 1, gp: 4, ep: 0, sp: 0, cp: 3}}, async update(data) {
    actor.updates.push(data);
    for (const [key, value] of Object.entries(data)) if (key.startsWith("system.currency.")) actor.system.currency[key.split(".").pop()] = value;
  }, updates: []};
  await addHoardCoins(actor, {gp: 2, pp: 9, ep: 4}, {currency: {async addCoins(_actor, coins) { seen.push(coins); }}});
  assert.deepEqual(seen, [{gp: 2}]);
  assert.equal(actor.updates.length, 0);
  await addHoardCoins(actor, {sp: 5}, {});
  assert.deepEqual(actor.updates, [{"system.currency.sp": 5}]);
  globalThis.MorelordCore = {currency: {async addCoins(subject, coins) { subject.system.currency.gp += coins.gp; seen.push(["core", coins]); }}};
  await addHoardCoins(actor, {gp: 4});
  assert.equal(actor.system.currency.gp, 8);
  assert.deepEqual(seen.at(-1), ["core", {gp: 4}]);
  const calls = [];
  const data = {hoards: [{id: "cr-0-4", label: "CR 0-4", die: 100, rows: [{min: 1, max: 100, coins: [{denomination: "ep", dice: 1, sides: 6, multiplier: 1}], valuables: [], magic: []}]}], tables: []};
  const first = await commitHoardStep({data, bandId: "cr-0-4", state: emptyHoardState("actor"), totals: [12], index: new Map(), addCoins: purse => calls.push(purse)});
  const coins = nextHoardStep(data, "cr-0-4", first.state);
  assert.deepEqual(coins.formulas, ["1d6"]);
  const awarded = await commitHoardStep({data, bandId: "cr-0-4", state: first.state, totals: [1], index: new Map(), addCoins: purse => calls.push(purse)});
  assert.deepEqual(calls, [{sp: 5}]);
  assert.equal(awarded.state.coins.granted, true);
  const again = await commitHoardStep({data, bandId: "cr-0-4", state: awarded.state, stepId: "coins", totals: [1], index: new Map(), addCoins: purse => calls.push(purse)});
  assert.equal(again.alreadyResolved, true);
  assert.equal(calls.length, 1);
});

test("a rare item is one step, and the step card survives a re-render without granting twice", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(" ")); };
  try {
  const data = await loadTreasure();
  let state = emptyHoardState("actor");
  state = (await commitHoardStep({data, bandId: "cr-0-4", state, totals: [86], index: new Map()})).state;
  assert.match(state.rowText, /2d4 art objects \(25 GP each\)/);
  assert.match(state.rowText, /1d4 Rare magic items/);
  state = (await commitHoardStep({data, bandId: "cr-0-4", state, totals: [4], index: new Map(), placeItem: async () => ({uuid: "Actor.actor.Item.art"})})).state;
  state = (await commitHoardStep({data, bandId: "cr-0-4", state, totals: [1], index: new Map()})).state;
  const item = nextHoardStep(data, "cr-0-4", state);
  assert.equal(item.kind, "magic");
  assert.deepEqual(item.formulas, ["1d2", "1d100"]);
  const places = [];
  const granted = await commitHoardStep({
    data, bandId: "cr-0-4", state, totals: [2, 1], index: new Map(),
    placeItem: async itemData => { places.push(itemData.name); return {uuid: "Actor.actor.Item.mace"}; }
  });
  assert.equal(granted.state.items[0].tableId, "rare-2");
  assert.equal(granted.state.items[0].name, "Mace of Smiting");
  assert.equal(places.length, 0);
  const repeat = await commitHoardStep({data, bandId: "cr-0-4", state: granted.state, stepId: item.id, totals: [2, 1], index: new Map(), placeItem: async () => { places.push("again"); return {uuid: "Actor.actor.Item.again"}; }});
  assert.equal(repeat.alreadyResolved, true);
  assert.equal(places.length, 0);
  const html = hoardCardHTML({title: "Treasure Hoard", state: granted.state, step: null, escape: value => value});
  assert.equal(html, hoardCardHTML({title: "Treasure Hoard", state: granted.state, step: null, escape: value => value}));
  assert.match(html, /Mace of Smiting/);
  assert.doesNotMatch(html, /data-uuid="[^"]*Mace/);
  assert.match(html, /Actor\.actor\.Item\.art/);
  assert.equal((html.match(/data-mlgm-hoard-step/g) ?? []).length, 0);
  assert.equal(places.length, 0);
  assert.equal(warnings.some(line => /Art object|Gemstone/.test(line)), false);
  assert.equal(warnings.some(line => line.includes("Mace of Smiting")), true);
  } finally { console.warn = originalWarn; }
});

test("hoard row 95 rolls one item per counted roll, each from its own SRD 5.2 rarity table", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const data = await loadTreasure();
    const named = id => data.tables.find(table => table.id === id);
    // SRD 5.2 sorts magic items by rarity. Nothing in the data is a lettered 2014 table.
    assert.equal(data.tables.some(table => /\bTable [A-I]\b/.test(table.name)), false);
    for (const hoard of data.hoards) for (const row of hoard.rows) for (const term of row.magic ?? []) for (const id of term.tables) assert.ok(named(id), id);

    const drive = async (bandId, hoardRoll, valuables, count, picks) => {
      let state = emptyHoardState("actor");
      const labels = [];
      const run = async totals => {
        const step = nextHoardStep(data, bandId, state);
        labels.push(step);
        state = (await commitHoardStep({data, bandId, state, totals, index: new Map(), placeItem: async () => ({uuid: "Actor.actor.Item.x"})})).state;
        return step;
      };
      await run([hoardRoll]);
      await run([valuables]);
      await run([count]);
      for (const totals of picks) await run(totals);
      return {state, labels, next: nextHoardStep(data, bandId, state)};
    };

    // CR 0-4, row 95: 2d6 gems and 1d4 Rare magic items. Rare is split over two d100 tables, picked by 1d2.
    assert.deepEqual(rowAt(data.hoards[0], 95).magic, [{tables: ["rare-1", "rare-2"], dice: 1, sides: 4}]);
    const three = await drive("cr-0-4", 95, 7, 3, [[1, 40], [2, 10], [1, 55]]);
    assert.equal(three.state.counts["0"] ?? Object.values(three.state.counts)[0], 3);
    assert.equal(three.state.items.length, 3);
    assert.deepEqual(three.state.items.map(item => item.tableId), ["rare-1", "rare-2", "rare-1"]);
    for (const item of three.state.items) {
      const table = named(item.tableId);
      assert.equal(table.rarity, "Rare");
      const row = table.rows.find(entry => item.roll >= entry.min && item.roll <= entry.max);
      assert.equal(row.name, item.catalogName);
    }
    assert.equal(three.next, null);
    const magicSteps = three.labels.filter(step => step.kind === "magic");
    assert.deepEqual(magicSteps.map(step => step.formulas), [["1d2", "1d100"], ["1d2", "1d100"], ["1d2", "1d100"]]);
    assert.deepEqual(magicSteps.map(step => step.prompt.slice(0, 22)), ["Rare magic item 1 of 3", "Rare magic item 2 of 3", "Rare magic item 3 of 3"]);
    assert.match(magicSteps[0].prompt, /1d2 to pick the table \(1 = Rare Magic Items, 2 = Rare Magic Items II\), then 1d100/);
    assert.match(three.labels.find(step => step.kind === "magic-count").prompt, /roll 1d4 for how many/);

    const html = hoardCardHTML({title: "Treasure Hoard", state: three.state, step: null, escape: value => value});
    assert.match(html, /Magic items \(3 of 3\)/);
    assert.match(html, /1d2: 2, d100: 10/);
    const partial = await drive("cr-0-4", 95, 7, 3, [[1, 40]]);
    assert.equal(nextHoardStep(data, "cr-0-4", partial.state).index, 1);
    assert.match(nextHoardStep(data, "cr-0-4", partial.state).prompt, /item 2 of 3/);

    // A count of 1 yields one item, and a count of 4 yields four.
    assert.equal((await drive("cr-0-4", 95, 7, 1, [[2, 99]])).state.items.length, 1);
    const four = await drive("cr-0-4", 95, 7, 4, [[1, 1], [1, 2], [2, 3], [2, 4]]);
    assert.equal(four.state.items.length, 4);
    assert.equal(four.next, null);

    // CR 5-10, row 95: Very Rare items, one table, so each item is a single d100.
    assert.deepEqual(rowAt(data.hoards[1], 95).magic, [{tables: ["very-rare"], dice: 1, sides: 4}]);
    const veryRare = await drive("cr-5-10", 95, 9, 3, [[12], [50], [76]]);
    assert.equal(veryRare.state.items.length, 3);
    assert.equal(veryRare.state.items.every(item => item.tableId === "very-rare" && item.choice == null), true);
    assert.equal(veryRare.labels.filter(step => step.kind === "magic").every(step => step.formulas.length === 1), true);
  } finally { console.warn = warn; }
});

test("the chat card rolls one step at a time, grants once, and keeps private hoards whispered to the roller and GM", async () => {
  const events = new Map();
  globalThis.Hooks = {on(name, fn) { events.set(name, [...(events.get(name) ?? []), fn]); return fn; }, off() {}, call() {}};
  const gm = {id: "gm", isGM: true, active: true};
  const player = {id: "player", isGM: false, active: true};
  const stranger = {id: "stranger", isGM: false, active: true};
  const created = [];
  const actor = {
    id: "actor", uuid: "Actor.actor", name: "Aster", type: "character", hasPlayerOwner: true, isOwner: true,
    system: {currency: {pp: 0, gp: 0, ep: 0, sp: 0, cp: 0}, skills: {prc: {}}},
    testUserPermission: user => user.isGM || user.id === "player",
    async update(data) { actor.updates.push(structuredClone(data)); },
    updates: [],
    async createEmbeddedDocuments(_type, documents) {
      return documents.map(document => {
        created.push(structuredClone(document));
        return {uuid: `Actor.actor.Item.${created.length}`, name: document.name};
      });
    }
  };
  player.character = actor;
  class Collection extends Map {
    get contents() { return [...this.values()]; }
    [Symbol.iterator]() { return this.values(); }
    filter(fn) { return this.contents.filter(fn); }
    find(fn) { return this.contents.find(fn); }
  }
  const collection = rows => new Collection(rows.map(row => [row.id, row]));
  const pack = {
    documentName: "Item", collection: "dnd5e.equipment24",
    async getIndex() {
      return [
        {_id: "bead", name: "Bead of Nourishment", type: "consumable"},
        {_id: "gem", name: "Gemstone (10 GP)", type: "loot"},
        {_id: "scroll", name: "Spell Scroll (Level 3)", type: "consumable"},
        {_id: "mace", name: "Mace of Smiting", type: "weapon"}
      ];
    }
  };
  globalThis.game = {
    user: gm, users: collection([gm, player, stranger]), actors: collection([actor]), messages: collection([]),
    system: {id: "dnd5e"}, modules: collection([{id: "morelord-core", active: true}]),
    i18n: {localize: text => text}, settings: {settings: new Map([["morelord-core.ignoredUserIds", true]]), get: () => []}, packs: [pack]
  };
  globalThis.foundry = {utils: {deepClone: structuredClone, randomID: () => crypto.randomUUID()}};
  globalThis.ui = {notifications: {warn() {}, error() {}}, chat: {updateMessage() {}}};
  globalThis.CONFIG = {DND5E: {skills: {prc: {label: "Perception"}}}};
  const faces = [];
  const shown = [];
  const rolledTotals = new WeakMap();
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; }
    get total() { return rolledTotals.get(this); }
    async evaluate() {
      const match = /^(\d+)d(\d+)$/.exec(this.formula);
      const total = faces.length ? faces.shift() : 1;
      const dice = Number(match[1]);
      const sides = Number(match[2]);
      if (!Number.isInteger(total) || total < dice || total > dice * sides) throw new Error(`Bad ${this.formula} total ${total}`);
      rolledTotals.set(this, total);
      return this;
    }
    static fromData(data) {
      const roll = new this(data.formula);
      const total = data.total ?? data.terms?.[0]?.results?.reduce((sum, result) => sum + result.result, 0);
      rolledTotals.set(roll, total);
      return roll;
    }
    toJSON() { return {formula: this.formula, total: this.total, evaluated: true}; }
  };
  const probe = new Roll("1d6");
  assert.throws(() => { probe.total = 4; }, /getter/);
  globalThis.ChatMessage = {
    getSpeaker: ({actor: speaker}) => ({actor: speaker?.id}),
    async create(data) {
      const message = {
        id: crypto.randomUUID(), author: gm, timestamp: Date.now(), rolls: [], blind: false, whisper: [], ...data,
        flags: structuredClone(data.flags ?? {}),
        getFlag(ns, key) { return this.flags?.[ns]?.[key]; },
        async setFlag(ns, key, value) { this.flags[ns] ??= {}; this.flags[ns][key] = structuredClone(value); },
        async update(patch) {
          for (const [key, value] of Object.entries(patch)) {
            if (key === "content") this.content = value;
            else if (key === "rolls") this.rolls = value;
            else if (key === "blind") this.blind = value;
            else if (key === "whisper") this.whisper = value;
            else if (key.startsWith("flags.")) {
              const parts = key.split(".");
              let target = this;
              for (const part of parts.slice(0, -1)) target = target[part] ??= {};
              target[parts.at(-1)] = structuredClone(value);
            }
          }
        }
      };
      game.messages.set(message.id, message);
      return message;
    }
  };
  globalThis.fromUuid = async uuid => ({
    uuid, name: "Copied", type: "loot",
    toObject() { return {name: "Copied", type: "loot", img: "icons/svg/item-bag.svg", system: {quantity: 1}}; }
  });
  let dispatch;
  globalThis.socketlib = {registerModule: () => ({register(_name, fn) { dispatch = fn; }})};
  const transport = new ContextualSocketService();
  transport.start();
  globalThis.MorelordCore = {users: {...users, list: users.listUsers}, ui: {participation, actorIdentity}, rolls: {skill() {}}, socket: transport, currency};
  initializeRequests();
  const send = (message, hoard, sender = gm.id) => dispatch({namespace: ID, type: "roll", data: {requestId: message.id, actorId: actor.id, hoard}, senderUserId: sender, targetUserId: gm.id, messageId: crypto.randomUUID()});
  const buttons = html => html.match(/data-mlgm-hoard-step/g) ?? [];
  await assert.rejects(() => createRequest({kind: "hoard", band: "cr-17", actorIds: [actor.id]}), /treasure hoard/);
  const request = await createRequest({kind: "hoard", band: "cr-0-4", blind: false, actorIds: [actor.id]});
  assert.match(request.content, /Treasure Hoard · CR 0-4 · Aster/);
  assert.equal(buttons(request.content).length, 1);
  assert.equal(request.getFlag(ID, "hoard"), undefined);
  const denied = await send(request, undefined, stranger.id);
  assert.equal(denied.accepted, false);
  assert.equal(created.length, 0);
  game.dice3d = {async showForRoll(roll) { shown.push(roll.formula); }};
  faces.push(37);
  const table = await send(request);
  assert.deepEqual(table, {accepted: true});
  assert.equal(JSON.stringify(table).includes("Gemstone"), false);
  assert.match(request.content, /Hoard roll: 37/);
  assert.match(request.content, /2d6 gems \(10 GP each\)/);
  assert.equal(buttons(request.content).length, 1);
  assert.equal(created.length, 0);
  assert.deepEqual(shown, ["1d100"]);
  delete game.dice3d;
  faces.push(6);
  const gemRoll = new Roll("2d6");
  await gemRoll.evaluate();
  await send(request, {stepId: "valuables", rolls: [gemRoll.toJSON()]}, player.id);
  assert.equal(created.length, 1);
  assert.equal(created[0].system.quantity, 6);
  assert.match(request.content, /Gemstone \(10 GP\)/);
  assert.match(request.content, /content-link/);
  assert.equal(buttons(request.content).length, 1);
  const granted = created.length;
  const repeat = await send(request, {stepId: "valuables", rolls: [{total: 6}]});
  assert.equal(repeat.alreadyResolved, true);
  assert.equal(created.length, granted);
  const render = events.get("renderChatMessageHTML").at(-1);
  const root = chatRoot(request.content);
  render(request, root);
  assert.equal(created.length, granted);
  assert.match(root.source, /Gemstone \(10 GP\)/);
  assert.equal(buttons(root.source).length, 1);
  render(request, root);
  assert.equal(created.length, granted);
  faces.push(1, 1);
  await send(request);
  await send(request);
  assert.match(request.content, /Bead of Nourishment/);
  assert.equal(buttons(request.content).length, 0);
  assert.equal(request.rolls.at(-1) instanceof Roll, true);
  assert.equal(created.length, 2);
  const finished = await send(request);
  assert.equal(finished.alreadyResolved, true);
  assert.equal(created.length, 2);
  assert.equal(needsGmPlace(player, actor), false);
  actor.testUserPermission = () => false;
  assert.equal(needsGmPlace(player, actor), true);
  assert.equal(needsGmPlace(gm, actor), false);
  actor.testUserPermission = user => user.isGM || user.id === "player";

  const scrollFaces = [61, 6, 1, 85];
  const scrolls = {calls: 0};
  game.modules.set("morelord-craftworks", {id: "morelord-craftworks", active: true, api: {spellScrollGenerator: {
    hasAccess: true,
    async randomSpell(level) { scrolls.calls += 1; scrolls.level = level; return level === 3 ? {name: "Fireball", uuid: "Compendium.dnd5e.spells24.Item.fireball", level: 3} : null; },
    async createScrollItem({spellUuid, level}) { scrolls.made = {spellUuid, level}; return {item: {toObject() { return {name: "Spell Scroll: Fireball", type: "consumable", system: {quantity: 1}}; }}}; }
  }}});
  const crafted = await createRequest({kind: "hoard", band: "cr-0-4", blind: false, actorIds: [actor.id]});
  faces.push(...scrollFaces);
  for (let step = 0; step < 4; step += 1) await send(crafted);
  assert.equal(scrolls.level, 3);
  assert.deepEqual(scrolls.made, {spellUuid: "Compendium.dnd5e.spells24.Item.fireball", level: 3});
  assert.match(crafted.content, /Spell Scroll \(Level 3\): Fireball/);
  assert.match(crafted.content, /content-link/);
  game.modules.get("morelord-craftworks").active = false;
  const plain = await createRequest({kind: "hoard", band: "cr-0-4", blind: false, actorIds: [actor.id]});
  const before = scrolls.calls;
  faces.push(...scrollFaces);
  for (let step = 0; step < 4; step += 1) await send(plain);
  assert.equal(scrolls.calls, before);
  assert.match(plain.content, /Spell Scroll \(Level 3\)/);
  assert.doesNotMatch(plain.content, /Fireball/);
  game.modules.get("morelord-craftworks").active = true;
  game.modules.get("morelord-craftworks").api.spellScrollGenerator.hasAccess = false;
  assert.equal((await resolveSpellScroll("Spell Scroll (level 3)")).spell, null);
  game.modules.get("morelord-craftworks").api.spellScrollGenerator.hasAccess = true;
  game.modules.get("morelord-craftworks").api.spellScrollGenerator.randomSpell = async () => { throw new Error("offline"); };
  assert.equal((await resolveSpellScroll("Spell Scroll (cantrip)")).spell, null);
  game.modules.get("morelord-craftworks").api.spellScrollGenerator.randomSpell = async () => null;
  assert.equal((await resolveSpellScroll("Spell Scroll (level 1)")).spell, null);

  const beforePrivate = created.length;
  // A blind flag on a hoard is ignored: hoards are public or private.
  const priv = await createRequest({kind: "hoard", band: "cr-0-4", blind: true, private: true, actorIds: [actor.id]});
  assert.equal(priv.getFlag(ID, "request").private, true);
  assert.equal(priv.getFlag(ID, "request").blind, false);
  assert.equal(priv.blind, false);
  assert.deepEqual([...priv.whisper].sort(), ["gm", "player"]);
  assert.equal(priv.getFlag(ID, "hoardNext"), undefined);
  assert.equal(buttons(priv.content).length, 1);
  const privShown = [];
  game.dice3d = {async showForRoll(roll, _user, _sync, whisper, blind) { privShown.push({whisper, blind}); }};
  faces.push(27, 6);
  await send(priv);
  await send(priv);
  delete game.dice3d;
  assert.ok(privShown.length >= 1);
  for (const shown of privShown) { assert.deepEqual([...shown.whisper].sort(), ["gm", "player"]); assert.equal(shown.blind, false); }
  assert.match(priv.content, /Hoard roll: 27/);
  assert.doesNotMatch(priv.content, /data-mlgm-hoard-reveal|Reveal/);
  assert.deepEqual([...priv.whisper].sort(), ["gm", "player"]);
  // Private hoards grant as they roll, the same as public ones.
  assert.equal(created.length, beforePrivate + 1);
  const privRoot = chatRoot(priv.content);
  render(priv, privRoot);
  assert.match(privRoot.source, /Hoard roll: 27/);
  assert.equal(created.length, beforePrivate + 1);
  assert.equal(game.messages.contents?.some?.(message => message.getFlag?.(ID, "hoardLink")) ?? false, false);
  const ui = readFileSync(new URL("../scripts/main.mjs", import.meta.url), "utf8");
  assert.match(ui, /name="private"/);
  assert.match(ui, /private: data\.has\("private"\)/);
  assert.match(readFileSync(new URL("../scripts/main.mjs", import.meta.url), "utf8"), /data-roll-card="hoard"/);
  assert.equal(typeof placeHoardItem, "function");
});

test("a hoard card that rendered before ready gets its Roll button back", async () => {
  const events = new Map();
  globalThis.Hooks = {on(name, fn) { events.set(name, [...(events.get(name) ?? []), fn]); return fn; }, off() {}, call() {}};
  const gm = {id: "gm", isGM: true, active: true};
  const actor = {id: "actor", uuid: "Actor.actor", name: "Aster", type: "character", testUserPermission: () => true};
  class Collection extends Map {
    get contents() { return [...this.values()]; }
    [Symbol.iterator]() { return this.values(); }
    filter(fn) { return this.contents.filter(fn); }
    find(fn) { return this.contents.find(fn); }
  }
  const collection = rows => new Collection(rows.map(row => [row.id, row]));
  const listeners = [];
  const message = {
    id: "existing", author: gm, rolls: [],
    content: `<section class="ml-chat-card ml-stack mlgm-hoard"><h3>Treasure Hoard · CR 0-4 · Aster</h3><button type="button" data-mlgm-hoard-step="table">Roll</button></section>`,
    flags: {[ID]: {request: {kind: "hoard", band: "cr-0-4", actorIds: ["actor"], version: 2, blind: false, completed: []}}},
    getFlag(ns, key) { return this.flags?.[ns]?.[key]; },
    async update() {}
  };
  globalThis.game = {
    user: gm, users: collection([gm]), actors: collection([actor]), messages: collection([message]),
    system: {id: "dnd5e"}, modules: collection([{id: "morelord-core", active: true}]),
    i18n: {localize: text => text}, settings: {settings: new Map([["morelord-core.ignoredUserIds", true]]), get: () => []}, packs: []
  };
  globalThis.foundry = {utils: {deepClone: structuredClone, randomID: () => crypto.randomUUID()}};
  globalThis.ui = {notifications: {warn() {}, error() {}}, chat: {updateMessage(card) {
    const hook = events.get("renderChatMessageHTML")?.at(-1);
    const root = chatRoot(card.content);
    const original = root.querySelectorAll.bind(root);
    root.querySelectorAll = selector => original(selector).map(node => {
      node.addEventListener = type => { listeners.push(type); };
      return node;
    });
    hook?.(card, root);
  }}};
  globalThis.CONFIG = {DND5E: {skills: {}}};
  globalThis.Roll = class { constructor(formula) { this.formula = formula; } get total() { return undefined; } };
  globalThis.ChatMessage = {getSpeaker: () => ({}), async create() { return null; }};
  globalThis.socketlib = {registerModule: () => ({register() {}})};
  const transport = new ContextualSocketService();
  transport.start();
  globalThis.MorelordCore = {users: {...users, list: users.listUsers}, ui: {participation, actorIdentity}, rolls: {skill() {}}, socket: transport, currency};
  await loadTreasure();
  initializeRequests();
  assert.equal(listeners.includes("click"), true);
  const main = readFileSync(new URL("../scripts/main.mjs", import.meta.url), "utf8");
  const init = main.slice(main.indexOf('Hooks.once("init"'), main.indexOf('Hooks.once("ready"'));
  assert.match(init, /registerRequestRenderers\(\)/);
});

test("chat render before Core is ready skips the card without calling core()", () => {
  const events = new Map();
  globalThis.Hooks = {on(name, fn) { events.set(name, [...(events.get(name) ?? []), fn]); return fn; }, off() {}, call() {}};
  const gm = {id: "gm", isGM: true, active: true};
  const actor = {id: "actor", uuid: "Actor.actor", name: "Aster", type: "character", testUserPermission: () => true};
  class Collection extends Map {
    get contents() { return [...this.values()]; }
    [Symbol.iterator]() { return this.values(); }
    filter(fn) { return this.contents.filter(fn); }
    find(fn) { return this.contents.find(fn); }
  }
  const collection = rows => new Collection(rows.map(row => [row.id, row]));
  const hoard = {
    id: "early-hoard", author: gm, rolls: [],
    content: `<section class="ml-chat-card mlgm-hoard"><button type="button" data-mlgm-hoard-step="table">Roll</button></section>`,
    flags: {[ID]: {request: {kind: "hoard", band: "cr-0-4", actorIds: ["actor"], version: 2, blind: false, completed: []}}},
    getFlag(ns, key) { return this.flags?.[ns]?.[key]; }
  };
  const skill = {
    id: "early-skill", author: gm, rolls: [],
    content: `<section class="ml-chat-card mlgm-request"><button type="button" data-mlgm-actor="actor">Roll</button></section>`,
    flags: {[ID]: {request: {kind: "skill", skill: "prc", actorIds: ["actor"], version: 2, blind: false, completed: []}}},
    getFlag(ns, key) { return this.flags?.[ns]?.[key]; }
  };
  globalThis.game = {
    user: gm, users: collection([gm]), actors: collection([actor]), messages: collection([hoard, skill]),
    system: {id: "dnd5e"}, modules: collection([{id: "morelord-core", active: true}]),
    i18n: {localize: text => text}, settings: {settings: new Map([["morelord-core.ignoredUserIds", true]]), get: () => []}, packs: []
  };
  globalThis.CONFIG = {DND5E: {skills: {prc: {label: "Perception"}}, abilities: {}}};
  globalThis.MorelordCore = undefined;
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  registerRequestRenderers();
  const hook = events.get("renderChatMessageHTML").at(-1);
  const hoardRoot = chatRoot(hoard.content);
  const skillRoot = chatRoot(skill.content);
  assert.doesNotThrow(() => hook(hoard, hoardRoot));
  assert.doesNotThrow(() => hook(skill, skillRoot));
  assert.equal(errors.some(line => line.includes("Morelord Core")), false);
  assert.equal(hoardRoot.source.includes("data-mlgm-hoard-step"), true);
  console.error = originalError;
  const listeners = [];
  globalThis.ui = {notifications: {warn() {}, error() {}}, chat: {updateMessage(card) {
    const root = chatRoot(card.content);
    const original = root.querySelectorAll.bind(root);
    root.querySelectorAll = selector => original(selector).map(node => {
      node.addEventListener = type => { listeners.push(`${card.id}:${type}`); };
      return node;
    });
    hook(card, root);
  }}};
  globalThis.foundry = {utils: {deepClone: structuredClone, randomID: () => crypto.randomUUID()}};
  globalThis.Roll = class { constructor(formula) { this.formula = formula; } get total() { return undefined; } };
  globalThis.ChatMessage = {getSpeaker: () => ({}), async create() { return null; }};
  globalThis.socketlib = {registerModule: () => ({register() {}})};
  const transport = new ContextualSocketService();
  transport.start();
  globalThis.MorelordCore = {users: {...users, list: users.listUsers}, ui: {participation, actorIdentity}, rolls: {skill() {}}, socket: transport, currency};
  initializeRequests();
  assert.equal(listeners.includes("early-hoard:click"), true);
  assert.equal(listeners.includes("early-skill:click"), true);
});

function chatRoot(source) {
  const root = {
    source,
    querySelector(selector) {
      if (selector === "[data-mlgm-open-encounters]" || selector === "[data-mlgm-search-results]" || selector === "[data-mlgm-finalize]") return null;
      if ((selector === ".mlgm-hoard" && this.source.includes("mlgm-hoard")) || (selector === ".mlgm-request" && this.source.includes("mlgm-request"))) {
        return {owner: this, set outerHTML(value) { this.owner.source = value; }, get outerHTML() { return this.owner.source; }};
      }
      if (selector === "[data-mlgm-hoard-reveal]" && this.source.includes("data-mlgm-hoard-reveal")) return {addEventListener() {}, remove() {}};
      return null;
    },
    querySelectorAll(selector) {
      const button = () => ({disabled: false, dataset: {}, closest() { return {querySelector() { return null; }}; }, parentElement: null, addEventListener() {}});
      if (selector === "[data-mlgm-hoard-step]") return [...this.source.matchAll(/data-mlgm-hoard-step="/g)].map(button);
      if (selector === "[data-mlgm-actor]") return [...this.source.matchAll(/data-mlgm-actor="/g)].map(button);
      return [];
    }
  };
  return root;
}
