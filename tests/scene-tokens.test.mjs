import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  collectSceneTokens, displayModeChoices, dispositionChoices, planSceneTokenChanges,
  sceneTokenScopeChoice, sceneTokenSpec, sceneTokenUpdate, tooltipHTML, visionChoices
} from '../scripts/scene-tokens.mjs';

const dispositions = {FRIENDLY: 1, NEUTRAL: 0, HOSTILE: -1, SECRET: -2};
const modes = {ALWAYS: 50, CONTROL: 10, HOVER: 30, NONE: 0, OWNER: 40, OWNER_HOVER: 20};

test('scene token choices use Foundry v14 disposition and display mode values', () => {
  assert.deepEqual(dispositionChoices(dispositions).map(choice => [choice.key, choice.value, choice.label]), [
    ['FRIENDLY', 1, 'Friendly'],
    ['NEUTRAL', 0, 'Neutral'],
    ['HOSTILE', -1, 'Hostile'],
    ['SECRET', -2, 'Secret']
  ]);
  assert.deepEqual(displayModeChoices(modes).map(choice => [choice.key, choice.value]), [
    ['NONE', 0], ['CONTROL', 10], ['OWNER_HOVER', 20], ['HOVER', 30], ['OWNER', 40], ['ALWAYS', 50]
  ]);
  assert.deepEqual(displayModeChoices(modes).map(choice => choice.label), [
    'Never Displayed', 'When Controlled', 'Hovered by Owner', 'Hovered by Anyone', 'Always for Owner', 'Always for Everyone'
  ]);
  globalThis.game = {i18n: {localize: key => key === 'TOKEN.DISPLAY_ALWAYS' ? 'Toujours' : key}};
  assert.equal(displayModeChoices(modes).find(choice => choice.key === 'ALWAYS').label, 'Toujours');
  delete globalThis.game;
  assert.deepEqual(visionChoices().map(choice => [choice.key, choice.value]), [['on', true], ['off', false]]);
  assert.equal(sceneTokenScopeChoice('selected'), 'selected');
  assert.equal(sceneTokenScopeChoice('party'), 'all');
});

test('a scene token action plans one batch and skips tokens that already match', () => {
  const friendly = sceneTokenSpec('disposition', 'FRIENDLY', {dispositions});
  assert.equal(friendly.field, 'disposition');
  assert.equal(friendly.value, 1);
  const tokens = [
    {id: 'a', name: 'Ada', disposition: -1, sight: {enabled: false, range: 30}},
    {id: 'a', name: 'Duplicate', disposition: 0},
    {id: 'b', name: 'Bee', disposition: 1, displayBars: 0, displayName: 50, sight: {enabled: true, range: 15}}
  ];
  const rows = planSceneTokenChanges(tokens, friendly.field, friendly.value);
  assert.deepEqual(rows.map(row => [row.id, row.skipped]), [['a', false], ['b', true]]);
  assert.deepEqual(sceneTokenUpdate('a', 'disposition', 1), {_id: 'a', disposition: 1});
  const vision = sceneTokenSpec('vision', 'off');
  assert.equal(vision.field, 'sight.enabled');
  assert.equal(vision.value, false);
  assert.deepEqual(sceneTokenUpdate('a', vision.field, false), {_id: 'a', sight: {enabled: false}});
  assert.equal(planSceneTokenChanges(tokens, vision.field, false).find(row => row.id === 'a').skipped, true);
  assert.equal(planSceneTokenChanges(tokens, vision.field, true).find(row => row.id === 'b').skipped, true);
  const bars = sceneTokenSpec('bars', 'HOVER', {displayModes: modes});
  assert.equal(bars.field, 'displayBars');
  assert.equal(bars.value, 30);
  assert.equal(sceneTokenSpec('name', 'ALWAYS', {displayModes: modes}).field, 'displayName');
  assert.equal(sceneTokenSpec('disposition', 'SECRET', {dispositions}).value, -2);
  assert.equal(sceneTokenSpec('bars', 'missing', {displayModes: modes}), null);
  assert.equal(sceneTokenSpec('other', 'on'), null);
});

test('all tokens and selected tokens come from the current scene', () => {
  const scene = {id: 'scene', tokens: [{id: 'wolf', name: 'Wolf', disposition: -1}, {id: 'ada', name: 'Ada', disposition: 1}]};
  const all = collectSceneTokens('all', {scene, controlled: []});
  assert.deepEqual(all.tokens.map(token => token.id), ['wolf', 'ada']);
  const selected = collectSceneTokens('selected', {scene, controlled: [{document: scene.tokens[0]}, {id: 'other', name: 'Elsewhere'}]});
  assert.deepEqual(selected.tokens.map(token => token.id), ['wolf']);
  assert.deepEqual(collectSceneTokens('selected', {scene, controlled: []}).tokens, []);
  assert.equal(collectSceneTokens('all', {}).missingScene, true);
});

test('scene token tooltips use a bold title and short bullets', () => {
  const html = tooltipHTML('Disposition', ['Sets each token\'s disposition.', 'Friendly, Neutral, Hostile, and Secret.']);
  assert.match(html, /<p class="mlgm-cheat-tip__title"><strong>Disposition<\/strong><\/p>/);
  assert.match(html, /<ul><li>Sets each token&#39;s disposition\.<\/li><li>Friendly, Neutral, Hostile, and Secret\.<\/li><\/ul>/);
  const bulk = readFileSync(new URL('../scripts/bulk-actions.mjs', import.meta.url), 'utf8');
  const handler = bulk.slice(bulk.indexOf("channel.on('sceneTokens'"), bulk.indexOf("channel.on('undo'"));
  assert.match(handler, /updateEmbeddedDocuments\('Token', updates\)/);
  assert.equal(handler.match(/updateEmbeddedDocuments/g).length, 1);
  assert.match(handler, /warning: bulkText/);
  assert.match(handler, /kind: 'sceneTokens'/);
  const restore = bulk.slice(bulk.indexOf("snapshot.kind === 'sceneTokens'"), bulk.indexOf("throw Error(bulkText('undo.unknown'))"));
  assert.match(restore, /updateEmbeddedDocuments\('Token', updates\)/);
  const card = bulk.slice(bulk.indexOf('function sceneTokenContent'), bulk.indexOf('function rememberedSceneToken'));
  assert.match(card, /<strong class="gm-specialty-title">/);
  assert.match(card, /sceneTokens\.target/);
  assert.match(card, /class="gm-specialty-field"/);
  assert.match(card, /data-tooltip-class="mlgm-cheat-tip"/);
  assert.match(card, /data-tooltip-html="/);
  assert.match(card, /sceneTokens\.apply/);
  assert.match(card, /class="gm-specialty-row"/);
});
