# Morelord Game Master 0.3.1

## What Changed

- Removed Game Master's Token Distance Indicator override. The indicator stays a Morelord Core feature. Game Master no longer promotes Core's setting, copies a previous client value, or changes its hint.

## Verification

- Module test suite: 126 passed, 1 failed. The failure is the Smithy at the Scar partial-token-creation test in tests/smithy-at-the-scar.test.mjs, which fails the same way on master before this change and is not part of these checks.
- The release checks (changelog, release sync, website publish) pass. This repository has no build or lint script.
