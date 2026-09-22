import {ID} from './core.mjs';
import {activeGM} from './requests.mjs';

const clockTrigger = () => (game.settings.get(ID, 'board').triggers ?? []).find(t => t.kind === 'world-clock' && t.enabled);
export function clockInterval(trigger) {
  const gameMinutes = Number(trigger.gameMinutes ?? 10), realMinutes = Number(trigger.realMinutes ?? 1);
  if (![gameMinutes, realMinutes].every(n => Number.isFinite(n) && n > 0) || !Number.isFinite(gameMinutes * 60) || !Number.isFinite(realMinutes * 60000))
    throw new Error('Clock intervals must be positive, finite numbers.');
  return {gameMinutes, realMinutes};
}

// One active GM owns the timer. Relative advances preserve manual calendar edits.
export function createWorldClock(now = () => performance.now()) {
  let previous = now(), elapsed = 0, signature, running = false, busy = false;
  return async function tick() {
    const current = now(), delta = Math.max(0, current - previous); previous = current;
    const trigger = clockTrigger();
    const nextSignature = trigger && `${trigger.id}:${trigger.gameMinutes}:${trigger.realMinutes}`;
    if (signature !== nextSignature) { elapsed = 0; signature = nextSignature; running = false; }
    const owner = game.user.isGM && activeGM()?.id === game.user.id;
    if (!owner) elapsed = 0;
    const enabled = Boolean(trigger && owner && !game.paused && !game.combats?.some(c => c.started));
    if (running && enabled) elapsed += delta;
    running = enabled;
    if (!enabled || busy) return;
    const {gameMinutes, realMinutes} = clockInterval(trigger);
    const interval = realMinutes * 60000, count = Math.floor(elapsed / interval);
    if (!count) return;
    elapsed -= count * interval;
    busy = true;
    try { await game.time.advance(count * gameMinutes * 60); }
    catch (error) { elapsed += count * interval; throw error; }
    finally { busy = false; }
  };
}

// These hooks run only on the initiating client. Persist deferred rounds with
// the combat update so refreshes and GM handoffs retain combat time.
export function deferCombatTime(combat, changes, options) {
  if (!game.user.isGM || !('round' in changes || 'turn' in changes)) return;
  const saved = combat.getFlag(ID, 'clockSeconds');
  if (saved == null && !clockTrigger()) return;
  const round = Number(changes.round ?? combat.round);
  const seconds = round > 0 ? Math.max(0, Number(saved ?? 0) + (combat.round > 0 ? (round - combat.round) * 6 : 0)) : null;
  changes[`flags.${ID}.clockSeconds`] = seconds;
  // Foundry 14 includes native round/turn time in the database operation.
  if (options.worldTime) options.worldTime.delta = 0;
}

export function initializeWorldClock() {
  const tick = createWorldClock();
  const refresh = () => { tick().catch(error => ui.notifications.error(error.message)); };
  setInterval(refresh, 1000);
  for (const hook of ['pauseGame', 'updateCombat', 'createCombat', 'deleteCombat', 'updateUser', 'updateSetting']) Hooks.on(hook, refresh);
  Hooks.on('preUpdateCombat', deferCombatTime);
  Hooks.on('deleteCombat', combat => {
    if (!game.user.isGM || activeGM()?.id !== game.user.id || !combat.started) return;
    const saved = combat.getFlag(ID, 'clockSeconds');
    if (saved == null && !clockTrigger()) return;
    // Include the final round being played; unstarted combats contribute nothing.
    game.time.advance(Number(saved ?? 0) + 6).catch(error => ui.notifications.error(error.message));
  });
  refresh();
}

// Finish already-deferred combat time after a clock is stopped or its macro becomes unavailable.
// This recovery owns no timer and cannot start deferring a new combat.
export function initializeDeferredClockSettlement(isRunning) {
  Hooks.on('preUpdateCombat', (combat, changes, options) => {
    if (!isRunning() && combat.getFlag(ID,'clockSeconds') != null) deferCombatTime(combat, changes, options);
  });
  Hooks.on('deleteCombat', combat => {
    if (isRunning() || !game.user.isGM || activeGM()?.id !== game.user.id || !combat.started) return;
    const saved = combat.getFlag(ID,'clockSeconds');
    if (saved != null) game.time.advance(Number(saved)+6).catch(error=>ui.notifications.error(error.message));
  });
}
