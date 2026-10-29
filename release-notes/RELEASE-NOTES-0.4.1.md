# Morelord Game Master 0.4.1

## What Changed

- Hotfix. CSS files use LF line endings, including on Windows, so the tray stylesheet test matches a literal newline.
- The README states version 0.4.1. The missing-Core error message now says Morelord Core 0.8.0+.

## Verification

- Module test suite: 129 passed, 1 failed. The failure is the Smithy at the Scar partial-token-creation test in tests/smithy-at-the-scar.test.mjs, which fails the same way on master before this change and is not part of these checks.
- The release checks (changelog, release sync, website publish) pass. This repository has no build or lint script.
