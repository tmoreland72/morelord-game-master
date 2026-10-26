import {ID, escapeHTML as e} from './core.mjs';
import {core, activeGM} from './requests.mjs';
import {BULK_QUEUE, writeBulkUndo} from './bulk-undo.mjs';

export const COINS = ['pp', 'gp', 'ep', 'sp', 'cp'];
export const COIN_ACTIONS = {
  'split-add': 'Split amount amongst party members',
  'each-add': 'Give amount to all party members',
  'split-remove': 'Split removal amongst party members',
  'each-remove': 'Take amount from all party members'
};
let channel;

export function readCoins(values = {}) {
  if (Object.keys(values).some(key => !COINS.includes(key))) throw Error('Unknown coin denomination.');
  return Object.fromEntries(COINS.map(key => {
    const value = values[key] == null || values[key] === '' ? 0 : Number(values[key]);
    if (!['number', 'string', 'undefined'].includes(typeof values[key]) || !Number.isSafeInteger(value) || value < 0) throw Error('Enter a non-negative whole number for each coin.');
    return [key, value];
  }));
}

export function coinShares(coins, count, split) {
  if (!Number.isInteger(count) || count < 1) throw Error('Select party members on Player Settings first.');
  coins = readCoins(coins);
  if (!split) return Array.from({length:count}, () => ({...coins}));
  const values = Object.fromEntries(COINS.map(key => [key, BigInt(Math.round(CONFIG.DND5E.currencies.cp.conversion / CONFIG.DND5E.currencies[key].conversion))]));
  const total = COINS.reduce((sum, key) => sum + BigInt(coins[key]) * values[key], 0n);
  const divisor = BigInt(count), remainder = total % divisor;
  const recipient = remainder ? Math.floor(Math.random() * count) : -1;
  return Array.from({length:count}, (_, index) => {
    let copper = total / divisor + (index === recipient ? remainder : 0n);
    const share = readCoins();
    for (const key of COINS.filter(key => key !== 'ep')) {
      const amount = copper / values[key];
      if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('The split coin share is too large.');
      share[key] = Number(amount); copper %= values[key];
    }
    return share;
  });
}

export function bulkCoinsContent(actorIds, coins = {}, busy = false, selected = 'split-add') {
  const disabled = busy || !actorIds.length ? 'disabled' : '';
  return `<section class="ml-card ml-stack" data-gap="4" data-mlgm-bulk="coins"><strong class="gm-specialty-title">Coins</strong><label class="gm-bulk-coin-action"><span>Action</span><select name="bulkCoinAction" ${busy ? 'disabled' : ''}>${Object.entries(COIN_ACTIONS).map(([operation, name]) => `<option value="${operation}" ${operation === selected ? 'selected' : ''}>${name}</option>`).join('')}</select></label><form data-mlgm-bulk-coins><div class="ml-horizontal-scroll"><div class="gm-bulk-coin-fields">${COINS.map(key => `<label><span>${e(game.i18n.localize(CONFIG.DND5E.currencies[key].label))} (${key})</span><div class="ml-stepper" data-layout="stacked"><input type="number" name="${key}" min="0" step="1" max="${Number.MAX_SAFE_INTEGER}" value="${e(coins[key] ?? 0)}" required><button type="button" data-step="up" data-action="bulk-coin-step" data-id="${key}:1" title="Increase ${key}" aria-label="Increase ${key}"><i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button><button type="button" data-step="down" data-action="bulk-coin-step" data-id="${key}:-1" title="Decrease ${key}" aria-label="Decrease ${key}"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button></div></label>`).join('')}<button type="button" data-action="bulk-coins-clear" ${busy ? 'disabled' : ''}>Clear</button><button type="button" data-action="bulk-coins" ${disabled}>${selected.endsWith('-remove') ? 'Take' : 'Send'}</button></div></div></form></section>`;
}

export function initializeBulkCoins(getActorIds) {
  channel = core().socket.createChannel(`${ID}-bulk-coins`);
  channel.on('apply', async ({operation, coins, operationId}, execution) => {
    const sender = core().users.list().find(user => user.id === execution.senderUserId && user.active && user.isGM);
    if (!sender || !game.user.isGM || activeGM()?.id !== game.user.id) throw Error('Only an eligible GM can change party coins.');
    if (typeof operationId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(operationId)) throw Error('Invalid coin operation ID.');
    const previous = game.messages.find(message => message.author?.isGM && message.getFlag(ID, 'bulkCoins')?.operationId === operationId);
    if (previous) {
      if (previous.getFlag(ID, 'bulkCoins').stage !== 'complete') throw Error('This coin operation was already started. Review its chat card before trying again.');
      return {messageId:previous.id, alreadyApplied:true};
    }
    coins = readCoins(coins);
    const actors = [...new Set(getActorIds())].map(id => game.actors.get(id));
    const rows = planCoins(actors, operation, coins, game.dnd5e.applications.CurrencyManager, operation.endsWith('-remove') ? partyPurse() : null);
    const receipt = {operationId, operation, actorIds:rows.map(row => row.actorId), senderId:sender.id, stage:'applying'};
    const message = await ChatMessage.create({content:`<section class="ml-chat-card"><h3>Party Coins · ${e(COIN_ACTIONS[operation])}</h3><p>Applying coins…</p></section>`, blind:false, whisper:[], flags:{[ID]:{bulkCoins:receipt}}}, {messageMode:'public'});
    const actorChanges = rows.filter(row => !row.purse && coinChanged(row));
    const purseRow = rows.find(row => row.purse);
    const purseChanged = Boolean(purseRow && coinChanged(purseRow));
    const updates = actorChanges.map(row => ({_id: row.actorId, 'system.currency': row.after}));
    if (purseChanged) updates.push({_id: purseRow.actorId, 'system.currency': purseRow.after});
    try {
      if (updates.length) {
        const updated = await Actor.updateDocuments(updates);
        if (updated.length !== updates.length) throw Error('A character update was cancelled.');
        try {
          const snapshot = {kind: 'coins', operation, actors: actorChanges.map(row => ({id: row.actorId, currency: cloneCoins(row.before)}))};
          if (purseChanged) snapshot.purse = {id: purseRow.actorId, currency: cloneCoins(purseRow.before)};
          await writeBulkUndo(snapshot);
        } catch (error) {
          console.error(`${ID} | Coins changed but the undo snapshot failed`, error);
          ui.notifications.warn('Coins were changed, but the last action could not be saved for undo.');
        }
      }
    } catch (error) {
      await message.update({content:`<section class="ml-chat-card"><h3>Party Coins · Failed</h3><p>${e(error.message)} Review character sheets before trying again.</p></section>`, [`flags.${ID}.bulkCoins`]:{...receipt, stage:'failed'}});
      throw error;
    }
    try {
      await message.update({content:coinCard(operation, coins, rows), [`flags.${ID}.bulkCoins`]:{...receipt, stage:'complete'}});
    } catch (error) {
      console.error(`${ID} | Coins changed but the chat summary failed`, error);
      ui.notifications.warn('Coins were changed, but the chat summary could not be completed. Check character sheets before repeating the action.');
    }
    return updates.length ? {messageId: message.id} : {messageId: message.id, unchanged: true, notice: 'No coin balances changed.'};
  }, {serialize:BULK_QUEUE});
}
function coinChanged(row) {
  return COINS.some(key => (row.before?.[key] ?? 0) !== (row.after?.[key] ?? 0));
}
function cloneCoins(value) {
  return foundry.utils?.deepClone ? foundry.utils.deepClone(value) : structuredClone(value);
}

export async function applyBulkCoins(operation, coins, operationId = foundry.utils.randomID(24)) {
  if (!game.user.isGM) throw Error('Only GMs can change party coins.');
  const gm = activeGM();
  if (!gm) throw Error('An active GM is required.');
  return channel.executeAsUser('apply', {operation, coins:readCoins(coins), operationId}, gm.id);
}export function formatCoins(coins) {
  const whole = Object.fromEntries(COINS.map(key => [key, Math.floor(coins[key] ?? 0)]));
  for (let index = 0; index < COINS.length - 1; index++) {
    const key = COINS[index];
    let copper = Math.round(((coins[key] ?? 0) - Math.floor(coins[key] ?? 0)) * CONFIG.DND5E.currencies.cp.conversion / CONFIG.DND5E.currencies[key].conversion);
    // Preserve whole entered denominations; express only their partial coins as change.
    for (const smaller of COINS.slice(index + 1).filter(key => key !== 'ep')) {
      const ratio = CONFIG.DND5E.currencies.cp.conversion / CONFIG.DND5E.currencies[smaller].conversion;
      const amount = Math.floor(copper / ratio);
      whole[smaller] += amount; copper -= amount * ratio;
    }
  }
  return COINS.filter(key => whole[key] > 0).map(key => `${whole[key].toLocaleString()} ${key}`).join(', ') || '0 cp';
}

export function planCoins(actors, operation, coins, currencyManager = game.dnd5e.applications.CurrencyManager, party = null) {
  if (!Object.hasOwn(COIN_ACTIONS, operation)) throw Error('Choose a valid coin operation.');
  coins = readCoins(coins);
  if (!COINS.some(key => coins[key] > 0)) throw Error('Enter at least one coin.');
  const shares = coinShares(coins, actors.length, operation.startsWith('split-'));
  const rows = actors.map((actor, index) => {
    if (actor?.type !== 'character' || !actor.system.currency) throw Error('Party coins require character actors with currency.');
    const before = {...actor.system.currency}, requested = shares[index], applied = {}, deficit = {};
    let after = {...before};
    for (const key of COINS) {
      if (!Number.isSafeInteger(before[key] ?? 0) || (before[key] ?? 0) < 0) throw Error(`Check ${actor.name}'s ${key} balance before continuing.`);
      if (operation.endsWith('-add')) {
        after[key] = (after[key] ?? 0) + requested[key];
        if (!Number.isSafeInteger(after[key])) throw Error(`${actor.name}'s ${key} balance is too large.`);
        applied[key] = requested[key]; deficit[key] = 0;
      } else {
        const ratio = CONFIG.DND5E.currencies.cp.conversion / CONFIG.DND5E.currencies[key].conversion;
        const amount = Math.round(requested[key] * ratio);
        if (!Number.isSafeInteger(amount)) throw Error('The coin removal is too large.');
        const result = currencyManager.getActorCurrencyUpdates({system:{currency:after}}, amount, 'cp', {recursive:false});
        after = result.system.currency;
        deficit[key] = Math.max(0, result.remainder) / ratio;
        applied[key] = requested[key] - deficit[key];
      }
    }
    return {actorId:actor.id, before, after, requested, applied, deficit, partyPaid:readCoins()};
  });
  if (operation.endsWith('-remove') && party) {
    if (party.type !== 'group' || !party.system.currency) throw Error('The shared party purse is unavailable.');
    const before = {...party.system.currency};
    for (const key of COINS) if (!Number.isSafeInteger(before[key] ?? 0) || (before[key] ?? 0) < 0) throw Error(`Check the party's ${key} balance before continuing.`);
    const purse = {actorId:party.id, purse:true, before, after:{...before}, requested:readCoins(), applied:readCoins(), deficit:readCoins()};
    for (const row of rows) for (const key of COINS) {
      const shortfall = row.deficit[key];
      if (!shortfall) continue;
      const ratio = CONFIG.DND5E.currencies.cp.conversion / CONFIG.DND5E.currencies[key].conversion;
      const copper = Math.round(shortfall * ratio);
      if (!Number.isSafeInteger(copper)) throw Error('The party coin deficit is too large.');
      const result = currencyManager.getActorCurrencyUpdates({system:{currency:purse.after}}, copper, 'cp', {recursive:false});
      purse.after = result.system.currency;
      row.deficit[key] = result.remainder / ratio;
      row.partyPaid[key] = shortfall - row.deficit[key];
      purse.requested[key] += shortfall; purse.applied[key] += row.partyPaid[key]; purse.deficit[key] += row.deficit[key];
    }
    rows.push(purse);
  }
  return rows;
}

function partyPurse() {
  const party = core().ui.participation.primaryPartyGroup();
  return party?.system.currency ? party : null;
}

export function coinCard(operation, coins, rows) {
  const remove = operation.endsWith('-remove');
  const skipped = rows.filter(row => !row.purse && !coinChanged(row)).length;
  return `<section class="ml-chat-card ml-stack"><h3>Party Coins: ${e(COIN_ACTIONS[operation])}</h3>${rows.filter(row => !row.purse).map(row => `<div class="ml-card ml-stack">${core().ui.actorIdentity({actorUuid:game.actors.get(row.actorId)?.uuid})}<p>${remove ? 'Removed' : 'Added'}: ${e(formatCoins(row.applied))}</p>${remove && COINS.some(key => row.deficit[key] > 0) ? `<p class="ml-text" data-tone="warning">Deficit: ${e(formatCoins(row.deficit))}</p>` : remove && COINS.some(key => row.partyPaid[key] > 0) ? `<p class="ml-text" data-tone="warning">Paid by Party: ${e(formatCoins(row.partyPaid))}</p>` : ''}</div>`).join('')}${skipped ? `<p>Skipped ${skipped} whose coins did not change.</p>` : ''}</section>`;
}
