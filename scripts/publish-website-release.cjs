// Posts a manifest release to morelordgaming.com/api/releases.
// Payload fields match morelord-core release.ps1 New-WebsiteReleasePayload
// and the website releaseInputSchema. Discord is the website's job.
const fs = require('node:fs');
const path = require('node:path');

const CATEGORY_MAP = {
  added: 'feature',
  new: 'feature',
  features: 'feature',
  feature: 'feature',
  improvements: 'improvement',
  improvement: 'improvement',
  changed: 'improvement',
  changes: 'improvement',
  fixed: 'fix',
  fixes: 'fix',
  'bug fixes': 'fix',
  bugfixes: 'fix',
  breaking: 'breaking',
  'breaking changes': 'breaking',
  security: 'security'
};

const CHANGE_CATEGORIES = new Set(['feature', 'improvement', 'fix', 'breaking', 'security']);
const CHANGE_TIERS = new Set(['standard', 'premium', 'champion']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function releaseMetadata(markdown, defaultTitle) {
  const lines = String(markdown || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let title = defaultTitle;
  const summaryLines = [];
  const changes = [];
  let currentCategory = null;
  let seenH2 = false;
  let h2 = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#\s+(.+)$/.test(trimmed) && !/^##/.test(trimmed)) {
      title = /^#\s+(.+)$/.exec(trimmed)[1].trim();
      continue;
    }
    const h2Match = /^##\s+(.+)$/.exec(trimmed);
    if (h2Match) {
      seenH2 = true;
      h2 = h2Match[1].trim().toLowerCase();
      currentCategory = CATEGORY_MAP[h2] || null;
      continue;
    }
    const h3Match = /^###\s+(.+)$/.exec(trimmed);
    if (h3Match) {
      currentCategory = CATEGORY_MAP[h3Match[1].trim().toLowerCase()] || null;
      continue;
    }
    if (!seenH2 && trimmed) {
      summaryLines.push(trimmed);
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (!bullet) continue;
    // release.ps1 only keeps bullets under a mapped category heading.
    // Game Master notes also use a flat list under "## What Changed".
    // That heading is not in the category map, so those bullets use the
    // generic "changes" category the script already calls improvement.
    let category = currentCategory;
    if (!category && h2 === 'what changed') category = 'improvement';
    if (!category) continue;
    let description = bullet[1].trim();
    let tier = 'standard';
    const bracket = /^\[(premium|champion|standard)\]\s*(.+)$/i.exec(description);
    const bold = /^\*\*(premium|champion|standard):\*\*\s*(.+)$/i.exec(description);
    if (bracket) {
      tier = bracket[1].toLowerCase();
      description = bracket[2].trim();
    } else if (bold) {
      tier = bold[1].toLowerCase();
      description = bold[2].trim();
    }
    if (!description) continue;
    changes.push({ category, tier, description });
  }

  let summary = summaryLines.join(' ').trim();
  if (!summary && changes.length) summary = String(changes[0].description);
  return { title: String(title), summary, changes };
}

function assertPublishable(metadata, markdown, notesPath) {
  if (!/^##\s+What Changed\s*$/im.test(String(markdown || ''))) {
    throw new Error(`Release notes '${notesPath}' must include the standard '## What Changed' heading.`);
  }
  if (metadata.changes.length) return;
  throw new Error(`Release notes '${notesPath}' do not contain any publishable What Changed entries. Use bullet lists under subsections such as ### Added, ### Improvements, or ### Fixed.`);
}

function formatPublishedAt(date) {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3})Z$/.exec(date.toISOString());
  if (!match) throw new Error('publishedAt must be a valid date.');
  // DateTimeOffset.ToString('o') in release.ps1, at millisecond resolution.
  return `${match[1]}.${match[2]}0000+00:00`;
}

function websiteReleasePayload({ productSlug, version, title, summary, publishedAt, githubReleaseUrl, downloadUrl, manifestUrl, changes }) {
  return {
    productSlug,
    version,
    title,
    summary,
    publishedAt,
    githubReleaseUrl,
    downloadUrl,
    manifestUrl,
    changes
  };
}

function assertPayload(payload) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.productSlug)) {
    throw new Error(`productSlug '${payload.productSlug}' is not a website product slug.`);
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(payload.version)) {
    throw new Error(`version '${payload.version}' is not a website release version.`);
  }
  if (!payload.title.trim() || payload.title.trim().length > 160) {
    throw new Error('Release title must be 1-160 characters.');
  }
  if (payload.summary.length > 2000) throw new Error('Release summary must be 2000 characters or fewer.');
  for (const [name, value] of [['githubReleaseUrl', payload.githubReleaseUrl], ['downloadUrl', payload.downloadUrl], ['manifestUrl', payload.manifestUrl]]) {
    if (!value || value.length > 2048) throw new Error(`${name} is missing or too long.`);
    let url;
    try { url = new URL(value); } catch { throw new Error(`${name} must be an http(s) URL.`); }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`${name} must be an http(s) URL.`);
  }
  if (payload.changes.length > 100) throw new Error('A website release accepts at most 100 changes.');
  for (const change of payload.changes) {
    if (!CHANGE_CATEGORIES.has(change.category)) throw new Error(`Unknown change category '${change.category}'.`);
    if (!CHANGE_TIERS.has(change.tier)) throw new Error(`Unknown change tier '${change.tier}'.`);
    const description = change.description.trim();
    if (!description || description.length > 1000) {
      throw new Error(`A change description is ${description.length} characters; the website accepts 1-1000.`);
    }
  }
}

function releaseIsListed(html, productSlug, version) {
  const id = `${productSlug}-${version}`;
  return String(html || '').includes(`id="${id}"`) || String(html || '').includes(`id='${id}'`);
}

function websiteBase(value, config) {
  return String(value || config.websiteUrl || 'https://morelordgaming.com').replace(/\/+$/, '');
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { error: text }; }
}

async function publishWebsiteRelease({
  root,
  token = process.env.RELEASE_PUBLISH_TOKEN || '',
  websiteUrl = process.env.WEBSITE_URL || '',
  version = process.env.RELEASE_VERSION || '',
  githubReleaseUrl = process.env.GITHUB_RELEASE_URL || '',
  fetchImpl = globalThis.fetch,
  now = new Date(),
  warn = message => console.log(`::warning::${message}`),
  info = message => console.log(message)
} = {}) {
  if (!String(token || '').trim()) {
    warn('RELEASE_PUBLISH_TOKEN is not set; skipping website release publish.');
    return { skipped: 'token' };
  }
  const manifest = readJson(path.join(root, 'module.json'));
  const configPath = path.join(root, 'release.config.json');
  const config = fs.existsSync(configPath) ? readJson(configPath) : {};
  const base = websiteBase(websiteUrl, config);
  const productSlug = String(config.productSlug || manifest.id || '').trim();
  const resolvedVersion = String(version || manifest.version || '').trim();
  if (manifest.version !== resolvedVersion) {
    throw new Error(`module.json version ${manifest.version} does not match release ${resolvedVersion}.`);
  }
  const page = await fetchImpl(`${base}/releases`, { headers: { accept: 'text/html' } });
  if (!page.ok) throw new Error(`Unable to check existing website releases (${page.status}).`);
  const html = await page.text();
  if (releaseIsListed(html, productSlug, resolvedVersion)) {
    info(`Website already lists ${productSlug} ${resolvedVersion}; skipping publish.`);
    return { skipped: 'exists' };
  }

  const notesPath = path.join(root, 'release-notes', `RELEASE-NOTES-${resolvedVersion}.md`);
  if (!fs.existsSync(notesPath)) throw new Error(`Release notes were not found: ${notesPath}`);
  const markdown = fs.readFileSync(notesPath, 'utf8');
  const metadata = releaseMetadata(markdown, `${manifest.title} ${resolvedVersion}`);
  assertPublishable(metadata, markdown, notesPath);
  const releaseUrl = githubReleaseUrl || `${String(manifest.url || '').replace(/\/+$/, '')}/releases/tag/${resolvedVersion}`;
  const payload = websiteReleasePayload({
    productSlug,
    version: resolvedVersion,
    title: metadata.title,
    summary: metadata.summary,
    publishedAt: formatPublishedAt(now),
    githubReleaseUrl: releaseUrl,
    downloadUrl: manifest.download,
    manifestUrl: manifest.manifest,
    changes: metadata.changes
  });
  assertPayload(payload);

  const response = await fetchImpl(`${base}/api/releases`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${String(token).trim()}`,
      accept: 'application/json',
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  });
  const body = await readResponse(response);
  if (!response.ok || !body?.ok) {
    throw new Error(`Website release publication failed: ${body?.error || response.status}`);
  }
  info(`Website record: ${body.action} ${body.releaseId}`);
  if (body.publicUrl) info(`Public URL: ${base}${body.publicUrl}`);
  return { skipped: null, payload, response: body };
}

async function main() {
  const root = process.env.RELEASE_ROOT || path.resolve(__dirname, '..');
  await publishWebsiteRelease({ root });
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  releaseMetadata,
  assertPublishable,
  formatPublishedAt,
  websiteReleasePayload,
  releaseIsListed,
  publishWebsiteRelease
};
