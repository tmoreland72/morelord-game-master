import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');

function tray() {
  const buttons = [];
  const control = action => {
    const node = {
      dataset: {action},
      disabled: false,
      isConnected: true,
      closest(selector) { return selector === '[data-action]' ? node : null; }
    };
    buttons.push(node);
    return node;
  };
  const root = {
    listeners: [],
    ownerDocument: {activeElement: null},
    querySelectorAll: () => [],
    addEventListener(type, fn, capture = false) { this.listeners.push({type, fn, capture}); },
    set innerHTML(_value) { for (const node of buttons) node.isConnected = false; },
    get innerHTML() { return ''; }
  };
  const dispatch = (type, event) => {
    for (const listener of root.listeners.filter(item => item.type === type && item.capture)) listener.fn(event);
    for (const listener of root.listeners.filter(item => item.type === type && !item.capture)) listener.fn(event);
  };
  return {buttons, control, root, dispatch};
}

function loadRender(root) {
  const start = source.indexOf('let holdTrayRender = false;');
  const end = source.indexOf('function content(');
  const context = vm.createContext({
    root,
    open: true,
    tab: 'bulk',
    tabs: {bulk: 'Bulk Actions'},
    button: () => '<button type="button"></button>',
    e: value => String(value),
    content: () => '',
    snapshotControls: () => [],
    restoreControls() {},
    core: () => ({ui: {applyPageLayout() {}}})
  });
  vm.runInContext(source.slice(start, end), context);
  return {
    begin: vm.runInContext('beginTrayPointer', context),
    release: vm.runInContext('releaseTrayPointer', context),
    render: vm.runInContext('render', context)
  };
}

test('the first click applies every bulk action while the amount change rebuilds the tray', () => {
  assert.match(source, /root\.addEventListener\("pointerdown", beginTrayPointer, true\)/);
  assert.match(source, /setTimeout\(releaseTrayPointer, 0\)/);
  const xp = source.slice(source.indexOf('async function sendBulkXp'), source.indexOf('async function sendBulkInspiration'));
  const coins = source.slice(source.indexOf('async function sendBulkCoins'), source.indexOf('async function sendBulkXp'));
  assert.ok(xp.indexOf('reportValidity') < xp.indexOf('await saving'));
  assert.ok(coins.indexOf('reportValidity') < coins.indexOf('await saving'));
  assert.match(source, /n\.last\.bulkXpAction = bulkXpChoice\(el\.value\)/);

  const {control, root, dispatch} = tray();
  const {begin, release, render} = loadRender(root);
  root.addEventListener('pointerdown', begin, true);
  root.addEventListener('change', () => render());
  const applied = [];
  root.addEventListener('click', event => {
    const target = event.target.closest('[data-action]');
    if (!target?.isConnected || target.disabled) return;
    applied.push(target.dataset.action);
  });

  const send = control('bulk-xp');
  render();
  assert.equal(send.isConnected, false, 'a tray rebuild removes the button that was pressed');
  for (const action of ['bulk-xp', 'bulk-coins', 'bulk-coins-clear', 'bulk-inspiration', 'bulk-tokens', 'bulk-undo']) {
    const button = control(action);
    dispatch('pointerdown', {button: 0, target: button});
    dispatch('change', {target: {name: 'xp', value: '12'}});
    assert.equal(button.isConnected, true, action);
    dispatch('click', {target: button});
    release();
    assert.equal(button.isConnected, false, action);
  }
  assert.deepEqual(applied, ['bulk-xp', 'bulk-coins', 'bulk-coins-clear', 'bulk-inspiration', 'bulk-tokens', 'bulk-undo']);
});
