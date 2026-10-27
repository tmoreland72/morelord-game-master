// World tray order and visibility. An empty order keeps the catalog order.
// An id is shown unless it is listed as hidden, so an upgrade hides nothing.

export const BULK_CARDS = Object.freeze([
  {id: "coins", label: "Coins"},
  {id: "xp", label: "XP"},
  {id: "inspiration", label: "Inspiration"},
  {id: "tokens", label: "Prototype Token Sync"},
  {id: "undo", label: "Undo Last Action"}
]);

export const CHEAT_LAYOUT = Object.freeze([
  {id: "conditions", label: "Conditions"},
  {id: "actions", label: "Actions in combat"},
  {id: "damage", label: "Improvising damage"},
  {id: "misc", label: "Misc"},
  {id: "cover", label: "Cover and vision"},
  {id: "drakkenheim", label: "Drakkenheim"}
]);

export function arrangedIds(known, order = []) {
  const ids = [...known];
  const saved = [];
  for (const id of order ?? []) if (ids.includes(id) && !saved.includes(id)) saved.push(id);
  return [...saved, ...ids.filter(id => !saved.includes(id))];
}

export function visibleIds(known, order = [], hidden = []) {
  const off = new Set((hidden ?? []).filter(id => idsInclude(known, id)));
  return arrangedIds(known, order).filter(id => !off.has(id));
}

export function moveId(known, order, id, before) {
  const current = arrangedIds(known, order);
  if (!current.includes(id) || before === id) return current;
  const next = current.filter(item => item !== id);
  const index = before ? next.indexOf(before) : -1;
  next.splice(index < 0 ? next.length : index, 0, id);
  return next;
}

export function toggledHidden(hidden, id, shown) {
  const next = new Set((hidden ?? []).filter(item => typeof item === "string" && item !== id));
  if (!shown) next.add(id);
  return [...next];
}

function idsInclude(known, id) {
  return [...known].includes(id);
}
