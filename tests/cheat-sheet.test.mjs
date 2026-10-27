import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CHEAT_SECTIONS, cheatStringEntries} from '../scripts/cheat-sheet-data.mjs';
import {activateCheatTooltip, cheatChipClass, cheatTooltipHTML, deactivateCheatTooltip, renderCheatSheet} from '../scripts/cheat-sheet.mjs';
import {DRAKKENHEIM_CONDITIONS, DRAKKENHEIM_CORE_MODULE_ID, DRAKKENHEIM_ITEMS, DRAKKENHEIM_MODULE_IDS, DRAKKENHEIM_MONSTERS_MODULE_ID, DRAKKENHEIM_SCGD_MODULE_ID, debugDrakkenheimCheat, drakkenheimConditions, drakkenheimContentActive, drakkenheimItems, drakkenheimStatus} from '../scripts/cheat-sheet-drakkenheim.mjs';

const section = id => CHEAT_SECTIONS.find(entry => entry.id === id);
const item = (group, id) => group.items.find(entry => entry.id === id);
function text(entry) {
  const chunks = [];
  const take = block => {
    if (block.heading) chunks.push(block.heading);
    chunks.push(...(block.lines ?? []));
    chunks.push(...(block.table?.rows ?? []).flat());
  };
  if (entry.parts?.length) for (const part of entry.parts) take(part);
  else take(entry);
  return chunks.join(' ');
}

test('the cheat sheet has every SRD 5.2 section and the required items', () => {
  assert.deepEqual(CHEAT_SECTIONS.map(entry => entry.id), ['conditions', 'actions', 'damage', 'misc', 'cover']);
  const ids = CHEAT_SECTIONS.flatMap(entry => entry.items.map(entryItem => entryItem.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const entry of CHEAT_SECTIONS) {
    assert.ok(entry.title.trim());
    for (const entryItem of entry.items) {
      assert.ok(entryItem.label.trim());
      assert.ok((entryItem.lines?.length ?? 0) > 0 || entryItem.table?.rows?.length || entryItem.parts?.length);
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
  assert.match(suffocating, /Exhaustion levels you gained from suffocating/);
  const drowning = text(item(section('damage'), 'drowning'));
  assert.match(drowning, /cannot breathe while underwater/);
  assert.match(drowning, /Suffocating/);
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

test('misc follows improvising damage, and Drakkenheim follows cover when a content module is active', () => {
  globalThis.game = {modules: {get: id => ({active: id === 'drakkenheim-core'})}};
  try {
    const html = renderCheatSheet();
    const damage = html.indexOf('data-cheat-section="damage"');
    const misc = html.indexOf('data-cheat-section="misc"');
    const cover = html.indexOf('data-cheat-section="cover"');
    const group = html.indexOf('data-cheat-section="drakkenheim"');
    assert.ok(damage < misc && misc < cover && cover < group);
    assert.equal(html.indexOf('class="gm-cheat-note"'), -1);
    assert.match(html, /data-cheat-section="misc" open/);
    for (const label of ['Typical DC', 'Exhaustion', 'Jumping', 'Travel Pace', 'Mounted', 'Underwater', 'Contamination', 'Delerium Search', 'Delerium']) assert.match(html, new RegExp(`>${label}<`));
    assert.doesNotMatch(html, />Level [1-6]</);
    assert.doesNotMatch(html, /data-cheat-section="(?:dcs|exhaustion|jumping|travel|mounted-underwater|drakkenheim-mutations|drakkenheim-madness)"/);
    assert.doesNotMatch(html, /creativecommons|unofficial|Loading…|Drakkenheim Madness|New Conditions/);
  } finally {
    delete globalThis.game;
  }
});

test('exhaustion uses the SRD 5.2 cumulative penalties', () => {
  const rule = text(item(section('misc'), 'exhaustion'));
  assert.match(rule, /-2/);
  assert.match(rule, /-5 ft/);
  assert.match(rule, /You die/);
  assert.match(rule, /A Long Rest removes 1 level/);
  assert.doesNotMatch(rule, /Hit point maximum halved|Speed halved|Disadvantage on ability checks/);
  const html = cheatTooltipHTML(item(section('misc'), 'exhaustion'));
  assert.match(html, /mlgm-cheat-tip__title/);
  assert.match(html, /<table>/);
  assert.match(html, /mlgm-cheat-tip__sub">\s*<strong>Recovery<\/strong>/);
});

test('the cheat sheet tab has no license line and no rules-version switch', () => {
  const source = ['cheat-sheet-data.mjs', 'cheat-sheet.mjs', 'cheat-sheet-drakkenheim.mjs'].map(name => readFileSync(new URL(`../scripts/${name}`, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(source, /rulesVersion|\b2014\b|\blegacy\b|SRD 5\.1/);
  assert.doesNotMatch(renderCheatSheet(), /gm-cheat-note|creativecommons|unofficial|Wizards of the Coast/);
  assert.doesNotMatch(source, /CHEAT_ATTRIBUTION|gm-cheat-note/);
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
  assert.doesNotMatch(html, /creativecommons|gm-cheat-note|unofficial/);
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

test('misc tooltips use a title, subheadings, and terse lines', () => {
  for (const entry of section('misc').items) {
    const html = cheatTooltipHTML(entry);
    assert.match(html, new RegExp(`mlgm-cheat-tip__title[\\s\\S]*<strong>${entry.label}</strong>`), entry.id);
    assert.doesNotMatch(html, /<li>[^<]*(?:Long jump|High jump|Very easy|Fast|Controlled|Melee)\./, entry.id);
    const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.ok(plain.length < 1100, `${entry.id} tooltip is ${plain.length} characters`);
  }
  const jumping = cheatTooltipHTML(item(section('misc'), 'jumping'));
  assert.match(jumping, /mlgm-cheat-tip__sub">\s*<strong>Long jump<\/strong>/);
  assert.match(jumping, /mlgm-cheat-tip__sub">\s*<strong>High jump<\/strong>/);
  assert.equal((jumping.match(/Costs movement/g) ?? []).length, 1);
  assert.doesNotMatch(jumping, /<li>[^<]*Long jump/);
  const travel = cheatTooltipHTML(item(section('misc'), 'travel'));
  assert.match(travel, /mlgm-cheat-tip__sub">\s*<strong>Fast<\/strong>/);
  assert.match(travel, /mlgm-cheat-tip__sub">\s*<strong>Normal<\/strong>/);
  assert.match(travel, /mlgm-cheat-tip__sub">\s*<strong>Slow<\/strong>/);
});

function drakkenheimGame({active = true} = {}) {
  const ids = active ? [...DRAKKENHEIM_MODULE_IDS] : [];
  return {modules: {get(id) { return {active: ids.includes(id)}; }}};
}

test('static Drakkenheim chips stay hidden until a content module is active', () => {
  assert.equal(DRAKKENHEIM_CORE_MODULE_ID, 'drakkenheim-core');
  assert.equal(DRAKKENHEIM_MONSTERS_MODULE_ID, 'drakkenheim-monsters');
  assert.equal(DRAKKENHEIM_SCGD_MODULE_ID, 'drakkenheim-scgd');
  assert.deepEqual(DRAKKENHEIM_MODULE_IDS, ['drakkenheim-core', 'drakkenheim-monsters', 'drakkenheim-scgd']);
  assert.equal(drakkenheimContentActive(drakkenheimGame({active: false})), false);
  assert.equal(drakkenheimStatus(drakkenheimGame({active: false})), 'off');
  assert.deepEqual(drakkenheimConditions(drakkenheimGame({active: false})), []);
  assert.deepEqual(drakkenheimItems(drakkenheimGame({active: false})), []);
  assert.equal(drakkenheimContentActive(drakkenheimGame()), true);
  assert.equal(drakkenheimStatus(drakkenheimGame()), 'ready');
  assert.deepEqual(drakkenheimItems(drakkenheimGame()).map(entry => entry.label), [
    'Contamination', 'Delerium Search', 'Delerium'
  ]);
  assert.deepEqual(drakkenheimConditions(drakkenheimGame()).map(entry => entry.label), [
    'Addled', 'Bewildered', 'Bleeding', 'Bloodied', 'Burning', 'Clumsy', 'Dazed', 'Defenseless', 'Distracted', 'Enfeebled', 'Entangled', 'Frozen', 'Helpless', 'Immobilized', 'Jinxed', 'Shocked', 'Sickened', 'Slowed', 'Staggered', 'Valor', 'Weakened'
  ]);
  assert.deepEqual(DRAKKENHEIM_CONDITIONS.map(entry => entry.label).includes('Drakkenheim Madness'), false);
  assert.deepEqual(DRAKKENHEIM_ITEMS.map(entry => entry.label).includes('New Conditions'), false);
});

test('static Drakkenheim tooltips are short, ordered, and free of pack markup', () => {
  const contamination = cheatTooltipHTML(DRAKKENHEIM_ITEMS.find(entry => entry.id === 'dk-contamination'));
  assert.match(contamination, /mlgm-cheat-tip__title[\s\S]*<strong>Contamination<\/strong>/);
  assert.match(contamination, /<table>/);
  assert.match(contamination, /No other symptom/);
  assert.match(contamination, /You become a monster the GM controls/);
  assert.equal((contamination.match(/<tr>/g) ?? []).length, 7);
  const search = cheatTooltipHTML(DRAKKENHEIM_ITEMS.find(entry => entry.id === 'dk-search'));
  assert.match(search, /mlgm-cheat-tip__sub">\s*<strong>Outside the wall<\/strong>/);
  assert.match(search, /DC 15 Arcana, Investigation, or Survival/);
  assert.match(search, /mlgm-cheat-tip__sub">\s*<strong>Inside the wall<\/strong>/);
  assert.match(search, /DC 20/);
  assert.match(search, /mlgm-cheat-tip__sub">\s*<strong>Failed checks<\/strong>/);
  assert.match(search, /Two or more failed checks draw a random encounter/);
  assert.doesNotMatch(search, /@Embed|&amp;reference|\[\[lookup|Deep Haze/);
  const values = text(DRAKKENHEIM_ITEMS.find(entry => entry.id === 'dk-delerium'));
  assert.match(values, /Chip 10 gp 1\/4 lb Fragment 100 gp 1\/2 lb Shard 500 gp 1 lb Crystal 1,000 gp 2 lb Geode 5,000 gp 20\+ lb/);
  for (const entry of [...DRAKKENHEIM_CONDITIONS, ...DRAKKENHEIM_ITEMS]) {
    const html = cheatTooltipHTML(entry);
    assert.match(html, /mlgm-cheat-tip__title/);
    assert.doesNotMatch(html, /@Embed|&amp;reference|\[\[lookup/);
    assert.ok(html.replace(/<[^>]+>/g, '').length < 700, entry.id);
  }
  const source = readFileSync(new URL('../scripts/cheat-sheet-drakkenheim.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fromUuid|@Embed|morelord-craftworks|collectDrakkenheim|Rampant Mutation|Gibbering Mouther/);
});

test('an active module shows the static Drakkenheim section and purple conditions', () => {
  globalThis.game = drakkenheimGame();
  try {
    const html = renderCheatSheet();
    assert.match(html, /data-cheat-section="drakkenheim"/);
    assert.match(html, /data-cheat-status="ready"/);
    assert.doesNotMatch(html, /data-cheat-loading|Loading…|gm-cheat-note/);
    const conditions = html.slice(html.indexOf('data-cheat-section="conditions"'), html.indexOf('data-cheat-section="actions"'));
    assert.match(conditions, /gm-cheat-chip--drakkenheim/);
    for (const label of ['Addled', 'Bewildered', 'Dazed', 'Weakened', 'Valor']) assert.match(conditions, new RegExp(`>${label}<`));
    assert.doesNotMatch(html, /Drakkenheim Madness|New Conditions|Amorphous/);
    const report = debugDrakkenheimCheat(globalThis.game);
    assert.equal(report.status, 'ready');
    assert.ok(report.chips.some(chip => chip.label === 'Delerium'));
    assert.equal(html.indexOf('data-cheat-section="drakkenheim"') < html.length, true);
  } finally {
    delete globalThis.game;
  }
  assert.equal(debugDrakkenheimCheat(drakkenheimGame({active: false})).status, 'off');
});

test('the tray adds Cheat Sheet after Triggers and does not register a new setting', () => {
  const main = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  assert.match(main, /triggers: "Triggers", cheat: "Cheat Sheet", settings: "GM Settings", party: "Player Settings"/);
  assert.match(main, /return renderCheatSheet\(\{order: trayLayout\(\)\.cheatOrder, hidden: trayLayout\(\)\.cheatHidden\}\)/);
  assert.match(main, /focusin/);
  assert.match(main, /activateCheatTooltip/);
  assert.match(main, /debugDrakkenheimCheat/);
  assert.doesNotMatch(main, /scheduleDrakkenheimCheat|cheat-document|stopDrakkenheimCheat/);
  const calls = [...main.matchAll(/game\.settings\.register\((?:(?!game\.settings\.register)[\s\S])*?\);/g)].map(match => match[0]);
  assert.equal(calls.length, 9);
  assert.match(main, /register\(ID, "trayLayout"/);
});

test('cheat sections follow the saved order and skip hidden ones', () => {
  globalThis.game = drakkenheimGame();
  try {
    const html = renderCheatSheet({order: ['drakkenheim', 'conditions'], hidden: ['misc', 'cover', 'damage', 'actions']});
    assert.ok(html.indexOf('data-cheat-section="drakkenheim"') < html.indexOf('data-cheat-section="conditions"'));
    assert.doesNotMatch(html, /data-cheat-section="(?:misc|cover|damage|actions)"/);
  } finally {
    delete globalThis.game;
  }
});
