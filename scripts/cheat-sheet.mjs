import { escapeHTML as e } from "./core.mjs";
import { drakkenheimConditions, drakkenheimItems } from "./cheat-sheet-drakkenheim.mjs";
import { CHEAT_SECTIONS, cheatStringEntries } from "./cheat-sheet-data.mjs";
import { CHEAT_LAYOUT, visibleIds } from "./tray-layout.mjs";

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

function linesHTML(prefix, lines = []) {
  if (!lines.length) return "";
  return `<ul>${lines.map((_, index) => `<li>${e(cheatText(`${prefix}.lines.${index}`))}</li>`).join("")}</ul>`;
}

function tableHTML(prefix, table) {
  if (!table) return "";
  const headers = table.headers.map((_, index) => `<th scope="col">${e(cheatText(`${prefix}.headers.${index}`))}</th>`).join("");
  const rows = table.rows.map((row, rowIndex) => `<tr>${row.map((_, column) => `<td>${e(cheatText(`${prefix}.rows.${rowIndex}.${column}`))}</td>`).join("")}</tr>`).join("");
  return `<table><caption>${e(cheatText(`${prefix}.caption`))}</caption><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

function blockHTML(prefix, block) {
  const heading = block.heading ? `<p class="mlgm-cheat-tip__sub"><strong>${e(cheatText(`${prefix}.heading`))}</strong></p>` : "";
  return `${heading}${linesHTML(prefix, block.lines)}${tableHTML(`${prefix}.table`, block.table)}`;
}

export function cheatTooltipHTML(item) {
  const title = `<p class="mlgm-cheat-tip__title"><strong>${e(item.labelText ?? cheatText(`item.${item.id}.label`))}</strong></p>`;
  const body = item.parts?.length
    ? item.parts.map((part, index) => blockHTML(`item.${item.id}.parts.${index}`, part)).join("")
    : blockHTML(`item.${item.id}`, item);
  return `<div class="mlgm-cheat-tip__body">${title}${body}</div>`;
}

export function cheatChipClass(section, item) {
  const origin = item?.origin || section?.origin || "";
  const drakkenheim = origin === "drakkenheim" || section?.id === "drakkenheim" || String(section?.id || "").startsWith("drakkenheim-");
  return drakkenheim ? "gm-cheat-chip gm-cheat-chip--drakkenheim" : "gm-cheat-chip";
}

function renderChip(section, item) {
  const label = item.labelText ?? cheatText(`item.${item.id}.label`);
  const tip = item.tipHTML ?? cheatTooltipHTML(item);
  const origin = item.origin || section.origin || "";
  const originAttr = origin === "drakkenheim" ? ' data-cheat-origin="drakkenheim"' : "";
  const action = item.uuid ? ` data-action="cheat-document" data-id="${e(item.uuid)}"` : "";
  const page = item.pageId ? ` data-page="${e(item.pageId)}"` : "";
  const document = item.documentPath ? ` data-cheat-document="${e(item.documentPath)}"` : "";
  return `<button type="button" class="${cheatChipClass(section, item)}" data-mlgm-cheat="${e(item.id)}"${originAttr}${action}${page}${document} data-tooltip="${e(label)}" data-tooltip-html="${e(tip)}" data-tooltip-class="mlgm-cheat-tip">${e(label)}</button>`;
}

function renderSection(section) {
  const chips = section.items.map(item => renderChip(section, item)).join("");
  const open = closedSections.has(section.id) ? "" : " open";
  return `<details class="gm-cheat-section" data-cheat-section="${e(section.id)}"${open}><summary>${e(cheatText(`section.${section.id}`))}</summary><div class="gm-cheat-grid">${chips}</div></details>`;
}

function renderDrakkenheim(packItems) {
  const open = closedSections.has("drakkenheim") ? "" : " open";
  const section = { id: "drakkenheim", origin: "drakkenheim", items: packItems };
  const chips = `<div class="gm-cheat-grid">${packItems.map(item => renderChip(section, item)).join("")}</div>`;
  return `<details class="gm-cheat-section" data-cheat-section="drakkenheim" data-cheat-status="ready"${open}><summary>${e(cheatText("section.drakkenheim"))}</summary>${chips}</details>`;
}

export function renderCheatSheet({order = [], hidden = []} = {}) {
  const packConditions = drakkenheimConditions();
  const packItems = drakkenheimItems();
  const ids = visibleIds(CHEAT_LAYOUT.map(item => item.id), order, hidden);
  const html = ids.map(id => {
    if (id === "drakkenheim") return packItems.length ? renderDrakkenheim(packItems) : "";
    const section = CHEAT_SECTIONS.find(entry => entry.id === id);
    if (!section) return "";
    if (section.id === "conditions" && packConditions.length) return renderSection({ ...section, items: [...section.items, ...packConditions] });
    return renderSection(section);
  }).join("");
  return `<div class="gm-cheat" id="mlgm-cheat">${html}</div>`;
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
