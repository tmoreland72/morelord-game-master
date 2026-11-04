import test from "node:test";
import assert from "node:assert/strict";
import {itemCard} from "../../morelord-core/scripts/ui/item-card.js";
import {coreItemCard, commitHoardStep, emptyHoardState, hoardCardHTML, loadTreasure} from "../scripts/treasure.mjs";

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

test("hoard card hands Core's shared card the character, items, coins, roll line, and button", () => {
  const calls = [];
  const html = hoardCardHTML({title: "Roll for Treasure", recipientName: "Chuck", state: state(), step, allowRoll: true, escape, itemCard: options => { calls.push(options); return `<section class="stub">card</section>`; }});
  assert.equal(html, `<div class="mlgm-hoard"><section class="stub">card</section></div>`);
  const [options] = calls;
  assert.equal(options.title, "Roll for Treasure");
  assert.equal(options.recipientName, "Chuck");
  assert.equal(options.footer, "Morelord Game Master");
  assert.deepEqual(options.coins, {gp: 120});
  assert.equal(options.totalLabel, "Added to the purse.");
  assert.deepEqual(options.sections.map(section => section.heading), ["Gems", "Magic items (1 of 2)", "Trinket"]);
  assert.deepEqual(options.sections[0].items, [{uuid: "Compendium.x.Item.g", name: "Gemstone (50 GP)", img: "gem.webp", rarity: "common", quantity: 4}]);
  assert.deepEqual(options.sections[1].items, [{uuid: "Compendium.x.Item.p", name: "Potion of Healing", img: "potion.webp", rarity: "common", quantity: 1}]);
  assert.deepEqual(options.sections[2].items, [{uuid: "Actor.a.Item.t", name: "Fragment of Fate", img: "fate.webp", rarity: "rare", quantity: 1}]);
  assert.match(options.bodyHTML, /<p>Initial Roll: 37<\/p><p>Magic item 2 of 2<\/p>/);
  assert.equal(options.actionsHTML, `<button type="button" data-mlgm-hoard-step="magic-2">Roll</button>`);
  assert.doesNotMatch(JSON.stringify(options), /Table [A-Z]|d100|1d\d/);
  hoardCardHTML({title: "T", state: state(), step, allowRoll: false, escape, itemCard: options => { calls.push(options); return ""; }});
  assert.equal(calls[1].actionsHTML, "");
  assert.equal(calls[1].bodyHTML, "<p>Initial Roll: 37</p>");
});

test("hoard card renders on Core's real item card with images, rarity, links, and one Roll button", () => {
  const html = hoardCardHTML({title: "Roll for Treasure", recipientName: "Chuck", state: state(), step, allowRoll: true, escape, itemCard});
  assert.match(html, /^<div class="mlgm-hoard"><section class="ml-chat-card ml-award-card">/);
  assert.match(html, /ml-award-card__recipient[^>]*><i[^>]*><\/i>Chuck</);
  assert.match(html, /src="potion\.webp"/);
  assert.match(html, /@UUID\[Compendium\.x\.Item\.p\]\{Potion of Healing\}/);
  assert.match(html, /ml-award-card__item-rarity">Common</);
  assert.match(html, /ml-award-card__item-rarity">Rare</);
  assert.match(html, /<span>120 gp<\/span>/);
  assert.match(html, /MORELORD GAME MASTER/);
  assert.equal(html.match(/data-mlgm-hoard-step=/g).length, 1);
});

test("hoard card falls back to the plain card until Core ships the shared card", () => {
  assert.equal(coreItemCard({ui: {}}), null);
  assert.equal(typeof coreItemCard({ui: {itemCard}}), "function");
  const html = hoardCardHTML({title: "Roll for Treasure", identity: "<span>Chuck</span>", recipientName: "Chuck", state: state(), step, allowRoll: true, escape, itemCard: null});
  assert.match(html, /^<section class="ml-chat-card ml-stack mlgm-hoard"><h3>Roll for Treasure<\/h3><span>Chuck<\/span><p>Initial Roll: 37<\/p>/);
  assert.doesNotMatch(html, /ml-award-card/);
  assert.equal(html.match(/data-mlgm-hoard-step=/g).length, 1);
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
