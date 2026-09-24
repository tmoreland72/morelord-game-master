import {readFile,writeFile} from 'node:fs/promises';
const folder=new URL('../macros/select-troops/',import.meta.url);
const command=await readFile(new URL('select-npcs.js',folder),'utf8');
await writeFile(new URL('select-npcs.json',folder),JSON.stringify({name:'Select NPCs',type:'script',scope:'global',img:'icons/svg/target.svg',ownership:{default:0},command,flags:{'morelord-game-master':{selectTroops:'npc-picker'}}},null,2)+'\n');
