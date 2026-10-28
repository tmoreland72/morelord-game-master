import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  RUN_ON_LOAD_COPY,
  RUN_ON_LOAD_FOR_EVERYONE,
  RUN_ON_LOAD_FOR_ME,
  macroContextEntries,
  macroRunMarks,
  registerRunOnLoadSettings,
  runMacrosOnLoad,
  toggledUuidList,
  userCanRunMacro
} from '../scripts/run-macros-on-load.mjs';

const player = {id: 'player', isGM: false};
const gm = {id: 'gm', isGM: true};

function macro({uuid, name = 'Fixture', visible = true, canExecute = true, execute, canUserExecute} = {}) {
  return {uuid, name, visible, canExecute, execute, canUserExecute};
}

test('run on load for me toggles one user list and for everyone stays a separate GM action', () => {
  assert.deepEqual(toggledUuidList(['Macro.a', 'Macro.a', ''], 'Macro.b'), ['Macro.a', 'Macro.b']);
  assert.deepEqual(toggledUuidList(['Macro.a', 'Macro.b'], 'Macro.a'), ['Macro.b']);
  assert.equal(RUN_ON_LOAD_FOR_ME, 'runOnLoadForMe');
  assert.equal(RUN_ON_LOAD_FOR_EVERYONE, 'runOnLoadForEveryone');

  const stored = new Map();
  const settings = {register(module, key, config) { stored.set(`${module}.${key}`, config); }};
  registerRunOnLoadSettings(settings, 'morelord-game-master');
  assert.equal(stored.get('morelord-game-master.runOnLoadForMe').scope, 'client');
  assert.equal(stored.get('morelord-game-master.runOnLoadForMe').restricted, true);
  assert.equal(stored.get('morelord-game-master.runOnLoadForEveryone').scope, 'world');
  assert.equal(stored.get('morelord-game-master.runOnLoadForEveryone').restricted, true);

  const element = {dataset: {macroUuid: 'Macro.a'}};
  const mine = macroContextEntries({isGM: () => false, runsForMe: () => false, runsForEveryone: () => false});
  assert.deepEqual(mine.filter(entry => entry.condition?.(element) !== false).map(entry => entry.name), ['Remove', 'Run on load for me']);
  const shared = macroContextEntries({isGM: () => true, runsForMe: () => true, runsForEveryone: () => true});
  assert.deepEqual(shared.filter(entry => entry.condition?.(element) !== false).map(entry => entry.name), [
    'Remove', 'Running on load for me', 'Running on load for everyone'
  ]);
  const calls = [];
  shared.find(entry => entry.name === 'Running on load for everyone').callback(element);
  mine[0].callback?.(element);
  const toggling = macroContextEntries({
    toggleMe: () => calls.push('me'),
    toggleEveryone: () => calls.push('everyone'),
    isGM: () => true,
    runsForMe: () => false,
    runsForEveryone: () => false
  });
  toggling.find(entry => entry.name === 'Run on load for me').callback(element);
  toggling.find(entry => entry.name === 'Run on load for everyone').callback(element);
  assert.deepEqual(calls, ['me', 'everyone']);
});

test('ready runs each flagged macro once for the right user and keeps going after a failure', async () => {
  const ran = [];
  const hidden = macro({uuid: 'Macro.hidden', visible: false, execute: () => ran.push('hidden')});
  const blocked = macro({uuid: 'Macro.blocked', canExecute: false, execute: () => ran.push('blocked')});
  const mine = macro({uuid: 'Macro.mine', execute: () => ran.push('mine')});
  const shared = macro({uuid: 'Macro.shared', execute: () => ran.push('shared')});
  const broken = macro({uuid: 'Macro.broken', execute: () => { throw new Error('boom'); }});
  const docs = new Map([['Macro.mine', mine], ['Macro.shared', shared], ['Macro.hidden', hidden], ['Macro.blocked', blocked], ['Macro.broken', broken]]);
  const errors = [];
  const logger = {error: (...args) => errors.push(args.join(' '))};
  const result = await runMacrosOnLoad({
    forMe: ['Macro.mine', 'Macro.shared', 'Macro.hidden'],
    forEveryone: ['Macro.shared', 'Macro.blocked', 'Macro.missing', 'Macro.broken'],
    user: gm,
    resolve: async uuid => {
      if (uuid === 'Macro.missing') throw new Error('gone');
      return docs.get(uuid);
    },
    logger
  });
  assert.deepEqual(ran, ['mine', 'shared']);
  assert.deepEqual(result, ['Macro.mine', 'Macro.shared']);
  assert.equal(errors.length, 2);

  ran.length = 0;
  const playerResult = await runMacrosOnLoad({
    forMe: [],
    forEveryone: ['Macro.shared', 'Macro.hidden'],
    user: player,
    resolve: async uuid => docs.get(uuid)
  });
  assert.deepEqual(playerResult, ['Macro.shared']);
  assert.deepEqual(ran, ['shared']);

  const unseen = macro({
    uuid: 'Macro.private',
    visible: null,
    canExecute: true,
    testUserPermission: () => false,
    execute: () => ran.push('private')
  });
  assert.equal(userCanRunMacro(unseen, player), false);
  assert.equal(userCanRunMacro({...unseen, testUserPermission: () => true, canUserExecute: () => false}, player), false);
  assert.equal(userCanRunMacro({...unseen, testUserPermission: () => true, canExecute: true}, player), true);
});

test('a macro running for everyone shows only the everyone indicator', () => {
  assert.equal(macroRunMarks(), '');
  const marks = macroRunMarks({forMe: true, forEveryone: true, text: key => `${RUN_ON_LOAD_COPY[key]} "quoted"`});
  assert.match(marks, /^<span class="gm-macro-runs">/);
  assert.doesNotMatch(marks, /data-scope="user"/);
  assert.match(marks, /class="gm-macro-run fa-solid fa-users"/);
  assert.match(marks, /data-scope="world"/);
  assert.match(marks, /aria-label="Runs on load for everyone &quot;quoted&quot;"/);
  const mine = macroRunMarks({forMe: true, text: key => `${RUN_ON_LOAD_COPY[key]} "quoted"`});
  assert.match(mine, /data-scope="user"/);
  assert.match(mine, /data-tooltip="Runs on load for you &quot;quoted&quot;"/);
  assert.doesNotMatch(mine, /data-scope="world"/);
  assert.match(marks, /data-tooltip-direction="UP"/);
  const css = readFileSync(new URL('../styles/game-master.css', import.meta.url), 'utf8');
  const rules = css.match(/#mlgm \.gm-macro-runs \{[\s\S]*?#mlgm \.gm-macro-run\[data-scope="world"\] \{[^}]+\}/)?.[0] ?? '';
  assert.match(rules, /margin-inline-start:\s*auto/);
  assert.match(rules, /font-size:\s*14px/);
  assert.match(rules, /background:\s*rgb\(0 0 0 \/ 62%\)/);
  assert.match(rules, /--ml-color-info:\s*var\(--color-level-info, #6997dc\)/);
  assert.match(rules, /--ml-color-accent:\s*var\(--color-warm-1, #d6a34a\)/);
  assert.match(rules, /\[data-scope="user"\] \{ color: var\(--ml-color-info\)/);
  assert.match(rules, /\[data-scope="world"\] \{ color: var\(--ml-color-accent\)/);
});

test('ready runs pinned macros before the tray returns for non-GM users, and the hotbar is untouched', () => {
  const main = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const runner = readFileSync(new URL('../scripts/run-macros-on-load.mjs', import.meta.url), 'utf8');
  const ready = main.slice(main.indexOf('Hooks.once("ready"'), main.indexOf('if (!game.user.isGM) return;'));
  assert.match(ready, /runMacrosOnLoad\(/);
  assert.match(ready, /RUN_ON_LOAD_FOR_ME/);
  assert.match(ready, /RUN_ON_LOAD_FOR_EVERYONE/);
  assert.match(main, /registerRunOnLoadSettings\(game\.settings, ID\)/);
  assert.match(main, /macroContextEntries\(/);
  assert.match(main, /data-macro-uuid/);
  assert.match(main, /macroRunMarks\(/);
  assert.doesNotMatch(main, /getHotbarContextOptions|renderHotbar|getMacroContextOptions|data-slot|ml-core-hotbar/);
  assert.doesNotMatch(runner, /hotbar|data-slot|getHotbarContextOptions|renderHotbar/);
  const english = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'));
  for (const [key, value] of Object.entries(RUN_ON_LOAD_COPY)) {
    assert.equal(english[`morelord-game-master.macros.${key}`], value);
  }
});

test('every Game Master setting registration is world-scoped and GM-restricted, except run on load for me', () => {
  const main = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const runner = readFileSync(new URL('../scripts/run-macros-on-load.mjs', import.meta.url), 'utf8');
  const calls = [
    ...main.matchAll(/game\.settings\.register\((?:(?!game\.settings\.register)[\s\S])*?\);/g),
    ...runner.matchAll(/settings\.register\((?:(?!settings\.register)[\s\S])*?\);/g)
  ].map(match => match[0]);
  assert.equal(calls.length, 11);
  const client = calls.filter(call => /scope:\s*"client"/.test(call));
  assert.equal(client.length, 1);
  assert.match(client[0], /RUN_ON_LOAD_FOR_ME/);
  assert.match(client[0], /restricted:\s*true/);
  assert.match(runner, /RUN_ON_LOAD_FOR_ME = "runOnLoadForMe"/);
  assert.match(runner, /RUN_ON_LOAD_FOR_EVERYONE = "runOnLoadForEveryone"/);
  for (const call of calls) {
    if (call === client[0]) continue;
    assert.match(call, /scope:\s*"world"/);
    assert.match(call, /restricted:\s*true/);
  }
  assert.match(main, /game\.keybindings\.register\(ID, "toggle", \{ name: "Toggle Game Master tray", restricted: true,/);
  assert.doesNotMatch(main, /getHotbarContextOptions|renderHotbar|getMacroContextOptions/);
  assert.doesNotMatch(runner, /hotbar|data-slot/);
});
