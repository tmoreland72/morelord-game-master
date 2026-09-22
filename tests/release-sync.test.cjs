const { test } = require('node:test');
const assert = require('node:assert/strict');
const sync = require('../scripts/release-sync.cjs');

function fixture({ tagVersion = null, latestVersion = '1.0.6', exists = false, draft = false, failure = null } = {}) {
  const calls = [];
  let tag = tagVersion;
  let latest = latestVersion;
  const missing = () => { throw Object.assign(new Error('Not found'), { status: 404 }); };
  const response = data => ({ data });
  const repos = {
    getBranch: async () => response({ commit: { sha: 'published-commit' } }),
    getContent: async ({ ref }) => response({ content: Buffer.from(JSON.stringify({ version: ref.startsWith('refs/tags/') ? tag : '1.0.8' })).toString('base64') }),
    getReleaseByTag: async () => { if (failure) throw Object.assign(new Error('API failure'), { status: failure }); return exists ? response({ id: 8, draft }) : missing(); },
    getLatestRelease: async () => latest ? response({ tag_name: latest }) : missing(),
    createRelease: async args => { calls.push(args); tag ??= args.tag_name; latest = args.tag_name; return response({ id: 8 }); },
    updateRelease: async args => { calls.push(args); latest = '1.0.8'; return response({ id: 8 }); }
  };
  return { calls, args: { github: { rest: { repos, git: { getRef: async () => tag ? response({}) : missing() } } }, context: { repo: { owner: 'test', repo: 'test' } }, core: { info() {} } } };
}

test('repairs the original missing tag/release and targets the published commit', async () => {
  const f = fixture(); await sync(f.args);
  assert.equal(f.calls[0].tag_name, '1.0.8');
  assert.equal(f.calls[0].target_commitish, 'published-commit');
});
test('aligned releases are a no-op', async () => {
  const f = fixture({ tagVersion: '1.0.8', latestVersion: '1.0.8', exists: true });
  await sync(f.args); assert.equal(f.calls.length, 0);
});
test('repairs latest without replacing an existing release', async () => {
  const f = fixture({ tagVersion: '1.0.8', exists: true });
  await sync(f.args); assert.deepEqual(f.calls[0], { owner: 'test', repo: 'test', release_id: 8, make_latest: 'true' });
});
test('refuses conflicting tags, drafts, downgrades and API failures', async () => {
  for (const options of [{ tagVersion: '1.0.7' }, { tagVersion: '1.0.8', exists: true, draft: true }, { latestVersion: '1.0.9' }, { failure: 403 }]) {
    const f = fixture(options); await assert.rejects(sync(f.args)); assert.equal(f.calls.length, 0);
  }
});
test('an existing valid tag can acquire its missing release', async () => {
  const f = fixture({ tagVersion: '1.0.8', latestVersion: null }); await sync(f.args); assert.equal(f.calls.length, 1);
});
