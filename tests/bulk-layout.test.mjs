import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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
  const tokens = bulk.slice(bulk.indexOf('function tokenContent'), bulk.indexOf('function undoContent'));
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
