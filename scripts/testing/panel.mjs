import {assert} from '../../../morelord-core/scripts/testing/in-game.js';

export const panelChecks=[{
  id:'morelord-game-master.panel-layout',
  async run() {
    const api=game.modules.get('morelord-game-master').api;
    const wasOpen=document.body.classList.contains('mlgm-open');
    const fixture=document.createElement('div');
    fixture.style.cssText='position:fixed;inset:0;z-index:999999;background:red';
    try {
      api.toggle(true);
      document.body.append(fixture);
      const root=document.querySelector('#mlgm'),tray=root.querySelector('.gm-tray');
      const bounds=tray.getBoundingClientRect();
      assert(Math.abs(bounds.width-innerWidth*.65)<1,'Panel width is 65% of the viewport.');
      assert(Math.abs(bounds.height-innerHeight*.75)<1,'Panel height is 75% of the viewport.');
      assert(root.contains(document.elementFromPoint(bounds.left+5,bounds.top+5)),'Panel stays above a high-stacked window.');
      for(const element of [tray,root.querySelector('.gm-handle')]) {
        const color=getComputedStyle(element).backgroundColor;
        assert(!/rgba\(|\/\s*(?:0\.|\d{1,2}%)/.test(color),'Panel and handle backgrounds are fully opaque.');
      }
    } finally { fixture.remove();api.toggle(wasOpen); }
  }
}];
