import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RELAY_URL, MIXED_CONTENT_MESSAGE, askBody, campaignKey, healthSummary, mergeThread, mixedContentBlocked, normalizeRelayURL, parseAsk, parseHealth, parseThread, pollDelay, questionText, relayRequest, renderAnswerMarkdown, threadPending, threadQuery } from "../scripts/campaign-relay.mjs";

test("relay responses parse health, ask, and thread updates", () => {
  const health = parseHealth({ok: true, campaigns: [{key: "drakkenheim", name: "Drakkenheim", configured: true}, {key: "drow", configured: false}]});
  assert.equal(healthSummary(health, "drakkenheim"), "Drakkenheim is configured.");
  assert.equal(healthSummary(health, "drow"), "Rise of the Drow is not configured on the relay.");
  assert.equal(healthSummary(health, ""), "Relay is reachable. Choose a campaign before asking.");
  assert.match(healthSummary(health, "phandelver"), /not listed/);
  assert.throws(() => parseHealth({ok: false}));

  assert.deepEqual(parseAsk(200, {requestId: "req-1", status: "sent"}), {ok: true, requestId: "req-1", status: "sent", error: ""});
  assert.equal(parseAsk(502, {requestId: "req-2", status: "failed", error: "upstream"}).error, "upstream");
  assert.equal(parseAsk(503, {}).error, "This campaign is not configured on the relay.");
  assert.equal(parseAsk(404, {}).error, "The relay does not recognize that campaign.");
  assert.equal(parseAsk(401, {error: "secret-token"}).error, "The relay token was rejected.");
  assert.equal(parseAsk(500, {}).ok, false);

  const thread = parseThread({campaign: "phandelver", world: "dev1", serverTime: "2026-10-08T06:00:00.000Z", entries: [
    {requestId: "old", question: "First?", askedAt: "2026-10-08T05:00:00.000Z", status: "sent", answer: null, updatedAt: "2026-10-08T05:00:00.000Z"},
    {requestId: "", question: "skip"},
    {requestId: "bad", status: "weird", question: "Broken", askedAt: "2026-10-08T05:02:00.000Z"}
  ]});
  assert.equal(thread.serverTime, "2026-10-08T06:00:00.000Z");
  const merged = mergeThread(thread.entries, parseThread({campaign: "phandelver", world: "dev1", serverTime: "2026-10-08T06:02:00.000Z", entries: [
    {requestId: "old", question: "First?", askedAt: "2026-10-08T05:00:00.000Z", status: "answered", answer: "North", answeredAt: "2026-10-08T06:01:00.000Z", updatedAt: "2026-10-08T06:01:00.000Z"}
  ]}).entries);
  assert.deepEqual(merged.map(entry => entry.requestId), ["old", "bad"]);
  assert.equal(merged[0].status, "answered");
  assert.equal(merged[0].answer, "North");
  assert.equal(threadPending(thread.entries), true);
  assert.equal(threadPending(merged.filter(entry => entry.requestId === "old")), false);
  assert.equal(threadQuery({campaign: "drow", world: "dev1", since: thread.serverTime}), "/thread?campaign=drow&world=dev1&limit=50&since=2026-10-08T06%3A00%3A00.000Z");
  assert.deepEqual(askBody({campaign: "drakkenheim", world: "dev1", question: "Where?"}), {campaign: "drakkenheim", world: "dev1", question: "Where?"});
  assert.throws(() => parseThread({entries: []}));
});

test("polling waits while a question is open, slows after errors, and stops when hidden", () => {
  assert.equal(pollDelay({visible: false, pending: true, idle: true}), null);
  assert.equal(pollDelay({visible: true, pending: true, failures: 0, idle: true}), 4000);
  assert.equal(pollDelay({visible: true, pending: false, failures: 0, idle: true}), 30000);
  assert.equal(pollDelay({visible: true, pending: false, failures: 0, idle: false}), null);
  assert.equal(pollDelay({visible: true, pending: true, failures: 1}), 4000);
  assert.equal(pollDelay({visible: true, pending: true, failures: 3}), 16000);
  assert.equal(pollDelay({visible: true, failures: 12}), 120000);
  assert.equal(questionText("  Where is the cave?  "), "Where is the cave?");
  assert.throws(() => questionText(" "));
  assert.throws(() => questionText("x".repeat(4001)));
  assert.equal(campaignKey("phandelver"), "phandelver");
  assert.equal(campaignKey(""), "");
  assert.throws(() => campaignKey("homebrew"));
});

test("relay urls accept the private relay and answers cannot inject markup", async () => {
  assert.equal(normalizeRelayURL(DEFAULT_RELAY_URL), DEFAULT_RELAY_URL);
  assert.equal(normalizeRelayURL("https://relay.example"), "https://relay.example");
  for (const url of ["javascript:alert(1)", "https://user:secret@example.com", "https://example.com/path", "https://example.com?token=1"]) assert.throws(() => normalizeRelayURL(url));
  assert.equal(mixedContentBlocked("https:", DEFAULT_RELAY_URL), true);
  assert.equal(mixedContentBlocked("http:", DEFAULT_RELAY_URL), false);
  assert.match(MIXED_CONTENT_MESSAGE, /HTTPS/);

  const html = renderAnswerMarkdown("The **tower** is north.\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n[map](https://example.com/map)");
  assert.match(html, /<strong>tower<\/strong>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script|href="javascript:/);
  assert.match(html, /href="https:\/\/example\.com\/map"/);

  const calls = [];
  await assert.rejects(relayRequest(async () => { throw new Error("denied"); }, {baseUrl: DEFAULT_RELAY_URL, token: "super-secret-token", path: "/thread?campaign=drow&world=dev1", auth: true}), error => {
    assert.equal(error.message, "The Campaign AI relay could not be reached.");
    assert.doesNotMatch(error.message, /super-secret-token/);
    return true;
  });
  const result = await relayRequest(async (url, options) => { calls.push({url, options}); return Response.json({ok: true, campaigns: []}); }, {baseUrl: DEFAULT_RELAY_URL, token: "super-secret-token", path: "/health", auth: false});
  assert.equal(result.ok, true);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  await relayRequest(async (url, options) => { calls.push({url, options}); return Response.json({requestId: "1", status: "sent"}); }, {baseUrl: DEFAULT_RELAY_URL, token: "super-secret-token", path: "/ask", method: "POST", body: {campaign: "drow", world: "dev1", question: "Hello"}, auth: true});
  assert.equal(calls[1].options.headers.Authorization, "Bearer super-secret-token");
  assert.doesNotMatch(calls[1].url, /super-secret-token/);
});
