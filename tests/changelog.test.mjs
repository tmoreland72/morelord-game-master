import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const {
  changelogStatus,
  listReleaseNotes,
  renderChangelog,
  userFacingBody
} = require("../scripts/changelog.cjs");

const root = path.resolve(import.meta.dirname, "..");

test("release notes become a newest-first BBMM changelog", () => {
  const markdown = renderChangelog({
    title: "Morelord Game Master",
    entries: [
      { version: "0.1.9", markdown: "# Morelord Game Master 0.1.9\n\n- Older.\n" },
      { version: "0.1.10", markdown: "# Morelord Game Master 0.1.10\n\n* Newer.\n\n---\n\n## Verification\n\nAll 3 tests passed.\n" }
    ]
  });
  assert.match(markdown, /^# Morelord Game Master Changelog\n\n## 0\.1\.10\n/);
  assert.ok(markdown.indexOf("## 0.1.10") < markdown.indexOf("## 0.1.9"));
  assert.match(markdown, /^- Newer\.$/m);
  assert.doesNotMatch(markdown, /^---$/m);
  assert.doesNotMatch(markdown, /^\s*[*+]\s+/m);
  assert.doesNotMatch(markdown, /^## (?!\d)/m);
  assert.doesNotMatch(markdown, /Verification|tests passed/);
  assert.match(markdown, /^- Older\.$/m);
});

test("verification sections and internal test prose stay out of the changelog", () => {
  const body = userFacingBody(`# Module 1.2.3

Introduces the tray.

## What Changed

+ Added a handle.

##Verification

- Secret totals.

### Testing

- More internal notes.

## Improvements

- Kept the panel opaque.

Automated migration tests cover the upgrade. Live verification was skipped because TestA is active.

Requires Core 0.3.13 for the shared tray surface. Rendered tab backgrounds passed isolated-browser checks.
`);
  assert.match(body, /Introduces the tray\.\n\n### What Changed\n\n- Added a handle\.\n\n### Improvements\n\n- Kept the panel opaque\.\n\nRequires Core 0\.3\.13 for the shared tray surface\./);
  assert.doesNotMatch(body, /Secret totals|internal notes|Automated migration|Rendered tab|## Verification|##Verification/);
  for (const line of body.split("\n")) {
    if (/^#{1,6}/.test(line)) assert.match(line, /^#{1,6} \S/);
  }
});

test("the committed changelog matches every versioned release note", () => {
  const notes = listReleaseNotes(root);
  const versions = notes.map(note => note.version);
  assert.deepEqual(versions, ["0.4.0", "0.3.0", "0.2.0", "0.1.15", "0.1.14", "0.1.13", "0.1.12", "0.1.11", "0.1.10", "0.1.9", "0.1.8", "0.1.7", "0.1.6", "0.1.5", "0.1.4", "0.1.3", "0.1.2", "0.1.1"]);
  assert.equal(path.basename(notes.find(note => note.version === "0.1.7").file), "0.1.7.md");
  const status = changelogStatus(root);
  assert.equal(status.skipped, false);
  assert.equal(status.ok, true);
  const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /^# Morelord Game Master Changelog\n/);
  assert.match(changelog, /## 0\.1\.13\n\n### What Changed\n\n- Added Bulk Actions/);
  assert.doesNotMatch(changelog, /All 56 module tests|33 automated module tests|## Verification|UNRELEASED|not claimed|visually inspected/);
  assert.doesNotMatch(changelog, /\r|^---$/m);
  for (const line of changelog.split("\n")) {
    const marker = /^(#{1,6})(.*)$/.exec(line);
    if (marker) assert.match(line, /^#{1,6} \S/);
  }
  assert.equal(changelog.endsWith("\n"), true);
  assert.equal(changelog.endsWith("\n\n"), false);
});

test("a checkout without release notes leaves the changelog unchecked", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mlgm-changelog-"));
  try {
    assert.deepEqual(listReleaseNotes(directory), []);
    assert.equal(changelogStatus(directory).skipped, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
