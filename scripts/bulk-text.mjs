import {escapeHTML as e} from './core.mjs';

// English fallback for tests and for a world whose language file has not loaded.
// Keep this map aligned with lang/en.json.
export const BULK_STRINGS = {
  'applying': 'Applying…',
  'error.gm': 'Only an eligible GM can apply this bulk action.',
  'error.gmOnly': 'Only GMs can apply bulk actions.',
  'error.noGm': 'An active GM is required.',
  'error.operation': 'Invalid bulk operation ID.',
  'error.started': 'This bulk action was already started. Review its chat card before trying again.',
  'error.cancelled': 'A character update was cancelled.',
  'error.party': 'Select party members on Player Settings first.',
  'error.character': 'Bulk actions require character actors.',
  'error.summary': 'The change was applied, but the chat summary could not be completed.',
  'error.failed': 'Review character sheets before trying again.',
  'coins.apply': 'Apply',
  'xp.title': 'XP',
  'xp.action': 'Action',
  'xp.split': 'Split amount amongst party members',
  'xp.each': 'Give amount to each party member',
  'xp.set': 'Set all party XP to this amount',
  'xp.amount': 'Amount',
  'xp.remainder': 'Split divides the XP equally. Any remainder goes to one random party member, the same way leftover copper is assigned for coins. Give amount to each party member adds the full amount to everyone. Set all party XP to this amount replaces each member\'s experience with the entered amount.',
  'xp.apply': 'Apply',
  'xp.increase': 'Increase XP',
  'xp.decrease': 'Decrease XP',
  'xp.card': 'Party XP: {action}',
  'xp.added': 'Added: {amount} XP',
  'xp.setTo': 'Set to: {amount} XP',
  'xp.invalid': 'Enter a whole number of XP.',
  'xp.required': 'Enter a positive whole number of XP.',
  'xp.tooLarge': 'The XP total is too large.',
  'xp.updated': 'Party XP updated. See the chat card.',
  'xp.skipped': 'Skipped {count} whose experience did not change.',
  'xp.none': 'No one\'s experience needed changing.',
  'xp.invalidAction': 'Choose a valid XP operation.',
  'inspiration.title': 'Inspiration',
  'inspiration.action': 'Action',
  'inspiration.grant': 'Grant Heroic Inspiration',
  'inspiration.clear': 'Clear Heroic Inspiration',
  'inspiration.apply': 'Apply',
  'inspiration.cardGrant': 'Party Inspiration: Granted',
  'inspiration.cardClear': 'Party Inspiration: Cleared',
  'inspiration.granted': 'Granted',
  'inspiration.cleared': 'Cleared',
  'inspiration.updated': 'Party inspiration updated. See the chat card.',
  'inspiration.skippedGrant': 'Skipped {count} who already had inspiration.',
  'inspiration.skippedClear': 'Skipped {count} who did not have inspiration.',
  'inspiration.noneGrant': 'Everyone in the party already has inspiration.',
  'inspiration.noneClear': 'No one in the party has inspiration.',
  'inspiration.invalid': 'Choose whether to grant or clear inspiration.',
  'tokens.title': 'Prototype Token Sync',
  'tokens.hint': "Copies each party character's token on the active GM's current scene onto that character's prototype token. A selected token is used when several are placed.",
  'tokens.help': 'Copied token settings',
  'tokens.copied': 'Copied: {fields}.',
  'tokens.field.name': 'name',
  'tokens.field.displayName': 'name display',
  'tokens.field.actorLink': 'actor link',
  'tokens.field.texture': 'image and scale',
  'tokens.field.width': 'width',
  'tokens.field.height': 'height',
  'tokens.field.depth': 'depth',
  'tokens.field.disposition': 'disposition',
  'tokens.field.displayBars': 'resource bar display',
  'tokens.field.bar1': 'primary resource bar',
  'tokens.field.bar2': 'secondary resource bar',
  'tokens.field.sight': 'vision',
  'tokens.field.detectionModes': 'detection modes',
  'tokens.field.light': 'light',
  'tokens.field.lockRotation': 'lock rotation',
  'tokens.field.rotation': 'rotation',
  'tokens.field.alpha': 'opacity',
  'tokens.field.ring': 'dynamic ring',
  'tokens.field.occludable': 'occlusion',
  'tokens.sync': 'Apply',
  'tokens.card': 'Prototype Token Sync',
  'tokens.updated': 'Prototype token updated.',
  'tokens.skipped': 'No token on the current scene.',
  'tokens.scene': 'The current scene is not available.',
  'tokens.invalid': 'The placed token has no settings to copy.',
  'tokens.updatedNotice': 'Prototype tokens updated. See the chat card.',
  'tokens.already': 'Skipped {count} whose prototype already matched.',
  'tokens.none': 'No prototype tokens needed updating.',
  'undo.title': 'Undo Last Action',
  'undo.button': 'Undo Last Action',
  'undo.none': 'Nothing to undo',
  'undo.last': 'Last action: {label}',
  'undo.card': 'Undid {label}',
  'undo.restored': 'Restored',
  'undo.purse': 'Shared purse restored.',
  'undo.done': 'Last bulk action undone.',
  'undo.unknown': 'The saved bulk action cannot be undone.',
  'undo.missing': 'There is no bulk action to undo.',
  'undo.unsaved': 'The change was applied, but it could not be saved for undo.'
};

export function bulkText(key, data) {
  const full = `morelord-game-master.${key}`;
  let text;
  try {
    if (data && typeof game.i18n?.format === 'function') text = game.i18n.format(full, data);
    else if (typeof game.i18n?.localize === 'function') text = game.i18n.localize(full);
  } catch { text = undefined; }
  if (!text || text === full) {
    text = BULK_STRINGS[key] ?? key;
    if (data) for (const [name, value] of Object.entries(data)) text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

export const bulkHTML = (key, data) => e(bulkText(key, data));
