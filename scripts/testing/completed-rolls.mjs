import { assert } from "../../../morelord-core/scripts/testing/in-game.js";
import { holdTestRollAnimations, untilRollCheck } from "../../../morelord-core/scripts/testing/roll-completion.js";
import { createRequest } from "../requests.mjs";
export const completedRollCheck = { id: "game-master.completed-roll-presentation", async run() {
  const actors = [], gate = holdTestRollAnimations(message => actors.some(actor => actor.id === message.speaker?.actor));
  let request;
  try {
    for (const name of ["Immediate roll A", "Immediate roll B"]) actors.push(await Actor.create({name,type:"character",ownership:{default:3}}));
    request = await createRequest({kind:"skill",skill:"arc",actorIds:actors.map(actor => actor.id),dc:10,blind:true});
    for (const [index, actor] of actors.entries()) {
      const select = () => document.querySelector(`[data-message-id="${request.id}"] [data-mlgm-actor="${actor.id}"][data-mlgm-mode="normal"]`);
      await untilRollCheck(select, "The grouped request renders a separate button for each actor.");
      const button=select(), row=button.closest(".ml-card");
      assert(!button.disabled,"The GM can roll the next character while earlier dice animate.");
      button.click();
      assert(row.querySelector(".ml-roll-completed")?.textContent === "Completed" && !row.querySelector("button, select"), "Completed replaces the clicked controls immediately.");
      assert(getComputedStyle(row.querySelector(".ml-roll-completed")).textAlign === "center", "Completed is centered by Core.");
      await untilRollCheck(() => request.getFlag("morelord-game-master","request").completed.includes(actor.id), "The GM acknowledges without waiting for animation.");
      assert(gate.held.size === index + 1, "Both native rolls reach the dice boundary independently.");
    }
    const summaries=()=>game.messages.filter(message=>message.getFlag("morelord-game-master","summary")?.requestId===request.id);
    assert(!summaries().length,"No outcome summary appears before the dice finish.");
    assert([...gate.held.values()].every(message=>message.blind && message.whisper.length),"Private results preserve their GM-only visibility.");
    gate.stop();
    await untilRollCheck(() => summaries().length === 1, "Exactly one summary appears after the animations.");
  } finally {
    gate.stop();
    if(request) {
      const ids=game.messages.filter(message=>message.id===request.id || message.getFlag("morelord-game-master","result")?.requestId===request.id || message.getFlag("morelord-game-master","summary")?.requestId===request.id).map(message=>message.id);
      if(ids.length)await ChatMessage.deleteDocuments(ids);
    }
    for(const actor of actors)await actor.delete();
  }
}};
