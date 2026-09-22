export const TRIGGER_MACROS = {
  sorcerer:'WildMagicSurge01', volatile:'VolatileMagic001', sneak:'SneakAttack00001', item:'ItemUseTable0001',
  'lucky-find':'LuckyFinds000001', 'world-clock':'WorldClock000001'
};
export const triggerMacroUuid = kind => TRIGGER_MACROS[kind]
  ? `Compendium.morelord-game-master.macros.Macro.${TRIGGER_MACROS[kind]}` : null;
export const SURGE_TABLES = {
  sorcerer:'Compendium.morelord-game-master.roll-tables.RollTable.aDMFCKJcdKaJjTc6',
  volatile:'Compendium.morelord-game-master.roll-tables.RollTable.JtRByu566t45mzkG'
};
export function defaultTriggers() {
  const names = {sorcerer:'Wild Magic Surge',volatile:'Volatile Magic',sneak:'Sneak Attack',item:'Item Use — Roll Table','lucky-find':'Lucky Finds','world-clock':'World Clock'};
  return Object.keys(TRIGGER_MACROS).map(kind => ({
    id:kind==='sorcerer'?'wild-magic-surge':kind==='volatile'?'volatile-magic':kind==='sneak'?'sneak-attack':kind,
    kind,name:names[kind],enabled:false,macroUuid:triggerMacroUuid(kind),
    ...(SURGE_TABLES[kind]?{tableUuid:SURGE_TABLES[kind],tableName:kind==='volatile'?'Volatile Magic Table':'Wild Magic Surge'}:{}),
    ...(kind==='world-clock'?{gameMinutes:10,realMinutes:1}:{}),
    ...(kind==='item'?{actorName:'Configured character',itemName:'configured item or feature',tableName:'configured roll table'}:{})
  }));
}
export function migrateTriggerMacros(triggers, {includeDefaults = true} = {}) {
  const result = triggers.map(trigger => {
    const next = {...trigger, macroUuid:trigger.macroUuid || triggerMacroUuid(trigger.kind)};
    if (SURGE_TABLES[trigger.kind] && (!trigger.tableUuid || trigger.tableUuid === SURGE_TABLES[trigger.kind].replace('morelord-game-master.roll-tables','morelord-compendium.tables-1'))) {
      next.tableUuid = SURGE_TABLES[trigger.kind];
    }
    return next;
  });
  if (includeDefaults) for (const trigger of defaultTriggers()) {
    if (!result.some(existing => existing.kind === trigger.kind)) result.push(trigger);
  }
  return result;
}
