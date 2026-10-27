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
  ["group.drakkenheim", "Drakkenheim"],
  ["section.drakkenheim-contamination", "Contamination"],
  ["section.drakkenheim-search", "Delerium search"],
  ["section.drakkenheim-values", "Delerium values"],
  ["section.drakkenheim-mutations", "Mutations"],
  ["section.drakkenheim-madness", "Madness"]
];

const SKILL_NAMES = Object.freeze([
  "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History",
  "Insight", "Intimidation", "Investigation", "Medicine", "Nature", "Perception",
  "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"
]);

const DEFAULT_POLL_MS = 1500;
const MAX_POLLS = 5;

let sections = [];
let appliedKey = null;
let pendingKey = null;
let pollTimer = null;
let polls = 0;
let pollDelay = DEFAULT_POLL_MS;

export function drakkenheimSections() {
  return sections;
}

export function setDrakkenheimSections(next = []) {
  sections = next ?? [];
}

export function setDrakkenheimPollDelay(ms = DEFAULT_POLL_MS) {
  pollDelay = ms;
}

export function resetDrakkenheimCheat() {
  sections = [];
  appliedKey = null;
  pendingKey = null;
  polls = 0;
  pollDelay = DEFAULT_POLL_MS;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
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
    pendingKey = null;
    polls = 0;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    if (appliedKey || sections.length) {
      appliedKey = null;
      setDrakkenheimSections([]);
      rerender?.();
    }
    return;
  }
  if (appliedKey === key || pendingKey === key) return;
  pendingKey = key;
  collectDrakkenheimSections(game).then(found => {
    if (pendingKey !== key) return;
    pendingKey = null;
    const ready = found.some(section => section.id === "drakkenheim-contamination") || (found.length && polls >= MAX_POLLS);
    if (!found.length || !ready) {
      if (found.length) {
        setDrakkenheimSections(found);
        rerender?.();
      }
      schedulePoll(rerender, game, key);
      return;
    }
    polls = 0;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    setDrakkenheimSections(found);
    appliedKey = key;
    rerender?.();
  }).catch(() => {
    if (pendingKey !== key) return;
    pendingKey = null;
    schedulePoll(rerender, game, key);
  });
}

function schedulePoll(rerender, game, key) {
  if (polls >= MAX_POLLS || pollTimer) return;
  polls += 1;
  pollTimer = setTimeout(() => {
    pollTimer = null;
    if (drakkenheimModuleIds(game).slice().sort().join(",") !== key) return;
    appliedKey = null;
    pendingKey = null;
    scheduleDrakkenheimCheat(rerender, game);
  }, pollDelay);
}

export async function collectDrakkenheimSections(game = globalThis.game) {
  if (!drakkenheimContentActive(game)) return [];
  try {
    const [contamination, topics] = await Promise.all([
      collectContaminationSections(game),
      collectTopicSections(game)
    ]);
    const byId = new Map();
    for (const section of [...contamination, ...topics]) {
      if (!section?.items?.length) continue;
      const existing = byId.get(section.id);
      if (!existing) byId.set(section.id, { ...section, items: uniqueChips(section.items) });
      else existing.items = uniqueChips([...existing.items, ...section.items]);
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
    const [journal, tables] = await Promise.all([
      contaminationFromJournals(game),
      contaminationFromTables(game)
    ]);
    const chips = uniqueChips([...journal, ...tables]);
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
      let entry;
      try { entry = await pack.getDocument?.(row._id ?? row.id); }
      catch { continue; }
      if (!entry) continue;
      const pages = listOf(entry.pages?.contents ?? entry.pages);
      const worthReading = pages.some(page => contaminationCandidate(entry.name || row?.name, page?.name, pageHtml(page)));
      if (!worthReading && !contaminationName(entry.name) && !contaminationName(row?.name)) continue;
      chips.push(...chipsFromEntry(pack, entry));
    }
  }
  return uniqueChips(chips);
}

async function contaminationFromTables(game) {
  const chips = [];
  for (const pack of modulePacks(game, "RollTable")) {
    let index = [];
    try { index = listOf(await pack.getIndex?.()); }
    catch { continue; }
    for (const row of index) {
      let table;
      try { table = await pack.getDocument?.(row._id ?? row.id); }
      catch { continue; }
      if (!contaminationTable(table, row?.name)) continue;
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
  return uniqueChips(chips);
}

function chipsFromEntry(pack, entry) {
  const pages = listOf(entry.pages?.contents ?? entry.pages);
  const chosen = pages.filter(page => contaminationCandidate(entry.name, page?.name, page?.text?.content || page?.text?.markdown || ""));
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
    const level = levelNumber(page?.name);
    chips.push(chip({
      id: level ? `contamination-level-${level}` : "contamination-symptoms",
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
  const fromInline = inlineLevels(source);
  if (fromInline.length) return fromInline;
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
  const unique = uniqueChips(items);
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
        const current = page === entry ? entry : page;
        const html = current?.text?.content || current?.text?.markdown || "";
        const topic = pageTopic(current?.name) || entryTopic;
        const named = normalize(`${entry.name} ${current?.name}`);
        const zones = /deleri|search|prospect/.test(named) ? searchZoneChips(pack, entry, current, html) : [];
        if (zones.length) grouped.search.push(...zones);
        if (!topic || !grouped[topic]) continue;
        if (topic === "search" && zones.length) continue;
        grouped[topic].push(...partsToChips(pack, entry, current, topic));
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
  if (topic === "search") {
    const pageSkills = skillsMentioned([table.name, table.description, ...results.map(result => `${result?.name ?? ""} ${result?.text ?? ""} ${result?.description ?? ""}`)].join(" "));
    const zones = results.flatMap(result => {
      const label = strip(result.name || result.text || "");
      const description = strip(result.description || "");
      const dc = explicitDc(`${label} ${description}`);
      if (!label || !dc || headerLabel(label)) return [];
      return [chip({
        id: `delerium-search-${slug(label)}`,
        label,
        text: searchChipText({ dc, skills: skillsMentioned(`${label} ${description}`), extra: withoutDc(description) }, pageSkills),
        uuid,
        path
      })];
    });
    if (zones.length) return zones;
  }
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

function uniqueChips(chips) {
  const kept = new Map();
  for (const entry of chips) {
    const key = normalize(entry.labelText) || entry.id;
    const previous = kept.get(key);
    if (!previous || (entry.tipHTML?.length ?? 0) > (previous.tipHTML?.length ?? 0)) kept.set(key, entry);
  }
  return [...kept.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function searchZoneChips(pack, entry, page, html) {
  const zones = searchZonesFromHTML(html);
  if (!zones.length) return [];
  const path = documentPath(pack, entry.name || page?.name, page?.name && page !== entry ? page.name : "");
  const uuid = page?.uuid || entry.uuid || compendiumUuid(pack, "JournalEntry", entry.id);
  const pageId = page !== entry ? (page?.id ?? "") : "";
  const pageSkills = skillsMentioned(strip(html));
  return zones.map(zone => chip({
    id: `delerium-search-${slug(zone.label)}`,
    label: zone.label,
    text: searchChipText(zone, pageSkills),
    uuid,
    pageId,
    path
  }));
}

export function searchZonesFromHTML(html) {
  const fromTable = zonesFromTables(html);
  if (fromTable.length) return fromTable;
  const headings = [...String(html ?? "").matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>([\s\S]*?)(?=<h[1-6][^>]*>|$)/gi)];
  return headings.flatMap(match => {
    const label = strip(match[1]);
    const body = strip(match[2]);
    const dc = explicitDc(`${label} ${body}`);
    if (!label || !dc || headerLabel(label)) return [];
    return [{ label, dc, skills: skillsMentioned(`${label} ${body}`), extra: withoutDc(body) }];
  });
}

function zonesFromTables(html) {
  const blocks = [...String(html ?? "").matchAll(/<table[\s\S]*?<\/table>/gi)].map(match => match[0]);
  const sources = blocks.length ? blocks : (/<tr[\s>]/i.test(html ?? "") ? [String(html)] : []);
  const zones = [];
  for (const source of sources) {
    const rows = [...source.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => (
      [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => strip(cell[1])).filter(Boolean)
    )).filter(cells => cells.length);
    if (!rows.length) continue;
    const header = rows[0].map(cell => normalize(cell));
    const dcIndex = header.findIndex(cell => cell === "dc" || /difficulty/.test(cell));
    const body = dcIndex >= 0 ? rows.slice(1) : rows;
    for (const cells of body) {
      const dc = dcIndex >= 0 ? dcValue(cells[dcIndex] ?? "") : explicitDc(cells.join(" "));
      if (!dc) continue;
      const label = cells.find((cell, index) => index !== dcIndex && !headerLabel(cell) && !skillsOnly(cell));
      if (!label || headerLabel(label)) continue;
      const extra = cells.filter((cell, index) => cell !== label && index !== dcIndex && !skillsOnly(cell)).join(" ");
      zones.push({ label, dc, skills: skillsMentioned(cells.join(" ")), extra: withoutDc(extra) });
    }
  }
  return zones;
}

function searchChipText(zone, pageSkills) {
  const skills = zone.skills.length ? zone.skills : pageSkills;
  const skillText = skills.length ? `Search with ${joinOr(skills)}.` : "";
  return [zone.dc ? `DC ${zone.dc}.` : "", skillText, zone.extra].filter(Boolean).join(" ");
}

function explicitDc(text) {
  const match = String(text ?? "").match(/\bDC\s*(\d{1,2})\b/i) || String(text ?? "").match(/\bdifficulty(?:\s+class)?\s*(\d{1,2})\b/i);
  return boundedDc(match?.[1]);
}

function dcValue(text) {
  return explicitDc(text) || boundedDc(String(text ?? "").trim().match(/^(\d{1,2})$/)?.[1]);
}

function boundedDc(value) {
  const dc = Number(value);
  return dc >= 1 && dc <= 40 ? dc : 0;
}

function withoutDc(text) {
  return String(text ?? "").replace(/\bDC\s*\d{1,2}\b/gi, " ").replace(/\bdifficulty(?:\s+class)?\s*\d{1,2}\b/gi, " ").replace(/\s+/g, " ").trim();
}

function headerLabel(label) {
  return /^(area|zone|location|region|place|name|dc|difficulty|skills?|check)$/i.test(String(label ?? "").trim());
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

function contaminationName(name) {
  const normalized = normalize(name);
  if (!normalized || /mutation|madness|transformation/.test(normalized)) return false;
  return /contaminat|appendix c|symptom/.test(normalized);
}

function pageHtml(page) {
  return page?.text?.content || page?.text?.markdown || "";
}

function inlineLevels(source) {
  const marks = [...source.matchAll(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi)];
  const found = [];
  for (const [index, mark] of marks.entries()) {
    const label = strip(mark[1]);
    const level = levelNumber(label);
    if (!level) continue;
    const start = mark.index + mark[0].length;
    const end = marks[index + 1]?.index ?? source.length;
    const text = strip(source.slice(start, end));
    if (text) found.push({ level, label, text });
  }
  return found;
}

function contaminationTable(table, rowName) {
  if (contaminationName(table?.name) || contaminationName(rowName)) return true;
  const results = listOf(table?.results?.contents ?? table?.results);
  const levels = results.filter(result => levelNumber(strip(result?.name || result?.text || "")) || levelNumber(String(result?.range?.[0] ?? ""))).length;
  return levels >= 2 && /contaminat/.test(normalize(`${table?.name} ${rowName} ${table?.description}`));
}

function contaminationCandidate(entryName, pageName, html) {
  const page = normalize(pageName);
  if (/mutation|madness|transformation/.test(page)) return false;
  const levels = contaminationLevelsFromHTML(html);
  if (contaminationName(pageName)) return levels.length > 0 || Boolean(strip(html));
  if (!levels.length) return false;
  return contaminationName(entryName) || /contaminat/.test(normalize(strip(html).slice(0, 800)));
}

function modulePacks(game, documentName, owners = SOURCE_MODULES) {
  const allowed = new Set(owners);
  return listOf(game?.packs).filter(pack => {
    if (pack?.documentName !== documentName) return false;
    const owner = pack.metadata?.packageName || pack.metadata?.package || String(pack.collection ?? "").split(".")[0];
    return allowed.has(owner);
  });
}

function normalize(name) {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function levelNumber(label) {
  const source = String(label ?? "").trim();
  const match = source.match(/^(?:contamination\s+)?(?:level|stage)\s+(\d+)\b/i) || source.match(/^(\d+)[.)]?$/);
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
