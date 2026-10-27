import { escapeHTML as e } from "./core.mjs";
import { drakkenheimSections } from "./cheat-sheet-drakkenheim.mjs";
import { CHEAT_SECTIONS, cheatStringEntries } from "./cheat-sheet-data.mjs";

const STRINGS = new Map(cheatStringEntries());
const closedSections = new Set();

export function cheatText(key) {
  const full = `morelord-game-master.cheat.${key}`;
  let value;
  try { value = globalThis.game?.i18n?.localize?.(full); }
  catch { value = undefined; }
  if (typeof value === "string" && value && value !== full) return value;
  return STRINGS.get(key) ?? key;
}

export function rememberCheatSheet(root) {
  const sections = [...(root?.querySelectorAll?.("[data-cheat-section]") ?? [])];
  if (!sections.length) return;
  closedSections.clear();
  for (const section of sections) if (!section.open) closedSections.add(section.dataset.cheatSection);
}

function linesHTML(id, lines = []) {
  if (!lines.length) return "";
  return `<ul>${lines.map((_, index) => `<li>${e(cheatText(`item.${id}.lines.${index}`))}</li>`).join("")}</ul>`;
}

function tableHTML(id, table) {
  if (!table) return "";
  const headers = table.headers.map((_, index) => `<th scope="col">${e(cheatText(`item.${id}.table.headers.${index}`))}</th>`).join("");
  const rows = table.rows.map((row, rowIndex) => `<tr>${row.map((_, column) => `<td>${e(cheatText(`item.${id}.table.rows.${rowIndex}.${column}`))}</td>`).join("")}</tr>`).join("");
  return `<table><caption>${e(cheatText(`item.${id}.table.caption`))}</caption><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

export function cheatTooltipHTML(item) {
  return `<div class="mlgm-cheat-tip__body"><p><strong>${e(cheatText(`item.${item.id}.label`))}</strong></p>${linesHTML(item.id, item.lines)}${tableHTML(item.id, item.table)}</div>`;
}

export function cheatChipClass(section, item) {
  const origin = item?.origin || section?.origin || "";
  const drakkenheim = origin === "drakkenheim" || section?.id === "drakkenheim" || String(section?.id || "").startsWith("drakkenheim-");
  return drakkenheim ? "gm-cheat-chip gm-cheat-chip--drakkenheim" : "gm-cheat-chip";
}

function renderSection(section) {
  const chips = section.items.map(item => {
    const label = item.labelText ?? cheatText(`item.${item.id}.label`);
    const tip = item.tipHTML ?? cheatTooltipHTML(item);
    const origin = item.origin || section.origin || "";
    const originAttr = origin === "drakkenheim" ? ' data-cheat-origin="drakkenheim"' : "";
    const action = item.uuid ? ` data-action="cheat-document" data-id="${e(item.uuid)}"` : "";
    const page = item.pageId ? ` data-page="${e(item.pageId)}"` : "";
    const document = item.documentPath ? ` data-cheat-document="${e(item.documentPath)}"` : "";
    return `<button type="button" class="${cheatChipClass(section, item)}" data-mlgm-cheat="${e(item.id)}"${originAttr}${action}${page}${document} data-tooltip="${e(label)}" data-tooltip-html="${e(tip)}" data-tooltip-class="mlgm-cheat-tip">${e(label)}</button>`;
  }).join("");
  const open = closedSections.has(section.id) ? "" : " open";
  return `<details class="gm-cheat-section" data-cheat-section="${e(section.id)}"${open}><summary>${e(cheatText(`section.${section.id}`))}</summary><div class="gm-cheat-grid">${chips}</div></details>`;
}

export function renderCheatSheet() {
  const standard = CHEAT_SECTIONS.map(renderSection).join("");
  const extra = drakkenheimSections();
  const group = extra.length ? `<div class="gm-cheat-group" data-cheat-group="drakkenheim"><p class="gm-cheat-kicker">${e(cheatText("group.drakkenheim"))}</p>${extra.map(renderSection).join("")}</div>` : "";
  return `<div class="gm-cheat" id="mlgm-cheat">${standard}${group}<p class="gm-cheat-note">${e(cheatText("attribution"))}</p></div>`;
}

export function activateCheatTooltip(target) {
  const chip = target?.closest?.("[data-mlgm-cheat]");
  const html = chip?.getAttribute?.("data-tooltip-html");
  if (!chip || !html) return null;
  const options = { html, cssClass: chip.getAttribute("data-tooltip-class") || "mlgm-cheat-tip" };
  globalThis.game?.tooltip?.activate?.(chip, options);
  return options;
}

export function deactivateCheatTooltip(event) {
  const chip = event?.target?.closest?.("[data-mlgm-cheat]");
  if (!chip) return false;
  if (event.relatedTarget?.closest?.("[data-mlgm-cheat]")) return false;
  globalThis.game?.tooltip?.deactivate?.();
  return true;
}
