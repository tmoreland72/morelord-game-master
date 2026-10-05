// One-time user-authorized repair: redeploy 12 husks into the existing defenders' encounter.
(async()=>{
  if(game.world.id!=='drakkenheim'||game.user.name!=='Chuck'||!game.user.isGM)throw Error('Wrong world/account.');
  const ID='morelord-game-master',KEY='smithyAtTheScar';
  const scene=game.scenes.get('PNczK53V7aOnK84v'),party=game.combats.get('9hjVaQ0KQWD0m5jS'),orphan=game.combats.get('8t801Wfqd19IK0jv');
  const state=foundry.utils.deepClone(scene?.getFlag(ID,KEY));
  if(scene?.name!=='The Scar'||!party||!orphan||orphan.round!==0||state?.combatId!==orphan.id||state.wave!==1||state.reinforcements!==0||state.pending)throw Error('Encounter changed since inspection; no repair performed.');
  if(orphan.combatants.size!==12||orphan.combatants.some(c=>c.token)||orphan.scene?.id!==scene.id)throw Error('The obsolete encounter is no longer twelve missing-token entries.');
  if(party.combatants.size!==28||party.combatants.some(c=>c.sceneId!==scene.id||!c.token))throw Error('Defenders changed; stopped.');
  const initial=party.combatants.map(c=>({id:c.id,initiative:c.initiative}));
  const tokenIds=new Set(scene.tokens.map(t=>t.id)),round=party.round;
  const body=globalThis.smithySource.replace("import {ID, escapeHTML as e} from './core.mjs';","const {ID,escapeHTML:e}=await import('/modules/morelord-game-master/scripts/core.mjs');").replace(/^export /gm,'');
  const {spawn,installSmithyMacros}=await new (Object.getPrototypeOf(async()=>{}).constructor)(body+'\nreturn {spawn,installSmithyMacros};')();
  const actors={...state.actors};
  for(const [key,name] of Object.entries({hulk:'Haze Hulk',gutbuster:'Haze Hulk (Gutbuster)',hunter:'Haze Hulk (Hunter)',juggernaut:'Haze Hulk (Juggernaut)'})) {
    const matches=game.actors.filter(a=>a.name===name&&a.type==='npc');
    const actor=matches.find(a=>/drakkenheim/i.test(a._stats.compendiumSource ?? '')) ?? matches[0];
    if(!actor)throw Error(`Missing ${name}`);actors[key]=actor.uuid;
  }
  await installSmithyMacros(globalThis.smithySource);
  await scene.setFlag(ID,KEY,{...state,actors,combatId:party.id,wave:0,reinforcements:0,pending:null});
  await scene.view();
  const operation=spawn(scene,'next');let button;
  for(let i=0;i<200;i++){button=document.querySelector(`#${ID}-smithy-spawn [data-action="deploy"]`);if(button)break;await new Promise(r=>setTimeout(r,50));}
  if(!button)throw Error('Deployment prompt missing; old encounter retained.');button.click();await operation;
  const added=scene.tokens.filter(t=>!tokenIds.has(t.id));
  if(added.length!==12||added.some(t=>t.getFlag(ID,KEY)?.kind!=='husk')||party.combatants.size!==40)throw Error('Deployment verification failed; old encounter retained.');
  if(initial.some(c=>party.combatants.get(c.id)?.initiative!==c.initiative)||party.round!==round)throw Error('Defenders or round changed; inspect before proceeding.');
  if(added.some(t=>!party.combatants.some(c=>c.tokenId===t.id&&c.sceneId===scene.id&&c.token&&Number.isFinite(c.initiative))))throw Error('New husks lack valid initiative entries.');
  await party.activate();
  await orphan.delete();
  return {ok:true,combatId:party.id,combatants:party.combatants.size,defenderInitiativesPreserved:initial.length,newHusks:added.length,sceneTokens:scene.tokens.size,round:party.round,state:scene.getFlag(ID,KEY),removedOrphanEncounter:orphan.id};
})()
