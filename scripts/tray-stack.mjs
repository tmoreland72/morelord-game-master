// The tray sits above Foundry's window layer and below tooltips.
// ApplicationV2.bringToFront raises a window by incrementing the shared _maxZ
// counter from that window layer. Dialogs use the same counter, so a tray at
// the tooltip layer covers them.
//
// dnd5e 6.0.6 has no BasicRollConfigurationDialog class. The dialog is
// RollConfigurationDialog (hook renderRollConfigurationDialog), extending
// Dialog5e. Its element is a non-modal <dialog class="application roll-configuration">
// shown with show(), not showModal(), so it is not in the browser top layer and
// z-index does apply. BasicRoll.buildConfigure sets dialog.sheet from the
// .application under the click, and RollConfigurationDialog.configure then calls
// sheet._renderChild. Foundry renders that child inside the sheet or sidebar.
// A z-index written on the dialog cannot escape that window, which itself sits
// under the tray. renderApplicationV2 runs before renderChild finishes moving
// the element, and Foundry then assigns element.style.zIndex from the window
// band. That assignment clears an !important inline value. The dialog is lifted
// to document.body after render and renderChild settle, and again on the next
// frame, and a stylesheet rule keeps a body-level roll dialog above the tray
// when that later assignment wins.

const WRAPPED = Symbol("mlgmTrayStack");
const hooked = new WeakSet();
const POPUP_CLASS_NAMES = new Set([
  "Dialog5e",
  "RollConfigurationDialog",
  "D20RollConfigurationDialog",
  "AttackRollConfigurationDialog",
  "DamageRollConfigurationDialog",
  "SkillToolRollConfigurationDialog",
  "RollResolver"
]);
const RENDER_HOOKS = [
  "renderApplicationV2",
  "renderApplication",
  "renderDialogV2",
  "renderDialog5e",
  "renderRollConfigurationDialog",
  "renderD20RollConfigurationDialog",
  "renderAttackRollConfigurationDialog",
  "renderDamageRollConfigurationDialog",
  "renderSkillToolRollConfigurationDialog",
  "renderRollResolver"
];
export const TRAY_Z_OFFSET = 1000;

function named(app, name) {
  let ctor = app?.constructor;
  while (ctor) {
    if (ctor.name === name) return true;
    ctor = Object.getPrototypeOf(ctor);
  }
  return false;
}

function classNames(element) {
  if (!element) return [];
  if (element.classList && typeof element.classList[Symbol.iterator] === "function") return [...element.classList];
  if (typeof element.className === "string") return element.className.split(/\s+/).filter(Boolean);
  return [];
}

export function isPopupElement(element) {
  if (!element || element.nodeType === 3) return false;
  if (element.matches?.(":modal")) return false;
  if (typeof HTMLDialogElement === "function" && element instanceof HTMLDialogElement) return true;
  if (element.tagName === "DIALOG") return true;
  return classNames(element).includes("roll-configuration");
}

export function isTrayPopup(app, {DialogV2, Dialog, ChatPopout, FilePicker} = {}) {
  if (!app) return false;
  if (DialogV2 && app instanceof DialogV2) return true;
  if (Dialog && app instanceof Dialog) return true;
  if (ChatPopout && app instanceof ChatPopout) return true;
  if (FilePicker && (app instanceof FilePicker || (FilePicker.implementation && app instanceof FilePicker.implementation))) return true;
  if (named(app, "ChatPopout") || named(app, "FilePicker")) return true;
  if ([...POPUP_CLASS_NAMES].some(name => named(app, name))) return true;
  const classes = app.options?.classes;
  if (Array.isArray(classes) && classes.includes("roll-configuration")) return true;
  if (app.options?.tag === "dialog") return true;
  return isPopupElement(app.element);
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
    after(this, args, result);
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

function hookTarget(app, html) {
  if (app?.element) return app;
  const element = html?.nodeType ? html : app?.nodeType ? app : null;
  if (!element) return app;
  return {element, options: {tag: element.tagName === "DIALOG" ? "dialog" : undefined, classes: classNames(element)}, position: {}};
}

export function installTrayStack(root, env = globalThis) {
  const foundry = env.foundry;
  const ApplicationV2 = foundry?.applications?.api?.ApplicationV2;
  const doc = env.document;
  const view = doc?.defaultView ?? env;
  if (!root || !ApplicationV2?.prototype || typeof view?.getComputedStyle !== "function") return false;

  const readZ = element => numeric(view.getComputedStyle(element).zIndex);
  const writeZ = (app, z) => {
    const element = app.element;
    if (typeof element?.style?.setProperty === "function") element.style.setProperty("z-index", String(z), "important");
    else if (element?.style) element.style.zIndex = String(z);
    if (app.position && typeof app.position === "object") app.position.zIndex = z;
  };
  const holders = [ApplicationV2, env];
  const kinds = {
    DialogV2: ApplicationV2 && foundry.applications.api.DialogV2,
    Dialog: legacyDialog(foundry),
    ChatPopout: foundry.applications?.sidebar?.apps?.ChatPopout,
    FilePicker: foundry.applications?.apps?.FilePicker
  };
  const liftPopup = app => {
    if (!isTrayPopup(app, kinds)) return;
    const element = app.element;
    const body = element?.ownerDocument?.body;
    if (!element || !body || element === root || element.matches?.(":modal")) return;
    const position = element.ownerDocument.defaultView?.getComputedStyle(element)?.position;
    if (!element.parentElement || element.parentElement === body) {
      if (position && position !== "fixed" && element.style) element.style.position = "fixed";
      return;
    }
    const rect = typeof element.getBoundingClientRect === "function" ? element.getBoundingClientRect() : null;
    body.append(element);
    if (!element.style) return;
    element.style.position = "fixed";
    if (rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && (rect.width || rect.height)) {
      element.style.left = `${rect.left}px`;
      element.style.top = `${rect.top}px`;
    }
  };
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
    kinds
  });
  let placing = false;
  const place = app => {
    if (placing || !app) return;
    placing = true;
    try { liftPopup(app); controller.place(app); }
    finally { placing = false; }
  };
  const settle = app => {
    place(app);
    Promise.resolve().then(() => place(app));
    const ownerView = app?.element?.ownerDocument?.defaultView;
    if (typeof ownerView?.requestAnimationFrame === "function") ownerView.requestAnimationFrame(() => place(app));
    if (typeof ownerView?.setTimeout === "function") ownerView.setTimeout(() => place(app), 0);
  };
  const afterStack = (app, args, result) => {
    const target = args.length && args[0]?.element ? args[0] : app;
    settle(target?.element ? target : app);
    Promise.resolve(result).then(() => settle(target?.element ? target : app), () => {});
  };
  wrap(ApplicationV2.prototype, "bringToFront", app => settle(app));
  wrap(ApplicationV2.prototype, "setPosition", app => settle(app));
  wrap(ApplicationV2.prototype, "render", afterStack);
  wrap(ApplicationV2.prototype, "renderChild", (_parent, args, result) => {
    const child = args?.[0];
    settle(child);
    Promise.resolve(result).then(() => settle(child), () => {});
  });
  const ApplicationV1 = foundry.appv1?.api?.Application;
  if (ApplicationV1?.prototype && ApplicationV1 !== ApplicationV2) {
    wrap(ApplicationV1.prototype, "bringToTop", app => settle(app));
    wrap(ApplicationV1.prototype, "setPosition", app => settle(app));
  }
  const hooks = env.Hooks;
  if (hooks && typeof hooks.on === "function" && !hooked.has(hooks)) {
    hooked.add(hooks);
    const onRender = (app, html) => settle(hookTarget(app, html));
    for (const name of RENDER_HOOKS) hooks.on(name, onRender);
  }
  const appFor = element => {
    for (const app of foundry.applications.instances?.values?.() ?? []) if (app?.element === element) return app;
    return hookTarget(element);
  };
  if (typeof doc.body?.querySelectorAll === "function") {
    for (const element of doc.body.querySelectorAll("dialog.roll-configuration")) settle(appFor(element));
  }
  if (typeof view.MutationObserver === "function" && doc.body) {
    const observer = new view.MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes ?? []) {
          if (!node || node.nodeType !== 1) continue;
          const found = [];
          if (node.matches?.("dialog.roll-configuration")) found.push(node);
          if (typeof node.querySelectorAll === "function") found.push(...node.querySelectorAll("dialog.roll-configuration"));
          for (const element of found) settle(appFor(element));
        }
      }
    });
    observer.observe(doc.body, {childList: true, subtree: true});
  }
  for (const app of foundry.applications.instances?.values?.() ?? []) settle(app);
  for (const app of Object.values(env.ui?.windows ?? {})) settle(app);
  return true;
}
