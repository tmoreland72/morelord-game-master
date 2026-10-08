import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('bulk volume covers playing and stopped tracks, skips empty playlists, and recovers after errors', async () => {
  const source=readFileSync(new URL('../scripts/main.mjs',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('function volumeFromPercent(value)'),source.indexOf('async function run(type, config)'));
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
    foundry:{audio:{AudioHelper:{inputToVolume:n=>n**1.5,volumeToInput:n=>n**(1/1.5)}}},
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
  assert.equal(vm.runInContext('percentFromVolume(volumeFromPercent(25))',context),25);
  assert.equal(vm.runInContext('percentFromVolume(volumeFromPercent(65))',context),65);
  assert.equal(vm.runInContext('percentFromVolume(volumeFromPercent(0))',context),0);
  assert.equal(vm.runInContext('percentFromVolume(volumeFromPercent(100))',context),100);
  assert.throws(()=>vm.runInContext('volumeFromPercent(101)',context),/between 0 and 100/);
  const board={volumeScale:undefined,last:{allTrackVolume:25,playlist:{volume:0.5},ambience:{files:[{path:'a.ogg',volume:0.4}]}},saved:[{type:'playlist',config:{volume:0.65}},{type:'ambience',config:{files:[{volume:0}]}},{type:'group',config:{dc:10}}]};
  assert.equal(vm.runInContext('migrateSoundVolumes',context)(board),true);
  assert.equal(board.volumeScale,'foundry');
  assert.equal(board.last.allTrackVolume,25);
  assert.equal(board.last.playlist.volume,0.5**1.5);
  assert.equal(board.last.ambience.files[0].volume,0.4**1.5);
  assert.equal(board.saved[0].config.volume,0.65**1.5);
  assert.equal(board.saved[1].config.files[0].volume,0);
  assert.equal(board.saved[2].config.dc,10);
  assert.equal(vm.runInContext('migrateSoundVolumes',context)(board),false);
  assert.equal(board.last.playlist.volume,0.5**1.5);
  assert.match(source,/volumeToInput\(Number\(s\.volume\)/);
  assert.match(source,/volumeFromPercent\(Number\(el\.value\) \* 100\)/);
});
