import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BULK_STRINGS} from '../scripts/bulk-text.mjs';
import {readBulkUndo, writeBulkUndo} from '../scripts/bulk-undo.mjs';
import {
  TOKEN_EXCLUDE, applyBulkInspiration, applyBulkTokens, applyBulkUndo, applyBulkXp, bulkPanel,
  chooseSceneToken, initializeBulkActions, planInspiration, planXp, prototypeTokenChanges, readXp, xpShares
} from '../scripts/bulk-actions.mjs';

const ID = 'morelord-game-master';

describe('bulk actions', {concurrency: 1}, () => {
  test('English strings match the language file', () => {
    const english = JSON.parse(fs.readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'));
    const localized = Object.fromEntries(Object.entries(english).map(([key, value]) => [key.slice('morelord-game-master.'.length), value]));
    assert.deepEqual(localized, BULK_STRINGS);
  });

  test('XP splits give the whole remainder to one member and each gives the full amount', () => {
    const random = Math.random;
    try {
      Math.random = () => 0.99;
      assert.deepEqual(xpShares(10, 3, true), [3, 3, 4]);
      assert.deepEqual(xpShares(2, 5, true), [0, 0, 0, 0, 2]);
    } finally { Math.random = random; }
    assert.deepEqual(xpShares(10, 3, false), [10, 10, 10]);
    assert.equal(readXp('4'), 4);
    assert.equal(readXp(0, {allowZero: true}), 0);
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 'no', true, null]) assert.throws(() => readXp(value));
    const actors = [{id: 'a', type: 'character', system: {details: {xp: {value: 5}}}}, {id: 'b', type: 'character', system: {}}];
    assert.deepEqual(planXp(actors, 'each', 2).map(row => [row.before, row.after, row.added]), [[5, 7, 2], [0, 2, 2]]);
    assert.equal(actors[0].system.details.xp.value, 5);
    assert.throws(() => planXp(actors, 'nope', 1), /valid XP/);
    assert.throws(() => planXp([{id: 'a', type: 'npc'}], 'each', 1), /character/);
    assert.throws(() => xpShares(1, 0, true), /Player Settings/);
    assert.deepEqual(planInspiration(actors, 'grant').map(row => row.after), [true, true]);
    assert.equal(planInspiration([{...actors[0], system: {attributes: {inspiration: true}}}], 'clear')[0].before, true);
    assert.throws(() => planInspiration(actors, 'maybe'), /grant or clear/);
  });

  test('prototype token copy keeps scene placement and identity off the prototype', () => {
    const token = {toObject() { return {
      _id: 'token', actorId: 'a', x: 4, y: 8, elevation: 2, position: {x: 4, y: 8},
      delta: {x: 1}, _movementHistory: [{x: 1}], _regions: ['region'],
      name: 'Placed', texture: {src: 'icons/placed.webp'}, sight: {enabled: true}, width: 1, height: 1
    }; }};
    const changes = prototypeTokenChanges(token);
    for (const key of TOKEN_EXCLUDE) assert.equal(Object.hasOwn(changes, key), false);
    assert.deepEqual(changes, {name: 'Placed', texture: {src: 'icons/placed.webp'}, sight: {enabled: true}, width: 1, height: 1});
    assert.throws(() => prototypeTokenChanges(null), /no settings/);
    const placed = [{id: 'b'}, {id: 'a'}, {id: 'c'}];
    assert.equal(chooseSceneToken(placed).id, 'a');
    assert.equal(chooseSceneToken(placed, ['c', 'b']).id, 'b');
    assert.equal(chooseSceneToken([]), null);
  });

  test('the bulk panel keeps Coins, XP, Inspiration, Prototype Token Sync, and Undo in that order', () => {
    globalThis.game = {i18n: {localize: key => key}};
    globalThis.CONFIG = {DND5E: {currencies: Object.fromEntries(['pp', 'gp', 'ep', 'sp', 'cp'].map(key => [key, {label: key}]))}};
    const html = bulkPanel({actorIds: ['a'], coins: {gp: 2}, coinAction: 'split-add', xp: 4, xpAction: 'each', inspiration: 'clear', busy: false, undo: null});
    assert.deepEqual([...html.matchAll(/data-mlgm-bulk="([^"]+)"/g)].map(match => match[1]), ['coins', 'xp', 'inspiration', 'tokens', 'undo']);
    const pair = html.slice(html.indexOf('<div class="gm-bulk-pair">'), html.indexOf('data-mlgm-bulk="undo"'));
    assert.deepEqual([...pair.matchAll(/data-mlgm-bulk="([^"]+)"/g)].map(match => match[1]), ['inspiration', 'tokens']);
    assert.ok(html.indexOf('data-mlgm-bulk="xp"') < html.indexOf('gm-bulk-pair'));
    const css = fs.readFileSync(new URL('../styles/game-master.css', import.meta.url), 'utf8');
    assert.match(css, /#mlgm \.gm-bulk-pair \{[^}]*grid-template-columns:minmax\(0,1fr\)/);
    assert.match(css, /@container gm-bulk \(min-width: 24rem\) \{ #mlgm \.gm-bulk-pair \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\); \} \}/);
    assert.match(html, /Give amount to each party member/);
    assert.match(html, /Clear Heroic Inspiration/);
    assert.match(html, /value="4"/);
    const undo = html.slice(html.indexOf('data-mlgm-bulk="undo"'));
    assert.match(undo, /disabled/);
    assert.match(undo, /Nothing to undo/);
    const ready = bulkPanel({actorIds: ['a'], undo: {kind: 'xp', labelKey: 'xp.split'}});
    assert.doesNotMatch(ready.slice(ready.indexOf('data-mlgm-bulk="undo"')), /disabled/);
    assert.match(ready, /Last action: Split amount amongst party members/);
    const paused = bulkPanel({actorIds: ['a'], undo: {kind: 'coins', operation: 'each-add'}, busy: true});
    assert.match(paused.slice(paused.indexOf('data-mlgm-bulk="undo"')), /disabled/);
    assert.match(paused, /Last action: Give amount to all party members/);
    assert.match(bulkPanel({actorIds: [], undo: {kind: 'xp', labelKey: 'xp.each'}}), /data-action="bulk-xp"[^>]*disabled/);
  });

  test('XP, inspiration, token sync, and undo update the party once and restore the saved snapshot', async () => {
    const gm = {id: 'gm', isGM: true, active: true}, player = {id: 'player', isGM: false, active: true};
    const character = (id, xp) => ({
      id, uuid: `Actor.${id}`, name: id, type: 'character', tokens: [],
      system: {details: {xp: {value: xp}}, attributes: {inspiration: false}, currency: {gp: 5}},
      prototypeToken: {name: 'Old', texture: {src: 'old'}, x: 9, _id: 'proto'},
      getDependentTokens() { return this.tokens; }
    });
    const actors = new Map([character('a', 10), character('b', 20), character('c', 30), character('purse', 0)].map(actor => [actor.id, actor]));
    actors.get('purse').type = 'group';
    const messages = [], registrations = new Map(), stored = new Map(), writes = [];
    const channel = {on(type, handler, options) { registrations.set(type, {handler, options}); }, executeAsUser(type, data, userId) {
      assert.equal(userId, gm.id);
      return registrations.get(type).handler(data, {senderUserId: game.user.id});
    }};
    globalThis.game = {
      user: gm, actors, users: new Map([[gm.id, gm], [player.id, player]]), messages,
      settings: {get: (namespace, key) => stored.get(`${namespace}.${key}`), set: async (namespace, key, value) => { stored.set(`${namespace}.${key}`, structuredClone(value)); }},
      modules: new Map([['morelord-core', {active: true}]])
    };
    globalThis.MorelordCore = {
      users: {list: () => [gm, player]},
      socket: {createChannel: () => channel},
      ui: {participation: {}, actorIdentity: ({actorUuid}) => '<span class="ml-actor-identity">' + actorUuid + '</span>'},
      rolls: {skill() { return null; }}
    };
    globalThis.foundry = {utils: {randomID: () => 'test-operation-0001', deepClone: value => structuredClone(value)}};
    globalThis.ui = {notifications: {warn() {}}};
    globalThis.canvas = {scene: {id: 'scene'}, tokens: {controlled: []}};
    globalThis.Actor = {async updateDocuments(updates) {
      writes.push(updates);
      return updates.map(update => {
        const actor = actors.get(update._id);
        if (update['system.details.xp.value'] != null) actor.system.details.xp.value = update['system.details.xp.value'];
        if ('system.attributes.inspiration' in update) actor.system.attributes.inspiration = update['system.attributes.inspiration'];
        if (update['system.currency']) actor.system.currency = {...update['system.currency']};
        if (update.prototypeToken) actor.prototypeToken = {...actor.prototypeToken, ...update.prototypeToken};
        return actor;
      });
    }};
    globalThis.ChatMessage = {async create(data, options) {
      assert.equal(options.messageMode, 'public');
      const message = {id: String(messages.length), author: gm, blind: data.blind, whisper: data.whisper, content: data.content, flags: structuredClone(data.flags), getFlag: (_namespace, key) => message.flags[ID][key], async update(change) {
        if (change.content) message.content = change.content;
        for (const [path, value] of Object.entries(change)) {
          if (!path.startsWith('flags.')) continue;
          const parts = path.split('.');
          let target = message;
          for (const part of parts.slice(0, -1)) target = target[part] ??= {};
          target[parts.at(-1)] = value;
        }
      }};
      messages.push(message);
      return message;
    }};
    const random = Math.random;
    Math.random = () => 0.99;
    try {
      initializeBulkActions(() => ['a', 'b', 'c', 'a']);
      for (const type of ['xp', 'inspiration', 'tokens', 'undo']) assert.equal(registrations.get(type).options.serialize, `${ID}.bulk-actions`);
      await applyBulkXp('split', 10, 'xp-operation-000001');
      assert.deepEqual([actors.get('a').system.details.xp.value, actors.get('b').system.details.xp.value, actors.get('c').system.details.xp.value], [13, 23, 34]);
      assert.equal(messages.at(-1).blind, false);
      assert.deepEqual(messages.at(-1).whisper, []);
      assert.match(messages.at(-1).content, /Party XP: Split amount amongst party members/);
      assert.match(messages.at(-1).content, /Added: 4 XP/);
      assert.match(messages.at(-1).content, /ml-actor-identity/);
      assert.equal(readBulkUndo().kind, 'xp');
      assert.equal((await applyBulkXp('split', 10, 'xp-operation-000001')).alreadyApplied, true);
      assert.equal(actors.get('a').system.details.xp.value, 13);
      await applyBulkUndo('undo-operation-0001');
      assert.deepEqual([actors.get('a').system.details.xp.value, actors.get('b').system.details.xp.value, actors.get('c').system.details.xp.value], [10, 20, 30]);
      assert.match(messages.at(-1).content, /Undid Split amount amongst party members/);
      assert.match(messages.at(-1).content, /Restored/);
      assert.equal(readBulkUndo(), null);
      await assert.rejects(applyBulkUndo('undo-operation-0002'), /no bulk action/);

      await applyBulkInspiration('grant', 'inspiration-grant-0001');
      assert.equal(actors.get('b').system.attributes.inspiration, true);
      await applyBulkInspiration('clear', 'inspiration-clear-0001');
      assert.equal(actors.get('b').system.attributes.inspiration, false);
      assert.match(messages.at(-1).content, /Party Inspiration: Cleared/);
      await applyBulkUndo('undo-operation-0003');
      assert.equal(actors.get('a').system.attributes.inspiration, true);
      assert.equal(readBulkUndo(), null);

      const placed = {id: 'token-b', toObject() { return {_id: 'token-b', actorId: 'a', x: 3, y: 4, elevation: 5, position: {x: 3}, delta: {}, _movementHistory: [], _regions: [], name: 'Placed', texture: {src: 'icons/placed.webp'}, width: 2, height: 2}; }};
      actors.get('a').tokens = [{id: 'token-a', toObject() { return {name: 'Other', x: 1}; }}, placed];
      globalThis.canvas.tokens.controlled = [{id: 'token-b'}];
      await applyBulkTokens('token-operation-0001');
      const tokenUpdate = writes.at(-1)[0];
      assert.equal(tokenUpdate._id, 'a');
      for (const key of TOKEN_EXCLUDE) assert.equal(Object.hasOwn(tokenUpdate.prototypeToken, key), false);
      assert.equal(actors.get('a').prototypeToken.name, 'Placed');
      assert.equal(actors.get('a').prototypeToken.x, 9);
      assert.match(messages.at(-1).content, /Prototype token updated/);
      assert.match(messages.at(-1).content, /No token on the current scene/);
      assert.deepEqual(readBulkUndo().actors.map(row => row.id), ['a']);
      actors.get('a').tokens = [];
      const snapshot = readBulkUndo();
      await applyBulkTokens('token-operation-0002');
      assert.deepEqual(readBulkUndo(), snapshot);
      await applyBulkUndo('undo-operation-0004');
      assert.equal(actors.get('a').prototypeToken.name, 'Old');
      assert.equal(readBulkUndo(), null);

      actors.get('a').system.currency = {gp: 9};
      actors.get('purse').system.currency = {gp: 1};
      await writeBulkUndo({kind: 'coins', operation: 'each-remove', actors: [{id: 'a', currency: {gp: 2}}], purse: {id: 'purse', currency: {gp: 8}}});
      await applyBulkUndo('undo-operation-0005');
      assert.equal(actors.get('a').system.currency.gp, 2);
      assert.equal(actors.get('purse').system.currency.gp, 8);
      assert.match(messages.at(-1).content, /Shared purse restored/);
      assert.equal(readBulkUndo(), null);

      await assert.rejects(registrations.get('xp').handler({operation: 'each', amount: 1, operationId: 'xp-operation-000099'}, {senderUserId: player.id}), /eligible GM/);
      game.user = player;
      await assert.rejects(applyBulkXp('each', 1, 'xp-operation-000098'), /Only GMs/);
      game.user = gm;
      initializeBulkActions(() => []);
      await assert.rejects(applyBulkXp('each', 1, 'xp-operation-000097'), /Player Settings/);
      globalThis.canvas.scene = null;
      initializeBulkActions(() => ['a']);
      await assert.rejects(applyBulkTokens('token-operation-0003'), /current scene/);
    } finally { Math.random = random; }
  });
});
