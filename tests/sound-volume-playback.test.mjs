import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('set all track volumes updates playlist songs only, and ambience volume updates playing layers', async () => {
  const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/game-master.css', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('async function setTrackVolumes()'), source.indexOf('async function saveAndRun'));
  assert.match(source, /button\("set-ambience-volumes","Set Ambience Volumes"\)/);
  assert.match(source, /button\("stop-all-sound","Stop All Sound"\)/);
  assert.match(source, /form\("Add Playlist"/);
  assert.match(source, /form\("Add Ambience"/);
  assert.doesNotMatch(source, /ambienceNameFromPath/);
  assert.match(source, /input\("name", ""/);
  assert.match(source, /ambienceGroupName\(s\)/);
  assert.match(source, /data-tooltip="\$\{e\(file\.path\)\}"/);
  assert.match(source, /data-tooltip-direction="LEFT"/);
  assert.match(source, /aria-label="\$\{e\(file\.path\)\}"/);
  assert.match(source, /gm-ambience-layer/);
  assert.match(css, /\.ml-window :is\(\.form-footer/);
  assert.match(css, /flex:0 0 auto !important/);
  assert.match(css, /grid-template-columns:auto minmax\(0,1fr\) auto max-content/);
  assert.match(source, /label\("Name"/);
  assert.doesNotMatch(source.slice(source.indexOf('async function ambienceForm'), source.indexOf('export async function requestCheck')), /name="name\$\{i\}"/);
  assert.match(css, /--mlgm-button-height:var\(--ml-control-height, 2rem\)/);
  assert.match(css, /#mlgm button:not\(\.gm-handle\):not\(\.ml-icon-button\):not\(\.gm-cheat-chip\):not\(\.gm-macro\):not\(\.ml-stepper button\)/);
  assert.match(css, /--mlgm-macro-button-height:calc\(2rem \+ var\(--ml-space-3, 0\.75rem\)\)/);
  assert.match(css, /#mlgm \.gm-macro \{[^}]*height:var\(--mlgm-macro-button-height\)/);
  assert.match(css, /#mlgm \.gm-bulk \{[^}]*align-content:start/);
  assert.match(css, /#mlgm \.ml-stepper \{[^}]*height:var\(--mlgm-button-height\)/);
  assert.match(source, /soundColumn\("Playlists", "playlist", "Add Playlist", "playlist"\)/);
  assert.match(source, /soundColumn\("Ambience", "ambience", "Add Ambience", "ambience"\)/);
  assert.match(source, /const soundRow = inner => `<div class="gm-sound-row">/);
  assert.match(source, /soundRow\(`\$\{button\(action,name,id,`title="\$\{e\(name\)\}"`\)\}\$\{deleteButton\(remove,id,name\)\}`\)/);
  assert.doesNotMatch(source, /gm-ambience-actions/);
  assert.match(css, /#mlgm \.gm-sound-row \{[^}]*flex-flow:row nowrap/);
  assert.match(css, /#mlgm \.gm-sound-row \{[^}]*width:100%/);
  assert.match(css, /#mlgm \.gm-sound-row > button:not\(\.ml-icon-button\) \{[^}]*flex:1 1 auto !important/);
  assert.match(css, /#mlgm \.gm-sound-row > \.ml-icon-button \{[^}]*flex:0 0 var\(--mlgm-button-height\)/);
  assert.match(css, /button\.gm-sound-add \{[^}]*--ml-color-accent/);
  assert.match(source, /class="gm-sound-add"/);
  assert.doesNotMatch(css, /gm-ambience-column button\[data-action="ambience"\]/);
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
  rain.path = 'modules/psfx-ambience/library/ambient/animals/birds/birds-forest-farmland-spring-loop-10mins-001.ogg';
  const drip = track('drip', false);
  const ambience = playlist('bed', [rain, drip], {ambience: true, name: 'Bed'});
  const ghost = track('ghost', false);
  ghost.sound = {playing: true, stop() { ghost.audioStopped = true; }};
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
    ui: {notifications: {info(message) { notices.push(message); }}},
    Howler: { _howls: [{ _src: rain.path, stop() { this.audioStopped = true; } }] },
    game: {playlists, audio: {
      playing: {values() { return [birds]; }},
      pending: {values() { return []; }},
      sounds: {values() { return [{deref() { return quiet; }}]; }}
    }}
  });
  const birds = {stopped: false, fade: undefined, stop(options) { this.stopped = true; this.fade = options?.fade; }};
  const quiet = {stopped: false, stop(options) { this.stopped = true; this.fade = options?.fade; }};
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
  later.sounds.push(ghost);
  later.sounds.size = later.sounds.length;
  assert.match(source, /if \(action === "stop-all-sound"\) return stopEverySound\(\);/);
  const stopper = source.slice(source.indexOf('function audioPlaying'), source.indexOf('async function setAmbienceVolumes'));
  assert.doesNotMatch(stopper, /closeTray/);
  stopped.length = 0;
  const writesBeforeStop = writes.length;
  await vm.runInContext('stopEverySound()', context);
  assert.deepEqual(stopped, ['now', 'later', 'empty', 'bed']);
  const stoppedWrites = writes.slice(writesBeforeStop);
  const stoppedIds = stoppedWrites.flatMap(write => write.updates.map(update => update._id));
  assert.deepEqual(stoppedIds, ['playing', 'ghost', 'rain', 'drip']);
  assert.ok(stoppedWrites.every(write => write.type === 'PlaylistSound' && write.options?.diff === false));
  assert.ok(stoppedWrites.flatMap(write => write.updates).every(update => update.playing === false && update.pausedTime === null));
  assert.equal(ghost.audioStopped, true);
  assert.equal(context.Howler._howls[0].audioStopped, true);
  assert.equal(birds.stopped, true);
  assert.equal(birds.fade, 0);
  assert.equal(quiet.stopped, true);
  assert.equal(quiet.fade, 0);
  assert.match(source, /form\("Add Ambience"[\s\S]*\["add", "Add"\]/);
  assert.doesNotMatch(source, /Save button/);
  const ambienceForm = source.slice(source.indexOf('async function ambienceForm'), source.indexOf('export async function requestCheck'));
  assert.match(ambienceForm, /ambienceVolume/);
  assert.doesNotMatch(ambienceForm, /\bchecked\b/);
  const playlistForm = source.slice(source.indexOf('async function playlistForm'), source.indexOf('async function ambienceForm'));
  assert.match(playlistForm, /Choose a playlist/);
  assert.doesNotMatch(playlistForm, /option\(p\.id, p\.name, last\.playlist\)/);
});
