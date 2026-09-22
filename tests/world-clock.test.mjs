import test from 'node:test';
import assert from 'node:assert/strict';
import {ID} from '../scripts/core.mjs';
import {clockInterval,createWorldClock,deferCombatTime,initializeWorldClock} from '../scripts/world-clock.mjs';

test('world clock intervals, pause, combat, calendar edits, and GM ownership', async () => {
  let now=0;
  const gm={id:'gm',active:true,isGM:true}, other={id:'other',active:true,isGM:true};
  const trigger={id:'clock',kind:'world-clock',enabled:true};
  const board={triggers:[trigger]}, advances=[];
  globalThis.MorelordCore={socket:{createChannel(){}},ui:{participation:{}},rolls:{skill(){}},users:{list:()=>[gm,other]}};
  globalThis.game={user:gm,modules:new Map([['morelord-core',{active:true}]]),settings:{get:()=>board},combats:[],paused:false,time:{worldTime:100,async advance(n){advances.push(n);this.worldTime+=n;}}};
  assert.deepEqual(clockInterval(trigger),{gameMinutes:10,realMinutes:1});
  for(const value of [0,-1,Infinity,NaN,'bad']) assert.throws(()=>clockInterval({realMinutes:value}));
  const tick=createWorldClock(()=>now);
  await tick();now=30000;await tick();
  game.paused=true;await tick();now+=600000;await tick();assert.deepEqual(advances,[]);
  game.paused=false;await tick();now+=30000;await tick();assert.deepEqual(advances,[600]);
  game.time.worldTime-=200;now+=60000;await tick();assert.equal(game.time.worldTime,1100);
  game.combats.push({started:true});await tick();now+=120000;await tick();assert.equal(advances.length,2);
  game.combats=[];await tick();now+=60000;await tick();assert.equal(advances.length,3);
  game.user=other;await tick();now+=60000;await tick();assert.equal(advances.length,3);
  gm.active=false;await tick();now+=60000;await tick();assert.equal(advances.length,4);
  trigger.gameMinutes=2;trigger.realMinutes=0.5;await tick();now+=30000;await tick();assert.equal(advances.at(-1),120);
  trigger.enabled=false;await tick();now+=60000;await tick();assert.equal(advances.length,5);
});

test('combat time is deferred persistently, rewinds correctly, and settles once on the active GM', async () => {
  const gm={id:'gm',active:true,isGM:true},other={id:'other',active:true,isGM:true};
  const trigger={id:'clock',kind:'world-clock',enabled:true},advances=[];
  globalThis.MorelordCore={socket:{createChannel(){}},ui:{participation:{}},rolls:{skill(){}},users:{list:()=>[gm,other]}};
  globalThis.game={user:gm,modules:new Map([['morelord-core',{active:true}]]),settings:{get:()=>({triggers:[trigger]})},combats:[],time:{advance:async n=>advances.push(n)}};
  let saved;
  const combat={round:0,get started(){return this.round>0;},getFlag:()=>saved};
  const update=(round,delta)=>{const changes={round},options={worldTime:{delta}};deferCombatTime(combat,changes,options);saved=changes[`flags.${ID}.clockSeconds`];combat.round=round;assert.equal(options.worldTime.delta,0);};
  update(1,0);update(2,6);update(3,6);assert.equal(saved,12);
  update(2,-6);assert.equal(saved,6);update(3,6);
  trigger.enabled=false;update(4,6);assert.equal(saved,18); // Finish an already managed combat even if the trigger is removed.
  const hooks=new Map();globalThis.Hooks={on:(name,fn)=>{const list=hooks.get(name)??[];list.push(fn);hooks.set(name,list);}};
  globalThis.ui={notifications:{error:message=>assert.fail(message)}};
  const original=globalThis.setInterval;globalThis.setInterval=()=>0;
  try {initializeWorldClock();} finally {globalThis.setInterval=original;}
  for(const fn of hooks.get('deleteCombat')) await fn(combat);
  assert.deepEqual(advances,[24]);
  game.user=other;for(const fn of hooks.get('deleteCombat')) await fn(combat);assert.deepEqual(advances,[24]);
  game.user=gm;update(0,-24);assert.equal(saved,null);
  for(const fn of hooks.get('deleteCombat')) await fn(combat);assert.deepEqual(advances,[24]);
});
