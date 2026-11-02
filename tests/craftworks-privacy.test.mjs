import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ContextualSocketService} from "../../morelord-core/scripts/services/contextual-socket-service.js";
import {deleriumSearch} from "../../morelord-core/scripts/services/delerium-search.js";
import {initializeRequests} from "../scripts/requests.mjs";

const ID = "morelord-game-master";
const source = readFileSync(new URL("../scripts/requests.mjs", import.meta.url), "utf8");
const triggers = readFileSync(new URL("../scripts/triggers.mjs", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../module.json", import.meta.url), "utf8");

test("Delerium Search no longer imports or recommends Craftworks", () => {
  assert.doesNotMatch(source, /morelord-craftworks|craftworks\(/);
  assert.doesNotMatch(triggers, /morelord-craftworks|openLuckyFinds/);
  assert.doesNotMatch(manifest, /morelord-craftworks/);
  assert.match(manifest, /"minimum":\s*"0\.9\.0"/);
});

test("the authority GM awards through Core and keeps a blind search private", async () => {
  const calls = [];
  const chip = {
    _id: "chip",
    uuid: "Compendium.drakkenheim-monsters.items.Item.chip",
    name: "Delerium Chip",
    img: "chip.webp",
    system: {rarity: "rare"},
    toObject() { return {_id: this._id, name: this.name, img: this.img, system: {...this.system}}; }
  };
  const pack = {
    collection: "drakkenheim-monsters.items",
    documentName: "Item",
    metadata: {packageName: "drakkenheim-monsters", id: "drakkenheim-monsters.items"},
    async getIndex() { return [{_id: chip._id, uuid: chip.uuid, name: chip.name, img: chip.img}]; },
    async getDocument(id) { return id === chip._id ? chip : null; }
  };
  const gm = {id: "gm", isGM: true, active: true};
  const player = {id: "player", isGM: false, active: true};
  const recipient = {
    uuid: "Actor.aster",
    id: "aster",
    type: "character",
    name: "Aster",
    async createEmbeddedDocuments() { return [{uuid: "Actor.aster.Item.chip"}]; }
  };
  class Collection extends Map {
    get contents() { return [...this.values()]; }
    filter(fn) { return this.contents.filter(fn); }
    find(fn) { return this.contents.find(fn); }
  }
  const users = new Collection([[gm.id, gm], [player.id, player]]);
  globalThis.Hooks = {on() {}, off() {}};
  globalThis.foundry = {utils: {deepClone: structuredClone, randomID: () => "search"}};
  globalThis.canvas = {scene: {id: "scene", name: "Outer"}};
  globalThis.ui = {notifications: {warn() {}, error() {}}, chat: {updateMessage() {}}};
  globalThis.game = {
    user: gm,
    users,
    actors: new Collection([[recipient.id, recipient]]),
    messages: new Collection(),
    system: {id: "dnd5e"},
    packs: [pack],
    modules: new Collection([
      ["morelord-core", {id: "morelord-core", active: true}],
      ["drakkenheim-monsters", {id: "drakkenheim-monsters", active: true}]
    ]),
    i18n: {localize: value => value},
    settings: {get() { return undefined; }}
  };
  globalThis.fromUuid = async uuid => uuid === recipient.uuid ? recipient : (uuid === chip.uuid ? chip : null);
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; this.total = 4; }
    async evaluate() { return this; }
    async toMessage(_data, options) { calls.push({kind: "roll", options, formula: this.formula}); }
  };
  let cardCount = 0;
  globalThis.ChatMessage = {
    getSpeaker: () => ({}),
    async create(data, options) {
      calls.push({kind: "card", options, content: data.content});
      const message = {
        id: data.flags?.[ID]?.search ? "summary" : `card-${++cardCount}`,
        author: gm,
        ...data,
        getFlag(ns, key) { return this.flags?.[ns]?.[key]; },
        async update(patch) {
          for (const [path, value] of Object.entries(patch)) {
            const parts = path.split(".");
            let target = this;
            for (const part of parts.slice(0, -1)) target = target[part] ??= {};
            target[parts.at(-1)] = value;
          }
        }
      };
      game.messages.set(message.id, message);
      return message;
    }
  };
  globalThis.socketlib = {registerModule: () => ({register(_name, fn) { dispatch = fn; }})};
  let dispatch;
  const transport = new ContextualSocketService();
  transport.start();
  globalThis.MorelordCore = {
    users: {list: () => [...users.values()], activePlayerForActor: () => player, isIgnored: () => false},
    ui: {participation: {listCharacterActors: () => []}, actorIdentity: () => ""},
    rolls: {skill() {}, naturalD20: () => null},
    socket: transport,
    deleriumSearch
  };
  initializeRequests();
  const session = deleriumSearch.start("outer", {id: "search", scene: canvas.scene});
  session.messageMode = "blind";
  deleriumSearch.attempt(session, {userId: "actor:aster", actorUuid: recipient.uuid, skillId: "arc", total: 25, naturalD20: 20});
  deleriumSearch.attempt(session, {userId: "actor:bram", actorUuid: "Actor.bram", skillId: "inv", total: 16, naturalD20: 16});
  await deleriumSearch.finalize(session);
  assert.equal(session.rewards.length, 1);
  assert.equal(session.rewards[0].formula, "3d6");
  const summary = await ChatMessage.create({
    author: gm,
    content: "",
    flags: {[ID]: {search: {requestId: "request", session: structuredClone(session)}}}
  });
  calls.length = 0;
  await assert.rejects(dispatch({
    namespace: ID, type: "awardSearch", data: {summaryId: summary.id, recipientUuid: recipient.uuid},
    senderUserId: player.id, targetUserId: gm.id
  }), /Only GMs can award/);
  await dispatch({
    namespace: ID, type: "awardSearch", data: {summaryId: summary.id, recipientUuid: recipient.uuid},
    senderUserId: gm.id, targetUserId: gm.id
  });
  assert.equal(calls.filter(call => call.kind === "roll").length, 1);
  assert.ok(calls.filter(call => call.kind === "roll" || (call.kind === "card" && call.content?.includes("Delerium Found"))).every(call => call.options?.messageMode === "blind"));
  assert.equal(summary.getFlag(ID, "search").session.result.recipientName, "Aster");
});
