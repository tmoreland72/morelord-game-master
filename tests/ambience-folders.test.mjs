import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {
  browseLocation,
  collectAmbienceFiles,
  ensureAmbienceFolders,
  folderFromFilePicker,
  labelAmbienceFiles,
  migrateAmbienceFolders,
  normalizeAmbienceFolders
} from '../scripts/ambience-folders.mjs';

const MODULE = 'morelord-game-master';

function worldSettings({legacy, legacyStored = true, folders, migrated = false, storage = true} = {}) {
  const data = {
    ambienceFolder: legacy,
    ambienceFolders: folders ?? [{source: 'data', path: 'Ambience'}],
    ambienceMigrated: migrated
  };
  const writes = [];
  const world = new Map();
  if (legacyStored && legacy !== undefined) world.set(`${MODULE}.ambienceFolder`, {value: legacy});
  const settings = {
    storage: storage ? {get(scope) { if (scope !== 'world') return undefined; return world; }} : undefined,
    get(_id, key) { return data[key]; },
    async set(_id, key, value) {
      data[key] = value;
      writes.push(key);
    }
  };
  return {data, writes, settings};
}

test('an unset legacy folder leaves the ambience list in place', async () => {
  const store = worldSettings({legacyStored: false, folders: [{source: 'data', path: 'Ambience'}]});
  const folders = await ensureAmbienceFolders(store.settings, MODULE);
  assert.deepEqual(folders, [{source: 'data', path: 'Ambience'}]);
  assert.equal(store.data.ambienceMigrated, true);
  assert.deepEqual(store.writes, ['ambienceMigrated']);
});

test('a stored legacy folder is copied once and replaces the unsaved default', async () => {
  const store = worldSettings({legacy: ' Tavern\\ ', folders: [{source: 'data', path: 'Ambience'}]});
  const folders = await ensureAmbienceFolders(store.settings, MODULE);
  assert.deepEqual(folders, [{source: 'data', path: 'Tavern'}]);
  assert.equal(store.data.ambienceMigrated, true);
  assert.deepEqual(store.writes, ['ambienceFolders', 'ambienceMigrated']);
  store.writes.length = 0;
  store.data.ambienceFolders = [];
  const again = await ensureAmbienceFolders(store.settings, MODULE);
  assert.deepEqual(again, []);
  assert.deepEqual(store.writes, []);
});

test('a cleared legacy folder migrates to an empty list', async () => {
  const store = worldSettings({legacy: '   ', folders: [{source: 'data', path: 'Ambience'}]});
  assert.deepEqual(await ensureAmbienceFolders(store.settings, MODULE), []);
});

test('migration is idempotent and does not resurrect a removed folder', () => {
  const removed = migrateAmbienceFolders({
    legacy: 'Tavern',
    legacyStored: true,
    folders: [],
    migrated: true
  });
  assert.deepEqual(removed.folders, []);
  const edited = migrateAmbienceFolders({
    legacy: 'Tavern',
    legacyStored: true,
    folders: [{source: 's3', path: 'bucket/bed'}, {source: 's3', path: 'bucket/bed'}, {source: 'data', path: ''}],
    migrated: true
  });
  assert.deepEqual(edited.folders, [{source: 's3', path: 'bucket/bed'}]);
});

test('missing settings storage still migrates the registered legacy default', async () => {
  const store = worldSettings({legacy: 'Ambience', storage: false});
  assert.deepEqual(await ensureAmbienceFolders(store.settings, MODULE), [{source: 'data', path: 'Ambience'}]);
  assert.equal(store.data.ambienceMigrated, true);
});

test('folders from the FilePicker keep their source and ignore duplicates', () => {
  assert.deepEqual(folderFromFilePicker('ambience/nested/', {activeSource: 's3', source: {bucket: 'my-bucket'}}), {source: 's3', path: 'my-bucket/ambience/nested'});
  assert.deepEqual(folderFromFilePicker('my-bucket/ambience', {activeSource: 's3', source: {bucket: 'my-bucket'}}), {source: 's3', path: 'my-bucket/ambience'});
  assert.deepEqual(normalizeAmbienceFolders([
    {source: 'data', path: 'Ambience/'},
    'Ambience',
    {source: 's3', path: 'bucket/bed'}
  ]), [{source: 'data', path: 'Ambience'}, {source: 's3', path: 'bucket/bed'}]);
});

test('each ambience folder is scanned recursively without loops or duplicate files', async () => {
  const calls = [];
  const listings = new Map([
    ['data\0\0Ambience', {files: ['Ambience/rain.ogg', 'Ambience/notes.txt', 'rain.ogg'], dirs: ['Ambience/tavern', 'Ambience', '..', 'Music/other']}],
    ['data\0\0Ambience/tavern', {files: ['Ambience/tavern/rain.ogg', 'Ambience/rain.ogg', 'theme.ogg'], dirs: ['Ambience', 'Ambience/tavern']}],
    ['s3\0my-bucket\0ambience', {files: ['ambience/wind.ogg', 'ambience/wind.ogg'], dirs: ['ambience/nested', 'ambience', '..']}],
    ['s3\0my-bucket\0ambience/nested', {files: ['ambience/nested/file.ogg'], dirs: ['my-bucket/ambience']}]
  ]);
  const browse = async (source, target, options = {}) => {
    calls.push({source, target, bucket: options.bucket});
    const found = listings.get(`${source}\0${options.bucket ?? ''}\0${target}`);
    if (!found) throw new Error(`missing ${source} ${target}`);
    return found;
  };
  const broken = async () => { throw new Error('bucket offline'); };
  const {files, errors} = await collectAmbienceFiles([
    {source: 'data', path: 'Ambience'},
    {source: 's3', path: 'my-bucket/ambience'},
    {source: 'data', path: 'Missing'}
  ], (source, target, options) => target === 'Missing' ? broken() : browse(source, target, options));
  assert.deepEqual(calls.map(call => call.source), ['data', 'data', 's3', 's3']);
  assert.deepEqual(calls[2], {source: 's3', target: 'ambience', bucket: 'my-bucket'});
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'bucket offline');
  assert.deepEqual(files.map(file => file.path), [
    'Ambience/rain.ogg',
    'Ambience/tavern/rain.ogg',
    'Ambience/tavern/theme.ogg',
    'my-bucket/ambience/nested/file.ogg',
    'my-bucket/ambience/wind.ogg'
  ]);
  assert.deepEqual(files.map(file => file.source), ['data', 'data', 'data', 's3', 's3']);
  assert.equal(browseLocation('s3', 'my-bucket/ambience').source, 's3');
});

test('a deep ambience tree stops instead of following a directory cycle', async () => {
  let calls = 0;
  const browse = async (_source, target) => {
    calls += 1;
    return {files: [`${target}/tone.ogg`], dirs: [`${target}/next`, target, '..']};
  };
  const {files} = await collectAmbienceFiles([{source: 'data', path: 'Ambience'}], browse);
  assert.ok(calls < 40);
  assert.ok(files.some(file => file.path === 'Ambience/tone.ogg'));
  assert.ok(files.every(file => file.path.startsWith('Ambience/')));
});

test('ambience labels keep the path inside the source folder and separate same-named files', () => {
  const nested = labelAmbienceFiles([{source: 'data', path: 'Ambience/folder/sub/file.ogg', folder: 'Ambience'}]);
  assert.equal(nested[0].label, 'folder/sub/file.ogg');
  const same = labelAmbienceFiles([
    {source: 'data', path: 'Ambience/rain.ogg', folder: 'Ambience'},
    {source: 'data', path: 'Music/rain.ogg', folder: 'Music'}
  ]);
  assert.deepEqual(same.map(file => file.label), ['Ambience/rain.ogg', 'Music/rain.ogg']);
  const shared = labelAmbienceFiles([
    {source: 'data', path: 'sfx/Ambience/rain.ogg', folder: 'sfx/Ambience'},
    {source: 's3', path: 'bucket/Ambience/rain.ogg', folder: 'bucket/Ambience'}
  ]);
  assert.deepEqual(shared.map(file => file.label), ['data:sfx/Ambience/rain.ogg', 's3:bucket/Ambience/rain.ogg']);
});

test('a saved ambience button still plays its full path after migration', async () => {
  const saved = [{type: 'ambience', config: {files: [{path: 'Ambience/nested/rain.ogg', volume: 0.4}]}}];
  const before = structuredClone(saved);
  const store = worldSettings({legacy: 'Ambience'});
  await ensureAmbienceFolders(store.settings, MODULE);
  assert.deepEqual(saved, before);
  assert.equal(store.data.ambienceMigrated, true);

  const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('async function run(type, config)'), source.indexOf('async function ambienceForm'));
  const updates = [];
  const created = [];
  let browsed = false;
  const sound = {path: 'Ambience/nested/rain.ogg', async update(data) { updates.push(structuredClone(data)); }};
  const playlist = {
    sounds: [sound],
    getFlag: () => true,
    async createEmbeddedDocuments(_type, docs) {
      created.push(...docs);
      return docs.map(doc => ({...doc, async update(data) { updates.push(structuredClone(data)); }}));
    }
  };
  const context = vm.createContext({
    Hooks: {on() {}},
    ID: MODULE,
    CONST: {PLAYLIST_MODES: {SIMULTANEOUS: 2, SHUFFLE: 1}},
    notify() {},
    config: saved[0].config,
    Playlist: {async create() { throw new Error('the existing ambience playlist should be reused'); }},
    foundry: {applications: {apps: {FilePicker: {async browse() { browsed = true; return {files: [], dirs: []}; }}}}}
  });
  context.game = {playlists: {find() { return playlist; }}};
  vm.runInContext(fn, context);
  await vm.runInContext('run("ambience", config)', context);
  assert.equal(browsed, false);
  assert.deepEqual(created, []);
  assert.deepEqual(updates, [{playing: true, repeat: true, volume: 0.4}]);
  playlist.sounds = [];
  updates.length = 0;
  await vm.runInContext('run("ambience", config)', context);
  assert.equal(created[0].path, 'Ambience/nested/rain.ogg');
  assert.equal(created[0].name, 'rain.ogg');
  assert.deepEqual(updates, [{playing: true, repeat: true, volume: 0.4}]);
});

test('the ambience picker and settings dialog use folder paths and relative labels', () => {
  const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const form = source.slice(source.indexOf('async function ambienceForm'), source.indexOf('export async function requestCheck'));
  const settings = source.slice(source.indexOf('function ambienceFolderRow'), source.length);
  assert.match(form, /file\.label/);
  assert.match(form, /title="\$\{e\(file\.path\)\}"/);
  assert.doesNotMatch(form, /No audio files found in the configured Ambience folder\./);
  assert.match(settings, /type: "folder"/);
  assert.match(settings, /data-mlgm-add-ambience/);
  assert.match(settings, /data-mlgm-remove-ambience/);
  assert.match(settings, /render\(\{force: true\}\)/);
  assert.match(settings, /AMBIENCE_FOLDERS/);
  assert.doesNotMatch(settings, /set\(ID,\s*"ambienceFolder"/);
});
