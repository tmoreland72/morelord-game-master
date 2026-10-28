import {escapeHTML} from './core.mjs';

// Foundry v14 TokenData. disposition is CONST.TOKEN_DISPOSITIONS.
// displayBars and displayName are CONST.TOKEN_DISPLAY_MODES.
// Vision is TokenSightData.enabled. A nested sight update merges, so range and angle stay.
// https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.TokenData.html
// https://foundryvtt.com/api/v14/variables/CONST.TOKEN_DISPOSITIONS.html
// https://foundryvtt.com/api/v14/variables/CONST.TOKEN_DISPLAY_MODES.html
// https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.TokenSightData.html

export const DISPOSITION_KEYS = ['FRIENDLY', 'NEUTRAL', 'HOSTILE', 'SECRET'];
const DISPOSITION_VALUES = {FRIENDLY: 1, NEUTRAL: 0, HOSTILE: -1, SECRET: -2};
const DISPOSITION_LABELS = {FRIENDLY: 'Friendly', NEUTRAL: 'Neutral', HOSTILE: 'Hostile', SECRET: 'Secret'};

export const DISPLAY_MODE_KEYS = ['NONE', 'CONTROL', 'OWNER_HOVER', 'HOVER', 'OWNER', 'ALWAYS'];
const DISPLAY_MODE_VALUES = {NONE: 0, CONTROL: 10, OWNER_HOVER: 20, HOVER: 30, OWNER: 40, ALWAYS: 50};
const DISPLAY_MODE_LABELS = {
  NONE: 'Never Displayed',
  CONTROL: 'When Controlled',
  OWNER_HOVER: 'Hovered by Owner',
  HOVER: 'Hovered by Anyone',
  OWNER: 'Always for Owner',
  ALWAYS: 'Always for Everyone'
};

export function sceneTokenScopeChoice(value) {
  return value === 'selected' ? 'selected' : 'all';
}

export function foundryLabel(key, fallback) {
  try {
    const text = globalThis.game?.i18n?.localize?.(key);
    if (text && text !== key) return text;
  } catch { /* The English label remains. */ }
  return fallback;
}

export function dispositionChoices(table = globalThis.CONST?.TOKEN_DISPOSITIONS) {
  const source = table ?? DISPOSITION_VALUES;
  return DISPOSITION_KEYS.filter(key => Number.isInteger(source[key])).map(key => ({
    key,
    value: source[key],
    label: foundryLabel(`TOKEN.DISPOSITION.${key}`, DISPOSITION_LABELS[key])
  }));
}

export function displayModeChoices(table = globalThis.CONST?.TOKEN_DISPLAY_MODES) {
  const source = table ?? DISPLAY_MODE_VALUES;
  return DISPLAY_MODE_KEYS.filter(key => Number.isInteger(source[key]))
    .map(key => ({
      key,
      value: source[key],
      label: foundryLabel(`TOKEN.DISPLAY_${key}`, DISPLAY_MODE_LABELS[key])
    }))
    .sort((left, right) => left.value - right.value || left.key.localeCompare(right.key));
}

export function visionChoices() {
  return [
    {key: 'on', value: true, label: 'Enable'},
    {key: 'off', value: false, label: 'Disable'}
  ];
}

export function sceneTokenSpec(action, rawValue, constants = {}) {
  if (action === 'disposition') {
    const choice = dispositionChoices(constants.dispositions).find(item => item.key === rawValue);
    return choice ? {action, field: 'disposition', value: choice.value, label: choice.label, labelKey: 'sceneTokens.disposition'} : null;
  }
  if (action === 'vision') {
    const choice = visionChoices().find(item => item.key === rawValue);
    return choice ? {action, field: 'sight.enabled', value: choice.value, label: choice.label, labelKey: 'sceneTokens.vision'} : null;
  }
  if (action === 'bars' || action === 'name') {
    const choice = displayModeChoices(constants.displayModes).find(item => item.key === rawValue);
    if (!choice) return null;
    return {action, field: action === 'bars' ? 'displayBars' : 'displayName', value: choice.value, label: choice.label, labelKey: action === 'bars' ? 'sceneTokens.bars' : 'sceneTokens.name'};
  }
  return null;
}

export function readSceneTokenField(token, field) {
  if (field === 'sight.enabled') return token?.sight?.enabled === true;
  return token?.[field];
}

export function sceneTokenUpdate(id, field, value) {
  if (field === 'sight.enabled') return {_id: id, sight: {enabled: value === true}};
  return {_id: id, [field]: value};
}

export function planSceneTokenChanges(tokens, field, value) {
  const seen = new Set();
  const rows = [];
  for (const token of tokens ?? []) {
    const id = token?.id || token?._id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const before = readSceneTokenField(token, field);
    rows.push({id, name: token.name || id, before, skipped: Object.is(before, value)});
  }
  return rows;
}

export function collectSceneTokens(scope, {scene, controlled = []} = {}) {
  const choice = sceneTokenScopeChoice(scope);
  if (!scene) return {scene: null, tokens: [], missingScene: true};
  const embedded = [...(scene.tokens?.contents ?? scene.tokens ?? [])].filter(Boolean);
  const onScene = new Set(embedded.map(token => token.id || token._id).filter(Boolean));
  const pool = choice === 'selected'
    ? controlled.map(token => token?.document ?? token).filter(token => onScene.has(token?.id || token?._id))
    : embedded;
  const seen = new Set();
  const tokens = [];
  for (const token of pool) {
    const id = token?.id || token?._id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    tokens.push(token);
  }
  return {scene, tokens, missingScene: false};
}

export function tooltipHTML(title, lines) {
  const items = (lines ?? []).map(line => `<li>${escapeHTML(line)}</li>`).join('');
  return `<div class="mlgm-cheat-tip__body"><p class="mlgm-cheat-tip__title"><strong>${escapeHTML(title)}</strong></p><ul>${items}</ul></div>`;
}
