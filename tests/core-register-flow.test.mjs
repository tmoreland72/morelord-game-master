import test from "node:test";
import assert from "node:assert/strict";
import {ContextualSocketService} from "../../morelord-core/scripts/services/contextual-socket-service.js";
import {ChatRollRequests} from "../../morelord-core/scripts/services/chat-roll-requests.js";
import * as users from "../../morelord-core/scripts/services/user-service.js";
import * as participation from "../../morelord-core/scripts/ui/actor-participation.js";
import * as currency from "../../morelord-core/scripts/services/currency-service.js";
import {actorIdentity} from "../../morelord-core/scripts/ui/actor-identity.js";
import {deleriumSearch} from "../../morelord-core/scripts/services/delerium-search.js";
import {initializeRequests, createRequest, registerRequestRenderers, coreRollCards} from "../scripts/requests.mjs";
import {releasedCoreCards} from "./core-release.mjs";

const ID = "morelord-game-master", CORE = "morelord-core";
class Collection extends Map {
  get contents() { return [...this.values()]; }
  [Symbol.iterator]() { return this.values(); }
  filter(fn) { return this.contents.filter(fn); }
  find(fn) { return this.contents.find(fn); }
  some(fn) { return this.contents.some(fn); }
}
const collection = rows => new Collection(rows.map(row => [row.id, row]));

/** A chat root with Core's buttons and rows read from the markup; insertAdjacentHTML is recorded. */
function chatRoot(content) {
  const root = {inserted: [], clicks: new Map(), buttons: [], hidden: false};
  const spot = {insertAdjacentHTML: (position, html) => root.inserted.push([position, html])};
  root.querySelector = selector => selector === "[data-ml-roll-entry]" || selector === ".ml-core-roll-request" ? spot : null;
  root.buttons = content.split('data-ml-roll-entry="').slice(1).flatMap(chunk => {
    const row = {dataset: {mlRollEntry: chunk.slice(0, chunk.indexOf('"'))}, choice: null, querySelector() { return null; }, querySelectorAll() { return []; }, append() {}};
    return [...chunk.matchAll(/<button[^>]*data-ml-core-roll="(\w+)"[^>]*>/g)].map(([tag, mode]) => ({
      row, dataset: {mlCoreRoll: mode}, disabled: false, title: "", listeners: [],
      hasAttribute: name => tag.includes(name), closest: css => css === "[data-ml-roll-entry]" || css === ".ml-card" ? row : null,
      addEventListener(_type, fn) { this.listeners.push(fn); }
    }));
  });
  root.querySelectorAll = selector => selector === "[data-mlgm-actor], [data-ml-core-roll]" || selector === "[data-ml-core-roll]" ? root.buttons : [];
  return root;
}

function world({core = "real"} = {}) {
  const events = new Map();
  globalThis.Hooks = {on(name, fn) { events.set(name, [...(events.get(name) ?? []), fn]); return fn; }, off() {}, call() {}};
  const gm = {id: "gm", isGM: true, active: true, name: "GM"}, player = {id: "player", isGM: false, active: true, name: "Pat"}, other = {id: "other", isGM: true, active: true, name: "Other GM"};
  const created = [];
  const actor = {id: "actor", uuid: "Actor.actor", name: "Aster", type: "character", hasPlayerOwner: true, isOwner: true,
    system: {currency: {pp: 0, gp: 0, ep: 0, sp: 0, cp: 0}, skills: {prc: {}}}, testUserPermission: user => user.isGM || user.id === "player",
    updates: [], async update(data) { this.updates.push(structuredClone(data)); },
    async rollDeathSave() { return []; },
    async createEmbeddedDocuments(_type, documents) { return documents.map(document => { created.push(structuredClone(document)); return {uuid: `Actor.actor.Item.${created.length}`, name: document.name}; }); }};
  player.character = actor;
  const pack = {documentName: "Item", collection: "dnd5e.equipment24", async getIndex() { return [{_id: "heal", name: "Potion of Healing", type: "consumable"}, {_id: "gem", name: "Gemstone (10 GP)", type: "loot"}, {_id: "scroll", name: "Spell Scroll (Level 3)", type: "consumable"}, {_id: "mace", name: "Mace of Smiting", type: "weapon"}]; }};
  globalThis.game = {user: gm, users: collection([gm, player, other]), actors: collection([actor]), messages: collection([]), system: {id: "dnd5e"},
    modules: collection([{id: "morelord-core", active: true}]), i18n: {localize: text => text}, settings: {settings: new Map([["morelord-core.ignoredUserIds", true]]), get: () => []}, packs: [pack]};
  globalThis.foundry = {utils: {deepClone: structuredClone, randomID: () => crypto.randomUUID(), escapeHTML: value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}};
  globalThis.ui = {notifications: {warn() {}, error(message) { throw new Error(message); }}, chat: {updateMessage() {}}};
  globalThis.CONFIG = {DND5E: {skills: {prc: {label: "Perception"}}, abilities: {}}};
  globalThis.document = {createElement: () => ({setAttribute() {}})};
  globalThis.fromUuidSync = uuid => game.actors.get(uuid.replace("Actor.", ""));
  globalThis.fromUuid = async uuid => uuid.startsWith("Actor.") ? fromUuidSync(uuid) : ({uuid, name: "Copied", type: "loot", toObject() { return {name: "Copied", type: "loot", system: {quantity: 1}}; }});
  const faces = [], rolled = [], totals = new WeakMap();
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; }
    get total() { return totals.get(this); }
    async evaluate() { totals.set(this, faces.length ? faces.shift() : 1); this._evaluated = true; rolled.push({formula: this.formula, by: game.user.id}); return this; }
    static fromData(data) { const roll = new this(data.formula); totals.set(roll, data.total ?? data.terms?.[0]?.results?.reduce((sum, result) => sum + result.result, 0)); return roll; }
    toJSON() { return {formula: this.formula, total: this.total, evaluated: true}; }
  };
  // Foundry 14 clears the whisper of a message created in public mode, and Dice So Nice animates when an update carries rolls.
  const animations = [], updates = [];
  globalThis.ChatMessage = {
    getSpeaker: ({actor: who}) => ({actor: who?.id}),
    async create(data, options = {}) {
      const message = {id: crypto.randomUUID(), author: gm, timestamp: Date.now(), rolls: [], blind: false, ...data, whisper: options.messageMode === "public" ? [] : [...(data.whisper ?? [])],
        flags: structuredClone(data.flags ?? {}), getFlag(ns, key) { return this.flags?.[ns]?.[key]; },
        async setFlag(ns, key, value) { this.flags[ns] ??= {}; this.flags[ns][key] = structuredClone(value); },
        async update(patch) {
          updates.push(patch);
          if ("rolls" in patch) animations.push({speaker: patch.speaker ?? this.speaker, count: patch.rolls.length});
          for (const [path, value] of Object.entries(patch)) { const parts = path.split("."); let target = this; for (const part of parts.slice(0, -1)) target = target[part] ??= {}; target[parts.at(-1)] = structuredClone(value); }
        }};
      game.messages.set(message.id, message);
      return message;
    }
  };
  let dispatch;
  const calls = [];
  // A call to another user runs on the GM's client, sent by whoever is signed in.
  globalThis.socketlib = {registerModule: () => ({register(_name, fn) { dispatch = fn; },
    async executeAsUser(_method, userId, payload) { calls.push(payload); const sender = game.user; game.user = game.users.get(userId); try { return await dispatch({...payload, senderUserId: sender.id, targetUserId: userId, messageId: crypto.randomUUID()}); } finally { game.user = sender; } },
    executeForUsers() {}})};
  const transport = new ContextualSocketService();
  transport.start();
  const chat = new ChatRollRequests(transport);
  const cards = core === "real" ? chat : releasedCoreCards(chat);
  globalThis.MorelordCore = {users: {...users, list: users.listUsers}, ui: {participation, actorIdentity}, rolls: {skill() {}}, socket: transport, currency, deleriumSearch, chatRequests: cards};
  if (core === "real") chat.start();
  initializeRequests();
  registerRequestRenderers();
  const render = (message, as = player) => { const previous = game.user; game.user = as; try { const root = chatRoot(message.content); for (const hook of events.get("renderChatMessageHTML")) hook(message, root); return root; } finally { game.user = previous; } };
  const click = async (message, as = player, index = 0) => {
    const root = render(message, as), previous = game.user;
    game.user = as;
    try { for (const listener of root.buttons[index].listeners) await listener(); } finally { game.user = previous; }
    // Core completes the entry as the handler returns; a step's reopen queues behind it on the same GM queue.
    await transport.runSerialized(`${ID}.rolls`, () => {});
    return root;
  };
  return {calls, gm, player, actor, created, faces, rolled, animations, updates, chat, cards, click, render, entry: message => Object.values(message.getFlag(CORE, "rollRequest").entries ?? {})[0] ?? message.getFlag(CORE, "rollRequest")};
}

test("Core's feature check needs register, create, and updateEntry", () => {
  const all = {register() {}, create() {}, updateEntry() {}};
  assert.equal(coreRollCards({chatRequests: all}), all);
  assert.equal(coreRollCards({chatRequests: {register() {}, create() {}}}), null);
  assert.equal(coreRollCards({}), null);
  assert.equal(coreRollCards(undefined), null);
});

test("every request kind registers one prepare and resolve pair with Core", () => {
  const w = world();
  for (const kind of ["skill", "ability", "save", "foraging", "surge", "encounter", "death", "delerium", "hoard"]) {
    assert.equal(typeof w.chat.preparers.get(`${ID}.${kind}`), "function", kind);
    assert.equal(typeof w.chat.handlers.get(`${ID}.${kind}`), "function", kind);
  }
});

test("a private hoard speaks as the roller, is whispered to the roller and GMs, and each step is one player roll on one reopened entry", async () => {
  const w = world();
  w.faces.push(37, 6, 1, 1);
  const message = await createRequest({kind: "hoard", band: "cr-0-4", private: true, blind: true, actorIds: [w.actor.id]});
  // Core posts in public mode, which clears the whisper; the recipients are put back and the card is never blind.
  assert.deepEqual([...message.whisper].sort(), ["gm", "other", "player"]);
  assert.equal(message.blind, false);
  assert.deepEqual(message.speaker, {actor: w.actor.id});
  assert.equal(message.getFlag(CORE, "rollRequest").type, `${ID}.hoard`);
  assert.equal(message.getFlag(ID, "request").private, true);
  assert.equal(w.entry(message).data.actorId, w.actor.id);
  assert.equal(w.entry(message).modes, false);
  assert.equal(message.rolls.length, 0);

  let steps = 0;
  for (; !message.getFlag(ID, "hoard")?.done && steps < 6; steps += 1) {
    const before = w.rolled.length;
    await w.click(message);
    // One roll source per step: the clicking player's client rolls; the GM rolls nothing.
    assert.equal(w.rolled.length > before, true);
    assert.equal(w.rolled.slice(before).every(roll => roll.by === "player"), true);
    // Dice So Nice animates the step once, from the one GM update that carries the rolls, as the character.
    assert.equal(w.animations.length, steps + 1);
    assert.deepEqual(w.animations.at(-1).speaker, {actor: w.actor.id});
    assert.equal(message.rolls.length, w.rolled.length);
    assert.equal(message.rolls.every(roll => roll.data?.actorId === w.actor.id), true);
    const entry = w.entry(message);
    if (message.getFlag(ID, "hoard").done) assert.equal(entry.completed, true);
    else {
      // The same entry reopens for the next step instead of a new message.
      assert.equal(entry.completed, false);
      assert.equal(entry.actionLabel, "Roll");
      assert.notEqual(entry.title, "");
    }
  }
  assert.equal(steps, 4);
  assert.equal([...game.messages.values()].length, 1);
  assert.deepEqual([...message.whisper].sort(), ["gm", "other", "player"]);
  assert.equal(w.animations.length, 4);
  // The itemCard results are drawn below Core's card when it renders, and the Initial Roll joins its row.
  const root = w.render(message);
  assert.match(root.inserted.map(([, html]) => html).join(""), /Initial Roll: 37/);
  assert.match(root.inserted.map(([position, html]) => position === "afterend" && html).join(""), /Gemstone \(10 GP\)|Potion of Healing/);
  // The finished entry is marked complete, so the card offers no further click.
  assert.equal(root.buttons.every(button => button.listeners.length === 0), true);
  assert.equal(w.rolled.length, 4);
});

test("a skill roll is one player roll recorded blind by the GM, with no roll attached by Core and none animated twice", async () => {
  const w = world();
  const message = await createRequest({kind: "encounter", die: 8, actorIds: [w.actor.id]});
  assert.equal(message.blind, false);
  assert.deepEqual(message.whisper, []);
  w.faces.push(5);
  await w.click(message);
  assert.deepEqual(w.rolled, [{formula: "1d8", by: "player"}]);
  assert.equal(w.animations.length, 0);
  assert.equal(w.entry(message).completed, true);
  const result = game.messages.find(row => row.getFlag(ID, "result")?.requestId === message.id);
  assert.equal(result.blind, true);
  assert.deepEqual(result.whisper, ["gm", "other"]);
  assert.equal(result.rolls.length, 1);
  assert.equal(result.getFlag(ID, "result").actorId, w.actor.id);
  // A second click on the finished entry is already resolved, not another roll.
  await w.click(message);
  assert.equal(w.rolled.length, 1);
});

test("a cancelled roll dialog sends nothing", async () => {
  const w = world();
  const message = await createRequest({kind: "death", actorIds: [w.actor.id]});
  await w.click(message);
  assert.equal(w.calls.length, 0);
  assert.equal(w.entry(message).completed, false);
  assert.equal(game.messages.filter(row => row.getFlag(ID, "result")).length, 0);
});

test("a party request makes one Core card with one entry per character", async () => {
  const w = world();
  const second = {...w.actor, id: "second", uuid: "Actor.second", name: "Bram"};
  game.actors.set(second.id, second);
  const message = await createRequest({kind: "skill", skill: "prc", dc: 12, actorIds: [w.actor.id, second.id]});
  const entries = Object.values(message.getFlag(CORE, "rollRequest").entries);
  assert.deepEqual(entries.map(entry => entry.data.actorId), ["actor", "second"]);
  assert.equal(game.messages.size, 1);
  assert.equal(message.getFlag(ID, "request").kind, "skill");
});

test("without Core's entry APIs the older request and hoard cards and the roll channel still work", async () => {
  const w = world({core: "released"});
  assert.equal(coreRollCards(MorelordCore), null);
  const hoard = await createRequest({kind: "hoard", band: "cr-0-4", private: true, actorIds: [w.actor.id]});
  assert.equal(hoard.getFlag(CORE, "rollRequest"), undefined);
  assert.match(hoard.content, /mlgm-hoard/);
  assert.deepEqual([...hoard.whisper].sort(), ["gm", "other", "player"]);
  assert.deepEqual(hoard.speaker, {actor: w.actor.id});
  const skill = await createRequest({kind: "encounter", die: 8, actorIds: [w.actor.id]});
  assert.equal(skill.getFlag(CORE, "rollRequest"), undefined);
  assert.equal(w.chat.preparers.size, 0);
});