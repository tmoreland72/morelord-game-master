// The tray sits above Foundry's window layer and below tooltips.
// ApplicationV2.bringToFront (and Application v1 bringToTop) raise a window by
// incrementing the shared _maxZ counter from that window layer. Dialogs, roll
// prompts, and chat popouts use the same counter, so a tray at the tooltip
// layer covers them. Popups are moved above the tray. A normal window whose
// counter crosses the tray is put back under it, and _maxZ is returned to the
// window band so the next focused sheet does not follow the popup up.

const WRAPPED = Symbol("mlgmTrayStack");
const hooked = new WeakSet();
export const TRAY_Z_OFFSET = 1000;

function named(app, name) {
  let ctor = app?.constructor;
  while (ctor) {
    if (ctor.name === name) return true;
    ctor = Object.getPrototypeOf(ctor);
  }
  return false;
}

export function isTrayPopup(app, {DialogV2, Dialog, ChatPopout, FilePicker} = {}) {
  if (!app) return false;
  if (DialogV2 && app instanceof DialogV2) return true;
  if (Dialog && app instanceof Dialog) return true;
  if (ChatPopout && app instanceof ChatPopout) return true;
  if (FilePicker && (app instanceof FilePicker || (FilePicker.implementation && app instanceof FilePicker.implementation))) return true;
  // Subclasses keep the base name in the chain when the live class is not the one Foundry exported.
  if (named(app, "ChatPopout") || named(app, "FilePicker")) return true;
  if (app.options?.tag === "dialog") return true;
  const element = app.element;
  if (!element) return false;
  if (typeof HTMLDialogElement === "function" && element instanceof HTMLDialogElement) return true;
  return element.tagName === "DIALOG";
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function createStackController({root, windowLayer = 100, tooltipLayer = 9999, readZ, writeZ, readMaxZ, writeMaxZ, kinds = {}}) {
  let highestWindow = Math.max(0, windowLayer);
  let popupFront = 0;

  function trayZ() {
    const z = numeric(readZ(root));
    return z > 0 ? z : windowLayer + TRAY_Z_OFFSET;
  }

  function capMax() {
    const tray = trayZ();
    const current = (readMaxZ?.() ?? []).filter(z => Number.isFinite(z));
    const low = current.filter(z => z < tray);
    const ceiling = Math.min(tray - 1, Math.max(highestWindow, windowLayer, ...low, 0));
    writeMaxZ?.(ceiling, tray);
  }

  function place(app) {
    const element = app?.element;
    if (!element || element === root) return;
    // Native modal dialogs use the top layer, which already paints above the tray.
    if (element.matches?.(":modal")) { capMax(); return; }
    const tray = trayZ();
    const limit = tooltipLayer - 1;
    if (isTrayPopup(app, kinds)) {
      if (limit <= tray) return;
      let next = numeric(readZ(element));
      if (!(next > tray && next <= limit && next >= popupFront)) {
        next = Math.min(limit, Math.max(tray + 1, popupFront + 1));
      }
      popupFront = Math.max(popupFront, next);
      writeZ(app, next);
      capMax();
      return;
    }
    const current = numeric(readZ(element));
    if (current < tray) {
      highestWindow = Math.max(highestWindow, current);
      return;
    }
    const next = Math.min(tray - 1, Math.max(highestWindow, windowLayer) + 1);
    const assigned = next >= tray ? tray - 1 : next;
    writeZ(app, assigned);
    highestWindow = Math.max(highestWindow, assigned);
    capMax();
  }

  return {place};
}

function cssNumber(view, element, name, fallback) {
  const raw = view.getComputedStyle(element).getPropertyValue?.(name);
  const value = Number(String(raw ?? "").trim());
  return Number.isFinite(value) ? value : fallback;
}

function wrap(object, name, after) {
  const original = object?.[name];
  if (typeof original !== "function" || original[WRAPPED]) return;
  function stacked(...args) {
    const result = original.apply(this, args);
    after(this);
    return result;
  }
  stacked[WRAPPED] = true;
  object[name] = stacked;
}

function legacyDialog(foundry) {
  const dialog = foundry?.appv1?.api?.Dialog ?? globalThis.Dialog;
  if (typeof dialog !== "function" || dialog === foundry?.applications?.api?.DialogV2) return undefined;
  return dialog;
}

export function installTrayStack(root, env = globalThis) {
  const foundry = env.foundry;
  const ApplicationV2 = foundry?.applications?.api?.ApplicationV2;
  const doc = env.document;
  const view = doc?.defaultView ?? env;
  if (!root || !ApplicationV2?.prototype || typeof view?.getComputedStyle !== "function") return false;

  const readZ = element => numeric(view.getComputedStyle(element).zIndex);
  const writeZ = (app, z) => {
    app.element.style.zIndex = String(z);
    if (app.position && typeof app.position === "object") app.position.zIndex = z;
  };
  const holders = [ApplicationV2, env];
  const controller = createStackController({
    root,
    windowLayer: cssNumber(view, doc.documentElement, "--z-index-window", 100),
    tooltipLayer: cssNumber(view, doc.documentElement, "--z-index-tooltip", 9999),
    readZ,
    writeZ,
    readMaxZ: () => holders.map(holder => holder?._maxZ).filter(z => typeof z === "number"),
    writeMaxZ: (ceiling, tray) => {
      for (const holder of holders) {
        try {
          if (typeof holder?._maxZ !== "number" || holder._maxZ < tray) continue;
          holder._maxZ = ceiling;
        } catch { /* Foundry owns this counter. */ }
      }
    },
    kinds: {
      DialogV2: ApplicationV2 && foundry.applications.api.DialogV2,
      Dialog: legacyDialog(foundry),
      ChatPopout: foundry.applications?.sidebar?.apps?.ChatPopout,
      FilePicker: foundry.applications?.apps?.FilePicker
    }
  });
  let placing = false;
  const place = app => {
    if (placing) return;
    placing = true;
    try { controller.place(app); }
    finally { placing = false; }
  };
  wrap(ApplicationV2.prototype, "bringToFront", place);
  wrap(ApplicationV2.prototype, "setPosition", place);
  const ApplicationV1 = foundry.appv1?.api?.Application;
  if (ApplicationV1?.prototype && ApplicationV1 !== ApplicationV2) {
    wrap(ApplicationV1.prototype, "bringToTop", place);
    wrap(ApplicationV1.prototype, "setPosition", place);
  }
  const hooks = env.Hooks;
  if (hooks && typeof hooks.on === "function" && !hooked.has(hooks)) {
    hooked.add(hooks);
    hooks.on("renderApplicationV2", place);
    hooks.on("renderApplication", place);
  }
  for (const app of foundry.applications.instances?.values?.() ?? []) place(app);
  for (const app of Object.values(env.ui?.windows ?? {})) place(app);
  return true;
}
