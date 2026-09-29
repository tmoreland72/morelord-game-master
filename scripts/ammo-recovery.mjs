import {ID,escapeHTML as e} from './core.mjs';
import {core,activeGM} from './requests.mjs';
const enabled=()=>game.settings.get(ID,'board').triggers?.some(t=>t.kind==='ammo-recovery' && t.enabled);
let channel,queue=Promise.resolve();
const serialize=fn=>(queue=queue.catch(()=>{}).then(fn));

export async function recordAmmoSpent({messageId,combatId},execution) {
  if (!game.user.isGM || activeGM()?.id!==game.user.id || !enabled()) return;
  const message=game.messages.get(messageId),combat=game.combats.get(combatId);
  const sender=game.users.get(execution.senderUserId);
  const actor=message && ChatMessage.getSpeakerActor(message.speaker);
  if (!combat?.started || !actor || actor.type!=='character' || message.type!=='attack' || !message.rolls.length
    || !sender || (!sender.isGM && (message.author.id!==sender.id || !actor.testUserPermission(sender,'OWNER')))
    || !combat.combatants.some(c=>c.actor?.uuid===actor.uuid)) return;
  if (message.getFlag(ID,'ammoSpent')) return;
  const itemId=message.system.ammunition;
  const item=actor.items.get(itemId);
  const data=item?.toObject() ?? message.system.deltas?.deleted?.find(i=>i._id===itemId);
  if (!data || data.type!=='consumable' || data.system.type?.value!=='ammo' || data.system.properties?.includes('ret')) return;
  await message.setFlag(ID,'ammoSpent',{combatId,actorUuid:actor.uuid,itemId,data});
}

export function initializeAmmoTracking() {
  if (channel) return;
  channel=core().socket.createChannel(`${ID}-ammo`);
  channel.on('spent',(data,execution)=>serialize(()=>recordAmmoSpent(data,execution)));
  const pending=new WeakMap();
  // Native attack hooks run on the rolling client, including players. Core routes the receipt to the GM.
  Hooks.on('dnd5e.rollAttackV2',(rolls,{subject,ammoUpdate})=>{
    if (!enabled() || !game.combat?.started || !rolls[0] || !ammoUpdate) return;
    const actor=subject?.actor,item=actor?.items.get(ammoUpdate.id);
    if (!item || actor.type!=='character' || item.system.type?.value!=='ammo' || item.type!=='consumable'
      || !subject.item.isOwner || subject.item.inCompendium || item.system.quantity-ammoUpdate.quantity!==1) return;
    const message=game.messages.filter(m=>m.type==='attack' && m.author?.id===game.user.id
      && m.speaker.actor===actor.id && m.system.item?.id===subject.item.id && m.system.ammunition===item.id).at(-1);
    if (message) pending.set(rolls[0],{messageId:message.id,combatId:game.combat.id,actor,itemId:item.id,before:item.system.quantity});
  });
  Hooks.on('dnd5e.postRollAttack',rolls=>{
    const spent=rolls[0] && pending.get(rolls[0]);
    if (!spent) return;
    pending.delete(rolls[0]);
    if ((spent.actor.items.get(spent.itemId)?.system.quantity ?? 0)!==spent.before-1) return;
    const gm=activeGM();
    if (gm) channel.executeAsUser('spent',{messageId:spent.messageId,combatId:spent.combatId},gm.id).catch(error=>ui.notifications.error(error.message));
  });
}

export async function recoverCombatAmmo(combat) {
  return serialize(async()=>{
    if (!game.user.isGM || activeGM()?.id!==game.user.id || !enabled() || Number(combat.round)<1) return false;
    const groups=new Map();
    for (const message of game.messages) {
      const spent=message.getFlag(ID,'ammoSpent');
      if (spent?.combatId!==combat.id) continue;
      const key=`${spent.actorUuid}:${spent.itemId}`;
      const group=groups.get(key) ?? {...spent,count:0};group.count++;groups.set(key,group);
    }
    const lines=[];
    for (const group of groups.values()) {
      const quantity=Math.floor(group.count/2);
      if (!quantity) continue;
      const actor=await fromUuid(group.actorUuid);
      if (!actor) continue;
      let item=actor.items.get(group.itemId);
      const returned=Number(item?.getFlag(ID,`ammoReturned.${combat.id}`) ?? 0);
      if (returned>=quantity) continue;
      if (item) await item.update({'system.quantity':Number(item.system.quantity)+quantity-returned,[`flags.${ID}.ammoReturned.${combat.id}`]:quantity});
      else {
        const data=foundry.utils.deepClone(group.data);
        data.system.quantity=quantity;data.flags??={};data.flags[ID]??={};data.flags[ID].ammoReturned={[combat.id]:quantity};
        [item]=await actor.createEmbeddedDocuments('Item',[data],{keepId:true});
      }
      lines.push(`<p>${core().ui.actorIdentity({actorUuid:actor.uuid,name:actor.name,img:actor.img})}: ${e(item.name)} +${quantity-returned}</p>`);
    }
    if (lines.length) await ChatMessage.create({content:`<section class="ml-chat-card"><h3>Ammunition recovered</h3>${lines.join('')}</section>`,whisper:core().users.list().filter(u=>u.isGM).map(u=>u.id),flags:{[ID]:{ammoRecovery:combat.id}}},{messageMode:'gm'});
    return lines.length>0;
  });
}
