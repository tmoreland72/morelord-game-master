export const CHECK_TYPES = [
  {id: "skill", label: "Skill check"},
  {id: "ability", label: "Ability check"},
  {id: "save", label: "Saving throw"}
];

export const SPECIALTIES = [
  {id: "encounter", setting: "showEncounter", label: "Encounter Check"},
  {id: "search", setting: "showDeleriumSearch", label: "Delerium Search"},
  {id: "foraging", setting: "showForaging", label: "Foraging Check"},
  {id: "death", setting: "showDeathSave", label: "Death Save"},
  {id: "fate", setting: "showFate", label: "Roll of Fate"}
];

export function specialtyOrder(order = []) {
  const known = SPECIALTIES.map(specialty => specialty.id);
  const saved = [];
  for (const id of order ?? []) if (known.includes(id) && !saved.includes(id)) saved.push(id);
  return [...saved, ...known.filter(id => !saved.includes(id))];
}

export function moveSpecialty(order, id, before) {
  const current = specialtyOrder(order);
  if (!current.includes(id) || before === id) return current;
  const next = current.filter(item => item !== id);
  const index = next.indexOf(before);
  next.splice(index < 0 ? next.length : index, 0, id);
  return next;
}

export function visibleSpecialties(settings = {}, order = []) {
  return specialtyOrder(order).filter(id => settings[SPECIALTIES.find(specialty => specialty.id === id).setting] !== false);
}

// D&D 2024 / SRD 5.2. Optional scores such as Honor and Sanity, and any other
// configured skill, stay out of the request builder.
const SRD_SKILL_IDS = ["acr", "ani", "arc", "ath", "dec", "his", "ins", "itm", "inv", "med", "nat", "prc", "prf", "per", "rel", "slt", "ste", "sur"];
const SRD_ABILITY_IDS = ["str", "dex", "con", "int", "wis", "cha"];

export function checkChoices(type, {skills = {}, abilities = {}} = {}) {
  const source = type === "skill" ? skills : abilities;
  const ids = type === "skill" ? SRD_SKILL_IDS : SRD_ABILITY_IDS;
  return ids.filter(id => source?.[id]?.label).map(id => ({id, label: source[id].label}));
}

export function defaultCheckId(type, choices, current) {
  if (choices.some(choice => choice.id === current)) return current;
  const preferred = type === "skill" ? "prc" : "wis";
  return choices.find(choice => choice.id === preferred)?.id ?? choices[0]?.id ?? "";
}

export function resolveRollActors({scope, actorId, partyIds = [], selectedActorIds = []} = {}) {
  const party = [...new Set(partyIds)];
  if (scope === "tokens") {
    const selected = [...new Set(selectedActorIds)].filter(id => party.includes(id));
    if (!selected.length) throw new Error("Select at least one party character token.");
    return selected;
  }
  if (scope === "player") {
    if (!party.includes(actorId)) throw new Error("Choose a character from Player Settings.");
    return [actorId];
  }
  if (!party.length) throw new Error("Select participating characters on the Player Settings tab first.");
  return party;
}

export function buildCheckRequest({type, checkId, dc, blind, actorIds}) {
  const kind = type === "ability" || type === "save" ? type : "skill";
  const request = {kind, dc, blind: blind === true, actorIds};
  if (kind === "skill") request.skill = checkId;
  else request.ability = checkId;
  return request;
}
