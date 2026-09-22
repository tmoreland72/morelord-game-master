// Read the user's source tables through Foundry; never open a running source LevelDB directly.
import fs from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {SURGE_TABLES} from '../scripts/trigger-catalog.mjs';
const {chromium} = await import(pathToFileURL(process.env.MORELORD_PLAYWRIGHT).href);
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  await page.route('**/api/foundry/telemetry**', route => route.abort());
  await page.goto('http://127.0.0.1:31400/join');
  if ((await page.title()).trim().toLowerCase() !== 'dev1') throw Error('Not Dev1; no live access performed.');
  await page.locator('input[name=username]').fill(process.env.FOUNDRY_TEST_GM || 'Chuck');
  await page.locator('input[name=password]').fill(process.env.FOUNDRY_TEST_PASSWORD || '');
  await page.locator('button[name=join]').click();
  await page.waitForFunction(() => globalThis.game?.ready, {}, {timeout:60000});
  const data = await page.evaluate(async uuids => {
    if (game.world.id.toLowerCase() !== 'dev1') throw Error('Not Dev1.');
    const tables = [];
    for (const uuid of uuids) {
      const table = await fromUuid(uuid.replace('morelord-game-master.roll-tables','morelord-compendium.tables-1'));
      if (table?.documentName !== 'RollTable') throw Error(`Missing source table: ${uuid}`);
      tables.push(table.toObject());
    }
    return {tables, packs:[...game.packs].filter(p=>p.collection.includes('craftworks')).map(p=>({collection:p.collection,label:p.metadata.label,folder:p.folder?.name}))};
  }, Object.values(SURGE_TABLES));
  const root = fileURLToPath(new URL('../pack-source/roll-tables/', import.meta.url));
  await fs.mkdir(root,{recursive:true});
  for (let table of data.tables) {
    table = JSON.parse(JSON.stringify(table).replaceAll('Compendium.morelord-compendium.tables-1.RollTable.aDMFCKJcdKaJjTc6',SURGE_TABLES.sorcerer).replaceAll('Compendium.morelord-compendium.tables-1.RollTable.JtRByu566t45mzkG',SURGE_TABLES.volatile));
    table.folder=null; table.ownership={default:0}; delete table._stats;
    for (const result of table.results) { result.drawn=false; delete result._stats; }
    await fs.writeFile(`${root}/${table._id}.json`,JSON.stringify(table,null,2)+'\n');
  }
  console.log(JSON.stringify({tables:data.tables.map(t=>({id:t._id,name:t.name,results:t.results.length})),packs:data.packs}));
} finally {await browser.close();}
