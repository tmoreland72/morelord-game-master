import {assert} from '../../../morelord-core/scripts/testing/in-game.js';
import {ID} from '../core.mjs';
import {CRITICAL_TABLES,defaultTriggers} from '../trigger-catalog.mjs';
import {criticalAttackTable} from '../triggers.mjs';
import {initializeTriggerMacros} from '../trigger-macros.mjs';
import {waitForDiceAnimation} from '../../../morelord-core/scripts/services/dice-animation.js';

export const criticalTriggersCheck={id:'game-master.critical-hit-and-fumble-tables',async run(){
  assert(game.world.id==='dev1' && game.user.isGM,'Dev1 GM required.');
  const board=foundry.utils.deepClone(game.settings.get(ID,'board'));
  let actor,runtime;
  try {
    const rules=defaultTriggers().filter(t=>CRITICAL_TABLES[t.kind]).map(t=>({...t,enabled:true,createdBy:game.user.id}));
    await game.settings.set(ID,'board',{...board,triggers:rules});
    runtime=await initializeTriggerMacros();await runtime.sync();
    assert(rules.every(t=>runtime.status(t.id)==='Running'),'Both installed critical macros must run.');
    actor=await Actor.create({name:'Critical trigger regression',type:'npc'});
    for(const kind of Object.keys(CRITICAL_TABLES)) for(const category of ['melee','ranged','magic']) {
      const table=await fromUuid(`Compendium.${ID}.roll-tables.RollTable.${CRITICAL_TABLES[kind][category]}`);
      assert(table?.results.size===10,'Every copied table retains all ten results.');
      const data={roll:{attack:{classification:category==='magic'?'spell':'weapon',type:category==='melee'?'melee':'ranged'}}};
      const activityId=foundry.utils.randomID();
      const [item]=await actor.createEmbeddedDocuments('Item',[{name:'Test '+category,type:category==='magic'?'spell':'weapon',system:{activities:{[activityId]:{_id:activityId,type:'attack',attack:{type:{classification:data.roll.attack.classification,value:data.roll.attack.type}}}}}}]);
      assert(item,'Native '+category+' item creation returned no document.');
      const activity=item.system.activities.find(a=>a.type==='attack');
      const roll=await new CONFIG.Dice.D20Roll('1d20',data,{criticalSuccess:20,criticalFailure:1}).evaluate({[kind==='critical-hit'?'maximize':'minimize']:true,allowInteractive:false});
      const source=await ChatMessage.create({type:'attack',speaker:ChatMessage.getSpeaker({actor}),whisper:[game.user.id],rolls:[roll],system:activity.messageSources});
      await runtime.idle();
      const results=()=>game.messages.filter(m=>m.getFlag(ID,'triggerResult')?.sourceId===source.id);
      assert(results().length===1,'A critical attack must produce exactly one table card.');
      assert(criticalAttackTable(kind,source)?.endsWith('.'+table.id),'Native attack data selects the expected table.');
      const result=results()[0];
      assert(result.blind && result.whisper.length && result.whisper.every(id=>game.users.get(id)?.isGM),'Table results stay GM/Assistant-only.');
      assert(result.getFlag(ID,'triggerResult').kind===kind,'The opposite trigger must not run.');
      await waitForDiceAnimation(source);await waitForDiceAnimation(result);
      const html=await result.renderHTML();
      assert(html.querySelector('.ml-callout h3')?.textContent===(kind==='critical-hit'?'Critical Hit':'Critical Fumble'),'Card names the critical trigger.');
      assert(html.querySelector('.ml-actor-identity')?.textContent===actor.name,'Card uses Core attacker identity.');
      assert(html.textContent.includes(item.name) && html.textContent.includes('Attack die: '+(kind==='critical-hit'?20:1)),'Card explains the attack and kept die.');
      assert(html.querySelector('.table-results') && html.querySelector('.dice-roll'),'Native table result and dice remain intact.');
      if(category==='melee' && globalThis.morelordCriticalCardPreviews)globalThis.morelordCriticalCardPreviews.push(html.outerHTML);
      Hooks.callAll('createChatMessage',source);await runtime.idle();
      assert(results().length===1,'Repeated delivery cannot duplicate the result.');
    }
    await game.settings.set(ID,'board',{...board,triggers:rules.map(t=>({...t,enabled:false}))});await runtime.sync();
    assert(rules.every(t=>runtime.status(t.id)==='Stopped'),'Pause removes both listeners.');
  } finally {
    if(actor){const ids=game.messages.filter(m=>m.speaker?.actor===actor.id).map(m=>m.id);if(ids.length)await ChatMessage.deleteDocuments(ids);await actor.delete();}
    await game.settings.set(ID,'board',board);await initializeTriggerMacros();
  }
}};
