import {spawn} from "node:child_process";
import {readFile,mkdtemp,rm} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function startBrowser() {
  const profile=await mkdtemp(path.join(os.tmpdir(),"mlgm-live-"));
  const chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let socket;
  const close=async()=>{socket?.close();chrome.kill();await delay(500);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});};
  try {
    let port,targets;
    for(let i=0;i<100;i++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(100);}}
    for(let i=0;i<20;i++){try{targets=await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)})).json();if(targets.some(t=>t.type==='page'))break;}catch{}await delay(100);}
    socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
    let serial=0;const pending=new Map(),errors=[];
    socket.onmessage=({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
    const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true,replMode:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
    const wait=async(expression,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await delay(100);}throw Error(`Timed out: ${expression}\n${errors.slice(-3).join('\n')}`);};
    await command('Runtime.enable');await command('Page.enable');
    return {command,evaluate,wait,close,errors};
  } catch(error) {await close();throw error;}
}
