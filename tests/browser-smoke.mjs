// Dependency-free browser smoke test using Chrome's DevTools protocol.
import {spawn} from "node:child_process";
import http from "node:http";
import {readFile,mkdtemp,rm,mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import {createCompanion} from "../companion/server.mjs";
import { mkdir as mkdirWorkingDirectory } from 'node:fs/promises';
await mkdirWorkingDirectory(new URL('../tmp/', import.meta.url), {recursive: true});
const root=path.resolve(import.meta.dirname,".."), profile=await mkdtemp(path.join(path.resolve(import.meta.dirname, '../tmp'),"mlgm-chrome-"));
const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname.replace(/^\/morelord-core\//,'/modules/morelord-core/');const base=pathname.startsWith('/foundry/')?path.resolve(process.env.FOUNDRY_PUBLIC||'E:/Foundry14/App/resources/app/public'):pathname.startsWith('/modules/morelord-core/')?path.resolve(root,'../morelord-core'):root;const route=pathname.startsWith('/foundry/')?pathname.slice('/foundry'.length):base===root?pathname:pathname.slice('/modules/morelord-core'.length);const p=path.resolve(base,`.${route}`);if(!p.startsWith(base+path.sep))throw Error();res.setHeader('Content-Type',p.endsWith('.html')?'text/html':p.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const companion=createCompanion({directory:path.join(profile,'campaign-data'),origins:[`http://127.0.0.1:${server.address().port}`],apiKey:'test-only',model:'test-model',fetchImpl:async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:'Test answer from the campaign document.'}]}]})});
await new Promise(r=>companion.server.listen(0,'127.0.0.1',r));
const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try {
  let port;
  for(let i=0;i<100;i++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(100);}}
  if(!port)throw Error('Chrome did not start. Set CHROME_PATH to a Chrome/Edge executable.');
  let targets;
  for(let i=0;i<15;i++){try{targets=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)})).json();if(targets.length)break;}catch{}await delay(100);}
  if(!targets?.length)throw Error('Chrome debugging endpoint did not become available.');
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  let serial=0;const pending=new Map(),errors=[];
  socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true,replMode:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(50);}throw Error(`Timed out: ${expression}\n${errors.join('\n')}\n${await evaluate('location.href + " " + document.body.innerText.slice(0,1200)')}`);};
  const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(75);};
  await command('Runtime.enable');await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:850,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/tests/harness.html`});await wait('window.testReady');
  await click('[data-action="toggle"]');assert.equal(await evaluate('testState().hotbar'),'none');
  for (const [width,height] of [[1280,850],[1920,1080],[700,600]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate('Math.abs(document.querySelector(".gm-tray").getBoundingClientRect().height-innerHeight*.75)<1'),true);
    assert.equal(await evaluate('Math.abs(document.querySelector("#mlgm").getBoundingClientRect().width-innerWidth*.65)<1'),true);
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:850,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate('!!document.querySelector("#mlgm footer")'),false);
  assert.equal(await evaluate('document.querySelector("[data-roll-card=check] input[name=blind]").checked'),false);
  await evaluate('var blind=document.querySelector("[data-roll-card=check] input[name=blind]");blind.checked=true;blind.dispatchEvent(new Event("change",{bubbles:true}))');
  await wait('testState().board.last.check?.blind===true');
  assert.equal(await evaluate('document.querySelector("[data-roll-card=search] .gm-specialty-title").textContent'),'Delerium Search');
  assert.equal(await evaluate('document.querySelector("[data-roll-card=search] select[name=zoneId]")!==null && document.querySelector("[data-roll-card=fate] .gm-specialty-title").textContent==="Roll of Fate" && [...document.querySelectorAll("[data-roll-card=fate] select[name=scope] option")].map(option=>option.value).join(",")==="party,tokens" && !document.querySelector("[data-roll-card=fate] input[name=blind]")'),true);
  assert.equal(await evaluate(`(() => {
    const row=document.querySelector(".gm-request-row");
    const builderCard=row?.closest(".ml-card");
    const cards=[...document.querySelectorAll(".gm-specialty-card")];
    const aligned=card=> {
      const line=card.querySelector(".gm-specialty-row");
      const select=line?.querySelector("select");
      const button=line?.querySelector(".ml-icon-button");
      const title=card.querySelector(".gm-specialty-title");
      if(!line || !select || !button || !title || getComputedStyle(line).flexWrap!=="nowrap") return false;
      const mid=el=>{const box=el.getBoundingClientRect(); return (box.top+box.bottom)/2;};
      const parts=[select, button, line.querySelector(".ml-check")].filter(Boolean);
      return title.getBoundingClientRect().bottom<=line.getBoundingClientRect().top+2 && Math.max(...parts.map(mid))-Math.min(...parts.map(mid))<8 && select.getBoundingClientRect().right<=button.getBoundingClientRect().left && (card.dataset.rollCard==="fate")!==!!line.querySelector("input[name=blind]");
    };
    return document.querySelectorAll(".gm-request-row").length===1 && builderCard && getComputedStyle(builderCard).borderTopWidth!=="0px" && getComputedStyle(row).flexWrap==="nowrap" && cards.length===5 && cards.every(aligned);
  })()`), true);
  for (const [width, columns] of [[1280,3],[900,2],[390,1]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height:850,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".gm-specialty-grid")).gridTemplateColumns.split(" ").filter(Boolean).length'), columns);
    assert.equal(await evaluate('[...document.querySelectorAll(".gm-specialty-row")].every(line=>getComputedStyle(line).flexWrap==="nowrap" && line.scrollWidth<=line.clientWidth+1)'), true);
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:850,deviceScaleFactor:1,mobile:false});
  await evaluate('var type=document.querySelector("[data-roll-card=check] select[name=checkType]");type.value="ability";type.dispatchEvent(new Event("change",{bubbles:true}))');
  await wait('document.querySelector("[data-roll-card=check] select[name=checkId]").value==="wis" && [...document.querySelectorAll("[data-roll-card=check] label>span")].some(s=>s.textContent==="Ability")');
  await evaluate('var type=document.querySelector("[data-roll-card=check] select[name=checkType]");type.value="skill";type.dispatchEvent(new Event("change",{bubbles:true}))');
  await wait('document.querySelector("[data-roll-card=check] select[name=checkId]").value==="prc" && [...document.querySelectorAll("[data-roll-card=check] label>span")].some(s=>s.textContent==="Skill")');

  await click('[data-action="send-check"]');await wait('game.messages.size===1');assert.equal(await evaluate('!!document.querySelector("dialog")'),false);
  await click('[data-mlgm-actor="actor0"][data-mlgm-mode="normal"]');await wait('game.messages.size===2');
  assert.equal(await evaluate('game.messages.some(m=>m.getFlag("morelord-game-master","summary"))'),false);
  await click('[data-mlgm-actor="actor1"][data-mlgm-mode="normal"]');await click('[data-mlgm-actor="actor2"][data-mlgm-mode="normal"]');await wait('game.messages.size===5');
  assert.match(await evaluate('game.messages.find(m=>m.getFlag("morelord-game-master","summary"))?.content'),/Average: 11.00/);
  assert.doesNotMatch(await evaluate('document.querySelector("#mlgm-panel").textContent'),/Average|received/);
  assert.equal(await evaluate('document.querySelector("[data-roll-card=check] select[name=scope]").value'),'party');
  await evaluate('var die=document.querySelector("[data-roll-card=encounter] select[name=die]");die.value="12";die.dispatchEvent(new Event("change",{bubbles:true}))');
  await wait('testState().board.last.encounter?.die===12');
  await evaluate('var blind=document.querySelector("[data-roll-card=encounter] input[name=blind]");blind.checked=false;blind.dispatchEvent(new Event("change",{bubbles:true}))');
  await wait('testState().board.last.encounter?.blind===false');
  await click('[data-action="quick-request"][data-id="encounter"]');await wait('game.messages.size===6');
  await click('[data-action="tab"][data-id="party"]');
  await evaluate('var choice=document.querySelectorAll("input[name=actorUuids]")[2];choice.checked=false;choice.dispatchEvent(new Event("change",{bubbles:true}))');
  await wait('testState().board.partyActorIds?.length===2');
  await click('[data-action="tab"][data-id="rolls"]');
  assert.equal(await evaluate('document.querySelector("[data-roll-card=encounter] select[name=die]").value'),'12');
  assert.equal(await evaluate('document.querySelector("[data-roll-card=check] input[name=blind]").checked'),true);
  assert.equal(await evaluate('document.querySelector("[data-roll-card=encounter] input[name=blind]").checked'),false);
  assert.equal(await evaluate('document.querySelector("#mlgm-panel").classList.contains("ml-surface")'),false);
  await click('[data-action="tab"][data-id="macros"]');assert.equal(await evaluate('document.querySelectorAll("[data-macro-uuid]").length'),0);
  await evaluate('var transfer=new DataTransfer();transfer.setData("text/plain",JSON.stringify({type:"Macro",uuid:"Macro.macro"}));document.querySelector("#mlgm-panel").dispatchEvent(new DragEvent("drop",{bubbles:true,dataTransfer:transfer}))');await wait('document.querySelectorAll("[data-macro-uuid]").length===1');
  assert.equal(await evaluate('document.querySelector("[data-macro-uuid] span").textContent'),'Start encounter');
  assert.equal(await evaluate('document.querySelector("[data-macro-uuid]").title'),'Start encounter');
  assert.equal(await evaluate('document.querySelector("[data-macro-uuid] img").getBoundingClientRect().right <= document.querySelector("[data-macro-uuid] span").getBoundingClientRect().left'),true);
  await click('[data-action="macro"]');assert.equal(await evaluate('testState().macroRuns'),1);
  for(let i=0;i<11;i++) {
    await evaluate(`game.macros.set('extra${i}',{id:'extra${i}',uuid:'Macro.extra${i}',name:'Extra ${i}',canExecute:true,img:'icons/svg/dice-target.svg'});var transfer=new DataTransfer();transfer.setData('text/plain',JSON.stringify({type:'Macro',uuid:'Macro.extra${i}'}));document.querySelector('#mlgm-panel').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}))`);
    await wait(`document.querySelectorAll('[data-macro-uuid]').length===${i+2}`);
  }
  assert.equal(await evaluate('document.querySelectorAll("[data-macro-uuid]").length'),12);
  await evaluate('(()=>{const pins=[...document.querySelectorAll("[data-macro-uuid]")];const transfer=new DataTransfer();pins.at(-1).dispatchEvent(new DragEvent("dragstart",{bubbles:true,dataTransfer:transfer}));pins[0].dispatchEvent(new DragEvent("drop",{bubbles:true,dataTransfer:transfer}));pins.at(-1).dispatchEvent(new DragEvent("dragend",{bubbles:true}));pins.at(-1).click();})()');
  await wait('JSON.stringify(game.settings.get("morelord-game-master","macros"))===JSON.stringify(["Macro.extra10","Macro.macro","Macro.extra0","Macro.extra1","Macro.extra2","Macro.extra3","Macro.extra4","Macro.extra5","Macro.extra6","Macro.extra7","Macro.extra8","Macro.extra9"])');
  assert.equal(await evaluate('testState().macroRuns'),1);
  await evaluate('game.macros.get("macro").name="A very long macro name that cannot fit beside its icon in a compact row";document.querySelector("[data-action=tab][data-id=macros]").click()');
  await wait('document.querySelector("[data-macro-uuid=\\"Macro.macro\\"] span").textContent.startsWith("A very long")');
  assert.equal(await evaluate('document.querySelector("[data-macro-uuid=\\"Macro.macro\\"]").title'),'A very long macro name that cannot fit beside its icon in a compact row');
  assert.equal(await evaluate('(()=>{const name=document.querySelector("[data-macro-uuid=\\"Macro.macro\\"] span");const style=getComputedStyle(name);return style.textOverflow==="ellipsis" && style.whiteSpace==="nowrap" && name.scrollWidth>name.clientWidth;})()'),true);
  await evaluate('document.querySelector("[data-macro-uuid]").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true}))');await click('#context-menu button');assert.equal(await evaluate('game.macros.has("macro")'),true);
  await evaluate('var music=game.playlists.get("music");music.mode=-1;var oldSound={id:"old",playing:true};game.playlists.set("old",{id:"old",name:"Previous music",getFlag:()=>false,sounds:new game.playlists.constructor([["old",oldSound]]),async stopAll(){oldSound.playing=false;}})');
  await click('[data-action="tab"][data-id="sound"]');await click('[data-action="playlist"]');await click('dialog button[value="0"]');await wait('testState().board.saved.some(s=>s.type==="playlist")');
  assert.equal(await evaluate('game.playlists.get("music").sounds.get("sound").playing'),false);
  await click('[data-action="saved"]');await wait('game.playlists.get("music").sounds.get("sound").playing');
  assert.equal(await evaluate('game.playlists.get("music").mode'),1);assert.equal(await evaluate('oldSound.playing'),false);
  assert.equal(await evaluate('document.querySelector("[data-action=stop-music]").closest(".gm-column").querySelector("strong").textContent'),'Now Playing');
  await click('[data-action="stop-music"]');assert.equal(await evaluate('!!document.querySelector("[data-action=stop-music]")'),false);
  await evaluate('var board=game.settings.get("morelord-game-master","board");board.triggers=[{id:"sneak",name:"Sneak Attack",kind:"sneak",enabled:false},{id:"clock",name:"World Clock",kind:"world-clock",enabled:false,gameMinutes:10,realMinutes:1}];game.settings.set("morelord-game-master","board",board)');
  await click('[data-action="tab"][data-id="triggers"]');
  assert.equal(await evaluate('document.querySelector("[data-action=new-trigger]")'),null);
  await wait('document.querySelectorAll(".gm-trigger-card").length===2');
  assert.equal(await evaluate(`(()=>{
    const cards=[...document.querySelectorAll(".gm-trigger-card")];
    const headerOk=cards.every(card=>{
      const header=card.querySelector(".gm-trigger-header");
      const parts=[header.querySelector(".gm-trigger-name"),header.querySelector(".gm-trigger-scope"),header.querySelector(".gm-trigger-status"),header.querySelector("[data-action=trigger-toggle]")];
      if(parts.some(part=>!part)) return false;
      const mids=parts.map(part=>{const box=part.getBoundingClientRect();return (box.top+box.bottom)/2;});
      const style=getComputedStyle(card), children=[...card.children];
      const gap=parseFloat(style.rowGap||style.gap)||0;
      const content=children.reduce((sum,el)=>sum+el.getBoundingClientRect().height,0)+gap*Math.max(0,children.length-1)+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth);
      return Math.max(...mids)-Math.min(...mids)<4 && getComputedStyle(header).flexWrap==="nowrap" && !/\\b(Running|Stopped|Unavailable)\\b/.test(card.innerText) && card.querySelectorAll(".gm-trigger-rule > div").length===2 && Math.abs(card.getBoundingClientRect().height-content)<3 && getComputedStyle(card).alignSelf==="start";
    });
    const heights=cards.map(card=>card.getBoundingClientRect().height);
    return headerOk && heights[1] > heights[0] + 8;
  })()`),true);
  await mkdir(path.join(root,'test-results'),{recursive:true});
  const triggerShot=await command('Page.captureScreenshot',{format:'png'});await writeFile(path.join(root,'test-results','triggers.png'),Buffer.from(triggerShot.data,'base64'));
  await click('[data-action="tab"][data-id="ai"]');assert.equal(await evaluate('document.querySelector("[data-action=ai-send]").disabled'),true);
  await evaluate('new (game.settings.menus.get("morelord-game-master.configure").type)().render()');
  await evaluate(`document.querySelector('dialog input[name=url]').value='http://127.0.0.1:${companion.server.address().port}';document.querySelector('dialog input[name=token]').value='${companion.token}'`);
  await click('dialog button[value="0"]');await click('[data-action="ai-connect"]');await wait('!document.querySelector("[data-action=ai-create]").disabled');
  await click('[data-action="ai-create"]');await evaluate('document.querySelector("dialog input[name=name]").value="North campaign"');await click('dialog button[value="0"]');await wait('!!document.querySelector("#mlgm-upload")');
  await evaluate('document.querySelector("#mlgm-prompt").value="North draft";document.querySelector("#mlgm-prompt").dispatchEvent(new Event("input",{bubbles:true}))');
  await click('[data-action="ai-create"]');await evaluate('document.querySelector("dialog input[name=name]").value="South campaign"');await click('dialog button[value="0"]');await delay(100);
  assert.equal(await evaluate('document.querySelector("#mlgm-prompt").value'),'');
  await evaluate('var chooser=document.querySelector("#mlgm-campaign");chooser.value=[...chooser.options].find(o=>o.text==="North campaign").value;chooser.dispatchEvent(new Event("change",{bubbles:true}))');await wait('document.querySelector("#mlgm-prompt").value==="North draft"');
  const uploadPath=path.join(profile,'notes.txt');await writeFile(uploadPath,'The tower is north.');
  const dom=await command('DOM.getDocument'),fileInput=await command('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#mlgm-upload'});
  await command('DOM.setFileInputFiles',{nodeId:fileInput.nodeId,files:[uploadPath]});await wait('document.querySelector("#mlgm-panel").textContent.includes("notes.txt")');
  await click('[data-action="ai-send"]');await wait('document.querySelector(".gm-chat").textContent.includes("Test answer")');assert.equal(await evaluate('document.querySelector("#mlgm-prompt").value'),'');
  await mkdir(path.join(root,'test-results'),{recursive:true});
  const aiShot=await command('Page.captureScreenshot',{format:'png'});await writeFile(path.join(root,'test-results','campaign-ai.png'),Buffer.from(aiShot.data,'base64'));
  await click('[data-action="ai-remove-file"]');await wait('!document.querySelector("#mlgm-panel").textContent.includes("notes.txt")');
  await click('[data-action="tab"][data-id="rolls"]');
  const scrollReport=await evaluate('var {checkScrollPreservation}=await import("/tests/scroll-regression.mjs");await checkScrollPreservation()');
  console.log(JSON.stringify({offlineScroll:scrollReport}));
  await mkdir(path.join(root,'test-results'),{recursive:true});
  const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(path.join(root,'test-results','tray-desktop.png'),Buffer.from(shot.data,'base64'));
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
  assert.equal(await evaluate('[...document.querySelectorAll(".gm-request-row")].every(row=>getComputedStyle(row).flexWrap==="nowrap") && getComputedStyle(document.querySelector(".gm-specialty-grid")).gridTemplateColumns.split(" ").filter(Boolean).length===1'),true);
  assert.equal(await evaluate('document.querySelector("#mlgm-tab-settings").textContent'),'GM Settings');
  const mobile=await command('Page.captureScreenshot',{format:'png'});await writeFile(path.join(root,'test-results','tray-mobile.png'),Buffer.from(mobile.data,'base64'));
  assert.equal(await evaluate('testState().board.saved.some(s=>s.type==="group" || s.type==="player")'),false);
  await click('[data-action="tab"][data-id="settings"]');
  await evaluate('var fate=document.querySelector("[name=specialty][value=fate]");fate.checked=false;fate.dispatchEvent(new Event("change",{bubbles:true}))');
  await wait('game.settings.get("morelord-game-master","showFate")===false');
  await click('[data-action="tab"][data-id="rolls"]');
  assert.equal(await evaluate('!!document.querySelector("[data-roll-card=fate]")'),false);
  assert.equal(await evaluate('document.querySelector("[data-roll-card=search] .gm-specialty-title").textContent==="Delerium Search" && document.querySelectorAll(".gm-specialty-card").length===4'),true);

  await click('[data-action="toggle"]');assert.notEqual(await evaluate('testState().hotbar'),'none');
  await evaluate('document.querySelector("#hotbar").style.display="none"');await click('[data-action="toggle"]');await click('[data-action="toggle"]');assert.equal(await evaluate('testState().hotbar'),'none');
  assert.deepEqual(errors,[]);assert.equal(await evaluate('window.lastError'),undefined);
  console.log('Browser checks passed: compact request builder, ability dropdown, party skill summary, encounter quick request, specialty settings, macro pins and reorder, compact trigger cards, playlist controls, no New Trigger button, authenticated companion, campaign creation/switching, draft isolation, file upload/removal, chat, narrow layout, and hotbar restoration.');
  console.log('Screenshots: test-results/tray-desktop.png and tray-mobile.png. Foundry APIs are mocked in this harness.');
} finally {
  socket?.close();chrome.kill();await new Promise(r=>server.close(r));await new Promise(r=>companion.server.close(r));
  await delay(500);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
