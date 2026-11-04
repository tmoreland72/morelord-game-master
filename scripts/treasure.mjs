// data/srd-treasure.json copies the Morelord compendium "Table 2" hoard
// tables and Magic Item Tables A-G: same dice, ranges and entries. Table H is
// rebuilt from the 2014 DMG Table H. Each item row names the 2024 item to link
// (`item`, plus an SRD 5.2 name in `srd` when that differs). Rows with a
// `variant` roll their own die as a separate step (Figurine d8, Horn d2).
// Table lookup and item resolution are pure functions here; the step flow
// below only decides which die to roll next.

export const HOARD_BANDS = [
  {id: "cr-0-4", label: "CR 0-4"},
  {id: "cr-5-10", label: "CR 5-10"}
];

const COIN_RATES = {cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000};
const AWARD_DENOMS = ["gp", "sp", "cp"];
let cache;

export async function loadTreasure() {
  if (cache) return cache;
  const url = new URL("../data/srd-treasure.json", import.meta.url);
  if (typeof process !== "undefined" && process.versions?.node) {
    const {readFile} = await import("node:fs/promises");
    cache = JSON.parse(await readFile(url, "utf8"));
    return cache;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error("The treasure tables could not be loaded.");
  cache = await response.json();
  return cache;
}

export function rangeIssues(rows, die = 100) {
  if (!Array.isArray(rows) || !Number.isInteger(die) || die < 1) return ["The table has no rows."];
  const seen = new Array(die + 1).fill(0);
  for (const row of rows) {
    if (!Number.isInteger(row?.min) || !Number.isInteger(row?.max) || row.min < 1 || row.max > die || row.min > row.max) return [`A row is outside 1-${die}.`];
    for (let roll = row.min; roll <= row.max; roll += 1) seen[roll] += 1;
  }
  const problems = [];
  for (let roll = 1; roll <= die; roll += 1) if (seen[roll] !== 1) problems.push(roll);
  return problems;
}

function itemRowIssue(row) {
  if (row?.variant) return rangeIssues(row.variant.rows, row.variant.die).length || row.variant.rows.some(option => !option.item);
  return !row?.item;
}

export function auditTreasure(data, bands = HOARD_BANDS) {
  const problems = [];
  const tables = new Map((data?.tables ?? []).map(table => [table.id, table]));
  if (tables.size !== (data?.tables ?? []).length) problems.push("A magic item table id is repeated.");
  for (const table of tables.values()) {
    const issues = rangeIssues(table.rows, table.die);
    if (table.die !== 100) problems.push(`${table.name} does not roll a d100.`);
    if (issues.length) problems.push(`${table.name} does not cover its die: ${issues.slice(0, 8).join(", ")}.`);
    if ((table.rows ?? []).some(itemRowIssue)) problems.push(`${table.name} has a row with no item.`);
  }
  const hoards = data?.hoards ?? [];
  if (hoards.map(hoard => hoard.id).join() !== bands.map(band => band.id).join()) problems.push("Hoard ids do not match the request bands.");
  for (const hoard of hoards) {
    const issues = rangeIssues(hoard.rows, hoard.die ?? 100);
    if (issues.length) problems.push(`${hoard.label} does not cover its die: ${issues.slice(0, 8).join(", ")}.`);
    for (const row of hoard.rows ?? []) {
      for (const coin of row.coins ?? []) if (!COIN_RATES[coin.denomination] || !positive(coin.dice) || !positive(coin.sides, 2) || !positive(coin.multiplier)) problems.push(`${hoard.label} has a coin term that is not structured dice.`);
      for (const valuable of row.valuables ?? []) if (!["gems", "art"].includes(valuable.kind) || !positive(valuable.dice) || !positive(valuable.sides, 2) || !positive(valuable.each?.gp)) problems.push(`${hoard.label} has a gem or art term that is not structured dice.`);
      for (const magic of row.magic ?? []) {
        if (!tables.has(magic.table)) problems.push(`${hoard.label} references a missing magic item table.`);
        if (!positive(magic.count) && !(positive(magic.dice) && positive(magic.sides, 2))) problems.push(`${hoard.label} has a magic roll without a count.`);
      }
      if (row.trinket && !data?.trinkets?.[row.trinket]) problems.push(`${hoard.label} references a missing trinket.`);
    }
  }
  return problems;
}

function positive(value, minimum = 1) {
  return Number.isInteger(value) && value >= minimum;
}

export function lookupKey(name) {
  return String(name ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function spellScrollLevel(name) {
  const match = /^spell scroll \((?:cantrip|level\s+(\d+))\)$/i.exec(String(name ?? "").trim());
  if (!match) return null;
  return match[1] == null ? 0 : Number(match[1]);
}

function ordinal(level) {
  const teen = level % 100;
  const suffix = teen >= 11 && teen <= 13 ? "th" : {1: "st", 2: "nd", 3: "rd"}[level % 10] ?? "th";
  return `${level}${suffix}`;
}

export function scrollLookupNames(level) {
  if (level === 0) return ["Spell Scroll (Cantrip)", "Spell Scroll, Cantrip"];
  return [`Spell Scroll (Level ${level})`, `Spell Scroll (level ${level})`, `Spell Scroll, ${ordinal(level)} Level`, `Spell Scroll, Level ${level}`, `Spell Scroll (${ordinal(level)} Level)`];
}

export function spellScrollLabel(level, spellName = "") {
  const tier = Number(level) === 0 ? "Cantrip" : `Level ${level}`;
  const spell = String(spellName ?? "").trim();
  return spell ? `Spell Scroll (${tier}): ${spell}` : `Spell Scroll (${tier})`;
}

export function gemArtLabel(kind, gp) {
  return kind === "gems" ? `Gemstone (${gp} GP)` : `Art object (${gp} GP)`;
}

function tableName(data, id) {
  return data?.tables?.find(table => table.id === id)?.name ?? `Magic Item Table ${id}`;
}

export function describeRow(row, data = null) {
  if (!row?.coins?.length && !row?.valuables?.length && !row?.magic?.length && !row?.trinket) return "No treasure";
  const parts = [];
  for (const coin of row.coins ?? []) parts.push(`${coin.dice}d${coin.sides} × ${coin.multiplier} ${String(coin.denomination).toUpperCase()}`);
  for (const valuable of row.valuables ?? []) {
    const noun = valuable.kind === "gems" ? "gems" : "art objects";
    parts.push(`${valuable.dice}d${valuable.sides} ${noun} (${valuable.each.gp.toLocaleString()} GP each)`);
  }
  for (const magic of row.magic ?? []) {
    const times = magic.count === 1 ? "once" : `${magic.count ?? `${magic.dice}d${magic.sides}`} times`;
    parts.push(`Roll ${times} on ${tableName(data, magic.table)}`);
  }
  if (row.trinket) parts.push(`${data?.trinkets?.[row.trinket]?.name ?? "Fragment of Fate"} trinket`);
  return parts.join("; ");
}

function hoardRecord(data, bandId) {
  const hoard = data?.hoards?.find(entry => entry.id === bandId);
  if (!hoard) throw new Error("Choose a treasure hoard.");
  return hoard;
}

function rowFor(hoard, roll) {
  const row = hoard.rows.find(entry => roll >= entry.min && roll <= entry.max);
  if (!row) throw new Error(`No result on ${hoard.label} for ${roll}.`);
  return row;
}

function tableById(data, id) {
  const table = data.tables.find(entry => entry.id === id);
  if (!table) throw new Error("A treasure hoard references a missing magic item table.");
  return table;
}

function lookup(table, roll) {
  const row = table.rows.find(entry => roll >= entry.min && roll <= entry.max);
  if (!row) throw new Error(`No result on ${table.name} for ${roll}.`);
  return row;
}

/** The item a d100 (and, for a variant row, its own die) gives on a table. */
export function magicItemFor(data, tableId, roll, variantRoll = null) {
  const table = tableById(data, tableId);
  const row = lookup(table, roll);
  if (row.variant && variantRoll == null) return {table, roll, row, pending: row.variant};
  const pick = row.variant ? lookup({name: row.entry, rows: row.variant.rows}, variantRoll) : row;
  return {table, roll, row, variantRoll: row.variant ? variantRoll : null, entry: pick.entry, name: pick.label ?? pick.item, catalogName: pick.item, srdName: pick.srd ?? null, renamed: Boolean(pick.label), swappedFrom: pick.swappedFrom ?? null};
}

export function emptyHoardState(actorId) {
  return {actorId: actorId ?? null, hoardRoll: null, rowText: "", valuable: null, counts: {}, items: [], coins: null, revealed: false, done: false};
}

export function nextHoardStep(data, bandId, state) {
  const hoard = hoardRecord(data, bandId);
  if (state?.hoardRoll == null) return {id: "table", kind: "table", formulas: [`1d${hoard.die ?? 100}`]};
  const row = rowFor(hoard, state.hoardRoll);
  if (row.coins?.length && !state.coins) return {id: "coins", kind: "coins", formulas: row.coins.map(coin => `${coin.dice}d${coin.sides}`), coins: row.coins, prompt: "Coins"};
  if (row.valuables?.length && !state.valuable) {
    const term = row.valuables[0];
    return {id: "valuables", kind: "valuables", formulas: [`${term.dice}d${term.sides}`], term, prompt: term.kind === "gems" ? "Gems" : "Art objects"};
  }
  const pending = (state.items ?? []).find(item => item.pendingVariant);
  if (pending) return {id: `${pending.id}-variant`, kind: "variant", group: pending.group, index: pending.index, formulas: [`1d${pending.pendingVariant}`], table: pending.tableId, prompt: `${pending.entry}: roll 1d${pending.pendingVariant}`};
  for (let group = 0; group < (row.magic ?? []).length; group += 1) {
    const term = row.magic[group];
    const count = term.count ?? state.counts?.[group];
    const name = tableName(data, term.table);
    if (count == null) return {id: `magic-count-${group}`, kind: "magic-count", group, formulas: [`${term.dice}d${term.sides}`], table: term.table, prompt: `${name}: roll ${term.dice}d${term.sides} for how many`};
    const have = (state.items ?? []).filter(item => item.group === group).length;
    if (have < count) return {id: `magic-${group}-${have}`, kind: "magic", group, index: have, count, formulas: [`1d${tableById(data, term.table).die ?? 100}`], table: term.table, prompt: `${name}: item ${have + 1} of ${count}`};
  }
  return null;
}

function formulaBounds(formula) {
  const match = /^(\d+)d(\d+)$/.exec(formula ?? "");
  if (!match) return null;
  const dice = Number(match[1]);
  const sides = Number(match[2]);
  return {dice, sides, min: dice, max: dice * sides};
}

export function readHoardTotal(formula, raw) {
  const bounds = formulaBounds(formula);
  const total = Number(raw?.total ?? raw);
  if (!bounds || !Number.isInteger(total) || total < bounds.min || total > bounds.max) throw new Error(`A ${formula} came up ${raw?.total ?? raw}.`);
  return total;
}

/** The catalog name a magic step's roll lands on (a variant row has none yet). */
export function previewMagicItem(data, step, totals) {
  const hit = magicItemFor(data, step.table, totals[0]);
  return {...hit, name: hit.pending ? "" : hit.catalogName};
}

function copyState(state) {
  return {
    actorId: state?.actorId ?? null,
    hoardRoll: state?.hoardRoll ?? null,
    rowText: state?.rowText ?? "",
    valuable: state?.valuable ? {...state.valuable} : null,
    counts: {...(state?.counts ?? {})},
    items: (state?.items ?? []).map(item => structuredClone(item)),
    coins: state?.coins ? {...state.coins, purse: {...(state.coins.purse ?? {})}} : null,
    trinket: state?.trinket ? structuredClone(state.trinket) : null,
    revealed: state?.revealed === true,
    done: state?.done === true
  };
}

export function applyHoardStep(data, bandId, state, step, totals, scroll = null) {
  const next = copyState(state);
  const hoard = hoardRecord(data, bandId);
  if (step.kind === "table") {
    next.hoardRoll = totals[0];
    const row = rowFor(hoard, totals[0]);
    next.rowText = describeRow(row, data);
    const trinket = row.trinket ? data.trinkets?.[row.trinket] : null;
    if (trinket) next.trinket = {name: trinket.name, quantity: 1, itemData: structuredClone(trinket), source: "Game Master", embeddedUuid: null, granted: false};
    return next;
  }
  const row = rowFor(hoard, next.hoardRoll);
  if (step.kind === "coins") {
    const parts = step.coins.map((coin, index) => ({denomination: coin.denomination, amount: totals[index] * coin.multiplier}));
    const copper = parts.reduce((sum, part) => sum + part.amount * COIN_RATES[part.denomination], 0);
    next.coins = {purse: hoardCoinPurse(copper), copper, granted: false};
    return next;
  }
  if (step.kind === "valuables") {
    const term = row.valuables[0];
    next.valuable = {kind: term.kind, gp: term.each.gp, quantity: totals[0], name: gemArtLabel(term.kind, term.each.gp), compendiumUuid: null, embeddedUuid: null, granted: false};
    return next;
  }
  if (step.kind === "magic-count") {
    next.counts[step.group] = totals[0];
    return next;
  }
  if (step.kind === "variant") {
    const item = next.items.find(entry => entry.pendingVariant);
    Object.assign(item, itemRecord(magicItemFor(data, item.tableId, item.roll, totals[0]), null), {id: item.id, group: item.group, index: item.index});
    return next;
  }
  const hit = magicItemFor(data, step.table, totals[0]);
  next.items.push({id: step.id, group: step.group, index: step.index, ...itemRecord(hit, scroll)});
  return next;
}

function itemRecord(hit, scroll) {
  const base = {tableId: hit.table.id, tableName: hit.table.name, roll: hit.roll, quantity: 1, compendiumUuid: null, source: null, embeddedUuid: null, granted: false, unresolved: false};
  if (hit.pending) return {...base, entry: hit.row.entry, name: hit.row.entry, catalogName: null, pendingVariant: hit.pending.die, spell: null, scrollData: null};
  const level = spellScrollLevel(hit.catalogName);
  const spell = level != null && scroll?.spell?.name && scroll?.spell?.uuid ? {name: String(scroll.spell.name), uuid: String(scroll.spell.uuid), level} : null;
  return {
    ...base,
    entry: hit.entry,
    name: spell ? spellScrollLabel(level, spell.name) : (level != null ? spellScrollLabel(level) : hit.name),
    catalogName: hit.catalogName,
    srdName: hit.srdName,
    renamed: hit.renamed,
    swappedFrom: hit.swappedFrom,
    variantDie: hit.row.variant?.die ?? null,
    variantRoll: hit.variantRoll,
    pendingVariant: null,
    spell,
    scrollData: level != null && scroll?.itemData && typeof scroll.itemData === "object" ? scroll.itemData : null
  };
}

/** Copper total as one purse entry. At least 1 gp is awarded in gp, rounded to
 *  the nearest gp. Below that, at least 1 sp is awarded in sp. Anything under
 *  1 sp stays cp. pp and ep are never awarded. */
export function hoardCoinPurse(copper) {
  const cp = Math.max(0, Math.floor(Number(copper) || 0));
  if (!cp) return {};
  if (cp >= 100) return {gp: Math.max(1, Math.round(cp / 100))};
  if (cp >= 10) return {sp: Math.max(1, Math.round(cp / 10))};
  return {cp};
}

export function formatHoardCoins(purse) {
  if (purse?.gp) return `${purse.gp.toLocaleString()} GP`;
  if (purse?.sp) return `${purse.sp.toLocaleString()} SP`;
  if (purse?.cp) return `${purse.cp.toLocaleString()} CP`;
  return "";
}

/** Uses Core's exact-denomination helper when it exists. Otherwise adds n to
 *  system.currency for that one denomination. */
function coreApi(api = globalThis.MorelordCore) {
  return api ?? globalThis.game?.modules?.get?.("morelord-core")?.api ?? null;
}

/** One denomination, via Core's addCoins when that function exists.
 *  Older Core builds add that coin with actor.update. */
export async function addHoardCoins(actor, purse, api = coreApi()) {
  const coins = {};
  for (const denom of AWARD_DENOMS) {
    const amount = Math.floor(Number(purse?.[denom]) || 0);
    if (amount > 0) coins[denom] = amount;
  }
  if (!actor || !Object.keys(coins).length) return false;
  if (typeof api?.currency?.addCoins === "function") {
    await api.currency.addCoins(actor, coins);
    return true;
  }
  const current = actor.system?.currency ?? {};
  const update = {};
  for (const [denom, amount] of Object.entries(coins)) update[`system.currency.${denom}`] = Math.floor(Number(current[denom]) || 0) + amount;
  await actor.update(update);
  return true;
}

export function needsGmPlace(user, actor) {
  if (user?.isGM) return false;
  const owner = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? "OWNER";
  return actor?.testUserPermission?.(user, owner) !== true;
}

export function spellScrollGenerator() {
  const module = globalThis.game?.modules?.get?.("morelord-craftworks");
  if (!module?.active) return null;
  const gen = module.api?.spellScrollGenerator;
  if (!gen?.hasAccess || typeof gen.randomSpell !== "function") return null;
  return gen;
}

export async function resolveSpellScroll(catalogName) {
  const level = spellScrollLevel(catalogName);
  if (level == null) return null;
  const gen = spellScrollGenerator();
  if (!gen) return {level, spell: null, itemData: null};
  try {
    const spell = await gen.randomSpell(level);
    if (!spell?.name || !spell.uuid) return {level, spell: null, itemData: null};
    const picked = {name: String(spell.name), uuid: String(spell.uuid), level: Number(spell.level ?? level)};
    let itemData = null;
    if (typeof gen.createScrollItem === "function") {
      try {
        const created = await gen.createScrollItem({spellUuid: picked.uuid, level: picked.level});
        const raw = created?.item?.toObject?.() ?? null;
        if (raw && typeof raw === "object") {
          itemData = structuredClone(raw);
          delete itemData._id;
        }
      } catch (error) {
        console.warn("Morelord Game Master | Spell scroll item", error);
      }
    }
    return {level, spell: picked, itemData};
  } catch (error) {
    console.warn("Morelord Game Master | Spell scroll", error);
    return {level, spell: null, itemData: null};
  }
}

function indexRows(entries) {
  if (!entries) return [];
  if (Array.isArray(entries)) return entries;
  return [...entries];
}

/** Packs searched for treasure items, first match wins: 2024 DMG, 2024 PHB, SRD 5.2. */
export const ITEM_PACKS = [
  {collection: "dnd-dungeon-masters-guide.equipment", source: "Dungeon Master's Guide (2024)"},
  {collection: "dnd-players-handbook.equipment", source: "Player's Handbook (2024)"},
  {collection: "dnd5e.equipment24", source: "SRD 5.2"}
];

export async function srdItemIndex(packs = globalThis.game?.packs) {
  const all = [...(packs ?? [])];
  const index = new Map();
  for (const {collection, source} of ITEM_PACKS) {
    const pack = all.find(entry => entry?.collection === collection && entry?.documentName === "Item");
    if (!pack) continue;
    let entries;
    try {
      entries = await pack.getIndex({fields: ["name", "img", "type"]});
    } catch (error) {
      try { entries = await pack.getIndex(); }
      catch (retry) {
        console.warn(`Morelord Game Master | Unable to index ${pack.collection}.`, retry ?? error);
        continue;
      }
    }
    for (const entry of indexRows(entries)) {
      const key = lookupKey(entry?.name);
      if (!key || index.has(key)) continue;
      index.set(key, {
        name: entry.name,
        uuid: entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}`,
        img: entry.img ?? "",
        type: entry.type ?? "loot",
        source
      });
    }
  }
  return index;
}

export function peekTreasure() {
  return cache ?? null;
}

export async function loadSrdItemIndex() {
  return srdItemIndex();
}

export function findSrdItem(index, name, srdName = null) {
  const direct = index?.get?.(lookupKey(name)) ?? (srdName ? index?.get?.(lookupKey(srdName)) : null);
  if (direct) return direct;
  const level = spellScrollLevel(name);
  if (level == null || !index) return null;
  for (const alias of scrollLookupNames(level)) {
    const hit = index.get(lookupKey(alias));
    if (hit) return hit;
  }
  return null;
}

export function findLootItem(index, kind, gp) {
  const direct = index?.get?.(lookupKey(gemArtLabel(kind, gp)));
  if (direct) return direct;
  const needle = kind === "gems" ? "gem" : "art";
  for (const entry of index?.values?.() ?? []) {
    const key = lookupKey(entry.name);
    if (key.includes(needle) && key.includes(String(gp))) return entry;
  }
  return null;
}

function contentLink(uuid, label, escape) {
  const safe = escape(label);
  if (!uuid) return safe;
  const id = String(uuid).split(".").pop();
  return `<a class="content-link" draggable="true" data-link data-uuid="${escape(uuid)}" data-id="${escape(id)}" data-type="Item" data-tooltip="${safe}">${safe}</a>`;
}

function attachCatalog(state, index) {
  if (state.valuable && !state.valuable.compendiumUuid) {
    const hit = findLootItem(index, state.valuable.kind, state.valuable.gp);
    if (hit) state.valuable.compendiumUuid = hit.uuid;
  }
  for (const item of state.items) {
    if (item.compendiumUuid || item.spell || item.pendingVariant) continue;
    const hit = findSrdItem(index, item.catalogName, item.srdName);
    if (hit) Object.assign(item, {compendiumUuid: hit.uuid, source: hit.source ?? null, unresolved: false});
    else if (!item.warned) {
      item.warned = true;
      item.unresolved = true;
      console.warn(`Morelord Game Master | No compendium item for ${item.catalogName}.`);
    }
  }
}

function lootData(entry) {
  const gems = entry.kind === "gems";
  // Foundry 14.369 core has no icons/commodities/treasure/gem-pile-gold.webp (Dev1 404).
  // Art objects use brooch-crown-gold.webp, the V13.335 rename of broach-crown-gold.webp
  // (foundryvtt#12060), which is still shipped in Foundry 14 core.
  return {
    name: entry.name,
    type: "loot",
    img: gems ? "icons/commodities/gems/gem-faceted-round-white.webp" : "icons/commodities/treasure/brooch-crown-gold.webp",
    system: {quantity: entry.quantity, price: {value: entry.gp, denomination: "gp"}, rarity: "common", identified: true}
  };
}

async function documentData(entry) {
  if (entry.itemData && typeof entry.itemData === "object") {
    const data = structuredClone(entry.itemData);
    delete data._id;
    return data;
  }
  if (entry.scrollData && typeof entry.scrollData === "object") {
    const data = structuredClone(entry.scrollData);
    delete data._id;
    data.system = {...(data.system ?? {}), quantity: entry.quantity ?? 1};
    if (!data.name) data.name = entry.name;
    return data;
  }
  if (entry.spell?.uuid && typeof globalThis.Item?.createScrollFromSpell === "function" && typeof globalThis.fromUuid === "function") {
    try {
      const spell = await fromUuid(entry.spell.uuid);
      if (spell) {
        const scroll = await Item.createScrollFromSpell(spell, {}, {dialog: false, explanation: "reference", level: entry.spell.level});
        if (scroll?.toObject) {
          const data = scroll.toObject();
          delete data._id;
          data.system = {...(data.system ?? {}), quantity: 1};
          return data;
        }
      }
    } catch (error) {
      console.warn("Morelord Game Master | Spell scroll", error);
    }
  }
  const uuid = entry.compendiumUuid;
  if (uuid && typeof globalThis.fromUuid === "function") {
    try {
      const document = await fromUuid(uuid);
      if (document?.toObject) {
        const data = document.toObject();
        delete data._id;
        data.system = {...(data.system ?? {}), quantity: entry.quantity ?? 1};
        if (entry.renamed) data.name = entry.name;
        return data;
      }
    } catch (error) {
      console.warn("Morelord Game Master | Treasure item", error);
    }
  }
  if (entry.kind) return lootData(entry);
  return null;
}

async function grantRecord(entry, placeItem) {
  if (!entry || entry.granted || entry.pendingVariant) return;
  const data = await documentData(entry);
  if (!data) {
    entry.unresolved = true;
    return;
  }
  const created = await placeItem(data);
  if (!created?.uuid) return;
  delete entry.scrollData;
  entry.embeddedUuid = created.uuid;
  entry.granted = true;
  entry.unresolved = false;
}

export async function grantHoardAwards(state, {placeItem, addCoins}) {
  if (state.coins?.purse && !state.coins.granted && Object.keys(state.coins.purse).length) {
    await addCoins(state.coins.purse);
    state.coins.granted = true;
  }
  await grantRecord(state.valuable, placeItem);
  await grantRecord(state.trinket, placeItem);
  for (const item of state.items) await grantRecord(item, placeItem);
  return state;
}

// The rolling player's own client shows the dice, so they use that player's colors and dice set.
// `users` limits who sees them; null shows everyone.
export async function showHoardDice(rolls, users = null) {
  const dice = globalThis.game?.dice3d;
  if (typeof dice?.showForRoll !== "function" || !rolls?.length) return;
  for (const roll of rolls) {
    try { await dice.showForRoll(roll, globalThis.game.user, true, users, false); }
    catch (error) { console.warn("Morelord Game Master | Dice animation", error); }
  }
}

export async function commitHoardStep({data, bandId, state, stepId = null, totals, scroll = null, index = new Map(), placeItem = async () => null, addCoins = async () => false}) {
  const step = nextHoardStep(data, bandId, state);
  if (!step || (stepId && stepId !== "next" && stepId !== step.id)) return {state: copyState(state), step, alreadyResolved: true};
  if (!Array.isArray(totals) || totals.length !== step.formulas.length) throw new Error("The treasure roll did not match this step.");
  const next = applyHoardStep(data, bandId, state, step, totals, scroll);
  attachCatalog(next, index);
  await grantHoardAwards(next, {placeItem, addCoins});
  next.done = nextHoardStep(data, bandId, next) == null;
  return {state: next, step, alreadyResolved: false};
}


function itemLine(item, escape) {
  const variant = item.variantRoll != null ? `, d${item.variantDie}: ${item.variantRoll}` : "";
  const detail = `${escape(item.tableName)} (d100: ${item.roll}${variant})`;
  const link = contentLink(item.embeddedUuid || item.compendiumUuid || item.spell?.uuid, item.name, escape);
  const source = item.pendingVariant ? "" : item.spell ? " (Craftworks)" : item.source ? ` (${escape(item.source)})` : item.embeddedUuid || item.compendiumUuid ? "" : " (text only)";
  return `<li>${detail}: ${link}${source}</li>`;
}

export function hoardCardHTML({title, identity = "", state, step = null, allowRoll = false, escape}) {
  const rolled = state?.hoardRoll != null;
  const prompt = step?.prompt ? `<p>${escape(step.prompt)}</p>` : "";
  const button = allowRoll && step ? `${prompt}<button type="button" data-mlgm-hoard-step="${escape(step.id)}">Roll</button>` : "";
  const coins = state?.coins ? `<p><strong>Coins</strong><br>${escape(formatHoardCoins(state.coins.purse) || "None")}${state.coins.granted ? "<br>Added to the purse." : ""}</p>` : "";
  const valuable = state?.valuable ? `<p><strong>${state.valuable.kind === "gems" ? "Gems" : "Art objects"}</strong><br>${state.valuable.quantity} × ${contentLink(state.valuable.embeddedUuid || state.valuable.compendiumUuid, state.valuable.name, escape)}</p>` : "";
  const planned = Object.values(state?.counts ?? {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
  const items = state?.items?.length ? `<p><strong>Magic items${planned > 1 ? ` (${state.items.length} of ${planned})` : ""}</strong></p><ul>${state.items.map(item => itemLine(item, escape)).join("")}</ul>` : "";
  const row = rolled ? `<p>Hoard roll: ${state.hoardRoll}</p><p>${escape(state.rowText)}</p>` : "";
  const trinket = state?.trinket ? `<p><strong>Trinket</strong><br>${contentLink(state.trinket.embeddedUuid, state.trinket.name, escape)} (${escape(state.trinket.source)})</p>` : "";
  return `<section class="ml-chat-card ml-stack mlgm-hoard"><h3>${escape(title)}</h3>${identity}${row}${coins}${valuable}${items}${trinket}${button}</section>`;
}

