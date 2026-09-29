import {spawn} from 'node:child_process';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const profile=await mkdtemp(path.join(os.tmpdir(),'smithy-browser-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
],{windowsHide:true,stdio:['ignore','ignore','pipe']});

const keepAlive=setInterval(()=>{},1000);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let socket;
try {
  let port;
  for(let i=0;i<100;i++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(100);}}
  let targets;
  for(let i=0;i<30;i++){try{targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();if(targets.length)break;}catch{}await delay(100);}
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  let serial=0;const pending=new Map();
  socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
  const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=async expression=>{for(let i=0;i<300;i++){if(await evaluate(expression))return;await delay(200);}throw Error(`Timed out: ${expression}`);};
  socket.onclose=e=>console.error('CDP closed',e.code,e.reason);socket.onerror=e=>console.error('CDP error',e.message);
  await command('Runtime.enable');await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:'http://127.0.0.1:31400/join'});
  await wait('document.querySelector("input[name=username]")');
  if((await evaluate('document.title')).trim()!=='Dev1')throw Error('Unexpected world; stopped.');
  await evaluate(`document.querySelector('input[name=username]').value=${JSON.stringify(process.env.FOUNDRY_TEST_GM||'Chuck')};document.querySelector('input[name=password]').value=${JSON.stringify(process.env.FOUNDRY_TEST_PASSWORD||'')};document.querySelector('button[name=join]').click()`);
  await wait('globalThis.game?.ready && globalThis.canvas?.ready');

  if(await evaluate('game.world.id')!=='dev1')throw Error('Dev1 required');

  if(process.argv.includes('--install')) console.log(await evaluate(`(async()=>{const pack=game.packs.get('morelord-game-master.macros');const locked=pack.locked;try{await pack.configure({locked:false});const data=await foundry.utils.fetchJsonWithTimeout('modules/morelord-game-master/pack-source/macros/ammo-recovery.json');const macro=await pack.getDocument(data._id);if(macro)await macro.update({command:data.command});else await Macro.create(data,{pack:pack.collection,keepId:true});return "Installed Ammunition Recovery macro";}finally{await pack.configure({locked});}})()`));
  const report=await evaluate(`(async()=>{const {runInGameTests}=await import('./modules/morelord-core/scripts/testing/in-game.js');const {ammoRecoveryCheck}=await import('./modules/morelord-game-master/scripts/testing/ammo-recovery.mjs');return runInGameTests({checks:[ammoRecoveryCheck]});})()`);
  await writeFile(new URL('../tests/ammo-recovery-live-report.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {clearInterval(keepAlive);socket?.close();chrome.kill();await delay(500);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
