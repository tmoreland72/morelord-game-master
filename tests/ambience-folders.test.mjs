import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {escapeHTML} from '../scripts/core.mjs';
import {
  ambienceGroupName,
  ambiencePickerOptions,
  ambienceShownName,
  browseLocation,
  collectAmbienceFiles,
  ensureAmbienceFolders,
  folderFromFilePicker,
  labelAmbienceFiles,
  migrateAmbienceFolders,
  normalizeAmbienceFolders,
  presentAmbienceScan,
  resolveAmbiencePickerPath
} from '../scripts/ambience-folders.mjs';

const MODULE = 'morelord-game-master';

function worldSettings({legacy, legacyStored = true, folders, migrated = false, storage = true} = {}) {
  const data = {
    ambienceFolder: legacy,
    ambienceFolders: folders ?? [{source: 'data', path: 'Ambience'}],
    ambienceMigrated: migrated
  };
  const writes = [];
  const documents = new Map();
  let nextId = 1;
  const remember = (key, value) => {
    const settingKey = `${MODULE}.${key}`;
    const existing = [...documents.values()].find(document => document.key === settingKey);
    if (existing) existing.value = value;
    else documents.set(`Setting${nextId++}`, {_id: `Setting${nextId}`, key: settingKey, value});
  };
  if (legacyStored && legacy !== undefined) remember('ambienceFolder', legacy);
  const world = {
    get(id) { return documents.get(id); },
    values() { return documents.values(); },
    getSetting(key) { return [...documents.values()].find(document => document.key === key); },
    getItem(key) {
      const document = this.getSetting(key);
      return document ? JSON.stringify(document.value) : null;
    }
  };
  const settings = {
    storage: storage ? {get(scope) { if (scope !== 'world') return undefined; return world; }} : undefined,
    get(_id, key) { return data[key]; },
    async set(_id, key, value) {
      data[key] = value;
      writes.push(key);
      if (storage) remember(key, value);
    }
  };
  return {data, writes, settings, world};
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
  assert.deepEqual(store.writes, ['ambienceFolders', 'ambienceMigrated', 'ambienceFolder']);
  assert.equal(store.data.ambienceFolder, '');
  store.writes.length = 0;
  store.data.ambienceFolders = [];
  const again = await ensureAmbienceFolders(store.settings, MODULE);
  assert.deepEqual(again, []);
  assert.deepEqual(store.writes, []);
});

test('the legacy folder is read by setting key, not by document id', async () => {
  const store = worldSettings({legacy: 'modules/psfx-ambience/library/ambient', folders: []});
  assert.equal(store.world.get(`${MODULE}.ambienceFolder`), undefined);
  assert.equal(store.world.getSetting(`${MODULE}.ambienceFolder`).value, 'modules/psfx-ambience/library/ambient');
  assert.deepEqual(await ensureAmbienceFolders(store.settings, MODULE), [{source: 'data', path: 'modules/psfx-ambience/library/ambient'}]);
});

test('a migrated empty list is repaired once from the legacy folder that is still stored', async () => {
  const store = worldSettings({legacy: 'modules/psfx-ambience/library/ambient', folders: [], migrated: true});
  assert.deepEqual(await ensureAmbienceFolders(store.settings, MODULE), [{source: 'data', path: 'modules/psfx-ambience/library/ambient'}]);
  assert.equal(store.data.ambienceFolder, '');
  store.data.ambienceFolders = [];
  store.writes.length = 0;
  assert.deepEqual(await ensureAmbienceFolders(store.settings, MODULE), []);
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

test('an unconfigured ambience list stays empty', async () => {
  const store = worldSettings({legacyStored: false, folders: []});
  store.data.ambienceFolders = undefined;
  assert.deepEqual(await ensureAmbienceFolders(store.settings, MODULE), []);
  assert.equal(store.data.ambienceMigrated, true);
});

test('a stored non-empty legacy folder is kept', async () => {
  const store = worldSettings({legacy: 'Ambience', folders: []});
  assert.deepEqual(await ensureAmbienceFolders(store.settings, MODULE), [{source: 'data', path: 'Ambience'}]);
});

test('missing settings storage does not seed the default Ambience folder', async () => {
  const store = worldSettings({legacy: 'Ambience', storage: false, folders: []});
  assert.deepEqual(await ensureAmbienceFolders(store.settings, MODULE), []);
  const custom = worldSettings({legacy: 'Tavern', storage: false, folders: []});
  assert.deepEqual(await ensureAmbienceFolders(custom.settings, MODULE), [{source: 'data', path: 'Tavern'}]);
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

test('an ambience layer shows its file name, with the typed group name as the subtitle', () => {
  const path = 'modules/psfx-ambience/library/ambient/animals/birds/birds-forest-farmland-spring-loop-10mins-001.ogg';
  const file = 'birds-forest-farmland-spring-loop-10mins-001.ogg';
  assert.equal(ambienceShownName({path, name: 'Village near church'}), file);
  assert.equal(ambienceShownName({path, name: file}), file);
  assert.equal(ambienceGroupName({path, name: 'Village near church'}), 'Village near church');
  assert.equal(ambienceGroupName({path, name: file, getFlag: (_id, key) => key === 'group' ? 'Village near church' : ''}), 'Village near church');
  assert.equal(ambienceGroupName({path, name: file}), '');
  assert.equal(ambienceGroupName({path: 'Ambience/nested/rain.ogg', name: 'rain.ogg'}), '');
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
  const saved = [{type: 'ambience', config: {name: 'Village near church', files: [{path: 'Ambience/nested/rain.ogg', volume: 0.4}]}}];
  const before = structuredClone(saved);
  const store = worldSettings({legacy: 'Ambience'});
  await ensureAmbienceFolders(store.settings, MODULE);
  assert.deepEqual(saved, before);
  assert.equal(store.data.ambienceMigrated, true);

  const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('async function run(type, config)'), source.indexOf('async function ambienceForm'));
  const updates = [];
  const created = [];
  const warnings = [];
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
    ui: {notifications: {warn(message) { warnings.push(message); }}},
    config: saved[0].config,
    Playlist: {async create() { throw new Error('the existing ambience playlist should be reused'); }},
    ambienceGroupName,
    foundry: {applications: {apps: {FilePicker: {async browse() { browsed = true; return {files: [], dirs: []}; }}}}}
  });
  context.game = {playlists: {find() { return playlist; }}};
  vm.runInContext(fn, context);
  await vm.runInContext('run("ambience", config)', context);
  assert.equal(browsed, false);
  assert.deepEqual(created, []);
  assert.deepEqual(updates, [{playing: true, repeat: true, volume: 0.4, name: 'rain.ogg', 'flags.morelord-game-master.group': 'Village near church'}]);
  playlist.sounds = [];
  updates.length = 0;
  await vm.runInContext('run("ambience", config)', context);
  assert.equal(created[0].path, 'Ambience/nested/rain.ogg');
  assert.equal(created[0].name, 'rain.ogg');
  assert.equal(created[0].flags[MODULE].group, 'Village near church');
  assert.deepEqual(updates, [{playing: true, repeat: true, volume: 0.4, name: 'rain.ogg', 'flags.morelord-game-master.group': 'Village near church'}]);
  const createdBeforeBlank = created.length;
  await vm.runInContext('run("ambience", {files: [{path: "Ambience/nested/rain.ogg", volume: 0.4}]})', context);
  assert.deepEqual(warnings, ['Name your ambience before adding it.']);
  assert.equal(created.length, createdBeforeBlank);
});

test('the ambience picker and settings dialog use folder paths and relative labels', () => {
  const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const form = source.slice(source.indexOf('async function ambienceForm'), source.indexOf('export async function requestCheck'));
  const settings = source.slice(source.indexOf('function ambienceFolderRow'), source.length);
  assert.match(form, /label\("Name"/);
  assert.match(form, /input\("name", ""/);
  assert.match(form, /id="ml-game-master-ambience-name"/);
  assert.doesNotMatch(form, /ml-game-master-ambience-name" required/);
  assert.match(form, /Name your ambience before adding it/);
  assert.match(form, /Select at least one sound/);
  assert.doesNotMatch(form, /throw new Error\("Name/);
  assert.doesNotMatch(form, /throw new Error\("Select at least one sound/);
  assert.doesNotMatch(form, /ambienceNameFromPath/);
  assert.doesNotMatch(form, /join\(" \+ "\)/);
  assert.match(form, /const fileName = file\.path\.split\("\/"\)\.pop\(\)/);
  assert.doesNotMatch(form, /name="name\$\{i\}"/);
  assert.match(form, /data-tooltip="\$\{e\(file\.path\)\}"/);
  assert.match(form, /aria-label="\$\{e\(file\.path\)\}"/);
  assert.doesNotMatch(form, /file\.label/);
  assert.doesNotMatch(form, /No audio files found in the configured Ambience folder\./);
  assert.match(settings, /data-mlgm-add-ambience/);
  assert.match(settings, /data-mlgm-remove-ambience/);
  assert.match(settings, /FilePicker\.implementation/);
  assert.doesNotMatch(settings, /resolveAmbiencePickerPath/);
  assert.doesNotMatch(settings, /!current\?\.path/);
  assert.match(settings, /new Picker\(ambiencePickerOptions/);
  assert.match(settings, /LAST_BROWSED_DIRECTORY = ""/);
  assert.match(settings, /await picker\.browse\(""\)/);
  assert.match(settings, /instance \?\? activePicker/);
  assert.match(settings, /await picker\.render\(\{force: true\}\)/);
  assert.match(settings, /bringToFront\?\.\(\)/);
  assert.match(settings, /path: ""/);
  assert.match(settings, /form\("Game Master settings",[\s\S]*\{modal: false\}\)/);
  assert.match(form, /presentAmbienceScan/);
  assert.doesNotMatch(form, /throw new Error\("No audio files found/);
  assert.match(source, /register\(ID, AMBIENCE_FOLDERS, \{[^}]*default: \[\] \}/);
  assert.doesNotMatch(source, /default: \[\{source: "data", path: "Ambience"\}\]/);
  assert.match(settings, /AMBIENCE_FOLDERS/);
  assert.doesNotMatch(settings, /set\(ID,\s*"ambienceFolder"/);
  assert.doesNotMatch(settings, /new foundry\.applications\.apps\.FilePicker\(/);
});

test('the folder browser opens at the data root when the current folder is missing', async () => {
  const missing = await resolveAmbiencePickerPath({source: 'data', path: 'Ambience'}, async () => {
    throw new Error('The directory Ambience does not exist');
  });
  assert.deepEqual({source: missing.source, path: missing.path}, {source: 'data', path: ''});
  assert.equal(missing.error.message, 'The directory Ambience does not exist');
  const present = await resolveAmbiencePickerPath({source: 's3', path: 'audio/tavern'}, async () => ({dirs: []}));
  assert.deepEqual({source: present.source, path: present.path}, {source: 's3', path: 'audio/tavern'});
  const callback = () => {};
  assert.equal(ambiencePickerOptions(missing, callback).current, '');
  assert.equal(ambiencePickerOptions(missing, callback).activeSource, undefined);
  assert.equal(ambiencePickerOptions(present, callback).activeSource, 's3');
  assert.equal(ambiencePickerOptions({source: 'data', path: ''}, callback).current, '');
});

test('a missing ambience folder is skipped with one notice and no thrown error', async () => {
  const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('async function ambienceForm'), source.indexOf('export async function requestCheck'));
  const warnings = [];
  const notices = [];
  let opened = false;
  const context = vm.createContext({
    ID: MODULE,
    AMBIENCE_FOLDERS: 'ambienceFolders',
    normalizeAmbienceFolders,
    collectAmbienceFiles,
    presentAmbienceScan,
    get: () => [{source: 'data', path: 'Ambience'}, {source: 'data', path: 'Missing'}],
    console: {warn(...args) { warnings.push(args.map(item => item?.message ?? String(item)).join(' ')); }},
    notify(message) { notices.push(message); },
    form() { opened = true; },
    foundry: {applications: {apps: {FilePicker: {async browse(_source, target) {
      throw new Error(`The directory ${target} does not exist`);
    }}}}}
  });
  vm.runInContext(fn, context);
  await vm.runInContext('ambienceForm()', context);
  assert.equal(opened, false);
  assert.equal(warnings.length, 2);
  assert.deepEqual(notices, ['Some Ambience folders could not be read and were skipped.']);
  const kept = [];
  const files = presentAmbienceScan({
    files: [{path: 'Music/rain.ogg'}],
    errors: [new Error('Ambience missing')]
  }, {warn() {}, notify(message) { kept.push(message); }});
  assert.deepEqual(files, [{path: 'Music/rain.ogg'}]);
  assert.deepEqual(kept, ['An Ambience folder could not be read and was skipped.']);
  const quiet = [];
  assert.deepEqual(presentAmbienceScan({files: [], errors: []}, {notify(message) { quiet.push(message); }}), []);
  assert.deepEqual(quiet, ['No audio files found in the Ambience folders.']);
});

const VOID_TAGS = new Set(['input', 'br', 'img', 'hr']);

function dataName(attribute) {
  return attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function elementMatches(node, selector) {
  if (!selector.startsWith('[')) return node.tag === selector;
  const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if (!attr) return false;
  const [, name, expected] = attr;
  if (name.startsWith('data-')) {
    const actual = node.dataset[dataName(name)];
    return expected === undefined ? actual != null : actual === expected;
  }
  return expected === undefined ? node.attrs[name] != null : node.attrs[name] === expected;
}

function createElement(tag, attrs = {}) {
  const node = {
    tag, attrs: {...attrs}, children: [], parent: null, listeners: {}, dataset: {},
    value: attrs.value ?? ''
  };
  for (const [name, value] of Object.entries(attrs)) {
    if (name.startsWith('data-')) node.dataset[dataName(name)] = value;
  }
  node.matches = selector => elementMatches(node, selector);
  node.closest = selector => {
    let current = node;
    while (current) {
      if (elementMatches(current, selector)) return current;
      current = current.parent;
    }
    return null;
  };
  node.querySelectorAll = selector => {
    const found = [];
    for (const child of node.children) {
      if (elementMatches(child, selector)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  };
  node.querySelector = selector => node.querySelectorAll(selector)[0] ?? null;
  node.addEventListener = (type, listener) => { node.listeners[type] = listener; };
  node.remove = () => {
    if (!node.parent) return;
    node.parent.children = node.parent.children.filter(child => child !== node);
    node.parent = null;
  };
  node.insertAdjacentHTML = (position, html) => {
    if (position !== 'beforebegin' || !node.parent) throw new Error(`unsupported insert ${position}`);
    const index = node.parent.children.indexOf(node);
    const parsed = parseNodes(html);
    parsed.forEach((child, offset) => {
      child.parent = node.parent;
      node.parent.children.splice(index + offset, 0, child);
    });
  };
  return node;
}

function parseNodes(html) {
  const nodes = [];
  let rest = html.trim();
  while (rest) {
    if (rest.startsWith('</')) break;
    if (!rest.startsWith('<')) {
      const next = rest.indexOf('<');
      const text = next === -1 ? rest : rest.slice(0, next);
      if (text.trim()) nodes.push(Object.assign(createElement('#text'), {text}));
      rest = next === -1 ? '' : rest.slice(next);
      continue;
    }
    const open = rest.match(/^<([a-z0-9-]+)([^>]*?)>/i);
    if (!open) throw new Error(`bad html: ${rest.slice(0, 80)}`);
    const tag = open[1].toLowerCase();
    const attrs = {};
    for (const attr of open[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) {
      if (attr[1] !== '/') attrs[attr[1]] = attr[2] ?? '';
    }
    const node = createElement(tag, attrs);
    if (VOID_TAGS.has(tag) || /\/\s*$/.test(open[2])) {
      nodes.push(node);
      rest = rest.slice(open[0].length).trimStart();
      continue;
    }
    const token = new RegExp(`<${tag}(?:\\s[^>]*)?>|</${tag}>`, 'gi');
    token.lastIndex = open[0].length;
    let depth = 1;
    let end = -1;
    for (let match = token.exec(rest); match; match = token.exec(rest)) {
      depth += match[0].toLowerCase().startsWith('</') ? -1 : 1;
      if (depth === 0) { end = match.index; break; }
    }
    if (end < 0) throw new Error(`unclosed ${tag}`);
    node.children = parseNodes(rest.slice(open[0].length, end));
    for (const child of node.children) child.parent = node;
    nodes.push(node);
    rest = rest.slice(end + `</${tag}>`.length).trimStart();
  }
  return nodes;
}

function folderRows(fieldset) {
  return [...fieldset.querySelectorAll('[data-mlgm-ambience-folder]')].map(row => ({
    source: row.querySelector('[name="ambienceSource"]').value,
    path: row.querySelector('[name="ambiencePath"]').value
  }));
}

test('selecting a folder adds it to the list that Save persists', async () => {
  const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('function ambienceFolderRow'), source.indexOf('async function settings'));
  const constructed = [];
  const renders = [];
  const warnings = [];
  const browsed = [];
  let releaseRender = () => {};
  const renderGate = new Promise(resolve => { releaseRender = resolve; });
  class FilePicker {
    static LAST_BROWSED_DIRECTORY = 'Music/last-used';
    static browse(source, target) {
      browsed.push({source, target});
      if (target === 'Ambience') throw new Error('The directory Ambience does not exist');
      return {files: [], dirs: []};
    }
    constructor(options) {
      this.options = options;
      this.activeSource = 'data';
      this.lastAtConstruct = this.constructor.LAST_BROWSED_DIRECTORY;
      constructed.push(this);
    }
    browse(target) {
      this.browsedTarget = target;
      return Promise.resolve(this);
    }
    render(options) {
      renders.push(options);
      return renderGate.then(() => this);
    }
    bringToFront() { this.front = true; }
  }
  class FilePickerImplementation extends FilePicker {}
  const foundry = {applications: {apps: {FilePicker}}};
  foundry.applications.apps.FilePicker.implementation = FilePickerImplementation;
  const failures = [];
  const context = vm.createContext({
    ID: MODULE,
    e: escapeHTML,
    folderFromFilePicker,
    resolveAmbiencePickerPath,
    ambiencePickerOptions,
    foundry,
    console: {warn(...args) { warnings.push(args.map(item => item?.message ?? String(item)).join(' ')); }, error() {}},
    fail(error) { failures.push(error); }
  });
  vm.runInContext(fn, context);
  const html = vm.runInContext('ambienceFolderEditor([{source: "data", path: "Ambience"}])', context);
  const fieldset = parseNodes(html)[0];
  const dialog = createElement('div');
  fieldset.parent = dialog;
  dialog.children = [fieldset];
  context.dialog = dialog;
  vm.runInContext('bindAmbienceFolderEditor(dialog)', context);
  vm.runInContext('bindAmbienceFolderEditor(dialog)', context);
  const add = fieldset.querySelector('[data-mlgm-add-ambience]');
  const flags = {prevented: false, stopped: false};
  const pending = fieldset.listeners.click.call(fieldset, {
    target: add,
    preventDefault() { flags.prevented = true; },
    stopPropagation() { flags.stopped = true; }
  });
  let opened = false;
  pending.then(() => { opened = true; });
  for (let i = 0; i < 20 && renders.length < 1; i += 1) await Promise.resolve();
  assert.equal(opened, false);
  assert.equal(constructed.length, 1);
  assert.equal(constructed[0].constructor, FilePickerImplementation);
  assert.equal(constructed[0].options.type, 'folder');
  assert.equal(constructed[0].options.current, '');
  assert.equal(constructed[0].lastAtConstruct, '');
  assert.equal(constructed[0].browsedTarget, '');
  assert.equal(constructed[0].front, undefined);
  assert.equal(typeof constructed[0].options.callback, 'function');
  assert.deepEqual(Object.keys(constructed[0].options).sort(), ['callback', 'current', 'type']);
  assert.deepEqual(browsed, []);
  assert.equal(warnings.length, 0);
  assert.equal(renders.length, 1);
  assert.equal(renders[0].force, true);
  assert.deepEqual(Object.keys(renders[0]), ['force']);
  releaseRender();
  await pending;
  assert.equal(FilePickerImplementation.LAST_BROWSED_DIRECTORY, 'Music/last-used');
  assert.equal(opened, true);
  assert.equal(constructed[0].front, true);
  assert.deepEqual(failures, []);
  assert.equal(flags.prevented, true);
  assert.equal(flags.stopped, true);

  const picker = constructed[0];
  picker.options.callback('Ambience');
  picker.options.callback('');
  picker.options.callback('Music/tavern');
  picker.options.callback('Music/tavern');
  picker.options.callback('tavern', {activeSource: 's3', source: {bucket: 'audio', target: 'tavern'}});
  const saved = normalizeAmbienceFolders(folderRows(fieldset));
  assert.deepEqual(saved, [
    {source: 'data', path: 'Ambience'},
    {source: 'data', path: 'Music/tavern'},
    {source: 's3', path: 'audio/tavern'}
  ]);

  const added = fieldset.querySelectorAll('[data-mlgm-ambience-folder]').at(-1);
  fieldset.listeners.click.call(fieldset, {
    target: added.querySelector('i'),
    preventDefault() {},
    stopPropagation() {}
  });
  assert.deepEqual(normalizeAmbienceFolders(folderRows(fieldset)), [
    {source: 'data', path: 'Ambience'},
    {source: 'data', path: 'Music/tavern'}
  ]);

  foundry.applications.apps.FilePicker.implementation = undefined;
  const fallback = fieldset.listeners.click.call(fieldset, {
    target: add,
    preventDefault() {},
    stopPropagation() {}
  });
  releaseRender();
  await fallback;
  assert.equal(constructed.at(-1).constructor, FilePicker);
  assert.equal(constructed.at(-1).options.current, '');
  assert.equal(constructed.at(-1).lastAtConstruct, '');
  assert.equal(constructed.at(-1).browsedTarget, '');
  constructed.at(-1).activeSource = 'public';
  constructed.at(-1).options.callback('library/rain');
  assert.deepEqual(normalizeAmbienceFolders(folderRows(fieldset)), [
    {source: 'data', path: 'Ambience'},
    {source: 'data', path: 'Music/tavern'},
    {source: 'public', path: 'library/rain'}
  ]);
});
