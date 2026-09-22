import {startBrowser} from './browser-driver.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await startBrowser();
try {
  await browser.command('Page.navigate',{url:'http://127.0.0.1:31400/join'});
  await browser.wait('!!document.querySelector("input[name=username]")',30000);
  await browser.evaluate('document.querySelector("input[name=username]").value="Chuck";document.querySelector("button[name=join]").click()');
  await browser.wait('globalThis.game?.ready && !!game.modules.get("morelord-game-master")?.api',60000);
  const data=await browser.evaluate(`({actors:game.actors.filter(a=>/grim|rhyndor/i.test(a.name)).map(a=>({id:a.id,name:a.name,items:a.items.filter(i=>/sneak|sorcer|wild magic/i.test(i.name)||i.type==='weapon'||i.type==='spell').map(i=>({id:i.id,name:i.name,type:i.type,system:i.toObject().system}))})),encounters:Object.keys(game.modules.get('morelord-encounters')?.api??{}),board:game.settings.get('morelord-game-master','board'),table:(await fromUuid('Compendium.morelord-compendium.tables-1.RollTable.aDMFCKJcdKaJjTc6'))?.name})`);
  await writeFile('test-results/world-inspect.json',JSON.stringify(data,null,2));
  console.log(JSON.stringify({actors:data.actors.map(a=>({id:a.id,name:a.name,items:a.items.map(i=>({id:i.id,name:i.name,type:i.type}))})),encounters:data.encounters,table:data.table}));
} finally {await browser.close();}
