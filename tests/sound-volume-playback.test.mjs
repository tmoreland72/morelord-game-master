import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('set all track volumes updates playlist songs only, and ambience volume updates playing layers', async () => {
  const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/game-master.css', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('async function setTrackVolumes()'), source.indexOf('async function saveAndRun'));
  assert.match(source, /button\("playlist","Add Playlist"\)/);
  assert.match(source, /button\("ambience","Add Ambience"\)/);
  assert.match(source, /button\("set-ambience-volumes","Set Ambience Volumes"\)/);
  assert.match(source, /button\("stop-all-sound","Stop All Sound"\)/);
  assert.match(source, /form\("Add Playlist"/);
  assert.match(source, /form\("Add Ambience"/);
  assert.match(source, /const fileName = file\.path\.split\("\/"\)\.pop\(\)/);
  assert.match(source, /data-tooltip="\$\{e\(file\.path\)\}"/);
  assert.match(source, /aria-label="\$\{e\(file\.path\)\}"/);
  assert.match(css, /#mlgm \.gm-ambience-column button\[data-action="ambience"\][\s\S]*padding:var\(--ml-space-2\) var\(--ml-space-3\)/);
  assert.match(css, /white-space:normal/);
  const writes = [];
  const played = [];
  const stopped = [];
  const notices = [];
  const live = {volume: 0.5};
  const track = (id, playing = false) => ({id, playing, volume: 0.5, sound: playing ? live : null});
  const playlist = (id, sounds, {ambience = false, playing = false, name = id} = {}) => {
    sounds.size = sounds.length;
    return {
      id, name, playing, sounds, getFlag: () => ambience,
      async update() {},
      async updateEmbeddedDocuments(type, updates, options) {
        writes.push({type, updates, options, playlist: id});
        for (const update of updates) {
          const sound = sounds.find(item => item.id === update._id);
          if (sound && 'volume' in update) sound.volume = update.volume;
        }
      },
      async playAll() { played.push(id); },
      async stopAll() { stopped.push(id); this.playing = false; }
    };
  };
  const now = playlist('now', [track('playing', true), track('stopped')], {playing: true, name: 'Now'});
  const later = playlist('later', [track('one'), track('two')], {name: 'Later'});
  const empty = playlist('empty', []);
  const rain = track('rain', true);
  const drip = track('drip', false);
  const ambience = playlist('bed', [rain, drip], {ambience: true, name: 'Bed'});
  const playlists = [now, later, empty, ambience];
  playlists.get = id => playlists.find(item => item.id === id);
  const foundry = {audio: {AudioHelper: {inputToVolume: n => n ** 1.5}}};
  const state = {
    last: {playlist: {playlist: 'later', volume: 0.9}, ambience: {files: [{path: 'animals/birds/rain.ogg', volume: 0.4}]}},
    saved: [
      {type: 'playlist', config: {playlist: 'later', volume: 0.9}},
      {type: 'ambience', config: {files: [{path: 'animals/birds/rain.ogg', volume: 0.4}]}},
      {type: 'group', config: {dc: 10}}
    ]
  };
  const context = vm.createContext({
    gm() {}, render() {}, notify() {}, ID: 'morelord-game-master',
    CONST: {PLAYLIST_MODES: {SHUFFLE: 1}},
    volumeFromPercent(value) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Volume must be between 0 and 100.');
      return foundry.audio.AudioHelper.inputToVolume(n / 100);
    },
    foundry, state, game: {playlists},
    root: {querySelector(selector) {
      if (selector === '#ml-game-master-ambience-volume') return {reportValidity: () => true, value: '40'};
      if (selector === '#ml-game-master-track-volume') return {reportValidity: () => true, value: '25'};
      return null;
    }},
    persist: async change => change(state),
    ui: {notifications: {info(message) { notices.push(message); }}}
  });
  vm.runInContext(`let settingTrackVolumes=false; ${fn}`, context);
  await vm.runInContext('setTrackVolumes()', context);
  assert.deepEqual(writes.map(write => write.playlist), ['now', 'later']);
  assert.ok(writes.every(write => write.type === 'PlaylistSound' && write.options?.diff === false));
  assert.deepEqual(writes.flatMap(write => write.updates.map(update => update._id)), ['playing', 'stopped', 'one', 'two']);
  assert.ok(writes.flatMap(write => write.updates).every(update => update.volume === 0.125));
  assert.equal(live.volume, 0.5);
  assert.equal(rain.volume, 0.5);
  assert.equal(drip.volume, 0.5);
  assert.equal(state.last.allTrackVolume, 25);
  assert.equal(state.last.playlist.volume, 0.125);
  assert.equal(state.last.ambience.files[0].volume, 0.4);
  assert.equal(state.saved[0].config.volume, 0.125);
  assert.equal(state.saved[1].config.files[0].volume, 0.4);
  assert.equal(state.saved[2].config.dc, 10);
  await vm.runInContext('setAmbienceVolumes()', context);
  assert.equal(state.last.ambienceVolume, 40);
  assert.deepEqual(writes.map(write => write.playlist), ['now', 'later', 'bed']);
  assert.deepEqual(JSON.parse(JSON.stringify(writes.at(-1).updates)), [{_id: 'rain', volume: 0.4 ** 1.5}]);
  assert.equal(drip.volume, 0.5);
  assert.equal(state.last.ambience.files[0].volume, 0.4);
  assert.equal(state.saved[1].config.files[0].volume, 0.4);
  assert.match(notices.at(-1), /playing ambience layers/);
  await vm.runInContext('run("playlist", state.saved[0].config)', context);
  assert.deepEqual(stopped, ['now']);
  assert.deepEqual(played, ['later']);
  assert.deepEqual(JSON.parse(JSON.stringify(writes.at(-1).updates)), [{_id: 'one', volume: 0.125}, {_id: 'two', volume: 0.125}]);
  assert.equal(writes.at(-1).options.diff, false);
  assert.equal(rain.volume, 0.4 ** 1.5);
  const stop = source.match(/if \(action === "stop-all-sound"\) \{([^}]+)\}/)[1];
  stopped.length = 0;
  await vm.runInContext(`(async () => { ${stop} })()`, context);
  assert.deepEqual(stopped, ['now', 'later', 'empty', 'bed']);
});
