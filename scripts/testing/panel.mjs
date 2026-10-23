import {assert} from '../../../morelord-core/scripts/testing/in-game.js';

export const panelChecks=[{
  id:'morelord-game-master.panel-layout',
  async run() {
    assert(game.world.id === 'dev1', 'Dev1 required.');
    let dialog;
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
      dialog = new foundry.applications.api.DialogV2({window:{title:'Game Master stacking fixture'},content:'<p>Disposable foreground regression window.</p>',buttons:[{action:'close',label:'Close'}]});
      await dialog.render({force:true});
      for (let index=0;index<3;index++) {
        dialog.bringToFront();
        const rect=dialog.element.getBoundingClientRect();
        dialog.setPosition({left:bounds.left,top:bounds.top,width:Math.min(rect.width,bounds.width),height:Math.min(rect.height,bounds.height)});
        assert(root.contains(document.elementFromPoint(bounds.left+20,bounds.top+20)), 'Opened and refocused native windows cannot cover the tray.');
      }
      for(const element of [tray,root.querySelector('.gm-handle')]) {
        const color=getComputedStyle(element).backgroundColor;
        assert(!/rgba\(|\/\s*(?:0\.|\d{1,2}%)/.test(color),'Panel and handle backgrounds are fully opaque.');
      }
    } finally { await dialog?.close();below.remove();above.remove();api.toggle(wasOpen); }
  }
}];
