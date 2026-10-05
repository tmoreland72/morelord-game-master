import test from 'node:test';
import assert from 'node:assert/strict';
import {criticalAttackTable,criticalResultCard,executeTrigger,initializeTriggers} from '../scripts/triggers.mjs';
import {CRITICAL_TABLES} from '../scripts/trigger-catalog.mjs';

test('critical rules choose native attack categories, preserve permissions/privacy, and resolve once',async()=>{
  const flags={},item={id:'weapon'},actor={id:'actor',type:'npc',items:new Map([[item.id,item]]),testUserPermission:()=>false};
  const message={id:'attack',type:'attack',speaker:{actor:actor.id},author:{isGM:true},system:{item:{id:item.id}},
    rolls:[{isCritical:true,isFumble:false,data:{roll:{attack:{classification:'weapon',type:'melee'}}}}],
    getFlag:(_id,key)=>flags[key],setFlag:async(_id,key,value)=>{flags[key]=value;}};
  const roll=message.rolls[0];
  for(const [classification,type,category] of [['weapon','melee','melee'],['weapon','ranged','ranged'],['spell','melee','magic'],['spell','ranged','magic'],['unarmed','melee','melee']]){
    roll.data.roll.attack={classification,type};
    for(const kind of Object.keys(CRITICAL_TABLES)){
      roll.isCritical=kind==='critical-hit';roll.isFumble=kind==='critical-fumble';
      assert.ok(criticalAttackTable(kind,message).endsWith(CRITICAL_TABLES[kind][category]));
    }
  }
  roll.isCritical=false;roll.isFumble=false;roll.dice=[{faces:20,results:[{result:20,discarded:true}]}];
  assert.equal(criticalAttackTable('critical-hit',message),null);
  roll.isCritical=true;message.type='damage';assert.equal(criticalAttackTable('critical-hit',message),null);message.type='attack';
  delete roll.data;
  message.getAssociatedActivity=()=>({attack:{type:{classification:'weapon',value:'melee'}}});
  roll.options={attackMode:'thrown'};
  assert.ok(criticalAttackTable('critical-hit',message).endsWith(CRITICAL_TABLES['critical-hit'].ranged));
  roll.options={};message.system.mode='ranged';
  assert.ok(criticalAttackTable('critical-hit',message).endsWith(CRITICAL_TABLES['critical-hit'].ranged));
  message.getAssociatedActivity=()=>({attack:{type:{classification:'spell',value:'melee'}}});
  assert.ok(criticalAttackTable('critical-hit',message).endsWith(CRITICAL_TABLES['critical-hit'].magic));
  delete message.getAssociatedActivity;delete message.system.mode;
  roll.data={roll:{}};
  roll.data.roll.attack={classification:'weapon',type:'ranged',mode:'thrown'};
  const posts=[];globalThis.game={actors:new Map([[actor.id,actor]]),users:[{id:'gm',isGM:true},{id:'assistant',isGM:true},{id:'player',isGM:false}]};
  globalThis.ChatMessage={getSpeaker:()=>message.speaker};
  globalThis.fromUuid=async uuid=>({roll:async()=>({roll:{total:3},results:[{text:'result'}]}),toMessage:async(results,options)=>posts.push({uuid,results,options})});
  const trigger={id:'critical-hit',kind:'critical-hit'};
  message.author.isGM=false;assert.equal(await executeTrigger(trigger,message),false);message.author.isGM=true;
  assert.equal(await executeTrigger(trigger,message),true);assert.equal(await executeTrigger(trigger,message),false);
  assert.equal(posts.length,1);assert.ok(posts[0].uuid.endsWith(CRITICAL_TABLES['critical-hit'].ranged));
  assert.equal(posts[0].options.messageData.blind,true);assert.deepEqual(posts[0].options.messageData.whisper,['gm','assistant']);
  assert.equal(posts[0].options.messageOptions.messageMode,'blind');assert.equal(posts[0].options.messageData.flags['morelord-game-master'].triggerResult.sourceId,message.id);
  assert.deepEqual(flags,{triggerHandled:['critical-hit']});
});

test('critical cards explain the trigger, escape names, and preserve native table dice/results',()=>{
  globalThis.game={modules:new Map([['morelord-core',{active:true}]])};
  globalThis.MorelordCore={socket:{createChannel(){}},rolls:{skill(){}},ui:{participation:{},actorIdentity:()=>'<span class="ml-actor-identity">Attacker</span>'}};
  const native='<div class="table-draw"><div class="dice-roll">1d10</div><ul class="table-results"><li>Disarm</li></ul></div>';
  const context={attackType:'ranged',itemName:'Bow <script>',attackDie:20,actor:{name:'Attacker'}};
  const hit=criticalResultCard('critical-hit',context,native),fumble=criticalResultCard('critical-fumble',{...context,attackDie:1},native);
  assert.ok(hit.includes('data-tone="success"')&&hit.includes('<h3>Critical Hit</h3>'));
  assert.ok(hit.includes('Ranged attack · Attack die: 20')&&hit.includes('Bow &lt;script&gt;'));
  assert.ok(fumble.includes('data-tone="danger"')&&fumble.includes('<h3>Critical Fumble</h3>'));
  assert.ok(hit.includes(native)&&fumble.includes(native));
  const hooks=new Map();globalThis.Hooks={on:(name,fn)=>hooks.set(name,fn)};initializeTriggers();
  let updated;const message={content:native,getFlag:(_id,key)=>key==='triggerResult'?{kind:'critical-hit'}:context,updateSource:data=>updated=data};
  hooks.get('preCreateChatMessage')(message);assert.equal(updated.content,hit);
  updated=null;message.getFlag=()=>null;hooks.get('preCreateChatMessage')(message);assert.equal(updated,null);
});
