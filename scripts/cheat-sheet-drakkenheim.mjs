import { escapeHTML as e } from "./core.mjs";

export const DRAKKENHEIM_CORE_MODULE_ID = "drakkenheim-core";
export const DRAKKENHEIM_MONSTERS_MODULE_ID = "drakkenheim-monsters";
export const DRAKKENHEIM_CONTENT_PACK_ID = "monsters-of-drakkenheim";
const SOURCE_MODULES = [DRAKKENHEIM_CORE_MODULE_ID, DRAKKENHEIM_MONSTERS_MODULE_ID];

export const DRAKKENHEIM_STRINGS = [
  ["group.drakkenheim", "Drakkenheim"],
  ["section.drakkenheim-contamination", "Contamination"],
  ["section.drakkenheim-search", "Delerium search"],
  ["section.drakkenheim-values", "Delerium values"],
  ["section.drakkenheim-mutations", "Mutations"],
  ["section.drakkenheim-madness", "Madness"]
];

const CONTAMINATION_NAMES = new Set([
  "contamination",
  "contamination symptoms",
  "eldritch contamination",
  "appendix c: contamination"
]);

let sections = [];
let appliedKey = null;
let pendingKey = null;

export function drakkenheimSections() {
  return sections;
}

export function setDrakkenheimSections(next = []) {
  sections = next ?? [];
}

export function resetDrakkenheimCheat() {
  sections = [];
  appliedKey = null;
  pendingKey = null;
}

export function drakkenheimContentActive(game = globalThis.game) {
  const craftworks = game?.modules?.get?.("morelord-craftworks");
  if (!craftworks?.active) return false;
  try {
    const search = craftworks.api?.deleriumSearch;
    if (search && "hasAccess" in search) return Boolean(search.hasAccess);
    const enabled = craftworks.api?.contentPacks?.enabled?.({ capability: "delerium-search" }) ?? [];
    return [...enabled].some(pack => pack?.id === DRAKKENHEIM_CONTENT_PACK_ID);
  } catch {
    return false;
  }
}

export function scheduleDrakkenheimCheat(rerender, game = globalThis.game) {
  const key = drakkenheimContentActive(game) ? "on" : "off";
  if (appliedKey === key || pendingKey === key) return;
  pendingKey = key;
  collectDrakkenheimSections(game).then(found => {
    if (pendingKey !== key) return;
    setDrakkenheimSections(key === "on" ? found : []);
    appliedKey = key;
    pendingKey = null;
    rerender?.();
  }).catch(() => {
    if (pendingKey !== key) return;
    setDrakkenheimSections([]);
    appliedKey = key;
    pendingKey = null;
    rerender?.();
  });
}

export async function collectDrakkenheimSections(game = globalThis.game) {
  if (!drakkenheimContentActive(game)) return [];
  try {
    const [contamination, topics, search] = await Promise.all([
      collectContaminationSections(game),
      collectTopicSections(game),
      Promise.resolve(searchSections(game))
    ]);
    const byId = new Map();
    for (const section of [...contamination, ...search, ...topics]) {
      if (!section?.items?.length) continue;
      const existing = byId.get(section.id);
      if (!existing) byId.set(section.id, { ...section, items: [...section.items] });
      else existing.items.push(...section.items);
    }
    const order = ["drakkenheim-contamination", "drakkenheim-search", "drakkenheim-values", "drakkenheim-mutations", "drakkenheim-madness"];
    return order.map(id => byId.get(id)).filter(Boolean);
  } catch {
    return [];
  }
}

export async function collectContaminationSections(game = globalThis.game) {
  if (!drakkenheimContentActive(game)) return [];
  try {
    const journal = await contaminationFromJournals(game);
    const chips = journal.length ? journal : await contaminationFromTables(game);
    if (!chips.length) return [];
    return [{
      id: "drakkenheim-contamination",
      origin: "drakkenheim",
      items: chips
    }];
  } catch {
    return [];
  }
}

export async function openDrakkenheimDocument(uuid, pageId, game = globalThis) {
  if (!uuid) return false;
  const fromUuid = game.fromUuid ?? globalThis.fromUuid;
  if (typeof fromUuid !== "function") return false;
  const document = await fromUuid(uuid);
  if (!document) return false;
  const page = pageId ? document.pages?.get?.(pageId) : null;
  const sheet = page?.sheet ?? document.sheet;
  if (typeof sheet?.render !== "function") return false;
  await sheet.render(true, pageId ? { pageId } : {});
  return true;
}

async function contaminationFromJournals(game) {
  const chips = [];
  for (const pack of modulePacks(game, "JournalEntry")) {
    let index = [];
    try { index = listOf(await pack.getIndex?.()); }
    catch { continue; }
    for (const row of index) {
      if (!/contaminat|appendix c/i.test(row?.name ?? "")) continue;
      let entry;
      try { entry = await pack.getDocument?.(row._id ?? row.id); }
      catch { continue; }
      if (!entry) continue;
      chips.push(...chipsFromEntry(pack, entry));
    }
  }
  return uniqueLevels(chips);
}

async function contaminationFromTables(game) {
  const chips = [];
  for (const pack of modulePacks(game, "RollTable")) {
    let index = [];
    try { index = listOf(await pack.getIndex?.()); }
    catch { continue; }
    for (const row of index) {
      if (!nameMatches(row?.name)) continue;
      let table;
      try { table = await pack.getDocument?.(row._id ?? row.id); }
      catch { continue; }
      if (!table) continue;
      const path = documentPath(pack, table.name);
      const uuid = table.uuid || compendiumUuid(pack, "RollTable", table.id ?? row._id);
      const results = listOf(table.results?.contents ?? table.results);
      const levels = results.flatMap(result => {
        const label = strip(result.name || result.text || "");
        const level = levelNumber(label) || levelNumber(String(result.range?.[0] ?? ""));
        if (!level) return [];
        const text = strip(result.description || result.text || "");
        return text ? [{ level, label: label || `Level ${level}`, text }] : [];
      });
      const chosen = levels.length ? levels : [{ label: table.name, text: strip(table.description) }];
      for (const part of chosen) {
        if (!part.text) continue;
        chips.push(chip({
          id: part.level ? `contamination-level-${part.level}` : "contamination-symptoms",
          label: part.label,
          text: part.text,
          uuid,
          path
        }));
      }
    }
  }
  return uniqueLevels(chips);
}

function chipsFromEntry(pack, entry) {
  const pages = listOf(entry.pages?.contents ?? entry.pages);
  const named = pages.filter(page => nameMatches(page?.name));
  const chosen = named.length ? named : (nameMatches(entry.name) ? pages : []);
  const chips = [];
  for (const page of chosen) {
    const html = page?.text?.content || page?.text?.markdown || "";
    const path = documentPath(pack, entry.name, page?.name);
    const uuid = page?.uuid || entry.uuid || compendiumUuid(pack, "JournalEntry", entry.id);
    const levels = contaminationLevelsFromHTML(html);
    if (levels.length) {
      for (const level of levels) {
        if (!level.text) continue;
        chips.push(chip({
          id: `contamination-level-${level.level}`,
          label: level.label,
          text: level.text,
          uuid,
          pageId: page?.id ?? "",
          path
        }));
      }
      continue;
    }
    const text = strip(html);
    if (!text) continue;
    chips.push(chip({
      id: "contamination-symptoms",
      label: page?.name || entry.name,
      text,
      uuid,
      pageId: page?.id ?? "",
      path
    }));
  }
  return chips;
}

export function contaminationLevelsFromHTML(html) {
  const source = String(html ?? "");
  const headings = [...source.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>([\s\S]*?)(?=<h[1-6][^>]*>|$)/gi)];
  const fromHeadings = headings.flatMap(match => {
    const label = strip(match[1]);
    const level = levelNumber(label);
    if (!level) return [];
    return [{ level, label, text: strip(match[2]) }];
  });
  if (fromHeadings.length) return fromHeadings;
  const fromTable = [];
  for (const row of source.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => strip(cell[1]));
    const level = levelNumber(cells[0] ?? "");
    if (!level) continue;
    const text = cells.slice(1).join(" ").trim();
    if (text) fromTable.push({ level, label: cells[0], text });
  }
  return fromTable;
}

function searchSections(game) {
  const search = game?.modules?.get?.("morelord-craftworks")?.api?.deleriumSearch;
  if (!search?.hasAccess || typeof search.getZones !== "function") return [];
  let zones = [];
  let skills = [];
  try { zones = search.getZones() ?? []; }
  catch { return []; }
  try { skills = typeof search.getSkillOptions === "function" ? search.getSkillOptions() ?? [] : []; }
  catch { skills = []; }
  const skillText = joinOr(skills.map(skill => skill?.label).filter(Boolean));
  const items = [];
  for (const zone of zones) {
    if (!zone?.name || zone.dc == null) continue;
    const text = skillText ? `DC ${zone.dc}. Search with ${skillText}.` : `DC ${zone.dc}.`;
    items.push(chip({
      id: `delerium-search-${slug(zone.id || zone.name)}`,
      label: zone.name,
      text,
      path: "morelord-craftworks:delerium-search"
    }));
  }
  return items.length ? [{ id: "drakkenheim-search", origin: "drakkenheim", items }] : [];
}

async function collectTopicSections(game) {
  const grouped = { transformation: [], search: [], values: [], mutations: [], madness: [] };
  await collectJournalTopics(game, grouped);
  await collectTableTopics(game, grouped);
  await collectValueItems(game, grouped);
  return [
    topicSection("drakkenheim-contamination", grouped.transformation),
    topicSection("drakkenheim-search", grouped.search),
    topicSection("drakkenheim-values", grouped.values),
    topicSection("drakkenheim-mutations", grouped.mutations),
    topicSection("drakkenheim-madness", grouped.madness)
  ].filter(Boolean);
}

function topicSection(id, items) {
  const unique = uniqueLevels(items);
  return unique.length ? { id, origin: "drakkenheim", items: unique } : null;
}

async function collectJournalTopics(game, grouped) {
  for (const pack of modulePacks(game, "JournalEntry", SOURCE_MODULES)) {
    let index = [];
    try { index = listOf(await pack.getIndex?.()); }
    catch { continue; }
    for (const row of index) {
      if (!/contaminat|appendix|deleri|deliri|madness|mutation|crystal|search|prospect/i.test(row?.name ?? "")) continue;
      let entry;
      try { entry = await pack.getDocument?.(row._id ?? row.id); }
      catch { continue; }
      if (!entry) continue;
      const pages = listOf(entry.pages?.contents ?? entry.pages);
      const entryTopic = pageTopic(entry.name);
      const targets = pages.length ? pages : [entry];
      for (const page of targets) {
        const topic = pageTopic(page?.name) || entryTopic;
        if (!topic || !grouped[topic]) continue;
        grouped[topic].push(...partsToChips(pack, entry, page === entry ? entry : page, topic));
      }
    }
  }
}

async function collectTableTopics(game, grouped) {
  for (const pack of modulePacks(game, "RollTable", SOURCE_MODULES)) {
    let index = [];
    try { index = listOf(await pack.getIndex?.()); }
    catch { continue; }
    for (const row of index) {
      const topic = pageTopic(row?.name);
      if (!topic || !grouped[topic]) continue;
      let table;
      try { table = await pack.getDocument?.(row._id ?? row.id); }
      catch { continue; }
      if (!table) continue;
      grouped[topic].push(...tableToChips(pack, table, topic));
    }
  }
}

async function collectValueItems(game, grouped) {
  for (const pack of modulePacks(game, "Item", SOURCE_MODULES)) {
    let index = [];
    try { index = listOf(await pack.getIndex?.()); }
    catch { continue; }
    for (const row of index) {
      if (!/^deleri(?:um|ium)\b/i.test(row?.name ?? "")) continue;
      let item;
      try { item = await pack.getDocument?.(row._id ?? row.id); }
      catch { continue; }
      if (!item) continue;
      const price = priceText(item.system);
      const rawDescription = item.system?.description?.value ?? item.system?.description;
      const description = typeof rawDescription === "string" ? strip(rawDescription) : "";
      const text = [price ? `Price: ${price}.` : "", description].filter(Boolean).join(" ");
      if (!text) continue;
      grouped.values.push(chip({
        id: `delerium-value-${slug(item.name)}`,
        label: item.name,
        text,
        uuid: item.uuid || compendiumUuid(pack, "Item", item.id ?? row._id),
        path: documentPath(pack, item.name)
      }));
    }
  }
}

function partsToChips(pack, entry, page, topic) {
  const html = page?.text?.content || page?.text?.markdown || "";
  const path = documentPath(pack, entry.name || page?.name, page?.name && page !== entry ? page.name : "");
  const uuid = page?.uuid || entry.uuid || compendiumUuid(pack, "JournalEntry", entry.id);
  const pageId = page !== entry ? (page?.id ?? "") : "";
  const parts = structuredParts(html);
  const chosen = parts.length ? parts : [];
  return chosen.flatMap((part, index) => {
    if (!part.text) return [];
    const label = part.label || page?.name || entry.name;
    return [chip({
      id: `${topic}-${slug(label)}-${index}`,
      label,
      text: part.text,
      uuid,
      pageId,
      path
    })];
  });
}

function tableToChips(pack, table, topic) {
  const path = documentPath(pack, table.name);
  const uuid = table.uuid || compendiumUuid(pack, "RollTable", table.id);
  const results = listOf(table.results?.contents ?? table.results);
  const chips = results.flatMap((result, index) => {
    const label = strip(result.name || result.text || "") || table.name;
    const description = strip(result.description || "");
    const text = description && description !== label ? description : strip(result.text || description || label);
    if (!text) return [];
    return [chip({ id: `${topic}-${slug(label)}-${index}`, label, text, uuid, path })];
  });
  if (chips.length) return chips;
  const text = strip(table.description);
  return text ? [chip({ id: `${topic}-${slug(table.name)}-0`, label: table.name, text, uuid, path })] : [];
}

function structuredParts(html) {
  const source = String(html ?? "");
  const headings = [...source.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>([\s\S]*?)(?=<h[1-6][^>]*>|$)/gi)];
  const fromHeadings = headings.flatMap(match => {
    const label = strip(match[1]);
    const text = strip(match[2]);
    return label && text ? [{ label, text }] : [];
  });
  if (fromHeadings.length) return fromHeadings;
  const fromTable = [];
  for (const row of source.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => strip(cell[1])).filter(Boolean);
    if (cells.length < 2) continue;
    const numbered = /^\d+$/.test(cells[0]);
    const label = numbered ? cells[1] : cells[0];
    const text = cells.slice(numbered ? 2 : 1).join(" ").trim();
    if (label && text) fromTable.push({ label, text });
  }
  if (fromTable.length) return fromTable;
  const items = [...source.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(match => strip(match[1])).filter(Boolean);
  if (items.length >= 2) {
    return items.map(text => {
      const split = text.match(/^(.{2,60}?)(?:\.|:)\s+\S/);
      return { label: split ? split[1] : text.slice(0, 60), text };
    });
  }
  const text = strip(source);
  return text ? [{ label: "", text }] : [];
}

export function pageTopic(name) {
  const normalized = normalize(name);
  if (!normalized) return "";
  if (/monstrous transformation/.test(normalized)) return "transformation";
  if (/mutation/.test(normalized)) return "mutations";
  if (/madness/.test(normalized)) return "madness";
  if (/deleri/.test(normalized) && /search|prospect/.test(normalized)) return "search";
  if (/deleri/.test(normalized) && /value|crystal|price|worth/.test(normalized)) return "values";
  if (normalized === "delerium" || normalized === "delirium") return "values";
  return "";
}

function joinOr(labels) {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, or ${labels.at(-1)}`;
}

function slug(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "entry";
}

function priceText(system) {
  const price = system?.price;
  if (price == null || price === "") return "";
  if (typeof price === "number" && Number.isFinite(price)) return `${price} GP`;
  if (typeof price === "string") return price.trim();
  if (typeof price !== "object") return "";
  if (price.value != null && price.value !== "" && price.denomination) return `${price.value} ${String(price.denomination).toUpperCase()}`;
  const coins = ["pp", "gp", "ep", "sp", "cp"].filter(coin => price[coin]).map(coin => `${price[coin]} ${coin.toUpperCase()}`);
  return coins.join(", ");
}

function chip({ id, label, text, uuid, pageId = "", path }) {
  const excerpt = text.length > 320 ? `${text.slice(0, 320).trim()}…` : text;
  return {
    id,
    origin: "drakkenheim",
    labelText: label,
    tipHTML: `<div class="mlgm-cheat-tip__body"><p><strong>${e(label)}</strong></p><p>${e(excerpt)}</p></div>`,
    uuid,
    pageId,
    documentPath: path
  };
}

function uniqueLevels(chips) {
  const seen = new Set();
  const unique = [];
  for (const chip of chips) {
    if (seen.has(chip.id)) continue;
    seen.add(chip.id);
    unique.push(chip);
  }
  return unique.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function modulePacks(game, documentName, owners = [DRAKKENHEIM_CORE_MODULE_ID]) {
  const allowed = new Set(owners);
  return listOf(game?.packs).filter(pack => {
    if (pack?.documentName !== documentName) return false;
    const owner = pack.metadata?.packageName || pack.metadata?.package || String(pack.collection ?? "").split(".")[0];
    return allowed.has(owner);
  });
}

function nameMatches(name) {
  return CONTAMINATION_NAMES.has(normalize(name));
}

function normalize(name) {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function levelNumber(label) {
  const match = String(label ?? "").trim().match(/^(?:contamination\s+)?level\s+(\d+)\b/i) || String(label ?? "").trim().match(/^(\d+)$/);
  const level = Number(match?.[1]);
  return level >= 1 && level <= 12 ? level : 0;
}

function strip(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function listOf(value) {
  if (!value) return [];
  return typeof value[Symbol.iterator] === "function" ? [...value] : [];
}

function documentPath(pack, entryName, pageName = "") {
  const collection = pack.collection || `${DRAKKENHEIM_CORE_MODULE_ID}.${pack.metadata?.name || pack.metadata?.id || "journals"}`;
  return pageName ? `${collection}:${entryName} / ${pageName}` : `${collection}:${entryName}`;
}

function compendiumUuid(pack, documentName, id) {
  const collection = pack.collection || `${DRAKKENHEIM_CORE_MODULE_ID}.${pack.metadata?.name || "journals"}`;
  return `Compendium.${collection}.${documentName}.${id}`;
}
