import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const bulk = readFileSync(new URL('../scripts/bulk-actions.mjs', import.meta.url), 'utf8');
const tray = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/game-master.css', import.meta.url), 'utf8');

test('XP puts Amount on the line under Action', () => {
  const xp = bulk.slice(bulk.indexOf('function xpContent'), bulk.indexOf('function inspirationContent'));
  const rowAt = xp.indexOf('class="gm-specialty-row"');
  const actionRow = xp.slice(rowAt, xp.indexOf('</div>', rowAt));
  assert.match(xp, /class="gm-xp-fields"/);
  assert.match(xp, /name="bulkXpAction"/);
  assert.match(actionRow, /\$\{actionField\}/);
  assert.match(actionRow, /data-action="bulk-xp"/);
  assert.doesNotMatch(actionRow, /name="xp"/);
  assert.doesNotMatch(actionRow, /\$\{amountField\}/);
  const markup = xp.slice(xp.lastIndexOf('return `'));
  assert.ok(markup.indexOf('${actionField}') < markup.indexOf('</div>'));
  assert.ok(markup.indexOf('${amountField}') > markup.indexOf('</div>'));
  assert.match(css, /#mlgm \.gm-xp-fields \{[^}]*flex-direction:column/);
});

test('Prototype Token Sync uses an Inspiration-style target row', () => {
  const tokens = bulk.slice(bulk.indexOf('function tokenContent'), bulk.indexOf('function sceneScopeOptions'));
  assert.match(tokens, /<strong class="gm-specialty-title">/);
  assert.match(tokens, /class="gm-specialty-row"><label class="gm-specialty-field">/);
  assert.match(tokens, /name="bulkTokenScope"/);
  assert.match(tokens, /tokens\.party/);
  assert.match(tokens, /tokens\.selected/);
  assert.match(tokens, /tokens\.all/);
  assert.match(tokens, /data-action="bulk-tokens"/);
  assert.match(tray, /tokenScope: last\.bulkTokenScope/);
  assert.match(tray, /n\.last\.bulkTokenScope = tokenScopeChoice/);
  const actorForToken = bulk.slice(bulk.indexOf('function actorForToken'), bulk.indexOf('export function collectTokenTargets'));
  assert.match(actorForToken, /actor\.type === 'group'/);
  assert.doesNotMatch(actorForToken, /!== 'character'/);
  assert.match(bulk, /choice !== 'party' && !targets\.length/);
});

test('Undo Last Action is one right-aligned button and its enabled state updates live', () => {
  const css = readFileSync(new URL('../styles/game-master.css', import.meta.url), 'utf8');
  const tray = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const button = bulk.slice(bulk.indexOf('function undoButton'), bulk.indexOf('export function bulkPanel'));
  assert.match(button, /class="gm-undo-bar"/);
  assert.match(button, /data-action="bulk-undo"/);
  assert.match(button, /undo\.button/);
  assert.doesNotMatch(button, /ml-card|gm-specialty-title|Nothing to undo|undo\.none/);
  assert.match(bulk, /\$\{undoButton\(undo, busy\)\}<div class="gm-bulk">/);
  assert.match(css, /#mlgm \.gm-undo-bar \{ display:flex; justify-content:flex-end; align-self:stretch; width:100%; \}/);
  assert.match(tray, /syncUndoButton\(\)/);
  assert.match(tray, /setting\.key === `\$\{ID\}\.\$\{BULK_UNDO\}`\) syncUndoButton\(\)/);
  const sync = tray.slice(tray.indexOf('function syncUndoButton'), tray.indexOf('function content'));
  const control = {disabled: true};
  const context = vm.createContext({
    root: {querySelector: selector => selector === '[data-action="bulk-undo"]' ? control : null},
    bulkBusy: false,
    readBulkUndo: () => null
  });
  vm.runInContext(sync, context);
  vm.runInContext('syncUndoButton()', context);
  assert.equal(control.disabled, true);
  context.readBulkUndo = () => ({kind: 'xp'});
  vm.runInContext('syncUndoButton()', context);
  assert.equal(control.disabled, false);
  context.bulkBusy = true;
  vm.runInContext('syncUndoButton()', context);
  assert.equal(control.disabled, true);
  context.bulkBusy = false;
  context.readBulkUndo = () => null;
  vm.runInContext('syncUndoButton()', context);
  assert.equal(control.disabled, true);
  assert.match(bulk, /Token Disposition|sceneTokens\.title\.disposition/);
  assert.match(bulk, /sceneTokens\.title\.vision/);
  assert.match(bulk, /sceneTokens\.title\.bars/);
  assert.match(bulk, /sceneTokens\.title\.name/);
  assert.match(bulk, /fieldKey: 'sceneTokens\.disposition'/);
  assert.match(bulk, /fieldKey: 'sceneTokens\.visionField'/);
});
