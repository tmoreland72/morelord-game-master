import test from "node:test";
import assert from "node:assert/strict";
import {DeleriumSearchService} from "../../morelord-craftworks/scripts/acquisition/delerium-search-service.mjs";
import {AwardChatCardService} from "../../morelord-craftworks/scripts/core/award-chat-card-service.mjs";
test("Craftworks private integration forwards blind mode to reward dice and award cards without changing defaults",async()=>{
  const calls=[],source={uuid:"Item.source",name:"Delerium Chip",img:"chip.webp",system:{}},actor={uuid:"Actor.recipient",name:"Recipient",type:"character"};
  globalThis.foundry={utils:{escapeHTML:s=>s}};
  globalThis.ChatMessage={getSpeaker:()=>({}),create:async(data,options)=>{calls.push({kind:"card",options});return data;}};
  globalThis.fromUuid=async id=>id===actor.uuid ? actor : source;
  globalThis.Roll=class{async evaluate(){this.total=8;return this;}async toMessage(_data,options){calls.push({kind:"roll",options});}};
  const session={id:"search",status:"complete",messageMode:"blind",rewards:[{sourceUuid:source.uuid,name:source.name,formula:"3d6"}],results:[]};
  const service=new DeleriumSearchService({sessions:{get:()=>session},adapter:{addItemToActor:async()=>({uuid:"Actor.recipient.Item.chip"})}});
  await service.rollAndAward(session.id,actor.uuid);
  assert.equal(calls.length,2);assert.ok(calls.every(c=>c.options.messageMode==="blind"));assert.equal(session.result.items[0].quantity,8);
  await assert.rejects(()=>service.rollAndAward(session.id,actor.uuid),/already been awarded/);
  await AwardChatCardService.post({recipient:actor,items:[{document:source,quantity:1}]});assert.deepEqual(calls.at(-1).options,{});
});
