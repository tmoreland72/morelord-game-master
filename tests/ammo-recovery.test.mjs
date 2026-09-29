import test from 'node:test';
import assert from 'node:assert/strict';
import {recordAmmoSpent,recoverCombatAmmo,initializeAmmoTracking} from '../scripts/ammo-recovery.mjs';
const ID='morelord-game-master';
test('ammo receipts track consumed native attacks, round down by stack, persist, and recover only once',async()=>{
  const gm={id:'gm',isGM:true,active:true},player={id:'player',isGM:false},hooks=new Map(),messages=[];
  messages.get=id=>messages.find(m=>m.id===id);
  const data={_id:'arrows',name:'Arrows',type:'consumable',system:{type:{value:'ammo'},quantity:10,properties:[]}};
  const item={id:'arrows',name:'Arrows',type:'consumable',system:structuredClone(data.system),returned:{},toObject:()=>structuredClone(data),getFlag(_ns,key){return this.returned[key];},async update(changes){this.system.quantity=changes['system.quantity'];for(const [k,v]of Object.entries(changes))if(k.startsWith('flags.'))this.returned[k.slice(`flags.${ID}.`.length)]=v;}};
  const actor={uuid:'Actor.a',id:'a',type:'character',name:'Archer',items:new Map([['arrows',item]]),testUserPermission:u=>u.id==='player',async createEmbeddedDocuments(_type,[value],options){assert.equal(options.keepId,true);item.system.quantity=value.system.quantity;item.returned['ammoReturned.combat']=value.flags[ID].ammoReturned.combat;this.items.set(value._id,item);return [item];}};
  const combat={id:'combat',round:1,started:true,combatants:[{actor}]},rule={kind:'ammo-recovery',enabled:true};
  let handler,sent=0,posted=0;
  globalThis.MorelordCore={socket:{createChannel:()=>({on(_name,fn){handler=fn;},executeAsUser(_name,args){sent++;const user=game.user;game.user=gm;return handler(args,{senderUserId:user.id}).finally(()=>{game.user=user;});}})},ui:{participation:{},actorIdentity:()=>'<span>Archer</span>'},rolls:{skill(){}},users:{list:()=>[gm,player]}};
  globalThis.game={user:gm,users:new Map([[gm.id,gm],[player.id,player]]),modules:new Map([['morelord-core',{active:true}]]),settings:{get:()=>({triggers:[rule]})},messages,combats:new Map([['combat',combat]]),combat};
  globalThis.ChatMessage={getSpeakerActor:()=>actor,create:async()=>{posted++;}};
  globalThis.foundry={utils:{deepClone:structuredClone}};
  globalThis.fromUuid=async uuid=>uuid===actor.uuid?actor:null;
  globalThis.Hooks={on:(name,fn)=>hooks.set(name,fn)};
  globalThis.ui={notifications:{error:error=>{throw Error(error);}}};
  initializeAmmoTracking();
  const message=id=>({id,type:'attack',author:player,speaker:{actor:'a'},rolls:[{}],system:{item:{id:'bow'},ammunition:'arrows'},flags:{},getFlag(_ns,key){return this.flags[key];},async setFlag(_ns,key,v){this.flags[key]=v;}});
  for(let i=0;i<5;i++){
    const m=message('shot'+i);messages.push(m);await recordAmmoSpent({messageId:m.id,combatId:combat.id},{senderUserId:player.id});await recordAmmoSpent({messageId:m.id,combatId:combat.id},{senderUserId:player.id});
  }
  item.system.quantity=5;
  assert.equal(await recoverCombatAmmo(combat),true);assert.equal(item.system.quantity,7);assert.equal(posted,1);
  assert.equal(await recoverCombatAmmo(combat),false);assert.equal(item.system.quantity,7);
  rule.enabled=false;assert.equal(await recoverCombatAmmo({...combat,id:'other'}),false);rule.enabled=true;
  assert.equal(await recoverCombatAmmo({...combat,round:0}),false);
  game.user=player;assert.equal(await recoverCombatAmmo(combat),false);game.user=gm;
  // An exhausted stack is recreated from native deletion data, then protected against duplicate recovery.
  actor.items.clear();item.returned={};await recoverCombatAmmo(combat);assert.equal(item.system.quantity,2);await recoverCombatAmmo(combat);assert.equal(item.system.quantity,2);
  // Rolling client reports only after the actual decrement. Merely rolling/selecting ammunition is insufficient.
  game.user=player;const m=message('tracked');messages.push(m);const rolls=[{}],subject={actor,item:{id:'bow',isOwner:true}};
  hooks.get('dnd5e.rollAttackV2')(rolls,{subject,ammoUpdate:{id:'arrows',quantity:1}});
  hooks.get('dnd5e.postRollAttack')(rolls);assert.equal(sent,0);
  hooks.get('dnd5e.rollAttackV2')(rolls,{subject,ammoUpdate:{id:'arrows',quantity:1}});item.system.quantity=1;
  hooks.get('dnd5e.postRollAttack')(rolls);await new Promise(r=>setTimeout(r,0));assert.equal(sent,1);assert.equal(m.flags.ammoSpent.combatId,'combat');
});
