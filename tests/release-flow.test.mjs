import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('the manifest URL players already use stays on master', () => {
  const manifest = JSON.parse(read('module.json'));
  assert.equal(manifest.version, '0.4.4');
  assert.equal(
    manifest.manifest,
    'https://raw.githubusercontent.com/tmoreland72/morelord-game-master/master/module.json'
  );
  assert.equal(
    manifest.download,
    'https://github.com/tmoreland72/morelord-game-master/releases/download/v0.4.4/morelord-game-master.zip'
  );
  assert.equal(manifest.changelog, 'https://github.com/tmoreland72/morelord-game-master/releases');
});

test('release config matches the shared Morelord release.ps1 contract', () => {
  const config = JSON.parse(read('release.config.json'));
  assert.equal(config.moduleId, 'morelord-game-master');
  assert.equal(config.moduleTitle, 'Morelord Game Master');
  assert.equal(config.productSlug, 'morelord-game-master');
  assert.equal(config.githubOwner, 'tmoreland72');
  assert.equal(config.githubRepo, 'morelord-game-master');
  assert.equal(config.releaseBranch, 'master');
  assert.equal(config.archiveName, 'morelord-game-master.zip');
  assert.equal(config.websiteUrl, 'https://morelordgaming.com');
  assert.equal(config.productDocumentationPath, 'docs/README.md');
  for (const required of ['module.json', 'CHANGELOG.md', 'README.md', 'docs', 'scripts', 'styles', 'lang', 'packs']) {
    assert.ok(config.requiredPaths.includes(required), required);
    assert.equal(fs.existsSync(path.join(root, required)), true, required);
  }
  const docs = read('docs/README.md');
  assert.match(docs, /^product:\s*morelord-game-master\s*$/m);
  assert.match(docs, /^version:\s*0\.4\.4\s*$/m);
});

test('release.ps1 is the shared GitHub, Foundry, and website publisher', () => {
  const script = read('release.ps1');
  assert.match(script, /Standard Morelord Foundry module release workflow/);
  assert.match(script, /\$Tag = "v\$Version"/);
  assert.match(script, /\$env:RELEASE_PUBLISH_TOKEN/);
  assert.match(script, /\$env:FOUNDRY_RELEASE_TOKEN/);
  assert.match(script, /foundryvtt\.com\/_api\/packages\/release_version/);
  assert.match(script, /\/api\/releases/);
  assert.match(script, /releases\/download\/\$Tag\/\$ArchiveName/);
  assert.match(script, /\[switch\]\$FoundryOnly/);
  assert.match(script, /\[switch\]\$WebsiteOnly/);
  assert.match(script, /'release','create',\$Tag,\$ArchivePath/);
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/release-sync.yml')), false);
  assert.equal(fs.existsSync(path.join(root, 'scripts/release-sync.cjs')), false);
});

test('the release workflow resolves every maintained unit test file', () => {
  const workflow = read('.github/workflows/release.yml');
  assert.match(workflow, /Get-ChildItem -LiteralPath tests -Filter \*\.test\.mjs -File \| Sort-Object -Property Name/);
  assert.match(workflow, /if \(\$tests\.Count -eq 0\) \{ throw 'No tests\/\*\.test\.mjs files were found\.' \}/);
  assert.match(workflow, /node --test @\(\$tests\.FullName\)/);
  assert.doesNotMatch(workflow, /'tests\/ambience-folders\.test\.mjs'/);
  const files = fs.readdirSync(path.join(root, 'tests')).filter(name => name.endsWith('.test.mjs')).sort();
  for (const name of [
    'treasure-hoard.test.mjs',
    'hoard-item-card.test.mjs',
    'core-register-flow.test.mjs',
    'core-roll-request-card.test.mjs'
  ]) {
    assert.ok(files.includes(name), name);
  }
  assert.equal(files.length > 30, true);
});

test('0.5.0 notes are recorded and the published version stays for the Release workflow', () => {
  const manifest = JSON.parse(read('module.json'));
  assert.equal(manifest.version, '0.4.4');
  assert.equal(
    manifest.download,
    'https://github.com/tmoreland72/morelord-game-master/releases/download/v0.4.4/morelord-game-master.zip'
  );
  assert.equal(manifest.relationships.requires[0].id, 'morelord-core');
  assert.equal(manifest.relationships.requires[0].compatibility.minimum, '0.9.2');
  assert.match(read('docs/README.md'), /^version:\s*0\.4\.4\s*$/m);
  assert.match(read('README.md'), /^Version 0\.4\.4\.\s*$/m);
  assert.match(read('package.json'), /"version": "0\.4\.4"/);
  assert.equal(fs.existsSync(path.join(root, 'release-notes/RELEASE-NOTES-0.5.0.md')), true);
  const notes = read('release-notes/RELEASE-NOTES-0.5.0.md');
  assert.match(notes, /^## What Changed\s*$/m);
  assert.match(notes, /^### Added\s*$/m);
  assert.match(notes, /Morelord Core 0\.9\.2/);
});

test('the env example names the tokens release.ps1 reads', () => {
  const example = read('.env.example');
  assert.match(example, /^RELEASE_PUBLISH_TOKEN=/m);
  assert.match(example, /^FOUNDRY_RELEASE_TOKEN=fvttp_/m);
  assert.doesNotMatch(example, /MORELORD_RELEASE_TOKEN/);
});
