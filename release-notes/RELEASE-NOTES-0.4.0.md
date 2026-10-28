# Morelord Game Master 0.4.0

## What Changed

- Removed Game Master's Token Distance Indicator override. The indicator stays a Morelord Core feature. Game Master no longer promotes Core's setting, copies a previous client value, or changes its hint.
- Macro pins and GM Settings rows reorder with Morelord Core's sortable helper. Dragging shows the whole card under the pointer and a landing line where it will drop. The new order is saved for the world. Dragging a macro pin does not run it. Dropping a new macro still pins it. Requires Morelord Core 0.8.0.
- GM Settings reorder lists use Core's auto-fit grid, so columns fill the tray width and empty tracks collapse. Player Settings uses Core's horizontal character choice grid.

## Verification

- Module test suite: 129 passed, 1 failed. The failure is the Smithy at the Scar partial-token-creation test in tests/smithy-at-the-scar.test.mjs, which fails the same way on master before this change and is not part of these checks.
- The release checks (changelog, release sync, website publish) pass. This repository has no build or lint script.
