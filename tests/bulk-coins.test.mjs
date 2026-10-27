import test from 'node:test';
import assert from 'node:assert/strict';
import {COINS, readCoins, coinShares, planCoins, initializeBulkCoins, applyBulkCoins, formatCoins} from '../scripts/bulk-coins.mjs';
import {readBulkUndo, writeBulkUndo} from '../scripts/bulk-undo.mjs';

const coins = values => Object.fromEntries(COINS.map(key => [key, values[key] ?? 0]));
const actor = (id, values) => ({id, uuid:`Actor.${id}`, name:id, type:'character', system:{currency:coins(values)}});
const nativeStub = {getActorCurrencyUpdates({system:{currency}}, amount, key) {
  if (amount <= 0) return {system:{currency:{...currency}}, remainder:0};
  assert.equal(key, 'cp', 'Deductions use copper precision.');
  const available = value(currency), charge = BigInt(amount), paid = available < charge ? available : charge;
  let change = available - paid;
  const after = coins({});
  for (const denomination of COINS.filter(key => key !== 'ep')) {
    const ratio = BigInt(Math.round(CONFIG.DND5E.currencies.cp.conversion / CONFIG.DND5E.currencies[denomination].conversion));
    after[denomination] = Number(change / ratio); change %= ratio;
  }
  return {system:{currency:after}, remainder:Number(charge - paid)};
}};

globalThis.CONFIG = {DND5E:{currencies:Object.fromEntries(Object.entries({pp:0.1,gp:1,ep:2,sp:10,cp:100}).map(([key, conversion]) => [key, {conversion}]))}};
const value = coins => COINS.reduce((sum, key) => sum + BigInt(coins[key] ?? 0) * BigInt(Math.round(CONFIG.DND5E.currencies.cp.conversion / CONFIG.DND5E.currencies[key].conversion)), 0n);

test('splits make change before division and assign only copper remainder randomly', () => {
  const entered = {pp:2, gp:10, ep:4, sp:5, cp:8};
  const shares = coinShares(entered, 3, true);
  assert.equal(shares.reduce((sum, share) => sum + value(share), 0n), value(entered));
  assert.ok(shares.every(share => COINS.every(key => Number.isSafeInteger(share[key]))));
  const random = Math.random;
  try {
    Math.random = () => 0.99;
    assert.deepEqual(coinShares({gp:1}, 3, true), [coins({sp:3,cp:3}),coins({sp:3,cp:3}),coins({sp:3,cp:4})]);
    assert.deepEqual(coinShares({ep:1}, 2, true), [coins({sp:2,cp:5}), coins({sp:2,cp:5})]);
    assert.deepEqual(coinShares({gp:5}, 3, true).map(value), [166n,166n,168n]);
    const large = coinShares({gp:Number.MAX_SAFE_INTEGER}, 3, true);
    assert.equal(large.reduce((sum, share) => sum + value(share), 0n), BigInt(Number.MAX_SAFE_INTEGER) * 100n);
  } finally { Math.random = random; }
  assert.deepEqual(coinShares({gp:5}, 2, false), [coins({gp:5}), coins({gp:5})]);
});

test('additions preserve other coins and removals report individual deficits without negative balances', () => {
  const actors = [actor('a', {gp:2, sp:5}), actor('b', {gp:10})];
  const added = planCoins(actors, 'each-add', {gp:3}, nativeStub);
  assert.equal(added[0].after.gp, 5); assert.equal(added[0].after.sp, 5);
  const removed = planCoins(actors, 'each-remove', {gp:4}, nativeStub);
  assert.deepEqual(removed.map(row => [row.requested.gp, row.applied.gp, row.deficit.gp, row.after.gp]), [[4,2.5,1.5,0],[4,4,0,6]]);
  assert.equal(actors[0].system.currency.gp, 2, 'Planning never changes character documents.');
});

test('coin boundaries reject fractional, negative, unsafe, unknown, and empty requests', () => {
  for (const gp of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true, null, {}, []]) assert.throws(() => readCoins({gp}));
  assert.throws(() => readCoins({gems:1}), /Unknown/);
  assert.throws(() => coinShares({gp:1}, 0, true), /Player Settings/);
  assert.throws(() => planCoins([actor('a', {})], 'wrong', {gp:1}, nativeStub), /valid/);
  assert.throws(() => planCoins([actor('a', {})], 'each-add', {}, nativeStub), /at least/);
  assert.throws(() => planCoins([actor('a', {gp:Number.MAX_SAFE_INTEGER})], 'each-add', {gp:1}, nativeStub), /too large/);
  assert.deepEqual(readCoins({gp:'2', sp:''}), coins({gp:2}));
});

test('removal uses personal coins, then the shared purse once, and reports only the unpaid deficit', () => {
  globalThis.CONFIG = {DND5E:{currencies:Object.fromEntries(Object.entries({pp:0.1,gp:1,ep:2,sp:10,cp:100}).map(([key, conversion]) => [key, {conversion}]))}};
  const members = [actor('a', {gp:1}), actor('b', {})];
  const purse = {...actor('party', {cp:300}), type:'group'};
  const rows = planCoins(members, 'each-remove', {gp:3}, nativeStub, purse);
  assert.deepEqual(rows.slice(0,2).map(row => [row.applied.gp, row.partyPaid.gp, row.deficit.gp]), [[1,2,0],[0,1,2]]);
  assert.equal(rows[2].after.cp, 0); assert.equal(rows[2].applied.gp, 3);
  assert.equal(rows[2].requested.gp, 5); assert.equal(rows[2].deficit.gp, 2);
  assert.equal(purse.system.currency.cp, 300, 'Planning does not spend real party currency.');
  assert.equal(planCoins(members, 'each-add', {gp:1}, nativeStub, purse).length, 2, 'Additions do not touch the shared purse.');
});

test('Core-routed GM actions update only configured characters, post public cards, and cannot apply twice', async () => {
  const gm = {id:'gm', isGM:true, active:true}, player = {id:'player', isGM:false, active:true};
  const actors = new Map([actor('a', {gp:2}), actor('b', {gp:10}), actor('outside', {gp:100})].map(a => [a.id, a]));
  const messages = [], registrations = new Map(), writes = [], warnings = [];
  const channel = {on(type, handler, options) { registrations.set(type, {handler, options}); }, executeAsUser(type, data, userId) {
    assert.equal(userId, gm.id);
    return registrations.get(type).handler(data, {senderUserId:game.user.id});
  }};
  globalThis.game = {user:gm, actors, users:new Map([[gm.id, gm], [player.id, player]]), messages, dnd5e:{applications:{CurrencyManager:nativeStub}}, modules:new Map([['morelord-core', {active:true}]])};
  globalThis.MorelordCore = {users:{list:() => [gm, player]}, socket:{createChannel:() => channel}, ui:{participation:{primaryPartyGroup:() => null}, actorIdentity:({actorUuid}) => `<span class="ml-actor-identity">${actorUuid}</span>`}, rolls:{skill() {}}};
  globalThis.foundry = {utils:{randomID:() => 'test-operation-0001'}};
  globalThis.ui = {notifications:{warn:text => warnings.push(text)}};
  globalThis.Actor = {async updateDocuments(updates) {
    writes.push(updates);
    return updates.map(update => {const a = actors.get(update._id); a.system.currency = {...update['system.currency']}; return a;});
  }};
  globalThis.ChatMessage = {async create(data, options) {
    assert.equal(options.messageMode, 'public');
    const message = {id:String(messages.length), author:gm, ...data, getFlag:(_namespace, key) => message.flags['morelord-game-master'][key], async update(change) {
      if (change.content) message.content = change.content;
      if (change['flags.morelord-game-master.bulkCoins']) message.flags['morelord-game-master'].bulkCoins = change['flags.morelord-game-master.bulkCoins'];
    }};
    messages.push(message); return message;
  }};
  initializeBulkCoins(() => ['a', 'b', 'a']);
  assert.equal(registrations.get('apply').options.serialize, 'morelord-game-master.bulk-actions');
  await applyBulkCoins('each-remove', {gp:5});
  assert.equal(actors.get('a').system.currency.gp, 0); assert.equal(actors.get('b').system.currency.gp, 5);
  assert.equal(actors.get('outside').system.currency.gp, 100);
  assert.equal(messages.length, 1); assert.equal(messages[0].blind, false); assert.deepEqual(messages[0].whisper, []);
  assert.match(messages[0].content, /Deficit: 3 gp/); assert.match(messages[0].content, /Removed: 2 gp/);
  assert.match(messages[0].content, /ml-chat-card/); assert.match(messages[0].content, /ml-actor-identity/);
  assert.equal((await applyBulkCoins('each-remove', {gp:5})).alreadyApplied, true);
  assert.equal(writes.length, 1);
  const stored = new Map();
  game.settings = {
    get: (namespace, key) => stored.get(`${namespace}.${key}`),
    set: async (namespace, key, value) => { stored.set(`${namespace}.${key}`, value); }
  };
  await writeBulkUndo({kind: 'xp', labelKey: 'xp.each', operation: 'each', actors: [{id: 'a', before: 1}]});
  actors.get('a').system.currency = coins({});
  actors.get('b').system.currency = coins({});
  const none = await applyBulkCoins('each-remove', {gp: 1}, 'coin-noop-operation01');
  assert.equal(none.unchanged, true);
  assert.equal(none.notice, 'No coin balances changed.');
  assert.equal(readBulkUndo().kind, 'xp');
  assert.equal(writes.length, 1);
  assert.match(messages.at(-1).content, /Skipped 2 whose coins did not change/);
  actors.get('b').system.currency = coins({gp: 4});
  const mixed = await applyBulkCoins('each-remove', {gp: 1}, 'coin-skip-operation01');
  assert.equal(mixed.unchanged, undefined);
  assert.deepEqual(writes.at(-1).map(update => update._id), ['b']);
  assert.equal(actors.get('a').system.currency.gp, 0);
  assert.equal(actors.get('b').system.currency.gp, 3);
  assert.deepEqual(readBulkUndo().actors.map(row => row.id), ['b']);
  assert.match(messages.at(-1).content, /Skipped 1 whose coins did not change/);
  await assert.rejects(registrations.get('apply').handler({operation:'each-add', coins:{gp:99}, operationId:'test-forgery-0001'}, {senderUserId:player.id}), /eligible GM/);
  assert.equal(writes.length, 2);
  game.user = player; await assert.rejects(applyBulkCoins('each-add', {gp:1}), /Only GMs/); game.user = gm;
  Actor.updateDocuments = async () => { throw Error('Fixture update failure'); };
  await assert.rejects(applyBulkCoins('each-add', {gp:1}, 'test-operation-0002'), /Fixture/);
  assert.equal(messages.at(-1).getFlag('', 'bulkCoins').stage, 'failed');
  await assert.rejects(applyBulkCoins('each-add', {gp:1}, 'test-operation-0002'), /already started/);
  assert.equal(actors.get('b').system.currency.gp, 3);
  assert.deepEqual(warnings, []);
});

test('chat amounts express partial denominations as whole smaller coins', () => {
  globalThis.CONFIG = {DND5E:{currencies:Object.fromEntries(Object.entries({pp:0.1,gp:1,ep:2,sp:10,cp:100}).map(([key, conversion]) => [key, {conversion}]))}};
  assert.equal(formatCoins({gp:0.99}), '9 sp, 9 cp');
  assert.equal(formatCoins({gp:6.99}), '6 gp, 9 sp, 9 cp');
  assert.equal(formatCoins({gp:4, ep:2}), '4 gp, 2 ep');
});
