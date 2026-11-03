import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ContextualSocketService} from "../../morelord-core/scripts/services/contextual-socket-service.js";
import * as users from "../../morelord-core/scripts/services/user-service.js";
import * as participation from "../../morelord-core/scripts/ui/actor-participation.js";
import {actorIdentity} from "../../morelord-core/scripts/ui/actor-identity.js";
import * as currency from "../../morelord-core/scripts/services/currency-service.js";
import {HOARD_BANDS, auditTreasure, loadTreasure, rangeIssues, resolveHoard} from "../scripts/treasure.mjs";
import {initializeRequests, createRequest} from "../scripts/requests.mjs";

const ID = "morelord-game-master";

test("treasure tables cover d100 and only reference tables in this module", async () => {
  const data = await loadTreasure();
  assert.deepEqual(auditTreasure(data), []);
  assert.deepEqual(data.hoards.map(hoard => hoard.id), HOARD_BANDS.map(band => band.id));
  const names = data.tables.flatMap(table => table.rows.map(row => row.name));
  assert.equal(names.includes("Bead of Nourishment"), true);
  assert.equal(names.includes("Energy Bow"), true);
  assert.equal(names.includes("Weapon of Warning"), true);
  assert.equal(names.includes("Potion of Healing"), true);
  assert.equal(names.includes("Dragon Orb"), false);
  assert.equal(names.includes("Mysterious Deck"), false);
  const source = readFileSync(new URL("../data/srd-treasure.json", import.meta.url), "utf8");
  for (const banned of ["Deck of Many Things", "Orb of Dragonkind", "Apparatus of Kwalish", "morelord-compendium"]) assert.equal(source.includes(banned), false, banned);
  assert.equal(readFileSync(new URL("../scripts/treasure.mjs", import.meta.url), "utf8").includes("morelord-compendium"), false);
  assert.deepEqual(rangeIssues([{min: 1, max: 99}], 100), [100]);
  assert.deepEqual(rangeIssues([{min: 1, max: 50}, {min: 50, max: 100}], 100), [50]);
  const common = data.tables.find(table => table.id === "common");
  assert.equal(common.rows[0].min, 1);
  assert.equal(common.rows.at(-1).max, 100);
});

test("a hoard roll resolves coins, gems, and a named magic item table", async () => {
  const data = await loadTreasure();
  const faces = [99];
  const result = await resolveHoard("cr-0-4", async sides => {
    const face = faces.length ? faces.shift() : 1;
    assert.equal(face >= 1 && face <= sides, true);
    return face;
  }, data);
  assert.equal(result.hoardRoll, 99);
  assert.deepEqual(result.coins, {cp: 200, sp: 80, ep: 1, gp: 20, pp: 0});
  assert.deepEqual(result.valuables, []);
  const rare = data.tables.find(table => table.id === "rare-1");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].tableId, "rare-1");
  assert.equal(result.items[0].name, rare.rows[0].name);
  const coins = await resolveHoard("cr-0-4", async () => 1, data);
  assert.equal(coins.hoardRoll, 1);
  assert.deepEqual(coins.coins, {cp: 200, sp: 80, ep: 1, gp: 20, pp: 0});
  assert.equal(coins.items.length, 0);
  assert.equal(currency.currencyToCp(coins.coins), 3050);
  let step = 0;
  const gems = await resolveHoard("cr-0-4", async () => {
    step += 1;
    if (step === 1) return 30;
    if (step === 13) return 2;
    if (step === 14) return 3;
    return 1;
  }, data);
  assert.equal(gems.hoardRoll, 30);
  assert.deepEqual(gems.valuables, [{kind: "gems", count: 5, faces: [2, 3], each: {gp: 20}}]);
  assert.equal(gems.items.length, 0);
  await assert.rejects(() => resolveHoard("cr-17", async () => 1, data), /treasure hoard/);
});

test("the chat request grants public coins through Core and keeps blind totals off the sheet", async () => {
  const events = new Map();
  globalThis.Hooks = {on(name, fn) { events.set(name, [...(events.get(name) ?? []), fn]); return fn; }, off() {}, call() {}};
  const gm = {id: "gm", isGM: true, active: true};
  const player = {id: "player", isGM: false, active: true};
  const updates = [];
  const actor = {
    id: "actor", uuid: "Actor.actor", name: "Aster", type: "character", hasPlayerOwner: true, isOwner: true,
    system: {currency: {pp: 0, gp: 0, ep: 0, sp: 0, cp: 0}, skills: {prc: {}}},
    testUserPermission: user => user.isGM || user.id === "player",
    async update(data) {
      updates.push(structuredClone(data));
      for (const [key, value] of Object.entries(data)) actor.system.currency[key.split(".").pop()] = value;
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
  globalThis.game = {
    user: gm, users: collection([gm, player]), actors: collection([actor]), messages: collection([]),
    system: {id: "dnd5e"}, modules: collection([{id: "morelord-core", active: true}]),
    i18n: {localize: text => text}, settings: {settings: new Map([["morelord-core.ignoredUserIds", true]]), get: () => []}, packs: []
  };
  globalThis.foundry = {utils: {deepClone: structuredClone, randomID: () => crypto.randomUUID()}};
  globalThis.ui = {notifications: {warn() {}, error() {}}, chat: {updateMessage() {}}};
  globalThis.CONFIG = {DND5E: {skills: {prc: {label: "Perception"}}}};
  const faces = [];
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; this.total = faces.length ? faces.shift() : 1; }
    async evaluate() { return this; }
  };
  globalThis.ChatMessage = {
    getSpeaker: ({actor: speaker}) => ({actor: speaker.id}),
    async create(data) {
      const message = {id: crypto.randomUUID(), author: gm, timestamp: Date.now(), ...data, getFlag(ns, key) { return this.flags?.[ns]?.[key]; }, async setFlag(ns, key, value) { this.flags[ns][key] = structuredClone(value); }};
      game.messages.set(message.id, message);
      return message;
    }
  };
  let dispatch;
  globalThis.socketlib = {registerModule: () => ({register(_name, fn) { dispatch = fn; }})};
  const transport = new ContextualSocketService();
  transport.start();
  globalThis.MorelordCore = {users: {...users, list: users.listUsers}, ui: {participation, actorIdentity}, rolls: {skill() {}}, socket: transport, currency};
  initializeRequests();
  const resolve = message => dispatch({namespace: ID, type: "roll", data: {requestId: message.id, actorId: actor.id}, senderUserId: gm.id, targetUserId: gm.id, messageId: crypto.randomUUID()});
  await assert.rejects(() => createRequest({kind: "hoard", band: "cr-17", actorIds: [actor.id]}), /treasure hoard/);
  const request = await createRequest({kind: "hoard", band: "cr-0-4", blind: false, actorIds: [actor.id]});
  assert.match(request.content, /Treasure Hoard · CR 0-4/);
  assert.match(request.content, />Roll</);
  assert.equal(request.getFlag(ID, "request").coins, undefined);
  assert.doesNotMatch(request.content, /\d+ CP/);
  faces.push(...Array(12).fill(1));
  const ack = await resolve(request);
  assert.deepEqual(ack, {accepted: true});
  assert.equal(JSON.stringify(ack).includes("3050"), false);
  const card = game.messages.find(message => message.getFlag(ID, "result")?.requestId === request.id);
  assert.equal(card.blind, false);
  assert.deepEqual(card.whisper, []);
  assert.match(card.content, /200 CP/);
  assert.match(card.content, /Added to Aster/);
  assert.equal(card.rolls.length, 12);
  assert.deepEqual(card.getFlag(ID, "result").treasure.coins, {cp: 200, sp: 80, ep: 1, gp: 20, pp: 0});
  assert.equal(currency.currencyToCp(actor.system.currency), 3050);
  assert.equal(updates.length, 1);
  const again = await resolve(request);
  assert.equal(again.alreadyResolved, true);
  assert.equal(updates.length, 1);
  const blind = await createRequest({kind: "hoard", band: "cr-0-4", blind: true, actorIds: [actor.id]});
  faces.push(...Array(12).fill(1));
  const blindAck = await resolve(blind);
  assert.equal("coins" in blindAck, false);
  const hidden = game.messages.find(message => message.getFlag(ID, "result")?.requestId === blind.id);
  assert.equal(hidden.blind, true);
  assert.deepEqual(hidden.whisper, ["gm"]);
  assert.match(hidden.content, /200 CP/);
  assert.doesNotMatch(hidden.content, /Added to Aster/);
  assert.equal(updates.length, 1);
  assert.match(readFileSync(new URL("../scripts/main.mjs", import.meta.url), "utf8"), /data-roll-card="hoard"/);
});
