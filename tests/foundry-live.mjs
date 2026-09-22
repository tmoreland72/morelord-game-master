import {startBrowser} from "./browser-driver.mjs";
import {writeFile,mkdir} from "node:fs/promises";
import {inGameTestSkipReason} from "../../morelord-core/scripts/testing/in-game.js";
async function main() {
const browser=await startBrowser();
try {
  await browser.command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await browser.command('Page.navigate',{url:process.env.FOUNDRY_TEST_URL||'http://127.0.0.1:31400/join'});
  await browser.wait('!!document.querySelector("input[name=username]")',30000);
  const state=await browser.evaluate('({worldId:game.world?.id ?? game.data?.world?.id,users:game.data?.users?.map(u=>({name:u.name,role:u.role,active:u.active})),form:document.querySelector("form")?.innerText})');
  console.log(JSON.stringify(state));
  const skip=inGameTestSkipReason({id:state.worldId});
  if(skip){console.log(JSON.stringify({skipped:true,reason:skip}));return;}
  if(!process.env.FOUNDRY_TEST_GM)process.exitCode=2;
  else {
    await browser.evaluate(`document.querySelector('input[name=username]').value=${JSON.stringify(process.env.FOUNDRY_TEST_GM)};document.querySelector('input[name=password]').value=${JSON.stringify(process.env.FOUNDRY_TEST_PASSWORD||'')};document.querySelector('button[name=join]').click()`);
    await browser.wait('globalThis.game?.ready && !!globalThis.MorelordCore',60000);
    const loadedWorld=await browser.evaluate('game.world?.id');
    const loadedSkip=inGameTestSkipReason({id:loadedWorld});
    if(loadedSkip){console.log(JSON.stringify({skipped:true,reason:loadedSkip}));return;}
    console.log(JSON.stringify(await browser.evaluate('({world:game.world.id,core:game.modules.get("morelord-core")?.version,module:game.modules.get("morelord-game-master")?.active,api:!!game.modules.get("morelord-game-master")?.api})')));
    if(process.env.MLGM_RUN_LIVE==='1'){
      console.log(JSON.stringify({startupErrors:browser.errors}));
      await browser.wait('!!game.modules.get("morelord-craftworks")?.api?.deleriumSearch',60000);
      await browser.evaluate('[...document.querySelectorAll(".window-title")].find(el=>el.textContent.includes("Welcome to Hero Mancer"))?.closest(".application")?.querySelector("[data-action=close]")?.click()');
      const report=await browser.evaluate('var {gameMasterChecks}=await import("./modules/morelord-game-master/scripts/testing/in-game.mjs");var {runInGameTests}=await import("./modules/morelord-core/scripts/testing/in-game.js");await runInGameTests({checks:gameMasterChecks})');
      await mkdir('test-results',{recursive:true});await writeFile('test-results/live-foundry.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
      const screenshot=await browser.command('Page.captureScreenshot',{format:'png'});await writeFile('test-results/live-foundry.png',Buffer.from(screenshot.data,'base64'));
      if(!report.ok)process.exitCode=1;
    }
    if(process.env.MLGM_MULTIPLAYER==='1'){
      const player=await startBrowser();let fixture;
      try{
        await player.command('Page.navigate',{url:'http://127.0.0.1:31400/join'});await player.wait('!!document.querySelector("input[name=username]")',30000);
        await player.evaluate('document.querySelector("input[name=username]").value="Graypes";document.querySelector("input[name=password]").value="";document.querySelector("button[name=join]").click()');
        await player.wait('globalThis.game?.ready && !!game.modules.get("morelord-game-master")?.api',60000);
        const playerId=await player.evaluate('game.user.id');
        fixture=await browser.evaluate(`var actor=await Actor.create({name:"MLGM multiplayer fixture",type:"character",ownership:{default:0,[${JSON.stringify(playerId)}]:3}});var requests=await import("./modules/morelord-game-master/scripts/requests.mjs");var request=await requests.createRequest({kind:"skill",skill:"prc",dc:12,actorIds:[actor.id]});({actorId:actor.id,requestId:request.id})`);
        await player.wait(`!!game.messages.get(${JSON.stringify(fixture.requestId)})`);
        const checks=await player.evaluate(`({tray:!!document.querySelector('#mlgm'),button:!!document.querySelector('[data-message-id="${fixture.requestId}"] [data-mlgm-actor="${fixture.actorId}"]'),prompts:[...document.querySelectorAll('.application.dialog')].length})`);
        if(checks.tray || !checks.button)throw Error('Player did not receive the chat request, or received a GM tray.');
        const replies=await Promise.all([
          player.evaluate(`var requests=await import("./modules/morelord-game-master/scripts/requests.mjs");await requests.rollRequest(${JSON.stringify(fixture.requestId)},${JSON.stringify(fixture.actorId)},undefined,"adv")`),
          browser.evaluate(`await requests.rollRequest(${JSON.stringify(fixture.requestId)},${JSON.stringify(fixture.actorId)},undefined,"adv")`)
        ]);
        if(replies.some(r=>!r.accepted || 'total' in r))throw Error('Player/GM race returned an invalid acknowledgement.');
        const result=await browser.evaluate(`var results=game.messages.filter(m=>m.getFlag('morelord-game-master','result')?.requestId===${JSON.stringify(fixture.requestId)});({count:results.length,id:results[0]?.id,private:results[0]?.blind&&results[0].whisper.every(id=>game.users.get(id).isGM)})`);
        if(result.count!==1||!result.private)throw Error('Simultaneous clients produced duplicate or nonprivate results.');
        await player.wait(`game.messages.get(${JSON.stringify(fixture.requestId)})?.getFlag('morelord-game-master','request')?.completed?.length===1`);
        if(await player.evaluate(`!!game.messages.get(${JSON.stringify(result.id)})?.isContentVisible`))throw Error('Player can see the private result.');
        const offline=await browser.evaluate(`var offline=await requests.createRequest({kind:"skill",skill:"prc",dc:12,actorIds:[actor.id]});offline.id`);fixture.offlineId=offline;
        await player.close();
        await browser.wait(`!game.users.get(${JSON.stringify(playerId)}).active`,20000);
        await browser.evaluate(`await requests.rollRequest(${JSON.stringify(offline)},${JSON.stringify(fixture.actorId)})`);
        const report={ok:true,chatRequest:true,noPlayerTray:true,gmAndPlayerRace:true,privateResult:true,disconnectFallback:true};
        await writeFile('test-results/live-multiplayer.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
      } finally {
        await player.close().catch(()=>{});
        if(fixture)await browser.evaluate(`var ids=${JSON.stringify([fixture.requestId,fixture.offlineId].filter(Boolean))};await ChatMessage.deleteDocuments(game.messages.filter(m=>ids.includes(m.id)||ids.includes(m.getFlag('morelord-game-master','result')?.requestId)||ids.includes(m.getFlag('morelord-game-master','summary')?.requestId)).map(m=>m.id));await game.actors.get(${JSON.stringify(fixture.actorId)})?.delete();true`);
      }
    }
    if(process.env.MLGM_INSTALL_TRIGGERS==='1') {
      const installed=await browser.evaluate(`var api=game.modules.get('morelord-game-master').api;await api.addTrigger({name:'Sneak Attack',kind:'sneak',actorId:'1c2n8qWMYl3rXPpe',itemId:'YmVXPDayCkqlAoUq'});await api.addTrigger({name:'Wild Magic Surge',kind:'sorcerer',actorId:'kvdHdccUF1gVumUm',tableUuid:'Compendium.morelord-compendium.tables-1.RollTable.aDMFCKJcdKaJjTc6'});game.settings.get('morelord-game-master','board').triggers.filter(t=>['sneak','sorcerer'].includes(t.kind)).map(t=>({id:t.id,name:t.name,actorId:t.actorId,enabled:t.enabled}))`);
      console.log(JSON.stringify({installed}));
    }
    await browser.evaluate('game.modules.get("morelord-game-master").api.toggle(true)');
    await mkdir('test-results',{recursive:true});
    const shot=await browser.command('Page.captureScreenshot',{format:'png'});await writeFile('test-results/live-tray.png',Buffer.from(shot.data,'base64'));
  }
} finally {await browser.close();}

}
await main();
