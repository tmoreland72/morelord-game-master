import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {percentIssue, submitDialog, warnDialog} from '../scripts/dialog.mjs';

test('a dialog warning focuses the field and does not close the dialog', async () => {
  const warnings = [];
  globalThis.ui = {notifications: {warn(message) { warnings.push(message); }}};
  const name = {focused: false, focus() { this.focused = true; }};
  const form = {querySelector(selector) { return selector === '[name="name"]' ? name : null; }};
  assert.equal(warnDialog(form, 'name', 'Name your ambience before adding it.'), false);
  assert.deepEqual(warnings, ['Name your ambience before adding it.']);
  assert.equal(name.focused, true);
  assert.deepEqual(percentIssue(''), {field: 'volume', message: 'Volume must be between 0 and 100.'});
  assert.equal(percentIssue(40), null);
  assert.deepEqual(percentIssue(101, 'volume2'), {field: 'volume2', message: 'Volume must be between 0 and 100.'});

  let submitted = false;
  let closed = false;
  const held = {
    options: {
      buttons: {add: {action: 'add', async callback() { return false; }}},
      submit() { submitted = true; },
      form: {closeOnSubmit: true}
    },
    close() { closed = true; }
  };
  assert.equal(await submitDialog(held, {dataset: {action: 'add'}}, {preventDefault() {}}), held);
  assert.equal(submitted, false);
  assert.equal(closed, false);

  const accepted = {action: 'add', data: {name: 'Village near church'}};
  let result;
  const dialog = {
    options: {
      buttons: {add: {action: 'add', callback: () => accepted}},
      submit(value) { result = value; },
      form: {}
    },
    close() { closed = true; return this; }
  };
  await submitDialog(dialog, {dataset: {action: 'add'}}, {preventDefault() {}});
  assert.equal(result, accepted);
  assert.equal(closed, true);

  const source = readFileSync(new URL('../scripts/main.mjs', import.meta.url), 'utf8');
  const playlist = source.slice(source.indexOf('async function playlistForm'), source.indexOf('async function ambienceForm'));
  const ambience = source.slice(source.indexOf('async function ambienceForm'), source.indexOf('export async function requestCheck'));
  const verify = source.slice(source.indexOf('async function verifyCharacters'), source.indexOf('async function encounter'));
  assert.match(playlist, /Choose a playlist/);
  assert.match(playlist, /percentIssue\(data\.get\("volume"\)\)/);
  assert.doesNotMatch(playlist, /throw new Error\("Choose a playlist/);
  assert.match(ambience, /field: "name"/);
  assert.match(verify, /Select at least one character/);
  assert.doesNotMatch(verify, /throw new Error\("Select at least one character/);
  const smithy = readFileSync(new URL('../scripts/smithy-at-the-scar.mjs', import.meta.url), 'utf8');
  assert.match(smithy, /Choose an NPC actor for each enemy/);
  assert.match(smithy, /Choose an inset from 0 to 10 squares/);
  assert.doesNotMatch(smithy.slice(smithy.indexOf('async function setup'), smithy.indexOf('export function combatUsesScene')), /throw Error\('Choose/);
});
