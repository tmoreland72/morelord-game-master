import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CHEAT_ATTRIBUTION, CHEAT_CLOSING_SECTIONS, CHEAT_SECTIONS, cheatStringEntries} from '../scripts/cheat-sheet-data.mjs';
import {activateCheatTooltip, cheatChipClass, cheatTooltipHTML, deactivateCheatTooltip, renderCheatSheet} from '../scripts/cheat-sheet.mjs';
import {DRAKKENHEIM_CORE_MODULE_ID, DRAKKENHEIM_MODULE_IDS, DRAKKENHEIM_MONSTERS_MODULE_ID, DRAKKENHEIM_SCGD_MODULE_ID, collectContaminationSections, collectDrakkenheimSections, contaminationLevelsFromHTML, drakkenheimContentActive, drakkenheimSections, openDrakkenheimDocument, pageTopic, resetDrakkenheimCheat, scheduleDrakkenheimCheat, searchZonesFromHTML, setDrakkenheimSections} from '../scripts/cheat-sheet-drakkenheim.mjs';

const section = id => CHEAT_SECTIONS.find(entry => entry.id === id);
const item = (group, id) => group.items.find(entry => entry.id === id);
const text = entry => [...(entry.lines ?? []), ...(entry.table?.rows ?? []).flat()].join(' ');

test('the cheat sheet has every SRD 5.2 section and the required items', () => {
  assert.deepEqual(CHEAT_SECTIONS.map(entry => entry.id), ['conditions', 'actions', 'damage', 'dcs', 'cover', 'exhaustion', 'jumping', 'travel']);
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
  assert.deepEqual(section('dcs').items.map(entry => entry.label), [
    'Very easy 5', 'Easy 10', 'Medium 15', 'Hard 20', 'Very hard 25', 'Nearly impossible 30'
  ]);
  const dcLines = section('dcs').items.map(entry => entry.lines);
  for (const lines of dcLines) assert.ok(lines.length >= 2 && lines.length <= 3);
  assert.equal(new Set(dcLines.map(lines => lines.join('\n'))).size, dcLines.length);
  assert.match(dcLines[0].join(' '), /knotted rope/);
  assert.match(dcLines[2].join(' '), /ordinary lock/);
  assert.match(dcLines[2].join(' '), /obscure information/);
  assert.doesNotMatch(dcLines.flat().join(' '), /The GM sets ability-check DCs/);
  for (const id of ['half', 'three-quarters', 'total', 'lightly', 'heavily', 'blindsight', 'darkvision', 'truesight']) {
    assert.ok(item(section('cover'), id), id);
  }
  assert.ok(item(section('jumping'), 'long-jump'));
  assert.ok(item(section('jumping'), 'high-jump'));

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
  const pace = section('travel');
  assert.equal(pace.title, 'Travel pace');
  assert.deepEqual(pace.items.map(entry => entry.label), ['Fast', 'Normal', 'Slow']);
  assert.match(text(item(pace, 'fast')), /400 feet per minute, 4 miles per hour, or 30 miles per day/);
  assert.match(text(item(pace, 'fast')), /Disadvantage on Wisdom \(Perception or Survival\)/);
  assert.match(text(item(pace, 'fast')), /Dexterity \(Stealth\)/);
  assert.match(text(item(pace, 'normal')), /300 feet per minute, 3 miles per hour, or 24 miles per day/);
  assert.match(text(item(pace, 'normal')), /Disadvantage on Dexterity \(Stealth\)/);
  assert.doesNotMatch(text(item(pace, 'normal')), /Perception/);
  assert.match(text(item(pace, 'slow')), /200 feet per minute, 2 miles per hour, or 18 miles per day/);
  assert.match(text(item(pace, 'slow')), /Advantage on Wisdom \(Perception or Survival\)/);

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

  assert.deepEqual(CHEAT_CLOSING_SECTIONS.map(entry => entry.id), ['mounted-underwater']);
  const mountedSection = CHEAT_CLOSING_SECTIONS[0];
  assert.equal(mountedSection.title, 'Mounted & underwater combat');
  const mounted = text(item(mountedSection, 'mounted'));
  assert.match(mounted, /half your Speed \(round down\)/);
  assert.match(mounted, /Dash, Disengage, or Dodge/);
  assert.match(mounted, /DC 10 Dexterity saving throw/);
  const underwater = text(item(mountedSection, 'underwater'));
  assert.match(underwater, /Swim Speed/);
  assert.match(underwater, /Piercing/);
  assert.match(underwater, /beyond the weapon's normal range/);
  assert.match(underwater, /Resistance to Fire damage/);

  const ids = [...CHEAT_SECTIONS, ...CHEAT_CLOSING_SECTIONS].flatMap(entry => entry.items.map(entryItem => entryItem.id));
  assert.equal(new Set(ids).size, ids.length);
  const keys = cheatStringEntries().map(([key]) => key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.includes('item.grapple.label') && keys.includes('item.grappled.label'), true);
  assert.equal(keys.some(key => key.startsWith('item.grapple.') && key.includes('grappled')), false);
});

test('mounted combat renders after Drakkenheim and before the attribution', () => {
  setDrakkenheimSections([{
    id: 'drakkenheim-contamination',
    title: 'Contamination',
    origin: 'drakkenheim',
    items: [{id: 'contamination-level-1', labelText: 'Level 1', tipHTML: '<p>Fixture</p>', origin: 'drakkenheim'}]
  }]);
  try {
    const html = renderCheatSheet();
    const group = html.indexOf('data-cheat-group="drakkenheim"');
    const mounted = html.indexOf('data-cheat-section="mounted-underwater"');
    const note = html.indexOf('class="gm-cheat-note"');
    const jumping = html.indexOf('data-cheat-section="jumping"');
    const travel = html.indexOf('data-cheat-section="travel"');
    assert.ok(jumping < travel && travel < group && group < mounted && mounted < note);
    assert.match(html, /data-cheat-section="mounted-underwater" open/);
    assert.match(html, />Mounted</);
    assert.match(html, />Underwater</);
  } finally {
    resetDrakkenheimCheat();
  }
});

test('exhaustion uses the SRD 5.2 cumulative penalties', () => {
  const rule = text(item(section('exhaustion'), 'exhaustion-rule'));
  assert.match(rule, /reduced by 2 times your Exhaustion level/);
  assert.match(rule, /5 feet times your Exhaustion level/);
  assert.match(rule, /die if your Exhaustion level is 6/);
  assert.match(rule, /Finishing a Long Rest removes 1 Exhaustion level/);
  assert.equal(item(section('exhaustion'), 'long-rest'), undefined);
  assert.equal(text(item(section('exhaustion'), 'level-1')), 'D20 Tests are reduced by 2. Speed is reduced by 5 feet.');
  assert.equal(text(item(section('exhaustion'), 'level-6')), 'You die.');
  const exhaustion = section('exhaustion').items.map(text).join(' ');
  assert.doesNotMatch(exhaustion, /Hit point maximum halved|Speed halved|Disadvantage on ability checks/);
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
  const sheet = [...CHEAT_SECTIONS, ...CHEAT_CLOSING_SECTIONS];
  assert.equal(chips.length, sheet.reduce((sum, entry) => sum + entry.items.length, 0));
  assert.match(html, /id="mlgm-cheat"/);
  assert.match(html, /data-tooltip=/);
  assert.match(html, /data-tooltip-html=/);
  assert.match(html, /data-tooltip-class="mlgm-cheat-tip"/);
  assert.match(html, /creativecommons\.org\/licenses\/by\/4\.0\/legalcode/);
  for (const entry of [...CHEAT_SECTIONS, ...CHEAT_CLOSING_SECTIONS]) assert.match(html, new RegExp(`data-cheat-section="${entry.id}" open`));
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

function journalPack(entries) {
  return {
    documentName: 'JournalEntry',
    collection: 'drakkenheim-core.journals',
    metadata: {packageName: 'drakkenheim-core', name: 'journals'},
    async getIndex() { return entries.map(entry => ({_id: entry.id, name: entry.name})); },
    async getDocument(id) {
      const entry = entries.find(item => item.id === id);
      if (entry?.fail) throw new Error('missing');
      return entry;
    }
  };
}

test('contamination levels stay hidden until the Drakkenheim content pack is active', async () => {
  assert.equal(DRAKKENHEIM_CORE_MODULE_ID, 'drakkenheim-core');
  assert.deepEqual(DRAKKENHEIM_MODULE_IDS, ['drakkenheim-core', 'drakkenheim-monsters', 'drakkenheim-scgd']);
  assert.equal(DRAKKENHEIM_SCGD_MODULE_ID, 'drakkenheim-scgd');
  const packs = [journalPack([{id: 'abc', name: 'Appendix C: Contamination', pages: []}])];
  assert.equal(drakkenheimContentActive(drakkenheimGame({active: false})), false);
  assert.equal(drakkenheimContentActive(drakkenheimGame()), true);
  assert.deepEqual(await collectContaminationSections(drakkenheimGame({active: false, packs})), []);
  assert.deepEqual(await collectContaminationSections(drakkenheimGame({packs: [journalPack([{id: 'town', name: 'Emberwood Village', pages: [{name: 'Overview', text: {content: '<p>Unrelated.</p>'}}]}]) ]})), []);
  const broken = journalPack([{id: 'bad', name: 'Contamination', fail: true}]);
  assert.deepEqual(await collectContaminationSections(drakkenheimGame({packs: [broken]})), []);
});

test('contamination levels are read from the drakkenheim-core journal and open that page', async () => {
  const html = '<h3>Level 1</h3><p>Fixture alpha.</p><h3>Level 2</h3><p>Fixture beta.</p>';
  assert.deepEqual(contaminationLevelsFromHTML(html).map(level => level.text), ['Fixture alpha.', 'Fixture beta.']);
  const uuid = 'Compendium.drakkenheim-core.journals.JournalEntry.abc.JournalEntryPage.sym';
  const pack = journalPack([{
    id: 'abc',
    name: 'Appendix C: Contamination',
    pages: [{id: 'sym', name: 'Contamination Symptoms', uuid, text: {content: html}}]
  }]);
  const other = {documentName: 'JournalEntry', collection: 'dnd-players-handbook.journals', metadata: {packageName: 'dnd-players-handbook'}, async getIndex() { throw new Error('wrong pack'); }};
  const sections = await collectContaminationSections(drakkenheimGame({packs: [other, pack]}));
  assert.equal(sections.length, 1);
  assert.equal(sections[0].id, 'drakkenheim-contamination');
  assert.deepEqual(sections[0].items.map(item => item.labelText), ['Level 1', 'Level 2']);
  assert.equal(sections[0].items[0].documentPath, 'drakkenheim-core.journals:Appendix C: Contamination / Contamination Symptoms');
  assert.match(sections[0].items[0].tipHTML, /Fixture alpha/);
  assert.doesNotMatch(sections[0].items.map(item => item.tipHTML).join(' '), /Monstrous Transformation|octarine|hit dice/i);
  setDrakkenheimSections(sections);
  try {
    const rendered = renderCheatSheet();
    assert.match(rendered, /data-cheat-group="drakkenheim"/);
    assert.match(rendered, /gm-cheat-chip--drakkenheim/);
    assert.match(rendered, /data-cheat-origin="drakkenheim"/);
    assert.match(rendered, /data-cheat-document="drakkenheim-core\.journals:Appendix C: Contamination \/ Contamination Symptoms"/);
    assert.match(rendered, new RegExp(`data-id="${uuid.replace(/[.]/g, '\\.')}"`));
  } finally {
    resetDrakkenheimCheat();
  }
  const calls = [];
  const opened = await openDrakkenheimDocument(uuid, 'sym', {fromUuid: async () => ({pages: {get: id => id === 'sym' ? {sheet: {render: async (...args) => calls.push(args)}} : null}})});
  assert.equal(opened, true);
  assert.equal(calls[0][1].pageId, 'sym');
  assert.equal(await openDrakkenheimDocument(uuid, 'sym', {fromUuid: async () => null}), false);
});

test('a missing contamination journal can fall back to the pack roll table', async () => {
  const table = {
    documentName: 'RollTable',
    collection: 'drakkenheim-core.tables',
    metadata: {packageName: 'drakkenheim-core', name: 'tables'},
    async getIndex() { return [{_id: 't1', name: 'Contamination Symptoms'}]; },
    async getDocument() {
      return {id: 't1', name: 'Contamination Symptoms', uuid: 'Compendium.drakkenheim-core.tables.RollTable.t1', results: [{text: 'Level 1', description: 'Table fixture'}]};
    }
  };
  const sections = await collectContaminationSections(drakkenheimGame({packs: [table]}));
  assert.equal(sections[0].items[0].documentPath, 'drakkenheim-core.tables:Contamination Symptoms');
  assert.match(sections[0].items[0].tipHTML, /Table fixture/);
  const source = readFileSync(new URL('../scripts/cheat-sheet-drakkenheim.mjs', import.meta.url), 'utf8');
  const literals = source.match(/(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g) ?? [];
  for (const literal of literals) assert.ok(literal.length < 200, literal.slice(0, 80));
  assert.doesNotMatch(source, /Rampant Mutation|Purge Contamination|Gibbering Mouther/);
  assert.doesNotMatch(source, /morelord-craftworks|hasAccess|getZones|getSkillOptions|contentPacks|monsters-of-drakkenheim/);
});

test('search, values, mutations, and madness stay empty until the pack can supply them', async () => {
  assert.equal(DRAKKENHEIM_MONSTERS_MODULE_ID, 'drakkenheim-monsters');
  assert.equal(pageTopic('Contamination Symptoms'), '');
  assert.equal(pageTopic('Mutations'), 'mutations');
  assert.equal(pageTopic('Madness'), 'madness');
  assert.equal(pageTopic('Searching for Delerium'), 'search');
  assert.equal(pageTopic('Delerium Crystals'), 'values');
  const hidden = journalPack([{id: 'abc', name: 'Mutations', pages: [{name: 'Mutations', text: {content: '<p>Hidden.</p>'}}]}]);
  assert.deepEqual(await collectDrakkenheimSections(drakkenheimGame({active: false, packs: [hidden]})), []);
  const craftworks = drakkenheimGame({active: false, packs: [hidden]});
  craftworks.modules.get = id => id === 'morelord-craftworks'
    ? {active: true, api: {deleriumSearch: {hasAccess: true, getZones: () => [{id: 'outer', name: 'Outer City', dc: 15}]}}}
    : {active: false};
  assert.equal(drakkenheimContentActive(craftworks), false);
  assert.deepEqual(await collectDrakkenheimSections(craftworks), []);
  const broken = drakkenheimGame({packs: [{
    documentName: 'JournalEntry',
    collection: 'drakkenheim-core.journals',
    metadata: {packageName: 'drakkenheim-core', name: 'journals'},
    async getIndex() { return [{_id: 'bad', name: 'Contamination'}]; },
    async getDocument() { throw new Error('missing'); }
  }]});
  assert.deepEqual(await collectDrakkenheimSections(broken), []);
});

test('Drakkenheim chips read search zones from pack documents and ignore Craftworks', async () => {
  const searchHtml = '<p>Use Arcana, Investigation, or Survival.</p><table><tr><th>Area</th><th>DC</th><th>Skills</th></tr><tr><td>Outer City</td><td>DC 15</td><td>Arcana, Investigation, or Survival</td></tr><tr><td>Inner City</td><td>20</td><td>Arcana, Investigation, or Survival</td></tr></table>';
  assert.deepEqual(searchZonesFromHTML(searchHtml).map(zone => [zone.label, zone.dc]), [['Outer City', 15], ['Inner City', 20]]);
  const journal = journalPack([{
    id: 'abc',
    name: 'Appendix C: Contamination',
    pages: [
      {id: 'sym', name: 'Contamination Symptoms', uuid: 'Compendium.journal.sym', text: {content: '<h3>Level 1</h3><p>Fixture alpha.</p>'}},
      {id: 'mut', name: 'Mutations', uuid: 'Compendium.journal.mut', text: {content: '<h3>Fixture Mutation</h3><p>Fixture change.</p><h3>Amorphous Form</h3><p>Once.</p>'}},
      {id: 'mad', name: 'Madness', uuid: 'Compendium.journal.mad', text: {content: '<p>Fixture dread.</p>'}},
      {id: 'search', name: 'Searching for Delerium', uuid: 'Compendium.journal.search', text: {content: searchHtml}}
    ]
  }, {
    id: 'rules',
    name: 'City Rules',
    pages: [{id: 'levels', name: 'Contamination Symptoms', uuid: 'Compendium.journal.levels', text: {content: '<h3>Level 3</h3><p>Fixture gamma.</p>'}}]
  }]);
  const items = {
    documentName: 'Item',
    collection: 'drakkenheim-monsters.items',
    metadata: {packageName: 'drakkenheim-monsters', name: 'items'},
    async getIndex() { return [{_id: 'chip', name: 'Delerium Chip'}, {_id: 'dust', name: 'Delerium Dust'}, {_id: 'other', name: 'Rope'}]; },
    async getDocument(id) {
      if (id === 'chip') return {id, name: 'Delerium Chip', uuid: 'Compendium.item.chip', system: {price: {value: 50, denomination: 'gp'}, description: {value: '<p>Fixture crystal.</p>'}}};
      if (id === 'dust') return {id, name: 'Delerium Dust', system: {}};
      return {id, name: 'Rope', system: {price: {value: 1, denomination: 'gp'}, description: {value: '<p>Not a crystal.</p>'}}};
    }
  };
  const mutations = {
    documentName: 'RollTable',
    collection: 'drakkenheim-core.tables',
    metadata: {packageName: 'drakkenheim-core', name: 'tables'},
    async getIndex() { return [{_id: 'mut', name: 'Mutations'}]; },
    async getDocument() {
      return {id: 'mut', name: 'Mutations', uuid: 'Compendium.table.mut', results: [
        {name: 'Amorphous Form', description: 'Again.'},
        {name: 'Aquatic Adaptation', description: 'Twice.'},
        {name: 'Amorphous Form', description: 'Duplicate.'}
      ]};
    }
  };
  const game = drakkenheimGame({packs: [journal, items, mutations]});
  game.modules.get = id => ({active: DRAKKENHEIM_MODULE_IDS.includes(id)});
  const sections = await collectDrakkenheimSections(game);
  assert.deepEqual(sections.map(section => section.id), ['drakkenheim-contamination', 'drakkenheim-search', 'drakkenheim-values', 'drakkenheim-mutations', 'drakkenheim-madness']);
  assert.equal(sections[0].items[0].documentPath, 'drakkenheim-core.journals:Appendix C: Contamination / Contamination Symptoms');
  assert.ok(sections[0].items.some(item => item.labelText === 'Level 3' && item.documentPath === 'drakkenheim-core.journals:City Rules / Contamination Symptoms'));
  const search = sections.find(section => section.id === 'drakkenheim-search');
  assert.deepEqual(search.items.map(item => item.labelText), ['Inner City', 'Outer City']);
  assert.equal(search.items[0].documentPath, 'drakkenheim-core.journals:Appendix C: Contamination / Searching for Delerium');
  assert.match(search.items.map(item => item.tipHTML).join(' '), /DC 15/);
  assert.match(search.items.map(item => item.tipHTML).join(' '), /DC 20/);
  assert.match(search.items[0].tipHTML, /Arcana, Investigation, or Survival/);
  assert.doesNotMatch(search.items.map(item => item.documentPath).join(' '), /morelord-craftworks/);
  const values = sections.find(section => section.id === 'drakkenheim-values');
  assert.deepEqual(values.items.map(item => item.labelText), ['Delerium Chip']);
  assert.equal(values.items[0].documentPath, 'drakkenheim-monsters.items:Delerium Chip');
  assert.match(values.items[0].tipHTML, /Price: 50 GP/);
  assert.match(values.items[0].tipHTML, /Fixture crystal/);
  const mutationSection = sections.find(section => section.id === 'drakkenheim-mutations');
  assert.deepEqual(mutationSection.items.map(item => item.labelText), ['Amorphous Form', 'Aquatic Adaptation', 'Fixture Mutation']);
  assert.equal(mutationSection.items.filter(item => item.labelText === 'Amorphous Form').length, 1);
  assert.equal(mutationSection.items.find(item => item.labelText === 'Fixture Mutation').documentPath, 'drakkenheim-core.journals:Appendix C: Contamination / Mutations');
  const madness = sections.find(section => section.id === 'drakkenheim-madness');
  assert.match(madness.items[0].tipHTML, /Fixture dread/);
  assert.equal(madness.items[0].documentPath, 'drakkenheim-core.journals:Appendix C: Contamination / Madness');
  setDrakkenheimSections(sections);
  try {
    const html = renderCheatSheet();
    assert.match(html, /data-cheat-section="drakkenheim-search"/);
    assert.match(html, /gm-cheat-chip--drakkenheim/);
    const group = html.indexOf('data-cheat-group="drakkenheim"');
    const mounted = html.indexOf('data-cheat-section="mounted-underwater"');
    const note = html.indexOf('class="gm-cheat-note"');
    assert.ok(group < mounted && mounted < note);
  } finally {
    resetDrakkenheimCheat();
  }
});

test('an inactive Drakkenheim module is not remembered as off', async () => {
  resetDrakkenheimCheat();
  let renders = 0;
  const pack = journalPack([{
    id: 'abc',
    name: 'Contamination',
    pages: [{id: 'sym', name: 'Contamination Symptoms', text: {content: '<h3>Level 1</h3><p>Later.</p>'}}]
  }]);
  scheduleDrakkenheimCheat(() => { renders += 1; }, drakkenheimGame({active: false, packs: [pack]}));
  assert.equal(renders, 0);
  assert.deepEqual(drakkenheimSections(), []);
  scheduleDrakkenheimCheat(() => { renders += 1; }, drakkenheimGame({packs: [pack]}));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(renders, 1);
  assert.equal(drakkenheimSections()[0].items[0].labelText, 'Level 1');
  scheduleDrakkenheimCheat(() => { renders += 1; }, drakkenheimGame({packs: [pack]}));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(renders, 1);
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
