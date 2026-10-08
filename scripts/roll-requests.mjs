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

export function visibleSpecialties(settings = {}) {
  return SPECIALTIES.filter(specialty => settings[specialty.setting] !== false).map(specialty => specialty.id);
}

export function checkChoices(type, {skills = {}, abilities = {}} = {}) {
  const source = type === "skill" ? skills : abilities;
  return Object.entries(source ?? {}).filter(([, entry]) => entry?.label).map(([id, entry]) => ({id, label: entry.label}));
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
