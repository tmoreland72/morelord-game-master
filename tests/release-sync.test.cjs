const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sync = require('../scripts/release-sync.cjs');
const { writeChangelog } = require('../scripts/changelog.cjs');

function tempModule(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mlgm-changelog-'));
  fs.mkdirSync(path.join(root, 'release-notes'));
  fs.writeFileSync(path.join(root, 'module.json'), JSON.stringify({ title: 'Morelord Game Master' }));
  for (const [name, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), contents);
  }
  return root;
}

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
test('a current changelog still publishes the manifest release', async () => {
  const root = tempModule({ 'release-notes/RELEASE-NOTES-1.0.0.md': '# Morelord Game Master 1.0.0\n\n- Added a tray.\n' });
  try {
    writeChangelog(root);
    const f = fixture();
    await sync({ ...f.args, root });
    assert.equal(f.calls[0].tag_name, '1.0.8');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('refuses to publish when CHANGELOG.md does not match release notes', async () => {
  const root = tempModule({
    'release-notes/RELEASE-NOTES-1.0.0.md': '# Morelord Game Master 1.0.0\n\n- Added a tray.\n',
    'CHANGELOG.md': '# Morelord Game Master Changelog\n\n## 0.0.1\n\n- Stale.\n'
  });
  try {
    const f = fixture();
    await assert.rejects(sync({ ...f.args, root }), /CHANGELOG\.md/);
    assert.equal(f.calls.length, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('publishes when the checkout has no release notes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mlgm-changelog-'));
  try {
    const f = fixture();
    await sync({ ...f.args, root });
    assert.equal(f.calls.length, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
