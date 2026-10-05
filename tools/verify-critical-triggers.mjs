import {startBrowser} from '../tests/browser-driver.mjs';
import fs from 'node:fs/promises';
const keepAlive=setInterval(()=>{},1000);
let browser;
try {
  browser=await startBrowser();
  await browser.command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await browser.command('Page.navigate',{url:'http://127.0.0.1:31400/join'});
  await browser.wait('!!document.querySelector("input[name=username]")',30000);
  if((await browser.evaluate('document.title')).trim().toLowerCase()!=='dev1')throw Error('Not Dev1; no live checks or writes performed.');
  await browser.evaluate(`document.querySelector('input[name=username]').value=${JSON.stringify(process.env.FOUNDRY_TEST_GM||'Chuck')};document.querySelector('input[name=password]').value=${JSON.stringify(process.env.FOUNDRY_TEST_PASSWORD||'')};document.querySelector('button[name=join]').click()`);
  await browser.wait('globalThis.game?.ready && globalThis.canvas?.ready && !!game.modules.get("morelord-game-master")?.api',60000);
  if(await browser.evaluate('game.world.id')!=='dev1')throw Error('Not Dev1.');
  // Native document APIs preserve the running databases and unrelated pack contents.
  if(process.argv.includes('--install')) {
    const documents={macros:[], 'roll-tables':[]};
    for(const pack of Object.keys(documents))for(const name of await fs.readdir(`pack-source/${pack}`))if(name.endsWith('.json'))documents[pack].push(JSON.parse(await fs.readFile(`pack-source/${pack}/${name}`,'utf8')));
    console.log(await browser.evaluate(`await (async()=>{const documents=${JSON.stringify(documents)};for(const [name,rows] of Object.entries(documents)){const pack=game.packs.get('morelord-game-master.'+name),locked=pack.locked;try{await pack.configure({locked:false});for(const data of rows){const doc=await pack.getDocument(data._id);if(doc){if(name==='macros')await doc.update({command:data.command});}else await (name==='macros'?Macro:RollTable).create(data,{pack:pack.collection,keepId:true});}}finally{await pack.configure({locked});}}return 'Installed critical tables and updated managed macros.';})()`));
  }
  if(process.argv.includes('--capture-cards'))await browser.evaluate('globalThis.morelordCriticalCardPreviews=[]');
  const report=await browser.evaluate(`await (async()=>{const {runInGameTests}=await import('./modules/morelord-core/scripts/testing/in-game.js');const {criticalTriggersCheck}=await import('./modules/morelord-game-master/scripts/testing/critical-triggers.mjs');const {triggerFooterCheck}=await import('./modules/morelord-game-master/scripts/testing/trigger-footer.mjs');return runInGameTests({checks:[criticalTriggersCheck,triggerFooterCheck]});})()`);
  report.browserErrors=browser.errors;
  await fs.writeFile('tests/critical-triggers-live-report.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({summary:report.summary,results:report.results,browserErrors:browser.errors},null,2));
  if(!report.ok)process.exitCode=1;
  if(process.argv.includes('--capture-cards') && report.ok) {
    await browser.evaluate(`const preview=document.createElement('ol');preview.id='critical-card-preview';preview.className='chat-log';preview.style.cssText='position:fixed;top:40px;left:40px;width:740px;display:grid;grid-template-columns:1fr 1fr;gap:20px;z-index:100000;';preview.innerHTML=globalThis.morelordCriticalCardPreviews.join('');preview.querySelectorAll('.dsn-hide').forEach(el=>el.classList.remove('dsn-hide'));document.body.append(preview);await new Promise(r=>setTimeout(r,400))`);
    const shot=await browser.command('Page.captureScreenshot',{format:'png'});
    await fs.writeFile('tests/critical-result-cards-live.png',Buffer.from(shot.data,'base64'));
    await browser.evaluate('document.querySelector("#critical-card-preview").remove();delete globalThis.morelordCriticalCardPreviews');
  }
  if(process.argv.includes('--capture')) {
    await browser.command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await browser.evaluate(`game.modules.get("morelord-game-master").api.toggle(true);document.querySelector("#mlgm-tab-triggers").click();await new Promise(r=>setTimeout(r,500));document.querySelector('[data-action="trigger-toggle"][data-id="critical-fumble"]')?.closest("article").scrollIntoView({block:"end"});await new Promise(r=>setTimeout(r,300))`);
    const shot=await browser.command('Page.captureScreenshot',{format:'png'});
    await fs.writeFile('tests/critical-triggers-live.png',Buffer.from(shot.data,'base64'));
  }
} finally {await browser?.close();clearInterval(keepAlive);}
