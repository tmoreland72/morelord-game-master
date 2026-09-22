import {ID} from './core.mjs';
import {core,activeGM} from './requests.mjs';
import {migrateTriggerMacros} from './trigger-catalog.mjs';

const directory = 'morelord-game-master';
const path = `${directory}/triggers.json`;
let channel, queue = Promise.resolve();

async function write(triggers) {
  const picker = foundry.applications.apps.FilePicker;
  const file = new File([JSON.stringify({version:1,macroMigration:2,triggers}, null, 2)], 'triggers.json', {type:'application/json'});
  const result = await picker.upload('data', directory, file, {}, {notify:false});
  if (!result?.path) throw new Error('Could not save global triggers. Check Foundry file-upload permissions.');
}

export function saveGlobalTriggers(triggers) {
  return channel.executeAsUser('saveGlobalTriggers', {triggers}, activeGM()?.id);
}

export async function initializeGlobalTriggers() {
  channel = core().socket.createChannel(`${ID}-global-triggers`);
  channel.on('saveGlobalTriggers', ({triggers}, execution) => {
    if (!game.user.isGM || !game.users.get(execution.senderUserId)?.isGM) throw new Error('Only GMs can save global triggers.');
    if (!Array.isArray(triggers)) throw new Error('Invalid trigger configuration.');
    queue = queue.catch(()=>{}).then(async () => {
      await write(triggers);
      // The world setting is a runtime mirror for all connected clients.
      const board = foundry.utils.deepClone(game.settings.get(ID, 'board'));
      board.triggers = triggers;
      await game.settings.set(ID, 'board', board);
      return triggers;
    });
    return queue;
  });
  if (!game.user.isGM || activeGM()?.id !== game.user.id) return;
  const response = await fetch(foundry.utils.getRoute(path), {cache:'no-store'});
  const board = foundry.utils.deepClone(game.settings.get(ID, 'board'));
  let triggers;
  let includeDefaults = true;
  if (response.status === 404) {
    const picker = foundry.applications.apps.FilePicker;
    const root = await picker.browse('data', '');
    if (!root.dirs.includes(directory)) await picker.createDirectory('data', directory);
    triggers = (board.triggers ?? []).map(t=>({...t,sourceWorld:game.world.id}));
  } else {
    if (!response.ok) throw new Error(`Could not load global triggers (${response.status}).`);
    const data = await response.json();
    if (data.version !== 1 || !Array.isArray(data.triggers)) throw new Error('Invalid global trigger file; existing configuration was retained.');
    triggers = data.triggers;
    includeDefaults = (data.macroMigration ?? 0) < 2;
  }
  // Upgrade in place; actor counters and existing rule IDs remain unchanged.
  const upgraded = migrateTriggerMacros(triggers, {includeDefaults});
  if (includeDefaults || JSON.stringify(upgraded) !== JSON.stringify(triggers)) await write(upgraded);
  triggers = upgraded;
  // Preserve former world-specific bindings without reviving globally deleted rules.
  board.legacyWorldTriggers ??= board.triggers ?? [];
  board.triggers = triggers;
  await game.settings.set(ID, 'board', board);
}
