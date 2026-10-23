# Morelord Game Master 0.1.13

## What Changed

- Added Bulk Actions immediately before Macros, using the party configured on Player Settings.
- The Action dropdown supports Split amount amongst party members, Give amount to all party members, Split removal amongst party members, and Take amount from all party members.
- Split operations divide total copper value before making whole-coin shares. Any remaining copper goes to a random party member.
- Removals use personal coins first, then the shared D&D5e Party/Group purse. Unpaid amounts appear as Deficit; balances never become negative. Mixed-coin deductions retain exact copper precision.
- Standard public chat cards show Added or Removed, with orange Paid by Party or Deficit only when applicable. All displayed coin counts are whole numbers.
- Compact coin fields use Core's stacked-right number arrows and standard field labels. Clear resets all five amounts; Send/Take clears them after a successful operation. The selected action stays saved for the world.
- Game Master remains above other Foundry windows when they open or regain focus.
- Requires Morelord Core 0.5.2 for the shared stacked number controls and field-label styling.

## Verification

All 56 module tests, five release-synchronizer tests, the browser smoke harness, and Core's six-module design-system check passed. Core's 82 tests passed. Dev1 on Foundry 14.369 / D&D5e 6.0.6 passed the focused shared-runner coin checks, including all four actions, copper-exact splits and mixed removals, shared-purse exhaustion, participant filtering, public cards, duplicate protection, saved action, Clear, and automatic clearing. Dark/light 1280px and 700px layouts and effective 200% zoom passed. Native foreground-window regressions passed at 1280px, 1920px, and 700px. Disposable fixtures were removed and world participation settings restored. Evidence is retained under tests/in-game-reports/.

Existing committed compendium packs are unchanged. Distributed through GitHub only.
