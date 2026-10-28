/** Bind Core's sortable helper. Visuals and the drag controller stay in Core. */
export function bindVisibleSortables(sortable, root, tab, {onMacros, onSettings} = {}) {
  if (typeof sortable?.bind !== "function" || !root?.querySelector) return false;
  let bound = false;
  if (tab === "macros") {
    const macros = root.querySelector(".gm-macros");
    if (macros) {
      sortable.bind(macros, {
        itemSelector: "[data-macro-uuid]",
        id: element => element.dataset.macroUuid,
        onReorder: onMacros
      });
      bound = true;
    }
  }
  if (tab === "settings") {
    for (const list of root.querySelectorAll(".gm-settings-list")) {
      const group = list.closest("[data-tray-section]")?.dataset.traySection;
      sortable.bind(list, {
        itemSelector: "[data-tray-item]",
        id: element => element.dataset.trayItem,
        onReorder: ids => onSettings(group, ids)
      });
      bound = true;
    }
  }
  return bound;
}
