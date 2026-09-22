// Offline DOM regression: no Foundry login, world, or document mutation.
export async function checkScrollPreservation() {
  const {applyPageLayout}=await import('/modules/morelord-core/scripts/ui/page-layout.js');
  const {renderPreservingScroll}=await import('/modules/morelord-core/scripts/ui/scroll-preservation.js');
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const body=document.querySelector('#mlgm .ml-page-body');
  body.scrollTop=180;body.dispatchEvent(new Event('scroll'));await settle();
  assert(body.scrollTop===180,'Tray fixture must be scrollable.');
  document.querySelector('[data-roll-card="encounter"] input[name=blind]').click();
  await new Promise(resolve=>setTimeout(resolve,150));
  assert(document.querySelector('#mlgm .ml-page-body').scrollTop===180,'Changing a card must retain tray scroll.');
  let root=document.createElement('div');root.className='ml-window';root.id='scroll-fixture';
  root.style.cssText='position:fixed;left:0;top:0;width:340px;height:260px;z-index:9999';
  const panel=(key)=>`<div ${key ? `data-ml-scroll-key="${key}"` : ''} class="scroll-test-panel" style="height:90px;width:260px;overflow:auto;flex:none"><div style="width:700px;height:1000px">Content</div></div>`;
  const markup=(reverse=false)=>`<div class="window-content" style="height:240px;overflow:auto">${reverse?panel('second')+panel('first'):panel('first')+panel('second')}</div>`;
  root.innerHTML=markup();document.body.append(root);
  const app={element:root};applyPageLayout(app);await settle();
  const scroll=(element,top,left=0)=>{element.scrollTop=top;element.scrollLeft=left;element.dispatchEvent(new Event('scroll'));};
  try {
    scroll(root.querySelector('[data-ml-scroll-key="first"]'),170,25);
    scroll(root.querySelector('[data-ml-scroll-key="second"]'),75);
    root.innerHTML=markup(true);await settle();
    assert(root.querySelector('[data-ml-scroll-key="first"]').scrollTop===170,'Nested panel survives background replacement and reorder.');
    assert(root.querySelector('[data-ml-scroll-key="first"]').scrollLeft===25,'Horizontal scrolling is preserved.');
    assert(root.querySelector('[data-ml-scroll-key="second"]').scrollTop===75,'Independent panel scroll is preserved.');
    const replacement=root.cloneNode(false);replacement.innerHTML=markup();root.replaceWith(replacement);root=replacement;app.element=root;applyPageLayout(app);await settle();
    assert(root.querySelector('[data-ml-scroll-key="first"]').scrollTop===170,'A native application frame replacement retains scroll.');
    root.querySelector('.window-content').insertAdjacentHTML('beforeend',panel('new'));await settle();
    scroll(root.querySelector('[data-ml-scroll-key="new"]'),95);
    root.querySelector('[data-ml-scroll-key="new"]').outerHTML=panel('new');await settle();
    assert(root.querySelector('[data-ml-scroll-key="new"]').scrollTop===95,'New scroll areas receive default preservation without extra setup.');
    await renderPreservingScroll(app,()=>{root.innerHTML=markup();},{selector:'*',reset:true});await settle();
    assert(root.querySelector('[data-ml-scroll-key="first"]').scrollTop===0,'Explicit phase reset wins over automatic preservation.');
    root.innerHTML=markup();await settle();
    assert(root.querySelector('[data-ml-scroll-key="first"]').scrollTop===0,'Reset remains reset on subsequent redraws.');
    return {tray:true,nested:true,horizontal:true,reorder:true,frameReplacement:true,newPanels:true,explicitReset:true};
  } finally {root.remove();}
}
