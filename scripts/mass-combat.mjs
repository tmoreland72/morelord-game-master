import {ID, escapeHTML as e} from './core.mjs';

const KEY='massCombat';
function core() {
  const api=game.modules.get('morelord-core')?.active && globalThis.MorelordCore;
  if (!game.user.isGM || !api?.socket?.runSerialized || !api.users.list().some(u=>u.id===game.user.id)) throw Error('An enabled, non-ignored GM and Morelord Core are required.');
  return api;
}
const hpOf=actor=>({hp:Number(actor.system.attributes.hp.value),temp:Number(actor.system.attributes.hp.temp ?? 0)});
const sameHP=(a,b)=>a.hp===b.hp && a.temp===b.temp;
const living=token=>token.actor && hpOf(token.actor).hp>0;
const selected=()=>canvas.tokens.controlled.map(t=>t.document).filter(living);

/** Ordered, focused attacks: unused damage is lost and only later attacks move on. */
export function resolveMassCombat(faces, bonus, targets) {
  const rows=targets.map(t=>({...t,before:{hp:t.hp,temp:t.temp},attempts:0,hits:0,criticals:0,damage:0}));
  let index=0,used=0;
  for (const face of faces) {
    while(index<rows.length && rows[index].hp<=0) index++;
    if(index===rows.length) break;
    const target=rows[index];used++;target.attempts++;
    if(face===1 || (face!==20 && face+bonus<target.ac)) continue;
    target.hits++;if(face===20)target.criticals++;
    const damage=face===20?target.critical:target.normal;
    const absorbed=Math.min(target.temp,damage);
    target.temp-=absorbed;
    const loss=Math.min(target.hp,damage-absorbed);
    target.hp-=loss;target.damage+=absorbed+loss;
  }
  return {rows,used,unused:faces.length-used,hits:rows.reduce((n,r)=>n+r.hits,0),dropped:rows.filter(r=>r.hp===0).length};
}

async function form(suffix,title,content,buttons) {
  return foundry.applications.api.DialogV2.wait({id:`${ID}-mass-${suffix}`,classes:['ml-window'],window:{title,resizable:true},position:{width:540},rejectClose:false,
    content:`<div><div class="ml-app ml-app-shell ml-dialog-shell ml-stack">${content}</div></div>`,
    buttons:buttons.map(([action,label])=>({action,label,callback:(_event,button)=>({action,data:new FormData(button.form)})}))});
}

async function suggestedProfile(actor) {
  const activity=actor.items.contents.flatMap(i=>i.system.activities?.contents ?? []).find(a=>a.type==='attack' && a.damage?.parts?.length);
  if(!activity)return {};
  const profile={label:activity.item.name,bonus:Number(activity.labels.modifier),attacks:1,mode:'normal',magical:activity.item.system.properties?.has('mgc') ?? false};
  const config=activity.getDamageConfig();
  if(config.rolls.length!==1)return {label:profile.label};
  const {parts,data,options,base}=config.rolls[0];
  profile.type=options.type ?? options.types?.[0];
  for(const [key,isCritical] of [['damage',false],['critical',true]]) {
    const make=()=>new CONFIG.Dice.DamageRoll(parts.join(' + '),data,{base,...options,isCritical});
    const min=await make().evaluate({minimize:true}),max=await make().evaluate({maximize:true});
    profile[key]=Math.floor((min.total+max.total)/2);
  }
  return profile;
}

async function captureAttackers(state) {
  if(state.pendingId)throw Error('Apply or discard the pending result before choosing new attackers.');
  const tokens=selected();
  if(!tokens.length)throw Error('Select the living attacker tokens first.');
  const groupKey=[...new Set(tokens.map(t=>t.actorId))].sort().join(',');
  let profile=state.groupKey===groupKey ? (state.profile ?? {}) : {};
  if(state.groupKey!==groupKey)try {profile=await suggestedProfile(tokens[0].actor);} catch { /* Manual fields remain available for unusual weapons. */ }
  await game.user.setFlag(ID,KEY,{sceneId:canvas.scene.id,attackerIds:tokens.map(t=>t.id),groupKey,profile,pendingId:null});
  ui.notifications.info(`${tokens.length} attackers remembered. Select the targets, then run Mass Combat — Attack Targets.`);
}

function damageFor(actor,amount,profile) {
  const result=actor.calculateDamage([{value:amount,type:profile.type,properties:new Set(profile.magical?['mgc']:[])}]);
  if(!result || !Number.isFinite(result.amount) || result.amount<0)throw Error(`Damage calculation was blocked for ${actor.name}.`);
  return result.amount;
}

function card(batch,status='Preview — HP unchanged') {
  const identity=row=>core().ui.actorIdentity({actorUuid:row.actorUuid,name:row.name,img:row.img});
  return `<section class="ml-chat-card"><h3>Mass Combat</h3><p>${e(status)}</p>
    <p><strong>${batch.result.hits} hits · ${batch.result.dropped} targets reduced to 0 HP</strong></p>
    <p>${batch.attackers} attackers × ${batch.profile.attacks} attacks. ${e(batch.profile.label || 'Group attack')}: +${batch.profile.bonus} to hit; ${batch.profile.damage} average ${e(batch.profile.type)} damage (${batch.profile.critical} on a critical).</p>
    <p>Focus fire in the listed order; excess damage does not carry over. ${batch.result.unused} attacks unused after all targets fell.</p>
    <div class="ml-stack">${batch.result.rows.map(row=>`<div class="ml-item-row"><div class="ml-stack">${identity(row)}<span>${row.hits}/${row.attempts} hits${row.criticals?`, ${row.criticals} critical`:''} · HP ${row.before.hp} → ${row.hp}${row.before.temp?` · Temp ${row.before.temp} → ${row.temp}`:''}${row.hp===0?' · <strong>DOWN</strong>':''}</span></div></div>`).join('')}</div>
    <p>${status.startsWith('Preview')?'Run Mass Combat — Apply Damage to commit this result. Special survival traits, reactions, range, cover, and resource use remain GM-controlled.':'Damage applied to HP and temporary HP. Death statuses and combat defeat markers are managed separately.'}</p></section>`;
}

async function resolveTargets(state) {
  if(state.pendingId) {
    const pending=game.messages.get(state.pendingId)?.getFlag(ID,KEY);
    const partial=pending?.stage==='applying';
    const choice=await form('pending','Mass Combat — Pending Result',`<p>${partial?'This batch was interrupted. Resume it, or discard the remaining work. Discard keeps any damage already applied.':'A result is waiting in GM chat. Apply it or discard it before rolling another batch.'}</p>`,[['apply',partial?'Resume applying':'Apply damage'],['discard',partial?'Discard remaining work':'Discard result'],['cancel','Cancel']]);
    if(choice?.action==='apply')return applyResult(state);
    if(choice?.action==='discard') {
      const message=game.messages.get(state.pendingId),batch=message?.getFlag(ID,KEY);
      if(batch)await message.update({content:card(batch,partial?'Stopped — any applied damage kept; figures below are the original projection':'Discarded — HP unchanged'),[`flags.${ID}.${KEY}.stage`]:'discarded'});
      await game.user.setFlag(ID,KEY,{...state,pendingId:null});
    }
    return;
  }
  if(state.sceneId!==canvas.scene.id || !state.attackerIds?.length)throw Error('Select attackers on this scene with Mass Combat — Select Attackers first.');
  const attackers=state.attackerIds.map(id=>canvas.scene.tokens.get(id)).filter(t=>t && living(t));
  if(!attackers.length)throw Error('No remembered attackers are still alive on this scene.');
  const targets=selected();
  if(!targets.length)throw Error('Select the living target tokens first.');
  if(targets.some(t=>state.attackerIds.includes(t.id)))throw Error('The targets include remembered attackers. Select only the opposing group.');
  if(new Set(targets.map(t=>t.actor.uuid)).size!==targets.length)throw Error('Some targets share the same linked actor and HP. Unlink duplicate troop tokens first.');
  const p=state.profile ?? {};
  const input=(key,label,value,min)=>`<label><span>${label}</span><input name="${key}" type="number" step="1" min="${min}" max="${key==='attacks'?20:10000}" required value="${Number.isFinite(value)?value:''}"></label>`;
  const choice=await form('attack','Mass Combat — Group Attack',
    `<p>${attackers.length} living attackers → ${targets.length} targets. One shared weapon profile applies to every attacker; split different weapons into separate groups.</p>
    <label><span>Attack name</span><input name="label" value="${e(p.label ?? '')}"></label>
    <div class="ml-grid" data-columns="2">${input('bonus','Attack bonus',p.bonus,-100)}${input('attacks','Attacks per troop',p.attacks ?? 1,1)}${input('damage','Average damage per hit',p.damage,0)}${input('critical','Average critical damage',p.critical,0)}</div>
    <label><span>Damage type</span><select name="type">${Object.entries(CONFIG.DND5E.damageTypes).map(([key,v])=>`<option value="${e(key)}" ${key===(p.type ?? 'slashing')?'selected':''}>${e(game.i18n.localize(v.label))}</option>`).join('')}</select></label>
    <label><span>Attack rolls</span><select name="mode">${['normal','advantage','disadvantage'].map(mode=>`<option value="${mode}" ${mode===p.mode?'selected':''}>${mode}</option>`).join('')}</select></label>
    <label class="ml-setting-row"><span>Magical weapon damage</span><input type="checkbox" name="magical" ${p.magical?'checked':''}></label>
    <details><summary>Target order: finish one before moving on</summary><ol>${targets.map(t=>`<li>${core().ui.actorIdentity({actorUuid:t.actor.uuid,name:t.name,img:t.texture.src})} · AC ${t.actor.system.attributes.ac.value} · HP ${hpOf(t.actor).hp}</li>`).join('')}</ol></details>
    <p>Rolls use the bonus entered above. Damage uses each target’s resistance, immunity, vulnerability, and temporary HP. Apply Damage is a separate action after the chat preview.</p>`,[['roll','Resolve attacks'],['cancel','Cancel']]);
  if(choice?.action!=='roll')return;
  const profile=Object.fromEntries(['bonus','attacks','damage','critical'].map(key=>[key,Number(choice.data.get(key))]));
  for(const [key,min,max] of [['bonus',-100,10000],['attacks',1,20],['damage',0,10000],['critical',0,10000]])if(!Number.isInteger(profile[key]) || profile[key]<min || profile[key]>max)throw Error(`Invalid ${key}.`);
  Object.assign(profile,{label:choice.data.get('label'),type:choice.data.get('type'),mode:choice.data.get('mode'),magical:choice.data.has('magical')});
  if(!CONFIG.DND5E.damageTypes[profile.type] || !['normal','advantage','disadvantage'].includes(profile.mode))throw Error('Invalid damage type or roll mode.');
  const count=attackers.length*profile.attacks;
  if(count>500)throw Error('Resolve at most 500 attacks per batch.');
  if(!attackers.every(living)||!targets.every(living))throw Error('An attacker or target dropped while the form was open. Reopen the attack.');
  const snapshots=targets.map(t=>({id:t.id,actorUuid:t.actor.uuid,name:t.name,img:t.texture.src,type:t.actor.type,ac:Number(t.actor.system.attributes.ac.value),...hpOf(t.actor),normal:damageFor(t.actor,profile.damage,profile),critical:damageFor(t.actor,profile.critical,profile)}));
  if(snapshots.some(t=>![t.ac,t.hp,t.temp].every(Number.isFinite)))throw Error('Every target must have numeric AC and HP.');
  const multiplier=profile.mode==='normal'?1:2;
  const roll=await new Roll(`${count*multiplier}d20`).evaluate({allowInteractive:false});
  const dice=roll.dice[0].results.map(r=>r.result),faces=[];
  for(let i=0;i<dice.length;i+=multiplier)faces.push(multiplier===1?dice[i]:(profile.mode==='advantage'?Math.max:Math.min)(dice[i],dice[i+1]));
  const batch={stage:'preview',userId:game.user.id,sceneId:canvas.scene.id,attackers:attackers.length,profile,result:resolveMassCombat(faces,profile.bonus,snapshots)};
  const message=await ChatMessage.create({speaker:ChatMessage.getSpeaker(),content:card(batch),rolls:[roll],whisper:core().users.list().filter(u=>u.isGM).map(u=>u.id),flags:{[ID]:{[KEY]:batch}}},{messageMode:'gm'});
  await game.user.setFlag(ID,KEY,{...state,profile,pendingId:message.id});
  ui.notifications.info(`${batch.result.hits} hits; ${batch.result.dropped} targets drop. Review GM chat, then Apply Damage.`);
}

async function applyResult(state) {
  const message=game.messages.get(state.pendingId),batch=foundry.utils.deepClone(message?.getFlag(ID,KEY));
  if(!batch)throw Error('There is no pending result. Resolve a group attack first.');
  if(batch.userId!==game.user.id || batch.sceneId!==canvas.scene.id)throw Error('Apply from the GM and scene that rolled this batch.');
  if(batch.stage==='applied') {await game.user.setFlag(ID,KEY,{...state,pendingId:null});return;}
  if(!['preview','applying'].includes(batch.stage))throw Error('This batch cannot be applied.');
  const scene=canvas.scene;
  for(const row of batch.result.rows) {
    const token=scene.tokens.get(row.id);
    if(!token?.actor || token.actor.uuid!==row.actorUuid)throw Error('A target was removed or changed. Discard this preview and resolve again.');
    const hp=hpOf(token.actor);
    if(!sameHP(hp,row.before) && !(batch.stage==='applying' && sameHP(hp,row)))throw Error(`${row.name}'s HP changed. Discard this preview and resolve again.`);
    if(batch.stage==='preview' && (Number(token.actor.system.attributes.ac.value)!==row.ac || damageFor(token.actor,batch.profile.damage,batch.profile)!==row.normal || damageFor(token.actor,batch.profile.critical,batch.profile)!==row.critical))throw Error(`${row.name}'s defenses changed. Discard this preview and resolve again.`);
  }
  batch.stage='applying';await message.setFlag(ID,KEY,batch);
  for(const row of batch.result.rows) {
    const token=scene.tokens.get(row.id),actor=token.actor;
    if(!sameHP(hpOf(actor),row)) {
      if(!sameHP(hpOf(actor),row.before))throw Error(`${row.name}'s HP changed while applying damage. Stop and inspect the target.`);
      await actor.applyDamage(row.damage,{ignore:true});
      if(!sameHP(hpOf(actor),row))throw Error(`${row.name}: another rule changed the damage outcome. Inspect the target before continuing.`);
    }

  }
  batch.stage='applied';await message.update({content:card(batch,'Applied'),[`flags.${ID}.${KEY}`]:batch});
  await game.user.setFlag(ID,KEY,{...state,pendingId:null});
  ui.notifications.info(`Damage applied. ${batch.result.dropped} targets reduced to 0 HP.`);
}

export async function massCombat(action) {
  try {
    const api=core();if(!canvas.ready || !canvas.scene)throw Error('Open the combat scene first.');
    return await api.socket.runSerialized(`${ID}:${KEY}:${game.user.id}`,async()=>{
      const state=foundry.utils.deepClone(game.user.getFlag(ID,KEY) ?? {});
      if(action==='attackers')return captureAttackers(state);
      if(action==='resolve')return resolveTargets(state);
      if(action==='apply')return applyResult(state);
      throw Error('Unknown mass combat action.');
    });
  } catch(error) {console.error('Mass Combat',error);ui.notifications.error(error.message);}
}

export function massCombatCommand(source,action) {
  if(!['attackers','resolve','apply'].includes(action))throw Error('Unknown mass combat action.');
  const body=source.slice(0,source.indexOf('export function massCombatCommand')).replace("import {ID, escapeHTML as e} from './core.mjs';",`const {ID,escapeHTML:e}=await import('/modules/${ID}/scripts/core.mjs');`).replace(/^export /gm,'');
  return `${body}\nawait massCombat('${action}');`;
}

export async function installMassCombat(source) {
  core();const installed=[];
  for(const [action,label,img] of [['attackers','Select Attackers','target'],['resolve','Attack Targets','combat'],['apply','Apply Damage','blood']]) {
    const data={name:`Mass Combat — ${label}`,type:'script',scope:'global',img:`icons/svg/${img}.svg`,ownership:{default:0},command:massCombatCommand(source,action),flags:{[ID]:{massCombatMacro:action}}};
    const existing=game.macros.find(m=>m.getFlag(ID,'massCombatMacro')===action);
    installed.push(existing?await existing.update(data):await Macro.create(data));
  }
  await game.settings.set(ID,'macros',[...new Set([...(game.settings.get(ID,'macros') ?? []),...installed.map(m=>m.uuid)])]);
  return installed;
}
