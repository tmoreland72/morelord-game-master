import test from 'node:test';
import assert from 'node:assert/strict';
import {isSorcererSpell,sneakTarget,matchesTriggerActor} from '../scripts/triggers.mjs';

test('Sorcerer triggers use spell provenance rather than the character or spell name',()=>{
  assert.equal(isSorcererSpell({type:'spell',system:{sourceItem:'class:sorcerer'}}),true);
  assert.equal(isSorcererSpell({type:'spell',system:{sourceItem:'race:aasimar'}}),false);
  assert.equal(isSorcererSpell({type:'feat',system:{sourceItem:'class:sorcerer'}}),false);
});
test('Sneak Attack requires a qualifying hit and advantage or an eligible adjacent ally',()=>{
  globalThis.fromUuidSync=()=>null;
  const weapon={type:'weapon',system:{properties:new Set(['fin']),type:{value:'martialM'}}};
  const actor={getActiveTokens:()=>[]};
  const target={ac:15,token:'Scene.fixture.Token.target'};
  const message={type:'attack',rolls:[{total:16,hasAdvantage:true}],system:{targets:[target]}};
  assert.equal(sneakTarget(message,actor,weapon),target);
  message.rolls[0].total=14;assert.equal(sneakTarget(message,actor,weapon),null);
  message.rolls[0].isCritical=true;assert.equal(sneakTarget(message,actor,weapon),target);
  message.rolls[0].hasDisadvantage=true;assert.equal(sneakTarget(message,actor,weapon),null);
  message.rolls[0]={total:16};assert.equal(sneakTarget(message,actor,weapon),null);
  message.rolls[0].hasAdvantage=true;weapon.system.properties.clear();assert.equal(sneakTarget(message,actor,weapon),null);
  weapon.system.type.value='martialR';assert.equal(sneakTarget(message,actor,weapon),target);
});

 test('Wild Magic threshold increases on misses and resets on a qualifying d20',async()=>{
  const {surgeOutcome}=await import('../scripts/requests.mjs');
  let threshold=1;
  for (const total of [20,19,18]) threshold=surgeOutcome(total,threshold).nextThreshold;
  assert.equal(threshold,4);
  assert.deepEqual(surgeOutcome(4,threshold),{threshold:4,triggered:true,nextThreshold:1});
  assert.equal(surgeOutcome(20,20).triggered,true);
 });

test('Class triggers match identifiers regardless of character names and reject other subclasses',()=>{
  const item=(type,identifier)=>({type,system:{identifier}});
  const actor={type:'character',name:'Anyone',items:[item('class','sorcerer'),item('subclass','wild-magic')]};
  assert.equal(matchesTriggerActor('sorcerer',actor),true);
  actor.name='Renamed character';assert.equal(matchesTriggerActor('sorcerer',actor),true);
  actor.items[1]=item('subclass','draconic-sorcery');assert.equal(matchesTriggerActor('sorcerer',actor),false);
  actor.items=[item('class','rogue'),item('feat','sneak-attack')];assert.equal(matchesTriggerActor('sneak',actor),true);
  actor.items.pop();assert.equal(matchesTriggerActor('sneak',actor),false);
});

test('A shared Sneak Attack rule tracks each rogue separately in the same combat turn',async()=>{
  const {executeTrigger}=await import('../scripts/triggers.mjs');
  const gm={id:'gm',isGM:true},messages=[];
  const activity={type:'damage',getDamageConfig:()=>({rolls:[]}),messageSources:{}};
  const weapon={id:'weapon',type:'weapon',system:{properties:new Set(['fin']),type:{value:'martialM'},damage:{base:{types:new Set(['piercing'])}}}};
  const makeActor=id=>{const items=[weapon,{type:'class',system:{identifier:'rogue'}},{type:'feat',system:{identifier:'sneak-attack',activities:[activity]}}];items.get=id=>items.find(i=>i.id===id);return {id,name:id,type:'character',items};};
  const a=makeActor('rogue-a'),b=makeActor('rogue-b');
  globalThis.game={actors:new Map([[a.id,a],[b.id,b]]),users:[gm],messages,combat:{id:'combat',started:true,round:1,turn:0}};
  globalThis.CONFIG={Dice:{DamageRoll:{build:async()=>[{total:7}]}}};
  globalThis.ChatMessage={getSpeaker:({actor})=>({actor:actor.id}),create:async data=>{messages.push({...data,getFlag:(ns,key)=>data.flags?.[ns]?.[key]});}};
  globalThis.fromUuidSync=()=>null;
  const source=(actor,id)=>({id,type:'attack',author:gm,speaker:{actor:actor.id},system:{item:{id:'weapon'},targets:[{ac:10}]},rolls:[{total:15,hasAdvantage:true}],getFlag:()=>undefined,setFlag:async()=>{}});
  const damage=(actor,id)=>{const attack=source(actor,id);return {type:'damage',rolls:[{total:7}],speaker:attack.speaker,system:attack.system,getFlag:()=>undefined,getOriginatingMessage:()=>attack};};
  const rule={id:'shared',kind:'sneak'};
  assert.equal(await executeTrigger(rule,source(a,'early')),false);
  assert.equal(await executeTrigger(rule,damage(a,'one')),true);
  assert.equal(await executeTrigger(rule,damage(a,'two')),false);
  assert.equal(await executeTrigger(rule,damage(b,'three')),true);
  assert.equal(messages.length,2);
  game.combat.turn++;
  assert.equal(await executeTrigger(rule,damage(a,'four')),true);
});

test('Wild Magic follows the attack roll without waiting for optional damage',async()=>{
  const {spellCompleted}=await import('../scripts/triggers.mjs');
  const use={completed:false,activityType:'attack',needsDamage:true};
  const usage={id:'cast',getFlag:()=>use,system:{}};
  const rolls=[];globalThis.game={messages:rolls};
  assert.equal(spellCompleted(usage),false);
  use.completed=true;assert.equal(spellCompleted(usage),false);
  const attack={type:'attack',rolls:[{total:15}],system:{targets:[{ac:10}]},getFlag:()=>null,getOriginatingMessage:()=>usage};rolls.push(attack);
  assert.equal(spellCompleted(usage),true);
  rolls.push({type:'damage',getFlag:()=>null,getOriginatingMessage:()=>usage});assert.equal(spellCompleted(usage),true);
  rolls.pop();attack.rolls[0].total=5;assert.equal(spellCompleted(usage),true);
  use.activityType='utility';use.needsDamage=false;rolls.length=0;assert.equal(spellCompleted(usage),true);
  use.activityType='save';use.needsDamage=true;assert.equal(spellCompleted(usage),true);
});
