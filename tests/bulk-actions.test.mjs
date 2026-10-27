import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BULK_STRINGS} from '../scripts/bulk-text.mjs';
import {BULK_UNDO, readBulkUndo, writeBulkUndo} from '../scripts/bulk-undo.mjs';
import {applyBulkCoins, initializeBulkCoins} from '../scripts/bulk-coins.mjs';
import {
  TOKEN_FIELDS, applyBulkInspiration, applyBulkTokens, applyBulkUndo, applyBulkXp, bulkPanel, bulkXpChoice,
  chooseSceneToken, initializeBulkActions, planInspiration, planXp, prototypeTokenChanges, prototypeTokenDiff, readXp, tokenFieldList, xpShares
} from '../scripts/bulk-actions.mjs';

const ID = 'morelord-game-master';

function rejectSceneTokenFields(update) {
  if (!update.prototypeToken) return;
  const allowed = new Set(TOKEN_FIELDS.map(([key]) => key));
  const illegal = Object.keys(update.prototypeToken).filter(key => !allowed.has(key));
  if (illegal.length) throw new Error(`PrototypeToken sync copied ${illegal.join(', ')}`);
}

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
    assert.deepEqual(planXp(actors, 'set', 4).map(row => [row.before, row.after, row.added]), [[5, 4, 4], [0, 4, 4]]);
    assert.deepEqual(planXp(actors, 'set', 0).map(row => row.after), [0, 0]);
    assert.equal(actors[0].system.details.xp.value, 5);
    assert.throws(() => planXp(actors, 'set', -1), /whole number/);
    assert.throws(() => planXp(actors, 'set', 1.5), /whole number/);
    assert.throws(() => planXp(actors, 'set', 'no'), /whole number/);
    assert.throws(() => planXp(actors, 'nope', 1), /valid XP/);
    assert.equal(bulkXpChoice('set'), 'set');
    assert.equal(bulkXpChoice('each'), 'each');
    assert.equal(bulkXpChoice('split'), 'split');
    assert.equal(bulkXpChoice('nope'), 'split');
    assert.throws(() => planXp([{id: 'a', type: 'npc'}], 'each', 1), /character/);
    assert.throws(() => xpShares(1, 0, true), /Player Settings/);
    assert.deepEqual(planInspiration(actors, 'grant').map(row => row.after), [true, true]);
    const inspired = {...actors[0], system: {attributes: {inspiration: true}}};
    const plain = actors[1];
    assert.equal(planInspiration([inspired], 'clear')[0].before, true);
    assert.deepEqual(planInspiration([inspired, plain], 'grant').map(row => row.skipped), [true, false]);
    assert.equal(planInspiration([plain], 'clear')[0].skipped, true);
    assert.throws(() => planInspiration(actors, 'maybe'), /grant or clear/);
  });

  test('prototype token copy keeps the allowlisted prototype settings', () => {
    const ignored = {
      _id: 'token', actorId: 'a', x: 4, y: 8, elevation: 2, position: {x: 4, y: 8},
      shape: 1, sort: 100, hidden: true, locked: true, flags: {dnd5e: {token: true}},
      movementAction: 'fly', level: 'Level.ground',
      delta: {name: 'Synthetic', items: [{_id: 'item'}]}, _movementHistory: [{x: 1}], _regions: ['region'], _stats: {coreVersion: '14'}
    };
    const copied = {
      name: 'Placed', displayName: 50, actorLink: false, texture: {src: 'icons/placed.webp', scaleX: 1.2, scaleY: 0.8},
      width: 1, height: 1, depth: 0, disposition: 1, displayBars: 20, bar1: {attribute: 'hp'}, bar2: {attribute: 'ac'},
      sight: {enabled: true}, detectionModes: {basicSight: {id: 'basicSight', enabled: true, range: 10}}, light: {bright: 20},
      lockRotation: true, rotation: 90, alpha: 0.5, ring: {enabled: true}, occludable: {radius: 0}
    };
    const changes = prototypeTokenChanges({toObject() { return {...ignored, ...copied}; }});
    assert.deepEqual(Object.keys(changes), TOKEN_FIELDS.map(([key]) => key));
    assert.deepEqual(changes, copied);
    assert.deepEqual(prototypeTokenChanges({toObject() { return {...ignored, actorLink: true, name: 'Linked'}; }}), {name: 'Linked', actorLink: true});
    assert.equal(prototypeTokenChanges(null), null);
    assert.equal(prototypeTokenChanges({toObject() { throw new Error('Unable to materialize ActorDelta'); }}), null);
    const nested = {name: 'Hero', sight: {enabled: true, range: 30, angle: 360}, texture: {src: 'hero.webp', scaleX: 1, scaleY: 1}};
    assert.equal(prototypeTokenDiff(nested, {name: 'Hero', sight: {enabled: true, range: 30}, texture: {src: 'hero.webp', scaleX: 1, scaleY: 1}}), null);
    assert.deepEqual(prototypeTokenDiff(nested, {name: 'Placed', sight: {enabled: true, range: 60}}), {name: 'Placed', sight: {range: 60}});
    const listed = tokenFieldList();
    assert.equal(listed, TOKEN_FIELDS.map(([, key]) => BULK_STRINGS[key]).slice(0, -1).join(', ') + ', and ' + BULK_STRINGS[TOKEN_FIELDS.at(-1)[1]]);
    for (const file of ['../README.md', '../AGENTS.md', '../release-notes/RELEASE-NOTES-0.2.0.md']) {
      assert.ok(fs.readFileSync(new URL(file, import.meta.url), 'utf8').includes(listed), file);
    }
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
    assert.match(html, /Set all party XP to this amount/);
    const xpCard = html.slice(html.indexOf('data-mlgm-bulk="xp"'), html.indexOf('gm-bulk-pair'));
    assert.match(xpCard, /class="gm-label-help"/);
    assert.match(xpCard, /class="ml-icon-button ml-help-button" title="[^"]*Any remainder goes to one random party member[^"]*"/);
    assert.doesNotMatch(xpCard, /<p>/);
    assert.match(css, /#mlgm \.gm-label-help \{ display:inline-flex; align-items:center; gap:var\(--ml-space-1\); \}/);
    const xpStart = html.indexOf('name="bulkXpAction"');
    const xpSelect = html.slice(xpStart, html.indexOf('</select>', xpStart));
    assert.deepEqual([...xpSelect.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]), ['split', 'each', 'set']);
    assert.match(html, /Clear Heroic Inspiration/);
    assert.match(html, /value="4"/);
    const tokensCard = html.slice(html.indexOf('data-mlgm-bulk="tokens"'), html.indexOf('data-mlgm-bulk="undo"'));
    assert.match(tokensCard, /data-action="bulk-tokens-help"/);
    assert.match(tokensCard, /fa-circle-question/);
    assert.match(tokensCard, /aria-label="Copied token settings"/);
    assert.match(tokensCard, /title="Copies each party character&#39;s token on the active GM&#39;s current scene onto that character&#39;s prototype token\. A selected token is used when several are placed\."/);
    assert.doesNotMatch(tokensCard, /<p>/);
    assert.doesNotMatch(tokensCard, /image and scale/);
    assert.doesNotMatch(html, /not copied|left off|omits/i);
    assert.match(html, /data-action="bulk-coins"[^>]*>Apply</);
    assert.match(html, /data-action="bulk-xp"[^>]*>Apply</);
    assert.match(html, /data-action="bulk-inspiration"[^>]*>Apply</);
    assert.match(html, /data-action="bulk-tokens"[^>]*>Apply</);
    assert.match(html, /Prototype Token Sync/);
    assert.match(html, /Undo Last Action/);
    assert.doesNotMatch(html, />Send</);
    const removal = bulkPanel({actorIds: ['a'], coinAction: 'each-remove', undo: null});
    assert.match(removal, /data-action="bulk-coins"[^>]*>Take</);
    const tray = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
    assert.match(tray, /endsWith\('-remove'\) \? 'Take' : bulkText\('coins\.apply'\)/);
    assert.match(tray, /bulk-tokens-help"\) return form\(bulkText\('tokens\.help'\), `<p>\$\{bulkHTML\('tokens\.copied', \{fields: tokenFieldList\(\)\}\)\}<\/p>`/);
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
        rejectSceneTokenFields(update);
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

      await applyBulkXp('set', 7, 'xp-set-operation-0001');
      assert.deepEqual([actors.get('a').system.details.xp.value, actors.get('b').system.details.xp.value, actors.get('c').system.details.xp.value], [7, 7, 7]);
      assert.equal(messages.at(-1).blind, false);
      assert.deepEqual(messages.at(-1).whisper, []);
      assert.match(messages.at(-1).content, /Party XP: Set all party XP to this amount/);
      assert.match(messages.at(-1).content, /Set to: 7 XP/);
      assert.deepEqual(readBulkUndo().actors.map(row => [row.id, row.before]), [['a', 10], ['b', 20], ['c', 30]]);
      await applyBulkUndo('undo-operation-0006');
      assert.deepEqual([actors.get('a').system.details.xp.value, actors.get('b').system.details.xp.value, actors.get('c').system.details.xp.value], [10, 20, 30]);
      assert.match(messages.at(-1).content, /Undid Set all party XP to this amount/);
      assert.equal(readBulkUndo(), null);
      await applyBulkXp('set', 0, 'xp-set-operation-0002');
      assert.deepEqual([actors.get('a').system.details.xp.value, actors.get('b').system.details.xp.value, actors.get('c').system.details.xp.value], [0, 0, 0]);
      await applyBulkUndo('undo-operation-0007');
      assert.deepEqual([actors.get('a').system.details.xp.value, actors.get('b').system.details.xp.value, actors.get('c').system.details.xp.value], [10, 20, 30]);
      assert.throws(() => applyBulkXp('set', -3, 'xp-set-operation-0003'), /whole number/);
      assert.throws(() => applyBulkXp('set', 2.5, 'xp-set-operation-0004'), /whole number/);
      assert.equal(readBulkUndo(), null);

      await applyBulkInspiration('grant', 'inspiration-grant-0001');
      assert.equal(actors.get('b').system.attributes.inspiration, true);
      await applyBulkInspiration('clear', 'inspiration-clear-0001');
      assert.equal(actors.get('b').system.attributes.inspiration, false);
      assert.match(messages.at(-1).content, /Party Inspiration: Cleared/);
      await applyBulkUndo('undo-operation-0003');
      assert.equal(actors.get('a').system.attributes.inspiration, true);
      assert.equal(readBulkUndo(), null);

      const placed = {id: 'token-b', toObject() { return {_id: 'token-b', actorId: 'a', x: 3, y: 4, elevation: 5, position: {x: 3}, shape: 1, sort: 7, hidden: false, locked: true, delta: {name: 'Synthetic', items: [{_id: 'item'}]}, _movementHistory: [], _regions: ['region'], actorLink: false, flags: {world: {tint: '#fff'}}, name: 'Placed', texture: {src: 'icons/placed.webp'}, width: 2, height: 2}; }};
      actors.get('a').tokens = [{id: 'token-a', toObject() { return {name: 'Other', x: 1}; }}, placed];
      globalThis.canvas.tokens.controlled = [{id: 'token-b'}];
      await applyBulkTokens('token-operation-0001');
      const tokenUpdate = writes.at(-1)[0];
      assert.equal(tokenUpdate._id, 'a');
      assert.deepEqual(Object.keys(tokenUpdate.prototypeToken).filter(key => !TOKEN_FIELDS.some(([field]) => field === key)), []);
      assert.equal(actors.get('a').prototypeToken.name, 'Placed');
      assert.equal(actors.get('a').prototypeToken.actorLink, false);
      assert.deepEqual(actors.get('a').prototypeToken.texture, {src: 'icons/placed.webp'});
      assert.equal(actors.get('a').prototypeToken.flags, undefined);
      assert.equal(actors.get('a').prototypeToken.delta, undefined);
      assert.equal(actors.get('a').prototypeToken.sort, undefined);
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

  test('each bulk action enables undo immediately, then undo restores the previous values', async () => {
    const source = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
    assert.match(source, /register\(ID, BULK_UNDO, \{scope: "world", config: false, restricted: true, type: String, default: ""\}\)/);
    const gm = {id: 'gm', isGM: true, active: true};
    const character = (id, xp) => ({
      id, uuid: `Actor.${id}`, name: id, type: 'character', tokens: [],
      system: {details: {xp: {value: xp}}, attributes: {inspiration: false}, currency: {gp: 5}},
      prototypeToken: {name: 'Old', texture: {src: 'old'}, x: 9, _id: 'proto'},
      getDependentTokens() { return this.tokens; }
    });
    const actors = new Map(['a', 'b', 'c'].map(id => [id, character(id, id === 'a' ? 10 : id === 'b' ? 20 : 30)]));
    const messages = [], registrations = new Map(), saved = new Map();
    let live = false;
    const key = `${ID}.${BULK_UNDO}`;
    const channel = {on(type, handler, options) { registrations.set(type, {handler, options}); }, executeAsUser(type, data, userId) {
      assert.equal(userId, gm.id);
      return registrations.get(type).handler(data, {senderUserId: game.user.id});
    }};
    globalThis.CONFIG = {DND5E: {currencies: Object.fromEntries(Object.entries({pp: 0.1, gp: 1, ep: 2, sp: 10, cp: 100}).map(([denomination, conversion]) => [denomination, {conversion, label: denomination}]))}};
    globalThis.game = {
      user: gm, actors, users: new Map([[gm.id, gm]]), messages,
      dnd5e: {applications: {CurrencyManager: {getActorCurrencyUpdates: () => { throw Error('Additions do not make change.'); }}}},
      settings: {
        get(namespace, setting) {
          if (`${namespace}.${setting}` !== key) return undefined;
          if (!live) return {empty: true};
          return saved.get(key) ?? '';
        },
        async set(namespace, setting, value, options) {
          assert.equal(`${namespace}.${setting}`, key);
          assert.equal(options?.diff, false);
          saved.set(key, typeof value === 'string' ? value : {empty: true});
        }
      },
      modules: new Map([['morelord-core', {active: true}]]),
      i18n: {localize: text => text}
    };
    globalThis.MorelordCore = {
      users: {list: () => [gm]},
      socket: {createChannel: () => channel},
      ui: {participation: {primaryPartyGroup: () => null}, actorIdentity: ({actorUuid}) => '<span class="ml-actor-identity">' + actorUuid + '</span>'},
      rolls: {skill() { return null; }}
    };
    globalThis.foundry = {utils: {randomID: () => 'test-operation-0001', deepClone: value => structuredClone(value)}};
    globalThis.ui = {notifications: {warn() {}}};
    globalThis.canvas = {scene: {id: 'scene'}, tokens: {controlled: []}};
    globalThis.Actor = {async updateDocuments(updates) {
      return updates.map(update => {
        rejectSceneTokenFields(update);
        const actor = actors.get(update._id);
        if (update['system.details.xp.value'] != null) actor.system.details.xp.value = update['system.details.xp.value'];
        if ('system.attributes.inspiration' in update) actor.system.attributes.inspiration = update['system.attributes.inspiration'];
        if (update['system.currency']) actor.system.currency = {...update['system.currency']};
        if (update.prototypeToken) actor.prototypeToken = {...actor.prototypeToken, ...update.prototypeToken};
        return actor;
      });
    }};
    globalThis.ChatMessage = {async create(data) {
      const message = {id: String(messages.length), author: gm, content: data.content, flags: structuredClone(data.flags), getFlag: (_namespace, flag) => message.flags[ID][flag], async update(change) {
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
    const undoSection = () => {
      const html = bulkPanel({actorIds: ['a', 'b', 'c'], undo: readBulkUndo(), busy: false});
      return html.slice(html.indexOf('data-mlgm-bulk="undo"'));
    };
    const assertUndoReady = label => {
      for (const section of [undoSection(), undoSection()]) {
        assert.equal(section.includes('Nothing to undo'), false, label);
        assert.equal(section.includes('disabled'), false, label);
        assert.equal(section.includes(`Last action: ${label}`), true, label);
      }
    };
    const assertUndoEmpty = () => {
      const section = undoSection();
      assert.equal(section.includes('Nothing to undo.'), true);
      assert.equal(section.includes('disabled'), true);
    };
    const savedSnapshot = () => {
      const value = saved.get(key);
      assert.equal(typeof value, 'string');
      return value ? JSON.parse(value) : null;
    };
    const random = Math.random;
    Math.random = () => 0.99;
    try {
      initializeBulkCoins(() => ['a', 'b', 'c']);
      initializeBulkActions(() => ['a', 'b', 'c']);
      assertUndoEmpty();
      const rounds = [
        {
          label: 'Split amount amongst party members',
          kind: 'xp',
          apply: () => applyBulkXp('split', 10, 'xp-split-round-0001'),
          applied: () => [13, 23, 34],
          restored: () => [10, 20, 30],
          read: () => ['a', 'b', 'c'].map(id => actors.get(id).system.details.xp.value)
        },
        {
          label: 'Give amount to each party member',
          kind: 'xp',
          apply: () => applyBulkXp('each', 5, 'xp-each-round-00001'),
          applied: () => [15, 25, 35],
          restored: () => [10, 20, 30],
          read: () => ['a', 'b', 'c'].map(id => actors.get(id).system.details.xp.value)
        },
        {
          label: 'Set all party XP to this amount',
          kind: 'xp',
          apply: () => applyBulkXp('set', 7, 'xp-set-round-000001'),
          applied: () => [7, 7, 7],
          restored: () => [10, 20, 30],
          read: () => ['a', 'b', 'c'].map(id => actors.get(id).system.details.xp.value)
        },
        {
          label: 'Give amount to all party members',
          kind: 'coins',
          apply: () => applyBulkCoins('each-add', {gp: 3}, 'coin-each-round-0001'),
          applied: () => [8, 8, 8],
          restored: () => [5, 5, 5],
          read: () => ['a', 'b', 'c'].map(id => actors.get(id).system.currency.gp)
        },
        {
          label: 'Grant Heroic Inspiration',
          kind: 'inspiration',
          apply: () => applyBulkInspiration('grant', 'inspiration-round-001'),
          applied: () => [true, true, true],
          restored: () => [false, false, false],
          read: () => ['a', 'b', 'c'].map(id => actors.get(id).system.attributes.inspiration)
        },
        {
          label: 'Prototype Token Sync',
          kind: 'tokens',
          async apply() {
            const placed = {id: 'token-b', toObject() { return {_id: 'token-b', actorId: 'a', x: 3, y: 4, elevation: 5, position: {x: 3}, shape: 1, sort: 7, hidden: false, locked: true, delta: {name: 'Synthetic', items: [{_id: 'item'}]}, _movementHistory: [], _regions: ['region'], actorLink: false, flags: {world: {tint: '#fff'}}, name: 'Placed', texture: {src: 'icons/placed.webp'}, width: 2, height: 2}; }};
            actors.get('a').tokens = [placed];
            globalThis.canvas.tokens.controlled = [{id: 'token-b'}];
            await applyBulkTokens('token-round-0000001');
          },
          applied: () => ['Placed', 'Old', 'Old'],
          restored: () => ['Old', 'Old', 'Old'],
          read: () => ['a', 'b', 'c'].map(id => actors.get(id).prototypeToken.name)
        }
      ];
      let undoId = 0;
      for (const round of rounds) {
        live = false;
        await round.apply();
        assert.deepEqual(round.read(), round.applied(), round.label);
        assert.equal(savedSnapshot().kind, round.kind, round.label);
        assertUndoReady(round.label);
        live = true;
        assert.equal(readBulkUndo().kind, round.kind, round.label);
        assertUndoReady(round.label);
        await applyBulkUndo(`undo-round-${String(++undoId).padStart(8, '0')}`);
        assert.deepEqual(round.read(), round.restored(), round.label);
        assert.equal(savedSnapshot(), null);
        assertUndoEmpty();
      }
    } finally { Math.random = random; }
  });

  test('unchanged party members are skipped and do not replace undo', async () => {
    const source = fs.readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
    for (const action of ['applyBulkCoins', 'applyBulkXp', 'applyBulkInspiration', 'applyBulkTokens']) {
      const sender = source.slice(source.indexOf(`await ${action}`), source.indexOf(`await ${action}`) + 220);
      assert.match(sender, /result\?\.unchanged/);
    }
    const gm = {id: 'gm', isGM: true, active: true};
    const character = (id, xp, inspiration) => ({
      id, uuid: `Actor.${id}`, name: id, type: 'character', tokens: [],
      system: {details: {xp: {value: xp}}, attributes: {inspiration}, currency: {gp: 0}},
      prototypeToken: {name: 'Old', texture: {src: 'old'}, x: 9, _id: 'proto'},
      getDependentTokens() { return this.tokens; }
    });
    const actors = new Map([
      ['a', character('a', 10, true)],
      ['b', character('b', 20, false)],
      ['c', character('c', 30, false)]
    ]);
    const messages = [], registrations = new Map(), stored = new Map(), writes = [];
    const channel = {on(type, handler) { registrations.set(type, handler); }, executeAsUser(type, data, userId) {
      assert.equal(userId, gm.id);
      return registrations.get(type)(data, {senderUserId: gm.id});
    }};
    globalThis.game = {
      user: gm, actors, users: new Map([[gm.id, gm]]), messages,
      settings: {
        get: (namespace, key) => stored.get(`${namespace}.${key}`),
        set: async (namespace, key, value) => stored.set(`${namespace}.${key}`, value)
      },
      modules: new Map([['morelord-core', {active: true}]])
    };
    globalThis.MorelordCore = {
      users: {list: () => [gm]},
      socket: {createChannel: () => channel},
      ui: {participation: {}, actorIdentity: ({actorUuid}) => '<span class="ml-actor-identity">' + actorUuid + '</span>'},
      rolls: {skill() { return null; }}
    };
    globalThis.foundry = {utils: {randomID: () => 'test-operation-0001', deepClone: value => structuredClone(value)}};
    globalThis.ui = {notifications: {warn() {}, info() {}}};
    globalThis.canvas = {scene: {id: 'scene'}, tokens: {controlled: []}};
    globalThis.Actor = {async updateDocuments(updates) {
      writes.push(updates);
      const applied = [];
      for (const update of updates) {
        rejectSceneTokenFields(update);
        const actor = actors.get(update._id);
        if ('system.attributes.inspiration' in update && Boolean(actor.system.attributes.inspiration) === Boolean(update['system.attributes.inspiration'])) continue;
        if (update['system.details.xp.value'] != null && actor.system.details.xp.value === update['system.details.xp.value']) continue;
        if ('system.attributes.inspiration' in update) actor.system.attributes.inspiration = update['system.attributes.inspiration'];
        if (update['system.details.xp.value'] != null) actor.system.details.xp.value = update['system.details.xp.value'];
        if (update.prototypeToken) actor.prototypeToken = {...actor.prototypeToken, ...update.prototypeToken};
        applied.push(actor);
      }
      return applied;
    }};
    globalThis.ChatMessage = {async create(data) {
      const message = {id: String(messages.length), author: gm, content: data.content, flags: structuredClone(data.flags), getFlag: (_namespace, flag) => message.flags[ID][flag], async update(change) {
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
    Math.random = () => 0;
    try {
      initializeBulkActions(() => ['a', 'b', 'c']);
      await writeBulkUndo({kind: 'xp', labelKey: 'xp.each', operation: 'each', actors: [{id: 'a', before: 1}]});
      const grant = await applyBulkInspiration('grant', 'inspiration-grant-0002');
      assert.equal(grant.unchanged, undefined);
      assert.deepEqual(writes.at(-1).map(update => update._id), ['b', 'c']);
      assert.equal(actors.get('a').system.attributes.inspiration, true);
      assert.equal(actors.get('b').system.attributes.inspiration, true);
      assert.match(messages.at(-1).content, /Skipped 1 who already had inspiration/);
      assert.equal(messages.at(-1).content.includes('Actor.a'), false);
      assert.deepEqual(readBulkUndo().actors.map(row => row.id), ['b', 'c']);
      const again = await applyBulkInspiration('grant', 'inspiration-grant-0003');
      assert.equal(again.unchanged, true);
      assert.match(again.notice, /already has inspiration/);
      assert.equal(writes.length, 1);
      assert.deepEqual(readBulkUndo().actors.map(row => row.id), ['b', 'c']);
      assert.equal(messages.length, 1);

      await applyBulkInspiration('clear', 'inspiration-clear-0002');
      assert.deepEqual(writes.at(-1).map(update => update._id), ['a', 'b', 'c']);
      const clearAgain = await applyBulkInspiration('clear', 'inspiration-clear-0003');
      assert.equal(clearAgain.unchanged, true);
      assert.match(clearAgain.notice, /No one in the party has inspiration/);
      assert.equal(readBulkUndo().action, 'clear');
      assert.equal(writes.length, 2);

      const set = await applyBulkXp('set', 10, 'xp-set-skip-0000001');
      assert.deepEqual(writes.at(-1).map(update => update._id), ['b', 'c']);
      assert.equal(actors.get('a').system.details.xp.value, 10);
      assert.equal(actors.get('b').system.details.xp.value, 10);
      assert.match(messages.at(-1).content, /Skipped 1 whose experience did not change/);
      assert.deepEqual(readBulkUndo().actors.map(row => [row.id, row.before]), [['b', 20], ['c', 30]]);
      const same = await applyBulkXp('set', 10, 'xp-set-skip-0000002');
      assert.equal(same.unchanged, true);
      assert.match(same.notice, /experience needed changing/);
      assert.equal(writes.length, 3);
      assert.equal(readBulkUndo().operation, 'set');

      const split = await applyBulkXp('split', 2, 'xp-split-skip-000001');
      assert.deepEqual(writes.at(-1).map(update => update._id), ['a']);
      assert.equal(actors.get('a').system.details.xp.value, 12);
      assert.equal(actors.get('b').system.details.xp.value, 10);
      assert.match(messages.at(-1).content, /Skipped 2 whose experience did not change/);
      assert.deepEqual(readBulkUndo().actors.map(row => row.id), ['a']);

      const kept = readBulkUndo();
      const placed = {id: 'token-a', toObject() { return {name: 'Old', texture: {src: 'old'}, x: 1, y: 2, _id: 'ignore', actorId: 'a', sort: 4, shape: 1, hidden: false, locked: false, delta: {items: []}}; }};
      actors.get('a').tokens = [placed];
      const synced = await applyBulkTokens('token-same-00000001');
      assert.equal(synced.unchanged, true);
      assert.match(synced.notice, /No prototype tokens needed updating/);
      assert.match(messages.at(-1).content, /Skipped 1 whose prototype already matched/);
      assert.match(messages.at(-1).content, /No token on the current scene/);
      assert.equal(messages.at(-1).content.includes('Prototype token updated'), false);
      assert.deepEqual(readBulkUndo(), kept);
      assert.equal(writes.length, 4);
    } finally { Math.random = random; }
  });

  test('prototype sync from a second GM skips Foundry no-op diffs instead of cancelling the update', async () => {
    const primary = {id: 'gm-primary', isGM: true, active: true};
    const assistant = {id: 'gm-assistant', isGM: true, active: true};
    const character = (id, prototypeToken) => ({
      id, uuid: `Actor.${id}`, name: id, type: 'character', tokens: [],
      system: {details: {xp: {value: 0}}, attributes: {inspiration: false}},
      prototypeToken,
      getDependentTokens() { return this.tokens; }
    });
    const actors = new Map([
      ['a', character('a', {name: 'Hero', actorLink: false, texture: {src: 'hero.webp', scaleX: 1, scaleY: 1}, sight: {enabled: true, range: 30, angle: 360}})],
      ['b', character('b', {name: 'Old', texture: {src: 'old.webp'}, x: 4, _id: 'proto'})]
    ]);
    const messages = [], registrations = new Map(), stored = new Map(), writes = [];
    const channel = {on(type, handler) { registrations.set(type, handler); }, async executeAsUser(type, data, userId) {
      assert.equal(userId, primary.id);
      const caller = game.user;
      game.user = primary;
      try { return await registrations.get(type)(data, {senderUserId: caller.id}); }
      finally { game.user = caller; }
    }};
    globalThis.game = {
      user: assistant, actors, users: new Map([[primary.id, primary], [assistant.id, assistant]]), messages,
      settings: {
        get: (namespace, key) => stored.get(`${namespace}.${key}`),
        set: async (namespace, key, value) => stored.set(`${namespace}.${key}`, value)
      },
      modules: new Map([['morelord-core', {active: true}]])
    };
    globalThis.MorelordCore = {
      users: {list: () => [primary, assistant]},
      socket: {createChannel: () => channel},
      ui: {participation: {}, actorIdentity: ({actorUuid}) => '<span class="ml-actor-identity">' + actorUuid + '</span>'},
      rolls: {skill() { return null; }}
    };
    globalThis.foundry = {utils: {randomID: () => 'test-operation-0001', deepClone: value => structuredClone(value)}};
    globalThis.ui = {notifications: {warn() {}}};
    globalThis.canvas = {scene: {id: 'scene'}, tokens: {controlled: []}};
    globalThis.Actor = {async updateDocuments(updates) {
      writes.push(updates);
      const applied = [];
      for (const update of updates) {
        rejectSceneTokenFields(update);
        const actor = actors.get(update._id);
        if (update.prototypeToken && !prototypeTokenDiff(prototypeTokenChanges(actor.prototypeToken), update.prototypeToken)) continue;
        if (update.prototypeToken) actor.prototypeToken = {...actor.prototypeToken, ...update.prototypeToken};
        applied.push(actor);
      }
      return applied;
    }};
    globalThis.ChatMessage = {async create(data) {
      const message = {id: String(messages.length), author: game.user, content: data.content, flags: structuredClone(data.flags), getFlag: (_namespace, flag) => message.flags[ID][flag], async update(change) {
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
    actors.get('a').tokens = [{id: 'token-a', toObject() { return {name: 'Hero', texture: {src: 'hero.webp', scaleX: 1, scaleY: 1}, sight: {enabled: true, range: 30}, actorLink: false, sort: 3, hidden: false, delta: {items: []}}; }}];
    actors.get('b').tokens = [{id: 'token-b', toObject() { return {name: 'Placed', texture: {src: 'icons/placed.webp'}, width: 2, actorLink: false, sort: 8, shape: 1, hidden: false, locked: true, x: 1, y: 2}; }}];
    initializeBulkActions(() => ['a', 'b']);
    const result = await applyBulkTokens('token-two-gm-0000001');
    assert.equal(result.unchanged, undefined);
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].map(update => update._id), ['b']);
    assert.equal(writes[0][0].prototypeToken.name, 'Placed');
    assert.equal(writes[0][0].prototypeToken.sort, undefined);
    assert.equal(actors.get('b').prototypeToken.name, 'Placed');
    assert.equal(actors.get('a').prototypeToken.sight.angle, 360);
    assert.match(messages.at(-1).content, /Prototype token updated/);
    assert.match(messages.at(-1).content, /Skipped 1 whose prototype already matched/);
    assert.equal(messages.at(-1).content.includes('A character update was cancelled'), false);
    assert.deepEqual(readBulkUndo().actors.map(row => row.id), ['b']);
  });
});
