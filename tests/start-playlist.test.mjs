import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');

test('the tray stays below Foundry dialogs and notifications', () => {
  const css = readFileSync(new URL('../styles/game-master.css', import.meta.url), 'utf8');
  assert.match(css, /z-index:\s*calc\(var\(--z-index-ui\) \+ 1\)/);
  assert.doesNotMatch(css, /z-index:\s*2147483647/);
});

test('a tray action re-enables its button and shows a notification when it fails', async () => {
  const fn = source.slice(source.indexOf('function fail(error)'), source.indexOf('function persist(change)'));
  const notes = [];
  const button = {disabled: false, isConnected: true};
  const context = vm.createContext({
    ID: 'morelord-game-master', console, notify() {}, button,
    ui: {notifications: {error(message) { notes.push(message); }}}
  });
  vm.runInContext(fn, context);
  await vm.runInContext('press(button, async () => { if (!button.disabled) throw new Error("button stayed enabled"); })', context);
  assert.equal(button.disabled, false);
  await vm.runInContext('press(button, async () => { throw new Error("Add tracks to this playlist before starting it."); })', context);
  assert.equal(button.disabled, false);
  assert.deepEqual(notes, ['Add tracks to this playlist before starting it.']);
});

test('Start Playlist starts the chosen playlist at the dialog volume', async () => {
  const fn = source.slice(source.indexOf('async function run(type, config)'), source.indexOf('async function ambienceForm'));
  const writes = [];
  const played = [];
  const stopped = [];
  const track = id => ({id, playing: false, volume: 0.5, sound: null});
  const playlist = (id, sounds, {ambience = false, playing = false, name = id} = {}) => {
    sounds.size = sounds.length;
    return {
      id, name, playing, sounds, getFlag: () => ambience,
      async update() {},
      async updateEmbeddedDocuments(_type, updates, options) {
        writes.push({updates, options, playlist: id});
      },
      async playAll() { played.push(id); },
      async stopAll() { stopped.push(id); this.playing = false; }
    };
  };
  const now = playlist('now', [track('song')], {playing: true, name: 'Now'});
  const later = playlist('later', [track('one'), track('two')], {name: 'Later'});
  const empty = playlist('empty', [], {name: 'Empty'});
  const playlists = [now, later, empty];
  playlists.get = id => playlists.find(item => item.id === id);
  const state = {last: {playlist: {playlist: 'later', volume: 0.65}}, saved: []};
  let dialog;
  const context = vm.createContext({
    gm() {}, render() {}, notify() {}, Hooks: {on() {}}, ID: 'morelord-game-master',
    CONST: {PLAYLIST_MODES: {SHUFFLE: 1}},
    e: value => value, label: (_name, content) => content, select: (_name, options) => options, option: id => id, input: (_name, value) => String(value),
    savedName: (_type, config) => config.playlist,
    foundry: {
      audio: {AudioHelper: {inputToVolume: n => n ** 1.5, volumeToInput: n => n ** (1 / 1.5)}},
      utils: {randomID: () => 'saved-1'}
    },
    volumeFromPercent(value) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Volume must be between 0 and 100.');
      return (n / 100) ** 1.5;
    },
    percentFromVolume(volume) {
      const level = Number(volume);
      if (!Number.isFinite(level)) return 0;
      return Math.round(Math.min(1, Math.max(0, level)) ** (1 / 1.5) * 100);
    },
    state, game: {playlists},
    persist: async change => change(state),
    form: async (title, _content, actions) => {
      dialog = {title, actions};
      return {data: {get(name) { return name === 'playlist' ? 'later' : '40'; }}};
    }
  });
  vm.runInContext(fn, context);
  await vm.runInContext('playlistForm()', context);
  assert.equal(dialog.title, 'Start Playlist');
  assert.deepEqual(JSON.parse(JSON.stringify(dialog.actions)), [['start', 'Start']]);
  assert.deepEqual(stopped, ['now']);
  assert.deepEqual(played, ['later']);
  const curved = 0.4 ** 1.5;
  assert.equal(state.saved[0].config.volume, curved);
  assert.deepEqual(JSON.parse(JSON.stringify(writes.at(-1).updates)), [{_id: 'one', volume: curved}, {_id: 'two', volume: curved}]);
  context.form = async () => null;
  await vm.runInContext('playlistForm()', context);
  assert.deepEqual(played, ['later']);
  context.form = async () => ({data: {get(name) { return name === 'volume' ? '40' : 'empty'; }}});
  await assert.rejects(vm.runInContext('playlistForm()', context), /Add tracks to this playlist before starting it/);
});
