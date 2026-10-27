import { escapeHTML as e } from "./core.mjs";

export const DRAKKENHEIM_CORE_MODULE_ID = "drakkenheim-core";
export const DRAKKENHEIM_MONSTERS_MODULE_ID = "drakkenheim-monsters";
export const DRAKKENHEIM_SCGD_MODULE_ID = "drakkenheim-scgd";
export const DRAKKENHEIM_MODULE_IDS = Object.freeze([
  DRAKKENHEIM_CORE_MODULE_ID,
  DRAKKENHEIM_MONSTERS_MODULE_ID,
  DRAKKENHEIM_SCGD_MODULE_ID
]);
const SOURCE_MODULES = DRAKKENHEIM_MODULE_IDS;

export const DRAKKENHEIM_STRINGS = [
  ["loading", "Loading…"],
  ["section.drakkenheim", "Drakkenheim"],
  ["item.contamination.label", "Contamination"],
  ["item.delerium-search.label", "Delerium Search"],
  ["item.delerium.label", "Delerium"]
];

const SKILL_NAMES = Object.freeze([
  "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History",
  "Insight", "Intimidation", "Investigation", "Medicine", "Nature", "Perception",
  "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"
]);
const CHIP_ORDER = Object.freeze(["contamination", "delerium-search", "delerium"]);
const MAX_LEVEL = 6;
const DEFAULT_POLL_MS = 1000;

let conditions = [];
let items = [];
let loading = false;
let watching = false;
let pendingKey = null;
let pollTimer = null;
let polls = 0;
let pollDelay = DEFAULT_POLL_MS;
let signature = "";

export function drakkenheimConditions() {
  return conditions;
}

export function drakkenheimItems() {
  return items;
}

export function setDrakkenheimContent({ conditions: nextConditions = [], items: nextItems = [] } = {}) {
  conditions = nextConditions ?? [];
  items = nextItems ?? [];
  loading = false;
  signature = contentSignature({ conditions, items });
}

export function setDrakkenheimPollDelay(ms = DEFAULT_POLL_MS) {
  pollDelay = ms;
}

export function resetDrakkenheimCheat() {
  conditions = [];
  items = [];
  loading = false;
  watching = false;
  pendingKey = null;
  polls = 0;
  pollDelay = DEFAULT_POLL_MS;
  signature = "";
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

export function stopDrakkenheimCheat() {
  watching = false;
  pendingKey = null;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

export function drakkenheimStatus(game = globalThis.game) {
  const ready = conditions.length || items.length;
  if (loading && !ready) return "loading";
  if (ready) return "ready";
  if (drakkenheimContentActive(game)) return "loading";
  return "off";
}

export function drakkenheimModuleIds(game = globalThis.game) {
  return DRAKKENHEIM_MODULE_IDS.filter(id => game?.modules?.get?.(id)?.active === true);
}

export function drakkenheimContentActive(game = globalThis.game) {
  return drakkenheimModuleIds(game).length > 0;
}

export function scheduleDrakkenheimCheat(rerender, game = globalThis.game) {
  const key = drakkenheimModuleIds(game).slice().sort().join(",");
  if (!key) {
    const had = conditions.length || items.length || loading;
    stopDrakkenheimCheat();
    polls = 0;
    loading = false;
    if (had) {
      conditions = [];
      items = [];
      signature = "";
      rerender?.();
    }
    return;
  }
  watching = true;
  if (!conditions.length && !items.length) loading = true;
  if (pendingKey === key || pollTimer) return;
  pendingKey = key;
  collectDrakkenheimContent(game).then(found => {
    if (!watching || pendingKey !== key) return;
    pendingKey = null;
    const next = contentSignature(found);
    const changed = next !== signature;
    if (found.conditions.length || found.items.length) {
      conditions = found.conditions;
      items = found.items;
      signature = next;
      loading = false;
    } else if (!conditions.length && !items.length) loading = true;
    if (changed) rerender?.();
    schedulePoll(rerender, game, key);
  }).catch(() => {
    if (!watching || pendingKey !== key) return;
    pendingKey = null;
    if (!conditions.length && !items.length) loading = true;
    schedulePoll(rerender, game, key);
  });
}

function schedulePoll(rerender, game, key) {
  if (!watching || pollTimer) return;
  const delay = Math.min(pollDelay * (2 ** Math.min(polls, 4)), Math.max(pollDelay, 15000));
  polls += 1;
  pollTimer = setTimeout(() => {
    pollTimer = null;
    if (!watching || drakkenheimModuleIds(game).slice().sort().join(",") !== key) return;
    pendingKey = null;
    scheduleDrakkenheimCheat(rerender, game);
  }, delay);
}

function contentSignature(found) {
  const conditionIds = (found?.conditions ?? []).map(item => item.id).join(",");
  const itemIds = (found?.items ?? []).map(item => item.id).join(",");
  return conditionIds || itemIds ? `${conditionIds}|${itemIds}` : "";
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

export async function collectDrakkenheimContent(game = globalThis.game) {
  if (!drakkenheimContentActive(game)) return { conditions: [], items: [] };
  try {
    const grouped = { contamination: [], search: [], values: [], conditions: [] };
    const journals = await matchedDocuments(game, "JournalEntry", journalWorthOpening);
    for (const entry of journals) addJournal(entry.pack, entry.doc, grouped);
    const tables = await matchedDocuments(game, "RollTable", row => Boolean(tableKind(row?.name)));
    for (const entry of tables) addTable(entry.pack, entry.doc, grouped);
    const documents = await matchedDocuments(game, "Item", itemWorthOpening);
    for (const entry of documents) addItem(entry.pack, entry.doc, grouped);
    return {
      conditions: uniqueChips(grouped.conditions),
      items: CHIP_ORDER.map(id => mergeSummaries(grouped[id === "delerium-search" ? "search" : id === "delerium" ? "values" : id])).filter(Boolean)
    };
  } catch {
    return { conditions: [], items: [] };
  }
}

function addJournal(pack, entry, grouped) {
  const entryIsConditions = /^conditions?\b/.test(normalize(entry?.name));
  for (const page of pagesOf(entry)) {
    const kind = pageKind(page?.name) || (entryIsConditions ? "condition" : "");
    const html = pageHtml(page);
    if (kind === "contamination") {
      const summary = levelSummary(contaminationLevelsFromHTML(html));
      if (summary) grouped.contamination.push(summaryChip(pack, entry, page, "contamination", "Contamination", summary));
    } else if (kind === "search") {
      const summary = zoneSummary(searchZonesFromHTML(html), skillsMentioned(strip(html)));
      if (summary) grouped.search.push(summaryChip(pack, entry, page, "delerium-search", "Delerium Search", summary));
    } else if (kind === "condition") {
      const label = strip(page?.name);
      const text = strip(html);
      if (!shortLabel(label) || !text) continue;
      grouped.conditions.push(chip({
        id: `condition-${slug(label)}`,
        label,
        text,
        uuid: page?.uuid || entry.uuid || compendiumUuid(pack, "JournalEntry", entry.id),
        pageId: page?.id ?? "",
        path: documentPath(pack, entry.name, page?.name)
      }));
    }
  }
}

function addTable(pack, table, grouped) {
  const kind = tableKind(table?.name);
  const path = documentPath(pack, table.name);
  const uuid = table.uuid || compendiumUuid(pack, "RollTable", table.id);
  const results = listOf(table.results?.contents ?? table.results);
  if (kind === "contamination") {
    const levels = [];
    for (const result of results) {
      const raw = strip(result?.name || result?.text || "");
      const level = levelNumber(raw) || levelNumber(String(result?.range?.[0] ?? ""));
      const text = strip(result?.description || "");
      if (!level || !text) continue;
      levels.push({ level, label: `Level ${level}`, text });
    }
    const chosen = levels.length === 1 || validLevelRun(levels) ? levels.filter(level => level.level <= MAX_LEVEL) : [];
    const summary = levelSummary(chosen);
    if (summary) grouped.contamination.push(chip({ id: "contamination", label: "Contamination", text: summary, uuid, path }));
  }
  if (kind === "search") {
    const pageSkills = skillsMentioned([table.name, table.description, ...results.map(result => `${result?.name ?? ""} ${result?.text ?? ""} ${result?.description ?? ""}`)].join(" "));
    const zones = results.flatMap(result => {
      const label = strip(result?.name || result?.text || "");
      const description = strip(result?.description || "");
      const dc = explicitDc(`${label} ${description}`);
      if (!label || !dc || headerLabel(label)) return [];
      return [{ label, dc, skills: skillsMentioned(`${label} ${description}`), extra: withoutDc(description) }];
    });
    const summary = zoneSummary(zones, pageSkills);
    if (summary) grouped.search.push(chip({ id: "delerium-search", label: "Delerium Search", text: summary, uuid, path }));
  }
}

function addItem(pack, item, grouped) {
  if (isConditionItem(item)) {
    const label = strip(item.name);
    const text = descriptionText(item);
    if (!shortLabel(label) || !text) return;
    grouped.conditions.push(chip({
      id: `condition-${slug(label)}`,
      label,
      text,
      uuid: item.uuid || compendiumUuid(pack, "Item", item.id),
      path: documentPath(pack, item.name)
    }));
    return;
  }
  if (!/^deleri(?:um|ium)\b/i.test(item?.name ?? "")) return;
  const price = priceText(item.system);
  if (!price) return;
  const weight = weightText(item.system);
  const text = [item.name, `Price: ${price}.`, weight ? `Weight: ${weight}.` : "", descriptionText(item)].filter(Boolean).join(" ");
  grouped.values.push(chip({
    id: "delerium",
    label: "Delerium",
    text,
    uuid: item.uuid || compendiumUuid(pack, "Item", item.id),
    path: documentPath(pack, item.name)
  }));
}

function summaryChip(pack, entry, page, id, label, text) {
  return chip({
    id,
    label,
    text,
    uuid: page?.uuid || entry.uuid || compendiumUuid(pack, "JournalEntry", entry.id),
    pageId: page?.id ?? "",
    path: documentPath(pack, entry.name, page?.name)
  });
}

function mergeSummaries(chips) {
  const parts = [];
  const seen = new Set();
  for (const entry of chips ?? []) {
    const key = canonical(entry?.sourceText);
    if (!entry?.sourceText || seen.has(key)) continue;
    seen.add(key);
    parts.push(entry.sourceText);
  }
  if (!parts.length) return null;
  const base = chips[0];
  return chip({
    id: base.id,
    label: base.labelText,
    text: parts.join(" "),
    uuid: base.uuid,
    pageId: base.pageId,
    path: base.documentPath
  });
}

function levelSummary(levels) {
  const unique = [];
  for (const level of levels) {
    const previous = unique.find(item => item.level === level.level);
    if (!previous) unique.push(level);
    else if ((level.text?.length ?? 0) > (previous.text?.length ?? 0)) previous.text = level.text;
  }
  unique.sort((a, b) => a.level - b.level);
  if (!unique.length) return "";
  return unique.map(level => `${level.label}: ${level.text}`).join(" ");
}

function zoneSummary(zones, pageSkills) {
  if (!zones.length) return "";
  return zones.map(zone => {
    const skills = zone.skills.length ? zone.skills : pageSkills;
    const skillText = skills.length ? ` Search with ${joinOr(skills)}.` : "";
    const extra = zone.extra ? ` ${zone.extra}` : "";
    return `${zone.label}: DC ${zone.dc}.${skillText}${extra}`;
  }).join(" ");
}

export function contaminationLevelsFromHTML(html) {
  const runs = [];
  for (const rows of tableRows(html)) {
    const levels = [];
    for (const cells of rows) {
      const levelCell = cells.find(cell => exactLevel(cell));
      const level = exactLevel(levelCell);
      if (!level) continue;
      const text = cells.filter(cell => cell !== levelCell && !exactLevel(cell)).join(" ").trim();
      if (!text) continue;
      levels.push({ level, label: `Level ${level}`, text });
    }
    if (!validLevelRun(levels)) continue;
    const headed = rows[0].some(cell => /^(?:levels?|effects?|symptoms?)$/i.test(cell.trim()));
    runs.push({ headed, levels });
  }
  const chosen = runs.some(run => run.headed) ? runs.filter(run => run.headed) : runs;
  return levelList(chosen.flatMap(run => run.levels));
}

function levelList(levels) {
  const unique = [];
  for (const level of levels) {
    if (unique.some(item => item.level === level.level)) continue;
    unique.push(level);
  }
  return unique.sort((a, b) => a.level - b.level);
}

export function searchZonesFromHTML(html) {
  const zones = [];
  for (const rows of tableRows(html)) {
    if (!rows.length) continue;
    const header = rows[0];
    const dcIndex = header.findIndex(cell => /\bdc\b/i.test(cell) || /difficulty/i.test(cell));
    const body = dcIndex >= 0 ? rows.slice(1) : rows;
    for (const cells of body) {
      let index = dcIndex;
      let dc = index >= 0 ? dcValue(cells[index] ?? "") : 0;
      if (!dc) {
        index = cells.findIndex(cell => /^(?:dc\s*)?\d{1,2}$/i.test(cell.trim()));
        dc = index >= 0 ? dcValue(cells[index]) : 0;
      }
      if (!dc) continue;
      const label = cells.find((cell, cellIndex) => cellIndex !== index && !headerLabel(cell) && !skillsOnly(cell));
      if (!label || headerLabel(label)) continue;
      const extra = cells.filter((cell, cellIndex) => cell !== label && cellIndex !== index && !skillsOnly(cell)).join(" ");
      zones.push({ label, dc, skills: skillsMentioned(cells.join(" ")), extra: withoutDc(extra) });
    }
  }
  return zones;
}

async function matchedDocuments(game, documentName, predicate) {
  const found = [];
  for (const pack of modulePacks(game, documentName)) {
    let index = [];
    try { index = listOf(await pack.getIndex?.({ fields: ["type", "system.type"] })); }
    catch { continue; }
    const ids = [];
    for (const row of index) {
      if (!predicate(row)) continue;
      const id = row?._id ?? row?.id;
      if (id) ids.push(id);
    }
    for (const doc of await loadDocuments(pack, ids)) found.push({ pack, doc });
  }
  return found;
}

async function loadDocuments(pack, ids) {
  if (!ids.length) return [];
  if (typeof pack.getDocuments === "function") {
    try {
      const batch = listOf(await pack.getDocuments({ _id__in: ids })).filter(doc => ids.includes(doc?.id ?? doc?._id));
      if (batch.length) return batch;
    } catch { /* Fall back to one document at a time. */ }
  }
  const docs = [];
  for (const id of ids) {
    try {
      const doc = await pack.getDocument?.(id);
      if (doc) docs.push(doc);
    } catch { /* Skip a document the pack cannot open yet. */ }
  }
  return docs;
}

function journalWorthOpening(row) {
  const name = normalize(row?.name);
  if (!name || /emberwood/.test(name) || /^appendix d\b/.test(name)) return false;
  if (/mutation|madness|spell|long rest/.test(name) && !/appendix c\b/.test(name)) return false;
  if (/^contaminat/.test(name) || /appendix c\b/.test(name)) return true;
  if (/contamination symptoms|eldritch contamination/.test(name)) return true;
  if (/deleri/.test(name) && /search|prospect/.test(name)) return true;
  if (/^conditions?\b/.test(name)) return true;
  return false;
}

function itemWorthOpening(row) {
  if (/^deleri(?:um|ium)\b/i.test(row?.name ?? "")) return true;
  const type = row?.type ?? row?.system?.type?.value ?? row?.system?.type;
  return type === "condition";
}

function tableKind(name) {
  const normalized = normalize(name);
  if (/mutation|madness/.test(normalized)) return "";
  if (/deleri/.test(normalized) && /search|prospect/.test(normalized)) return "search";
  if (/contaminat|symptom/.test(normalized)) return "contamination";
  return "";
}

function pageKind(name) {
  const page = normalize(name);
  if (!page || /mutation|madness|spell|long rest|transform/.test(page)) return "";
  if (/symptom|eldritch contamination/.test(page) || /contaminat/.test(page)) return "contamination";
  if (/deleri/.test(page) && /search|prospect/.test(page)) return "search";
  return "";
}

function isConditionItem(item) {
  const type = item?.type ?? item?.system?.type?.value ?? item?.system?.type;
  return type === "condition";
}

function validLevelRun(levels) {
  if (levels.length < 2 || levels.length > MAX_LEVEL) return false;
  const nums = levels.map(level => level.level);
  if (new Set(nums).size !== nums.length) return false;
  const sorted = [...nums].sort((a, b) => a - b);
  if (sorted[0] !== 1) return false;
  return sorted.every((level, index) => level === index + 1);
}

function exactLevel(cell) {
  const source = String(cell ?? "").trim();
  const match = source.match(/^(?:contamination\s+)?(?:level|stage)\s+(\d+)$/i) || source.match(/^(\d+)[.)]?$/);
  const level = Number(match?.[1]);
  return level >= 1 && level <= 12 ? level : 0;
}

function levelNumber(label) {
  const source = String(label ?? "").trim();
  const match = source.match(/^(?:contamination\s+)?(?:level|stage)\s+(\d+)\b/i) || source.match(/^(\d+)[.)]?$/);
  const level = Number(match?.[1]);
  return level >= 1 && level <= 12 ? level : 0;
}

function tableRows(html) {
  const tables = [...String(html ?? "").matchAll(/<table[\s\S]*?<\/table>/gi)].map(match => match[0]);
  return tables.map(table => [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => (
    [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => strip(cell[1])).filter(cell => cell.length)
  )).filter(cells => cells.length));
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

function weightText(system) {
  const weight = system?.weight?.value ?? system?.weight;
  if (weight == null || weight === "") return "";
  const number = Number(weight);
  if (Number.isFinite(number)) return `${number} lb`;
  return String(weight).trim();
}

function descriptionText(item) {
  const raw = item?.system?.description?.value ?? item?.system?.description;
  return typeof raw === "string" ? strip(raw) : "";
}

function chip({ id, label, text, uuid, pageId = "", path }) {
  const excerpt = text.length > 700 ? `${text.slice(0, 700).trim()}…` : text;
  return {
    id,
    origin: "drakkenheim",
    labelText: label,
    sourceText: text,
    tipHTML: `<div class="mlgm-cheat-tip__body"><p><strong>${e(label)}</strong></p><p>${e(excerpt)}</p></div>`,
    uuid,
    pageId,
    documentPath: path
  };
}

function uniqueChips(chips) {
  const kept = new Map();
  for (const entry of chips) {
    const key = canonical(entry.labelText) || entry.id;
    const previous = kept.get(key);
    if (!previous || (entry.tipHTML?.length ?? 0) > (previous.tipHTML?.length ?? 0)) kept.set(key, entry);
  }
  return [...kept.values()].sort((a, b) => a.labelText.localeCompare(b.labelText, undefined, { numeric: true }));
}

function explicitDc(text) {
  const match = String(text ?? "").match(/\bDC\s*(\d{1,2})\b/i) || String(text ?? "").match(/\bdifficulty(?:\s+class)?\s*(\d{1,2})\b/i);
  return boundedDc(match?.[1]);
}

function dcValue(text) {
  return explicitDc(text) || boundedDc(String(text ?? "").trim().match(/^(?:dc\s*)?(\d{1,2})$/i)?.[1]);
}

function boundedDc(value) {
  const dc = Number(value);
  return dc >= 1 && dc <= 40 ? dc : 0;
}

function withoutDc(text) {
  return String(text ?? "").replace(/\bDC\s*\d{1,2}\b/gi, " ").replace(/\bdifficulty(?:\s+class)?\s*\d{1,2}\b/gi, " ").replace(/\s+/g, " ").trim();
}

function headerLabel(label) {
  return /^(area|zone|location|region|place|name|dc|difficulty|check dc|skills?|check|effects?)$/i.test(String(label ?? "").trim());
}

function skillsMentioned(text) {
  return SKILL_NAMES.filter(name => new RegExp(`\\b${name.replace(/ /g, "\\s+")}\\b`, "i").test(text));
}

function skillsOnly(text) {
  const skills = skillsMentioned(text);
  if (!skills.length) return false;
  const remainder = skills.reduce((rest, skill) => rest.replace(new RegExp(skill.replace(/ /g, "\\s+"), "ig"), " "), text);
  return !/[a-z0-9]/i.test(remainder.replace(/\b(or|and)\b/gi, " "));
}

function shortLabel(label) {
  const text = String(label ?? "").trim();
  const quoted = text.startsWith('"') || text.startsWith("'") || "“”‘’".includes(text[0] ?? "");
  if (!text || text.length > 40 || /[.!?]$/.test(text) || quoted) return false;
  if (/^\d+[.)]?$/.test(text) || /[,;:]/.test(text) || headerLabel(text)) return false;
  return text.split(/\s+/).length <= 4;
}

function pageHtml(page) {
  return page?.text?.content || page?.text?.markdown || "";
}

function pagesOf(entry) {
  return listOf(entry?.pages?.contents ?? entry?.pages);
}

function modulePacks(game, documentName) {
  const allowed = new Set(SOURCE_MODULES);
  return listOf(game?.packs).filter(pack => {
    if (pack?.documentName !== documentName) return false;
    const owner = pack.metadata?.packageName || pack.metadata?.package || String(pack.collection ?? "").split(".")[0];
    return allowed.has(owner);
  });
}

function canonical(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[‘’‚‛ʼ]/g, "'").replace(/[“”„]/g, '"').replace(/[–—−]/g, "-");
}

function normalize(name) {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
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
