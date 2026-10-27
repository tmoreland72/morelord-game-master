import {assert} from '../../../morelord-core/scripts/testing/in-game.js';

export const panelChecks=[{
  id:'morelord-game-master.panel-layout',
  async run() {
    assert(game.world.id === 'dev1', 'Dev1 required.');
    let dialog, playlistDialog, windowApp, rollDialog;
    let previousTab;
    const api=game.modules.get('morelord-game-master').api;
    const wasOpen=document.body.classList.contains('mlgm-open');
    const style=getComputedStyle(document.documentElement);
    const uiLayer=Number(style.getPropertyValue('--z-index-ui'))||60;
    const windowLayer=Number(style.getPropertyValue('--z-index-window'))||100;
    const below=document.createElement('div');
    below.style.cssText=`position:fixed;inset:0;z-index:${uiLayer};background:red`;
    const above=document.createElement('div');
    above.style.cssText=`position:fixed;inset:0;z-index:${windowLayer};background:blue`;
    try {
      api.toggle(true);
      document.body.append(below);
      const root=document.querySelector('#mlgm'),tray=root.querySelector('.gm-tray');
      const bounds=tray.getBoundingClientRect();
      const point=document.elementFromPoint(bounds.left+5,bounds.top+5);
      assert(Math.abs(bounds.width-innerWidth*.65)<1,'Panel width is 65% of the viewport.');
      assert(Math.abs(bounds.height-innerHeight*.75)<1,'Panel height is 75% of the viewport.');
      assert(root.contains(point),'Tray stays above the canvas and sidebars.');
      document.body.append(above);
      const covered=document.elementFromPoint(bounds.left+5,bounds.top+5);
      assert(root.contains(covered),'Tray remains above the Foundry window layer.');
      class TrayStackWindow extends foundry.applications.api.ApplicationV2 {
        static DEFAULT_OPTIONS = {id:"mlgm-stack-window", tag:"section", window:{title:"Game Master window stacking fixture"}, position:{width:240, height:160}};
        async _renderHTML() { const node = document.createElement("p"); node.textContent = "Disposable window."; return node; }
      }
      windowApp = new TrayStackWindow();
      await windowApp.render({force:true});
      for (let index=0;index<3;index++) {
        windowApp.bringToFront();
        const rect=windowApp.element.getBoundingClientRect();
        windowApp.setPosition({left:bounds.left,top:bounds.top,width:Math.min(rect.width || 240,bounds.width),height:Math.min(rect.height || 160,bounds.height)});
        assert(root.contains(document.elementFromPoint(bounds.left+20,bounds.top+20)), 'Opened and refocused native windows cannot cover the tray.');
        assert(Number(getComputedStyle(windowApp.element).zIndex) < Number(getComputedStyle(root).zIndex), 'A focused window stays below the tray.');
      }
      dialog = new foundry.applications.api.DialogV2({id:"mlgm-stack-dialog", modal:false, window:{title:'Game Master stacking fixture'},content:'<p>Disposable dialog.</p>',buttons:[{action:'close',label:'Close'}]});
      await dialog.render({force:true});
      dialog.bringToFront();
      const dialogRect=dialog.element.getBoundingClientRect();
      dialog.setPosition({left:bounds.left+80,top:bounds.top,width:Math.min(dialogRect.width || 280,bounds.width-80),height:Math.min(dialogRect.height || 160,bounds.height)});
      assert(dialog.element.contains(document.elementFromPoint(bounds.left+100,bounds.top+20)), 'Dialogs open above the tray.');
      assert(Number(getComputedStyle(dialog.element).zIndex) > Number(getComputedStyle(root).zIndex), 'Dialog z-index is above the tray.');
      windowApp.bringToFront();
      assert(root.contains(document.elementFromPoint(bounds.left+20,bounds.top+20)), 'Focusing a window after a dialog does not cover the tray.');
      assert(dialog.element.contains(document.elementFromPoint(bounds.left+100,bounds.top+20)), 'The dialog stays above the tray when a window is focused.');
      class RollConfigurationDialog extends foundry.applications.api.ApplicationV2 {
        static DEFAULT_OPTIONS = {id:"mlgm-stack-roll", tag:"dialog", classes:["roll-configuration"], window:{title:"Roll Configuration"}, position:{width:280, height:160}};
        async _renderHTML() { const node = document.createElement("p"); node.textContent = "Roll configuration."; return node; }
      }
      rollDialog = new RollConfigurationDialog();
      if (typeof windowApp.renderChild === "function") await windowApp.renderChild(rollDialog);
      else await rollDialog.render({force:true});
      rollDialog.bringToFront();
      const rollRect = rollDialog.element.getBoundingClientRect();
      rollDialog.setPosition({left:bounds.left+80, top:bounds.top, width:Math.min(rollRect.width || 280, bounds.width-80), height:Math.min(rollRect.height || 160, bounds.height)});
      assert(rollDialog.element.parentElement === document.body, 'A roll dialog opened from a window is not trapped in that window.');
      assert(rollDialog.element.contains(document.elementFromPoint(bounds.left+100, bounds.top+20)), 'The roll configuration dialog opens above the tray.');
      assert(Number(getComputedStyle(rollDialog.element).zIndex) > Number(getComputedStyle(root).zIndex), 'The roll configuration dialog stacks above the tray.');
      previousTab=root.querySelector('[data-action="tab"][aria-selected="true"]')?.dataset.id;
      root.querySelector('[data-action="tab"][data-id="sound"]').click();
      root.querySelector('[data-action="playlist"]').click();
      for(let attempt=0;attempt<100;attempt++) {
        playlistDialog=document.getElementById('morelord-game-master-start-playlist');
        if(playlistDialog?.matches(':modal')) break;
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      assert(playlistDialog?.matches(':modal'),'Start Playlist opens in the native foreground modal layer.');
      const playlistBounds=playlistDialog.getBoundingClientRect();
      assert(playlistDialog.contains(document.elementFromPoint(playlistBounds.left+20,playlistBounds.top+20)),'Start Playlist is visible and receives clicks above the tray.');
      playlistDialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      for(const element of [tray,root.querySelector('.gm-handle')]) {
        const color=getComputedStyle(element).backgroundColor;
        assert(!/rgba\(|\/\s*(?:0\.|\d{1,2}%)/.test(color),'Panel and handle backgrounds are fully opaque.');
      }
    } finally {
      if(playlistDialog?.isConnected) {
        const app=Object.values(ui.windows).find(app=>app.element===playlistDialog);
        if(app) await app.close();
        else playlistDialog.querySelector('[data-action="close"]')?.click();
      }
      if(previousTab) document.querySelector(`#mlgm [data-action="tab"][data-id="${previousTab}"]`)?.click();
      await dialog?.close();await rollDialog?.close();await windowApp?.close();below.remove();above.remove();api.toggle(wasOpen); }
  }
}];
