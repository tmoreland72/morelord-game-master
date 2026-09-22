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
export function migrateTriggerMacros(triggers, {includeVolatile = true} = {}) {
  const result = triggers.map(trigger => {
    const next = {...trigger, macroUuid:trigger.macroUuid || triggerMacroUuid(trigger.kind)};
    if (SURGE_TABLES[trigger.kind] && (!trigger.tableUuid || trigger.tableUuid === SURGE_TABLES[trigger.kind].replace('morelord-game-master.roll-tables','morelord-compendium.tables-1'))) {
      next.tableUuid = SURGE_TABLES[trigger.kind];
    }
    return next;
  });
  if (includeVolatile && !result.some(trigger => trigger.kind === 'volatile')) result.push({
    id:'volatile-magic', kind:'volatile', name:'Volatile Magic', enabled:false,
    macroUuid:triggerMacroUuid('volatile'), tableUuid:SURGE_TABLES.volatile, tableName:'Volatile Magic Table'
  });
  return result;
}
