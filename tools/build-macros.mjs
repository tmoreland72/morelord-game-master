import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {TRIGGER_MACROS} from '../scripts/trigger-catalog.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const clean = source => source.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const triggerSource = clean((await fs.readFile(path.join(root, 'scripts/triggers.mjs'), 'utf8')).split('export function initializeTriggers()')[0]);
const clockSource = clean(await fs.readFile(path.join(root, 'scripts/world-clock.mjs'), 'utf8'));
const prelude = `// Managed by the Game Master Triggers tab. Start/stop there, not from the hotbar.
if (!game.user.isGM) return;
if (!scope.runtime) { ui.notifications.info('Use the Game Master Triggers tab to start or stop this macro.'); return; }
const {trigger, Hooks, setInterval, enqueue, services} = scope.runtime;
const {ID, e, core, activeGM, createRequest} = services;
`;
const listen = `
const process = message => {
  if (!game.user.isGM || message.getFlag(ID, 'triggerResult')) return;
  if (!message.getFlag(ID, 'triggerUse') && !['attack','damage','save'].includes(message.type)) return;
  return enqueue(async () => {
    if (triggerCoordinator(trigger)?.id === game.user.id) await executeTrigger(trigger, message);
  });
};
Hooks.on('createChatMessage', process);
Hooks.on('updateChatMessage', (message, changes) => {
  if (foundry.utils.getProperty(changes, 'flags.' + ID + '.triggerUse')) return process(message);
});
return true;`;
const names = {sorcerer:'Wild Magic Surge', volatile:'Volatile Magic', sneak:'Sneak Attack', item:'Item Use — Roll Table', 'lucky-find':'Lucky Finds', 'world-clock':'World Clock'};
await fs.mkdir(path.join(root, 'pack-source/macros'), {recursive:true});
const documents = [];
for (const [kind, id] of Object.entries(TRIGGER_MACROS)) {
  let command;
  if (kind === 'world-clock') command = prelude + clockSource + '\ninitializeWorldClock();\nreturn true;';
  else if (kind === 'lucky-find') command = prelude + triggerSource + `\nHooks.on('deleteCombat', combat => enqueue(() => executeLuckyFindTrigger(combat)));\nreturn true;`;
  else command = prelude + triggerSource + listen;
  // Validate syntax without executing a macro or touching Foundry state.
  new (Object.getPrototypeOf(async function(){}).constructor)('scope', command);
  const document = {_id:id, name:names[kind], type:'script', scope:'global', img:'icons/svg/dice-target.svg', command,
    ownership:{default:0}, flags:{'morelord-game-master':{triggerKind:kind, schemaVersion:1}}};
  documents.push(document);
  await fs.writeFile(path.join(root, `pack-source/macros/${kind}.json`), JSON.stringify(document,null,2)+'\n');
}
const fateSource = clean(await fs.readFile(path.join(root,'scripts/roll-of-fate.mjs'),'utf8'));
const fate = {_id:'RollOfFate000001', name:'Roll of Fate', type:'script', scope:'global', img:'icons/svg/dice-target.svg',
  command:`const ID = 'morelord-game-master';\nconst core = () => game.modules.get('morelord-core').api;\n${fateSource}\nreturn rollOfFate();`,ownership:{default:0}};
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
