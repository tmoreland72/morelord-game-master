// Short original Drakkenheim summaries. Shown only while a content module is active.
// Not book text, and not read from compendiums.

export const DRAKKENHEIM_CORE_MODULE_ID = "drakkenheim-core";
export const DRAKKENHEIM_MONSTERS_MODULE_ID = "drakkenheim-monsters";
export const DRAKKENHEIM_SCGD_MODULE_ID = "drakkenheim-scgd";
export const DRAKKENHEIM_MODULE_IDS = Object.freeze([
  DRAKKENHEIM_CORE_MODULE_ID,
  DRAKKENHEIM_MONSTERS_MODULE_ID,
  DRAKKENHEIM_SCGD_MODULE_ID
]);

const origin = "drakkenheim";

export const DRAKKENHEIM_CONDITIONS = Object.freeze([
  { id: "dk-dazed", label: "Dazed", origin, lines: [
    "Move or take an action, not both. No Bonus Action."
  ] },
  { id: "dk-weakened", label: "Weakened", origin, lines: [
    "Weapon and spell damage is halved."
  ] }
]);

export const DRAKKENHEIM_ITEMS = Object.freeze([
  { id: "dk-contamination", label: "Contamination", origin, parts: [
    { lines: ["Effects stack. A higher level keeps every lower effect."] },
    { table: {
      caption: "Levels",
      headers: ["Level", "Effect"],
      rows: [
        ["1", "No other symptom. Long rest while contaminated: 1 on 1d20 adds a level."],
        ["2", "Hit Points from Hit Dice are halved."],
        ["3", "A Long Rest restores no Hit Points."],
        ["4", "Weapon and spell damage is halved."],
        ["5", "Incapacitated."],
        ["6", "You become a monster the GM controls."]
      ]
    } }
  ] },
  { id: "dk-search", label: "Delerium Search", origin, parts: [
    { heading: "Outside the wall", lines: [
      "DC 15 Arcana, Investigation, or Survival.",
      "Success finds a deposit. Pieces are usually small."
    ] },
    { heading: "Inside the wall", lines: [
      "DC 20. Same skills.",
      "Success finds a deposit. Pieces are usually larger.",
      "The haze is thicker, so exposure is more dangerous."
    ] },
    { heading: "Failed checks", lines: [
      "Two or more failed checks draw a random encounter.",
      "The party can still find a deposit."
    ] }
  ] },
  { id: "dk-delerium", label: "Delerium", origin, parts: [
    { table: {
      caption: "Ascending value",
      headers: ["Size", "Value", "Weight"],
      rows: [
        ["Chip", "10 gp", "1/4 lb"],
        ["Fragment", "100 gp", "1/2 lb"],
        ["Shard", "500 gp", "1 lb"],
        ["Crystal", "1,000 gp", "2 lb"],
        ["Geode", "5,000 gp", "20+ lb"]
      ]
    } }
  ] }
]);

export function drakkenheimModuleIds(game = globalThis.game) {
  return DRAKKENHEIM_MODULE_IDS.filter(id => game?.modules?.get?.(id)?.active === true);
}

export function drakkenheimContentActive(game = globalThis.game) {
  return drakkenheimModuleIds(game).length > 0;
}

export function drakkenheimConditions(game = globalThis.game) {
  return drakkenheimContentActive(game) ? DRAKKENHEIM_CONDITIONS : [];
}

export function drakkenheimItems(game = globalThis.game) {
  return drakkenheimContentActive(game) ? DRAKKENHEIM_ITEMS : [];
}

export function drakkenheimStatus(game = globalThis.game) {
  return drakkenheimContentActive(game) ? "ready" : "off";
}

export function debugDrakkenheimCheat(game = globalThis.game) {
  const active = drakkenheimContentActive(game);
  const report = {
    modules: drakkenheimModuleIds(game),
    status: drakkenheimStatus(game),
    chips: active ? [...drakkenheimConditions(game), ...drakkenheimItems(game)].map(item => ({
      role: item.id,
      label: item.label
    })) : []
  };
  globalThis.console?.debug?.("morelord-game-master | Drakkenheim cheat", report);
  return report;
}
