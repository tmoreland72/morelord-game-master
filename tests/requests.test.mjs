import test from "node:test";
import assert from "node:assert/strict";
import { ContextualSocketService } from "../../morelord-core/scripts/services/contextual-socket-service.js";
import * as users from "../../morelord-core/scripts/services/user-service.js";
import * as participation from "../../morelord-core/scripts/ui/actor-participation.js";
import * as rolls from "../../morelord-core/scripts/services/skill-roll-service.js";
import { actorIdentity } from "../../morelord-core/scripts/ui/actor-identity.js";
import { DeleriumSearchService } from "../../morelord-craftworks/scripts/acquisition/delerium-search-service.mjs";
import { AcquisitionSessionManager } from "../../morelord-craftworks/scripts/acquisition/session-manager.mjs";
import { initializeRequests,createRequest,requestHTML,recipient } from "../scripts/requests.mjs";
const ID="morelord-game-master";
class Collection extends Map {get contents(){return [...this.values()];} [Symbol.iterator](){return this.values();} filter(f){return this.contents.filter(f);} find(f){return this.contents.find(f);} some(f){return this.contents.some(f);} }
const collection=a=>new Collection(a.map(x=>[x.id,x]));

test("Core routes chat requests; all results are GM-only; racing clicks resolve once; death saves stay private; Craftworks rules are reused",async()=>{
  const events=new Map();globalThis.Hooks={on(k,f){events.set(k,[...(events.get(k)??[]),f]);return f;},off(k,f){events.set(k,(events.get(k)??[]).filter(x=>x!==f));},call(k,...args){return !(events.get(k)??[]).some(f=>f(...args)===false);}};
  const gm={id:"gm",isGM:true,active:true},assistant={id:"assistant",isGM:true,active:true},player={id:"player",isGM:false,active:true},other={id:"other",isGM:false,active:true};
  let dieTotal=4;
  let skillCalls=0,dieCalls=0,deathUpdates=0,dispatch,holdAnimations=false; const warnings=[];
  const actor={id:"actor",uuid:"Actor.actor",name:"Aster",type:"character",hasPlayerOwner:true,isOwner:true,system:{skills:{prc:{}}},testUserPermission:u=>u.isGM||u.id==="player",
    async rollSkill(config,_dialog,message){assert.equal(message.create,false);skillCalls++;return [{total:15,options:{target:config.target},dice:[{faces:20,results:[{result:15}]}]}];},
    async rollDeathSave(_config,_dialog,message){assert.equal(message.create,false);const result=[{total:12}];if(Hooks.call("dnd5e.rollDeathSave",result,{subject:this}))deathUpdates++;return result;}};
  player.character=actor;
  globalThis.game={user:gm,users:collection([gm,assistant,player,other]),actors:collection([actor]),messages:collection([]),system:{id:"dnd5e"},modules:collection([{id:"morelord-core",active:true}]),i18n:{localize:x=>x},settings:{settings:new Map([["morelord-core.ignoredUserIds",true]]),get:()=>[]},packs:[]};
  globalThis.foundry={utils:{deepClone:structuredClone,randomID:()=>crypto.randomUUID()}};
  globalThis.ui={notifications:{warn:m=>warnings.push(m)},chat:{updateMessage(){}}};
  globalThis.CONFIG={DND5E:{skills:{prc:{label:"Perception"}}}};
  globalThis.canvas={scene:{id:"scene",name:"Test scene"}};
  globalThis.Roll=class {constructor(formula){this.formula=formula;this.total=dieTotal;}async evaluate(){dieCalls++;return this;}};
  globalThis.ChatMessage={getSpeaker:({actor})=>({actor:actor.id}),async create(data){const m={id:crypto.randomUUID(),author:gm,timestamp:Date.now(),...data,getFlag(ns,key){return this.flags?.[ns]?.[key];},async setFlag(ns,key,value){this.flags[ns][key]=structuredClone(value);},async update(data){for(const [path,value] of Object.entries(data)){const parts=path.split('.');let target=this;for(const part of parts.slice(0,-1))target=target[part]??={};target[parts.at(-1)]=value;}}};if(holdAnimations && data.flags?.[ID]?.result)m._dice3danimating=true;game.messages.set(m.id,m);return m;}};
  globalThis.socketlib={registerModule:()=>({register(_name,fn){dispatch=fn;}})};
  const transport=new ContextualSocketService();transport.start();
  globalThis.MorelordCore={users:{...users,list:users.listUsers},ui:{participation,actorIdentity},rolls:{skill:rolls.rollSkill,naturalD20:rolls.extractNaturalD20},socket:transport};
  initializeRequests();
  const settle=async()=>{await new Promise(resolve=>setImmediate(resolve));await transport.runSerialized(`${ID}.rolls`,()=>{});};
  const resolve=async(m,who=player,skillId)=>{const ack=await dispatch({namespace:ID,type:"roll",data:{requestId:m.id,actorId:actor.id,skillId},context:{},senderUserId:who.id,messageId:crypto.randomUUID(),targetUserId:gm.id});await settle();return ack;};
  const check=await createRequest({actorIds:[actor.id],skill:"prc",dc:14});
  assert.match(check.content,/DC 14/);assert.doesNotMatch(requestHTML({...check.getFlag(ID,"request"),dc:null}),/DC /);
  assert.equal(recipient(actor),player);assert.deepEqual(check.whisper,[]);assert.equal(check.blind,false);
  assert.equal((await resolve(check,other)).accepted,false);
  const replies=await Promise.all([resolve(check,player),resolve(check,assistant)]);
  assert.equal(skillCalls,1);assert.equal(replies.every(r=>r.accepted),true);assert.equal(replies.some(r=>"total" in r),false);
  const result=game.messages.find(m=>m.getFlag(ID,"result")?.requestId===check.id);
  assert.deepEqual(result.whisper,["gm","assistant"]);assert.equal(result.blind,true);
  assert.deepEqual(check.getFlag(ID,"request").completed,[actor.id]);
  const checkSummary=game.messages.find(m=>m.getFlag(ID,"summary")?.requestId===check.id);
  assert.match(checkSummary.content,/Aster/);assert.match(checkSummary.content,/Pass/);assert.match(checkSummary.content,/Average: 15.00/);
  assert.equal(checkSummary.blind,true);assert.deepEqual(checkSummary.whisper,["gm","assistant"]);
  assert.doesNotMatch(check.content,/The GM has called|Results are visible/);
  const encounter=await createRequest({actorIds:[actor.id],kind:"encounter",die:8});
  player.active=false;assert.equal(recipient(actor),gm);assert.equal((await resolve(encounter,player)).accepted,false);
  assert.equal((await resolve(encounter,assistant)).accepted,true);assert.equal(dieCalls,1);
  const death=await createRequest({actorIds:[actor.id],kind:"death"});await resolve(death,gm);assert.equal(deathUpdates,0);
  assert.equal((events.get("dnd5e.rollDeathSave")??[]).length,0);
  const sessions=new AcquisitionSessionManager(),service=new DeleriumSearchService({sessions,contentPacks:{enabled:()=>[{id:"monsters-of-drakkenheim"}]}});
  game.modules.set("morelord-craftworks",{active:true,api:{sessions,deleriumSearch:service}});
  const search=await createRequest({kind:"delerium",actorIds:[actor.id],zoneId:"outer"});assert.match(search.content,/Arcana/);assert.match(search.content,/Investigation/);assert.match(search.content,/Survival/);
  assert.equal(Object.isFrozen(search.getFlag(ID,"request").searchSkills),false);
  await resolve(search,gm,"inv");
  const summary=game.messages.find(m=>m.getFlag(ID,"search")?.requestId===search.id);
  assert.equal(summary.getFlag(ID,"search").session.successes,1);assert.equal(summary.getFlag(ID,"search").session.status,"complete");
  assert.deepEqual(summary.whisper,["gm","assistant"]);
  assert.doesNotMatch(summary.content,/Average/);
  const second={...actor,id:'second',uuid:'Actor.second',name:'Bram'};game.actors.set(second.id,second);
  const group=await createRequest({kind:'skill',skill:'prc',dc:16,actorIds:[actor.id,second.id]});
  await resolve(group,gm);
  assert.equal(game.messages.some(m=>m.getFlag(ID,'summary')?.requestId===group.id),false);
  await dispatch({namespace:ID,type:'roll',data:{requestId:group.id,actorId:second.id},context:{},senderUserId:gm.id,messageId:crypto.randomUUID(),targetUserId:gm.id});
  await settle();
  const complete=game.messages.find(m=>m.getFlag(ID,'summary')?.requestId===group.id);
  assert.match(complete.content,/Average: 15.00/);assert.match(complete.content,/Bram/);assert.match(complete.content,/Fail/);
  const publicCheck=await createRequest({kind:'encounter',die:6,blind:false,actorIds:[actor.id]});await resolve(publicCheck,gm);
  const publicResult=game.messages.find(m=>m.getFlag(ID,'result')?.requestId===publicCheck.id);
  assert.equal(publicResult.blind,false);assert.deepEqual(publicResult.whisper,[]);
  CONFIG.DND5E.skills.sur={label:'Survival'};
  game.modules.set('morelord-journeys',{active:true});
  const previousGet=game.settings.get;
  game.settings.get=(ns,key)=>ns==='morelord-journeys'?{foraging:[7,11,16,21,26,31]}:previousGet(ns,key);
  const forage=await createRequest({kind:'foraging',skill:'sur',terrainIndex:0,actorIds:[actor.id]});
  assert.equal(forage.getFlag(ID,'request').dc,7);
  assert.match(forage.content,/Lush forest or meadow/);
  await resolve(forage,gm);
  const food=game.messages.find(m=>m.getFlag(ID,'summary')?.requestId===forage.id);
  assert.match(food.content,/Food found: 1 meals/);assert.doesNotMatch(food.content,/Average/);
  const actorFlags=new Map();actor.getFlag=(_ns,key)=>actorFlags.get(key);actor.setFlag=async(_ns,key,value)=>actorFlags.set(key,value);
  let tableCalls=0;
  globalThis.fromUuid=async()=>({roll:async()=>{tableCalls++;return {roll:{total:9},results:[]};},toMessage:async(_results,{messageData})=>ChatMessage.create(messageData)});
  for (let threshold=1;threshold<=4;threshold++) {
    const request=await createRequest({kind:'surge',triggerId:'wild',tableUuid:'RollTable.wild',actorIds:[actor.id]});
    assert.equal(tableCalls,0);
    const before=dieCalls;
    const replies=await Promise.all([resolve(request,gm),resolve(request,assistant)]);
    assert.equal(replies.every(r=>r.accepted && !('total' in r)),true);
    assert.equal(dieCalls,before+1);
    assert.equal(actor.getFlag(ID,'surges.wild').threshold,threshold===4?1:threshold+1);
  }
  assert.equal(tableCalls,1);

  await actor.setFlag(ID,'surges.wild',{threshold:4});
  const retry=await createRequest({kind:'surge',triggerId:'wild',tableUuid:'RollTable.wild',actorIds:[actor.id]});
  const tableLookup=globalThis.fromUuid;globalThis.fromUuid=async()=>null;
  const beforeRetry=dieCalls;
  await resolve(retry,gm);
  assert.match(warnings.at(-1),/table is missing/);
  assert.equal(actor.getFlag(ID,'surges.wild').threshold,4);
  globalThis.fromUuid=tableLookup;
  await resolve(retry,gm);
  assert.equal(dieCalls,beforeRetry+1);
  assert.equal(actor.getFlag(ID,'surges.wild').threshold,1);
  assert.equal(tableCalls,2);

  await actor.setFlag(ID,'surges.volatile-magic',{threshold:20});
  const beforeVolatile=tableCalls;
  for(const total of [4,3,2,1]) {
    dieTotal=total;
    const request=await createRequest({kind:'surge',surgeName:'Volatile Magic',triggerId:'volatile-magic',tableUuid:'RollTable.volatile',actorIds:[actor.id]});
    assert.match(request.content,/1d4/);
    await resolve(request,gm);
    const result=game.messages.find(m=>m.getFlag(ID,'result')?.requestId===request.id);
    assert.equal(result.rolls[0].formula,'1d4');
    assert.equal(result.getFlag(ID,'surge').triggered,total===1);
    assert.doesNotMatch(result.content,/Next threshold/);
    assert.equal(actor.getFlag(ID,'surges.volatile-magic').threshold,20);
    assert.equal(tableCalls,beforeVolatile+(total===1?1:0));
  }
  dieTotal=4;

  for (const config of [{kind:'skill',skill:'prc'},{kind:'death'},{kind:'foraging',terrainIndex:0},{kind:'delerium',zoneId:'outer'}]) {
    const request=await createRequest({...config,blind:false,actorIds:[actor.id]});await resolve(request,gm,config.kind==='delerium'?'inv':undefined);
    const result=game.messages.find(m=>m.getFlag(ID,'result')?.requestId===request.id);
    assert.equal(result.blind,false);assert.deepEqual(result.whisper,[]);
    const summary=game.messages.find(m=>m.getFlag(ID,'summary')?.requestId===request.id||m.getFlag(ID,'search')?.requestId===request.id);
    if(summary){assert.equal(summary.blind,false);assert.deepEqual(summary.whisper,[]);}
  }
  assert.equal(deathUpdates,1);
  holdAnimations=true;
  const immediate=await createRequest({kind:"skill",skill:"prc",actorIds:[actor.id,second.id]});
  for(const actorId of [actor.id,second.id]) {
    const ack=await dispatch({namespace:ID,type:"roll",data:{requestId:immediate.id,actorId},senderUserId:gm.id,targetUserId:gm.id});
    assert.equal(ack.accepted,true);
  }
  const animated=game.messages.filter(m=>m.getFlag(ID,"result")?.requestId===immediate.id);
  assert.equal(animated.length,2);assert.ok(animated.every(m=>m._dice3danimating));
  assert.equal(immediate.getFlag(ID,"request").completed.length,2);
  assert.equal(game.messages.some(m=>m.getFlag(ID,"summary")?.requestId===immediate.id),false);
  for(const result of animated){result._dice3danimating=false;Hooks.call("diceSoNiceRollComplete",result.id);}
  await settle();
  assert.equal(game.messages.filter(m=>m.getFlag(ID,"summary")?.requestId===immediate.id).length,1);


});
