# Morelord Game Master 0.1.12

Released October 22, 2026.

## What Changed

### Improvements

- Mass Combat uses Core's shared combat service while preserving Game Master's saved groups, flag namespace, macro IDs, and pins.
- Mass Combat supports native weapon and saving-throw activities, updates fields when the activity changes, and summarizes hits, kills, and actual damage in private chat. Preview leaves HP unchanged; Apply Damage retains defense, temporary HP, stale-preview, and duplicate-application protection. Non-damage effects, resources, and recharge remain GM-managed.
- Smithy at the Scar uses Core's shared perimeter placement while preserving its wave, reinforcement, initiative, independent-HP, and Ratling Safe Word rules.
- Bundled trigger macros use the current module API wrappers. Existing imported macros remain supported.
- Requires Morelord Core 0.5.0 or newer. Verified on Foundry VTT 14.369 and D&D5e 6.0.6; supported minimum versions remain unchanged apart from Core.

### Fixed

- Release regressions wait for summaries and surge outcomes after dice animations, explicitly choose the party/skill scope, and create disposable rogue/sorcerer fixtures instead of requiring named campaign characters. Modifier checks follow the installed D&D5e native behavior.

## Verification

All 50 module tests, five release-synchronizer tests, the browser smoke harness, and Core's Game Master design-system boundary check pass. The Dev1 broad run and coordinating-GM follow-up cover all 23 collected checks, including the two reused shared-combat checks. Delerium Search and foraging were exercised with their actual integrations. Mass Combat previews, native defenses and temporary HP, exact-once application, native activity selection/saves, Smithy waves and safe word, public/blind requests, independent surge progression, macro controls, ammunition recovery, and World Clock passed. Disposable documents were removed and saved board/macro settings restored.

The broad run's ammo/clock precondition failures are superseded by the passing run as the coordinating GM. Raw reports retain native Foundry/D&D5e asynchronous fixture-rendering/cleanup errors; no zero-browser-error claim is made. Narrow-layout controls remain an existing limitation; this release makes no tray layout or full theme/zoom certification claim. No changes to Encounters or Core are included.

Evidence: `tests/in-game-reports/2026-10-22-release-dev1-full.json`, `2026-10-22-release-dev1.json`, and `2026-10-22-pack-audit.json`.

## Distribution

Game Master continues to distribute through its GitHub manifest and branch archive. It has no Foundry package-directory or Morelord website listing.
