# Morelord Game Master 0.1.14

## What Changed

- Fixed Game Master forms, including Start Playlist, opening behind the tray. Forms now use the native Foundry modal dialog layer above the tray while retaining shared Core styling.

## Verification

- Passed all 61 module tests and eight release-synchronizer checks.
- Verified the actual Start Playlist modal opens above the tray in Dev1 on Foundry 14.369 / D&D5e 6.0.6 with Core shared-runner checks at desktop and narrow widths. Reports are under tests/in-game-reports/panel-*.json.
- Foundry 14.369 is the latest stable version listed at https://foundryvtt.com/releases/; compatibility metadata remains 14.369.
- GitHub-only release. Existing committed compendium packs are preserved; live Foundry database churn is excluded.
