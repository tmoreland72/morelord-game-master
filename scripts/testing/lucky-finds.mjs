import {assert} from '../../../morelord-core/scripts/testing/in-game.js';
import {executeLuckyFindTrigger} from '../triggers.mjs';
const ID='morelord-game-master';
export const luckyFindChecks=[{id:'morelord-game-master.combat-end-lucky-find',async run(){
  const board=foundry.utils.deepClone(game.settings.get(ID,'board'));
  const priorMessages=new Set(game.messages.map(m=>m.id));
  let fixtureTable,combat;
  try {
    if(!game.tables.some(t=>/^lucky finds?$/i.test(t.name.trim()))) fixtureTable=await RollTable.create({name:'Lucky Finds',formula:'1d1',replacement:true,results:[{type:'text',description:'Lucky Finds regression fixture',range:[1,1]}]});
    await game.settings.set(ID,'board',{...board,triggers:[{id:'lucky-find-regression',kind:'lucky-find',enabled:true,createdBy:game.user.id}]});
    combat=await Combat.create({round:1});
    await combat.delete();
    const end=Date.now()+15000;
    const resultVisible=()=>foundry.applications.instances.get('morelord-craftworks-lucky-finds')?.rendered || game.messages.some(m=>m.getFlag(ID,'triggerResult')?.combatId===combat.id);
    while(!resultVisible() && Date.now()<end) await new Promise(resolve=>setTimeout(resolve,100));
    assert(resultVisible(),'Ending a started combat produces a private Lucky Finds result.');
    assert(!await executeLuckyFindTrigger(combat),'The combat cannot resolve twice.');
  } finally {
    await game.settings.set(ID,'board',board);
    await foundry.applications.instances.get('morelord-craftworks-lucky-finds')?.close();
    if(combat && game.combats.has(combat.id)) await combat.delete();
    await fixtureTable?.delete();
    const ids=game.messages.filter(m=>!priorMessages.has(m.id) && m.getFlag(ID,'triggerResult')?.combatId===combat?.id).map(m=>m.id);
    if(ids.length) await ChatMessage.deleteDocuments(ids);
  }
}}];
