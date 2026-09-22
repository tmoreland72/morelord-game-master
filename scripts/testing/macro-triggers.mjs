import {assert} from '../../../morelord-core/scripts/testing/in-game.js';
import {initializeTriggerMacros} from '../trigger-macros.mjs';
import {rollRequest} from '../requests.mjs';
const ID='morelord-game-master';
const wait=async (read,description="macro trigger workflow")=>{const until=Date.now()+20000;while(Date.now()<until){const result=read();if(result)return result;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out waiting for '+description);};

export const macroTriggerCheck={id:'game-master.compiled-macro-lifecycle-and-independent-surges',async run(){
  assert(game.user.isGM,'GM required.');
  const board=foundry.utils.deepClone(game.settings.get(ID,'board'));
  const fixtures=[], messagesBefore=new Set(game.messages.map(m=>m.id));
  let actor, source;
  try {
    const tableData=await foundry.utils.fetchJsonWithTimeout(`modules/${ID}/pack-source/roll-tables/JtRByu566t45mzkG.json`);
    delete tableData._id;tableData.name='Macro regression table';
    const table=await RollTable.create(tableData);fixtures.push(table);
    const rules=[];
    for(const kind of ['sorcerer','volatile']) {
      const data=await foundry.utils.fetchJsonWithTimeout(`modules/${ID}/pack-source/macros/${kind}.json`);
      delete data._id;data.name=`Macro regression ${kind}`;
      const macro=await Macro.create(data);fixtures.push(macro);
      rules.push({id:`macro-test-${kind}`,name:data.name,kind,enabled:true,macroUuid:macro.uuid,tableUuid:table.uuid,createdBy:game.user.id});
    }
    actor=await Actor.create({name:'Macro trigger regression',type:'character',items:[
      {name:'Sorcerer',type:'class',system:{identifier:'sorcerer',levels:1}},
      {name:'Wild Magic',type:'subclass',system:{identifier:'wild-magic',classIdentifier:'sorcerer'}},
      {name:'Test spell',type:'spell',system:{level:0,sourceItem:'class:sorcerer'}}
    ]});fixtures.push(actor);
    await game.settings.set(ID,'board',{...board,triggers:rules});
    const runtime=await initializeTriggerMacros();await runtime.sync();await runtime.sync();
    assert(rules.every(t=>runtime.status(t.id)==='Running'),rules.map(t=>runtime.error(t.id)||runtime.status(t.id)).join('; '));
    const spell=actor.items.find(item=>item.type==='spell');
    source=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:'Macro trigger regression',whisper:[game.user.id],flags:{[ID]:{triggerUse:{actorId:actor.id,itemId:spell.id,activityType:'utility',completed:true}}}});
    const requests=()=>game.messages.filter(m=>m.getFlag(ID,'request')?.sourceId===source.id);
    await wait(()=>requests().length===2,'two independent d20 requests');
    await runtime.idle();assert(requests().length===2,'Both surge macros must run once, independently.');
    assert(requests().every(m=>!m.blind&&!m.whisper.length),'Surge requests must be public.');
    for(const rule of rules) await actor.setFlag(ID,`surges.${rule.id}`,{threshold:20});
    for(const request of requests()) await rollRequest(request.id,actor.id);
    await wait(()=>requests().every(m=>m.getFlag(ID,'request')?.completed?.includes(actor.id)),'completed d20 responses');
    await wait(()=>rules.every(t=>actor.getFlag(ID,`surges.${t.id}`)?.threshold===1),'independent table results and counter resets');
    for(const rule of rules) assert(actor.getFlag(ID,`surges.${rule.id}`).threshold===1,'Each surge counter resets independently.');
    const results=game.messages.filter(m=>m.getFlag(ID,'surgeTable') && !messagesBefore.has(m.id));
    assert(results.length===2 && results.every(m=>m.blind&&m.whisper.length),'Two table results must remain blind and private.');
    await spell.update({'system.sourceItem':'race:aasimar'});
    const racial=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:'Volatile non-class spell regression',whisper:[game.user.id],flags:{[ID]:{triggerUse:{actorId:actor.id,itemId:spell.id,activityType:'utility',completed:true}}}});
    await wait(()=>game.messages.some(m=>m.getFlag(ID,'request')?.sourceId===racial.id),'racial-spell Volatile Magic request');await runtime.idle();
    const racialRequests=game.messages.filter(m=>m.getFlag(ID,'request')?.sourceId===racial.id);
    assert(racialRequests.length===1&&racialRequests[0].getFlag(ID,'request').triggerId==='macro-test-volatile','Only Volatile Magic should respond to a racial spell.');
    await game.settings.set(ID,'board',{...board,triggers:rules.map(t=>({...t,enabled:false}))});
    await runtime.sync();assert(rules.every(t=>runtime.status(t.id)==='Stopped'),'Stopped triggers retain listeners.');
    const count=requests().length;Hooks.callAll('updateChatMessage',source,{flags:{[ID]:{triggerUse:{completed:true}}}});await runtime.idle();assert(requests().length===count,'Stopped macro fired.');
    game.modules.get(ID).api.toggle(true);document.querySelector('#mlgm-tab-triggers').click();
    assert(document.querySelector('[data-action="new-trigger"]').disabled,'New Trigger must be disabled.');
    assert(!document.querySelector('[data-action="trigger-edit"], [data-action="trigger-remove"]'),'Edit/Delete must be absent.');
  } finally {
    // Delete only messages tied to the disposable actor/request chain.
    const requestIds=game.messages.filter(m=>m.getFlag(ID,'request')?.actorIds?.includes(actor?.id)).map(m=>m.id);
    const resultIds=game.messages.filter(m=>requestIds.includes(m.getFlag(ID,'result')?.requestId)).map(m=>m.id);
    const ids=game.messages.filter(m=>!messagesBefore.has(m.id)&&(m.speaker?.actor===actor?.id||requestIds.includes(m.id)||requestIds.includes(m.getFlag(ID,'summary')?.requestId)||resultIds.includes(m.getFlag(ID,'surgeTable')))).map(m=>m.id);
    if(ids.length)await ChatMessage.deleteDocuments(ids);
    await game.settings.set(ID,'board',board);await initializeTriggerMacros();
    for(const fixture of fixtures.reverse())await fixture.delete();
  }
}};

export const fateCheck={id:'game-master.selected-token-fate',async run(){
  assert(canvas.ready&&canvas.scene,'An active scene is required.');
  const previous=canvas.tokens.controlled.map(t=>t.id),actors=[],tokens=[],messages=[];
  const before=new Set(game.messages.map(m=>m.id));
  try {
    const {rollOfFate}=await import('../roll-of-fate.mjs');
    canvas.tokens.releaseAll();
    assert(await rollOfFate()===null,'No selection must not post a card.');
    for(const name of ['Fate A','Fate B']) {
      const actor=await Actor.create({name,type:'character'});actors.push(actor);
      const [token]=await canvas.scene.createEmbeddedDocuments('Token',[{name,actorId:actor.id,actorLink:true,x:0,y:0}]);tokens.push(token);
      await wait(()=>canvas.tokens.get(token.id));
    }
    canvas.tokens.get(tokens[0].id).control({releaseOthers:true});
    const one=await rollOfFate();messages.push(one.id);
    assert(one.getFlag(ID,'fate').tokenUuid===tokens[0].uuid,'One selected token must be chosen without a roll.');
    assert(one.rolls.length===0,'One-token Fate should not roll dice.');
    canvas.tokens.get(tokens[1].id).control({releaseOthers:false});
    game.modules.get(ID).api.toggle(true);document.querySelector('#mlgm-tab-rolls').click();
    document.querySelector('[data-action="fate"]').click();
    const two=await wait(()=>game.messages.find(m=>!before.has(m.id)&&m.id!==one.id&&m.getFlag(ID,'fate')));messages.push(two.id);
    assert(tokens.some(t=>t.uuid===two.getFlag(ID,'fate').tokenUuid),'Fate must choose a selected character token.');
    assert(two.rolls[0].formula==='1d2'&&!two.blind&&!two.whisper.length,'Fate must be uniformly random and public.');
    assert(two.content.includes('Fate has decided that')&&two.content.includes('shall be targeted!')&&two.content.includes('ml-actor-identity'),'Fate card must use Core identity and requested wording.');
  } finally {
    const created=game.messages.filter(m=>!before.has(m.id)&&m.getFlag(ID,'fate')&&tokens.some(t=>t.uuid===m.getFlag(ID,'fate').tokenUuid)).map(m=>m.id);
    if(created.length)await ChatMessage.deleteDocuments(created);
    if(tokens.length)await canvas.scene.deleteEmbeddedDocuments('Token',tokens.map(t=>t.id));
    for(const actor of actors)await actor.delete();
    canvas.tokens.releaseAll();for(const id of previous)canvas.tokens.get(id)?.control({releaseOthers:false});
  }
}};
