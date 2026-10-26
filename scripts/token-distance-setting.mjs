const CORE_ID = 'morelord-core';
export const TOKEN_DISTANCE_KEY = 'tokenDistanceIndicator';
const SETTING_ID = `${CORE_ID}.${TOKEN_DISTANCE_KEY}`;

export const tokenDistanceWorldHint = 'Hover to measure from your character or selected token; GMs select one token first. The GM choice applies to everyone. Disable when using Hover Distance.';

/** Previous client values were JSON booleans in local storage. Anything else is treated as unset. */
export function readLegacyClientTokenDistance(storage) {
  let raw;
  try { raw = storage?.getItem?.(SETTING_ID); }
  catch { return {stored: false}; }
  if (raw == null) return {stored: false};
  try {
    const value = JSON.parse(raw);
    return typeof value === 'boolean' ? {stored: true, value} : {stored: false};
  } catch { return {stored: false}; }
}

export function tokenDistanceWorldStored(settings) {
  const world = settings?.storage?.get?.('world');
  if (!world) return false;
  try {
    if (typeof world.getSetting === 'function') return world.getSetting(SETTING_ID) != null;
  } catch { /* Fall through to a key scan. Document id is not the setting key. */ }
  const docs = typeof world.values === 'function' ? world.values() : world;
  for (const doc of docs ?? []) if (doc?.key === SETTING_ID) return true;
  return false;
}

/**
 * A GM copies an explicit client "off" into the world once. Only this browser has that old value.
 * An unset or enabled client value leaves the world default on. Every client then reads that world value.
 */
export function tokenDistanceMigration({worldStored, legacy, isGM}) {
  const clearLegacy = legacy?.stored === true;
  if (!worldStored && isGM === true && legacy?.stored === true && legacy.value === false) {
    return {write: true, value: false, clearLegacy};
  }
  return {write: false, clearLegacy};
}

/** Core registers this per client. Point the live registration at the world so every client reads one GM choice. */
export function promoteTokenDistanceSetting(settings) {
  const setting = settings?.settings?.get?.(SETTING_ID);
  if (!setting) return {promoted: false, reason: 'missing'};
  if (setting.scope === 'world' && setting.restricted === true) return {promoted: false, reason: 'world'};
  setting.scope = 'world';
  setting.restricted = true;
  setting.config = true;
  setting.hint = tokenDistanceWorldHint;
  return {promoted: true};
}

export async function applyTokenDistanceWorldSetting(settings, {storage, isGM} = {}) {
  const promotion = promoteTokenDistanceSetting(settings);
  if (promotion.reason === 'missing') return {...promotion, write: false, clearLegacy: false};
  const decision = tokenDistanceMigration({
    worldStored: tokenDistanceWorldStored(settings),
    legacy: readLegacyClientTokenDistance(storage),
    isGM
  });
  if (decision.write) await settings.set(CORE_ID, TOKEN_DISTANCE_KEY, decision.value);
  if (decision.clearLegacy) {
    try { storage?.removeItem?.(SETTING_ID); }
    catch { /* The world value is already authoritative if the write succeeded. */ }
  }
  return {...promotion, ...decision};
}
