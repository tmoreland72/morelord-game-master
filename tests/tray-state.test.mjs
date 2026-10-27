import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/game-master.css', import.meta.url), 'utf8');

function field(partial) {
  return {
    id: '', name: '', type: 'text', value: '', defaultValue: '', checked: false, defaultChecked: false,
    dataset: {}, closest: () => null, isConnected: true, selectionStart: null, selectionEnd: null,
    focus() { this.focused = true; },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    ...partial
  };
}

test('using a feature leaves the tray open; Escape and the handle still close it', () => {
  assert.doesNotMatch(source, /closeTray|renderSettingsConfig/);
  assert.match(source, /class GameMasterSettings extends foundry\.applications\.api\.ApplicationV2 \{\s*render\(\) \{ settings\(\)\.catch\(fail\); return this; \}/);
  assert.match(source, /if \(event\.key === "Escape"\) \{ toggle\(false\);/);
  assert.match(source, /if \(action === "toggle"\) return toggle\(\);/);
  const start = source.indexOf('function toggle(');
  const end = source.indexOf('function saved(');
  const focused = [];
  const classes = new Set(['mlgm-open']);
  const context = vm.createContext({
    open: true,
    root: {querySelector(selector) { return {focus() { focused.push(selector); }}; }},
    game: {user: {isGM: true}},
    document: {body: {classList: {toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }}}},
    render() { context.renders = (context.renders ?? 0) + 1; }
  });
  vm.runInContext(source.slice(start, end), context);
  assert.equal(context.open, true);
  assert.equal(classes.has('mlgm-open'), true);
  vm.runInContext('toggle(false)', context);
  assert.equal(context.open, false);
  assert.equal(classes.has('mlgm-open'), false);
  assert.deepEqual(focused, ['.gm-handle']);
  vm.runInContext('toggle()', context);
  assert.equal(context.open, true);
  assert.equal(classes.has('mlgm-open'), true);
  assert.deepEqual(focused, ['.gm-handle', '[role=tab][aria-selected=true]']);
});

test('the tray stacks above Foundry windows and below popups', () => {
  assert.match(css, /--mlgm-window-gap:\s*1000/);
  assert.match(css, /z-index:\s*calc\(var\(--z-index-window\)\s*\+\s*var\(--mlgm-window-gap\)\)/);
  assert.doesNotMatch(css, /z-index:\s*calc\(var\(--z-index-tooltip\)/);
  assert.doesNotMatch(css, /2147483647/);
  assert.match(source, /installTrayStack\(root\)/);
  assert.match(source, /const notify = text => ui\.notifications\.info\(text\)/);
  assert.doesNotMatch(source, /createChatMessage|deleteChatMessage|updateChatMessage/);
  assert.match(source, /refreshTray\(\["sound"\]\)/);
  assert.match(source, /refreshTray\(\["party", "rolls", "bulk"\]\)/);
});

test('in-progress tray fields survive a rebuild and untouched fields take the new value', () => {
  const start = source.indexOf('function controlKey(el)');
  const end = source.indexOf('function render()');
  const context = vm.createContext({Number});
  vm.runInContext(source.slice(start, end), context);
  const dc = field({name: 'dc', value: '15', defaultValue: '', selectionStart: 2, selectionEnd: 2});
  dc.closest = selector => selector === '[data-roll-card]' ? {dataset: {rollCard: 'group'}} : null;
  const blind = field({name: 'blind', type: 'checkbox', value: 'on', checked: true, defaultChecked: false});
  blind.closest = () => ({dataset: {rollCard: 'group'}});
  const saved = field({name: 'dc', value: '8', defaultValue: '8'});
  saved.closest = () => ({dataset: {rollCard: 'player'}});
  const party = [
    field({name: 'actorUuids', type: 'checkbox', value: 'Actor.a', checked: true, defaultChecked: false}),
    field({name: 'actorUuids', type: 'checkbox', value: 'Actor.b', checked: false, defaultChecked: true})
  ];
  const active = dc;
  const container = {ownerDocument: {activeElement: active}, querySelectorAll: () => [dc, blind, saved, ...party]};
  const snapshot = vm.runInContext('snapshotControls', context)(container, active);
  const nextDc = field({name: 'dc', value: '', defaultValue: ''});
  nextDc.closest = dc.closest;
  const nextBlind = field({name: 'blind', type: 'checkbox', value: 'on', checked: false, defaultChecked: false});
  nextBlind.closest = blind.closest;
  const nextSaved = field({name: 'dc', value: '12', defaultValue: '12'});
  nextSaved.closest = saved.closest;
  const nextParty = party.map(box => field({name: 'actorUuids', type: 'checkbox', value: box.value, checked: false, defaultChecked: false}));
  const rebuilt = {querySelectorAll: () => [nextDc, nextBlind, nextSaved, ...nextParty]};
  vm.runInContext('restoreControls', context)(rebuilt, snapshot);
  assert.equal(nextDc.value, '15');
  assert.equal(nextDc.focused, true);
  assert.equal(nextDc.selectionStart, 2);
  assert.equal(nextBlind.checked, true);
  assert.equal(nextSaved.value, '12');
  assert.equal(nextParty[0].checked, true);
  assert.equal(nextParty[1].checked, false);
});
