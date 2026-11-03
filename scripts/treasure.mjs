// SRD 5.2.1 has coin denominations and magic item names. It does not publish
// treasure hoard roll tables, so the hoard rows in data/srd-treasure.json are
// this module's arrangement of that material.

export const HOARD_BANDS = [
  {id: "cr-0-4", label: "CR 0-4"},
  {id: "cr-5-10", label: "CR 5-10"}
];

const DENOMINATIONS = ["cp", "sp", "ep", "gp", "pp"];
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

export function auditTreasure(data, bands = HOARD_BANDS) {
  const problems = [];
  const tables = new Map((data?.tables ?? []).map(table => [table.id, table]));
  if (tables.size !== (data?.tables ?? []).length) problems.push("A magic item table id is repeated.");
  for (const table of tables.values()) {
    const issues = rangeIssues(table.rows, table.die);
    if (table.die !== 100) problems.push(`${table.name} does not roll a d100.`);
    if (issues.length) problems.push(`${table.name} does not cover its die: ${issues.slice(0, 8).join(", ")}.`);
    const names = new Set();
    for (const row of table.rows ?? []) {
      if (!row.name || names.has(row.name)) problems.push(`${table.name} has a missing or repeated item.`);
      names.add(row.name);
    }
  }
  const hoards = data?.hoards ?? [];
  if (hoards.map(hoard => hoard.id).join() !== bands.map(band => band.id).join()) problems.push("Hoard ids do not match the request bands.");
  for (const hoard of hoards) {
    const issues = rangeIssues(hoard.rows, hoard.die ?? 100);
    if (issues.length) problems.push(`${hoard.label} does not cover its die: ${issues.slice(0, 8).join(", ")}.`);
    for (const coin of hoard.coins ?? []) if (!DENOMINATIONS.includes(coin.denomination) || !positive(coin.dice) || !positive(coin.sides, 2) || !positive(coin.multiplier)) problems.push(`${hoard.label} has a coin term that is not structured dice.`);
    for (const row of hoard.rows ?? []) {
      for (const valuable of row.valuables ?? []) if (!["gems", "art"].includes(valuable.kind) || !positive(valuable.dice) || !positive(valuable.sides, 2) || !positive(valuable.each?.gp)) problems.push(`${hoard.label} has a gem or art term that is not structured dice.`);
      for (const magic of row.magic ?? []) {
        if (!magic.tables?.length || magic.tables.some(id => !tables.has(id))) problems.push(`${hoard.label} references a missing magic item table.`);
        if (!positive(magic.count) && !(positive(magic.dice) && positive(magic.sides, 2))) problems.push(`${hoard.label} has a magic roll without a count.`);
      }
    }
  }
  return problems;
}

function positive(value, minimum = 1) {
  return Number.isInteger(value) && value >= minimum;
}

function emptyPurse() {
  return Object.fromEntries(DENOMINATIONS.map(key => [key, 0]));
}

async function rollCount(term, next) {
  if (positive(term.count)) return term.count;
  let total = 0;
  const faces = [];
  for (let die = 0; die < term.dice; die += 1) {
    const face = await next(term.sides);
    faces.push(face);
    total += face;
  }
  return {total, faces};
}

function lookup(table, roll) {
  const row = table.rows.find(entry => roll >= entry.min && roll <= entry.max);
  if (!row) throw new Error(`No result on ${table.name} for ${roll}.`);
  return row;
}

export async function resolveHoard(bandId, next, data = null) {
  const tables = data ?? await loadTreasure();
  const hoard = tables.hoards.find(entry => entry.id === bandId);
  if (!hoard) throw new Error("Choose a treasure hoard.");
  const byId = new Map(tables.tables.map(table => [table.id, table]));
  const hoardRoll = await next(hoard.die ?? 100);
  const row = lookup({name: hoard.label, rows: hoard.rows}, hoardRoll);
  const coins = emptyPurse();
  const coinGroups = [];
  for (const term of hoard.coins ?? []) {
    const rolled = await rollCount(term, next);
    const amount = rolled.total * term.multiplier;
    coins[term.denomination] += amount;
    coinGroups.push({denomination: term.denomination, dice: term.dice, sides: term.sides, multiplier: term.multiplier, faces: rolled.faces, amount});
  }
  const valuables = [];
  for (const term of row.valuables ?? []) {
    const rolled = await rollCount(term, next);
    valuables.push({kind: term.kind, count: rolled.total, faces: rolled.faces, each: {...term.each}});
  }
  const items = [];
  for (const term of row.magic ?? []) {
    const rolled = await rollCount({count: term.count, dice: term.dice, sides: term.sides}, next);
    const count = rolled.total ?? rolled;
    const countFaces = rolled.faces ?? [];
    for (let index = 0; index < count; index += 1) {
      let tableId = term.tables[0];
      let choice = null;
      if (term.tables.length > 1) {
        choice = await next(term.tables.length);
        tableId = term.tables[choice - 1];
      }
      const table = byId.get(tableId);
      if (!table) throw new Error("A treasure hoard references a missing magic item table.");
      const roll = await next(table.die);
      const result = lookup(table, roll);
      items.push({tableId, tableName: table.name, roll, name: result.name, choice, countFaces});
    }
  }
  return {bandId: hoard.id, bandLabel: hoard.label, hoardRoll, coins, coinGroups, valuables, items};
}

const DENOMINATION_LABEL = {cp: "CP", sp: "SP", ep: "EP", gp: "GP", pp: "PP"};

export function treasureHTML(result, {actorName, copper, granted, escape}) {
  const coins = DENOMINATIONS.filter(key => result.coins[key] > 0).map(key => `${result.coins[key].toLocaleString()} ${DENOMINATION_LABEL[key]}`).join(", ") || "None";
  const coinDice = result.coinGroups.map(group => `${group.dice}d${group.sides} (${group.faces.join(", ")}) × ${group.multiplier} = ${group.amount.toLocaleString()} ${DENOMINATION_LABEL[group.denomination]}`).join("<br>");
  const valuableText = result.valuables.length ? result.valuables.map(entry => {
    const label = entry.kind === "gems" ? (entry.count === 1 ? "gem" : "gems") : (entry.count === 1 ? "art object" : "art objects");
    return `${entry.count} ${label} (${entry.each.gp.toLocaleString()} GP each)`;
  }).join("<br>") : "None";
  const itemText = result.items.length ? `<ul>${result.items.map(item => `<li>${escape(item.tableName)} (${item.roll}): ${escape(item.name)}</li>`).join("")}</ul>` : "<p>None</p>";
  const grant = granted ? `<p>Added to ${escape(actorName)}.</p>` : "";
  const value = copper == null ? "" : `<p>Copper value: ${copper.toLocaleString()}</p>`;
  return `<section class="ml-chat-card ml-stack"><h3>Treasure Hoard · ${escape(result.bandLabel)} · ${escape(actorName)}</h3><p>Hoard roll: ${result.hoardRoll}</p><p><strong>Coins</strong><br>${coinDice}<br>${escape(coins)}</p>${value}${grant}<p><strong>Gems and art objects</strong><br>${valuableText}</p><p><strong>Magic items</strong></p>${itemText}</section>`;
}
