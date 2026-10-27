import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CHEAT_ATTRIBUTION, CHEAT_SECTIONS, cheatStringEntries} from '../scripts/cheat-sheet-data.mjs';
import {activateCheatTooltip, cheatChipClass, cheatTooltipHTML, deactivateCheatTooltip, renderCheatSheet} from '../scripts/cheat-sheet.mjs';
import {DRAKKENHEIM_CORE_MODULE_ID, DRAKKENHEIM_MODULE_IDS, DRAKKENHEIM_MONSTERS_MODULE_ID, DRAKKENHEIM_SCGD_MODULE_ID, collectDrakkenheimContent, contaminationLevelsFromHTML, drakkenheimConditions, drakkenheimContentActive, drakkenheimItems, openDrakkenheimDocument, resetDrakkenheimCheat, scheduleDrakkenheimCheat, searchZonesFromHTML, setDrakkenheimContent, setDrakkenheimPollDelay, stopDrakkenheimCheat} from '../scripts/cheat-sheet-drakkenheim.mjs';

const section = id => CHEAT_SECTIONS.find(entry => entry.id === id);
const item = (group, id) => group.items.find(entry => entry.id === id);
const text = entry => [...(entry.lines ?? []), ...(entry.table?.rows ?? []).flat()].join(' ');

test('the cheat sheet has every SRD 5.2 section and the required items', () => {
  assert.deepEqual(CHEAT_SECTIONS.map(entry => entry.id), ['conditions', 'actions', 'damage', 'misc', 'cover']);
  const ids = CHEAT_SECTIONS.flatMap(entry => entry.items.map(entryItem => entryItem.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of CHEAT_SECTIONS) {
    assert.ok(entry.title.trim());
    for (const entryItem of entry.items) {
      assert.ok(entryItem.label.trim());
      assert.ok((entryItem.lines?.length ?? 0) > 0 || entryItem.table?.rows?.length);
    }
  }

  assert.deepEqual(section('conditions').items.map(entry => entry.id), [
    'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible',
    'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'
  ]);
  for (const id of ['attack', 'grapple', 'shove', 'magic', 'dash', 'disengage', 'dodge', 'help', 'hide', 'ready', 'search', 'utilize']) {
    assert.ok(item(section('actions'), id), id);
  }
  const typical = item(section('misc'), 'typical-dc');
  assert.equal(typical.label, 'Typical DC');
  assert.equal(section('misc').items.map(entry => entry.id).filter(id => ['typical-dc', 'exhaustion', 'jumping', 'travel'].includes(id)).length, 4);
  const dcText = text(typical);
  for (const label of ['Very easy 5', 'Easy 10', 'Medium 15', 'Hard 20', 'Very hard 25', 'Nearly impossible 30']) assert.match(dcText, new RegExp(label.replace(/ /g, '\\s+')));
  assert.match(dcText, /knotted rope/);
  assert.match(dcText, /ordinary lock/);
  assert.match(dcText, /obscure information/);
  assert.doesNotMatch(dcText, /The GM sets ability-check DCs/);
  for (const id of ['half', 'three-quarters', 'total', 'lightly', 'heavily', 'blindsight', 'darkvision', 'truesight']) {
    assert.ok(item(section('cover'), id), id);
  }
  assert.match(text(item(section('misc'), 'jumping')), /Long jump/);
  assert.match(text(item(section('misc'), 'jumping')), /High jump/);

  const table = item(section('damage'), 'by-level').table;
  assert.deepEqual(table.headers, ['Levels', 'Hidden pit', 'Collapsing roof', 'Fire statue']);
  assert.deepEqual(table.rows.map(row => row[0]), ['1–4', '5–10', '11–16', '17–20']);
  assert.deepEqual(table.rows[0].slice(1), ['1d6', '2d10', '2d10']);
  assert.deepEqual(table.rows.at(-1).slice(1), ['12d6', '18d10', '18d10']);
  for (const id of ['fall', 'suffocating', 'drowning', 'burning', 'pit', 'roof', 'statue', 'spikes', 'darts', 'stone', 'net']) {
    assert.ok(item(section('damage'), id).lines.length);
  }
  assert.equal(item(section('damage'), 'fall').label, 'Falling');
});

test('travel, grapple, shove, hazards, and mounted combat stay paraphrased SRD 5.2.1', () => {
  const pace = text(item(section('misc'), 'travel'));
  assert.equal(item(section('misc'), 'travel').label, 'Travel Pace');
  assert.match(pace, /Fast/);
  assert.match(pace, /400 feet per minute, 4 miles per hour, or 30 miles per day/);
  assert.match(pace, /Disadvantage on Wisdom \(Perception or Survival\)/);
  assert.match(pace, /Dexterity \(Stealth\)/);
  assert.match(pace, /Normal/);
  assert.match(pace, /300 feet per minute, 3 miles per hour, or 24 miles per day/);
  const normal = pace.slice(pace.indexOf('Normal'), pace.indexOf('Slow'));
  assert.match(normal, /Disadvantage on Dexterity \(Stealth\)/);
  assert.doesNotMatch(normal, /Perception/);
  assert.match(pace, /Slow/);
  assert.match(pace, /200 feet per minute, 2 miles per hour, or 18 miles per day/);
  assert.match(pace, /Advantage on Wisdom \(Perception or Survival\)/);

  const grapple = text(item(section('actions'), 'grapple'));
  assert.match(grapple, /8 plus your Strength modifier and Proficiency Bonus/);
  assert.match(grapple, /Strength \(Athletics\) or Dexterity \(Acrobatics\)/);
  assert.match(grapple, /Speed is 0/);
  assert.match(grapple, /Disadvantage on attack rolls against any target other than you/);
  assert.match(grapple, /1 extra foot/);
  const shove = text(item(section('actions'), 'shove'));
  assert.match(shove, /8 plus your Strength modifier and Proficiency Bonus/);
  assert.match(shove, /push it 5 feet away or give it the Prone condition/);

  const suffocating = text(item(section('damage'), 'suffocating'));
  assert.match(suffocating, /1 plus your Constitution modifier \(minimum 30 seconds\)/);
  assert.match(suffocating, /1 Exhaustion level at the end of each of your turns/);
  assert.match(suffocating, /remove all the Exhaustion levels you gained from suffocating/);
  const drowning = text(item(section('damage'), 'drowning'));
  assert.match(drowning, /cannot breathe while underwater/);
  assert.match(drowning, /Suffocation/);
  assert.doesNotMatch(drowning, /\dd\d+/);

  assert.equal(section('misc').title, 'Misc');
  assert.deepEqual(section('misc').items.map(entry => entry.id), ['typical-dc', 'exhaustion', 'jumping', 'travel', 'mounted', 'underwater']);
  const mounted = text(item(section('misc'), 'mounted'));
  assert.match(mounted, /half your Speed \(round down\)/);
  assert.match(mounted, /Dash, Disengage, or Dodge/);
  assert.match(mounted, /DC 10 Dexterity saving throw/);
  const underwater = text(item(section('misc'), 'underwater'));
  assert.match(underwater, /Swim Speed/);
  assert.match(underwater, /Piercing/);
  assert.match(underwater, /beyond the weapon's normal range/);
  assert.match(underwater, /Resistance to Fire damage/);

  const ids = CHEAT_SECTIONS.flatMap(entry => entry.items.map(entryItem => entryItem.id));
  assert.equal(new Set(ids).size, ids.length);
  const keys = cheatStringEntries().map(([key]) => key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.includes('item.grapple.label') && keys.includes('item.grappled.label'), true);
  assert.equal(keys.some(key => key.startsWith('item.grapple.') && key.includes('grappled')), false);
});

test('misc follows improvising damage, and Drakkenheim is one section before the attribution', () => {
  setDrakkenheimContent({items: [{id: 'contamination', labelText: 'Contamination', tipHTML: '<p>Fixture</p>', origin: 'drakkenheim'}]});
  try {
    const html = renderCheatSheet();
    const damage = html.indexOf('data-cheat-section="damage"');
    const misc = html.indexOf('data-cheat-section="misc"');
    const cover = html.indexOf('data-cheat-section="cover"');
    const group = html.indexOf('data-cheat-section="drakkenheim"');
    const note = html.indexOf('class="gm-cheat-note"');
    assert.ok(damage < misc && misc < cover && cover < group && group < note);
    assert.match(html, /data-cheat-section="misc" open/);
    for (const label of ['Typical DC', 'Exhaustion', 'Jumping', 'Travel Pace', 'Mounted', 'Underwater', 'Contamination']) assert.match(html, new RegExp(`>${label}<`));
    assert.doesNotMatch(html, /data-cheat-section="(?:dcs|exhaustion|jumping|travel|mounted-underwater|drakkenheim-mutations|drakkenheim-madness)"/);
  } finally {
    resetDrakkenheimCheat();
  }
});

test('exhaustion uses the SRD 5.2 cumulative penalties', () => {
  const rule = text(item(section('misc'), 'exhaustion'));
  assert.match(rule, /reduced by 2 times your Exhaustion level/);
  assert.match(rule, /5 feet times your Exhaustion level/);
  assert.match(rule, /die if your Exhaustion level is 6/);
  assert.match(rule, /Finishing a Long Rest removes 1 Exhaustion level/);
  assert.match(rule, /Level 1\. D20 Tests are reduced by 2\. Speed is reduced by 5 feet\./);
  assert.match(rule, /Level 6\. You die\./);
  assert.doesNotMatch(rule, /Hit point maximum halved|Speed halved|Disadvantage on ability checks/);
});

test('attribution names SRD 5.2.1 and CC-BY-4.0, and the sheet has no rules-version switch', () => {
  assert.match(CHEAT_ATTRIBUTION, /System Reference Document 5\.2\.1/);
  assert.match(CHEAT_ATTRIBUTION, /Wizards of the Coast LLC/);
  assert.match(CHEAT_ATTRIBUTION, /https:\/\/www\.dndbeyond\.com\/srd/);
  assert.match(CHEAT_ATTRIBUTION, /https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/legalcode/);
  assert.match(CHEAT_ATTRIBUTION, /paraphrased/);
  const source = ['cheat-sheet-data.mjs', 'cheat-sheet.mjs'].map(name => readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(source, /rulesVersion|\b2014\b|\blegacy\b|SRD 5\.1/);
});

function setProperty(object, key, value) {
  let target = object;
  if (key.includes('.')) {
    const parts = key.split('.');
    key = parts.pop();
    target = parts.reduce((node, part) => {
      if (!node.hasOwnProperty(part)) node[part] = {};
      return node[part];
    }, object);
  }
  target[key] = value;
}

function expandLocalization(flat) {
  const expanded = {};
  for (const [key, value] of Object.entries(flat)) {
    const nested = value instanceof Object && !Array.isArray(value) ? expandLocalization(value) : value;
    setProperty(expanded, key, nested);
  }
  return expanded;
}

function localizationCollisions(flat) {
  const collisions = [];
  const keys = Object.keys(flat);
  const present = new Set(keys);
  for (const key of keys) {
    const parts = key.split('.');
    for (let index = 1; index < parts.length; index += 1) {
      const prefix = parts.slice(0, index).join('.');
      if (!present.has(prefix)) continue;
      const value = flat[prefix];
      if (typeof value !== 'object' || value === null) collisions.push(`${prefix} is ${JSON.stringify(value)} and also a parent of ${key}`);
    }
  }
  return collisions;
}

test('language strings match the data module', () => {
  const english = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'));
  const entries = cheatStringEntries();
  assert.equal(new Set(entries.map(([key]) => key)).size, entries.length);
  for (const [key, value] of entries) assert.equal(english[`morelord-game-master.cheat.${key}`], value, key);
  const cheatKeys = Object.keys(english).filter(key => key.startsWith('morelord-game-master.cheat.'));
  assert.equal(cheatKeys.length, entries.length);
  assert.equal(english['morelord-game-master.cheat.item.blinded'], undefined);
  assert.equal(english['morelord-game-master.cheat.item.blinded.label'], 'Blinded');
  assert.match(english['morelord-game-master.cheat.item.blinded.lines.0'], /automatically fail any ability check that requires sight/);
});

test('localization keys expand without a string also being a parent', () => {
  const reported = {'morelord-game-master.cheat.item.blinded': 'Blinded', 'morelord-game-master.cheat.item.blinded.line.0': 'You can\'t see.'};
  assert.throws(() => expandLocalization(reported), /Cannot create property 'line' on string 'Blinded'/);
  assert.ok(localizationCollisions(reported).length > 0);
  const reversed = {'morelord-game-master.cheat.item.blinded.line.0': 'You can\'t see.', 'morelord-game-master.cheat.item.blinded': 'Blinded'};
  assert.ok(localizationCollisions(reversed).length > 0);
  const english = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'));
  assert.deepEqual(localizationCollisions(english), []);
  assert.doesNotThrow(() => expandLocalization(english));
});

test('Drakkenheim chips keep a faint purple and the theme text color', () => {
  assert.equal(cheatChipClass({ id: 'conditions' }, { id: 'blinded' }), 'gm-cheat-chip');
  assert.equal(cheatChipClass({ id: 'contamination', origin: 'drakkenheim' }, { id: 'level-1' }), 'gm-cheat-chip gm-cheat-chip--drakkenheim');
  assert.equal(cheatChipClass({ id: 'drakkenheim-mutations' }, { id: 'minor' }), 'gm-cheat-chip gm-cheat-chip--drakkenheim');
  const css = readFileSync(new URL('../styles/game-master.css', import.meta.url), 'utf8');
  const rule = css.match(/#mlgm \.gm-cheat-chip--drakkenheim \{[^}]+\}/)?.[0] ?? '';
  assert.match(rule, /rgba\(146,\s*96,\s*176,\s*0\.22\)/);
  assert.match(rule, /color:\s*inherit/);
  assert.doesNotMatch(rule, /color:\s*#(?:000|111|222)\b/i);
  const html = renderCheatSheet();
  assert.doesNotMatch(html, /gm-cheat-chip--drakkenheim/);
});

test('chips expose Foundry HTML tooltips and keyboard focus activates them', () => {
  const html = renderCheatSheet();
  const chips = html.match(/data-mlgm-cheat=/g);
  const sheet = CHEAT_SECTIONS;
  assert.equal(chips.length, sheet.reduce((sum, entry) => sum + entry.items.length, 0));
  assert.match(html, /id="mlgm-cheat"/);
  assert.match(html, /data-tooltip=/);
  assert.match(html, /data-tooltip-html=/);
  assert.match(html, /data-tooltip-class="mlgm-cheat-tip"/);
  assert.match(html, /creativecommons\.org\/licenses\/by\/4\.0\/legalcode/);
  for (const entry of CHEAT_SECTIONS) assert.match(html, new RegExp(`data-cheat-section="${entry.id}" open`));
  const blinded = cheatTooltipHTML(item(section('conditions'), 'blinded'));
  assert.match(blinded, /<strong>Blinded<\/strong>/);
  assert.match(blinded, /automatically fail any ability check that requires sight/);
  assert.doesNotMatch(blinded, /<script|onerror=/);

  const calls = [];
  globalThis.game = { tooltip: { activate: (...args) => calls.push(args), deactivate: () => calls.push('off') } };
  const element = {
    getAttribute: name => ({ 'data-tooltip-html': '<p>Blinded</p>', 'data-tooltip-class': 'mlgm-cheat-tip' })[name],
    closest: selector => selector === '[data-mlgm-cheat]' ? element : null
  };
  try {
    assert.deepEqual(activateCheatTooltip(element), { html: '<p>Blinded</p>', cssClass: 'mlgm-cheat-tip' });
    assert.equal(calls[0][0], element);
    assert.equal(deactivateCheatTooltip({ target: element, relatedTarget: { closest: () => null } }), true);
    assert.equal(calls.at(-1), 'off');
    assert.equal(deactivateCheatTooltip({ target: element, relatedTarget: { closest: () => element } }), false);
  } finally {
    delete globalThis.game;
  }
});

function drakkenheimGame({active = true, packs = []} = {}) {
  const ids = active ? [...DRAKKENHEIM_MODULE_IDS] : [];
  return {
    modules: {get(id) { return {active: ids.includes(id)}; }},
    packs
  };
}

function packDocuments(documentName, collection, entries) {
  return {
    documentName,
    collection,
    metadata: {packageName: collection.split('.')[0], name: collection.split('.')[1]},
    async getIndex() { return entries.map(entry => ({_id: entry.id, name: entry.name, type: entry.type})); },
    async getDocuments(query) {
      const ids = query?._id__in ?? [];
      return ids.flatMap(id => {
        const entry = entries.find(item => item.id === id);
        return entry && !entry.fail ? [entry] : [];
      });
    },
    async getDocument(id) {
      const entry = entries.find(item => item.id === id);
      if (!entry || entry.fail) throw new Error('missing');
      return entry;
    }
  };
}

function journalPack(entries) {
  return packDocuments('JournalEntry', 'drakkenheim-core.journals', entries);
}

function symptomTable(effects) {
  const rows = effects.map((effect, index) => `<tr><td><p>${index + 1}</p></td><td><p>${effect}</p></td></tr>`).join('');
  return `<table><thead><tr><th>Level</th><th>Effect</th></tr></thead><tbody>${rows}</tbody></table>`;
}

test('contamination levels stay hidden until the Drakkenheim content pack is active', async () => {
  assert.equal(DRAKKENHEIM_CORE_MODULE_ID, 'drakkenheim-core');
  assert.deepEqual(DRAKKENHEIM_MODULE_IDS, ['drakkenheim-core', 'drakkenheim-monsters', 'drakkenheim-scgd']);
  assert.equal(DRAKKENHEIM_SCGD_MODULE_ID, 'drakkenheim-scgd');
  const packs = [journalPack([{id: 'abc', name: 'Appendix C: Contamination', pages: []}])];
  assert.equal(drakkenheimContentActive(drakkenheimGame({active: false})), false);
  assert.equal(drakkenheimContentActive(drakkenheimGame()), true);
  assert.deepEqual(await collectDrakkenheimContent(drakkenheimGame({active: false, packs})), {conditions: [], items: []});
  assert.deepEqual(await collectDrakkenheimContent(drakkenheimGame({packs: [journalPack([{id: 'town', name: 'Emberwood Village', pages: [{name: 'Overview', text: {content: '<p>Unrelated.</p>'}}]}]) ]})), {conditions: [], items: []});
  const broken = journalPack([{id: 'bad', name: 'Contamination', fail: true}]);
  assert.deepEqual(await collectDrakkenheimContent(drakkenheimGame({packs: [broken]})), {conditions: [], items: []});
});

test('the Drakkenheim section is three pack chips, and conditions join the main section', async () => {
  const junk = Array.from({length: 9}, (_, index) => `<tr><td><p>${index + 1}</p></td><td><p>Your lips, nose, and ears</p></td></tr>`).join('');
  const symptoms = `<h2>Level 1</h2><blockquote><p>Flavor quote.</p></blockquote><h3>Long Rest Contamination</h3><p>Not a level.</p>${symptomTable(['Fixture effect one.', 'Fixture effect two.'])}<table><tbody>${junk}</tbody></table>`;
  const searchHtml = '<p>Use Arcana, Investigation, or Survival.</p><h2>Deep Haze</h2><p>Unrelated haze.</p><h2>Sludge</h2><p>Unrelated sludge.</p><h2>Effects on Characters</h2><p>Unrelated effects.</p><table><thead><tr><th><p>Area</p></th><th><p>Check DC</p></th></tr></thead><tbody><tr><td><p>Outside the Wall</p></td><td><p>15</p></td></tr><tr><td><p>Inside the Wall</p></td><td><p>20</p></td></tr></tbody></table>';
  assert.deepEqual(contaminationLevelsFromHTML(symptoms).map(level => level.text), ['Fixture effect one.', 'Fixture effect two.']);
  assert.deepEqual(searchZonesFromHTML(searchHtml).map(zone => [zone.label, zone.dc]), [['Outside the Wall', 15], ['Inside the Wall', 20]]);
  const requested = [];
  const journal = journalPack([
    {id: 'book', name: 'Dungeons of Drakkenheim', pages: [{id: 'effects', name: 'Effects', text: {content: '<p><strong>Level 1.</strong> Fixture one.</p>'}}]},
    {id: 'rest', name: 'Long Rest Contamination', pages: [{id: 'rest', name: 'Long Rest Contamination', text: {content: '<p>Rest.</p>'}}]},
    {id: 'spells', name: 'Contaminated Spells', pages: [{id: 'spells', name: 'Contaminated Spells', text: {content: '<p>Spells.</p>'}}]},
    {id: 'town', name: 'Emberwood Village', pages: [{id: 'overview', name: 'Overview', text: {content: '<p>A town mentions contamination.</p>'}}]},
    {id: 'appendix-d', name: 'Appendix D: Delerium', pages: [{id: 'd', name: 'Delerium', text: {content: '<p>Journal topic.</p>'}}]},
    {id: 'mut', name: 'Mutations', pages: [{id: 'mut', name: 'Mutations', text: {content: '<p>Amorphous Form</p>'}}]},
    {id: 'abc', name: 'Appendix C: Contamination', pages: [
      {id: 'sym', name: 'Contamination Symptoms', uuid: 'Compendium.journal.sym', text: {content: symptoms}},
      {id: 'search', name: 'Searching for Delerium', uuid: 'Compendium.journal.search', text: {content: searchHtml}},
      {id: 'mad', name: 'Madness', text: {content: '<p><strong>Whispers</strong> Fixture dread.</p>'}},
      {id: 'numbered', name: '01 Contamination Symptoms', text: {content: '<p>Fixture symptoms.</p>'}}
    ]},
    {id: 'conds', name: 'Conditions', pages: [{id: 'haze', name: 'Haze Bound', uuid: 'Compendium.journal.haze', text: {content: '<p>Fixture condition.</p>'}}]}
  ]);
  const original = journal.getDocuments.bind(journal);
  journal.getDocuments = async query => {
    requested.push(...(query?._id__in ?? []));
    return original(query);
  };
  const items = packDocuments('Item', 'drakkenheim-monsters.items', [
    {id: 'chip', name: 'Delerium Chip', uuid: 'Compendium.item.chip', system: {price: {value: 50, denomination: 'gp'}, weight: 0.1, description: {value: '<p>Fixture crystal.</p>'}}},
    {id: 'dust', name: 'Delerium Dust', system: {}},
    {id: 'rope', name: 'Rope', system: {price: {value: 1, denomination: 'gp'}}},
    {id: 'sick', name: 'Haze Sick', type: 'condition', uuid: 'Compendium.item.sick', system: {description: {value: '<p>Fixture sickness.</p>'}}}
  ]);
  const itemIds = [];
  const readItems = items.getDocuments.bind(items);
  items.getDocuments = async query => {
    itemIds.push(...(query?._id__in ?? []));
    return readItems(query);
  };
  items.getDocument = async () => { throw new Error('scan'); };
  const found = await collectDrakkenheimContent(drakkenheimGame({packs: [journal, items]}));
  assert.deepEqual(requested, ['abc', 'conds']);
  assert.deepEqual(itemIds, ['chip', 'dust', 'sick']);
  assert.deepEqual(found.items.map(item => item.labelText), ['Contamination', 'Delerium Search', 'Delerium']);
  assert.match(found.items[0].tipHTML, /Level 1: Fixture effect one/);
  assert.match(found.items[0].tipHTML, /Level 2: Fixture effect two/);
  assert.doesNotMatch(found.items[0].tipHTML, /Flavor quote|Your lips|Long Rest|Contaminated Spells/);
  assert.equal(found.items[0].documentPath, 'drakkenheim-core.journals:Appendix C: Contamination / Contamination Symptoms');
  const search = found.items[1];
  assert.match(search.tipHTML, /Outside the Wall: DC 15/);
  assert.match(search.tipHTML, /Inside the Wall: DC 20/);
  assert.match(search.tipHTML, /Arcana, Investigation, or Survival/);
  assert.doesNotMatch(search.tipHTML, /Deep Haze|Sludge|Effects on Characters/);
  const values = found.items[2];
  assert.match(values.tipHTML, /Delerium Chip/);
  assert.match(values.tipHTML, /Price: 50 GP/);
  assert.match(values.tipHTML, /Weight: 0\.1 lb/);
  assert.match(values.tipHTML, /Fixture crystal/);
  assert.doesNotMatch(values.tipHTML, /Appendix D|Rope|Delerium Dust/);
  assert.deepEqual(found.conditions.map(item => item.labelText), ['Haze Bound', 'Haze Sick']);
  assert.match(found.conditions.map(item => item.tipHTML).join(' '), /Fixture condition/);
  assert.match(found.conditions.map(item => item.tipHTML).join(' '), /Fixture sickness/);
  setDrakkenheimContent(found);
  try {
    const html = renderCheatSheet();
    const conditions = html.slice(html.indexOf('data-cheat-section="conditions"'), html.indexOf('data-cheat-section="actions"'));
    assert.match(conditions, /gm-cheat-chip--drakkenheim/);
    assert.match(conditions, />Haze Bound</);
    assert.match(conditions, />Haze Sick</);
    assert.doesNotMatch(html, /data-cheat-section="drakkenheim-mutations"|Madness|Amorphous/);
    const group = html.indexOf('data-cheat-section="drakkenheim"');
    const note = html.indexOf('class="gm-cheat-note"');
    assert.ok(group < note);
  } finally {
    resetDrakkenheimCheat();
  }
  const calls = [];
  const opened = await openDrakkenheimDocument('Compendium.journal.sym', 'sym', {fromUuid: async () => ({pages: {get: id => id === 'sym' ? {sheet: {render: async (...args) => calls.push(args)}} : null}})});
  assert.equal(opened, true);
  assert.equal(calls[0][1].pageId, 'sym');
});

test('a contamination roll table can supply the single Contamination chip', async () => {
  const table = packDocuments('RollTable', 'drakkenheim-core.tables', []);
  table.getIndex = async () => [{_id: 't1', name: 'Contamination Symptoms'}];
  table.getDocuments = async () => [{id: 't1', name: 'Contamination Symptoms', uuid: 'Compendium.drakkenheim-core.tables.RollTable.t1', results: [{text: 'Level 1', description: 'Table fixture'}]}];
  const found = await collectDrakkenheimContent(drakkenheimGame({packs: [table]}));
  assert.equal(found.items[0].labelText, 'Contamination');
  assert.equal(found.items[0].documentPath, 'drakkenheim-core.tables:Contamination Symptoms');
  assert.match(found.items[0].tipHTML, /Table fixture/);
  const source = readFileSync(new URL('../scripts/cheat-sheet-drakkenheim.mjs', import.meta.url), 'utf8');
  const literals = source.match(/(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g) ?? [];
  for (const literal of literals) assert.ok(literal.length < 200, literal.slice(0, 80));
  assert.doesNotMatch(source, /Rampant Mutation|Purge Contamination|Gibbering Mouther/);
  assert.doesNotMatch(source, /morelord-craftworks|hasAccess|getZones|getSkillOptions|contentPacks|monsters-of-drakkenheim/);
});

test('an inactive Drakkenheim module is not remembered as off', async () => {
  resetDrakkenheimCheat();
  let renders = 0;
  const pack = journalPack([{
    id: 'abc',
    name: 'Contamination',
    pages: [{id: 'sym', name: 'Contamination Symptoms', text: {content: symptomTable(['Later.', 'Next.'])}}]
  }]);
  scheduleDrakkenheimCheat(() => { renders += 1; }, drakkenheimGame({active: false, packs: [pack]}));
  assert.equal(renders, 0);
  assert.deepEqual(drakkenheimItems(), []);
  scheduleDrakkenheimCheat(() => { renders += 1; }, drakkenheimGame({packs: [pack]}));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(renders, 1);
  assert.equal(drakkenheimItems()[0].labelText, 'Contamination');
  assert.match(drakkenheimItems()[0].tipHTML, /Later/);
  scheduleDrakkenheimCheat(() => { renders += 1; }, drakkenheimGame({packs: [pack]}));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(renders, 1);
  resetDrakkenheimCheat();
});

test('an empty compendium read keeps loading while the Cheat Sheet tab is open', async () => {
  resetDrakkenheimCheat();
  setDrakkenheimPollDelay(20);
  let renders = 0;
  const packs = [];
  const game = {
    modules: {get(id) { return {active: id === 'drakkenheim-core'}; }},
    packs
  };
  try {
    scheduleDrakkenheimCheat(() => { renders += 1; }, game);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(renders, 0);
    assert.deepEqual(drakkenheimItems(), []);
    packs.push(journalPack([{
      id: 'abc',
      name: 'Appendix C: Contamination',
      pages: [{id: 'sym', name: 'Contamination Symptoms', text: {content: symptomTable(['Arrived.', 'Next.'])}}]
    }]));
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(renders, 1);
    assert.equal(drakkenheimItems()[0].labelText, 'Contamination');
    assert.match(drakkenheimItems()[0].tipHTML, /Arrived/);
  } finally {
    resetDrakkenheimCheat();
  }
});

test('an active module shows the Drakkenheim section immediately, and leaving the tab stops the retry', async () => {
  resetDrakkenheimCheat();
  globalThis.game = drakkenheimGame();
  try {
    const html = renderCheatSheet();
    assert.match(html, /data-cheat-section="drakkenheim"/);
    assert.match(html, /data-cheat-status="loading"/);
    assert.match(html, /data-cheat-loading/);
    assert.match(html, /Loading…/);
    const damage = html.indexOf('data-cheat-section="damage"');
    const misc = html.indexOf('data-cheat-section="misc"');
    const group = html.indexOf('data-cheat-section="drakkenheim"');
    const note = html.indexOf('class="gm-cheat-note"');
    assert.ok(damage < misc && misc < group && group < note);
  } finally {
    delete globalThis.game;
    resetDrakkenheimCheat();
  }
  setDrakkenheimPollDelay(20);
  let renders = 0;
  const packs = [];
  const game = {modules: {get(id) { return {active: id === 'drakkenheim-core'}; }}, packs};
  scheduleDrakkenheimCheat(() => { renders += 1; }, game);
  await new Promise(resolve => setTimeout(resolve, 10));
  stopDrakkenheimCheat();
  packs.push(journalPack([{id: 'abc', name: 'Appendix C: Contamination', pages: [{id: 'sym', name: 'Contamination Symptoms', text: {content: symptomTable(['Late.', 'Next.'])}}]}]));
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(renders, 0);
  assert.deepEqual(drakkenheimItems(), []);
  resetDrakkenheimCheat();
});

test('the tray adds Cheat Sheet after Triggers and does not register a new setting', () => {
  const main = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /triggers: "Triggers", cheat: "Cheat Sheet", settings: "GM Settings", party: "Player Settings"/);
  assert.match(main, /scheduleDrakkenheimCheat/);
  assert.match(main, /return renderCheatSheet\(\)/);
  assert.match(main, /cheat-document/);
  assert.match(main, /focusin/);
  assert.match(main, /activateCheatTooltip/);
  const calls = [...main.matchAll(/game\.settings\.register\((?:(?!game\.settings\.register)[\s\S])*?\);/g)].map(match => match[0]);
  assert.equal(calls.length, 8);
});
