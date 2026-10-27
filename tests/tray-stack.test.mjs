import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installTrayStack, isTrayPopup} from '../scripts/tray-stack.mjs';

const css = readFileSync(new URL('../styles/game-master.css', import.meta.url), 'utf8');

function element(tag, z = '100') {
  return {
    tagName: tag,
    style: {zIndex: String(z)},
    modal: false,
    matches(selector) { return selector === ':modal' && this.modal; }
  };
}

test('the tray layer stays above windows and below tooltips', () => {
  assert.match(css, /--mlgm-window-gap:\s*1000/);
  assert.match(css, /z-index:\s*calc\(var\(--z-index-window\)\s*\+\s*var\(--mlgm-window-gap\)\)/);
  assert.doesNotMatch(css, /z-index:\s*calc\(var\(--z-index-tooltip\)/);
});

test('popups are dialogs, dialog elements, and chat popouts', () => {
  class DialogV2 {}
  class Dialog {}
  class ChatPopout {}
  class FilePicker {}
  class Sheet {}
  const kinds = {DialogV2, Dialog, ChatPopout, FilePicker};
  assert.equal(isTrayPopup(new DialogV2(), kinds), true);
  assert.equal(isTrayPopup(new Dialog(), kinds), true);
  assert.equal(isTrayPopup(new ChatPopout(), kinds), true);
  assert.equal(isTrayPopup(new FilePicker(), kinds), true);
  assert.equal(isTrayPopup(new Sheet(), kinds), false);
  assert.equal(isTrayPopup({constructor: {name: 'ChatPopout'}, options: {tag: 'section'}, element: element('SECTION')}, {}), true);
  assert.equal(isTrayPopup({options: {tag: 'dialog'}, element: element('SECTION')}, {}), true);
  assert.equal(isTrayPopup({options: {tag: 'section'}, element: element('DIALOG')}, {}), true);
  assert.equal(isTrayPopup({options: {tag: 'section'}, element: element('SECTION')}, {}), false);
});

test('dialogs and chat popouts stack above the tray and focused windows stay below it', () => {
  const vars = {'--z-index-window': '100', '--z-index-tooltip': '9999'};
  const documentElement = {};
  const root = element('ASIDE', '1100');
  const view = {
    getComputedStyle(node) {
      if (node === documentElement) return {zIndex: 'auto', getPropertyValue: name => vars[name] ?? ''};
      return {zIndex: node.style?.zIndex ?? 'auto', getPropertyValue: () => ''};
    }
  };
  const hooks = {};
  const calls = [];
  hooks.on = (name, fn) => { calls.push([name, fn]); };
  class ApplicationV2 {
    static _maxZ = 100;
    constructor(tag = 'section') {
      this.element = element(tag);
      this.position = {zIndex: 100};
      this.options = {tag};
    }
    bringToFront() { bump(this); }
    setPosition(position = {}) {
      Object.assign(this.position, position);
      if (position.zIndex != null) this.element.style.zIndex = String(position.zIndex);
    }
  }
  class DialogV2 extends ApplicationV2 {}
  class ChatPopout extends ApplicationV2 {}
  class FilePicker extends ApplicationV2 {}
  class RollDialog extends ApplicationV2 {
    constructor() {
      super('dialog');
      this.options = {tag: 'dialog'};
      this.element = element('DIALOG');
    }
  }
  class Application {
    constructor() {
      this.element = element('DIV');
      this.position = {zIndex: 100};
      this.options = {};
    }
    bringToTop() { bump(this); }
    setPosition() {}
  }
  class Dialog extends Application {}
  const env = {
    _maxZ: 100,
    document: {documentElement, defaultView: view},
    Hooks: hooks,
    ui: {windows: {}},
    foundry: {
      applications: {
        api: {ApplicationV2, DialogV2},
        sidebar: {apps: {ChatPopout}},
        apps: {FilePicker},
        instances: new Map()
      },
      appv1: {api: {Application, Dialog}}
    }
  };
  function bump(app) {
    const current = Number(app.element.style.zIndex) || 0;
    const next = Math.max(ApplicationV2._maxZ, env._maxZ, current) + 1;
    ApplicationV2._maxZ = next;
    env._maxZ = next;
    app.position.zIndex = next;
    app.element.style.zIndex = String(next);
  }
  const z = app => Number(app.element.style.zIndex);
  const sheet = new ApplicationV2();
  const waiting = new RollDialog();
  env.foundry.applications.instances.set('sheet', sheet);
  env.foundry.applications.instances.set('roll', waiting);
  assert.equal(installTrayStack(root, env), true);
  assert.deepEqual(calls.map(([name]) => name), ['renderApplicationV2', 'renderApplication']);
  assert.ok(z(sheet) < 1100, 'an open sheet stays below the tray');
  assert.ok(z(waiting) > 1100 && z(waiting) < 9999, 'an open roll dialog is raised below tooltips');

  sheet.bringToFront();
  const sheetZ = z(sheet);
  assert.ok(sheetZ < 1100);
  waiting.bringToFront();
  const rollZ = z(waiting);
  const dialog = new DialogV2();
  dialog.bringToFront();
  const chat = new ChatPopout();
  chat.bringToFront();
  const legacy = new Dialog();
  legacy.bringToTop();
  const picker = new FilePicker();
  picker.bringToFront();
  assert.ok(rollZ > 1100 && z(dialog) > rollZ && z(chat) > z(dialog) && z(legacy) > z(chat) && z(picker) > z(legacy));
  assert.ok(z(legacy) < 9999);
  dialog.bringToFront();
  assert.ok(z(dialog) > z(legacy), 'focusing a dialog brings it to the front of the popup band');
  sheet.bringToFront();
  assert.ok(z(sheet) > sheetZ && z(sheet) < 1100, 'focusing a window keeps it in the window band');
  assert.ok(z(dialog) > 1100, 'the dialog stays above the tray');
  assert.ok(ApplicationV2._maxZ < 1100 && env._maxZ < 1100, 'the shared counter returns to the window band');

  const modal = new DialogV2();
  modal.element.modal = true;
  modal.bringToFront();
  assert.ok(z(modal) < 1100, 'a native modal stays out of the popup band');
  assert.ok(ApplicationV2._maxZ < 1100);

  dialog.setPosition({zIndex: 40});
  assert.ok(z(dialog) > 1100, 'repositioning a dialog keeps it above the tray');
  sheet.setPosition({zIndex: 5000});
  assert.ok(z(sheet) < 1100, 'a window position above the tray is put back under it');
  assert.ok(z(dialog) > z(sheet));
});
