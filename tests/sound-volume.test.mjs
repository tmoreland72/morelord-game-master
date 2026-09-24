import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('bulk volume covers playing and stopped tracks, skips empty playlists, and recovers after errors', async () => {
  const source=readFileSync(new URL('../scripts/main.mjs',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('async function setTrackVolumes()'),source.indexOf('async function run(type, config)'));
  const writes=[],messages=[],state={last:{}};
  let valid=true,percent=25,fail=false;
  const field={reportValidity:()=>valid,get value(){return String(percent);}};
  const playlist=sounds=>({sounds,async updateEmbeddedDocuments(type,updates){
    if(fail)throw Error('Write failed');
    writes.push({type,updates});
  }});
  const context=vm.createContext({
    gm:()=>{},root:{querySelector:()=>field},render:()=>{},
    persist:async change=>change(state),
    foundry:{audio:{AudioHelper:{inputToVolume:n=>n**1.5}}},
    game:{playlists:[playlist([{id:'playing',playing:true},{id:'stopped',playing:false}]),playlist([]),playlist([{id:'ambience'}])]},
    ui:{notifications:{info:message=>messages.push(message)}}
  });
  vm.runInContext(`let settingTrackVolumes=false; ${fn}`,context);
  await vm.runInContext('setTrackVolumes()',context);
  assert.equal(writes.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(writes.flatMap(w=>w.updates))),[
    {_id:'playing',volume:0.125},{_id:'stopped',volume:0.125},{_id:'ambience',volume:0.125}
  ]);
  assert.ok(writes.every(w=>w.type==='PlaylistSound'));
  assert.equal(state.last.allTrackVolume,25);
  assert.match(messages[0],/3 playlist tracks/);
  valid=false;
  await vm.runInContext('setTrackVolumes()',context);
  assert.equal(writes.length,2);
  valid=true;fail=true;
  await assert.rejects(vm.runInContext('setTrackVolumes()',context),/Write failed/);
  assert.equal(vm.runInContext('settingTrackVolumes',context),false);
  fail=false;percent=0;
  await vm.runInContext('setTrackVolumes()',context);
  assert.equal(writes.at(-1).updates[0].volume,0);
  percent=100;
  await vm.runInContext('setTrackVolumes()',context);
  assert.equal(writes.at(-1).updates[0].volume,1);
});
