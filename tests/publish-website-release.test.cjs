const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  releaseMetadata,
  formatPublishedAt,
  releaseIsListed,
  publishWebsiteRelease
} = require('../scripts/publish-website-release.cjs');

const root = path.resolve(__dirname, '..');

function metadata(file) {
  const markdown = fs.readFileSync(path.join(root, 'release-notes', file), 'utf8');
  return releaseMetadata(markdown, 'Morelord Game Master');
}

test('categorized release notes match the release.ps1 change payload', () => {
  const notes = metadata('RELEASE-NOTES-0.1.12.md');
  assert.equal(notes.title, 'Morelord Game Master 0.1.12');
  assert.equal(notes.summary, 'Released October 22, 2026.');
  assert.deepEqual(notes.changes.map(change => change.category), [
    'improvement', 'improvement', 'improvement', 'improvement', 'improvement', 'fix'
  ]);
  assert.ok(notes.changes.every(change => change.tier === 'standard'));
  assert.equal(notes.changes[0].description.startsWith('Mass Combat uses Core'), true);
  assert.equal(notes.changes.at(-1).description.startsWith('Release regressions wait'), true);
  assert.equal(notes.changes.some(change => /All 50 module tests|Evidence:|branch archive/.test(change.description)), false);
});

test('a flat What Changed list becomes improvement entries and drops Verification', () => {
  const notes = metadata('RELEASE-NOTES-0.1.15.md');
  assert.deepEqual(notes.changes, [{
    category: 'improvement',
    tier: 'standard',
    description: 'Removed Campaign AI from the GM tray, including its tab, Foundry settings, local service, and provider configuration. The tray tabs are Roll Requests, Bulk Actions, Macros, Sound, Triggers, GM Settings, and Player Settings.'
  }]);
  assert.equal(notes.summary, notes.changes[0].description);
  assert.equal(JSON.stringify(notes).includes('release-synchronizer'), false);
});

test('tier markers and the website timestamp follow release.ps1', () => {
  const notes = releaseMetadata([
    '# Morelord Game Master 0.3.0',
    '',
    'Adds one premium control.',
    '',
    '## What Changed',
    '',
    '### Added',
    '',
    '- [Premium] Added a configurable approval.',
    '- **Champion:** Added a second gate.',
    '',
    '### Fixed',
    '',
    '- **Standard:** Fixed the selector.',
    '',
    '## Verification',
    '',
    '- Passed the module test suite.'
  ].join('\n'), 'fallback');
  assert.equal(notes.title, 'Morelord Game Master 0.3.0');
  assert.equal(notes.summary, 'Adds one premium control.');
  assert.deepEqual(notes.changes, [
    { category: 'feature', tier: 'premium', description: 'Added a configurable approval.' },
    { category: 'feature', tier: 'champion', description: 'Added a second gate.' },
    { category: 'fix', tier: 'standard', description: 'Fixed the selector.' }
  ]);
  assert.equal(formatPublishedAt(new Date('2026-08-04T22:30:00.000Z')), '2026-08-04T22:30:00.0000000+00:00');
});

test('an existing product version is recognized only by its own anchor', () => {
  const html = '<article id="morelord-core-0.3.0"></article><article id="morelord-game-master-0.2.0"></article>';
  assert.equal(releaseIsListed(html, 'morelord-game-master', '0.2.0'), true);
  assert.equal(releaseIsListed(html, 'morelord-game-master', '0.3.0'), false);
});

function tempRelease(version, notes) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mlgm-website-'));
  fs.mkdirSync(path.join(directory, 'release-notes'));
  fs.writeFileSync(path.join(directory, 'module.json'), JSON.stringify({
    id: 'morelord-game-master',
    title: 'Morelord Game Master',
    version,
    url: 'https://github.com/tmoreland72/morelord-game-master',
    manifest: 'https://raw.githubusercontent.com/tmorelord72/morelord-game-master/master/module.json',
    download: 'https://github.com/tmorelord72/morelord-game-master/archive/refs/heads/master.zip'
  }));
  fs.writeFileSync(path.join(directory, 'release.config.json'), JSON.stringify({
    productSlug: 'morelord-game-master',
    websiteUrl: 'https://morelordgaming.com'
  }));
  fs.writeFileSync(path.join(directory, 'release-notes', `RELEASE-NOTES-${version}.md`), notes);
  return directory;
}

const SAMPLE_NOTES = `# Morelord Game Master 0.3.0

Adds one premium control.

## What Changed

### Added

- [Premium] Added a configurable approval.

## Verification

- Passed the module test suite.
`;

test('a missing token skips the request', async () => {
  const directory = tempRelease('0.3.0', SAMPLE_NOTES);
  const warnings = [];
  try {
    const result = await publishWebsiteRelease({
      root: directory,
      token: '   ',
      version: '0.3.0',
      fetchImpl: async () => { throw new Error('fetch should not run'); },
      warn: message => warnings.push(message)
    });
    assert.equal(result.skipped, 'token');
    assert.match(warnings[0], /RELEASE_PUBLISH_TOKEN/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a version already listed on the website is not posted', async () => {
  const directory = tempRelease('0.3.0', SAMPLE_NOTES);
  const calls = [];
  try {
    const result = await publishWebsiteRelease({
      root: directory,
      token: 'secret-token',
      version: '0.3.0',
      websiteUrl: 'https://morelordgaming.com',
      githubReleaseUrl: 'https://github.com/tmorelord72/morelord-game-master/releases/tag/0.3.0',
      fetchImpl: async (url, options = {}) => {
        calls.push({ url, method: options.method || 'GET' });
        assert.equal(url, 'https://morelordgaming.com/releases');
        return {
          ok: true,
          async text() { return '<article id="morelord-game-master-0.3.0"></article>'; }
        };
      },
      info() {}
    });
    assert.equal(result.skipped, 'exists');
    assert.deepEqual(calls.map(call => call.method), ['GET']);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address())));
}

test('the publish command posts the release.ps1 payload to /api/releases', async () => {
  const directory = tempRelease('0.3.0', SAMPLE_NOTES);
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body
      });
      if (request.url === '/releases') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<article id="morelord-core-0.3.0"></article>');
        return;
      }
      if (request.method === 'POST' && request.url === '/api/releases') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          ok: true,
          action: 'created',
          releaseId: 'rel-1',
          productSlug: 'morelord-game-master',
          version: '0.3.0',
          publicUrl: '/releases#morelord-game-master-0.3.0'
        }));
        return;
      }
      response.writeHead(404);
      response.end('nope');
    });
  });
  const address = await listen(server);
  const child = spawn(process.execPath, [path.join(root, 'scripts/publish-website-release.cjs')], {
    env: {
      ...process.env,
      RELEASE_ROOT: directory,
      RELEASE_PUBLISH_TOKEN: 'secret-token',
      WEBSITE_URL: `http://127.0.0.1:${address.port}`,
      RELEASE_VERSION: '0.3.0',
      GITHUB_RELEASE_URL: 'https://github.com/tmorelord72/morelord-game-master/releases/tag/0.3.0'
    }
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exitCode = await new Promise(resolve => child.on('close', resolve));
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(directory, { recursive: true, force: true });
  assert.equal(stderr, '', stderr);
  assert.equal(exitCode, 0, stdout);
  assert.match(stdout, /Website record: created rel-1/);
  assert.deepEqual(requests.map(request => [request.method, request.url]), [
    ['GET', '/releases'],
    ['POST', '/api/releases']
  ]);
  const post = requests[1];
  assert.equal(post.headers.authorization, 'Bearer secret-token');
  assert.equal(post.headers.accept, 'application/json');
  assert.equal(post.headers['content-type'], 'application/json; charset=utf-8');
  const payload = JSON.parse(post.body);
  assert.deepEqual(Object.keys(payload), [
    'productSlug', 'version', 'title', 'summary', 'publishedAt',
    'githubReleaseUrl', 'downloadUrl', 'manifestUrl', 'changes'
  ]);
  assert.deepEqual(payload.changes, [
    { category: 'feature', tier: 'premium', description: 'Added a configurable approval.' }
  ]);
  assert.deepEqual(payload, {
    productSlug: 'morelord-game-master',
    version: '0.3.0',
    title: 'Morelord Game Master 0.3.0',
    summary: 'Adds one premium control.',
    publishedAt: payload.publishedAt,
    githubReleaseUrl: 'https://github.com/tmorelord72/morelord-game-master/releases/tag/0.3.0',
    downloadUrl: 'https://github.com/tmorelord72/morelord-game-master/archive/refs/heads/master.zip',
    manifestUrl: 'https://raw.githubusercontent.com/tmorelord72/morelord-game-master/master/module.json',
    changes: payload.changes
  });
  assert.match(payload.publishedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}\+00:00$/);
});
