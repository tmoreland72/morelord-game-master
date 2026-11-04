import test from "node:test";
import assert from "node:assert/strict";
import {ContextualSocketService} from "../../morelord-core/scripts/services/contextual-socket-service.js";
import {ChatRollRequests} from "../../morelord-core/scripts/services/chat-roll-requests.js";
import * as users from "../../morelord-core/scripts/services/user-service.js";
import * as participation from "../../morelord-core/scripts/ui/actor-participation.js";
import {actorIdentity} from "../../morelord-core/scripts/ui/actor-identity.js";
import {deleriumSearch} from "../../morelord-core/scripts/services/delerium-search.js";
import {initializeRequests, createRequest, registerRequestRenderers, requestHTML} from "../scripts/requests.mjs";
import {releasedCoreCards} from "./core-release.mjs";

const ID = "morelord-game-master";
class Collection extends Map {
  get contents() { return [...this.values()]; }
  [Symbol.iterator]() { return this.values(); }
  filter(fn) { return this.contents.filter(fn); }
  find(fn) { return this.contents.find(fn); }
  some(fn) { return this.contents.some(fn); }
}
const collection = rows => new Collection(rows.map(row => [row.id, row]));
const escapeHTML = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A chat root that reads Core's rows and buttons out of the rendered markup. */
function chatRoot(content) {
  const root = {
    source: content,
    querySelector(selector) {
      if (selector === ".mlgm-request" && this.source.includes("mlgm-request")) return {owner: this, set outerHTML(value) { this.owner.source = value; }};
      return null;
    },
    querySelectorAll(selector) {
      if (selector !== "[data-mlgm-actor], [data-ml-core-roll]") return [];
      // The same button objects every time, so a click handler bound by the renderer can be fired later.
      this.cache ??= new Map();
      if (this.cache.has(this.source)) return this.cache.get(this.source);
      const built = this.source.split('data-ml-roll-entry="').slice(1).flatMap(chunk => {
        const row = {
          dataset: {mlRollEntry: chunk.slice(0, chunk.indexOf('"'))}, choice: null,
          querySelector(css) { return css.includes("data-ml-roll-choice") && chunk.includes("data-ml-roll-choice") ? {value: this.choice} : null; },
          querySelectorAll() { return []; }, append() {}
        };
        return [...chunk.matchAll(/<button[^>]*data-ml-core-roll[^>]*>/g)].map(([tag]) => ({
          row, tag, dataset: {}, disabled: false, title: "",
          hasAttribute: name => tag.includes(name),
          closest: css => css === "[data-ml-roll-entry]" || css === ".ml-card" ? row : null,
          addEventListener(_type, fn) { this.click = fn; }
        }));
      });
      this.cache.set(this.source, built);
      return built;
    }
  };
  return root;
}

test("every request kind renders through Core's roll-request card, rolls player-side, and keeps blind and whisper rules", async () => {
  const events = new Map();
  globalThis.Hooks = {on(name, fn) { events.set(name, [...(events.get(name) ?? []), fn]); return fn; }, off() {}, call() { return true; }};
  const gm = {id: "gm", isGM: true, active: true, name: "GM"}, player = {id: "player", isGM: false, active: true, name: "Pat"};
  const actor = {id: "actor", uuid: "Actor.actor", name: "Aster", type: "character", hasPlayerOwner: true, isOwner: true, system: {skills: {prc: {}}}, testUserPermission: user => user.isGM || user.id === "player",
    async rollSkill(config, dialog, message) { assert.equal(message.create, false); return [{formula: "1d20+1", options: {}, total: 15, _evaluated: true, toJSON() { return {formula: this.formula, options: this.options, total: 15, evaluated: true}; }}]; }};
  actor.rollDeathSave = async () => [{total: 12}];
  const second = {...actor, id: "second", uuid: "Actor.second", name: "Bram"};
  player.character = actor;
  const sent = [];
  let dispatch, animated = 0;
  globalThis.game = {user: gm, users: collection([gm, player]), actors: collection([actor, second]), messages: collection([]), system: {id: "dnd5e"}, modules: collection([{id: "morelord-core", active: true}, {id: "drakkenheim-monsters", active: true}]),
    i18n: {localize: text => text}, settings: {settings: new Map([["morelord-core.ignoredUserIds", true]]), get: () => []}, packs: [], dice3d: {showForRoll() { animated++; }}};
  globalThis.foundry = {utils: {deepClone: structuredClone, randomID: () => crypto.randomUUID(), escapeHTML}};
  globalThis.fromUuidSync = uuid => game.actors.get(uuid.replace("Actor.", ""));
  globalThis.document = {createElement: () => ({setAttribute() {}})};
  globalThis.ui = {notifications: {warn() {}, error(message) { throw new Error(message); }}, chat: {updateMessage() {}}};
  globalThis.CONFIG = {DND5E: {skills: {prc: {label: "Perception"}}, abilities: {dex: {label: "Dexterity"}}}};
  globalThis.canvas = {scene: {id: "scene", name: "Scene"}};
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; this.total = 5; }
    async evaluate() { this._evaluated = true; return this; }
    toJSON() { return {formula: this.formula, total: this.total, evaluated: true}; }
    static fromData(data) { const roll = new this(data.formula); roll._evaluated = true; return roll; }
  };
  globalThis.ChatMessage = {getSpeaker: ({actor: who}) => ({actor: who.id}), async create(data) {
    const message = {id: crypto.randomUUID(), author: gm, timestamp: Date.now(), rolls: [], ...data, getFlag(ns, key) { return this.flags?.[ns]?.[key]; }, async setFlag(ns, key, value) { this.flags[ns][key] = structuredClone(value); },
      async update(patch) { for (const [path, value] of Object.entries(patch)) { const parts = path.split("."); let target = this; for (const part of parts.slice(0, -1)) target = target[part] ??= {}; target[parts.at(-1)] = value; } }};
    game.messages.set(message.id, message);
    return message;
  }};
  globalThis.socketlib = {registerModule: () => ({register(_name, fn) { dispatch = fn; }, executeAsUser(_method, _userId, payload) { sent.push(payload); return {accepted: true}; }, executeForUsers() {}})};
  const transport = new ContextualSocketService();
  transport.start();
  const chatRequests = releasedCoreCards();
  const withCore = chat => { globalThis.MorelordCore = {users: {...users, list: users.listUsers}, ui: {participation, actorIdentity}, rolls: {skill() {}}, socket: transport, deleriumSearch, ...(chat ? {chatRequests: chat} : {})}; };
  withCore(chatRequests);
  initializeRequests();
  registerRequestRenderers();
  const render = events.get("renderChatMessageHTML").at(-1);

  // Skill and save requests: one Core entry per character, one Roll button, no DIS/ADV, the DC once, public and not blind.
  const check = await createRequest({actorIds: [actor.id, second.id], skill: "prc", dc: 14});
  for (const content of [check.content, requestHTML(check.getFlag(ID, "request"))]) {
    assert.match(content, /^<div class="mlgm-request"><section class="ml-chat-card ml-stack ml-core-roll-request">/);
    assert.equal(content.match(/data-ml-roll-entry="/g).length, 2);
    assert.match(content, /data-ml-roll-entry="actor"/);
    assert.match(content, /data-ml-roll-entry="second"/);
    assert.equal(content.match(/DC 14/g).length, 1);
    assert.equal(content.match(/data-ml-core-roll="normal"/g).length, 2);
    assert.doesNotMatch(content, /DIS|ADV|data-mlgm-actor|<select/);
  }
  assert.deepEqual(check.whisper, []);
  assert.equal(check.blind, false);
  const save = await createRequest({actorIds: [actor.id], kind: "save", ability: "dex", dc: 12});
  assert.match(save.content, /ml-core-roll-request/);
  assert.match(save.content, /Dexterity/);
  assert.doesNotMatch(requestHTML({...save.getFlag(ID, "request"), dc: null}), /DC /);
  for (const request of [await createRequest({actorIds: [actor.id], kind: "encounter", die: 8}), await createRequest({actorIds: [actor.id], kind: "death"})]) {
    assert.match(request.content, /ml-core-roll-request/);
    assert.equal(request.content.match(/data-ml-core-roll="normal"/g).length, 1);
  }

  // Delerium Search: the skill choice and Decline come from Core's card, and Finalize stays inside it for the GM.
  const search = await createRequest({kind: "delerium", actorIds: [actor.id], zoneId: "outer"});
  assert.match(search.content, /<select data-ml-roll-choice[^>]*>.*Arcana.*Investigation.*Survival.*<\/select>/);
  assert.equal(search.content.match(/data-ml-roll-decline/g).length, 1);
  assert.match(search.content, /Decline search/);
  assert.match(search.content, /data-mlgm-finalize>Finalize \/ open search results \(GM\)<\/button><\/section><\/div>$/);
  assert.equal(search.getFlag(ID, "request").searchSession.messageMode, "blind");

  // Clicking a Core button rolls on the clicking client and sends exactly one prepared roll to the GM.
  const encounter = game.messages.find(message => message.getFlag(ID, "request")?.kind === "encounter");
  const root = chatRoot(encounter.content);
  render(encounter, root);
  const [button] = root.querySelectorAll("[data-mlgm-actor], [data-ml-core-roll]");
  assert.equal(button.disabled, false);
  await button.click();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "roll");
  assert.equal(sent[0].data.requestId, encounter.id);
  assert.equal(sent[0].data.actorId, actor.id);
  assert.equal(sent[0].data.roll.packed, true);
  assert.equal(sent[0].data.roll.evaluated, true);
  const ack = await dispatch({namespace: ID, type: "roll", data: sent[0].data, context: {}, senderUserId: "player", messageId: crypto.randomUUID(), targetUserId: gm.id});
  assert.equal(ack.accepted, true);
  await transport.runSerialized(`${ID}.rolls`, () => {});
  const result = game.messages.find(message => message.getFlag(ID, "result")?.requestId === encounter.id);
  // One roll, the player's, recorded blind to the GMs; nothing animates it a second time.
  assert.equal(result.rolls.length, 1);
  assert.equal(result.blind, true);
  assert.deepEqual(result.whisper, ["gm"]);
  assert.equal(animated, 0);

  // The search card's choice and Decline reach the GM as the picked skill or "decline".
  sent.length = 0;
  const searchRoot = chatRoot(search.content);
  render(search, searchRoot);
  const buttons = searchRoot.querySelectorAll("[data-mlgm-actor], [data-ml-core-roll]");
  assert.equal(buttons.length, 2);
  buttons[0].row.choice = "inv";
  await buttons[0].click();
  assert.equal(sent.at(-1).data.skillId, "inv");
  await buttons[1].click();
  assert.equal(sent.at(-1).data.skillId, "decline");
  assert.equal(sent.at(-1).data.roll, undefined);

  // Without Core's card the older markup, and its buttons, still work.
  withCore(null);
  const plain = requestHTML(check.getFlag(ID, "request"));
  assert.match(plain, /^<section class="ml-chat-card ml-stack mlgm-request">/);
  assert.equal(plain.match(/data-mlgm-actor="/g).length, 2);
  assert.doesNotMatch(plain, /ml-core-roll-request|data-ml-core-roll/);
  assert.match(requestHTML(search.getFlag(ID, "request")), /data-mlgm-search-skill[\s\S]*data-mlgm-skill="decline"[\s\S]*data-mlgm-finalize/);
});
