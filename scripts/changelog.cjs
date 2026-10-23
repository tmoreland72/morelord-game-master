// Builds the root CHANGELOG.md that BBMM and other in-Foundry viewers read
// from the installed module folder. release-notes/ is export-ignored, so the
// cumulative file has to stay at the repository root.
const fs = require('node:fs');
const path = require('node:path');

const RELEASE_NOTE = /^RELEASE-NOTES-(\d+\.\d+\.\d+)\.md$/;
const LEGACY_NOTE = /^(\d+\.\d+\.\d+)\.md$/;
const INTERNAL_HEADING = /^(verification|validation|testing|tests|test results|internal)\b/i;

function compareSemver(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

function listReleaseNotes(root) {
  const directory = path.join(root, 'release-notes');
  if (!fs.existsSync(directory)) return [];
  const byVersion = new Map();
  for (const name of fs.readdirSync(directory)) {
    const release = RELEASE_NOTE.exec(name);
    const legacy = LEGACY_NOTE.exec(name);
    const version = release?.[1] || legacy?.[1];
    if (!version) continue;
    const precedence = release ? 2 : 1;
    const current = byVersion.get(version);
    if (current && current.precedence >= precedence) continue;
    byVersion.set(version, { version, precedence, file: path.join(directory, name) });
  }
  return [...byVersion.values()].sort((a, b) => compareSemver(b.version, a.version));
}

function readTitle(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'module.json'), 'utf8'));
  const title = String(manifest.title || '').trim();
  if (!title) throw new Error('module.json title is required to build CHANGELOG.md');
  return title;
}

function headingLevel(line) {
  const match = /^(#{1,6})\s*(\S.*)$/.exec(line.trim());
  if (!match) return null;
  return { level: match[1].length, text: match[2].trim() };
}

function isRule(line) {
  return /^\s*([-*_])\1{2,}\s*$/.test(line);
}

function isBullet(line) {
  return /^(\s*)[-*+]\s+/.test(line);
}

function normalizeBullet(line) {
  return line.replace(/^(\s*)[-*+]\s+/, '$1- ');
}

function isInternalSentence(sentence) {
  const text = sentence.replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (/^(verification|validation|validated|verified|testing|evidence|automated|live|rendered|in-foundry)\b/i.test(text)) return true;
  if (/^all \d+\b/i.test(text) && /\b(tests?|checks?)\b/i.test(text)) return true;
  if (/\b(tests?|checks?)\b/i.test(text) && /\b(pass(?:ed)?|fail(?:ed)?|skipp(?:ed|ing))\b/i.test(text)) return true;
  if (/\blive (verification|regression|testing)s?\b/i.test(text)) return true;
  if (/\b(design-system(?: boundary)? check|browser smoke harness|release-synchronizer tests|release-workflow tests|release-sync tests)\b/i.test(text)) return true;
  if (/\bscripts\/testing\//i.test(text)) return true;
  if (/\b(?:was|were) skipped\b/i.test(text) && /\b(verif|test|Dev1|regression|Foundry)\b/i.test(text)) return true;
  if (/\b(visually inspected|screenshots were inspected|not claimed)\b/i.test(text)) return true;
  return false;
}

function trimInternalSentences(paragraph) {
  return paragraph
    .split(/(?<=[.!])\s+(?=[A-Z])/)
    .map(part => part.trim())
    .filter(part => part && !isInternalSentence(part))
    .join(' ');
}

function bulletIsInternal(body) {
  const text = body.trim();
  return /^(verification|validation|validated|verified|testing|evidence)\b/i.test(text)
    || (/^all \d+\b/i.test(text) && /\b(tests?|checks?)\b/i.test(text))
    || /^automated\b/i.test(text);
}

function userFacingBody(markdown) {
  const lines = String(markdown || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  const kept = [];
  const prose = [];
  let skipping = 0;
  let seenContent = false;

  const flushProse = () => {
    if (!prose.length) return;
    const text = trimInternalSentences(prose.join(' '));
    prose.length = 0;
    if (text) {
      kept.push(text);
      seenContent = true;
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/[ \t]+$/g, '');
    if (isRule(line)) continue;
    const heading = headingLevel(line);
    if (heading) {
      flushProse();
      if (!seenContent && heading.level === 1 && kept.every(entry => !entry.trim())) continue;
      if (skipping && heading.level <= skipping) skipping = 0;
      if (INTERNAL_HEADING.test(heading.text)) {
        skipping = heading.level;
        continue;
      }
      if (skipping) continue;
      const level = heading.level <= 2 ? 3 : heading.level;
      kept.push(`${'#'.repeat(level)} ${heading.text}`);
      seenContent = true;
      continue;
    }
    if (skipping) continue;
    if (!line.trim()) {
      flushProse();
      kept.push('');
      continue;
    }
    if (isBullet(line)) {
      flushProse();
      const normalized = normalizeBullet(line);
      const body = normalized.replace(/^\s*- /, '');
      if (bulletIsInternal(body)) continue;
      kept.push(normalized);
      seenContent = true;
      continue;
    }
    prose.push(line.trim());
  }
  flushProse();

  const text = kept
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/^(#{1,6} .+)\n(?!\n)/gm, '$1\n\n')
    .replace(/(\n- [^\n]*)\n\n(?=- )/g, '$1\n');
  return dropHollowHeadings(text);
}

function dropHollowHeadings(markdown) {
  const lines = markdown.split('\n');
  const kept = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = headingLevel(lines[index]);
    if (heading) {
      let next = index + 1;
      while (next < lines.length && !lines[next].trim()) next += 1;
      if (headingLevel(lines[next] || '')) continue;
    }
    kept.push(lines[index]);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function assertBbmmCompatible(markdown) {
  const versions = [];
  let seenH1 = false;
  for (const line of markdown.split('\n')) {
    if (isRule(line)) throw new Error('CHANGELOG.md cannot contain a horizontal rule');
    const marker = /^(#{1,6})(.*)$/.exec(line);
    if (marker && marker[2] && !marker[2].startsWith(' ')) {
      throw new Error(`CHANGELOG.md heading needs a space after #: ${line}`);
    }
    if (/^\s*[*+]\s+/.test(line)) throw new Error(`CHANGELOG.md bullets must use "- ": ${line}`);
    const heading = /^(#{1,6}) (.*)$/.exec(line);
    if (!heading) continue;
    const level = heading[1].length;
    const text = heading[2].trim();
    if (!text) throw new Error('CHANGELOG.md heading is empty');
    if (level === 1) {
      if (seenH1) throw new Error('CHANGELOG.md has more than one top-level heading');
      seenH1 = true;
      continue;
    }
    if (level === 2) {
      if (!/^\d+\.\d+\.\d+$/.test(text)) throw new Error(`Level-2 heading must be a version: ${line}`);
      versions.push(text);
    }
  }
  for (let index = 1; index < versions.length; index += 1) {
    if (compareSemver(versions[index - 1], versions[index]) <= 0) {
      throw new Error('CHANGELOG.md versions must be in descending order');
    }
  }
}

function renderChangelog({ title, entries }) {
  const ordered = [...entries].sort((a, b) => compareSemver(b.version, a.version));
  const parts = [`# ${title} Changelog`];
  for (const entry of ordered) {
    if (!/^\d+\.\d+\.\d+$/.test(entry.version)) throw new Error(`Invalid changelog version: ${entry.version}`);
    parts.push(`## ${entry.version}`);
    const body = userFacingBody(entry.markdown);
    if (body) parts.push(body);
  }
  const markdown = `${parts.join('\n\n')}\n`;
  assertBbmmCompatible(markdown);
  return markdown;
}

function generateChangelog(root) {
  const notes = listReleaseNotes(root);
  if (!notes.length) return null;
  return renderChangelog({
    title: readTitle(root),
    entries: notes.map(note => ({
      version: note.version,
      markdown: fs.readFileSync(note.file, 'utf8')
    }))
  });
}

function changelogStatus(root) {
  const expected = generateChangelog(root);
  if (!expected) return { ok: true, skipped: true, expected: null, actual: null };
  const file = path.join(root, 'CHANGELOG.md');
  const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  return { ok: actual === expected, skipped: false, expected, actual };
}

function assertChangelogCurrent(root) {
  const status = changelogStatus(root);
  if (!status.ok) {
    throw new Error('CHANGELOG.md is out of date with release-notes/RELEASE-NOTES-*.md. Run node scripts/changelog.cjs');
  }
}

function writeChangelog(root) {
  const expected = generateChangelog(root);
  if (!expected) throw new Error('No release-notes/RELEASE-NOTES-*.md files to write into CHANGELOG.md');
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), expected);
  return expected;
}

module.exports = {
  compareSemver,
  listReleaseNotes,
  userFacingBody,
  renderChangelog,
  generateChangelog,
  changelogStatus,
  assertChangelogCurrent,
  writeChangelog
};

if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const check = process.argv.includes('--check');
  const status = changelogStatus(root);
  if (status.skipped) {
    console.log('No release-notes/RELEASE-NOTES-*.md files; CHANGELOG.md left unchanged.');
    process.exit(0);
  }
  if (check) {
    if (!status.ok) {
      console.error('CHANGELOG.md is out of date with release-notes/RELEASE-NOTES-*.md.');
      console.error('Run: node scripts/changelog.cjs');
      process.exit(1);
    }
    console.log('CHANGELOG.md matches release-notes/RELEASE-NOTES-*.md.');
    process.exit(0);
  }
  writeChangelog(root);
  console.log('Wrote CHANGELOG.md');
}
