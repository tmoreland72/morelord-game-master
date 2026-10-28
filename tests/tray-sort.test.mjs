import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bindVisibleSortables} from '../scripts/tray-sort.mjs';

function list(group) {
  return {closest: () => ({dataset: {traySection: group}})};
}

test('macros and GM Settings bind Core sortable on their own lists', () => {
  const calls = [];
  const macros = {};
  const rolls = list('rolls');
  const bulk = list('bulk');
  const root = {
    querySelector: selector => selector === '.gm-macros' ? macros : null,
    querySelectorAll: selector => selector === '.gm-settings-list' ? [rolls, bulk] : []
  };
  const sortable = {bind: (element, options) => calls.push({element, options})};
  assert.equal(bindVisibleSortables(sortable, root, 'macros', {
    onMacros: ids => ids,
    onSettings: () => {}
  }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].element, macros);
  assert.equal(calls[0].options.itemSelector, '[data-macro-uuid]');
  assert.equal(calls[0].options.id({dataset: {macroUuid: 'Macro.a'}}), 'Macro.a');

  calls.length = 0;
  assert.equal(bindVisibleSortables(sortable, root, 'settings', {
    onMacros: () => {},
    onSettings: (group, ids) => calls.push({group, ids})
  }), true);
  assert.deepEqual(calls.map(call => call.element), [rolls, bulk]);
  calls[0].options.onReorder(['death', 'fate']);
  assert.deepEqual(calls.at(-1), {group: 'rolls', ids: ['death', 'fate']});
  assert.equal(calls[0].options.itemSelector, '[data-tray-item]');
  assert.equal(calls[0].options.id({dataset: {trayItem: 'fate'}}), 'fate');
});

test('reordering waits for Core sortable and does not bind the other tabs', () => {
  const root = {querySelector: () => ({}), querySelectorAll: () => [{}]};
  assert.equal(bindVisibleSortables(null, root, 'macros', {}), false);
  assert.equal(bindVisibleSortables({}, root, 'macros', {}), false);
  assert.equal(bindVisibleSortables({bind() {}}, null, 'macros', {}), false);
  assert.equal(bindVisibleSortables({bind() { throw new Error('should not bind'); }}, root, 'sound', {}), false);
});

test('the tray uses Core sortable and no longer starts its own reorder drag', () => {
  const main = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/game-master.css', import.meta.url), 'utf8');
  assert.match(main, /sortable = core\(\)\.sortable/);
  assert.match(main, /bindVisibleSortables\(sortable, root, tab/);
  assert.match(main, /itemSelector: "\[data-macro-uuid\]"|bindVisibleSortables/);
  assert.doesNotMatch(main, /draggable="true"/);
  assert.doesNotMatch(main, /type:"TrayItem"|type:'Macro'/);
  assert.doesNotMatch(css, /cursor:\s*grab/);
  assert.match(css, /#mlgm \.gm-drag-handle \{/);
});
