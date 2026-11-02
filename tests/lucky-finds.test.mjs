import assert from 'node:assert/strict';
import test from 'node:test';
import {executeLuckyFindTrigger} from '../scripts/triggers.mjs';

test('Lucky Finds rolls the world table once and does not call Craftworks', async () => {
  const gm={id:'gm',active:true,isGM:true}, other={id:'other',active:true,isGM:true};
  let opened=0;
  const trigger={kind:'lucky-find',enabled:true,createdBy:'gm'};
  let message;
  const table={
    name:'Lucky Finds',
    roll: async()=>({roll:{total:8},results:['tool']}),
    toMessage: async(_results,options)=>message=options
  };
  globalThis.MorelordCore={socket:{createChannel(){}},ui:{participation:{}},rolls:{skill(){}},users:{list:()=>[gm,other]}};
  globalThis.game={user:gm,settings:{get:()=>({triggers:[trigger]})},tables:[table],modules:new Map([
    ['morelord-core',{active:true}],
    ['morelord-craftworks',{api:{luckyFinds:{hasAccess:true},openLuckyFinds:async()=>{opened++;}}}]
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
  assert.deepEqual(calls,[true,false]);
  assert.equal(opened,0);
  assert.deepEqual(message.messageData.whisper,['gm','other']);
  assert.equal(message.messageOptions.messageMode,'gm');
  assert.equal(await executeLuckyFindTrigger({id:'native-fallback',round:1}),true);
  assert.equal(opened,0);
});
