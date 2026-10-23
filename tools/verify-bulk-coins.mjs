import {startBrowser} from '../tests/browser-driver.mjs';
import fs from 'node:fs/promises';
const base=process.env.FOUNDRY_TEST_URL || 'http://127.0.0.1:31400';
const browser=await startBrowser();
try {
 await browser.command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await browser.command('Page.navigate',{url:base+'/join'});
 await browser.wait('!!document.querySelector("select[name=userId],input[name=username]")',30000);
 if((await browser.evaluate('document.title')).trim().toLowerCase()!=='dev1')throw Error('Dev1 must be loaded; no login or tests performed.');
 await browser.evaluate(`(()=>{const name=${JSON.stringify(process.env.FOUNDRY_TEST_GM||'Gamemaster')},select=document.querySelector('select[name=userId]');if(select)select.value=[...select.options].find(o=>o.textContent.trim()===name).value;else document.querySelector('input[name=username]').value=name;document.querySelector('input[name=password]').value=${JSON.stringify(process.env.FOUNDRY_TEST_PASSWORD||'')};document.querySelector('button[name=join]').click();})()`);
 await browser.wait('globalThis.game?.ready && globalThis.canvas?.ready && !!game.modules.get("morelord-game-master")?.api',60000);
 if(await browser.evaluate('game.world.id')!=='dev1')throw Error('Not Dev1.');
 await fs.mkdir('tests/in-game-reports',{recursive:true});
 await browser.evaluate(`globalThis.morelordBulkCoinsCapture=async messageId=>{globalThis.morelordBulkCoinsCaptureReady=messageId;await new Promise(resolve=>globalThis.morelordBulkCoinsCaptureContinue=resolve);}`);
 const config=await browser.evaluate('foundry.utils.deepClone(game.settings.get("core","uiConfig"))');
 const visuals=[];let completed=false;
 const run=browser.evaluate(`await (async()=>{const {runInGameTests}=await import('./modules/morelord-core/scripts/testing/in-game.js');const {bulkCoinsCheck}=await import('./modules/morelord-game-master/scripts/testing/bulk-coins.mjs');return runInGameTests({checks:[bulkCoinsCheck]});})()`);
 run.then(()=>{completed=true},()=>{completed=true});
 while(!completed) {
  if(await browser.evaluate('!!globalThis.morelordBulkCoinsCaptureReady')) {
   try {
    await browser.evaluate(`await foundry.applications.instances.get('hero-mancer-welcome')?.close();for(const app of foundry.applications.instances.values())if(app.title?.includes('Vision 5e'))await app.close();document.getElementById('notifications')?.setAttribute('hidden','')`);
    for(const theme of ['dark','light'])for(const width of [1280,700]) {
     await browser.command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
     await browser.evaluate('game.configureUI({...game.settings.get("core","uiConfig"),colorScheme:{applications:'+JSON.stringify(theme)+',interface:'+JSON.stringify(theme)+'}})');
     await new Promise(resolve=>setTimeout(resolve,150));
     const bounds=await browser.evaluate(`(()=>{const r=document.querySelector('#mlgm .gm-tray').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()`);
     const file='tests/in-game-reports/2026-10-22-bulk-coins-'+theme+'-'+width+'.png';
     await fs.writeFile(file,Buffer.from((await browser.command('Page.captureScreenshot',{format:'png',clip:bounds})).data,'base64'));
     const checks=await browser.evaluate(`(()=>{const form=document.querySelector('[data-mlgm-bulk-coins]'),buttons=[...document.querySelectorAll('[data-action=bulk-coins-clear],[data-action=bulk-coins]')];return {pageOverflow:document.documentElement.scrollWidth>innerWidth,formOverflow:form.scrollWidth>form.clientWidth+1,buttons:buttons.length,coinRow:[...form.querySelectorAll('.ml-stepper')].every(el=>Math.abs(el.getBoundingClientRect().top-form.querySelector('.ml-stepper').getBoundingClientRect().top)<1),buttonRow:Math.abs(buttons[0].getBoundingClientRect().bottom-form.querySelector('.ml-stepper').getBoundingClientRect().bottom)<1,readableButtons:buttons.every(button=>button.scrollWidth<=button.clientWidth+1)};})()`);
     visuals.push({theme,width,...checks,file});
     if(checks.pageOverflow||checks.formOverflow||!checks.coinRow||!checks.buttonRow||!checks.readableButtons)throw Error('Bulk layout overflow at '+theme+' '+width);
    }
    await browser.command('Emulation.setDeviceMetricsOverride',{width:640,height:450,deviceScaleFactor:2,mobile:false});
    const zoom=await browser.evaluate(`(()=>{const button=document.querySelector('[data-action=bulk-coins]');button.focus();button.scrollIntoView({block:'nearest'});const r=button.getBoundingClientRect();return {reachable:r.top>=0&&r.bottom<=innerHeight,pageOverflow:document.documentElement.scrollWidth>innerWidth};})()`);
    visuals.push({effectiveZoom:'200%',...zoom});if(!zoom.reachable||zoom.pageOverflow)throw Error('Bulk controls are unreachable at effective 200% zoom');
   } finally {
    await browser.command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    await browser.evaluate('game.configureUI('+JSON.stringify(config)+');document.getElementById("notifications")?.removeAttribute("hidden");globalThis.morelordBulkCoinsCaptureReady=null;globalThis.morelordBulkCoinsCaptureContinue()');
   }
  }
  if(!completed)await new Promise(resolve=>setTimeout(resolve,100));
 }
 const report=await run;report.visualChecks=visuals;report.browserErrors=browser.errors;
 await fs.writeFile('tests/in-game-reports/2026-10-22-bulk-coins.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({summary:report.summary,results:report.results,visuals,browserErrors:browser.errors},null,2));if(!report.ok)process.exitCode=1;
} finally {await browser.close();}
