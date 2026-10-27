import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  applyTokenDistanceWorldSetting,
  promoteTokenDistanceSetting,
  readLegacyClientTokenDistance,
  tokenDistanceMigration,
  tokenDistanceWorldStored
} from '../scripts/token-distance-setting.mjs';

const KEY = 'morelord-core.tokenDistanceIndicator';

test('a client token distance setting becomes a GM-only world setting', () => {
  const setting = {scope: 'client', config: true, restricted: false, hint: 'per user'};
  const settings = {settings: new Map([[KEY, setting]])};
  assert.deepEqual(promoteTokenDistanceSetting(settings), {promoted: true});
  assert.equal(setting.scope, 'world');
  assert.equal(setting.restricted, true);
  assert.match(setting.hint, /everyone/);

  const world = {scope: 'world', restricted: true, hint: 'already shared'};
  assert.deepEqual(promoteTokenDistanceSetting({settings: new Map([[KEY, world]])}), {promoted: false, reason: 'world'});
  assert.equal(world.hint, 'already shared');
  assert.deepEqual(promoteTokenDistanceSetting({settings: new Map()}), {promoted: false, reason: 'missing'});
});

test('an unsaved world takes a GM client off value and ignores player clients', async () => {
  const storage = new Map();
  const local = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    removeItem: key => storage.delete(key)
  };
  storage.set(KEY, 'false');
  assert.deepEqual(readLegacyClientTokenDistance(local), {stored: true, value: false});
  assert.deepEqual(tokenDistanceMigration({
    worldStored: false, legacy: {stored: true, value: false}, isGM: false
  }), {write: false, clearLegacy: true});
  assert.deepEqual(tokenDistanceMigration({
    worldStored: false, legacy: {stored: true, value: true}, isGM: true
  }), {write: false, clearLegacy: true});
  assert.deepEqual(tokenDistanceMigration({
    worldStored: true, legacy: {stored: true, value: false}, isGM: true
  }), {write: false, clearLegacy: true});

  const world = new Map();
  const setting = {scope: 'client', restricted: false, hint: ''};
  const settings = {
    settings: new Map([[KEY, setting]]),
    storage: {get: scope => scope === 'world' ? {getSetting: key => world.get(key) ?? null} : null},
    set: async (module, key, value) => { world.set(`${module}.${key}`, {key: `${module}.${key}`, value}); }
  };
  assert.equal(tokenDistanceWorldStored(settings), false);
  const byKey = {values: () => [{id: 'doc-1', key: KEY, value: false}]};
  assert.equal(tokenDistanceWorldStored({storage: {get: () => byKey}}), true);
  assert.equal(tokenDistanceWorldStored({storage: {get: () => ({values: () => []})}}), false);

  const written = await applyTokenDistanceWorldSetting(settings, {storage: local, isGM: true});
  assert.equal(written.promoted, true);
  assert.equal(written.write, true);
  assert.equal(written.value, false);
  assert.equal(setting.scope, 'world');
  assert.equal(setting.restricted, true);
  assert.equal(world.get(KEY).value, false);
  assert.equal(storage.has(KEY), false);
  assert.equal(tokenDistanceWorldStored(settings), true);

  storage.set(KEY, 'false');
  const kept = await applyTokenDistanceWorldSetting(settings, {storage: local, isGM: true});
  assert.equal(kept.write, false);
  assert.equal(kept.promoted, false);
  assert.equal(world.get(KEY).value, false);
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
