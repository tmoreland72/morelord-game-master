import {ID} from './core.mjs';
import {createMassCombat} from '../../morelord-core/scripts/services/mass-combat.mjs';
export const {massCombat,resolveMassCombat}=createMassCombat(ID);
const core=()=>{
  const api=game.modules.get('morelord-core')?.active && globalThis.MorelordCore;
  if(!game.user.isGM || !api?.socket?.runSerialized || !api.users.list().some(u=>u.id===game.user.id))throw Error('An enabled, non-ignored GM and Morelord Core are required.');
  return api;
};

export function massCombatCommand(source,action) {
  if(!['attackers','resolve','apply'].includes(action))throw Error('Unknown mass combat action.');
  return `const {createMassCombat}=await import('/modules/morelord-core/scripts/services/mass-combat.mjs'); await createMassCombat('${ID}').massCombat('${action}');`;
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
