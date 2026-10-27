import {ID, escapeHTML as e} from './core.mjs';
import {openDialog} from './dialog.mjs';

const KEY = 'smithyAtTheScar';
const NAMES = {husk:'Haze Husk', ratling:'Ratling', chimera:'Chimera', hulk:'Haze Hulk', gutbuster:'Haze Hulk (Gutbuster)', hunter:'Haze Hulk (Hunter)', juggernaut:'Haze Hulk (Juggernaut)'};
const WAVES = [null, {husk:12}, {ratling:20}, {husk:10, chimera:1}, {hulk:1,gutbuster:1,hunter:1,juggernaut:1}];
const api = () => {
  const core = game.modules.get('morelord-core')?.active && globalThis.MorelordCore;
  if (!core?.socket?.runSerialized) throw Error('Enable Morelord Core first.');
  if (!game.user.isGM) throw Error('Only a GM can manage the Smithy encounter.');
  if (!core.users.list().some(user => user.id === game.user.id)) throw Error('This GM is excluded by Core user filtering.');
  return core;
};
const read = scene => foundry.utils.deepClone(scene.getFlag(ID, KEY) ?? {});
const save = (scene, state) => scene.setFlag(ID, KEY, state);

export {overlaps,edgePositions} from '../../morelord-core/scripts/services/combat-placement.mjs';
import {edgePositions} from '../../morelord-core/scripts/services/combat-placement.mjs';

export function nextRoster(state, action, round) {
  if (action === 'reinforce') {
    if (state.wave !== 1) throw Error('Reinforcements are only available during Wave 1.');
    if ((state.reinforcements ?? 0) >= 10) throw Error('All ten reinforcement rolls are complete.');
    if (!(round > 0)) throw Error('Start combat before calling round reinforcements.');
    if (round <= (state.lastReinforcementRound ?? 0)) throw Error('Reinforcements have already arrived for this round.');
    return null;
  }
  if (action !== 'next') throw Error('Unknown Smithy action.');
  if (state.wave === 1 && (state.reinforcements ?? 0) < 10) throw Error('Finish the ten reinforcement rounds before Wave 2.');
  const wave=(state.wave ?? 0)+1;
  if (!WAVES[wave]) throw Error('All four waves have arrived.');
  return {wave, roster:WAVES[wave]};
}

async function dialog(suffix, title, content, buttons, validate) {
  return openDialog({
    id:`${ID}-smithy-${suffix}`, title, content, actions:buttons, width:480, validate, shellClass:'ml-dialog-shell ml-stack',
    render:(_event, app) => app.element.querySelectorAll('select[data-actor]').forEach(select => api().ui.decorateActorSelect(select))
  });
}

async function setup(scene) {
  const state=read(scene);
  const actors=game.actors.filter(a => a.type === 'npc').sort((a,b)=>a.name.localeCompare(b.name));
  const fields=Object.entries(NAMES).map(([key,name]) => {
    const selected=state.actors?.[key] ?? actors.find(a=>a.name.toLowerCase() === name.toLowerCase())?.uuid;
    return `<label><span>${e(name)}</span><select name="${key}" data-actor required><option value="">Choose an imported NPC actor</option>${actors.map(a=>`<option value="${e(a.uuid)}" ${a.uuid === selected ? 'selected' : ''}>${e(a.name)}</option>`).join('')}</select></label>`;
  }).join('');
  const answer=await dialog('setup','Smithy at the Scar — Setup',
    `<p>Scene: ${e(scene.name)}. Choose the enemy actors, including all four Haze Hulk types. Each spawned token gets independent HP.</p>${fields}
    <label><span>Inset from map edges (grid squares)</span><input name="inset" type="number" min="0" max="10" step="1" value="${state.inset ?? 1}" required></label>
    <p>Spawns use a three-square band around all four edges. Check terrain and walls after placement. Allies stay under your normal combat controls.</p>`, [['save','Save setup']], async data => {
    for (const key of Object.keys(NAMES)) {
      const uuid=data.get(key);
      if ((uuid ? await fromUuid(uuid) : null)?.type !== 'npc') return {field:key, message:'Choose an NPC actor for each enemy.'};
    }
    const inset=Number(data.get('inset'));
    if (!Number.isInteger(inset) || inset<0 || inset>10) return {field:'inset', message:'Choose an inset from 0 to 10 squares.'};
  });
  if (!answer) return;
  const inset=Number(answer.data.get('inset'));
  const selected=Object.fromEntries(Object.keys(NAMES).map(key=>[key,answer.data.get(key)]));
  await save(scene,{...state,actors:selected,inset});
  ui.notifications.info('Smithy setup saved for this scene.');
}

export function combatUsesScene(combat,scene) {
  return combat.scene?.id===scene.id || (!combat.scene && combat.combatants.some(c=>c.sceneId===scene.id && scene.tokens.has(c.tokenId)));
}

export function chooseSmithyCombat(scene,state,combats,viewed) {
  if (state.combatId) {
    const combat=combats.get(state.combatId);
    if (!combat || !(combatUsesScene(combat,scene) || (!combat.scene && combat.combatants.size===0))) throw Error('The Smithy combat was deleted or moved. Restore it before continuing.');
    return combat;
  }
  if(viewed && combatUsesScene(viewed,scene))return viewed;
  const matches=combats.filter(c=>combatUsesScene(c,scene));
  if (matches.length>1) throw Error('Select the intended encounter in the combat tracker before starting the Smithy waves.');
  return matches[0] ?? null;
}

async function encounterCombat(scene, state) {
  const combat=chooseSmithyCombat(scene,state,game.combats,game.combats.viewed ?? game.combat) ?? await Combat.create({scene:scene.id,active:true});
  state.combatId=combat.id;
  await save(scene,state);
  return combat;
}

// Persist token IDs and the rolled count before creation. Retrying an interrupted
// batch creates only missing tokens/combatants and never rerolls its reinforcement die.
async function finishBatch(scene, state, combat) {
  const pending=state.pending;
  for (const data of pending.tokens) {
    if (!scene.tokens.has(data._id)) await scene.createEmbeddedDocuments('Token',[data],{keepId:true});
  }
  const ids=new Set(pending.tokens.map(t=>t._id));
  const missing=pending.tokens.filter(t=>!combat.combatants.some(c=>c.tokenId === t._id && (c.sceneId ?? combat.scene?.id)===scene.id));
  if (missing.length) await combat.createEmbeddedDocuments('Combatant',missing.map(t=>({tokenId:t._id,sceneId:scene.id,actorId:t.actorId,hidden:false})));
  const unrolled=combat.combatants.filter(c=>ids.has(c.tokenId) && (c.sceneId ?? combat.scene?.id)===scene.id && c.initiative == null).map(c=>c.id);
  if (unrolled.length) await combat.rollInitiative(unrolled,{messageMode:'gm'});
  const finished={...state,...pending.after,pending:null};
  await save(scene,finished);
  ui.notifications.info(pending.label);
  return finished;
}

async function spawn(scene, action) {
  const state=read(scene);
  if (!state.actors) { await setup(scene); return; }
  const combat=await encounterCombat(scene,state);
  if (state.pending) return finishBatch(scene,state,combat);
  const plan=nextRoster(state,action,combat.round);
  const round=combat.round;
  const wave=plan?.wave ?? state.wave;
  const response=await dialog('spawn','Smithy at the Scar — Deploy',
    `<p>${action === 'reinforce' ? `Roll reinforcement ${1+(state.reinforcements ?? 0)} of 10 for combat round ${combat.round}?` : `Deploy Wave ${wave}: ${Object.entries(plan.roster).map(([key,count])=>`${count} ${e(NAMES[key])}`).join(', ')}?`}</p><p>Enemies will appear at the edges of ${e(scene.name)} and join its combat. You control when fighting resumes.</p>`, [['deploy','Deploy enemies'],['cancel','Cancel']]);
  if (response?.action !== 'deploy') return;
  if (combat.round !== round) throw Error('The combat round changed while this prompt was open. Try again.');
  const count=action === 'reinforce' ? (await new Roll('1d6').evaluate({allowInteractive:false})).total : null;
  const roster=plan?.roster ?? {husk:count};
  const tokens=[];
  for (const [kind,quantity] of Object.entries(roster)) {
    const actor=await fromUuid(state.actors[kind]);
    if (actor?.type !== 'npc') throw Error(`The ${NAMES[kind]} actor is missing. Run Setup again.`);
    for (let i=0; i<quantity; i++) {
      const token=(await actor.getTokenDocument({actorLink:false,hidden:false,disposition:-1},{parent:scene})).toObject();
      token._id=foundry.utils.randomID();
      token.flags ??= {};
      token.flags[ID]={...(token.flags[ID] ?? {}),[KEY]:{wave,kind}};
      tokens.push(token);
    }
  }
  // Place the largest footprint first so the chimera has room beside the husks.
  tokens.sort((a,b)=>b.width*b.height-a.width*a.height);
  const size=scene.grid.size;
  const positions=edgePositions({rect:scene.dimensions.sceneRect,size,inset:state.inset,
    footprints:tokens,occupied:scene.tokens.map(t=>({x:t.x,y:t.y,width:t.width*size,height:t.height*size}))});
  tokens.forEach((token,i)=>Object.assign(token,positions[i]));
  const after=action === 'reinforce'
    ? {reinforcements:(state.reinforcements ?? 0)+1,lastReinforcementRound:round,lastReinforcementCount:count}
    : {wave,reinforcements:state.reinforcements ?? 0};
  state.pending={tokens,after,label:action === 'reinforce' ? `Reinforcement ${after.reinforcements}/10: ${count} haze husks deployed.` : `Wave ${wave} deployed.`};
  await save(scene,state);
  return finishBatch(scene,state,combat);
}

async function safeWord(scene) {
  const state=read(scene);
  if (state.pending) throw Error('Finish the pending deployment with Next Wave before using the safe word.');
  if (!(state.wave>=2)) throw Error('Wave 2 has not arrived yet.');
  const ratlings=scene.tokens.filter(t=>t.getFlag(ID,KEY)?.kind === 'ratling');
  const ids=new Set(ratlings.map(t=>t.id));
  await scene.updateEmbeddedDocuments('Token',ratlings.map(t=>({_id:t.id,disposition:0})));
  for (const combat of game.combats.filter(c=>combatUsesScene(c,scene))) {
    const remove=combat.combatants.filter(c=>ids.has(c.tokenId) && (c.sceneId ?? combat.scene?.id)===scene.id).map(c=>c.id);
    if (remove.length) await combat.deleteEmbeddedDocuments('Combatant',remove);
  }
  await save(scene,{...state,ratlingsStopped:true});
  ui.notifications.info('Safe word: Smithy ratlings are neutral and removed from initiative. Their HP is unchanged.');
}

export async function smithy(action='status') {
  try {
    const core=api(), scene=canvas.scene;
    if (!scene || !canvas.ready) throw Error('Open the Smithy map first.');
    if (scene.grid.type !== 1) throw Error('Smithy edge placement currently requires a square-grid scene.');
    return await core.socket.runSerialized(`${ID}:${KEY}:${scene.id}`,async()=>{
      const state=read(scene), controller=game.users.get(state.controllerId);
      if (controller?.active && controller.id !== game.user.id) throw Error(`${controller.name} is controlling this encounter. Use that GM or wait until they disconnect.`);
      if (state.controllerId !== game.user.id) await save(scene,{...state,controllerId:game.user.id});
      if (action === 'setup') return setup(scene);
      if (action === 'next' || action === 'reinforce') return spawn(scene,action);
      if (action === 'safe') return safeWord(scene);
      const current=read(scene);
      return dialog('status','Smithy at the Scar — Status',
        `<p>Scene: ${e(scene.name)}</p><p>Wave: ${current.wave ?? 0}/4. Reinforcements: ${current.reinforcements ?? 0}/10. Ratlings: ${current.ratlingsStopped ? 'stood down' : 'not stood down'}.</p>
        <p>${current.pending ? 'Deployment interrupted: use Next Wave to finish the saved batch.' : 'Ready.'}</p><ol><li>12 haze husks + 1d6 for each of ten rounds.</li><li>20 ratlings; use Safe Word when spoken.</li><li>10 haze husks and a chimera.</li><li>One Haze Hulk, one Gutbuster, one Hunter, and one Juggernaut before the short rest finishes.</li></ol><p>Transitions and rest timing are GM-controlled. This tool does not grant rest benefits.</p>`, [['close','Close']]);
    });
  } catch (error) { console.error('Smithy at the Scar',error); ui.notifications.error(error.message); }
}

export function smithyMacroCommand(source, action) {
  if (!['setup','next','reinforce','safe','status'].includes(action)) throw Error('Unknown macro action.');
  const body=source.slice(0,source.indexOf('export function smithyMacroCommand'))
    .replace("import {ID, escapeHTML as e} from './core.mjs';",`const {ID,escapeHTML:e}=await import('/modules/${ID}/scripts/core.mjs');`)
    .replace("import {openDialog} from './dialog.mjs';", `const {openDialog}=await import('/modules/${ID}/scripts/dialog.mjs');`)
    .replace("export {overlaps,edgePositions} from '../../morelord-core/scripts/services/combat-placement.mjs';", '')
    .replace("import {edgePositions} from '../../morelord-core/scripts/services/combat-placement.mjs';", "const {edgePositions}=await import('/modules/morelord-core/scripts/services/combat-placement.mjs');")
    .replace(/^export /gm,'');
  if (!body.includes('async function smithy(')) throw Error('The Smithy macro source is incomplete.');
  return `${body}\nawait smithy('${action}');`;
}

export async function installSmithyMacros(source) {
  api();
  const definitions=[['setup','Setup','icons/svg/upgrade.svg'],['next','Next Wave','icons/svg/combat.svg'],['reinforce','Reinforcements','icons/svg/dice-target.svg'],['safe','Ratling Safe Word','icons/svg/shield.svg'],['status','Status','icons/svg/book.svg']];
  const macros=[];
  for (const [action,label,img] of definitions) {
    const data={name:`Smithy — ${label}`,type:'script',img,scope:'global',ownership:{default:0},
      command:smithyMacroCommand(source,action),flags:{[ID]:{smithyMacro:action}}};
    const existing=game.macros.find(m=>m.getFlag(ID,'smithyMacro') === action);
    macros.push(existing ? await existing.update(data) : await Macro.create(data));
  }
  const pinned=game.settings.get(ID,'macros') ?? [];
  await game.settings.set(ID,'macros',[...new Set([...pinned,...macros.map(m=>m.uuid)])]);
  ui.notifications.info('Five Smithy macros installed and pinned. Open the map and run Smithy — Setup.');
}
