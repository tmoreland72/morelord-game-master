# Smithy at the Scar

Five GM script macros for a square-grid scene. Morelord Core and Game Master must be enabled. The exported macro commands contain their encounter logic, so importing them does not require updating the installed module or restarting Foundry.

| Macro | Use |
| --- | --- |
| Smithy — Setup | Choose imported Haze Husk, Ratling, Chimera, and four Haze Hulk variants; set edge inset. Saves per scene. |
| Smithy — Next Wave | Confirm and deploy the next wave, add its enemies to the scene's combat, and roll their native initiative privately. |
| Smithy — Reinforcements | During Wave 1, click once per combat round to roll 1d6 husks and deploy them. Ten successful rolls maximum. |
| Smithy — Ratling Safe Word | Set this encounter's ratlings neutral and remove them from initiative. Keeps their tokens and HP. |
| Smithy — Status | Show the scene's saved wave and reinforcement progress. |

Wave 1 starts with 12 haze husks, plus **ten separate 1d6 reinforcement rolls**. Start combat before the first reinforcement; it may be called in round 1. Wave 2 has 20 ratlings; Wave 3 has 10 haze husks and one chimera; Wave 4 has one Haze Hulk, one Haze Hulk (Gutbuster), one Haze Hulk (Hunter), and one Haze Hulk (Juggernaut). Finish all ten reinforcement calls before advancing to Wave 2. You choose when each wave begins and when to interrupt the rest. The macros grant no rest benefits and do not advance rounds automatically.

Placement distributes tokens across all four sides within a three-grid-square band, one square inside the map by default. It uses the actual map rectangle, excludes scene padding and the central half of the map, and avoids existing token footprints. Large creatures occupy their full footprint. If the edge is full, placement stops rather than spilling into the center. **Placement does not evaluate walls, cliffs, water, or navigable paths:** inspect the arrivals and move any unsuitable positions before their turns.

Enemies have unlinked tokens for independent HP. The four players, named dwarves, and 20 troops retain their existing tokens and normal turns; no squad-combat rule has been selected. Add the allies to combat normally. Existing enemy tokens are not adopted, deleted, or counted as newly deployed waves.

Keep the same native combat for all four waves. Encounters unlinked from a scene are supported when their combatants belong to this map; new enemies receive explicit scene links so their tokens and initiative resolve correctly. Pausing between waves is fine; deleting the combat while the encounter is in progress requires restoring it. All counters and actor choices survive refresh in scene flags. Interrupted deployments save their token IDs and reinforcement count; Next Wave or Reinforcements finishes that pending batch without advancing another wave. One GM controls the encounter at a time; another can take over after that GM disconnects. Use one browser session for the controlling GM.

## Import elsewhere

Create a Script macro in Foundry, right-click it in the Macros directory, choose Import Data, and select the matching JSON file. Repeat for the five files, then drag them into Game Master's Macros tab. Run Setup on the intended scene before starting.

To regenerate the JSON files from source, run `node tools/build-smithy-macros.mjs`. To install directly in a world serving the updated module source, run this GM script:

```js
const url = '/modules/morelord-game-master/scripts/smithy-at-the-scar.mjs';
const source = await (await fetch(url)).text();
const {installSmithyMacros} = await import(url);
await installSmithyMacros(source);
```

## Verification

The unlinked-combat regression in `tests/smithy-combat-live.js` reproduces the old scene-only lookup missing an existing defender encounter. It verifies no new encounter, explicit token scene links, preserved defender initiative, all four distinct Wave 4 Hulk variants, and Safe Word removal from an unlinked encounter. Both checks passed on a disposable copy in the explicitly authorized world. The four Mass Combat checks also passed with an unlinked encounter, including defeated markers. All 33 module Node tests passed.

Run `node --test tests/smithy-at-the-scar.test.mjs` for roster limits, round guards, placement, native macro compilation, and interrupted-deployment recovery. `tools/verify-smithy.mjs --run` is restricted to the explicitly authorized Drakkenheim world, Chuck GM, and The Scar scene. It tests a disposable copy of that scene, removes the copy, and installs the macros only after passing. It uses Core's check runner with the user's explicit exception to the usual Dev1-only rule. Do not rerun it during a live session or after starting the encounter.

September 24, 2026 UTC: all five live checks passed on a disposable copy of The Scar, Foundry 14.368 / D&D5e 6.0.3. Setup, native initiative, independent HP, reinforcement count and duplicate guard, all four waves, and safe-word behavior passed. The 49 copied original tokens were preserved and test documents removed. All 27 module Node tests and the Game Master design-system boundary check passed. The earlier direct-scene check stopped at a raw JSON preservation mismatch; read-only inspection confirmed 49 tokens and no remaining test combat/tokens, then testing moved to the disposable copy. Full light-theme/zoom testing and terrain reachability are not covered.
