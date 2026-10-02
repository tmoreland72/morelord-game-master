import {startBrowser} from '../tests/browser-driver.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await startBrowser();
try {
  await browser.command('Page.navigate',{url:'http://127.0.0.1:31400/join'});
  await browser.wait('!!document.querySelector("input[name=username]")',30000);
  const world=await browser.evaluate('game.world?.id ?? game.data?.world?.id');
  if(world!=='dev1') throw Error(`Live checks skipped: loaded world is ${world}.`);
  await browser.evaluate(`document.querySelector('input[name=username]').value=${JSON.stringify(process.env.FOUNDRY_TEST_GM||'Gamemaster')};document.querySelector('input[name=password]').value=${JSON.stringify(process.env.FOUNDRY_TEST_PASSWORD||'')};document.querySelector('button[name=join]').click()`);
  await browser.wait('globalThis.game?.ready && !!game.modules.get("morelord-game-master")?.api',60000);
  if(await browser.evaluate('game.world.id')!=='dev1') throw Error('Loaded world changed; checks skipped.');
  await mkdir('test-results',{recursive:true});
  for(const [width,height] of [[1280,850],[1920,1080],[700,600]]) {
    await browser.command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    const report=await browser.evaluate(`var {panelChecks}=await import('./modules/morelord-game-master/scripts/testing/panel.mjs');var {runInGameTests}=await import('./modules/morelord-core/scripts/testing/in-game.js');await runInGameTests({checks:panelChecks})`);
    await writeFile(`test-results/panel-${width}.json`,JSON.stringify(report,null,2));
    console.log(JSON.stringify({width,report}));
    if(!report.ok) throw Error('Panel regression failed.');
    await browser.evaluate('game.modules.get("morelord-game-master").api.toggle(true)');
    const shot=await browser.command('Page.captureScreenshot',{format:'png'});
    await writeFile(`test-results/panel-${width}.png`,Buffer.from(shot.data,'base64'));
  }
} finally { console.log(JSON.stringify({browserErrors:browser.errors}));await browser.close(); }
