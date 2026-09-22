import test from 'node:test';
import assert from 'node:assert/strict';
import {createTriggerRuntime} from '../scripts/trigger-macros.mjs';
import {migrateTriggerMacros,SURGE_TABLES,defaultTriggers} from '../scripts/trigger-catalog.mjs';

test('migration preserves IDs, pause state, and custom tables while replacing the two known personal references',()=>{
  const rows=[{id:'original',kind:'sorcerer',enabled:true,tableUuid:SURGE_TABLES.sorcerer.replace('morelord-game-master.roll-tables','morelord-compendium.tables-1')}, {id:'custom',kind:'sorcerer',enabled:false,tableUuid:'RollTable.mine'}];
  const next=migrateTriggerMacros(rows);
  assert.equal(next[0].id,'original');assert.equal(next[0].tableUuid,SURGE_TABLES.sorcerer);
  assert.equal(next[1].enabled,false);assert.equal(next[1].tableUuid,'RollTable.mine');
  assert.equal(next.find(t=>t.kind==='volatile').enabled,false);
  assert.equal(new Set(next.map(t=>t.kind)).size,5);assert.ok(next.slice(2).every(t=>!t.enabled));
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

test('fresh installs get every managed trigger stopped with stable portable macro bindings',()=>{const rows=migrateTriggerMacros([]);assert.equal(rows.length,5);assert.deepEqual(rows,defaultTriggers());assert.ok(rows.every(t=>t.enabled===false&&t.macroUuid.startsWith('Compendium.morelord-game-master.macros.')));assert.deepEqual(migrateTriggerMacros(rows),rows);});

test('remove only the accidental unconfigured default item template',()=>{
  const placeholder={id:'item',kind:'item',actorName:'Configured character',enabled:false};
  const configured={...placeholder,actorId:'actor',itemId:'feature',tableUuid:'RollTable.custom',enabled:true};
  const custom={...placeholder,id:'custom-item'};
  assert.deepEqual(migrateTriggerMacros([placeholder],{includeDefaults:false}),[]);
  const kept=migrateTriggerMacros([configured,custom],{includeDefaults:false});
  assert.equal(kept.length,2);assert.equal(kept[0].enabled,true);assert.equal(kept[0].tableUuid,'RollTable.custom');
  assert.ok(defaultTriggers().every(t=>t.kind!=='item'));
});
