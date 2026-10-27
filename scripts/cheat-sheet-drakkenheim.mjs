import { escapeHTML as e } from "./core.mjs";

export const DRAKKENHEIM_CORE_MODULE_ID = "drakkenheim-core";
export const DRAKKENHEIM_CONTENT_PACK_ID = "monsters-of-drakkenheim";

export const DRAKKENHEIM_STRINGS = [
  ["group.drakkenheim", "Drakkenheim"],
  ["section.drakkenheim-contamination", "Contamination"]
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
  collectContaminationSections(game).then(found => {
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

function modulePacks(game, documentName) {
  return listOf(game?.packs).filter(pack => {
    if (pack?.documentName !== documentName) return false;
    const owner = pack.metadata?.packageName || pack.metadata?.package || String(pack.collection ?? "").split(".")[0];
    return owner === DRAKKENHEIM_CORE_MODULE_ID;
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
