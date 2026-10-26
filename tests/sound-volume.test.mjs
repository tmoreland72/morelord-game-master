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
  for (let percentValue = 0; percentValue <= 100; percentValue += 1) {
    const stored = vm.runInContext(`volumeFromPercent(${percentValue})`, context);
    assert.equal(vm.runInContext(`percentFromVolume(${stored})`, context), percentValue, `percent ${percentValue}`);
    assert.equal(Math.round(stored * 1000) / 1000, stored);
  }
  assert.equal(vm.runInContext('volumeFromPercent(37)', context), 0.225);
  assert.equal(vm.runInContext('percentFromVolume(0.225)', context), 37);
  assert.equal(vm.runInContext('percentFromVolume(0.23)', context), 38);
  assert.equal(vm.runInContext('volumeFromPercent(30)', context), 0.164);
  assert.equal(vm.runInContext('percentFromVolume(0.16)', context), 29);
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
  const volumeField = {options: {step: 0.01}};
  context.foundry.documents = {BasePlaylistSound: {schema: {fields: {volume: volumeField}}}};
  percent = 37;
  await vm.runInContext('setTrackVolumes()', context);
  assert.equal(volumeField.options.step, 0.001);
  assert.equal(writes.at(-1).updates[0].volume, 0.225);
  assert.equal(vm.runInContext('percentFromVolume(0.225)', context), 37);
  assert.doesNotMatch(fn, /sound\.sound\.volume/);
});

test('set all track volumes keeps one three-decimal gain through the document update', async () => {
  const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('function volumeFromPercent(value)'), source.indexOf('async function run(type, config)'));
  const logs = [];
  const writes = [];
  const roundToStep = (value, step) => Number((Math.round(Number(value) / step) * step).toFixed(step >= 0.01 ? 2 : 3));
  const volumeField = {
    options: {step: 0.01},
    step: 0.01,
    _cleanType(value) { return roundToStep(value, this.step ?? this.options.step ?? 0.01); }
  };
  const decoy = {options: {step: 0.01}, step: 0.01, _cleanType(value) { return roundToStep(value, 0.01); }};
  const track = (id, playing) => ({
    id, playing, volume: 0.5, _source: {volume: 0.5},
    schema: {fields: {volume: volumeField}},
    debounceVolume(volume) {
      this.volume = volume;
      this._source.volume = volume;
    }
  });
  const playlist = sounds => ({
    sounds,
    async updateEmbeddedDocuments(type, updates, options) {
      writes.push({type, updates: updates.map(update => ({...update})), options});
      for (const update of updates) {
        const sound = sounds.find(item => item.id === update._id);
        const cleaned = sound.schema.fields.volume._cleanType(update.volume);
        sound.volume = cleaned;
        sound._source.volume = cleaned;
        if (sound.playing) sound.debounceVolume(Math.round(cleaned * 0.7 * 100) / 100);
      }
    }
  });
  const playing = track('playing', true);
  const stopped = track('stopped', false);
  const other = track('other', true);
  const field = {reportValidity: () => true, value: '37'};
  const context = vm.createContext({
    gm() {}, render() {},
    root: {querySelector: () => field},
    persist: async change => change(state),
    foundry: {
      audio: {AudioHelper: {inputToVolume: n => n ** 1.5, volumeToInput: n => n ** (1 / 1.5)}},
      documents: {BasePlaylistSound: {schema: {fields: {volume: decoy}}}}
    },
    game: {playlists: [playlist([playing, stopped]), playlist([other])]},
    ui: {notifications: {info() {}}},
    console: {
      info(message, record) { logs.push({message, record}); },
      warn(message, record) { logs.push({warn: true, message, record}); }
    }
  });
  const state = {last: {}};
  context.state = state;
  vm.runInContext(`let settingTrackVolumes=false; ${fn}`, context);
  assert.equal(volumeField._cleanType(0.225), 0.23);
  assert.equal(volumeField._cleanType(0.164), 0.16);
  await vm.runInContext('setTrackVolumes()', context);
  assert.equal(volumeField.step, 0.001);
  assert.equal(volumeField._cleanType(0.225), 0.225);
  assert.equal(decoy.step, 0.001);
  assert.deepEqual(writes.map(write => [...write.updates].map(update => update.volume)), [[0.225, 0.225], [0.225]]);
  assert.ok(writes.every(write => write.type === 'PlaylistSound' && write.options?.diff === false));
  assert.deepEqual([playing, stopped, other].map(sound => sound.volume), [0.225, 0.225, 0.225]);
  assert.deepEqual([playing, stopped, other].map(sound => sound._source.volume), [0.225, 0.225, 0.225]);
  assert.equal(logs.at(-1).record.percent, 37);
  assert.equal(logs.at(-1).record.passed, 0.225);
  assert.deepEqual([...logs.at(-1).record.stored], [0.225]);
  assert.equal(logs.some(entry => entry.warn), false);
  field.value = '30';
  await vm.runInContext('setTrackVolumes()', context);
  assert.deepEqual([playing, stopped, other].map(sound => sound.volume), [0.164, 0.164, 0.164]);
  assert.equal(logs.at(-1).record.percent, 30);
  assert.equal(logs.at(-1).record.passed, 0.164);
  assert.deepEqual([...logs.at(-1).record.stored], [0.164]);
  assert.equal(vm.runInContext('percentFromVolume(0.164)', context), 30);
  assert.equal(vm.runInContext('percentFromVolume(0.225)', context), 37);
});
