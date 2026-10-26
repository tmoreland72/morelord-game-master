import {ID} from './core.mjs';

export const AMBIENCE_FOLDERS = 'ambienceFolders';
export const AMBIENCE_MIGRATED = 'ambienceMigrated';
export const LEGACY_AMBIENCE_FOLDER = 'ambienceFolder';
export const LEGACY_AMBIENCE_DEFAULT = 'Ambience';
const AUDIO_FILE = /\.(mp3|ogg|wav|flac|webm|m4a)$/i;
const MAX_DEPTH = 32;
const MAX_DIRECTORIES = 5000;

export function normalizePath(path) {
  let value = String(path ?? '').trim().replace(/\\/g, '/');
  value = value.replace(/\/{2,}/g, '/').replace(/^\/+/, '');
  while (value.startsWith('./')) value = value.slice(2);
  value = value.replace(/\/+$/, '');
  if (value === '.' || value === '') return '';
  return value;
}

export function normalizeAmbienceFolder(entry) {
  const source = String((typeof entry === 'string' ? 'data' : entry?.source) ?? 'data').trim() || 'data';
  const path = normalizePath(typeof entry === 'string' ? entry : entry?.path);
  if (!path || path.split('/').some(part => !part || part === '.' || part === '..')) return null;
  return {source, path};
}

export function normalizeAmbienceFolders(folders) {
  const seen = new Set();
  const result = [];
  for (const entry of folders ?? []) {
    const folder = normalizeAmbienceFolder(entry);
    if (!folder) continue;
    const key = `${folder.source}\0${folder.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(folder);
  }
  return result;
}

export function folderFromFilePicker(path, picker) {
  const active = picker?.activeSource;
  const named = picker?.source;
  const source = typeof active === 'string' && active ? active : typeof named === 'string' && named ? named : 'data';
  let stored = path;
  const bucket = named && typeof named === 'object' ? named.bucket : '';
  if (source === 's3' && bucket) {
    const normalized = normalizePath(path);
    stored = !normalized || normalized === bucket || normalized.startsWith(`${bucket}/`) ? normalized : `${bucket}/${normalized}`;
  }
  return normalizeAmbienceFolder({source, path: stored});
}

export function migrateAmbienceFolders({legacy, legacyStored, folders, migrated}) {
  const current = normalizeAmbienceFolders(folders);
  if (migrated) return {folders: current, migrated: true};
  if (!legacyStored) return {folders: current, migrated: true};
  const path = normalizePath(legacy);
  return {folders: path ? [{source: 'data', path}] : [], migrated: true};
}

function settingValue(document) {
  if (typeof document === 'string') return document;
  if (document && typeof document.get === 'function') {
    try {
      const value = document.get('value');
      if (typeof value === 'string') return value;
    } catch { /* The value property below is the fallback. */ }
  }
  if (document && typeof document === 'object' && 'value' in document) return document.value ?? '';
  return '';
}

export function readLegacyAmbienceFolder(settings, moduleId = ID) {
  let world;
  try { world = settings?.storage?.get?.('world'); }
  catch { world = null; }
  if (!world || typeof world.get !== 'function') {
    const value = settings.get(moduleId, LEGACY_AMBIENCE_FOLDER);
    const path = normalizePath(value);
    if (!path || path === LEGACY_AMBIENCE_DEFAULT) return {stored: false, value: ''};
    return {stored: true, value};
  }
  const document = world.get(`${moduleId}.${LEGACY_AMBIENCE_FOLDER}`);
  if (document == null) return {stored: false, value: ''};
  const value = settingValue(document);
  return {stored: true, value: value === undefined ? settings.get(moduleId, LEGACY_AMBIENCE_FOLDER) : value};
}

export async function ensureAmbienceFolders(settings, moduleId = ID) {
  const migrated = settings.get(moduleId, AMBIENCE_MIGRATED) === true;
  const existing = normalizeAmbienceFolders(settings.get(moduleId, AMBIENCE_FOLDERS) ?? []);
  if (migrated) return existing;
  const legacy = readLegacyAmbienceFolder(settings, moduleId);
  const next = migrateAmbienceFolders({legacy: legacy.value, legacyStored: legacy.stored, folders: existing, migrated: false}).folders;
  if (JSON.stringify(next) !== JSON.stringify(existing)) await settings.set(moduleId, AMBIENCE_FOLDERS, next);
  await settings.set(moduleId, AMBIENCE_MIGRATED, true);
  return next;
}

export function ambienceRelativeLabel(filePath, folderPath) {
  const file = normalizePath(filePath);
  const folder = normalizePath(folderPath);
  if (folder && file.startsWith(`${folder}/`)) return file.slice(folder.length + 1);
  return file.split('/').pop() || file;
}

export function labelAmbienceFiles(entries) {
  const counts = items => {
    const tally = new Map();
    for (const item of items) tally.set(item.label, (tally.get(item.label) ?? 0) + 1);
    return tally;
  };
  const relative = entries.map(entry => ({...entry, label: ambienceRelativeLabel(entry.path, entry.folder)}));
  const relativeCounts = counts(relative);
  const withFolder = relative.map(entry => relativeCounts.get(entry.label) > 1
    ? {...entry, label: `${normalizePath(entry.folder).split('/').pop()}/${entry.label}`}
    : entry);
  const folderCounts = counts(withFolder);
  return withFolder.map(entry => folderCounts.get(entry.label) > 1
    ? {...entry, label: `${entry.source}:${normalizePath(entry.folder)}/${ambienceRelativeLabel(entry.path, entry.folder)}`}
    : entry);
}

export function browseLocation(source, path) {
  const name = String(source || 'data').trim() || 'data';
  const target = normalizePath(path);
  if (name !== 's3') return {source: name, target, options: {}};
  const slash = target.indexOf('/');
  const bucket = slash === -1 ? target : target.slice(0, slash);
  return {source: name, target: slash === -1 ? '' : target.slice(slash + 1), options: bucket ? {bucket} : {}};
}

export function listedPath(source, root, directory, entry) {
  const base = normalizePath(root);
  const current = normalizePath(directory) || base;
  const next = normalizePath(entry);
  if (!base || !next || next.split('/').some(part => !part || part === '.' || part === '..')) return null;
  const inside = candidate => {
    const path = normalizePath(candidate);
    if (!path || path === base || !path.startsWith(`${base}/`)) return null;
    return path;
  };
  if (next.startsWith(`${base}/`)) return inside(next);
  if (source === 's3') {
    const slash = base.indexOf('/');
    const bucket = slash === -1 ? base : base.slice(0, slash);
    const key = slash === -1 ? '' : base.slice(slash + 1);
    if (bucket && key && (next === key || next.startsWith(`${key}/`))) return inside(`${bucket}/${next}`);
    if (bucket && !key) return inside(`${bucket}/${next}`);
  }
  // A bare name is a child of the directory being listed. The same name as this
  // directory or one of its parents is the current folder or a walk upward.
  if (!next.includes('/')) {
    if (current.split('/').includes(next)) return null;
    return inside(`${current}/${next}`);
  }
  return null;
}

export async function collectAmbienceFiles(folders, browse) {
  const found = [];
  const errors = [];
  const seenFiles = new Set();
  const seenDirs = new Set();
  let directories = 0;

  async function walk(source, root, directory, depth) {
    if (depth > MAX_DEPTH || directories >= MAX_DIRECTORIES) return;
    const location = browseLocation(source, directory);
    const visit = `${location.source}\0${location.options.bucket ?? ''}\0${location.target}`;
    if (seenDirs.has(visit)) return;
    seenDirs.add(visit);
    directories += 1;
    let result;
    try { result = await browse(location.source, location.target, location.options); }
    catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    for (const entry of result?.files ?? []) {
      const path = listedPath(source, root, directory, entry);
      if (!path || !AUDIO_FILE.test(path)) continue;
      const key = `${source}\0${path}`;
      if (seenFiles.has(key)) continue;
      seenFiles.add(key);
      found.push({source, path, folder: root});
    }
    if (depth >= MAX_DEPTH) return;
    for (const entry of result?.dirs ?? []) {
      const path = listedPath(source, root, directory, entry);
      if (path) await walk(source, root, path, depth + 1);
    }
  }

  for (const folder of normalizeAmbienceFolders(folders)) await walk(folder.source, folder.path, folder.path, 0);
  found.sort((a, b) => a.path.localeCompare(b.path) || a.source.localeCompare(b.source));
  return {files: labelAmbienceFiles(found), errors};
}

export async function resolveAmbiencePickerPath(folder, browse) {
  const source = String(folder?.source || 'data').trim() || 'data';
  const path = normalizePath(folder?.path);
  if (!path) return {source: 'data', path: ''};
  const location = browseLocation(source, path);
  try {
    await browse(location.source, location.target, location.options);
    return {source, path};
  } catch (error) {
    return {source: 'data', path: '', error: error instanceof Error ? error : new Error(String(error))};
  }
}

export function ambiencePickerOptions(target, callback) {
  const path = target?.path || '';
  const options = {type: 'folder', current: path, callback};
  if (path && target?.source && target.source !== 'data') options.activeSource = target.source;
  return options;
}

export function presentAmbienceScan({files = [], errors = []} = {}, {warn = () => {}, notify = () => {}} = {}) {
  for (const error of errors) warn(error);
  if (errors.length === 1) notify('An Ambience folder could not be read and was skipped.');
  else if (errors.length > 1) notify('Some Ambience folders could not be read and were skipped.');
  else if (!files.length) notify('No audio files found in the Ambience folders.');
  return files;
}
