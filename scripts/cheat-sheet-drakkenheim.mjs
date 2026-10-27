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

// Condition ids follow the pack chips (`condition-<slug>`), prefixed for this sheet.
// Standard rules conditions stay in the main Conditions section. Madness stays out.
export const DRAKKENHEIM_CONDITIONS = Object.freeze([
  { id: "dk-addled", label: "Addled", origin, lines: [
    "Intelligence, Wisdom, and Charisma rolls have Disadvantage."
  ] },
  { id: "dk-bewildered", label: "Bewildered", origin, lines: [
    "You can cast only cantrips, and only as an action."
  ] },
  { id: "dk-bleeding", label: "Bleeding", origin, parts: [
    { heading: "Ongoing", lines: ["At the end of each of your turns you lose Hit Points. The condition states how many."] },
    { heading: "Ending it", lines: [
      "Any healing stops the bleeding.",
      "A creature within 5 feet can also stop it with an action and a healer's kit. No check."
    ] }
  ] },
  { id: "dk-bloodied", label: "Bloodied", origin, lines: [
    "You are Bloodied while at half your Hit Points or fewer."
  ] },
  { id: "dk-burning", label: "Burning", origin, parts: [
    { heading: "Ongoing", lines: ["At the end of each of your turns you take damage. The condition states the type and the dice."] },
    { heading: "Ending it", lines: ["An action within 5 feet puts it out. So does being doused or submerged."] }
  ] },
  { id: "dk-clumsy", label: "Clumsy", origin, lines: [
    "Dexterity rolls have Disadvantage."
  ] },
  { id: "dk-dazed", label: "Dazed", origin, lines: [
    "Move or take an action, not both. No Bonus Action."
  ] },
  { id: "dk-defenseless", label: "Defenseless", origin, lines: [
    "Attack rolls against you have Advantage."
  ] },
  { id: "dk-distracted", label: "Distracted", origin, lines: [
    "You can't take reactions."
  ] },
  { id: "dk-enfeebled", label: "Enfeebled", origin, lines: [
    "Strength rolls have Disadvantage."
  ] },
  { id: "dk-entangled", label: "Entangled", origin, parts: [
    { heading: "While caught", lines: ["You can't move, and attack rolls against you have Advantage."] },
    { heading: "Getting free", lines: [
      "An action and a Strength (Athletics) or Dexterity (Acrobatics) check against the listed DC.",
      "10 Fire or Slashing damage also ends it."
    ] }
  ] },
  { id: "dk-frozen", label: "Frozen", origin, parts: [
    { heading: "While frozen", lines: [
      "You can't move, and attack rolls against you have Advantage.",
      "A hit with a bludgeoning weapon is a critical hit."
    ] },
    { heading: "Breaking out", lines: [
      "An action and a Strength (Athletics) check against the listed DC.",
      "20 Bludgeoning or Fire damage also ends it."
    ] }
  ] },
  { id: "dk-helpless", label: "Helpless", origin, lines: [
    "Any hit against you is a critical hit."
  ] },
  { id: "dk-immobilized", label: "Immobilized", origin, lines: [
    "Your Speed is 0 and can't increase.",
    "If you are flying, you fall."
  ] },
  { id: "dk-jinxed", label: "Jinxed", origin, lines: [
    "Subtract the listed die from each attack roll and saving throw."
  ] },
  { id: "dk-shocked", label: "Shocked", origin, lines: [
    "You are Dazed and Defenseless, and you drop what you are holding.",
    "Drawing, stowing, or picking something up takes an action."
  ] },
  { id: "dk-sickened", label: "Sickened", origin, lines: [
    "Constitution saving throws have Disadvantage."
  ] },
  { id: "dk-slowed", label: "Slowed", origin, lines: [
    "Your Speed is halved."
  ] },
  { id: "dk-staggered", label: "Staggered", origin, lines: [
    "You can make only one weapon attack on your turn."
  ] },
  { id: "dk-valor", label: "Valor", origin, lines: [
    "Add the listed die, usually 1d4, to attack rolls and saving throws."
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
