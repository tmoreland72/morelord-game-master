import {ChatRollRequests} from "../../morelord-core/scripts/services/chat-roll-requests.js";

/** Core's roll-request card as the last release had it: register, create and html, with no updateEntry and no prepare. */
export function releasedCoreCards(chat = new ChatRollRequests({createChannel: () => ({on() {}})})) {
  return {register: (...args) => chat.register(...args), create: options => chat.create(options), html: request => chat.html(request)};
}