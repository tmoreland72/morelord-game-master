import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {createTriggerRuntime} from '../scripts/trigger-macros.mjs';
import {migrateTriggerMacros,SURGE_TABLES,defaultTriggers} from '../scripts/trigger-catalog.mjs';
import {installTrigger} from '../scripts/triggers.mjs';
import {replacePastedTriggerMacros} from '../scripts/trigger-macros.mjs';

test('migration preserves IDs, pause state, and custom tables while replacing the two known personal references',()=>{
  const rows=[{id:'original',kind:'sorcerer',enabled:true,tableUuid:SURGE_TABLES.sorcerer.replace('morelord-game-master.roll-tables','morelord-compendium.tables-1')}, {id:'custom',kind:'sorcerer',enabled:false,tableUuid:'RollTable.mine'}];
  const next=migrateTriggerMacros(rows);
  assert.equal(next[0].id,'original');assert.equal(next[0].tableUuid,SURGE_TABLES.sorcerer);
  assert.equal(next[1].enabled,false);assert.equal(next[1].tableUuid,'RollTable.mine');
  assert.equal(next.find(t=>t.kind==='volatile').enabled,false);
  assert.equal(new Set(next.map(t=>t.kind)).size,9);assert.ok(next.slice(2).every(t=>!t.enabled));
  assert.deepEqual(migrateTriggerMacros(next),next);
  assert.deepEqual(migrateTriggerMacros([],{includeDefaults:false}),[]);
});

test('runtime installs once, serializes actions, removes hooks/timers on stop, and rejects missing macros',async()=>{
  const trigger={id:'one',kind:'sneak',enabled:true},board={triggers:[trigger]},hooks=new Map();let serial=0,installs=0,calls=0,cleared=0;
  globalThis.game={user:{isGM:true},settings:{get:()=>board}};
  const runtime=createTriggerRuntime({hooks:{on(name,fn){const id=++serial;hooks.set(id,{name,fn});return id;},off(name,id){assert.equal(hooks.get(id).name,name);hooks.delete(id);}},interval:()=>1,clear:()=>cleared++,onError:()=>{},resolve:async()=>({documentName:'Macro',type:'script',canExecute:true,async execute({runtime:r}){installs++;r.Hooks.on('event',()=>r.enqueue(async()=>{calls++;}));r.setInterval(()=>{},1000);return true;}})});
  await Promise.all([runtime.sync(),runtime.sync()]);assert.equal(installs,1);assert.equal(hooks.size,1);
  const callback=[...hooks.values()][0].fn;callback();callback();await runtime.idle();assert.equal(calls,2);
  trigger.enabled=false;callback();await runtime.sync();assert.equal(hooks.size,0);assert.equal(cleared,1);assert.equal(calls,2);
  trigger.enabled=true;await runtime.sync();assert.equal(installs,2);runtime.stopAll();assert.equal(hooks.size,0);
  const unavailable=createTriggerRuntime({resolve:async()=>null,hooks:{},onError:()=>{}});await unavailable.sync();assert.equal(unavailable.status('one'),'Unavailable');
  trigger.enabled=false;await unavailable.sync();assert.equal(unavailable.status('one'),'Stopped');
});

test('fresh installs get every managed trigger stopped with stable portable macro bindings',()=>{const rows=migrateTriggerMacros([]);assert.equal(rows.length,9);assert.deepEqual(rows,defaultTriggers());assert.ok(rows.every(t=>t.enabled===false&&t.macroUuid.startsWith('Compendium.morelord-game-master.macros.')));assert.deepEqual(migrateTriggerMacros(rows),rows);});

test('pack macros call the module API instead of pasting trigger source', async () => {
  const dir = new URL('../pack-source/macros/', import.meta.url);
  const files = (await readdir(dir)).filter(name => name.endsWith('.json'));
  assert.ok(files.length >= 11);
  for (const name of files) {
    const doc = JSON.parse(await readFile(new URL(name, dir), 'utf8'));
    assert.ok(doc.command.length < 700, name);
    assert.equal(doc.command.includes('function executeTrigger'), false, name);
    assert.equal(doc.command.includes('function nearbyAlly'), false, name);
    if (doc.name === 'Roll of Fate') assert.match(doc.command, /api\.rollOfFate\(/);
    else {
      assert.match(doc.command, /api\.installTrigger\(/);
      assert.equal(doc.flags['morelord-game-master'].schemaVersion, 2);
    }
  }
});

test('installTrigger registers module listeners for chat, combat, and the world clock', () => {
  const recorded = [];
  const Hooks = {on(name, fn) { recorded.push(name); return fn; }};
  const enqueue = fn => fn();
  globalThis.ui = {notifications:{error(){}}};
  globalThis.foundry = {utils:{getProperty:(object, path) => path.split('.').reduce((value, key) => value?.[key], object)}};
  globalThis.game = {
    user:{id:'gm', isGM:true},
    settings:{get:() => ({triggers:[]})},
    paused:true,
    combats:[],
    actors:{get:() => undefined},
    modules:{get:id => id === 'morelord-core' ? {active:true} : null},
    time:{advance(){}}
  };
  globalThis.MorelordCore = {socket:{createChannel(){}}, ui:{participation:{}}, rolls:{skill(){}}, users:{list:() => [{id:'gm', active:true, isGM:true}]}};
  const runtime = {trigger:{id:'sneak', kind:'sneak', createdBy:'gm'}, Hooks, enqueue, setInterval(fn) { recorded.push('timer'); return fn; }};
  assert.equal(installTrigger('sneak', runtime), true);
  assert.deepEqual(recorded, ['createChatMessage', 'updateChatMessage']);
  recorded.length = 0;
  assert.equal(installTrigger('ammo-recovery', runtime), true);
  assert.equal(installTrigger('lucky-find', runtime), true);
  assert.deepEqual(recorded, ['deleteCombat', 'deleteCombat']);
  recorded.length = 0;
  assert.equal(installTrigger('world-clock', runtime), true);
  assert.ok(recorded.includes('pauseGame') && recorded.includes('preUpdateCombat') && recorded.includes('timer'));
  assert.throws(() => installTrigger('missing', runtime), /Unknown trigger kind/);
});

test('pasted compendium macros are replaced and current wrappers are left alone', async () => {
  const updates = [];
  const configured = [];
  const pasted = {id:'SneakAttack00001', name:'Sneak Attack', command:'function nearbyAlly() {}', getFlag:() => 'sneak', update: async data => updates.push(data)};
  const current = {id:'WildMagicSurge01', name:'Wild Magic Surge', command:"return api.installTrigger(\"sorcerer\", scope.runtime);\n", getFlag:() => 'sorcerer', update: async () => { throw new Error('current wrapper was rewritten'); }};
  globalThis.ui = {notifications:{error(){}}};
  globalThis.game = {user:{isGM:true}, packs:{get:() => ({
    locked: true,
    configure: async config => configured.push(config.locked),
    getDocuments: async () => [pasted, current]
  })}};
  assert.equal(await replacePastedTriggerMacros(), true);
  assert.deepEqual(configured, [false, true]);
  assert.equal(updates.length, 1);
  assert.match(updates[0].command, /api\.installTrigger\("sneak"/);
  assert.equal(updates[0]['flags.morelord-game-master.schemaVersion'], 2);
  game.user.isGM = false;
  assert.equal(await replacePastedTriggerMacros(), false);
});

test('remove only the accidental unconfigured default item template',()=>{
  const placeholder={id:'item',kind:'item',actorName:'Configured character',enabled:false};
  const configured={...placeholder,actorId:'actor',itemId:'feature',tableUuid:'RollTable.custom',enabled:true};
  const custom={...placeholder,id:'custom-item'};
  assert.deepEqual(migrateTriggerMacros([placeholder],{includeDefaults:false}),[]);
  const kept=migrateTriggerMacros([configured,custom],{includeDefaults:false});
  assert.equal(kept.length,2);assert.equal(kept[0].enabled,true);assert.equal(kept[0].tableUuid,'RollTable.custom');
  assert.ok(defaultTriggers().every(t=>t.kind!=='item'));
});
