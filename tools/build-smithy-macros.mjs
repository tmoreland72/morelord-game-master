import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {smithyMacroCommand} from '../scripts/smithy-at-the-scar.mjs';
const source=await readFile(new URL('../scripts/smithy-at-the-scar.mjs',import.meta.url),'utf8');
const folder=new URL('../macros/smithy-at-the-scar/',import.meta.url);
await mkdir(folder,{recursive:true});
for(const [action,name,img] of [
  ['setup','Setup','upgrade'],['next','Next Wave','combat'],['reinforce','Reinforcements','dice-target'],
  ['safe','Ratling Safe Word','shield'],['status','Status','book']
]) {
  await writeFile(new URL(`${action}.json`,folder),JSON.stringify({
    name:`Smithy — ${name}`,type:'script',scope:'global',img:`icons/svg/${img}.svg`,ownership:{default:0},
    command:smithyMacroCommand(source,action),flags:{'morelord-game-master':{smithyMacro:action}}
  },null,2)+'\n');
}
console.log('Built five native Smithy macro JSON files.');
