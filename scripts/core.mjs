export const ID = "morelord-game-master";
export const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function summarize(actorIds, results) {
  const accepted = new Map();
  for (const result of results) {
    if (actorIds.includes(result.actorId) && Number.isFinite(result.total) && !accepted.has(result.actorId)) accepted.set(result.actorId, result.total);
  }
  return { count: accepted.size, expected: actorIds.length, complete: accepted.size === actorIds.length,
    average: accepted.size ? [...accepted.values()].reduce((a, b) => a + b, 0) / accepted.size : null, totals: accepted };
}
export function companionURL(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Use a service origin without a path, credentials, or query.");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error("Use HTTPS or a localhost companion.");
  return url.origin;
}
