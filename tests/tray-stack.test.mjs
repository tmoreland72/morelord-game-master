import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installTrayStack, isTrayPopup, resolveStackElement} from '../scripts/tray-stack.mjs';

const css = readFileSync(new URL('../styles/game-master.css', import.meta.url), 'utf8');

function element(tag, z = '100') {
  return {
    nodeType: 1,
    tagName: tag,
    style: {zIndex: String(z)},
    modal: false,
    matches(selector) { return selector === ':modal' && this.modal; }
  };
}

test('the tray layer stays above windows and below tooltips', () => {
  assert.match(css, /--mlgm-window-gap:\s*1000/);
  assert.match(css, /z-index:\s*calc\(var\(--z-index-window\)\s*\+\s*var\(--mlgm-window-gap\)\)/);
  assert.match(css, /body > dialog\.roll-configuration \{ z-index: calc\(var\(--z-index-window\) \+ 1001\) !important; \}/);
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
  class Dialog5e {}
  class RollConfigurationDialog extends Dialog5e {}
  class RollResolver {}
  assert.equal(isTrayPopup(new RollConfigurationDialog(), {}), true);
  assert.equal(isTrayPopup(new RollResolver(), {}), true);
  assert.equal(isTrayPopup({options: {tag: 'section', classes: ['roll-configuration']}, element: element('SECTION')}, {}), true);
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
  const hookNames = calls.map(([name]) => name);
  assert.ok(hookNames.includes('renderApplicationV2'));
  assert.ok(hookNames.includes('renderRollConfigurationDialog'));
  assert.ok(hookNames.includes('renderD20RollConfigurationDialog'));
  assert.ok(hookNames.includes('renderAttackRollConfigurationDialog'));
  assert.ok(hookNames.includes('renderDamageRollConfigurationDialog'));
  assert.ok(hookNames.includes('renderSkillToolRollConfigurationDialog'));
  assert.equal(hookNames.includes('renderBasicRollConfigurationDialog'), false);
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

test('a roll configuration dialog opened inside a sheet is moved above the tray', () => {
  const vars = {'--z-index-window': '100', '--z-index-tooltip': '9999'};
  const documentElement = {};
  const root = element('ASIDE', '1100');
  const view = {
    getComputedStyle(node) {
      if (node === documentElement) return {zIndex: 'auto', position: 'static', getPropertyValue: name => vars[name] ?? ''};
      return {zIndex: node.style?.zIndex ?? 'auto', position: node.style?.position || 'absolute', getPropertyValue: () => ''};
    }
  };
  const body = {append(node) { node.parentElement = body; }};
  class ApplicationV2 {
    static _maxZ = 100;
    constructor(tag = 'section') {
      this.element = element(tag);
      this.position = {zIndex: 100};
      this.options = {tag};
    }
    bringToFront() {}
    setPosition() {}
  }
  class Dialog5e extends ApplicationV2 {}
  class RollConfigurationDialog extends Dialog5e {
    constructor() {
      super('section');
      this.options = {tag: 'section', classes: ['roll-configuration']};
      this.element = element('SECTION', '40');
      this.element.parentElement = element('SECTION', '150');
      this.element.ownerDocument = {body, defaultView: view};
      this.element.classList = {contains: name => name === 'roll-configuration'};
    }
  }
  class RollResolver extends ApplicationV2 {
    constructor() {
      super('section');
      this.options = {tag: 'section'};
      this.element = element('SECTION', '40');
    }
  }
  const env = {
    _maxZ: 100,
    document: {documentElement, defaultView: view, body},
    Hooks: {on() {}},
    ui: {windows: {}},
    foundry: {applications: {api: {ApplicationV2}, instances: new Map()}}
  };
  const roll = new RollConfigurationDialog();
  const resolver = new RollResolver();
  env.foundry.applications.instances.set('roll', roll);
  env.foundry.applications.instances.set('resolver', resolver);
  assert.equal(installTrayStack(root, env), true);
  assert.equal(roll.element.parentElement, body);
  assert.equal(roll.element.style.position, 'fixed');
  const z = app => Number(app.element.style.zIndex);
  assert.ok(z(roll) > 1100 && z(roll) < 9999, 'the nested roll dialog is raised below tooltips');
  assert.ok(z(resolver) > z(roll) && z(resolver) < 9999, 'the core roll resolver stacks above the tray');
  roll.element.style.zIndex = '20';
  roll.bringToFront();
  assert.ok(z(roll) > 1100, 'focusing the roll dialog keeps it above the tray');
});

test('a roll dialog inserted into a sheet after render is moved above the tray', async () => {
  const vars = {'--z-index-window': '100', '--z-index-tooltip': '9999'};
  const documentElement = {};
  const root = element('ASIDE', '1100');
  const view = {
    getComputedStyle(node) {
      if (node === documentElement) return {zIndex: 'auto', position: 'static', getPropertyValue: name => vars[name] ?? ''};
      return {zIndex: node.style?.zIndex ?? 'auto', position: node.style?.position || 'absolute', getPropertyValue: () => ''};
    }
  };
  const body = {append(node) { node.parentElement = body; }};
  class ApplicationV2 {
    static _maxZ = 100;
    constructor() {
      this.element = element('SECTION', '150');
      this.element.ownerDocument = {body, defaultView: view};
      this.element.append = node => { node.parentElement = this.element; };
      this.position = {zIndex: 100};
      this.options = {tag: 'section'};
    }
    bringToFront() {}
    setPosition() {}
    render() {
      return Promise.resolve().then(() => { this.element.style.zIndex = '40'; });
    }
    async renderChild(child) {
      await child.render();
      this.element.append(child.element);
      child.element.style.zIndex = '40';
    }
  }
  class Dialog5e extends ApplicationV2 {}
  class RollConfigurationDialog extends Dialog5e {
    constructor() {
      super();
      this.options = {tag: 'dialog', classes: ['roll-configuration']};
      this.element = element('DIALOG', '40');
      this.element.ownerDocument = {body, defaultView: view};
      this.element.parentElement = null;
    }
  }
  const env = {
    _maxZ: 100,
    document: {documentElement, defaultView: view, body},
    Hooks: {on() {}},
    ui: {windows: {}},
    foundry: {applications: {api: {ApplicationV2}, instances: new Map()}}
  };
  const sheet = new ApplicationV2();
  const roll = new RollConfigurationDialog();
  assert.equal(installTrayStack(root, env), true);
  await sheet.renderChild(roll);
  assert.equal(roll.element.parentElement, body, 'renderChild cannot leave the roll dialog inside the sheet');
  assert.equal(roll.element.style.position, 'fixed');
  assert.ok(Number(roll.element.style.zIndex) > 1100 && Number(roll.element.style.zIndex) < 9999);
  roll.element.style.zIndex = '25';
  await roll.render();
  assert.ok(Number(roll.element.style.zIndex) > 1100, 'a z-index written when render resolves is raised again');
});

test('a third-party window without a real element still finishes rendering', () => {
  const node = element('SECTION', '40');
  const listed = element('SECTION', '40');
  assert.equal(resolveStackElement(null), null);
  assert.equal(resolveStackElement(undefined), null);
  assert.equal(resolveStackElement({jquery: '3.7.1', length: 1, 0: node, get(index) { return this[index]; }}), node);
  assert.equal(resolveStackElement([listed]), listed);
  assert.equal(resolveStackElement({tagName: 'SECTION', style: {zIndex: '8000'}}), null);
  assert.equal(resolveStackElement({nodeType: 3, data: 'text'}), null);

  const vars = {'--z-index-window': '100', '--z-index-tooltip': '9999'};
  const documentElement = {};
  const root = element('ASIDE', '1100');
  const inspected = [];
  const view = {
    getComputedStyle(candidate) {
      inspected.push(candidate);
      if (candidate === documentElement) return {zIndex: 'auto', getPropertyValue: name => vars[name] ?? ''};
      if (!candidate || candidate.nodeType !== 1) {
        throw new TypeError("Failed to execute 'getComputedStyle' on 'Window': parameter 1 is not of type 'Element'.");
      }
      return {zIndex: candidate.style?.zIndex ?? 'auto', position: candidate.style?.position || 'absolute', getPropertyValue: () => ''};
    }
  };
  class ApplicationV2 {
    static _maxZ = 100;
    constructor() {
      this.element = element('SECTION', '150');
      this.position = {zIndex: 100};
      this.options = {tag: 'section'};
    }
    bringToFront() {}
    setPosition() {}
    render() {
      if ('pending' in this) this.element = this.pending;
      return this.renderResult ?? 'rendered';
    }
  }
  const env = {
    _maxZ: 100,
    document: {documentElement, defaultView: view},
    Hooks: {on() {}},
    ui: {windows: {}},
    foundry: {applications: {api: {ApplicationV2}, instances: new Map()}}
  };
  const jqueryNode = element('SECTION', '5000');
  const jquery = {jquery: '3.7.1', length: 1, 0: jqueryNode, get(index) { return this[index]; }};
  const jqueryWindow = new ApplicationV2();
  jqueryWindow.element = jquery;
  const arrayNode = element('SECTION', '4800');
  const arrayWindow = new ApplicationV2();
  arrayWindow.element = [arrayNode];
  const pendingWindow = new ApplicationV2();
  pendingWindow.element = null;
  const foreign = {tagName: 'SECTION', style: {zIndex: '8000'}};
  const foreignWindow = new ApplicationV2();
  foreignWindow.element = foreign;
  const sheet = new ApplicationV2();
  sheet.element = element('SECTION', '5000');
  env.foundry.applications.instances.set('jquery', jqueryWindow);
  env.foundry.applications.instances.set('array', arrayWindow);
  env.foundry.applications.instances.set('pending', pendingWindow);
  env.foundry.applications.instances.set('foreign', foreignWindow);
  env.foundry.applications.instances.set('sheet', sheet);
  assert.equal(installTrayStack(root, env), true);
  assert.ok(Number(jqueryNode.style.zIndex) < 1100, 'a jQuery-wrapped window is stacked from its element');
  assert.ok(Number(arrayNode.style.zIndex) < 1100, 'a window whose element is a list is stacked from that element');
  assert.equal(foreign.style.zIndex, '8000', 'a non-element is left untouched');
  assert.ok(Number(sheet.element.style.zIndex) < 1100, 'a real window still stacks when another window has no element');
  assert.equal(inspected.includes(jquery), false);
  assert.equal(inspected.includes(foreign), false);
  assert.equal(inspected.includes(null), false);

  const battlemap = new ApplicationV2();
  battlemap.pending = null;
  battlemap.renderResult = 'battlemap';
  assert.equal(battlemap.render(), 'battlemap');
  battlemap.pending = jquery;
  battlemap.renderResult = 'wrapped';
  assert.equal(battlemap.render(), 'wrapped');
  assert.ok(Number(jqueryNode.style.zIndex) < 1100);
  battlemap.pending = foreign;
  battlemap.renderResult = 'foreign';
  assert.equal(battlemap.render(), 'foreign');
  assert.equal(foreign.style.zIndex, '8000');
  assert.equal(inspected.includes(foreign), false);
});
