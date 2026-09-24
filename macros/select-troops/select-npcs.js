if (!game.user.isGM) return ui.notifications.warn('GM only.');
if (!canvas.ready || !canvas.scene) return ui.notifications.warn('Open a scene first.');
const {escapeHTML:e}=await import('/modules/morelord-game-master/scripts/core.mjs');
const sceneId=canvas.scene.id;
const typeName=t=>game.actors.get(t.document.actorId)?.name ?? t.actor?.name ?? t.document.name;
const groups=new Map();
for (const token of canvas.tokens.placeables) {
  if (token.actor?.type!=='npc') continue;
  const name=typeName(token);
  groups.set(name,(groups.get(name)??0)+1);
}
const names=[...groups.keys()].sort((a,b)=>a.localeCompare(b));
if (!names.length) return ui.notifications.info('No NPCs on this scene.');
const choice=await foundry.applications.api.DialogV2.wait({
  id:'morelord-game-master-select-npcs',classes:['ml-window'],
  window:{title:'Select NPCs'},position:{width:420},
  content:`<div><div class="ml-app ml-app-shell ml-dialog-shell"><label><span>NPC type</span><select name="npcType">${names.map((name,i)=>`<option value="${i}">${e(name)} (${groups.get(name)})</option>`).join('')}</select></label><p>Selects all matching tokens, including those at 0 HP.</p></div></div>`,
  buttons:[{action:'select',label:'Select tokens',default:true,callback:(event,button)=>Number(button.form.elements.npcType.value)},{action:'cancel',label:'Cancel',callback:()=>null}],
  close:()=>null
});
if (!Number.isInteger(choice) || choice<0 || choice>=names.length) return;
if (canvas.scene?.id!==sceneId) return ui.notifications.warn('Scene changed. Reopen Select NPCs.');
canvas.tokens.activate();canvas.tokens.releaseAll();
for (const token of canvas.tokens.placeables) if(token.actor?.type==='npc' && typeName(token)===names[choice]) token.control({releaseOthers:false});
ui.notifications.info(`Selected ${canvas.tokens.controlled.length} ${names[choice]} tokens.`);
