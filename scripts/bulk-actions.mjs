import {ID, escapeHTML} from './core.mjs';
import {core, activeGM} from './requests.mjs';
import {bulkCoinsContent, COIN_ACTIONS} from './bulk-coins.mjs';
import {BULK_QUEUE, readBulkUndo, writeBulkUndo} from './bulk-undo.mjs';
import {bulkHTML, bulkText} from './bulk-text.mjs';

export const XP_ACTIONS = {split: 'xp.split', each: 'xp.each', set: 'xp.set'};
export function bulkXpChoice(value) {
  return Object.hasOwn(XP_ACTIONS, value) ? value : 'split';
}
// Foundry 14 PrototypeToken settings that describe how a token looks and behaves.
// movementAction is the token's current movement, and level is a scene level id.
// https://foundryvtt.com/api/v14/types/foundry.documents.types.PrototypeTokenData.html
export const TOKEN_FIELDS = [
  ['name', 'tokens.field.name'],
  ['displayName', 'tokens.field.displayName'],
  ['actorLink', 'tokens.field.actorLink'],
  ['texture', 'tokens.field.texture'],
  ['width', 'tokens.field.width'],
  ['height', 'tokens.field.height'],
  ['depth', 'tokens.field.depth'],
  ['disposition', 'tokens.field.disposition'],
  ['displayBars', 'tokens.field.displayBars'],
  ['bar1', 'tokens.field.bar1'],
  ['bar2', 'tokens.field.bar2'],
  ['sight', 'tokens.field.sight'],
  ['detectionModes', 'tokens.field.detectionModes'],
  ['light', 'tokens.field.light'],
  ['lockRotation', 'tokens.field.lockRotation'],
  ['rotation', 'tokens.field.rotation'],
  ['alpha', 'tokens.field.alpha'],
  ['ring', 'tokens.field.ring'],
  ['occludable', 'tokens.field.occludable']
];
let channel;

export function readXp(value, {allowZero = false} = {}) {
  const amount = value == null || value === '' ? NaN : Number(value);
  if (typeof value === 'boolean' || typeof value === 'object' || !Number.isSafeInteger(amount) || amount < 0) throw Error(bulkText('xp.invalid'));
  if (!allowZero && amount < 1) throw Error(bulkText('xp.required'));
  return amount;
}

export function xpShares(amount, count, split) {
  amount = readXp(amount);
  if (!Number.isInteger(count) || count < 1) throw Error(bulkText('error.party'));
  if (!split) return Array.from({length: count}, () => amount);
  const base = Math.floor(amount / count);
  const remainder = amount % count;
  const recipient = remainder ? Math.floor(Math.random() * count) : -1;
  return Array.from({length: count}, (_, index) => base + (index === recipient ? remainder : 0));
}

export function planXp(actors, operation, amount) {
  if (!Object.hasOwn(XP_ACTIONS, operation)) throw Error(bulkText('xp.invalidAction'));
  const value = readXp(amount, {allowZero: operation === 'set'});
  if (!Number.isInteger(actors.length) || actors.length < 1) throw Error(bulkText('error.party'));
  const shares = operation === 'set' ? null : xpShares(value, actors.length, operation === 'split');
  return actors.map((actor, index) => {
    if (actor?.type !== 'character') throw Error(bulkText('error.character'));
    const before = Number(actor.system?.details?.xp?.value ?? 0);
    if (!Number.isSafeInteger(before) || before < 0) throw Error(bulkText('xp.invalid'));
    const added = operation === 'set' ? value : shares[index];
    const after = operation === 'set' ? value : before + added;
    if (!Number.isSafeInteger(after)) throw Error(bulkText('xp.tooLarge'));
    return {actorId: actor.id, before, after, added};
  });
}

export function inspirationHeld(actor) {
  const raw = actor?._source?.system?.attributes?.inspiration ?? actor?.system?.attributes?.inspiration;
  return raw === true || raw === 1;
}

export function planInspiration(actors, action) {
  if (action !== 'grant' && action !== 'clear') throw Error(bulkText('inspiration.invalid'));
  const grant = action === 'grant';
  return actors.map(actor => {
    if (actor?.type !== 'character') throw Error(bulkText('error.character'));
    const before = inspirationHeld(actor);
    // Grant and clear are idempotent. An actor who already has the requested
    // value must not be written: Foundry omits that no-op from updateDocuments,
    // and the shorter result was reported as a cancelled character update.
    return {actorId: actor.id, before, after: grant, skipped: before === grant};
  });
}

function placedTokenSource(token) {
  try {
    if (typeof token?.toObject === 'function') return token.toObject();
    if (token && typeof token === 'object' && !Array.isArray(token)) return token;
  } catch { /* An unlinked token can fail while materializing its actor delta. */ }
  return null;
}

export function tokenFieldList() {
  const labels = TOKEN_FIELDS.map(([, key]) => bulkText(key));
  if (labels.length < 2) return labels.join('');
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

export function prototypeTokenChanges(token) {
  const source = placedTokenSource(token);
  if (!source) return null;
  const changes = {};
  for (const [key] of TOKEN_FIELDS) if (source[key] !== undefined) changes[key] = source[key];
  return Object.keys(changes).length ? changes : null;
}

export function chooseSceneToken(tokens, controlledIds = []) {
  const list = [...(tokens ?? [])];
  if (!list.length) return null;
  const controlled = new Set(controlledIds);
  const pool = list.some(token => controlled.has(token.id)) ? list.filter(token => controlled.has(token.id)) : list;
  return pool.slice().sort((left, right) => String(left.id).localeCompare(String(right.id)))[0];
}

export function tokensForActor(actor, scene = globalThis.canvas?.scene) {
  if (!actor || !scene) return [];
  let tokens = typeof actor.getDependentTokens === 'function' ? actor.getDependentTokens({scenes: scene, concreteOnly: true}) ?? [] : [];
  if (!tokens.length && typeof actor.getActiveTokens === 'function' && globalThis.canvas?.scene?.id === scene.id) tokens = actor.getActiveTokens(false, true) ?? [];
  if (!tokens.length) {
    const embedded = scene.tokens?.contents ?? scene.tokens ?? [];
    tokens = [...embedded].filter(token => token.actorId === actor.id || token.actor?.id === actor.id);
  }
  return tokens;
}

export function undoLabel(snapshot) {
  if (!snapshot?.kind) return bulkText('undo.none');
  if (snapshot.kind === 'coins') return COIN_ACTIONS[snapshot.operation] ?? snapshot.operation ?? bulkText('undo.unknown');
  if (snapshot.labelKey) return bulkText(snapshot.labelKey);
  return bulkText('undo.unknown');
}

function cloneData(value) {
  if (foundry.utils?.deepClone) return foundry.utils.deepClone(value);
  return structuredClone(value);
}

function partyActors(ids) {
  const unique = [...new Set(ids ?? [])];
  if (!unique.length) throw Error(bulkText('error.party'));
  return unique.map(id => {
    const actor = game.actors.get(id);
    if (actor?.type !== 'character') throw Error(bulkText('error.character'));
    return actor;
  });
}

function assertBulkGm(execution) {
  const sender = core().users.list().find(user => user.id === execution.senderUserId && user.active && user.isGM);
  if (!sender || !game.user.isGM || activeGM()?.id !== game.user.id) throw Error(bulkText('error.gm'));
  return sender;
}

function assertOperationId(operationId) {
  if (typeof operationId !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(operationId)) throw Error(bulkText('error.operation'));
}

async function rememberUndo(snapshot) {
  try { await writeBulkUndo(snapshot); }
  catch (error) {
    console.error(`${ID} | Bulk action applied but the undo snapshot failed`, error);
    ui.notifications.warn(bulkText('undo.unsaved'));
  }
}

async function updateActors(updates) {
  if (!updates.length) return;
  const updated = await Actor.updateDocuments(updates);
  const list = Array.isArray(updated) ? updated : [];
  const returned = new Set(list.flatMap(document => [document?.id, document?._id]).filter(Boolean));
  if (list.length === updates.length && updates.every(update => returned.has(update._id))) return;
  for (const update of updates) {
    if (returned.has(update._id)) continue;
    const actor = game.actors?.get?.(update._id);
    // Foundry omits a write whose cleaned diff is empty. That is not a cancelled update.
    if (update.prototypeToken && !prototypeTokenDiff(prototypeBefore(actor), update.prototypeToken)) continue;
    if ('system.attributes.inspiration' in update) {
      if (inspirationHeld(actor) === Boolean(update['system.attributes.inspiration'])) continue;
    }
    throw Error(bulkText('error.cancelled'));
  }
}

function actorCard(actorId, line) {
  return `<div class="ml-card ml-stack">${core().ui.actorIdentity({actorUuid: game.actors.get(actorId)?.uuid})}<p>${line}</p></div>`;
}

function publicCard(title, body) {
  return `<section class="ml-chat-card ml-stack"><h3>${title}</h3>${body}</section>`;
}

async function runBulk({flag, receipt, title, mutate, complete}) {
  const previous = game.messages.find(message => message.author?.isGM && message.getFlag(ID, flag)?.operationId === receipt.operationId);
  if (previous) {
    if (previous.getFlag(ID, flag).stage !== 'complete') throw Error(bulkText('error.started'));
    return {messageId: previous.id, alreadyApplied: true};
  }
  const stored = {...receipt, stage: 'applying'};
  const message = await ChatMessage.create({
    content: publicCard(title, `<p>${bulkHTML('applying')}</p>`),
    blind: false,
    whisper: [],
    flags: {[ID]: {[flag]: stored}}
  }, {messageMode: 'public'});
  try {
    await mutate();
  } catch (error) {
    await message.update({
      content: publicCard(title, `<p>${escapeHTML(error.message)} ${bulkHTML('error.failed')}</p>`),
      [`flags.${ID}.${flag}`]: {...stored, stage: 'failed'}
    });
    throw error;
  }
  try {
    await message.update({content: complete(), [`flags.${ID}.${flag}`]: {...stored, stage: 'complete'}});
  } catch (error) {
    console.error(`${ID} | Bulk action applied but the chat summary failed`, error);
    ui.notifications.warn(bulkText('error.summary'));
  }
  return {messageId: message.id};
}

function xpContent(amount, action, busy, actorIds) {
  const disabled = busy || !actorIds.length ? 'disabled' : '';
  const selected = Object.hasOwn(XP_ACTIONS, action) ? action : 'split';
  const hint = bulkHTML('xp.remainder');
  const actionField = `<label class="gm-bulk-coin-action"><span class="gm-label-help">${bulkHTML('xp.action')}<button type="button" class="ml-icon-button ml-help-button" data-tooltip="${hint}" aria-label="${hint}"><i class="fa-solid fa-circle-question" aria-hidden="true"></i></button></span><select name="bulkXpAction" ${busy ? 'disabled' : ''}>${Object.entries(XP_ACTIONS).map(([operation, key]) => `<option value="${operation}" ${operation === selected ? 'selected' : ''}>${bulkHTML(key)}</option>`).join('')}</select></label>`;
  const amountField = `<label class="gm-specialty-field"><span>${bulkHTML('xp.amount')}</span><div class="ml-stepper" data-layout="stacked"><input type="number" name="xp" min="0" step="1" max="${Number.MAX_SAFE_INTEGER}" value="${Number(amount) || 0}" required><button type="button" data-step="up" data-action="bulk-xp-step" data-id="1" title="${bulkHTML('xp.increase')}" aria-label="${bulkHTML('xp.increase')}"><i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button><button type="button" data-step="down" data-action="bulk-xp-step" data-id="-1" title="${bulkHTML('xp.decrease')}" aria-label="${bulkHTML('xp.decrease')}"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button></div></label>`;
  return `<section class="ml-card ml-stack" data-gap="4" data-mlgm-bulk="xp"><strong class="gm-specialty-title">${bulkHTML('xp.title')}</strong><form data-mlgm-bulk-xp class="gm-specialty-row">${actionField}${amountField}<button type="button" data-action="bulk-xp" ${disabled}>${bulkHTML('xp.apply')}</button></form></section>`;
}

function inspirationContent(action, busy, actorIds) {
  const disabled = busy || !actorIds.length ? 'disabled' : '';
  const selected = action === 'clear' ? 'clear' : 'grant';
  return `<section class="ml-card ml-stack" data-gap="4" data-mlgm-bulk="inspiration"><strong class="gm-specialty-title">${bulkHTML('inspiration.title')}</strong><div class="gm-specialty-row"><label class="gm-specialty-field"><span>${bulkHTML('inspiration.action')}</span><select name="bulkInspirationAction" ${busy ? 'disabled' : ''}>${[['grant', 'inspiration.grant'], ['clear', 'inspiration.clear']].map(([value, key]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${bulkHTML(key)}</option>`).join('')}</select></label><button type="button" data-action="bulk-inspiration" ${disabled}>${bulkHTML('inspiration.apply')}</button></div></section>`;
}

function tokenContent(busy, actorIds) {
  const help = bulkHTML('tokens.help');
  const hint = bulkHTML('tokens.hint');
  return `<section class="ml-card ml-stack" data-gap="4" data-mlgm-bulk="tokens"><div class="gm-specialty-row"><strong class="gm-specialty-title">${bulkHTML('tokens.title')}</strong><button type="button" class="ml-icon-button ml-help-button gm-row-action" data-action="bulk-tokens-help" data-tooltip="${hint}" aria-label="${help}"><i class="fa-solid fa-circle-question" aria-hidden="true"></i></button></div><button type="button" data-action="bulk-tokens" ${busy || !actorIds.length ? 'disabled' : ''}>${bulkHTML('tokens.sync')}</button></section>`;
}

function undoContent(snapshot, busy) {
  const stored = Boolean(snapshot?.kind);
  const ready = stored && !busy;
  const detail = stored ? `<p>${bulkHTML('undo.last', {label: undoLabel(snapshot)})}</p>` : '';
  const label = stored ? bulkHTML('undo.button') : bulkHTML('undo.none');
  return `<section class="ml-card ml-stack" data-gap="4" data-mlgm-bulk="undo"><strong class="gm-specialty-title">${bulkHTML('undo.title')}</strong>${detail}<button type="button" data-action="bulk-undo" ${ready ? '' : 'disabled'}>${label}</button></section>`;
}

export function bulkPanel({actorIds = [], coins, coinAction, xp = 0, xpAction = 'split', inspiration = 'grant', busy = false, undo = null, cards} = {}) {
  const order = Array.isArray(cards) ? cards : ['coins', 'xp', 'inspiration', 'tokens', 'undo'];
  const html = {
    coins: bulkCoinsContent(actorIds, coins, busy, coinAction),
    xp: xpContent(xp, xpAction, busy, actorIds),
    inspiration: inspirationContent(inspiration, busy, actorIds),
    tokens: tokenContent(busy, actorIds),
    undo: undoContent(undo, busy)
  };
  return `<div class="gm-bulk">${order.filter(id => html[id]).map(id => html[id]).join('')}</div>`;
}

function skipNote(key, count) {
  return count ? `<p>${bulkHTML(key, {count})}</p>` : '';
}

function xpCard(operation, rows, skipped = 0) {
  const title = bulkHTML('xp.card', {action: bulkText(XP_ACTIONS[operation])});
  const line = operation === 'set' ? 'xp.setTo' : 'xp.added';
  return publicCard(title, rows.map(row => actorCard(row.actorId, bulkHTML(line, {amount: row.added.toLocaleString()}))).join('') + skipNote('xp.skipped', skipped));
}

function inspirationCard(action, rows, skipped = 0) {
  const title = bulkHTML(action === 'grant' ? 'inspiration.cardGrant' : 'inspiration.cardClear');
  const line = bulkHTML(action === 'grant' ? 'inspiration.granted' : 'inspiration.cleared');
  const skippedKey = action === 'grant' ? 'inspiration.skippedGrant' : 'inspiration.skippedClear';
  return publicCard(title, rows.map(row => actorCard(row.actorId, line)).join('') + skipNote(skippedKey, skipped));
}

function tokenCard(rows) {
  const already = rows.filter(row => row.unchanged).length;
  const lines = rows.filter(row => !row.unchanged).map(row => actorCard(row.actorId, bulkHTML(row.skipped ? 'tokens.skipped' : 'tokens.updated'))).join('');
  return publicCard(bulkHTML('tokens.card'), lines + skipNote('tokens.already', already));
}

function undoCard(snapshot, actorIds) {
  const purse = snapshot.purse ? `<p>${bulkHTML('undo.purse')}</p>` : '';
  return publicCard(bulkHTML('undo.card', {label: undoLabel(snapshot)}), actorIds.map(id => actorCard(id, bulkHTML('undo.restored'))).join('') + purse);
}

function sameData(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameData(value, right[index]));
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if (!sameData(left[key], right[key])) return false;
  return true;
}

// Foundry merges the update into the current prototype and drops the document
// when that diff is empty. Comparing both sides' keys treats a prototype that
// merely has more nested defaults as a change, and the shorter result was
// reported as a cancelled character update.
function changedData(original, incoming) {
  if (Array.isArray(incoming) || Array.isArray(original)) return sameData(original, incoming) ? undefined : incoming;
  if (!incoming || typeof incoming !== 'object') return Object.is(original, incoming) ? undefined : incoming;
  if (!original || typeof original !== 'object') return incoming;
  const diff = {};
  for (const key of Object.keys(incoming)) {
    const inner = changedData(original[key], incoming[key]);
    if (inner !== undefined) diff[key] = inner;
  }
  return Object.keys(diff).length ? diff : undefined;
}

export function prototypeTokenDiff(before, changes) {
  if (!changes || typeof changes !== 'object') return null;
  const original = before && typeof before === 'object' ? before : {};
  const utils = globalThis.foundry?.utils;
  if (utils?.mergeObject && utils?.diffObject && utils?.isEmpty) {
    const merged = utils.mergeObject(original, changes, {inplace: false, performDeletions: true});
    const diff = utils.diffObject(original, merged);
    return utils.isEmpty(diff) ? null : diff;
  }
  return changedData(original, changes) ?? null;
}

function prototypeBefore(actor) {
  try {
    const source = actor?.toObject?.()?.prototypeToken ?? actor?.prototypeToken;
    return cloneData(prototypeTokenChanges(source) ?? {});
  } catch { return {}; }
}

export function initializeBulkActions(getActorIds) {
  channel = core().socket.createChannel(`${ID}-bulk-actions`);
  const queue = {serialize: BULK_QUEUE};
  channel.on('xp', async ({operation, amount, operationId}, execution) => {
    assertBulkGm(execution);
    assertOperationId(operationId);
    const rows = planXp(partyActors(getActorIds()), operation, amount);
    const changed = rows.filter(row => row.before !== row.after);
    if (!changed.length) return {unchanged: true, notice: bulkText('xp.none')};
    return runBulk({
      flag: 'bulkXp',
      receipt: {operationId, operation, actorIds: changed.map(row => row.actorId)},
      title: bulkHTML('xp.card', {action: bulkText(XP_ACTIONS[operation])}),
      async mutate() {
        await updateActors(changed.map(row => ({_id: row.actorId, 'system.details.xp.value': row.after})));
        await rememberUndo({kind: 'xp', labelKey: XP_ACTIONS[operation], operation, actors: changed.map(row => ({id: row.actorId, before: row.before}))});
      },
      complete: () => xpCard(operation, changed, rows.length - changed.length)
    });
  }, queue);
  channel.on('inspiration', async ({action, operationId}, execution) => {
    assertBulkGm(execution);
    assertOperationId(operationId);
    const rows = planInspiration(partyActors(getActorIds()), action);
    const changed = rows.filter(row => !row.skipped);
    if (!changed.length) return {unchanged: true, notice: bulkText(action === 'grant' ? 'inspiration.noneGrant' : 'inspiration.noneClear')};
    return runBulk({
      flag: 'bulkInspiration',
      receipt: {operationId, action, actorIds: changed.map(row => row.actorId)},
      title: bulkHTML(action === 'grant' ? 'inspiration.cardGrant' : 'inspiration.cardClear'),
      async mutate() {
        const updates = changed.map(row => ({_id: row.actorId, 'system.attributes.inspiration': row.after}));
        try {
          await updateActors(updates);
        } catch (error) {
          // Foundry can apply the boolean and still omit the actor from the
          // result. Undo records the characters whose sheet now matches.
          const applied = changed.filter(row => inspirationHeld(game.actors.get(row.actorId)) === row.after);
          if (!applied.length) throw error;
          await rememberUndo({kind: 'inspiration', labelKey: action === 'grant' ? 'inspiration.grant' : 'inspiration.clear', action, actors: applied.map(row => ({id: row.actorId, before: row.before}))});
          return;
        }
        await rememberUndo({kind: 'inspiration', labelKey: action === 'grant' ? 'inspiration.grant' : 'inspiration.clear', action, actors: changed.map(row => ({id: row.actorId, before: row.before}))});
      },
      complete: () => inspirationCard(action, changed, rows.length - changed.length)
    });
  }, queue);
  channel.on('tokens', async ({operationId}, execution) => {
    assertBulkGm(execution);
    assertOperationId(operationId);
    const scene = globalThis.canvas?.scene;
    if (!scene) throw Error(bulkText('tokens.scene'));
    const controlled = (globalThis.canvas?.tokens?.controlled ?? []).map(token => token.id).filter(Boolean);
    const actors = partyActors(getActorIds());
    const rows = actors.map(actor => {
      const token = chooseSceneToken(tokensForActor(actor, scene), controlled);
      if (!token) return {actorId: actor.id, skipped: true};
      let changes;
      try { changes = cloneData(prototypeTokenChanges(token)); }
      catch { return {actorId: actor.id, skipped: true}; }
      if (!changes) return {actorId: actor.id, skipped: true};
      const before = prototypeBefore(actor);
      const diff = prototypeTokenDiff(before, changes);
      if (!diff) return {actorId: actor.id, unchanged: true};
      return {actorId: actor.id, before, changes: diff};
    });
    const updates = rows.filter(row => row.changes);
    const result = await runBulk({
      flag: 'bulkTokens',
      receipt: {operationId, actorIds: rows.map(row => row.actorId)},
      title: bulkHTML('tokens.card'),
      async mutate() {
        await updateActors(updates.map(row => ({_id: row.actorId, prototypeToken: row.changes})));
        if (updates.length) await rememberUndo({kind: 'tokens', labelKey: 'tokens.card', actors: updates.map(row => ({id: row.actorId, before: row.before}))});
      },
      complete: () => tokenCard(rows)
    });
    return updates.length ? result : {...result, unchanged: true, notice: bulkText('tokens.none')};
  }, queue);
  channel.on('undo', async ({operationId}, execution) => {
    assertBulkGm(execution);
    assertOperationId(operationId);
    const snapshot = readBulkUndo();
    if (!snapshot?.kind) throw Error(bulkText('undo.missing'));
    const actorIds = (snapshot.actors ?? []).map(row => row.id);
    return runBulk({
      flag: 'bulkUndo',
      receipt: {operationId, kind: snapshot.kind, actorIds},
      title: bulkHTML('undo.card', {label: undoLabel(snapshot)}),
      async mutate() {
        await restoreBulkUndo(snapshot);
        try { await writeBulkUndo(null); }
        catch (error) {
          console.error(`${ID} | Bulk action restored but the undo snapshot could not be cleared`, error);
          ui.notifications.warn(bulkText('undo.unsaved'));
        }
      },
      complete: () => undoCard(snapshot, actorIds)
    });
  }, queue);
}

async function restoreBulkUndo(snapshot) {
  if (snapshot.kind === 'coins') {
    const updates = (snapshot.actors ?? []).map(row => ({_id: row.id, 'system.currency': row.currency}));
    if (snapshot.purse?.id) updates.push({_id: snapshot.purse.id, 'system.currency': snapshot.purse.currency});
    await updateActors(updates);
    return;
  }
  if (snapshot.kind === 'xp') {
    await updateActors((snapshot.actors ?? []).map(row => ({_id: row.id, 'system.details.xp.value': row.before})));
    return;
  }
  if (snapshot.kind === 'inspiration') {
    await updateActors((snapshot.actors ?? []).map(row => ({_id: row.id, 'system.attributes.inspiration': row.before})));
    return;
  }
  if (snapshot.kind === 'tokens') {
    await updateActors((snapshot.actors ?? []).map(row => ({_id: row.id, prototypeToken: row.before})));
    return;
  }
  throw Error(bulkText('undo.unknown'));
}

async function executeBulk(type, data) {
  if (!game.user.isGM) throw Error(bulkText('error.gmOnly'));
  const gm = activeGM();
  if (!gm) throw Error(bulkText('error.noGm'));
  return channel.executeAsUser(type, data, gm.id);
}

const operation = id => id ?? foundry.utils.randomID(24);

export function applyBulkXp(operationName, amount, operationId) {
  return executeBulk('xp', {operation: operationName, amount: readXp(amount, {allowZero: operationName === 'set'}), operationId: operation(operationId)});
}
export function applyBulkInspiration(action, operationId) {
  return executeBulk('inspiration', {action, operationId: operation(operationId)});
}
export function applyBulkTokens(operationId) {
  return executeBulk('tokens', {operationId: operation(operationId)});
}
export function applyBulkUndo(operationId) {
  return executeBulk('undo', {operationId: operation(operationId)});
}
