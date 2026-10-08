import { escapeHTML } from "./core.mjs";

export const DEFAULT_RELAY_URL = "http://100.73.212.43:8787";
export const QUESTION_MAX = 4000;
export const POLL_PENDING_MS = 4000;
export const POLL_IDLE_MS = 30000;
export const POLL_ERROR_MAX_MS = 120000;
export const RELAY_CAMPAIGNS = [
  {key: "", label: "None"},
  {key: "phandelver", label: "Phandelver & Below"},
  {key: "drakkenheim", label: "Drakkenheim"},
  {key: "drow", label: "Rise of the Drow"}
];
export const MIXED_CONTENT_MESSAGE = "Foundry is open over HTTPS, so the browser blocks this HTTP Campaign AI relay. Use an HTTPS relay URL, or open Foundry over HTTP.";

const ENTRY_STATUSES = new Set(["pending", "sent", "failed", "answered"]);

export function normalizeRelayURL(value) {
  const url = new URL(String(value ?? "").trim());
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Use an http or https relay URL.");
  if (url.username || url.password) throw new Error("Put the relay token in the token field, not the URL.");
  if (url.search || url.hash || (url.pathname && url.pathname !== "/")) throw new Error("Use the relay origin without a path or query.");
  return url.origin;
}

export function mixedContentBlocked(pageProtocol, relayUrl) {
  try { return pageProtocol === "https:" && new URL(relayUrl).protocol === "http:"; }
  catch { return false; }
}

export function campaignKey(value) {
  const key = String(value ?? "");
  if (!RELAY_CAMPAIGNS.some(campaign => campaign.key === key)) throw new Error("Choose Phandelver & Below, Drakkenheim, or Rise of the Drow.");
  return key;
}

export function questionText(value) {
  const question = String(value ?? "").trim();
  if (!question) throw new Error("Enter a question.");
  if (question.length > QUESTION_MAX) throw new Error("Questions are limited to 4000 characters.");
  return question;
}

export function pollDelay({visible, pending, failures = 0, idle = false} = {}) {
  if (!visible) return null;
  if (failures > 0) return Math.min(POLL_ERROR_MAX_MS, POLL_PENDING_MS * 2 ** Math.min(failures - 1, 5));
  if (pending) return POLL_PENDING_MS;
  if (idle) return POLL_IDLE_MS;
  return null;
}

export function threadPending(entries) {
  return (entries ?? []).some(entry => entry.status === "pending" || entry.status === "sent");
}

export function mergeThread(current, incoming) {
  const byId = new Map();
  for (const entry of [...(current ?? []), ...(incoming ?? [])]) {
    if (!entry?.requestId) continue;
    byId.set(entry.requestId, entry);
  }
  return [...byId.values()].sort((a, b) => String(a.askedAt ?? "").localeCompare(String(b.askedAt ?? "")) || String(a.requestId).localeCompare(String(b.requestId)));
}

export function parseHealth(body) {
  if (!body || body.ok !== true || !Array.isArray(body.campaigns)) throw new Error("The relay health response was not recognized.");
  return {ok: true, campaigns: body.campaigns.map(campaign => ({key: String(campaign?.key ?? ""), name: String(campaign?.name || campaign?.key || ""), configured: campaign?.configured === true}))};
}

export function healthSummary(health, campaign) {
  if (!campaign) return "Relay is reachable. Choose a campaign before asking.";
  const match = health.campaigns.find(item => item.key === campaign);
  const label = RELAY_CAMPAIGNS.find(item => item.key === campaign)?.label ?? campaign;
  if (!match) return `Relay is reachable, but ${label} is not listed.`;
  return match.configured ? `${label} is configured.` : `${label} is not configured on the relay.`;
}

export function parseAsk(status, body) {
  if (status === 200 && body?.status === "sent" && body.requestId) return {ok: true, requestId: String(body.requestId), status: "sent", error: ""};
  if (status === 502) return {ok: false, requestId: body?.requestId ? String(body.requestId) : "", status: "failed", error: String(body?.error || "The relay failed to send the question.")};
  if (status === 503) return {ok: false, requestId: "", status: "failed", error: "This campaign is not configured on the relay."};
  if (status === 404) return {ok: false, requestId: "", status: "failed", error: "The relay does not recognize that campaign."};
  if (status === 401) return {ok: false, requestId: "", status: "failed", error: "The relay token was rejected."};
  return {ok: false, requestId: "", status: "failed", error: "The relay could not accept the question."};
}

export function parseThread(body) {
  if (!body || !Array.isArray(body.entries) || typeof body.serverTime !== "string") throw new Error("The relay thread response was not recognized.");
  return {
    campaign: String(body.campaign ?? ""),
    world: String(body.world ?? ""),
    serverTime: body.serverTime,
    entries: body.entries.flatMap(entry => {
      if (!entry?.requestId) return [];
      const status = ENTRY_STATUSES.has(entry.status) ? entry.status : "failed";
      return [{
        requestId: String(entry.requestId),
        question: String(entry.question ?? ""),
        askedAt: String(entry.askedAt ?? ""),
        status,
        error: entry.error ? String(entry.error) : "",
        answer: entry.answer == null ? null : String(entry.answer),
        answeredAt: entry.answeredAt ? String(entry.answeredAt) : "",
        updatedAt: String(entry.updatedAt ?? "")
      }];
    })
  };
}

export function threadQuery({campaign, world, since, limit = 50} = {}) {
  const params = new URLSearchParams({campaign, world, limit: String(limit)});
  if (since) params.set("since", since);
  return `/thread?${params}`;
}

export function askBody({campaign, world, question}) {
  return {campaign, world, question};
}

export async function relayRequest(fetchImpl, {baseUrl, token = "", path, method = "GET", body, auth = true} = {}) {
  const origin = normalizeRelayURL(baseUrl);
  const headers = {};
  if (auth) {
    if (!String(token)) throw new Error("Enter the relay token on GM Settings.");
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetchImpl(origin + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body)});
  } catch {
    throw new Error("The Campaign AI relay could not be reached.");
  }
  let json = null;
  try { json = await response.json(); } catch { json = null; }
  return {ok: response.ok, status: response.status, json};
}

function inlineMarkdown(text) {
  let html = escapeHTML(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return html;
}

function renderMarkdownText(source) {
  const html = [];
  let list = "";
  const closeList = () => { if (list) { html.push(`</${list}>`); list = ""; } };
  for (const line of source.split("\n")) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (heading) { closeList(); html.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`); continue; }
    if (bullet) { if (list !== "ul") { closeList(); html.push("<ul>"); list = "ul"; } html.push(`<li>${inlineMarkdown(bullet[1])}</li>`); continue; }
    if (numbered) { if (list !== "ol") { closeList(); html.push("<ol>"); list = "ol"; } html.push(`<li>${inlineMarkdown(numbered[1])}</li>`); continue; }
    if (!line.trim()) { closeList(); continue; }
    closeList();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeList();
  return html.join("");
}

export function renderAnswerMarkdown(value) {
  const source = String(value ?? "").replace(/\r\n/g, "\n");
  return source.split("```").map((block, index) => index % 2 === 1 ? `<pre><code>${escapeHTML(block.replace(/^\n/, "").replace(/\n$/, ""))}</code></pre>` : renderMarkdownText(block)).join("");
}
