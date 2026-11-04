import test from "node:test";
import assert from "node:assert/strict";
import {itemCard} from "../../morelord-core/scripts/ui/item-card.js";
import {ChatRollRequests} from "../../morelord-core/scripts/services/chat-roll-requests.js";
import {coreItemCard, coreRequestCard, commitHoardStep, emptyHoardState, hoardCardHTML, loadTreasure} from "../scripts/treasure.mjs";

const escapeHTML = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
globalThis.foundry = {utils: {escapeHTML}};
globalThis.fromUuidSync = uuid => ({name: "Chuck", img: `${uuid}.webp`});
// Core's real roll-request renderer, so the card is checked against the shared markup, not a stub.
const chatRequests = new ChatRollRequests({createChannel: () => ({on() {}})});
const requestCard = coreRequestCard({chatRequests});

const escape = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const state = () => ({
  ...emptyHoardState("a"),
  hoardRoll: 37,
  coins: {purse: {gp: 120}, copper: 12000, granted: true},
  valuable: {kind: "gems", gp: 50, quantity: 4, name: "Gemstone (50 GP)", compendiumUuid: "Compendium.x.Item.g", img: "gem.webp", embeddedUuid: null},
  counts: {G: 2},
  items: [{name: "Potion of Healing", compendiumUuid: "Compendium.x.Item.p", img: "potion.webp", rarity: "common", quantity: 1, source: "SRD 5.2", tableId: "G", tableName: "Table G"}],
  trinket: {name: "Fragment of Fate", itemData: {img: "fate.webp", system: {rarity: "rare"}}, source: "Game Master", embeddedUuid: "Actor.a.Item.t"}
});
const step = {id: "magic-2", prompt: "Magic item 2 of 2"};

const pendingState = () => ({...emptyHoardState("a"), hoardRoll: 37});
const identity = "<span class=\"ml-actor-identity\">Chuck</span>";

test("pending steps are Core's roll-request card with modes off and a Roll button, and no item card", () => {
  let calls = 0;
  const countingCard = options => { calls++; return itemCard(options); };
  for (const card of [countingCard, null]) {
    const html = hoardCardHTML({title: "Roll for Treasure", actorUuid: "Actor.a", identity, recipientName: "Chuck", state: pendingState(), step, allowRoll: true, escape, itemCard: card, requestCard});
    assert.doesNotMatch(html, /ml-award-card/);
    assert.match(html, /^<div class="mlgm-hoard"><section class="ml-chat-card ml-stack ml-core-roll-request"><h3>Roll for Treasure<\/h3><p>Initial Roll: 37<\/p><div class="ml-card ml-stack" data-ml-roll-entry="hoard"><span class="ml-actor-identity"><img [^>]*><span>Chuck<\/span><\/span><p>Magic item 2 of 2<\/p><div class="ml-roll-controls"><button type="button" data-ml-core-roll="normal" aria-label="Roll">Roll<\/button><\/div><\/div><\/section><\/div>$/);
    assert.equal(html.match(/data-ml-core-roll=/g).length, 1);
    assert.doesNotMatch(html, /DIS|ADV|data-mlgm-hoard-step|<select/);
    assert.doesNotMatch(html, /Table [A-Z]|d100|1d\d/);
  }
  assert.equal(calls, 0);
  const first = hoardCardHTML({title: "Roll for Treasure", actorUuid: "Actor.a", identity, state: emptyHoardState("a"), step: {id: "table", prompt: ""}, allowRoll: true, escape, itemCard, requestCard});
  assert.doesNotMatch(first, /ml-award-card|Initial Roll/);
  assert.match(first, /<button type="button" data-ml-core-roll="normal"/);
  // An empty purse is still not a result worth a card.
  const none = hoardCardHTML({title: "T", identity, state: {...pendingState(), coins: {purse: {}, granted: true}}, step: null, escape, itemCard: () => { throw new Error("empty card"); }, requestCard});
  assert.doesNotMatch(none, /ml-award-card|data-ml-core-roll/);
  assert.match(none, /Coins<\/strong><br>None/);
});

test("without Core's roll-request card the pending step keeps the plain Roll button", () => {
  assert.equal(coreRequestCard({}), null);
  assert.equal(coreRequestCard({chatRequests: {}}), null);
  assert.equal(typeof coreRequestCard({chatRequests}), "function");
  const html = hoardCardHTML({title: "Roll for Treasure", actorUuid: "Actor.a", identity, state: pendingState(), step, allowRoll: true, escape, itemCard, requestCard: null});
  assert.match(html, /^<div class="mlgm-hoard"><section class="ml-chat-card ml-stack"><h3>Roll for Treasure<\/h3><p>Initial Roll: 37<\/p><div class="ml-card ml-stack">/);
  assert.match(html, /<p>Magic item 2 of 2<\/p><button type="button" data-mlgm-hoard-step="magic-2">Roll<\/button><\/div><\/section><\/div>$/);
  assert.doesNotMatch(html, /ml-core-roll-request|data-ml-core-roll/);
});

test("results go to Core's item card below the request, with no Roll button inside the item card", () => {
  const calls = [];
  const html = hoardCardHTML({title: "Roll for Treasure", identity, recipientName: "Chuck", state: state(), step, allowRoll: true, escape, requestCard, itemCard: options => { calls.push(options); return `<section class="stub">card</section>`; }});
  assert.match(html, /^<div class="mlgm-hoard"><section class="ml-chat-card ml-stack ml-core-roll-request"><h3>Roll for Treasure<\/h3><p>Initial Roll: 37<\/p><div class="ml-card ml-stack" data-ml-roll-entry="hoard">/);
  assert.match(html, /data-ml-core-roll="normal"[^>]*>Roll<\/button><\/div><\/div><\/section><section class="stub">card<\/section><\/div>$/);
  const [options] = calls;
  assert.equal(options.recipientName, "Chuck");
  assert.equal(options.footer, "Morelord Game Master");
  assert.deepEqual(options.coins, {gp: 120});
  assert.equal(options.totalLabel, "Added to the purse.");
  assert.equal(options.bodyHTML, undefined);
  assert.equal(options.actionsHTML, undefined);
  assert.deepEqual(options.sections.map(section => section.heading), ["Gems", "Magic items (1 of 2)", "Trinket"]);
  assert.deepEqual(options.sections[0].items, [{uuid: "Compendium.x.Item.g", name: "Gemstone (50 GP)", img: "gem.webp", rarity: "common", quantity: 4}]);
  assert.deepEqual(options.sections[1].items, [{uuid: "Compendium.x.Item.p", name: "Potion of Healing", img: "potion.webp", rarity: "common", quantity: 1}]);
  assert.deepEqual(options.sections[2].items, [{uuid: "Actor.a.Item.t", name: "Fragment of Fate", img: "fate.webp", rarity: "rare", quantity: 1}]);
  assert.doesNotMatch(JSON.stringify(options), /Table [A-Z]|d100|1d\d/);
  const finished = hoardCardHTML({title: "T", identity, state: state(), step: null, allowRoll: true, escape, requestCard, itemCard: () => "<section class=\"stub\"></section>"});
  assert.doesNotMatch(finished, /data-mlgm-hoard-step|data-ml-core-roll/);
});

test("results render on Core's real item card with images, rarity, links, and one Roll button outside it", () => {
  const html = hoardCardHTML({title: "Roll for Treasure", identity, recipientName: "Chuck", state: state(), step, allowRoll: true, escape, itemCard, requestCard});
  assert.equal(html.match(/ml-award-card"/g).length, 1);
  assert.match(html, /ml-award-card__recipient[^>]*><i[^>]*><\/i>Chuck</);
  assert.match(html, /src="potion\.webp"/);
  assert.match(html, /@UUID\[Compendium\.x\.Item\.p\]\{Potion of Healing\}/);
  assert.match(html, /ml-award-card__item-rarity">Common</);
  assert.match(html, /ml-award-card__item-rarity">Rare</);
  assert.match(html, /<span>120 gp<\/span>/);
  assert.match(html, /MORELORD GAME MASTER/);
  assert.equal(html.match(/data-ml-core-roll=/g).length, 1);
  assert.ok(html.indexOf("data-ml-core-roll") < html.indexOf("ml-award-card"));
});

test("results fall back to the plain lists until Core ships the shared card", () => {
  assert.equal(coreItemCard({ui: {}}), null);
  assert.equal(typeof coreItemCard({ui: {itemCard}}), "function");
  const html = hoardCardHTML({title: "Roll for Treasure", identity, recipientName: "Chuck", state: state(), step, allowRoll: true, escape, itemCard: null, requestCard});
  assert.match(html, /^<div class="mlgm-hoard"><section class="ml-chat-card ml-stack ml-core-roll-request">.*<\/section><section class="ml-chat-card ml-stack"><p><strong>Coins<\/strong>/);
  assert.doesNotMatch(html, /ml-award-card/);
  assert.equal(html.match(/data-ml-core-roll=/g).length, 1);
});

test("hoard steps keep the catalog image and rarity for the card", async () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const data = await loadTreasure();
    const index = {get: () => ({uuid: "Compendium.x.Item.i", img: "found.webp", rarity: "rare", source: "SRD 5.2"}), values: () => []};
    let next = emptyHoardState("actor");
    for (const totals of [[95], [10], [1], [1]]) next = (await commitHoardStep({data, bandId: "cr-5-10", state: next, totals, index, placeItem: async () => ({uuid: "Actor.actor.Item.x"})})).state;
    assert.equal(next.items[0].img, "found.webp");
    assert.equal(next.items[0].rarity, "rare");
    assert.equal(next.valuable.img, "found.webp");
  } finally { console.warn = warn; }
});
