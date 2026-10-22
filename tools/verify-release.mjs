import {startBrowser} from '../tests/browser-driver.mjs';
import fs from 'node:fs/promises';
const base=process.env.FOUNDRY_TEST_URL || 'http://127.0.0.1:31400';
const selected=(process.argv.find(a=>a.startsWith('--checks='))?.split('=')[1]||'').split(',').filter(Boolean);
const browser=await startBrowser();
try {
 await browser.command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await browser.command('Page.navigate',{url:base+'/join'});
 await browser.wait('!!document.querySelector("select[name=userId],input[name=username]")',30000);
 if((await browser.evaluate('document.title')).trim().toLowerCase()!=='dev1')throw Error('Dev1 must be loaded; no login or tests performed.');
 await browser.evaluate(`(()=>{const name=${JSON.stringify(process.env.FOUNDRY_TEST_GM||'Chuck')},select=document.querySelector('select[name=userId]');if(select)select.value=[...select.options].find(o=>o.textContent.trim()===name).value;else document.querySelector('input[name=username]').value=name;document.querySelector('input[name=password]').value=${JSON.stringify(process.env.FOUNDRY_TEST_PASSWORD||'')};document.querySelector('button[name=join]').click();})()`);
 await browser.wait('globalThis.game?.ready && globalThis.canvas?.ready && !!game.modules.get("morelord-game-master")?.api',60000);
 if(await browser.evaluate('game.world.id')!=='dev1')throw Error('Not Dev1.');
 await browser.wait('!!game.modules.get("morelord-craftworks")?.api?.deleriumSearch',60000);
 await browser.evaluate('globalThis.mlgmReleaseChecks='+JSON.stringify(selected));
 const report=await browser.evaluate(`await (async()=>{
  const {runInGameTests}=await import('./modules/morelord-core/scripts/testing/in-game.js');
  const checks=[];
  for(const [file,names] of [
   ['in-game',['gameMasterChecks']],['completed-rolls',['completedRollCheck']],['macro-triggers',['macroTriggerCheck','fateCheck']],['ammo-recovery',['ammoRecoveryCheck']],['critical-triggers',['criticalTriggersCheck']],['trigger-footer',['triggerFooterCheck']],['panel',['panelChecks']],['default-triggers',['defaultTriggersCheck','emptyGlobalCatalogCheck']],['lucky-finds',['luckyFindChecks']],['world-clock',['worldClockChecks']],['mass-combat',['massCombatCheck']],['smithy',['smithyCheck']]
  ]){if(mlgmReleaseChecks.length&&!mlgmReleaseChecks.includes(file))continue;const module=await import('./modules/morelord-game-master/scripts/testing/'+file+'.mjs');for(const name of names)checks.push(...[module[name]].flat());}
  if(!mlgmReleaseChecks.length || mlgmReleaseChecks.includes('native-activities')) {const {massCombatActivitiesCheck}=await import('./modules/morelord-encounters/scripts/testing/mass-combat-activities.mjs');checks.push(massCombatActivitiesCheck);const {combinedAttackCheck}=await import('./modules/morelord-encounters/scripts/testing/combined-attacks.mjs');checks.push(combinedAttackCheck);}
  const before={actors:game.actors.map(a=>a.id),scenes:game.scenes.map(s=>s.id),messages:game.messages.map(m=>m.id),macros:game.macros.map(m=>m.id),tables:game.tables.map(t=>t.id),board:JSON.stringify(game.settings.get('morelord-game-master','board'))};
  const result=await runInGameTests({checks});
  await game.settings.set('morelord-game-master','board',JSON.parse(before.board));
  result.environment.world=game.world.id;
  result.cleanup={};for(const key of ['actors','scenes','messages','macros','tables'])result.cleanup[key]=game[key].filter(d=>!before[key].includes(d.id)).map(d=>({id:d.id,name:d.name,flags:d.flags['morelord-game-master']}));result.cleanup.boardRestored=JSON.stringify(game.settings.get('morelord-game-master','board'))===before.board;
  return result;
 })()`);
 if(process.argv.includes('--capture')) {
  const config=await browser.evaluate('foundry.utils.deepClone(game.settings.get("core","uiConfig"))');
  const wasOpen=await browser.evaluate('document.body.classList.contains("mlgm-open")');
  report.visualChecks=[];
  try {
   await browser.evaluate('foundry.applications.instances.get("hero-mancer-welcome")?.close();game.modules.get("morelord-game-master").api.toggle(true)');
   for(const theme of ['dark','light']) {
    await browser.evaluate('game.configureUI({...game.settings.get("core","uiConfig"),colorScheme:{applications:'+JSON.stringify(theme)+',interface:'+JSON.stringify(theme)+'}})');
    for(const width of [1280,700]) {
     await browser.command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
     for(const tab of ['rolls','triggers']) {
      await browser.evaluate('document.querySelector("#mlgm-tab-'+tab+'").click()');
      await new Promise(r=>setTimeout(r,300));
      const details=await browser.evaluate('(()=>{const tray=document.querySelector("#mlgm .gm-tray");return {pageOverflow:document.documentElement.scrollWidth>innerWidth,trayOverflow:tray.scrollWidth>tray.clientWidth+1,columns:getComputedStyle(document.querySelector(".gm-specialty-grid")||tray).gridTemplateColumns};})()');
      const file='tests/in-game-reports/2026-10-22-release-'+theme+'-'+width+'-'+tab+'.png';
      await fs.writeFile(file,Buffer.from((await browser.command('Page.captureScreenshot',{format:'png'})).data,'base64'));
      report.visualChecks.push({theme,width,tab,...details,file});
     }
    }
   }
  } finally {await browser.evaluate('game.configureUI('+JSON.stringify(config)+');game.modules.get("morelord-game-master").api.toggle('+JSON.stringify(wasOpen)+')');}
 }
 report.browserErrors=browser.errors;
 await fs.mkdir('tests/in-game-reports',{recursive:true});
 await fs.writeFile('tests/in-game-reports/2026-10-22-release-dev1.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({visualChecks:report.visualChecks,summary:report.summary,results:report.results,cleanup:report.cleanup,browserErrorCount:report.browserErrors.length},null,2));if(!report.ok)process.exitCode=1;
} finally {await browser.close();}
