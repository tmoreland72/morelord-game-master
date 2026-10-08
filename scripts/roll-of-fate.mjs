import {ID} from './core.mjs';
import {core} from './requests.mjs';

export function fatePool({scope = "tokens", tokens = [], actors = []} = {}) {
  if (scope === "party") return actors.filter(actor => actor?.type === "character").map(actor => ({name: actor.name, actor, img: actor.img, tokenUuid: null}));
  return tokens.filter(token => token.actor?.type === "character").map(token => ({name: token.name ?? token.actor.name, actor: token.actor, img: token.document?.texture?.src ?? token.actor.img, tokenUuid: token.document?.uuid ?? null}));
}

export async function rollOfFate({scope = "tokens", actors = []} = {}) {
  if (!game.user.isGM) throw new Error('Only a GM can roll Fate.');
  const pool = fatePool({scope, tokens: canvas.tokens?.controlled ?? [], actors});
  if (!pool.length) {
    ui.notifications.warn(scope === "party" ? "Select participating characters on the Player Settings tab first." : "Select at least one character token for Roll of Fate.");
    return null;
  }
  const roll = pool.length > 1 ? await new Roll(`1d${pool.length}`).evaluate({allowInteractive:false}) : null;
  const chosen = pool[(roll?.total ?? 1) - 1];
  return ChatMessage.create({
    content:`<section class="ml-chat-card"><p>${core().ui.actorIdentity({actorUuid:chosen.actor.uuid, name:chosen.name, img:chosen.img})} has been chosen by fate!</p></section>`,
    speaker:ChatMessage.getSpeaker(), whisper:[], blind:false, ...(roll ? {rolls:[roll]} : {}),
    flags:{[ID]:{fate:{tokenUuid:chosen.tokenUuid, actorUuid:chosen.actor.uuid, scope}}}
  }, {messageMode:'public'});
}
