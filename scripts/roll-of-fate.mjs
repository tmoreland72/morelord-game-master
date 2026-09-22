import {ID} from './core.mjs';
import {core} from './requests.mjs';
export async function rollOfFate() {
  if (!game.user.isGM) throw new Error('Only a GM can roll Fate.');
  const tokens = (canvas.tokens?.controlled ?? []).filter(token => token.actor?.type === 'character');
  if (!tokens.length) { ui.notifications.warn('Select at least one character token for Roll of Fate.'); return null; }
  const roll = tokens.length > 1 ? await new Roll(`1d${tokens.length}`).evaluate({allowInteractive:false}) : null;
  const chosen = tokens[(roll?.total ?? 1) - 1];
  return ChatMessage.create({
    content:`<section class="ml-chat-card"><p>Fate has decided that ${core().ui.actorIdentity({actorUuid:chosen.actor.uuid, name:chosen.name ?? chosen.actor.name, img:chosen.document?.texture?.src ?? chosen.actor.img})} shall be targeted!</p></section>`,
    speaker:ChatMessage.getSpeaker(), whisper:[], blind:false, ...(roll ? {rolls:[roll]} : {}),
    flags:{[ID]:{fate:{tokenUuid:chosen.document.uuid}}}
  }, {messageMode:'public'});
}
