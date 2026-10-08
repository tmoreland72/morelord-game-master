import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('set all track volumes is stored on every playlist sound and kept when another playlist starts', async () => {
  const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('async function setTrackVolumes()'), source.indexOf('async function saveAndRun'));
  const writes = [];
  const played = [];
  const stopped = [];
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
  const ambience = playlist('bed', [track('rain')], {ambience: true, name: 'Bed'});
  const playlists = [now, later, empty, ambience];
  playlists.get = id => playlists.find(item => item.id === id);
  const foundry = {audio: {AudioHelper: {inputToVolume: n => n ** 1.5}}};
  const state = {
    last: {playlist: {playlist: 'later', volume: 0.9}, ambience: {files: [{path: 'rain.ogg', volume: 0.4}]}},
    saved: [
      {type: 'playlist', config: {playlist: 'later', volume: 0.9}},
      {type: 'ambience', config: {files: [{path: 'rain.ogg', volume: 0.4}]}},
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
    root: {querySelector: () => ({reportValidity: () => true, value: '25'})},
    persist: async change => change(state),
    ui: {notifications: {info() {}}}
  });
  vm.runInContext(`let settingTrackVolumes=false; ${fn}`, context);
  await vm.runInContext('setTrackVolumes()', context);
  assert.deepEqual(writes.map(write => write.playlist), ['now', 'later', 'bed']);
  assert.ok(writes.every(write => write.type === 'PlaylistSound' && write.options?.diff === false));
  assert.deepEqual(writes.flatMap(write => write.updates.map(update => update._id)), ['playing', 'stopped', 'one', 'two', 'rain']);
  assert.ok(writes.flatMap(write => write.updates).every(update => update.volume === 0.125));
  assert.equal(live.volume, 0.125);
  assert.equal(state.last.allTrackVolume, 25);
  assert.equal(state.last.playlist.volume, 0.125);
  assert.equal(state.last.ambience.files[0].volume, 0.125);
  assert.equal(state.saved[0].config.volume, 0.125);
  assert.equal(state.saved[1].config.files[0].volume, 0.125);
  assert.equal(state.saved[2].config.dc, 10);
  await vm.runInContext('run("playlist", state.saved[0].config)', context);
  assert.deepEqual(stopped, ['now']);
  assert.deepEqual(played, ['later']);
  assert.deepEqual(JSON.parse(JSON.stringify(writes.at(-1).updates)), [{_id: 'one', volume: 0.125}, {_id: 'two', volume: 0.125}]);
  assert.equal(writes.at(-1).options.diff, false);
  assert.ok(writes.flatMap(write => write.updates).every(update => update.volume === 0.125));
});
