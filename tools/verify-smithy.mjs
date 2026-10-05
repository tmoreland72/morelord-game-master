import { mkdir as mkdirWorkingDirectory } from 'node:fs/promises';
const localWorkingDirectory = new URL('../tmp/', import.meta.url);
await mkdirWorkingDirectory(localWorkingDirectory, {recursive: true});
// Explicit user-authorized exception: inspect/test The Scar in Drakkenheim (Thursdays).
// No other scene/world is accepted. Browser profile is disposable.
import {spawn} from 'node:child_process';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const profile=await mkdtemp(path.join(path.resolve(import.meta.dirname, '../tmp'),'smithy-browser-'));
const chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[
  '--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'
],{windowsHide:true,stdio:'ignore'});
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
  await command('Runtime.enable');await command('Page.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:'http://127.0.0.1:31400/join'});
  await wait('document.querySelector("input[name=username]")');
  if((await evaluate('document.title')).trim()!=='Drakkenheim (Thursdays)')throw Error('Unexpected world; stopped.');
  await evaluate(`document.querySelector('input[name=username]').value=${JSON.stringify(process.env.FOUNDRY_TEST_GM||'Chuck')};document.querySelector('input[name=password]').value=${JSON.stringify(process.env.FOUNDRY_TEST_PASSWORD||'')};document.querySelector('button[name=join]').click()`);
  await wait('globalThis.game?.ready && globalThis.canvas?.ready');
  console.log(JSON.stringify(await evaluate(`({world:game.world.id,system:game.system.version,user:game.user.name,gm:game.user.isGM,scenes:game.scenes.filter(s=>/scar/i.test(s.name)).map(s=>({id:s.id,name:s.name,grid:{type:s.grid.type,size:s.grid.size},tokens:s.tokens.size,rect:s.dimensions.sceneRect})),actors:game.actors.filter(a=>/haze husk|haze hulk|ratling|chimera/i.test(a.name)).map(a=>({id:a.id,uuid:a.uuid,name:a.name,type:a.type})),core:!!globalThis.MorelordCore,coordinator:MorelordCore.users.list().find(u=>u.active&&u.isGM)?.name})`),null,2));
  if(process.argv.includes('--select-troops')) {
    const data=JSON.parse(await readFile(new URL('../macros/select-troops/select-npcs.json',import.meta.url),'utf8'));
    await evaluate('globalThis.npcPickerDefinition='+JSON.stringify(data));
    console.log(JSON.stringify(await evaluate(await readFile(new URL('./verify-npc-picker.js',import.meta.url),'utf8')),null,2));
    const capture=await command('Page.captureScreenshot',{format:'png'});
    await writeFile(new URL('../tests/npc-picker.png',import.meta.url),Buffer.from(capture.data,'base64'));
  }
  if(process.argv.includes('--inspect')) console.log(JSON.stringify(await evaluate(`(()=>{const s=game.scenes.get('PNczK53V7aOnK84v');return {token:s.tokens.get('xJCY27E0NN2oAUUZ')?.toObject(),state:s.getFlag('morelord-game-master','smithyAtTheScar'),remainingFixtures:s.tokens.filter(t=>t.getFlag('morelord-game-master','smithyAtTheScar')).map(t=>({id:t.id,name:t.name})),combats:game.combats.filter(c=>c.scene?.id===s.id).map(c=>({id:c.id,round:c.round,size:c.combatants.size})),users:game.users.filter(u=>u.isGM).map(u=>({id:u.id,name:u.name,active:u.active}))}})()`),null,2));
  if(process.argv.includes('--mass-test')) {
    await evaluate(`globalThis.massCombatSource=${JSON.stringify(await readFile(new URL('../scripts/mass-combat.mjs',import.meta.url),'utf8'))}`);
    const result=await evaluate(await readFile(new URL('../tests/mass-combat-live.js',import.meta.url),'utf8'));
    await writeFile(new URL('../tests/mass-combat-live-report.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2));
    const capture=await command('Page.captureScreenshot',{format:'png'});
    await writeFile(new URL('../tests/mass-combat-live.png',import.meta.url),Buffer.from(capture.data,'base64'));
  }
  if(process.argv.includes('--combat-fix-test')) {
    await evaluate(`globalThis.smithySource=${JSON.stringify(await readFile(new URL('../scripts/smithy-at-the-scar.mjs',import.meta.url),'utf8'))}`);
    const result=await evaluate(await readFile(new URL('../tests/smithy-combat-live.js',import.meta.url),'utf8'));
    await writeFile(new URL('../tests/smithy-combat-live-report.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2));
  }
  if(process.argv.includes('--repair-smithy')) {
    const regression=JSON.parse(await readFile(new URL('../tests/smithy-combat-live-report.json',import.meta.url),'utf8'));
    if(!regression.ok)throw Error('Combat regression must pass before repair.');
    const backup=await evaluate(`({world:game.world.id,scene:game.scenes.get('PNczK53V7aOnK84v').toObject(),combats:['9hjVaQ0KQWD0m5jS','8t801Wfqd19IK0jv'].map(id=>game.combats.get(id)?.toObject())})`);
    await writeFile(new URL('../tests/smithy-before-combat-repair.json',import.meta.url),JSON.stringify(backup,null,2)+'\n');
    await evaluate(`globalThis.smithySource=${JSON.stringify(await readFile(new URL('../scripts/smithy-at-the-scar.mjs',import.meta.url),'utf8'))}`);
    const result=await evaluate(await readFile(new URL('./repair-smithy-world.js',import.meta.url),'utf8'));
    await writeFile(new URL('../tests/smithy-combat-repair-report.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2));
  }
  if(process.argv.includes('--initiative-inspect')) console.log(JSON.stringify(await evaluate(`(()=>{
    const s=game.scenes.get('PNczK53V7aOnK84v'),state=s.getFlag('morelord-game-master','smithyAtTheScar');
    return {scene:s.name,currentCombat:game.combat?.id,viewedCombat:game.combats.viewed?.id,state:{...state,pending:state?.pending?{after:state.pending.after,label:state.pending.label,tokens:state.pending.tokens.map(t=>({id:t._id,exists:s.tokens.has(t._id)}))}:null},combats:game.combats.map(c=>({id:c.id,scene:c.scene?.id,active:c.active,round:c.round,combatants:c.combatants.map(x=>({id:x.id,tokenId:x.tokenId,name:x.name,initiative:x.initiative,sceneId:x.sceneId,exists:!!x.token}))})),waveTokens:s.tokens.filter(t=>t.getFlag('morelord-game-master','smithyAtTheScar')).map(t=>({id:t.id,name:t.name,actorId:t.actorId,marker:t.getFlag('morelord-game-master','smithyAtTheScar')}))};
  })()`),null,2));
  if(process.argv.includes('--mass-finish')) {
    const definitions=await Promise.all(['attackers','resolve','apply'].map(async action=>JSON.parse(await readFile(new URL(`../macros/mass-combat/${action}.json`,import.meta.url),'utf8'))));
    await evaluate(`globalThis.massMacroDefinitions=${JSON.stringify(definitions)}`);
    console.log(JSON.stringify(await evaluate(`(async()=>{
      if(game.world.id!=='drakkenheim'||game.user.name!=='Chuck')throw Error('Wrong world/account.');
      const id='morelord-game-master',key='massCombat',scene=game.scenes.get('PNczK53V7aOnK84v');
      globalThis.massOldState=foundry.utils.deepClone(game.user.getFlag(id,key));
      if(massOldState?.pendingId)throw Error('A real result is pending.');
      for(const data of massMacroDefinitions){const action=data.flags[id].massCombatMacro;const m=game.macros.find(m=>m.getFlag(id,'massCombatMacro')===action);if(!m)throw Error('Missing installed macro.');await m.update(data);}
      await scene.view();
      for(const app of [...foundry.applications.instances.values()])await app.close();
      const groups=new Map();for(const t of scene.tokens.filter(t=>t.actor?.type==='npc'&&t.actor.system.attributes.hp.value>0)){const group=groups.get(t.actorId)??[];group.push(t);groups.set(t.actorId,group);}
      const attackers=[...groups.values()].sort((a,b)=>b.length-a.length)[0];
      const targets=scene.tokens.filter(t=>t.actor?.type==='npc'&&t.actor.system.attributes.hp.value>0&&!attackers.includes(t)).slice(0,3);
      if(!attackers?.length||!targets.length)throw Error('No groups for non-damaging UI check.');
      canvas.tokens.releaseAll();for(const t of attackers)t.object.control({releaseOthers:false});
      const macro=action=>game.macros.find(m=>m.getFlag(id,'massCombatMacro')===action);
      await macro('attackers').execute();
      const state=foundry.utils.deepClone(game.user.getFlag(id,key));state.profile.attacks=2;await game.user.setFlag(id,key,state);
      await macro('attackers').execute();
      const remembered=game.user.getFlag(id,key);if(remembered.profile.attacks!==2)throw Error('Profile not retained.');
      canvas.tokens.releaseAll();for(const t of targets)t.object.control({releaseOthers:false});
      void macro('resolve').execute();
      return {attackers:attackers.length,profile:remembered.profile,macros:massMacroDefinitions.map(d=>({name:d.name,pinned:game.settings.get(id,'macros').includes(macro(d.flags[id].massCombatMacro).uuid)})),tokens:scene.tokens.size};
    })()`),null,2));
    await wait('document.querySelector("#morelord-game-master-mass-attack")');
    for(const width of [540,380]){
      await evaluate(`foundry.applications.instances.get('morelord-game-master-mass-attack').setPosition({width:${width}})`);await delay(400);
      const clip=await evaluate(`(()=>{const r=document.querySelector('#morelord-game-master-mass-attack').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
      const capture=await command('Page.captureScreenshot',{format:'png',clip});
      await writeFile(new URL(`../tests/mass-combat-form-${width}.png`,import.meta.url),Buffer.from(capture.data,'base64'));
    }
    await evaluate(`(async()=>{document.querySelector('#morelord-game-master-mass-attack [data-action="cancel"]').click();await MorelordCore.socket.runSerialized('morelord-game-master:massCombat:'+game.user.id,async()=>{if(massOldState===undefined)await game.user.unsetFlag('morelord-game-master','massCombat');else await game.user.setFlag('morelord-game-master','massCombat',massOldState);});canvas.tokens.releaseAll();})()`);
  }
  if(process.argv.includes('--finish')) {
    console.log(JSON.stringify(await evaluate(`(async()=>{
      if(game.world.id!=='drakkenheim'||game.user.name!=='Chuck'||!game.user.isGM)throw Error('Wrong world/account.');
      const id='morelord-game-master',s=game.scenes.get('PNczK53V7aOnK84v');
      const macros=game.macros.filter(m=>m.getFlag(id,'smithyMacro'));
      if(macros.length!==5)throw Error('Expected five installed macros.');
      for(const [action,img] of [['setup','upgrade'],['safe','shield']])await macros.find(m=>m.getFlag(id,'smithyMacro')===action).update({img:'icons/svg/'+img+'.svg'});
      await s.view();
      for(const app of [...foundry.applications.instances.values()])await app.close();
      void macros.find(m=>m.getFlag(id,'smithyMacro')==='status').execute();
      return {macros:macros.map(m=>({name:m.name,id:m.id,pinned:game.settings.get(id,'macros').includes(m.uuid)})),tokens:s.tokens.size,state:s.getFlag(id,'smithyAtTheScar'),testScenes:game.scenes.filter(s=>s.name==='The Scar — temporary macro test').length};
    })()`),null,2));
    await wait('document.querySelector("#morelord-game-master-smithy-status")');
    await delay(1000);
    const r=await evaluate(`(()=>{const r=document.querySelector('#morelord-game-master-smithy-status').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()`);
    const capture=await command('Page.captureScreenshot',{format:'png',clip:r});
    await writeFile(new URL('../tests/smithy-native-status.png',import.meta.url),Buffer.from(capture.data,'base64'));
    await evaluate(`document.querySelector('#morelord-game-master-smithy-status [data-action="close"]').click();document.querySelector('[data-action="toggle"]').click()`);
    await wait('document.querySelector("#mlgm-tab-macros")');
    await evaluate(`document.querySelector('#mlgm-tab-macros').click()`);
    await delay(500);
    console.log(JSON.stringify(await evaluate(`({macroButtons:document.querySelectorAll('[data-macro-uuid]').length,brokenImages:[...document.querySelectorAll('[data-macro-uuid] img')].filter(i=>!i.complete||!i.naturalWidth).length})`)));
  }
  if(process.argv.includes('--run')) {
    await evaluate(`globalThis.smithySource=${JSON.stringify(await readFile(new URL('../scripts/smithy-at-the-scar.mjs',import.meta.url),'utf8'))}`);
    let result;
    try { result=await evaluate(await readFile(new URL('../tests/smithy-live.js',import.meta.url),'utf8')); }
    catch(error) { console.log(JSON.stringify(await evaluate('globalThis.smithyTestDiagnostics ?? null'),null,2)); throw error; }
    await writeFile(new URL('../tests/smithy-live-report.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2));
    const capture=await command('Page.captureScreenshot',{format:'png'});
    await writeFile(new URL('../tests/smithy-live.png',import.meta.url),Buffer.from(capture.data,'base64'));
  }
} finally {
  socket?.close();chrome.kill();await delay(500);
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
}


