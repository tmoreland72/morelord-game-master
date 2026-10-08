import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {TRIGGER_MACROS, managedTriggerCommand, rollOfFateCommand} from '../scripts/trigger-catalog.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const names = {sorcerer:'Wild Magic Surge', volatile:'Volatile Magic', sneak:'Sneak Attack','hunters-mark':"Hunter's Mark", item:'Item Use — Roll Table', 'ammo-recovery':'Ammunition Recovery','lucky-find':'Lucky Finds', 'world-clock':'World Clock','critical-hit':'Critical Hit','critical-fumble':'Critical Fumble'};
await fs.mkdir(path.join(root, 'pack-source/macros'), {recursive:true});
const documents = [];
for (const [kind, id] of Object.entries(TRIGGER_MACROS)) {
  const command = managedTriggerCommand(kind);
  // Validate syntax without executing a macro or touching Foundry state.
  new (Object.getPrototypeOf(async function(){}).constructor)('scope', command);
  const document = {_id:id, name:names[kind], type:'script', scope:'global', img:'icons/svg/dice-target.svg', command,
    ownership:{default:0}, flags:{'morelord-game-master':{triggerKind:kind, schemaVersion:2}}};
  documents.push(document);
  await fs.writeFile(path.join(root, `pack-source/macros/${kind}.json`), JSON.stringify(document,null,2)+'\n');
}
const fateCommand = rollOfFateCommand();
new (Object.getPrototypeOf(async function(){}).constructor)('scope', fateCommand);
const fate = {_id:'RollOfFate000001', name:'Roll of Fate', type:'script', scope:'global', img:'icons/svg/dice-target.svg',
  command:fateCommand,ownership:{default:0}};
documents.push(fate);
await fs.writeFile(path.join(root,'pack-source/macros/roll-of-fate.json'),JSON.stringify(fate,null,2)+'\n');
if (!process.argv.includes('--json-only')) {
  if (!process.env.FOUNDRY_CLASSIC_LEVEL) throw Error('Set FOUNDRY_CLASSIC_LEVEL to the installed classic-level/index.js. Build only while the pack is not open in Foundry.');
  const {ClassicLevel} = await import(pathToFileURL(process.env.FOUNDRY_CLASSIC_LEVEL).href);
  const db = new ClassicLevel(path.join(root, 'packs/macros'), {valueEncoding:'json'});
  try { await db.open(); await db.batch(documents.map(value => ({type:'put',key:`!macros!${value._id}`,value}))); }
  finally { await db.close(); }
  const tables = new ClassicLevel(path.join(root, 'packs/roll-tables'), {valueEncoding:'json'});
  try {
    await tables.open();
    for (const filename of await fs.readdir(path.join(root,'pack-source/roll-tables'))) {
      if (!filename.endsWith('.json')) continue;
      const table = JSON.parse(await fs.readFile(path.join(root,'pack-source/roll-tables',filename),'utf8'));
      const results = table.results;
      table.results = results.map(result=>result._id);
      await tables.put(`!tables!${table._id}`,table);
      await tables.batch(results.map(value=>({type:'put',key:`!tables.results!${table._id}.${value._id}`,value})));
    }
  } finally { await tables.close(); }
}
console.log(`Built ${documents.length} managed trigger macros.`);
