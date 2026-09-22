import assert from 'node:assert/strict';
import test from 'node:test';
import {executeLuckyFindTrigger} from '../scripts/triggers.mjs';

test('Lucky Finds fires only for a started combat, elected GM, enabled rule and world table, once', async () => {
  const gm={id:'gm',active:true,isGM:true}, other={id:'other',active:true,isGM:true};
  let count=0;
  const trigger={kind:'lucky-find',enabled:true,createdBy:'gm'};
  const table={name:'Lucky Finds'};
  globalThis.MorelordCore={socket:{createChannel(){}},ui:{participation:{}},rolls:{skill(){}},users:{list:()=>[gm,other]}};
  globalThis.game={user:gm,settings:{get:()=>({triggers:[trigger]})},tables:[table],modules:new Map([
    ['morelord-core',{active:true}],['morelord-craftworks',{api:{luckyFinds:{hasAccess:true},openLuckyFinds:async options=>{assert.equal(options.table,table);count++;}}}]
  ])};
  assert.equal(await executeLuckyFindTrigger({id:'unstarted',round:0}),false);
  game.user=other;
  assert.equal(await executeLuckyFindTrigger({id:'combat',round:2}),false);
  game.user=gm;trigger.enabled=false;
  assert.equal(await executeLuckyFindTrigger({id:'combat',round:2}),false);
  trigger.enabled=true;game.tables=[];
  assert.equal(await executeLuckyFindTrigger({id:'combat',round:2}),false);
  game.tables=[table];
  const calls=await Promise.all([executeLuckyFindTrigger({id:'combat',round:2}),executeLuckyFindTrigger({id:'combat',round:2})]);
  assert.deepEqual(calls,[true,false]);assert.equal(count,1);
  let message;
  game.modules.delete('morelord-craftworks');
  table.roll=async()=>({roll:{total:8},results:['tool']});
  table.toMessage=async(_results,options)=>message=options;
  assert.equal(await executeLuckyFindTrigger({id:'native-fallback',round:1}),true);
  assert.deepEqual(message.messageData.whisper,['gm','other']);
  assert.equal(message.messageOptions.messageMode,'gm');
});
