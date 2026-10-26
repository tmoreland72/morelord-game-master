import {assert} from '../../../morelord-core/scripts/testing/in-game.js';
import {applyBulkCoins, COINS} from '../bulk-coins.mjs';

const ID = 'morelord-game-master';
const until = async (read, label) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) { const value = read(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 30)); }
  throw Error(`Timed out: ${label}`);
};

export const bulkCoinsCheck = {id:'game-master.bulk-coins-and-shared-purse', async run() {
  assert(game.world.id === 'dev1' && game.user.isGM, 'Dev1 GM required.');
  const api = game.modules.get(ID).api;
  const board = foundry.utils.deepClone(game.settings.get(ID, 'board'));
  const primary = game.settings.get('dnd5e', 'primaryParty');
  const savedPrimary = primary?.toObject?.() ?? {actor:game.actors.party?.id ?? null};
  const wasOpen = document.body.classList.contains('mlgm-open');
  const selectedTab = document.querySelector('#mlgm [aria-selected=true]')?.dataset.id ?? 'rolls';
  const fixtures = [], messageIds = new Set();
  let party;
  try {
    for (const name of ['Aster', 'Bram', 'Cora', 'Outside']) fixtures.push(await Actor.create({name:`Bulk coin fixture ${name}`, type:'character', ownership:{default:3}}));
    const members = fixtures.slice(0, 3), outside = fixtures[3];
    await outside.update({'system.currency.gp':100});
    party = await Actor.create({name:'Bulk coin fixture Party', type:'group', system:{members:members.map(actor => ({actor:actor.id}))}});
    await game.settings.set('dnd5e', 'primaryParty', {actor:party});
    await game.settings.set(ID, 'board', {...board, partyActorIds:members.map(actor => actor.id), last:{...board.last, bulkCoins:{}}});
    api.toggle(true); document.querySelector('#mlgm-tab-bulk').click();
    assert(document.querySelectorAll('[data-mlgm-bulk-coins] input').length === 5, 'Five denomination fields render.');
    assert(document.querySelectorAll('select[name=bulkCoinAction] option').length === 4 && document.querySelectorAll('[data-action=bulk-coins]').length === 1, 'Action dropdown has four options and one Apply/Take button.');
    assert(document.querySelector('#mlgm-tab-bulk').textContent === 'Bulk Actions' && document.querySelector('#mlgm-tab-bulk').nextElementSibling.id === 'mlgm-tab-macros', 'Bulk Actions precedes Macros.');
    assert(!document.querySelector('#mlgm-panel .ml-actor-identity'), 'Participants and party purse remain outside Bulk Actions.');
    const referenceLabel = document.createElement('label');
    referenceLabel.innerHTML = '<span>Reference</span><input type="number">';
    document.querySelector('#mlgm-panel').append(referenceLabel);
    const referenceStyle = getComputedStyle(referenceLabel.firstElementChild);
    const expectedLabel = {color:referenceStyle.color, fontSize:referenceStyle.fontSize, fontWeight:referenceStyle.fontWeight, textTransform:referenceStyle.textTransform};
    referenceLabel.remove();
    for (const field of document.querySelectorAll('[data-mlgm-bulk-coins] .ml-stepper')) {
      const labelStyle = getComputedStyle(field.previousElementSibling);
      assert(Object.entries(expectedLabel).every(([key, value]) => labelStyle[key] === value), 'Coin labels match Core standard field labels.');
      assert(field.getBoundingClientRect().width <= 6.5 * parseFloat(getComputedStyle(document.documentElement).fontSize) + 1, 'Coin fields remain compact for ordinary four-digit amounts.');
      const input = field.querySelector('input').getBoundingClientRect();
      const up = field.querySelector('[data-step=up]').getBoundingClientRect();
      const down = field.querySelector('[data-step=down]').getBoundingClientRect();
      assert(field.dataset.layout === 'stacked' && up.left >= input.right - 1 && down.left >= input.right - 1 && up.bottom <= down.top + 1, 'Core arrows stack on the right of each number field.');
    }
    document.querySelector('[data-action=bulk-coin-step][data-id="gp:-1"]').click();
    await until(() => game.settings.get(ID, 'board').last.bulkCoins.gp === 0, 'decrement floor');
    document.querySelector('[data-action=bulk-coin-step][data-id="gp:1"]').click();
    await until(() => game.settings.get(ID, 'board').last.bulkCoins.gp === 1, 'increment');
    document.querySelector('[data-action=bulk-coin-step][data-id="gp:-1"]').click();
    await until(() => game.settings.get(ID, 'board').last.bulkCoins.gp === 0, 'decrement');
    const negative = document.querySelector('[data-mlgm-bulk-coins] [name=gp]');
    negative.value = '-2'; negative.dispatchEvent(new Event('change', {bubbles:true}));
    assert(negative.value === '0', 'Typed negative coin values are clamped to zero.');
    assert(document.querySelector('#mlgm-panel strong.gm-specialty-title')?.textContent === 'Coins', 'Coins uses the same card title as specialty requests.');
    const zero = actor => COINS.every(key => actor.system.currency[key] === 0);
    const run = async (operation, amounts, doubleClick = false) => {
      for (const key of COINS) {
        const value = amounts[key] ?? 0;
        const input = document.querySelector(`[data-mlgm-bulk-coins] [name="${key}"]`);
        input.value = String(value); input.dispatchEvent(new Event('change', {bubbles:true}));
        await until(() => game.settings.get(ID, 'board').last.bulkCoins[key] === value, `saved ${key}`);
      }
      const before = new Set(game.messages.map(message => message.id));
      const choice = document.querySelector('[name=bulkCoinAction]');
      if (choice.value !== operation) { choice.value = operation; choice.dispatchEvent(new Event('change', {bubbles:true})); await until(() => game.settings.get(ID, 'board').last.bulkCoinAction === operation, 'saved action'); }
      const button = document.querySelector('[data-action=bulk-coins]');
      assert(button.textContent === (operation.endsWith('-remove') ? 'Take' : 'Apply'), 'Button label matches the selected operation.');
      assert(!button.disabled, 'An eligible party can use the action.');
      button.click(); if (doubleClick) button.click();
      const message = await until(() => game.messages.find(message => !before.has(message.id) && message.getFlag(ID, 'bulkCoins')?.actorIds.includes(members[0].id) && message.getFlag(ID, 'bulkCoins').stage === 'complete'), operation);
      messageIds.add(message.id);
      assert(!message.content.includes('Requested:') && !message.content.includes('Entered:') && !message.content.includes('\uFFFD'), 'Chat cards omit redundant amounts and broken heading characters.');
      assert(!/\d+\.\d+ (pp|gp|ep|sp|cp)/.test(message.content), 'Chat never displays fractional coin amounts.');
      const card = document.createElement('div'); card.innerHTML = message.content;
      for (const character of card.querySelectorAll('.ml-card')) {
        for (const line of character.querySelectorAll('p')) if (/^(Paid by Party|Deficit):/.test(line.textContent)) assert(line.classList.contains('ml-text') && line.dataset.tone === 'warning', 'Payment and deficit use Core warning orange.');
        assert(!character.textContent.includes('Deficit: 0 cp') && !character.textContent.includes('Paid by Party: 0 cp'), 'Zero-value fallback lines are hidden.');
        assert(!(character.textContent.includes('Deficit:') && character.textContent.includes('Paid by Party:')), 'Deficits replace party payment details when the cost remains unpaid.');
      }
      await until(() => [...document.querySelectorAll('[data-action=bulk-coins]')].every(button => !button.disabled), 'controls restored');
      assert([...document.querySelectorAll('[data-mlgm-bulk-coins] input')].every(input => input.value === '0') && Object.values(game.settings.get(ID, 'board').last.bulkCoins).every(value => value === 0), 'Successful Apply/Take clears and saves all amounts.');
      assert(game.messages.filter(message => !before.has(message.id) && message.getFlag(ID, 'bulkCoins')).length === 1, 'One action creates one receipt.');
      assert(!message.blind && message.whisper.length === 0 && message.content.includes('ml-chat-card'), 'Every action posts a standard public chat card.');
      assert(members.every(actor => message.content.includes(actor.name)), 'Every configured character appears in the card.');
      assert(outside.system.currency.gp === 100, 'Characters outside Player Settings remain unchanged.');
      return message;
    };

    await run('split-add', {gp:10, cp:2}, true);
    assert(members.map(actor => actor.system.currency.gp).join() === '3,3,3', 'Gold and its remainder are distributed.');
    assert(members.map(actor => actor.system.currency.cp).join() === '4,4,4' && members.every(actor => actor.system.currency.sp === 3), 'Copper and its remainder are distributed.');
    assert(zero(party), 'Additions do not change the party purse.');
    await run('each-add', {gp:2});
    assert(members.map(actor => actor.system.currency.gp).join() === '5,5,5', 'Each character receives the entered amount.');
    await run('split-remove', {gp:8});
    assert(members.reduce((sum, actor) => sum + actor.system.currency.gp * 100 + actor.system.currency.ep * 50 + actor.system.currency.sp * 10 + actor.system.currency.cp + actor.system.currency.pp * 1000, 0) === 802, 'Split removal preserves the remainder and individual shares: ' + JSON.stringify(members.map(actor => actor.system.currency)));
    const deficit = await run('each-remove', {gp:10});
    assert(members.every(zero), 'Insufficient personal funds are spent without negative balances.');
    assert(deficit.content.includes('cp') && !/\d+\.\d+/.test(deficit.content), 'Deficits use whole coins including copper change.');

    await members[0].update({'system.currency.gp':2}); await party.update({'system.currency.gp':3});
    const fallback = await run('each-remove', {gp:3});
    assert(members.every(zero) && zero(party), 'Personal coins are used before the shared purse, and neither goes negative.');
    assert(fallback.content.includes('Paid by Party: 1 gp') && fallback.content.includes('Deficit: 3 gp'), 'Party payments and the final unpaid total are reported.');
    assert(!fallback.content.includes(party.name) && !fallback.content.includes('<strong>Party purse</strong>'), 'No separate party purse card is posted.');
    const id = fallback.getFlag(ID, 'bulkCoins').operationId;
    assert((await applyBulkCoins('each-remove', {gp:3}, id)).alreadyApplied, 'Replayed socket requests cannot charge either purse twice.');

    await members[0].update({'system.currency.cp':1}); await party.update({'system.currency.gp':3});
    const change = await run('each-remove', {gp:1});
    assert(zero(members[0]) && party.system.currency.cp === 1 && party.system.currency.gp === 0, 'Native change-making pays a fractional-gold deficit from the party gold.');
    assert(change.content.includes('Paid by Party: 9 sp, 9 cp'), 'Fractional-denomination party payments are accurate.');
    document.querySelector('#mlgm-tab-rolls').click(); document.querySelector('#mlgm-tab-bulk').click();
    assert(document.querySelector('[data-mlgm-bulk-coins] [name=gp]').value === '0', 'Cleared coin fields persist when changing tabs.');
    await Actor.updateDocuments(members.map(actor => ({_id:actor.id,'system.currency':{pp:0,gp:5,ep:0,sp:3,cp:4}})));
    await run('each-remove', {gp:2,sp:6,cp:6});
    assert(members.every(actor => actor.system.currency.gp * 100 + actor.system.currency.sp * 10 + actor.system.currency.cp + actor.system.currency.ep * 50 + actor.system.currency.pp * 1000 === 268), 'Mixed-denomination Take removes exactly 266 copper, without rounding extra coins.');
    await globalThis.morelordBulkCoinsCapture?.(change.id);
    const clearInput = document.querySelector('[data-mlgm-bulk-coins] [name=gp]');
    clearInput.value = '7'; clearInput.dispatchEvent(new Event('change', {bubbles:true}));
    await until(() => game.settings.get(ID, 'board').last.bulkCoins.gp === 7, 'saved amount before Clear');
    document.querySelector('[data-action=bulk-coins-clear]').click();
    await until(() => Object.values(game.settings.get(ID, 'board').last.bulkCoins).every(value => value === 0), 'saved cleared coins');
    assert([...document.querySelectorAll('[data-mlgm-bulk-coins] input')].every(input => input.value === '0'), 'Clear resets every field to zero.');
    assert(document.querySelector('[data-action=bulk-coins-clear]').nextElementSibling.dataset.action === 'bulk-coins', 'Clear is immediately left of Apply/Take.');
    document.querySelector('#mlgm-tab-rolls').click(); document.querySelector('#mlgm-tab-bulk').click();
    assert([...document.querySelectorAll('[data-mlgm-bulk-coins] input')].every(input => input.value === '0') && document.querySelector('[name=bulkCoinAction]').value === 'each-remove', 'Cleared amounts persist and the selected operation is retained.');

    await game.settings.set(ID, 'board', {...game.settings.get(ID, 'board'), partyActorIds:[]});
    assert([...document.querySelectorAll('[data-action=bulk-coins]')].every(button => button.disabled), 'An empty party disables every coin action.');
  } finally {
    const ids = game.messages.filter(message => messageIds.has(message.id) || message.getFlag(ID, 'bulkCoins')?.actorIds.some(id => fixtures.some(actor => actor.id === id))).map(message => message.id);
    if (ids.length) await ChatMessage.deleteDocuments(ids);
    await game.settings.set(ID, 'board', board);
    await game.settings.set('dnd5e', 'primaryParty', savedPrimary);
    if (party) await party.delete();
    for (const actor of fixtures) await actor.delete();
    document.querySelector(`#mlgm-tab-${selectedTab}`)?.click(); api.toggle(wasOpen);
  }
}};
