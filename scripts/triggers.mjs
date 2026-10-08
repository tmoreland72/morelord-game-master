import {ID,escapeHTML as e} from './core.mjs';
import {core,activeGM,createRequest} from './requests.mjs';
import {CRITICAL_TABLES} from './trigger-catalog.mjs';
import {recoverCombatAmmo} from './ammo-recovery.mjs';
import {initializeWorldClock} from './world-clock.mjs';

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
  if (CRITICAL_TABLES[kind]) return ['character','npc'].includes(actor?.type);
  if (actor?.type !== 'character') return false;
  const has=(type,id)=>actor.items.some(i=>i.type===type && i.system.identifier===id);
  if (kind==='hunters-mark') return true;
  if (kind==='volatile') return true;
  if (kind==='sorcerer') return has('class','sorcerer') && has('subclass','wild-magic');
  if (kind==='sneak') return has('class','rogue') && has('feat','sneak-attack');
  return false;
}
export function criticalAttackTable(kind,message) {
  if (!CRITICAL_TABLES[kind] || message?.type !== 'attack') return null;
  for (const roll of message.rolls ?? []) {
    if (!(kind === 'critical-hit' ? roll.isCritical && !roll.isFumble : roll.isFumble)) continue;
    // Roll data is not persisted in chat; the native activity and selected mode are.
    const attack=message.getAssociatedActivity?.()?.attack?.type ?? roll.data?.roll?.attack;
    const mode=roll.options?.attackMode ?? message.system?.mode;
    const category=attack?.classification === 'spell' ? 'magic'
      : mode?.includes('thrown') || mode==='ranged' ? 'ranged' : attack?.type ?? attack?.value;
    const id=CRITICAL_TABLES[kind][category];
    if (id) return `Compendium.morelord-game-master.roll-tables.RollTable.${id}`;
  }
  return null;
}
export function criticalResultCard(kind,context,content) {
  const hit=kind==='critical-hit',title=hit?'Critical Hit':'Critical Fumble';
  const attack={melee:'Melee attack',ranged:'Ranged attack',magic:'Magic attack'}[context.attackType];
  return `<section class="ml-chat-card ml-stack"><div class="ml-callout" data-tone="${hit?'success':'danger'}"><i class="fa-solid ${hit?'fa-burst':'fa-skull-crossbones'}" aria-hidden="true"></i><div><h3>${title}</h3><p>${e(attack)}${Number.isFinite(context.attackDie)?` · Attack die: ${context.attackDie}`:''}</p></div></div>${core().ui.actorIdentity(context.actor)}<p><strong>${e(context.itemName)}</strong> triggered this ${hit?'critical hit':'critical fumble'} table.</p>${content}</section>`;
}
function sceneTokens(scene) {
  const tokens = scene?.tokens;
  if (!tokens) return [];
  if (Array.isArray(tokens)) return tokens;
  if (Array.isArray(tokens.contents)) return tokens.contents;
  return [...tokens];
}
function tokenBox(doc, grid) {
  const object = doc.object;
  if (object?.center && object.w != null) return {x: object.x, y: object.y, w: object.w, h: object.h, center: object.center};
  const size = Number(grid?.size) || 1;
  const w = (Number(doc.width) || 1) * size;
  const h = (Number(doc.height) || 1) * size;
  const x = Number(doc.x) || 0, y = Number(doc.y) || 0;
  return {x, y, w, h, center: {x: x + w / 2, y: y + h / 2}};
}
function nearbyAlly(actor, target) {
  const scene = target?.parent, grid = scene?.grid;
  if (!scene || !grid?.measurePath) return false;
  const dependents = typeof actor.getDependentTokens === 'function' ? actor.getDependentTokens({scenes: scene}) : [];
  const attacker = dependents.find(token => token.parent === scene) ?? sceneTokens(scene).find(token => token.actor?.id === actor.id);
  if (!attacker?.disposition) return false;
  const half = grid.size / 2;
  const nearest = (a, b) => ({
    x: Math.max(a.x + half, Math.min(b.center.x, a.x + a.w - half)),
    y: Math.max(a.y + half, Math.min(b.center.y, a.y + a.h - half))
  });
  const targetBox = tokenBox(target, grid);
  return sceneTokens(scene).some(doc => {
    if (!doc.actor || doc.actor.id === actor.id || doc.id === target.id) return false;
    if (doc.disposition !== attacker.disposition) return false;
    if (['incapacitated','unconscious','paralyzed','petrified','stunned','dead'].some(status => doc.actor.statuses?.has(status))) return false;
    const ally = tokenBox(doc, grid);
    return grid.measurePath([nearest(ally, targetBox), nearest(targetBox, ally)]).distance <= 5;
  });
}
export function sneakTarget(message,actor,item) {
  if (message.type!=='attack' || item?.type!=='weapon') return null;
  if (!item.system.properties.has('fin') && !['simpleR','martialR'].includes(item.system.type.value)) return null;
  const roll=message.rolls?.[0];
  if (!roll || roll.isFumble || roll.hasDisadvantage) return null;
  for (const target of message.system.targets ?? []) {
    if (target.ac == null || (!roll.isCritical && roll.total<target.ac)) continue;
    const located=fromUuidSync(target.token);
    const token=located?.document?.parent ? located.document : located;
    if (roll.hasAdvantage || (token?.parent && nearbyAlly(actor,token))) return target;
  }
  return null;
}
export function huntersMarkHit(message,actor,item) {
  if (message?.type !== 'attack') return null;
  const roll=message.rolls?.[0];
  if (!roll || roll.isFumble) return null;
  const critical=Boolean(roll.isCritical || roll.dice?.some(d=>d.faces===20 && d.results.some(r=>r.active!==false && !r.discarded && r.result===20)));
  for (const mark of actor.concentration?.items ?? []) {
    if (mark.system.identifier !== 'hunters-mark' || (mark.system.source?.rules==='2014' && item.type!=='weapon')) continue;
    for (const target of message.system.targets ?? []) {
      if (!critical && (target.ac==null || roll.total<target.ac)) continue;
      const defender=fromUuidSync(target.token)?.actor;
      const marked=Array.from(defender?.appliedEffects ?? []).some(effect=>effect.active &&
        [effect.system?.origin?.activity, effect.system?.origin?.item, effect.origin]
          .some(origin=>origin===mark.uuid || origin?.startsWith(`${mark.uuid}.Activity.`)));
      if (marked) return {target,feature:mark,critical};
    }
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
  const message=['sneak','hunters-mark'].includes(trigger.kind) ? attackForDamage(event) : ['sorcerer','volatile'].includes(trigger.kind) ? rootOrigin(event) : event;
  if (!message || (['sorcerer','volatile'].includes(trigger.kind) && !spellCompleted(message))) return false;
  // Class rules deliberately ignore legacy character bindings, preserving rule IDs and surge counters.
  const actor=ChatMessage.getSpeakerActor?.(message.speaker) ?? game.actors.get(message.speaker.actor);
  if (trigger.kind==='item' ? actor?.id!==trigger.actorId : !matchesTriggerActor(trigger.kind,actor)) return false;
  const item=actor?.items.get(message.system?.item?.id ?? message.getFlag(ID,'triggerUse')?.itemId);
  if (!actor || !item || !message.author || (!message.author.isGM && !actor.testUserPermission(message.author,'OWNER'))) return false;
  if (message.speaker.actor!==actor.id) return false;
  if (message.getFlag(ID,'triggerHandled')?.includes(trigger.id)) return false;
  let target,markHit,criticalTable;
  if (CRITICAL_TABLES[trigger.kind]) {
    criticalTable=criticalAttackTable(trigger.kind,message);
    if (!criticalTable) return false;
  } else if (trigger.kind==='sneak') {
    target=sneakTarget(message,actor,item);
    if (!target) return false;
  } else if (trigger.kind==='hunters-mark') {
    markHit=huntersMarkHit(message,actor,item);
    if (!markHit) return false;
    target=markHit.target;
    if (game.messages.some(m=>m.getFlag(ID,'triggerResult')?.kind==='hunters-mark' && m.getFlag(ID,'triggerResult')?.sourceId===message.id)) return false;
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
  } else if (['sneak','hunters-mark'].includes(trigger.kind)) {
    const label=markHit ? "Hunter's Mark" : 'Sneak Attack';
    const feature=markHit?.feature ?? actor.items.find(i=>i.type==='feat' && i.system.identifier==='sneak-attack'), activity=feature?.system.activities.find(a=>a.type==='damage');
    if (!activity) throw new Error(`${label} damage activity is missing.`);
    const config=activity.getDamageConfig({isCritical:markHit?.critical ?? Boolean(message.rolls[0].isCritical)});
    const damageType=(!markHit || feature.system.source?.rules==='2014') ? Array.from(item.system.damage?.base?.types ?? [])[0] : null;
    for (const roll of config.rolls) if (damageType) {roll.options.type=damageType;roll.data.roll.damage.type=damageType;}
    config.subject=activity;config.hookNames=['damage'];
    const rolls=await CONFIG.Dice.DamageRoll.build(config,{configure:false},{create:false});
    if (!rolls?.length) return false;
    await ChatMessage.create({...privateData,type:'damage',system:{...activity.messageSources,targets:[target],origin:message.id},flavor:e(`${actor.name} · ${label}`),rolls},{messageMode:'blind'});
  } else {
    const table=criticalTable ? await fromUuid(criticalTable) : await triggerTable(trigger);
    if (!table) throw new Error('Trigger roll table is missing.');
    if (criticalTable) {
      const attackRoll=message.rolls.find(roll=>trigger.kind==='critical-hit'?roll.isCritical&&!roll.isFumble:roll.isFumble);
      flags[ID].criticalCard={attackType:Object.keys(CRITICAL_TABLES[trigger.kind]).find(type=>CRITICAL_TABLES[trigger.kind][type]===table.id),
        itemName:item.name,attackDie:attackRoll?.d20?.total,actor:{actorUuid:actor.uuid,name:actor.name,img:actor.img}};
      privateData.flavor=e(`${actor.name} · ${trigger.kind==='critical-hit'?'Critical Hit':'Critical Fumble'}`);
    }
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

const CHAT_TRIGGERS = new Set(['sorcerer','volatile','sneak','hunters-mark','item','critical-hit','critical-fumble']);
export function installTrigger(kind, runtime) {
  const {trigger, Hooks, setInterval: schedule, enqueue} = runtime ?? {};
  if (!Hooks?.on || typeof enqueue !== 'function') throw new Error('Trigger runtime is missing.');
  if (kind === 'ammo-recovery') {
    Hooks.on('deleteCombat', combat => enqueue(() => recoverCombatAmmo(combat)));
    return true;
  }
  if (kind === 'world-clock') {
    if (typeof schedule !== 'function') throw new Error('Trigger runtime is missing a timer.');
    initializeWorldClock({hooks: Hooks, schedule});
    return true;
  }
  if (kind === 'lucky-find') {
    Hooks.on('deleteCombat', combat => enqueue(() => executeLuckyFindTrigger(combat)));
    return true;
  }
  if (!CHAT_TRIGGERS.has(kind)) throw new Error(`Unknown trigger kind: ${kind}`);
  const process = message => {
    if (!game.user.isGM || message.getFlag(ID, 'triggerResult')) return;
    if (!message.getFlag(ID, 'triggerUse') && !['attack','damage','save'].includes(message.type)) return;
    return enqueue(async () => {
      if (triggerCoordinator(trigger)?.id === game.user.id) await executeTrigger(trigger, message);
    });
  };
  Hooks.on('createChatMessage', process);
  Hooks.on('updateChatMessage', (message, changes) => {
    if (foundry.utils.getProperty(changes, `flags.${ID}.triggerUse`)) return process(message);
  });
  return true;
}
export function initializeTriggers() {
  Hooks.on('preCreateChatMessage',message=>{
    const kind=message.getFlag(ID,'triggerResult')?.kind,context=message.getFlag(ID,'criticalCard');
    if (CRITICAL_TABLES[kind] && context)
      message.updateSource({content:criticalResultCard(kind,context,message.content)});
  });
  Hooks.on('dnd5e.preCreateUsageMessage',(activity,config)=>{
    foundry.utils.setProperty(config.data,`flags.${ID}.triggerUse`,{actorId:activity.actor?.id,itemId:activity.item?.id,activityType:activity.type,needsDamage:Boolean(activity.damage?.parts?.length || activity.damage?.includeBase || activity.healing),completed:false});
  });
  Hooks.on('dnd5e.postUseActivity',(_activity,_config,results)=>{
    const message=results.message,use=message?.getFlag(ID,'triggerUse');
    if (use) message.setFlag(ID,'triggerUse',{...use,completed:true}).catch(error=>ui.notifications.error(error.message));
  });
}
