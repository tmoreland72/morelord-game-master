import {ID} from './core.mjs';

export const BULK_UNDO = 'bulkUndo';
export const BULK_QUEUE = `${ID}.bulk-actions`;

// The world setting used to be an object defaulting to `{empty: true}`. Foundry
// merges that object on update, so get() can come back without `kind` and the
// tray keeps saying there is nothing to undo. A JSON string replaces the whole
// value. `pending` is shown until get() returns that same snapshot, including
// when a re-render still sees the old default.
let pendingWrite = false;
let pendingValue = null;

function canonical(snapshot) {
  if (!snapshot?.kind) return null;
  return JSON.parse(JSON.stringify(snapshot));
}

export function parseBulkUndo(value) {
  if (typeof value === 'string') {
    if (!value) return null;
    try { value = JSON.parse(value); }
    catch { return null; }
  }
  return value?.kind ? value : null;
}

function sameUndo(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function readBulkUndo() {
  let stored = null;
  try { stored = parseBulkUndo(game.settings?.get?.(ID, BULK_UNDO)); }
  catch { stored = null; }
  if (pendingWrite) {
    if (sameUndo(stored, pendingValue)) pendingWrite = false;
    else return pendingValue;
  }
  return stored;
}

export async function writeBulkUndo(snapshot) {
  const value = canonical(snapshot);
  pendingValue = value;
  pendingWrite = true;
  if (typeof game.settings?.set !== 'function') return value;
  await game.settings.set(ID, BULK_UNDO, value ? JSON.stringify(value) : '', {diff: false});
  return value;
}
