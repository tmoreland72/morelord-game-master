import {assert} from "../../../morelord-core/scripts/testing/in-game.js";
export const triggerFooterCheck = {id:"morelord-game-master.trigger-footer", async run() {
  const root=document.querySelector("#mlgm");
  const wasOpen=document.body.classList.contains("mlgm-open");
  const priorTab=root.querySelector('[role="tab"][aria-selected="true"]')?.id;
  try {
    game.modules.get("morelord-game-master").api.toggle(true);
    document.querySelector("#mlgm-tab-triggers").click();
    const cards=[...root.querySelectorAll(".gm-trigger-card")];
    assert(cards.length >= 3,"Render Lucky Finds and both class triggers together.");
    for(const card of cards) {
      const header=card.querySelector(".gm-trigger-header");
      const parts=[header?.querySelector(".gm-trigger-name"),header?.querySelector(".gm-trigger-scope"),header?.querySelector(".gm-trigger-status"),header?.querySelector("[data-action=trigger-toggle]")];
      assert(parts.every(Boolean),"Every trigger header has a name, scope, status icon, and play/pause control.");
      const mids=parts.map(part=>{const box=part.getBoundingClientRect();return (box.top+box.bottom)/2;});
      assert(Math.max(...mids)-Math.min(...mids)<4,"Name, scope, status, and play/pause stay on one row.");
      assert(!card.querySelector("footer"),"Trigger controls are not parked in a card footer.");
      assert(!/\b(Running|Stopped|Unavailable)\b/.test(card.innerText),"Status is the icon, not a second text line.");
      assert(getComputedStyle(card).alignSelf==="start","A short trigger is not stretched to the tallest card in its row.");
      const style=getComputedStyle(card),children=[...card.children];
      const gap=parseFloat(style.rowGap||style.gap)||0;
      const content=children.reduce((sum,el)=>sum+el.getBoundingClientRect().height,0)+gap*Math.max(0,children.length-1)+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+parseFloat(style.borderTopWidth)+parseFloat(style.borderBottomWidth);
      assert(Math.abs(card.getBoundingClientRect().height-content)<3,"Card height matches the header and When/Then text.");
    }
  } finally {
    if(priorTab) document.getElementById(priorTab)?.click();
    game.modules.get("morelord-game-master").api.toggle(wasOpen);
  }
}};
