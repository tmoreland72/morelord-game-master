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
    const positions=[];
    for(const card of cards) {
      const footer=card.querySelector("footer.ml-card__footer.ml-actions");
      assert(footer,"Every trigger uses Core's card footer.");
      assert(footer.querySelectorAll("button").length===1,"Every footer has only the enable/pause action.");
      const bounds=card.getBoundingClientRect(), actions=footer.getBoundingClientRect();
      positions.push({top:bounds.top,bottom:actions.bottom});
      assert(bounds.bottom-actions.bottom < 25,"Footer stays at the bottom regardless of description length.");
      assert(actions.right <= bounds.right && actions.left >= bounds.left,"Footer stays inside its card.");
    }
    for(const a of positions) for(const b of positions) if(Math.abs(a.top-b.top)<2) assert(Math.abs(a.bottom-b.bottom)<2,"Same-row trigger footers align.");
  } finally {
    if(priorTab) document.getElementById(priorTab)?.click();
    game.modules.get("morelord-game-master").api.toggle(wasOpen);
  }
}};
