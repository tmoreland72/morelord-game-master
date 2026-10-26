import {test} from 'node:test';
import assert from 'node:assert/strict';
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
