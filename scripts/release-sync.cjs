// Compendium distributes master directly; releases record its manifest version.
module.exports = async function syncRelease({ github, context, core }) {
  const repo = context.repo;
  async function optional(call) {
    try { return (await call()).data; }
    catch (error) { if (error.status === 404) return null; throw error; }
  }
  async function manifest(ref) {
    const { data } = await github.rest.repos.getContent({ ...repo, path: 'module.json', ref });
    return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  }
  const { data: branch } = await github.rest.repos.getBranch({ ...repo, branch: 'master' });
  const sha = branch.commit.sha;
  const { version } = await manifest(sha);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Manifest version must be major.minor.patch');
  const tag = await optional(() => github.rest.git.getRef({ ...repo, ref: `tags/${version}` }));
  if (tag && (await manifest(`refs/tags/${version}`)).version !== version) {
    throw new Error(`Existing tag ${version} has a different manifest version; refusing to move it`);
  }
  let release = await optional(() => github.rest.repos.getReleaseByTag({ ...repo, tag: version }));
  if (release?.draft || release?.prerelease) throw new Error(`Release ${version} is draft/prerelease; review it manually`);
  const latest = await optional(() => github.rest.repos.getLatestRelease(repo));
  if (latest && latest.tag_name !== version) {
    const current = version.split('.').map(Number);
    const previous = latest.tag_name.replace(/^v/, '').split('.').map(Number);
    const difference = current.map((part, i) => part - previous[i]).find(part => part !== 0);
    if (difference < 0) throw new Error('Manifest version is older than the latest release; refusing to downgrade');
  }
  // A queued run always reads current master; stop if it changed during validation.
  const { data: currentBranch } = await github.rest.repos.getBranch({ ...repo, branch: 'master' });
  if (currentBranch.commit.sha !== sha) throw new Error('master changed during synchronization; rerun the workflow');
  if (!release) {
    ({ data: release } = await github.rest.repos.createRelease({
      ...repo, tag_name: version, target_commitish: sha, name: version,
      make_latest: 'true', generate_release_notes: true,
      body: 'Records the version already published through the master branch manifest. Installation and updates continue through the manifest URL in README.md. This entry does not add a new Foundry compatibility certification.'
    }));
  } else if (latest?.tag_name !== version) {
    await github.rest.repos.updateRelease({ ...repo, release_id: release.id, make_latest: 'true' });
  }
  const verified = await manifest(`refs/tags/${version}`);
  const { data: published } = await github.rest.repos.getLatestRelease(repo);
  if (verified.version !== version || published.tag_name !== version) throw new Error('Release synchronization verification failed');
  core.info(`Manifest, tag and latest release agree: ${version}`);
};
