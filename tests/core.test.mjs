import test from "node:test";
import assert from "node:assert/strict";
import { summarize, escapeHTML } from "../scripts/core.mjs";

test("averages ignore pending, duplicate, foreign, and invalid results",() => {
  assert.equal(summarize(["a","b"],[]).average,null);
  const partial = summarize(["a","b"],[{actorId:"a",total:0},{actorId:"a",total:20},{actorId:"c",total:99},{actorId:"b",total:NaN}]);
  assert.equal(partial.average,0); assert.equal(partial.count,1); assert.equal(partial.complete,false);
  const final = summarize(["a","b"],[{actorId:"a",total:8},{actorId:"b",total:15}]);
  assert.equal(final.average,11.5); assert.equal(final.complete,true);
});
test("user content is escaped",() => {
  assert.equal(escapeHTML('<img src="x" onerror=\'x\'>&'),"&lt;img src=&quot;x&quot; onerror=&#39;x&#39;&gt;&amp;");
});
