import {ID, escapeHTML as e} from './core.mjs';
import {core, activeGM, createRequest} from './requests.mjs';

import {triggerMacroUuid} from './trigger-catalog.mjs';
export {triggerMacroUuid} from './trigger-catalog.mjs';

// The manager owns hook/timer disposal; executable conditions and actions live in Macro documents.
export function createTriggerRuntime({resolve = uuid => fromUuid(uuid), hooks = Hooks,
  interval = setInterval, clear = clearInterval, onError = error => ui.notifications.error(error.message)} = {}) {
  const running = new Map(), errors = new Map();
  let syncQueue = Promise.resolve(), eventQueue = Promise.resolve();
  function stop(id) {
    const entry = running.get(id);
    if (!entry) return;
    entry.active = false;
    for (const [name, handle] of entry.hooks) hooks.off(name, handle);
    for (const handle of entry.timers) clear(handle);
    running.delete(id);
  }
  function current(entry) {
    return entry.active && game.user.isGM && (game.settings.get(ID, 'board').triggers ?? [])
      .some(trigger => trigger.id === entry.trigger.id && trigger.enabled && JSON.stringify(trigger) === entry.signature);
  }
  async function sync() {
    const wanted = game.user.isGM ? (game.settings.get(ID, 'board').triggers ?? []).filter(t => t.enabled) : [];
    for (const id of errors.keys()) if (!wanted.some(t => t.id === id)) errors.delete(id);
    for (const [id, entry] of running) if (!wanted.some(t => t.id === id && JSON.stringify(t) === entry.signature)) stop(id);
    for (const trigger of wanted) {
      if (running.has(trigger.id)) continue;
      const entry = {trigger, signature: JSON.stringify(trigger), active: true, hooks: [], timers: []};
      running.set(trigger.id, entry);
      try {
        const macro = await resolve(trigger.macroUuid ?? triggerMacroUuid(trigger.kind));
        if (!current(entry)) { stop(trigger.id); continue; }
        if (macro?.documentName !== 'Macro' || macro.type !== 'script' || !macro.canExecute)
          throw new Error(`${trigger.name}: its script macro is unavailable. Restart Foundry after installing the Macros pack.`);
        const guard = fn => (...args) => {
          if (!current(entry)) return;
          try {
            const result = fn(...args);
            if (result?.catch) result.catch(onError);
            return result;
          } catch (error) { onError(error); }
        };
        const managedHooks = {on(name, fn) {
          const handle = hooks.on(name, guard(fn)); entry.hooks.push([name, handle]); return handle;
        }};
        const enqueue = fn => {
          eventQueue = eventQueue.catch(() => {}).then(() => current(entry) ? fn() : undefined);
          return eventQueue;
        };
        const result = await macro.execute({runtime: {
          trigger, Hooks: managedHooks, enqueue,
          setInterval(fn, ms) { const handle = interval(guard(fn), ms); entry.timers.push(handle); return handle; },
          services: {ID, e, core, activeGM, createRequest}
        }});
        if (result !== true) throw new Error(`${trigger.name}: macro did not install its listener.`);
        errors.delete(trigger.id);
      } catch (error) { stop(trigger.id); errors.set(trigger.id, error.message); onError(error); }
    }
  }
  return {
    sync() { syncQueue = syncQueue.catch(() => {}).then(sync).then(() => { hooks.callAll?.('morelordGameMasterTriggersChanged'); }); return syncQueue; },
    stopAll() { for (const id of [...running.keys()]) stop(id); },
    status(id) { return running.has(id) ? 'Running' : errors.has(id) ? 'Unavailable' : 'Stopped'; },
    error(id) { return errors.get(id); },
    idle() { return eventQueue; }
  };
}

let runtime;
export const triggerStatus = id => runtime?.status(id) ?? 'Stopped';
export async function initializeTriggerMacros() {
  if (runtime) { await runtime.sync(); return runtime; }
  runtime = createTriggerRuntime();
  Hooks.on('updateSetting', setting => {
    if (setting.key === `${ID}.board`) void runtime.sync();
  });
  // A deliberate macro edit replaces its listeners once; normal tray rendering never installs hooks.
  Hooks.on('updateMacro', macro => {
    if ((game.settings.get(ID, 'board').triggers ?? []).some(t => (t.macroUuid ?? triggerMacroUuid(t.kind)) === macro.uuid)) {
      runtime.stopAll(); void runtime.sync();
    }
  });
  await runtime.sync();
  return runtime;
}
