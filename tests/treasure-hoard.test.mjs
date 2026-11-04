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
  ITEM_PACKS, hoardCardHTML, hoardCoinPurse, loadTreasure, lookupKey, magicItemFor, srdItemIndex, needsGmPlace, nextHoardStep, rangeIssues, resolveSpellScroll
} from "../scripts/treasure.mjs";
import {initializeRequests, createRequest, placeHoardItem, registerRequestRenderers} from "../scripts/requests.mjs";

const ID = "morelord-game-master";
const rowAt = (hoard, roll) => hoard.rows.find(row => roll >= row.min && roll <= row.max);

test("treasure tables copy the compendium Table 2 hoards and Magic Item Tables A-G exactly", async () => {
  const data = await loadTreasure();
  assert.deepEqual(auditTreasure(data), []);
  assert.deepEqual(data.hoards.map(hoard => hoard.id), HOARD_BANDS.map(band => band.id));
  const live = JSON.parse(readFileSync(new URL("./fixtures/compendium-table2.json", import.meta.url), "utf8")).tables;
  const fix = text => text.replaceAll("ΓÇö", "—").replace(/^@item\[[^\]|]*\|\|([^|]+)\|\]$/, "$1").replace(/^@item\[([^\]]+)\]$/, "$1");
  const ours = [...data.hoards, ...data.tables.filter(table => table.id !== "H")];
  assert.equal(ours.length, live.length);
  for (const table of live) {
    const mine = ours.find(entry => fix(table.name).includes(entry.name ?? entry.label) || entry.name === table.name);
    assert.ok(mine, table.name);
    assert.equal(table.formula, "d100");
    assert.deepEqual(mine.rows.map(row => [row.min, row.max]), table.results.map(([min, max]) => [min, max]), table.name);
    mine.rows.forEach((row, i) => { if (!row.variant) assert.equal(row.entry, fix(table.results[i][2]), `${table.name} ${row.min}`); });
  }
  assert.deepEqual(data.tables.map(table => [table.id, table.rows.length]), [["A", 8], ["B", 35], ["C", 28], ["D", 16], ["E", 7], ["F", 60], ["G", 88], ["H", 69]]);
  for (const table of data.tables) for (const row of table.rows) for (const pick of row.variant?.rows ?? [row]) assert.match(lookupKey(pick.item), /^[a-z0-9]+$/);
  // Arrow of Slaying is the one swap.
  const swapped = data.tables.flatMap(table => table.rows.filter(row => row.swappedFrom));
  assert.deepEqual(swapped.map(row => [row.entry, row.item]), [["Arrow of slaying", "Ammunition of Slaying"]]);
  assert.equal(magicItemFor(data, "E", 95).name, "Ammunition of Slaying");
  // Table H follows the 2014 DMG Table H.
  const h = data.tables.find(table => table.id === "H");
  assert.deepEqual(rangeIssues(h.rows, 100), []);
  assert.equal(magicItemFor(data, "H", 5).name, "Weapon, +3");
  assert.equal(magicItemFor(data, "H", 12).catalogName, "Amulet of the Planes");
  assert.equal(magicItemFor(data, "H", 59).pending.die, 2);
  assert.equal(magicItemFor(data, "H", 59, 2).catalogName.includes("stone"), true);
  // Variants roll their own die; +N armor keeps its base armor in the name.
  assert.equal(magicItemFor(data, "G", 13).pending.die, 8);
  assert.match(magicItemFor(data, "G", 13, 3).name, /Golden Lions/i);
  assert.equal(magicItemFor(data, "G", 13, 3).catalogName, "Figurine of Wondrous Power");
  assert.equal(magicItemFor(data, "G", 48, 1).catalogName, "Silver Horn of Valhalla");
  assert.equal(magicItemFor(data, "G", 30).name, "Armor, +1 (Chain Mail)");
  // Row trinkets grant the bundled Fragment of Fate.
  assert.equal(data.trinkets["fragment-of-fate"].name, "Fragment of Fate");
  assert.equal("_id" in data.trinkets["fragment-of-fate"], false);
  const low = data.hoards[0];
  assert.equal(rowAt(low, 95).trinket, "fragment-of-fate");
  assert.match(describeRow(rowAt(low, 95), data), /Roll 1d4 times on Magic Item Table F; Fragment of Fate trinket/);
  assert.equal(describeRow(rowAt(low, 1), data), "No treasure");
  assert.deepEqual(rangeIssues([{min: 1, max: 99}], 100), [100]);
  assert.equal(lookupKey("Spell Scroll (level 3)"), "spellscrolllevel3");
  const source = readFileSync(new URL("../scripts/treasure.mjs", import.meta.url), "utf8");
  assert.equal(source.includes("morelord-compendium"), false);
  assert.match(source, /icons\/commodities\/treasure\/brooch-crown-gold\.webp/);
  assert.match(source, /Foundry 14\.369/);
  assert.equal(readFileSync(new URL("../module.json", import.meta.url), "utf8").includes("morelord-craftworks"), false);
});

test("items resolve from the 2024 DMG, then the 2024 PHB, then SRD 5.2, and show their source", async () => {
  const pack = (collection, names) => ({documentName: "Item", collection, async getIndex() { return names.map(name => ({_id: lookupKey(name), name, type: "loot"})); }});
  const packs = [
    pack("dnd5e.equipment24", ["Potion of Healing", "Bag of Holding", "Ammunition of Slaying"]),
    pack("dnd5e.equipment", ["Driftglobe", "Arrow of Slaying"]),
    pack("dnd-players-handbook.equipment", ["Potion of Healing"]),
    pack("dnd-dungeon-masters-guide.equipment", ["Bag of Holding", "Driftglobe"])
  ];
  const index = await srdItemIndex(packs);
  assert.deepEqual(ITEM_PACKS.map(entry => entry.collection), ["dnd-dungeon-masters-guide.equipment", "dnd-players-handbook.equipment", "dnd5e.equipment24"]);
  assert.equal(findSrdItem(index, "Bag of Holding").uuid, "Compendium.dnd-dungeon-masters-guide.equipment.Item.bagofholding");
  assert.equal(findSrdItem(index, "Potion of Healing").source, "Player's Handbook (2024)");
  assert.equal(findSrdItem(index, "Ammunition of Slaying").source, "SRD 5.2");
  assert.equal(findSrdItem(index, "Arrow of Slaying"), null);
  // A DMG-only item with no DMG installed is text only: no 5.1 fallback, no grant.
  const srdOnly = await srdItemIndex([packs[0], packs[1]]);
  assert.equal(findSrdItem(srdOnly, "Driftglobe"), null);
  const data = {hoards: [{id: "cr-0-4", label: "CR 0-4", die: 100, rows: [{min: 1, max: 100, valuables: [], magic: [{table: "X", count: 2}]}]}], tables: [{id: "X", name: "Magic Item Table X", die: 100, rows: [{min: 1, max: 50, entry: "Driftglobe", item: "Driftglobe"}, {min: 51, max: 100, entry: "Bag", item: "Bag of Holding"}]}]};
  let state = emptyHoardState("actor");
  const placed = [];
  const placeItem = async item => { placed.push(item.name); return {uuid: "Actor.actor.Item.x"}; };
  globalThis.fromUuid = async uuid => ({toObject: () => ({name: uuid, system: {}})});
  for (const totals of [[1], [10], [70]]) state = (await commitHoardStep({data, bandId: "cr-0-4", state, totals, index: srdOnly, placeItem})).state;
  delete globalThis.fromUuid;
  assert.deepEqual(state.items.map(item => [item.name, item.unresolved || !item.compendiumUuid]), [["Driftglobe", true], ["Bag of Holding", false]]);
  assert.equal(placed.length, 1);
  const html = hoardCardHTML({title: "Treasure Hoard", state, step: null, escape: value => value});
  assert.match(html, /Driftglobe \(text only\)/);
  assert.match(html, /\(SRD 5\.2\)/);
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

test("hoard row 95 rolls one item per counted roll, each its own step on its table", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const data = await loadTreasure();
    const drive = async (bandId, hoardRoll, valuables, count, picks) => {
      let state = emptyHoardState("actor");
      const labels = [];
      const run = async totals => {
        labels.push(nextHoardStep(data, bandId, state));
        state = (await commitHoardStep({data, bandId, state, totals, index: new Map(), placeItem: async () => ({uuid: "Actor.actor.Item.x"})})).state;
      };
      await run([hoardRoll]);
      await run([valuables]);
      await run([count]);
      for (const totals of picks) await run(totals);
      return {state, labels, next: nextHoardStep(data, bandId, state)};
    };
    // CR 5-10, row 95: 3d6 100 gp gems and 1d4 rolls on Magic Item Table G.
    assert.deepEqual(rowAt(data.hoards[1], 95).magic, [{table: "G", dice: 1, sides: 4}]);
    const three = await drive("cr-5-10", 95, 10, 3, [[1], [50], [99]]);
    assert.equal(three.state.items.length, 3);
    assert.equal(three.state.items.every(item => item.tableId === "G"), true);
    assert.equal(three.next, null);
    const magicSteps = three.labels.filter(step => step.kind === "magic");
    assert.deepEqual(magicSteps.map(step => step.formulas), [["1d100"], ["1d100"], ["1d100"]]);
    assert.deepEqual(magicSteps.map(step => step.prompt), ["Magic item 1 of 3", "Magic item 2 of 3", "Magic item 3 of 3"]);
    assert.match(three.labels.find(step => step.kind === "magic-count").prompt, /^Roll 1d4 for how many magic items$/);
    assert.match(hoardCardHTML({title: "T", state: three.state, step: null, escape: value => value}), /Magic items \(3 of 3\)/);
    const four = await drive("cr-5-10", 95, 10, 4, [[1], [2], [3], [4]]);
    assert.equal(four.state.items.length, 4);
    // A Figurine rolls its d8 as its own step before the next item.
    const fig = await drive("cr-5-10", 95, 10, 2, [[13]]);
    const variant = fig.next;
    assert.equal(variant.kind, "variant");
    assert.deepEqual(variant.formulas, ["1d8"]);
    const done = (await commitHoardStep({data, bandId: "cr-5-10", state: fig.state, totals: [8], index: new Map(), placeItem: async () => ({uuid: "Actor.actor.Item.x"})})).state;
    assert.match(done.items[0].name, /Serpentine Owl/i);
    assert.equal(done.items[0].variantRoll, 8);
    assert.match(hoardCardHTML({title: "T", state: done, step: null, escape: value => value}), /Serpentine Owl/);
    assert.doesNotMatch(hoardCardHTML({title: "T", state: done, step: null, escape: value => value}), /Table|d100|d8:/);
    assert.equal(nextHoardStep(data, "cr-5-10", done).prompt, "Magic item 2 of 2");
    // CR 0-4, row 95 also grants the Fragment of Fate once.
    const placed = [];
    let low = emptyHoardState("actor");
    for (const totals of [[95], [7], [1], [1]]) low = (await commitHoardStep({data, bandId: "cr-0-4", state: low, totals, index: new Map(), placeItem: async item => { placed.push(item.name); return {uuid: "Actor.actor.Item.f"}; }})).state;
    assert.equal(placed.filter(name => name === "Fragment of Fate").length, 1);
    assert.equal(low.trinket.granted, true);
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
        {_id: "heal", name: "Potion of Healing", type: "consumable"},
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
            else if (key === "speaker") this.speaker = value;
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
  assert.match(request.content, /<h3>Roll for Treasure<\/h3>/);
  assert.doesNotMatch(request.content, /Treasure Hoard|CR 0-4/);
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
  assert.match(request.content, /<p>Initial Roll: 37<\/p>/);
  assert.doesNotMatch(request.content, /Hoard roll|Table [A-Z]|d100|1d100/);
  assert.equal(buttons(request.content).length, 1);
  assert.equal(created.length, 0);
  // The card speaks as the character, so Dice So Nice's owner-appearance setting plays the player's dice.
  assert.deepEqual(request.speaker, {actor: actor.id});
  // The GM's apply attaches the roll once, stamped with the character; nothing calls showForRoll itself.
  assert.deepEqual(shown, []);
  assert.equal(request.rolls.length, 1);
  assert.equal(request.rolls[0].data.actorId, actor.id);
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
  assert.match(request.content, /Potion of Healing<\/a> \(SRD 5.2\)/);
  assert.equal(buttons(request.content).length, 0);
  assert.equal(request.rolls.length, 4);
  assert.equal(request.rolls.every(roll => roll.data.actorId === actor.id), true);
  assert.equal(created.length, 2);
  const finished = await send(request);
  assert.equal(finished.alreadyResolved, true);
  assert.equal(created.length, 2);
  assert.equal(needsGmPlace(player, actor), false);
  actor.testUserPermission = () => false;
  assert.equal(needsGmPlace(player, actor), true);
  assert.equal(needsGmPlace(gm, actor), false);
  actor.testUserPermission = user => user.isGM || user.id === "player";

  const scrollFaces = [61, 6, 1, 62];
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
  assert.deepEqual(privShown, []);
  // A private hoard also speaks as the character; its rolls ride the whispered card, one per step.
  assert.deepEqual(priv.speaker, {actor: actor.id});
  assert.equal(priv.rolls.length, 2);
  assert.equal(priv.rolls.every(roll => roll.data.actorId === actor.id), true);
  // An older card with no speaker gets one with its first rolls.
  const old = await createRequest({kind: "hoard", band: "cr-0-4", actorIds: [actor.id]});
  delete old.speaker;
  faces.push(37);
  await send(old);
  assert.deepEqual(old.speaker, {actor: actor.id});
  // The player's client must not animate the dice a second time.
  assert.doesNotMatch(readFileSync(new URL("../scripts/requests.mjs", import.meta.url), "utf8"), /showHoardDice|showForRoll/);
  assert.match(priv.content, /Initial Roll: 27/);
  assert.doesNotMatch(priv.content, /data-mlgm-hoard-reveal|Reveal/);
  assert.deepEqual([...priv.whisper].sort(), ["gm", "player"]);
  // Private hoards grant as they roll, the same as public ones.
  assert.equal(created.length, beforePrivate + 1);
  const privRoot = chatRoot(priv.content);
  render(priv, privRoot);
  assert.match(privRoot.source, /Initial Roll: 27/);
  // Another player gets the whispered roll message from Foundry but must not see the card.
  const strangerView = Object.create(priv, {isContentVisible: {value: false}});
  const hiddenRoot = chatRoot("<p>Private roll</p>");
  render(strangerView, hiddenRoot);
  assert.equal(hiddenRoot.hidden, true);
  assert.doesNotMatch(hiddenRoot.source, /Initial Roll/);
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
    content: `<section class="ml-chat-card ml-stack mlgm-hoard"><h3>Roll for Treasure</h3><button type="button" data-mlgm-hoard-step="table">Roll</button></section>`,
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
