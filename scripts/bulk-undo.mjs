import {ID} from './core.mjs';

export const BULK_UNDO = 'bulkUndo';
export const BULK_QUEUE = `${ID}.bulk-actions`;

export function readBulkUndo() {
  try {
    const value = game.settings?.get?.(ID, BULK_UNDO);
    return value?.kind ? value : null;
  } catch {
    return null;
  }
}

export async function writeBulkUndo(snapshot) {
  const value = snapshot?.kind ? snapshot : {empty: true};
  if (typeof game.settings?.set !== 'function') return value;
  await game.settings.set(ID, BULK_UNDO, value);
  return value;
}
