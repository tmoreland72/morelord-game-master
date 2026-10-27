import { escapeHTML } from "./core.mjs";

export const RUN_ON_LOAD_FOR_ME = "runOnLoadForMe";
export const RUN_ON_LOAD_FOR_EVERYONE = "runOnLoadForEveryone";

export const RUN_ON_LOAD_COPY = {
  runForMe: "Run on load for me",
  runningForMe: "Running on load for me",
  runForEveryone: "Run on load for everyone",
  runningForEveryone: "Running on load for everyone",
  indicatorForMe: "Runs on load for you",
  indicatorForEveryone: "Runs on load for everyone"
};

const LOG = "Morelord Game Master";

export function registerRunOnLoadSettings(settings, moduleId) {
  settings.register(moduleId, RUN_ON_LOAD_FOR_ME, {
    name: "Run macros on load for me",
    hint: "Pinned Game Master macros this user runs when the world loads.",
    scope: "client",
    config: false,
    restricted: true,
    type: Array,
    default: []
  });
  settings.register(moduleId, RUN_ON_LOAD_FOR_EVERYONE, {
    name: "Run macros on load for everyone",
    hint: "Pinned Game Master macros every user runs when the world loads.",
    scope: "world",
    config: false,
    restricted: true,
    type: Array,
    default: []
  });
}

export function uuidList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(entry => typeof entry === "string" && entry))];
}

export function toggledUuidList(list, uuid) {
  const current = uuidList(list);
  if (!uuid) return current;
  if (current.includes(uuid)) return current.filter(entry => entry !== uuid);
  return [...current, uuid];
}

export function userCanRunMacro(macro, user) {
  if (!macro || !user) return false;
  const sees = macro.visible === true || (
    macro.visible == null
    && typeof macro.testUserPermission === "function"
    && macro.testUserPermission(user, "LIMITED") === true
  );
  if (!sees) return false;
  if (typeof macro.canUserExecute === "function" && macro.canUserExecute(user) !== true) return false;
  if (macro.canExecute === false) return false;
  if (macro.canExecute === true) return true;
  return typeof macro.canUserExecute === "function";
}

export async function runMacrosOnLoad({ forMe = [], forEveryone = [], user, resolve, logger = console } = {}) {
  const chosen = [];
  const seen = new Set();
  for (const uuid of [...uuidList(forMe), ...uuidList(forEveryone)]) {
    if (seen.has(uuid)) continue;
    seen.add(uuid);
    chosen.push(uuid);
  }
  const ran = [];
  for (const uuid of chosen) {
    let macro;
    try {
      macro = await resolve?.(uuid);
    } catch (error) {
      logger.error?.(`${LOG} could not resolve "${uuid}" on load.`, error);
      continue;
    }
    if (!userCanRunMacro(macro, user)) continue;
    try {
      await macro.execute?.();
      ran.push(macro.uuid ?? uuid);
    } catch (error) {
      logger.error?.(`${LOG} could not run "${macro.name ?? uuid}" on load.`, error);
    }
  }
  return ran;
}

export function macroContextEntries({
  remove,
  toggleMe,
  toggleEveryone,
  isGM = () => false,
  runsForMe = () => false,
  runsForEveryone = () => false,
  text = key => RUN_ON_LOAD_COPY[key]
} = {}) {
  const uuidOf = element => element?.dataset?.macroUuid || "";
  return [
    { name: "Remove", icon: '<i class="fa-solid fa-trash"></i>', callback: element => remove?.(element) },
    {
      name: text("runForMe"),
      icon: '<i class="fa-solid fa-user"></i>',
      condition: element => Boolean(uuidOf(element)) && !runsForMe(uuidOf(element)),
      callback: element => toggleMe?.(element)
    },
    {
      name: text("runningForMe"),
      icon: '<i class="fa-solid fa-user-check"></i>',
      condition: element => Boolean(uuidOf(element)) && runsForMe(uuidOf(element)),
      callback: element => toggleMe?.(element)
    },
    {
      name: text("runForEveryone"),
      icon: '<i class="fa-solid fa-users"></i>',
      condition: element => isGM() === true && Boolean(uuidOf(element)) && !runsForEveryone(uuidOf(element)),
      callback: element => toggleEveryone?.(element)
    },
    {
      name: text("runningForEveryone"),
      icon: '<i class="fa-solid fa-globe"></i>',
      condition: element => isGM() === true && Boolean(uuidOf(element)) && runsForEveryone(uuidOf(element)),
      callback: element => toggleEveryone?.(element)
    }
  ];
}

function mark(scope, classes, label) {
  return `<i class="gm-macro-run ${classes}" data-scope="${scope}" data-tooltip="${escapeHTML(label)}" data-tooltip-direction="UP" role="img" aria-label="${escapeHTML(label)}"></i>`;
}

export function macroRunMarks({ forMe = false, forEveryone = false, text = key => RUN_ON_LOAD_COPY[key] } = {}) {
  if (!forMe && !forEveryone) return "";
  const icons = [
    forMe && !forEveryone ? mark("user", "fa-solid fa-user", text("indicatorForMe")) : "",
    forEveryone ? mark("world", "fa-solid fa-users", text("indicatorForEveryone")) : ""
  ].join("");
  return `<span class="gm-macro-runs">${icons}</span>`;
}
