import test from 'node:test';
import assert from 'node:assert/strict';
import {createTriggerRuntime} from '../scripts/trigger-macros.mjs';
import {migrateTriggerMacros,SURGE_TABLES} from '../scripts/trigger-catalog.mjs';

test('migration preserves IDs, pause state, and custom tables while replacing the two known personal references',()=>{
  const rows=[{id:'original',kind:'sorcerer',enabled:true,tableUuid:SURGE_TABLES.sorcerer.replace('morelord-game-master.roll-tables','morelord-compendium.tables-1')}, {id:'custom',kind:'sorcerer',enabled:false,tableUuid:'RollTable.mine'}];
  const next=migrateTriggerMacros(rows);
  assert.equal(next[0].id,'original');assert.equal(next[0].tableUuid,SURGE_TABLES.sorcerer);
  assert.equal(next[1].enabled,false);assert.equal(next[1].tableUuid,'RollTable.mine');
  assert.equal(next[2].kind,'volatile');assert.equal(next[2].enabled,false);
  assert.deepEqual(migrateTriggerMacros(next),next);
  assert.deepEqual(migrateTriggerMacros([],{includeVolatile:false}),[]);
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
