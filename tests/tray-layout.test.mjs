import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BULK_CARDS, CHEAT_LAYOUT, arrangedIds, moveId, toggledHidden, visibleIds} from '../scripts/tray-layout.mjs';

const bulk = BULK_CARDS.map(item => item.id);

test('tray order keeps unknown ids out and appends new catalog ids', () => {
  assert.deepEqual(arrangedIds(bulk, ['undo', 'missing', 'coins', 'coins']), ['coins', 'xp', 'inspiration', 'tokens', 'disposition', 'vision', 'bars', 'name']);
  assert.deepEqual(visibleIds(bulk, ['tokens', 'xp'], ['xp', 'missing']), ['tokens', 'coins', 'inspiration', 'disposition', 'vision', 'bars', 'name']);
  assert.deepEqual(moveId(bulk, [], 'tokens', 'coins'), ['tokens', 'coins', 'xp', 'inspiration', 'disposition', 'vision', 'bars', 'name']);
  assert.deepEqual(toggledHidden(['xp'], 'xp', true), []);
  assert.deepEqual(toggledHidden(['xp'], 'coins', false).sort(), ['coins', 'xp']);
});

test('GM Settings lists Roll Requests, Bulk Actions, Triggers, and Cheat Sheet with drag handles', () => {
  const main = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/game-master.css', import.meta.url), 'utf8');
  assert.match(main, /data-tray-section="\$\{e\(group\)\}"/);
  assert.match(main, /settingsSection\("Roll Requests"/);
  assert.match(main, /settingsSection\("Bulk Actions"/);
  assert.match(main, /settingsSection\("Triggers"/);
  assert.match(main, /settingsSection\("Cheat Sheet"/);
  assert.match(main, /fa-grip-vertical/);
  assert.match(main, /gm-section-heading">Verify characters/);
  assert.match(main, /class="ml-section-heading"><div><h2>\$\{e\(title\)\}<\/h2><p>\$\{e\(detail\)\}<\/p>/);
  assert.match(css, /#mlgm \.gm-specialty-field, #mlgm \.gm-field[\s\S]*flex-direction:column/);
  assert.match(css, /#mlgm \.gm-request-row > \.gm-inline \{ display:flex; flex:0 0 auto; flex-direction:column; align-items:flex-start/);
  assert.equal(CHEAT_LAYOUT.map(item => item.id).join(','), 'conditions,actions,damage,misc,cover,drakkenheim');
  assert.match(main, /cards: readLayout\("bulk"\)/);
  assert.match(main, /readLayout\("triggers"\)/);
  assert.match(main, /renderCheatSheet\(\{order: trayLayout\(\)\.cheatOrder, hidden: trayLayout\(\)\.cheatHidden\}\)/);
});
