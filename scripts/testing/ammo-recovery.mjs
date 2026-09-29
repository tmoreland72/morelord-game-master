import {assert} from '../../../morelord-core/scripts/testing/in-game.js';
import {ID} from '../core.mjs';
import {activeGM} from '../requests.mjs';
import {recordAmmoSpent,recoverCombatAmmo} from '../ammo-recovery.mjs';
export const ammoRecoveryCheck={id:'game-master.ammunition-recovery',async run(){
  assert(game.world.id==='dev1' && game.user.isGM,'Dev1 GM required.');
  assert(activeGM()?.id===game.user.id,'Run this regression as the coordinating active GM.');
  const board=foundry.utils.deepClone(game.settings.get(ID,'board'));
  const messages=[],actors=[];let combat;
  try {
    await game.settings.set(ID,'board',{...board,triggers:[{id:'ammo-test',kind:'ammo-recovery',enabled:true,macroUuid:'Compendium.morelord-game-master.macros.Macro.AmmoRecovery0001'}]});
    const actor=await Actor.create({name:'Ammo recovery regression',type:'character'});actors.push(actor);
    let [ammo]=await actor.createEmbeddedDocuments('Item',[{name:'Test arrows',type:'consumable',system:{type:{value:'ammo',subtype:'arrow'},quantity:5}}]);
    const ammoId=ammo.id;
    combat=await Combat.create({active:false,round:1,turn:0,combatants:[{actorId:actor.id}]});
    for(let i=0;i<5;i++){
      const snapshot=ammo.toObject();
      const message=await ChatMessage.create({type:'attack',speaker:ChatMessage.getSpeaker({actor}),rolls:[await new CONFIG.Dice.D20Roll('1d20').evaluate({allowInteractive:false})],whisper:[game.user.id],system:{ammunition:ammo.id,...(i===4?{deltas:{deleted:[snapshot]}}:{})}});messages.push(message);
      if(i===4) await ammo.delete();else await ammo.update({'system.quantity':4-i});
      await recordAmmoSpent({messageId:message.id,combatId:combat.id},{senderUserId:game.user.id});
      assert(message.getFlag(ID,'ammoSpent')?.itemId===ammoId,'Native ammo receipt saved.');
    }
    assert(!actor.items.has(ammoId),'The consumed stack was deleted.');
    assert(await recoverCombatAmmo(combat),'Combat recovery returns ammunition.');
    assert(actor.items.get(ammoId)?.system.quantity===2,'Five shots return two arrows to the depleted stack.');
    assert(!await recoverCombatAmmo(combat),'Duplicate end notification cannot add more ammo.');
    assert(actor.items.get(ammoId).system.quantity===2,'Recovered quantity stays at two.');
  }finally{
    if(combat){for(const m of game.messages.filter(m=>m.getFlag(ID,'ammoRecovery')===combat.id))await m.delete();await combat.update({round:0});await combat.delete();}
    for(const m of messages)if(game.messages.has(m.id))await m.delete();
    for(const a of actors)await a.delete();
    await game.settings.set(ID,'board',board);
  }
}};
