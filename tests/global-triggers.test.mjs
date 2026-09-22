import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeGlobalTriggers,saveGlobalTriggers} from '../scripts/global-triggers.mjs';

test('global triggers migrate once, survive world changes, retain deletions, and reject player writes',async()=>{
  let file,board={saved:[{id:'local-roll'}],last:{die:8},triggers:[{id:'legacy',kind:'world-clock',enabled:true}]};
  const gm={id:'gm',isGM:true,active:true},player={id:'player',isGM:false};
  const handlers=new Map(),channel={on:(name,fn)=>handlers.set(name,fn),executeAsUser:(name,data)=>handlers.get(name)(data,{senderUserId:game.user.id})};
  globalThis.MorelordCore={socket:{createChannel:()=>channel},ui:{participation:{}},rolls:{skill(){}},users:{list:()=>[gm]}};
  globalThis.game={world:{id:'first'},user:gm,users:new Map([[gm.id,gm],[player.id,player]]),modules:new Map([['morelord-core',{active:true}]]),settings:{get:()=>board,set:async(_id,_key,value)=>{board=structuredClone(value);}}};
  globalThis.foundry={utils:{deepClone:structuredClone,getRoute:p=>p},applications:{apps:{FilePicker:{browse:async()=>({dirs:[]}),createDirectory:async()=>{},upload:async(_source,_path,value)=>{file=JSON.parse(await value.text());return {path:'morelord-game-master/triggers.json'};}}}}};
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>file ? Response.json(file) : new Response('',{status:404});
  try {
    await initializeGlobalTriggers();assert.equal(file.triggers[0].id,'legacy');assert.equal(file.triggers[0].sourceWorld,'first');
    assert.equal(file.macroMigration,2);assert.equal(file.triggers.length,5);assert.equal(file.triggers[0].enabled,true);assert.ok(file.triggers.slice(1).every(t=>!t.enabled));
    assert.equal(board.saved[0].id,'local-roll');assert.equal(board.last.die,8);assert.equal(board.legacyWorldTriggers[0].id,'legacy');
    game.world.id='second';board={saved:[{id:'second-roll'}],triggers:[{id:'second-legacy'}]};
    await initializeGlobalTriggers();assert.equal(board.triggers[0].id,'legacy');assert.equal(board.saved[0].id,'second-roll');assert.equal(board.legacyWorldTriggers[0].id,'second-legacy');
    await saveGlobalTriggers([]);assert.deepEqual(file.triggers,[]);
    await initializeGlobalTriggers();assert.deepEqual(board.triggers,[]);
    game.user=player;assert.throws(()=>saveGlobalTriggers([{id:'unauthorized'}]),/Only GMs/);assert.deepEqual(file.triggers,[]);
    game.user=gm;file={version:1,macroMigration:1,triggers:[{id:'volatile-magic',kind:'volatile',enabled:false}]};await initializeGlobalTriggers();assert.equal(file.triggers.length,5);assert.ok(file.triggers.every(t=>!t.enabled));
    file={version:2,triggers:[]};await assert.rejects(initializeGlobalTriggers,/Invalid global trigger/);
  } finally {globalThis.fetch=originalFetch;}
});
