import {ID,escapeHTML as e} from './core.mjs';
import {core,activeGM,createRequest} from './requests.mjs';

export function triggerCoordinator(trigger) {
  if (trigger.sourceWorld) return activeGM();
  return core().users.list().find(u=>u.id===trigger.createdBy && u.active && u.isGM) ?? activeGM();
}
async function triggerTable(trigger) {
  if (trigger.tableUuid?.startsWith('Compendium.')) return fromUuid(trigger.tableUuid);
  if (trigger.sourceWorld && trigger.sourceWorld !== game.world.id)
    return game.tables.find(table=>table.name === trigger.tableName);
  return fromUuid(trigger.tableUuid ?? `RollTable.${trigger.tableId}`);
}
export function isSorcererSpell(item) {
  return item?.type === 'spell' && item.system.sourceItem === 'class:sorcerer';
}
export function matchesTriggerActor(kind,actor) {
  if (actor?.type !== 'character') return false;
  const has=(type,id)=>actor.items.some(i=>i.type===type && i.system.identifier===id);
  if (kind==='volatile') return true;
  if (kind==='sorcerer') return has('class','sorcerer') && has('subclass','wild-magic');
  if (kind==='sneak') return has('class','rogue') && has('feat','sneak-attack');
  return false;
}
function nearbyAlly(actor,target) {
  const attacker=actor.getActiveTokens().find(t=>t.document.parent===target.document.parent);
  if (!attacker || !attacker.document.disposition) return false;
  const half=canvas.grid.size/2;
  const nearest=(a,b)=>({x:Math.max(a.x+half,Math.min(b.center.x,a.x+a.w-half)),y:Math.max(a.y+half,Math.min(b.center.y,a.y+a.h-half))});
  return canvas.tokens.placeables.some(ally=>ally.actor && ally.actor.id!==actor.id && ally.id!==target.id
    && ally.document.disposition===attacker.document.disposition
    && !['incapacitated','unconscious','paralyzed','petrified','stunned','dead'].some(s=>ally.actor.statuses.has(s))
    && canvas.grid.measurePath([nearest(ally,target),nearest(target,ally)]).distance<=5);
}
export function sneakTarget(message,actor,item) {
  if (message.type!=='attack' || item?.type!=='weapon') return null;
  if (!item.system.properties.has('fin') && !['simpleR','martialR'].includes(item.system.type.value)) return null;
  const roll=message.rolls?.[0];
  if (!roll || roll.isFumble || roll.hasDisadvantage) return null;
  for (const target of message.system.targets ?? []) {
    if (target.ac == null || (!roll.isCritical && roll.total<target.ac)) continue;
    const token=fromUuidSync(target.token)?.object;
    if (roll.hasAdvantage || (token && nearbyAlly(actor,token))) return target;
  }
  return null;
}
function originOf(message) {
  const origin=message?.getOriginatingMessage?.() ?? message?.system?.origin;
  return typeof origin === 'string' ? game.messages.get(origin) : origin ?? message;
}
function rootOrigin(message) {
  const seen=new Set();
  while (message && !seen.has(message.id)) {
    seen.add(message.id);const origin=originOf(message);
    if (!origin || origin.id===message.id) break;
    message=origin;
  }
  return message;
}
function relatedRolls(usage,type) {
  return game.messages.filter(m=>m.type===type && !m.getFlag(ID,'triggerResult') && rootOrigin(m)?.id===usage.id);
}
export function spellCompleted(usage) {
  const use=usage?.getFlag(ID,'triggerUse');
  if (!use?.completed) return false;
  return use.activityType!=='attack' || relatedRolls(usage,'attack').some(message=>message.rolls?.length);
}
export function attackForDamage(damage) {
  if (damage?.type!=='damage' || !damage.rolls?.length || damage.getFlag(ID,'triggerResult')) return null;
  const origin=originOf(damage);
  const attack=origin?.type==='attack' ? origin : relatedRolls(origin ?? damage,'attack').filter(m=>m.timestamp<=damage.timestamp).at(-1);
  return attack && attack.speaker?.actor===damage.speaker?.actor && attack.system?.item?.id===damage.system?.item?.id ? attack : null;
}
export async function executeTrigger(trigger,event) {
  if (['world-clock','lucky-find'].includes(trigger.kind)) return false;
  if (trigger.kind === 'item' && trigger.sourceWorld && trigger.sourceWorld !== game.world.id) return false;
  if (event.getFlag(ID,'triggerResult')) return false;
  const message=trigger.kind==='sneak' ? attackForDamage(event) : ['sorcerer','volatile'].includes(trigger.kind) ? rootOrigin(event) : event;
  if (!message || (['sorcerer','volatile'].includes(trigger.kind) && !spellCompleted(message))) return false;
  // Class rules deliberately ignore legacy character bindings, preserving rule IDs and surge counters.
  const actor=ChatMessage.getSpeakerActor?.(message.speaker) ?? game.actors.get(message.speaker.actor);
  if (trigger.kind==='item' ? actor?.id!==trigger.actorId : !matchesTriggerActor(trigger.kind,actor)) return false;
  const item=actor?.items.get(message.system?.item?.id ?? message.getFlag(ID,'triggerUse')?.itemId);
  if (!actor || !item || !message.author || (!message.author.isGM && !actor.testUserPermission(message.author,'OWNER'))) return false;
  if (message.speaker.actor!==actor.id) return false;
  if (message.getFlag(ID,'triggerHandled')?.includes(trigger.id)) return false;
  let target;
  if (trigger.kind==='sneak') {
    target=sneakTarget(message,actor,item);
    if (!target) return false;
  } else {
    if (!message.getFlag(ID,'triggerUse')) return false;
    if (trigger.kind==='sorcerer' ? !isSorcererSpell(item) : trigger.kind==='volatile' ? item.type!=='spell' : item.id!==trigger.itemId) return false;
  }
  const turnKey=game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : message.id;
  if (trigger.kind==='sneak' && game.messages.some(m=>(m.getFlag(ID,'triggerResult')?.kind==='sneak' || m.getFlag(ID,'triggerResult')?.triggerId===trigger.id) && m.speaker?.actor===actor.id && m.getFlag(ID,'triggerResult')?.turnKey===turnKey)) return false;
  const flags={[ID]:{triggerResult:{triggerId:trigger.id,kind:trigger.kind,actorId:actor.id,sourceId:message.id,turnKey}}};
  const privateData={blind:true,whisper:game.users.filter(u=>u.isGM).map(u=>u.id),speaker:ChatMessage.getSpeaker({actor}),flags};
  if (['sorcerer','volatile'].includes(trigger.kind)) {
    const table = await triggerTable(trigger);
    if (!table) throw new Error('Import the configured Wild Magic table into this world first.');
    if (!game.messages.some(m=>m.author?.isGM && m.getFlag(ID,'request')?.sourceId===message.id && m.getFlag(ID,'request')?.kind==='surge' && m.getFlag(ID,'request')?.triggerId===trigger.id))
      await createRequest({kind:'surge',actorIds:[actor.id],triggerId:trigger.id,sourceId:message.id,tableUuid:table.uuid,surgeName:trigger.kind==='volatile' ? 'Volatile Magic' : 'Wild Magic'});
  } else if (trigger.kind==='sneak') {
    const feature=actor.items.find(i=>i.type==='feat' && i.system.identifier==='sneak-attack'), activity=feature?.system.activities.find(a=>a.type==='damage');
    if (!activity) throw new Error('Sneak Attack damage activity is missing.');
    const config=activity.getDamageConfig({isCritical:Boolean(message.rolls[0].isCritical)});
    const damageType=Array.from(item.system.damage.base.types)[0];
    for (const roll of config.rolls) if (damageType) {roll.options.type=damageType;roll.data.roll.damage.type=damageType;}
    config.subject=activity;config.hookNames=['damage'];
    const rolls=await CONFIG.Dice.DamageRoll.build(config,{configure:false},{create:false});
    if (!rolls?.length) return false;
    await ChatMessage.create({...privateData,type:'damage',system:{...activity.messageSources,targets:[target],origin:message.id},flavor:e(`${actor.name} · Sneak Attack`),rolls},{messageMode:'blind'});
  } else {
    const table=await triggerTable(trigger);
    if (!table) throw new Error('Trigger roll table is missing.');
    const {roll,results}=await table.roll();
    await table.toMessage(results,{roll,messageData:privateData,messageOptions:{messageMode:'blind'}});
  }
  await message.setFlag(ID,'triggerHandled',[...(message.getFlag(ID,'triggerHandled') ?? []),trigger.id]);
  return true;
}
export const luckyFindWorldTable = () => game.tables.find(table => /^lucky finds?$/i.test(table.name.trim()));
const completedLuckyFinds = new Set();
export async function executeLuckyFindTrigger(combat) {
  if (!game.user.isGM || Number(combat.round) < 1 || completedLuckyFinds.has(combat.id)) return false;
  const trigger = (game.settings.get(ID, 'board').triggers ?? []).find(t => t.kind === 'lucky-find' && t.enabled);
  if (!trigger || triggerCoordinator(trigger)?.id !== game.user.id) return false;
  const table = luckyFindWorldTable();
  if (!table) return false;
  completedLuckyFinds.add(combat.id);
  try {
    const craftworks = game.modules.get('morelord-craftworks')?.api;
    if (craftworks?.luckyFinds?.hasAccess) await craftworks.openLuckyFinds({table});
    else {
      const {roll, results} = await table.roll();
      await table.toMessage(results, {roll, messageData: {whisper: core().users.list().filter(u => u.isGM).map(u => u.id), flags: {[ID]: {triggerResult: {kind: 'lucky-find', combatId: combat.id}}}}, messageOptions: {messageMode: 'gm'}});
    }
    return true;
  } catch (error) { completedLuckyFinds.delete(combat.id); throw error; }
}

export function initializeTriggers() {
  Hooks.on('dnd5e.preCreateUsageMessage',(activity,config)=>{
    foundry.utils.setProperty(config.data,`flags.${ID}.triggerUse`,{actorId:activity.actor?.id,itemId:activity.item?.id,activityType:activity.type,needsDamage:Boolean(activity.damage?.parts?.length || activity.damage?.includeBase || activity.healing),completed:false});
  });
  Hooks.on('dnd5e.postUseActivity',(_activity,_config,results)=>{
    const message=results.message,use=message?.getFlag(ID,'triggerUse');
    if (use) message.setFlag(ID,'triggerUse',{...use,completed:true}).catch(error=>ui.notifications.error(error.message));
  });
}
