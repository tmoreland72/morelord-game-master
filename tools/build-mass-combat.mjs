import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {massCombatCommand} from '../scripts/mass-combat.mjs';
const source=await readFile(new URL('../scripts/mass-combat.mjs',import.meta.url),'utf8');
const folder=new URL('../macros/mass-combat/',import.meta.url);await mkdir(folder,{recursive:true});
for(const [action,label,img] of [['attackers','Select Attackers','target'],['resolve','Attack Targets','combat'],['apply','Apply Damage','blood']])await writeFile(new URL(`${action}.json`,folder),JSON.stringify({name:`Mass Combat — ${label}`,type:'script',scope:'global',img:`icons/svg/${img}.svg`,ownership:{default:0},command:massCombatCommand(source,action),flags:{'morelord-game-master':{massCombatMacro:action}}},null,2)+'\n');
