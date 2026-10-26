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
    {_id:'playing',volume:0.13},{_id:'stopped',volume:0.13},{_id:'ambience',volume:0.13}
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
  assert.equal(vm.runInContext('percentFromVolume(volumeFromPercent(65))',context),65);
  assert.equal(vm.runInContext('percentFromVolume(volumeFromPercent(0))',context),0);
  assert.equal(vm.runInContext('percentFromVolume(volumeFromPercent(100))',context),100);
  assert.equal(vm.runInContext('volumeFromPercent(25)', context), 0.13);
  assert.equal(vm.runInContext('percentFromVolume(0.13)', context), 26);
  assert.equal(vm.runInContext('volumeFromPercent(37)', context), 0.23);
  assert.equal(vm.runInContext('percentFromVolume(0.23)', context), 38);
  assert.equal(vm.runInContext('percentFromVolume(0.225)', context), 37);
  assert.equal(vm.runInContext('volumeFromPercent(30)', context), 0.16);
  assert.equal(vm.runInContext('percentFromVolume(0.16)', context), 29);
  for (let percentValue = 0; percentValue <= 100; percentValue += 1) {
    const stored = vm.runInContext(`volumeFromPercent(${percentValue})`, context);
    assert.equal(Number(stored.toFixed(2)), stored, `percent ${percentValue} stays on the hundredths grid`);
    let closer = false;
    for (let step = 0; step <= 100; step += 1) {
      const candidate = step / 100;
      const read = vm.runInContext(`percentFromVolume(${candidate})`, context);
      const chosenRead = vm.runInContext(`percentFromVolume(${stored})`, context);
      if (Math.abs(read - percentValue) < Math.abs(chosenRead - percentValue)) closer = true;
    }
    assert.equal(closer, false, `percent ${percentValue}`);
  }
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
  assert.match(source,/percentFromVolume\(s\.volume\)/);
  assert.match(source,/value="\$\{\(percent \/ 100\)\.toFixed\(2\)\}"/);
  assert.match(source,/volumeFromPercent\(Math\.round\(Number\(el\.value\) \* 100\)\)/);
  assert.doesNotMatch(fn, /sound\.sound\.volume/);
  assert.doesNotMatch(fn, /_cleanType/);
  assert.doesNotMatch(source, /keepPlaylistVolumePrecision/);
});

test('set all track volumes writes every sound once and keeps the server hundredth', async () => {
  const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('function volumeFromPercent(value)'), source.indexOf('async function run(type, config)'));
  const logs = [];
  const writes = [];
  const cleanHundredths = value => Number((Math.round(Number(value) * 100) / 100).toFixed(2));
  const track = (id, volume) => ({id, volume, _source: {volume}});
  let release = () => {};
  let gate = Promise.resolve();
  const playlist = sounds => ({
    sounds,
    async updateEmbeddedDocuments(type, updates, options) {
      writes.push({type, updates: updates.map(update => ({...update})), options, sounds: sounds.length});
      await gate;
      for (const update of updates) {
        const sound = sounds.find(item => item.id === update._id);
        const cleaned = cleanHundredths(update.volume);
        sound.volume = cleaned;
        sound._source.volume = cleaned;
      }
    }
  });
  const first = [track('a', 0.16), track('b', 0.23), track('c', 0.16)];
  const second = [track('d', 0.23), track('e', 0.16)];
  const field = {reportValidity: () => true, value: '37'};
  const context = vm.createContext({
    gm() {}, render() {},
    root: {querySelector: () => field},
    persist: async change => change(state),
    foundry: {audio: {AudioHelper: {inputToVolume: n => n ** 1.5, volumeToInput: n => n ** (1 / 1.5)}}},
    game: {playlists: [playlist(first), playlist([]), playlist(second)]},
    ui: {notifications: {info() {}}},
    console: {
      info(message, record) { logs.push({message, record, warn: false}); },
      warn(message, record) { logs.push({message, record, warn: true}); }
    }
  });
  const state = {last: {}};
  context.state = state;
  vm.runInContext(`let settingTrackVolumes=false; ${fn}`, context);
  gate = new Promise(resolve => { release = resolve; });
  const running = vm.runInContext('setTrackVolumes()', context);
  for (let i = 0; i < 20 && writes.length < 1; i += 1) await Promise.resolve();
  assert.equal(writes.length, 1);
  field.value = '30';
  await vm.runInContext('setTrackVolumes()', context);
  assert.equal(writes.length, 1);
  assert.equal(logs.at(-1).record.ignored, true);
  assert.equal(logs.at(-1).record.reason, 'an update is still running');
  release();
  await running;
  assert.deepEqual(writes.map(write => write.sounds), [3, 2]);
  assert.ok(writes.every(write => write.type === 'PlaylistSound' && write.options?.diff === false));
  assert.deepEqual(writes.map(write => [...write.updates].map(update => update.volume)), [[0.23, 0.23, 0.23], [0.23, 0.23]]);
  assert.deepEqual([...first, ...second].map(sound => sound._source.volume), [0.23, 0.23, 0.23, 0.23, 0.23]);
  const done = logs.find(entry => entry.record?.percent === 37 && !entry.record.ignored);
  assert.equal(done.record.passed, 0.23);
  assert.equal(done.record.playlists, 3);
  assert.equal(done.record.sounds, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(done.record.stored)), {'0.23': 5});
  assert.equal(done.warn, false);
  field.value = '30';
  await vm.runInContext('setTrackVolumes()', context);
  assert.deepEqual([...first, ...second].map(sound => sound._source.volume), [0.16, 0.16, 0.16, 0.16, 0.16]);
  assert.equal(logs.at(-1).record.percent, 30);
  assert.equal(logs.at(-1).record.passed, 0.16);
  assert.equal(logs.at(-1).record.sounds, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(logs.at(-1).record.stored)), {'0.16': 5});
  assert.equal(logs.at(-1).warn, false);
});
