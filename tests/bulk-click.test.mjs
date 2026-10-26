import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
const ID = 'morelord-game-master';

function tray() {
  const nodes = [];
  const control = (action, dataset = {}) => {
    const node = {
      dataset: {action, ...dataset},
      disabled: false,
      isConnected: true,
      value: dataset.value ?? '',
      closest(selector) { return selector === '[data-action]' && action ? node : null; }
    };
    nodes.push(node);
    return node;
  };
  const root = {
    set innerHTML(_value) { for (const node of nodes) node.isConnected = false; },
    get innerHTML() { return ''; }
  };
  return {nodes, control, root};
}

function loadBoardSave(root, onSave) {
  const persistStart = source.indexOf('let localBoardWrite = 0;');
  const persistEnd = source.indexOf('async function form(');
  const hookStart = source.indexOf('function refreshTray(');
  const hookEnd = source.indexOf('export async function addTrigger');
  const hooks = {};
  let stored = {last: {}, triggers: [], saved: []};
  const context = vm.createContext({
    ID,
    saving: Promise.resolve(),
    state: {last: {}, triggers: [], saved: []},
    open: true,
    tab: 'sound',
    root,
    BULK_UNDO: 'bulkUndo',
    SPECIALTIES: [],
    JSON,
    Promise,
    foundry: {utils: {deepClone: value => JSON.parse(JSON.stringify(value))}},
    saveGlobalTriggers: async () => {},
    get: key => (key === 'board' ? stored : null),
    render() { root.innerHTML = 'rebuild'; },
    game: {
      user: {isGM: true},
      settings: {
        async set(_id, key, value) {
          if (key !== 'board') return;
          stored = value;
          for (const fn of hooks.updateSetting ?? []) fn({key: `${ID}.board`});
          onSave();
        }
      }
    },
    Hooks: {on(name, fn) { (hooks[name] ??= []).push(fn); }}
  });
  vm.runInContext(`${source.slice(persistStart, persistEnd)}\n${source.slice(hookStart, hookEnd)}`, context);
  return {
    persist: vm.runInContext('persist', context),
    rebuildFromOutside: () => hooks.updateSetting[0]({key: `${ID}.board`}),
    playlistHooks: hooks.updatePlaylistSound ?? []
  };
}

test('typing in a tray field and clicking once applies the control under the pointer', async () => {
  assert.doesNotMatch(source, /holdTrayRender|beginTrayPointer/);
  assert.match(source, /localBoardWrite/);
  const xp = source.slice(source.indexOf('async function sendBulkXp'), source.indexOf('async function sendBulkInspiration'));
  const coins = source.slice(source.indexOf('async function sendBulkCoins'), source.indexOf('async function sendBulkXp'));
  assert.ok(xp.indexOf('reportValidity') < xp.indexOf('await saving'));
  assert.ok(coins.indexOf('reportValidity') < coins.indexOf('await saving'));
  assert.match(source, /ml-game-master-track-volume[\s\S]*allTrackVolume/);
  assert.match(source, /data-sound/);

  const {control, root} = tray();
  const field = {id: 'ml-game-master-track-volume', value: '25'};
  const actions = [
    'set-track-volumes', 'stop-sound', 'stop-music', 'stop-ambience', 'playlist', 'ambience', 'saved',
    'bulk-xp', 'bulk-coins', 'bulk-coins-clear', 'bulk-inspiration', 'bulk-tokens', 'bulk-undo',
    'send-check', 'quick-request', 'macro', 'trigger-toggle', 'tab'
  ];
  const buttons = Object.fromEntries(actions.map(action => [action, control(action)]));
  const slider = control('', {sound: 'rain', playlist: 'bed', value: '0.25'});
  const blind = control('', {name: 'blind'});
  let pressed = null;
  const {persist, rebuildFromOutside, playlistHooks} = loadBoardSave(root, () => { pressed?.(); });

  const applied = [];
  for (const action of actions) {
    field.value = action === 'set-track-volumes' ? '40' : '12';
    const button = buttons[action];
    button.isConnected = true;
    pressed = () => {
      assert.equal(button.isConnected, true, action);
      if (!button.isConnected) return;
      applied.push({action, value: field.value});
    };
    await persist(board => { board.last.allTrackVolume = Number(field.value); });
  }
  assert.deepEqual(applied, actions.map(action => ({action, value: action === 'set-track-volumes' ? '40' : '12'})));

  field.value = '55';
  slider.isConnected = true;
  slider.value = '0.25';
  pressed = () => {
    assert.equal(slider.isConnected, true, 'now playing volume');
    if (!slider.isConnected) return;
    slider.value = '0.7';
    applied.push({action: 'track-volume', value: field.value, level: slider.value});
  };
  await persist(board => { board.last.allTrackVolume = Number(field.value); });

  blind.isConnected = true;
  blind.checked = false;
  pressed = () => {
    assert.equal(blind.isConnected, true, 'blind roll');
    if (!blind.isConnected) return;
    blind.checked = true;
    applied.push({action: 'blind', checked: true});
  };
  await persist(board => { board.last.check = {blind: true}; });

  assert.deepEqual(applied.slice(-2), [
    {action: 'track-volume', value: '55', level: '0.7'},
    {action: 'blind', checked: true}
  ]);

  pressed = null;
  const rendersBefore = slider.isConnected;
  rebuildFromOutside();
  assert.equal(rendersBefore, true);
  assert.equal(slider.isConnected, false, 'a board change from outside the tray still rebuilds it');
  assert.equal(playlistHooks.length, 1);
});
