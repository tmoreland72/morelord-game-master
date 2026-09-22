# Morelord Game Master

Version 0.1.1 — working implementation of the September 20, 2026 design checkpoint.

## Start in Foundry

The module is already in the development installation's `Data/modules/morelord-game-master` directory. Restart Foundry if it was running when these files were created, then enable **Morelord Game Master** in **Manage Modules** for your world.

As a GM, click the **Game Master** handle at the bottom of the screen, or press **Alt+G**. Change the shortcut in Foundry's keybinding settings. The tray hides the local hotbar while open and restores its existing visibility when closed. Players receive roll requests in chat; they do not get the GM tray.

Target: Foundry 14 and D&D 5e 6.0.x. Rolls use the installed D&D 5e 6 skill API. Sound and macro controls use native Foundry documents. Morelord Core 0.3.9+ is required (including its Socketlib dependency). The tray, dialogs, cards, character selection, and documentation use Core’s shared UI. Delerium Search additionally requires Craftworks 0.4.12+ and its enabled Monsters of Drakkenheim content pack. Foraging requires Journeys 0.3.5+ for its terrain/DC configuration and food rules. No build step is required.

## Available controls

- **Player Settings:** select the characters in scope once. The saved scope applies to party roll cards and saved group checks. Core supplies character identities, eligible players, and GM fallback routing.
- **Roll Requests:** Encounter, Delerium Search, Foraging, Death Saving Throw, Group Check, and Player Check are individual cards without column headers or an outer frame. Options live on the card; the dice button at the bottom right sends chat requests. Changes save immediately as the last-used configuration. Group/player cards can be saved with the bookmark control and removed with the trash control.
- **Visibility:** every roll card has a Blind roll toggle, off until selected, then remembered. Blind results and summaries go only to GMs and Assistant GMs; switching it off makes both public. Requests never contain private totals. Blind death saves keep sheet counters unchanged, while public death saves use native counter updates.
- **Encounter:** select d4, d6, d8, d10, d12, or d20 from the dropdown; default d8.
- **Skill checks:** optional DC, native automatic modifiers, and DIS / Roll / ADV chat controls. Complete-only summary cards include individual totals, pass/fail when a DC is set, and averages, including single-player checks.
- **Delerium Search:** uses Craftworks rules, rewards, and encounters. Foraging uses Journeys terrain/DC settings and food rules. Both produce complete-only chat summaries.
- **Sound:** saved playlist and ambience controls start immediately. Starting music stops other music first and shuffles. Stop controls appear under Now Playing only while something is playing.
- **Macros:** immediately after Roll Requests, starts empty. Drag macros into the panel, drag to reorder, click to execute, or right-click and choose Remove. Each pin is 50% larger than Foundry's action-bar slots, with twice the spacing and the same rounded-square shape, with its name on hover. The Macros tab has no outer frame. There is no ten-slot limit. Pins are world-specific and shared by GMs in that world; unpinning does not delete the underlying macro.
- **Triggers:** **+ New Trigger** is left-aligned above the unframed trigger cards and precedes the When/Then cards, with start/stop controls. New Trigger is disabled and Edit/Delete are hidden. Supports item-use → roll table, Sorcerer-source spell → player d20 request → conditional roll table, and qualifying weapon hit → native Sneak Attack damage. Triggers operate while the tray is hidden. The configured Sneak Attack and Wild Magic rules now apply to every matching character, including Grim Shara and Rhyndor. Legacy character bindings are ignored for these two rule types; rule IDs and existing surge counters are preserved. Item-use rules remain character-specific.
- **Campaign AI:** a private companion-backed campaign library, PDF/TXT/Markdown uploads, campaign notes and rules editions, separate durable conversations, optional scene/party names, and Markdown conversation export. OpenAI API is the initial working adapter; provider credentials must be configured separately.

Saved roll requests, macro pins, sound buttons, and remembered options live in world settings. Trigger definitions are global across worlds on the same Foundry installation. AI documents and conversations live only in the companion's private data directory, outside Foundry's public data tree. The companion token stays in browser session storage, scoped to this browser tab; provider API keys never enter Foundry settings.

## Campaign companion

Requires Node.js 22 or newer (Node 24 is already installed on this computer). It has no npm dependencies.

Run `node companion/server.mjs` from this module directory. The terminal prints a local URL and a generated **companion token**. Enter both in **Game Settings → Configure Settings → Morelord Game Master → Configure**, then choose **Connect companion** on Campaign AI. Keep the terminal running while using campaign tools. Stop with Ctrl+C. A new launch generates a new token unless `MLGM_TOKEN` is set.

The library works without an AI key. To enable answers, set these environment variables **in the companion process**, then restart it:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Your OpenAI API credential; never put it in this module directory or a public Foundry file. |
| `OPENAI_MODEL` | Exact ID of a Responses API model supporting your PDF inputs. There is no assumed/default model. |
| `MLGM_ORIGINS` | Comma-separated exact Foundry browser origins. Defaults to `http://localhost:31400,http://127.0.0.1:31400`. Add the actual Foundry address shown in your browser if different. |
| `MLGM_DATA_DIR` | Private storage directory; defaults to `.morelord-game-master` in the operating-system user's home directory. Back up this directory to preserve campaigns. Do not place it under Foundry's served Data directory. |
| `MLGM_TOKEN` | Optional persistent companion token, at least 24 characters; otherwise generated at launch. |
| `MLGM_PORT` | Local service port; default `31401`. |

The companion binds only to `127.0.0.1` on the GM's computer. Browser permissions for local network access may need to be granted. Remote service deployment, TLS termination, and multiple-GM account isolation are not part of this initial local companion. Anyone with the companion token can access its campaigns; use a separate companion for a different private library.

Each campaign supports up to 20 files, 10 MB per file, and 25 MB total. Upload validates file type/header and saves the original bytes; it does not establish successful PDF extraction. The UI labels files **Stored**, and the provider reads them when answering. Remove a same-named document before uploading a replacement. Removing a file excludes its bytes from future requests; previous answers may still quote it.

Sending a question transmits this campaign's files, notes, rules, optional scene/party names, and the most recent 20 conversation messages to OpenAI. Full conversation history remains on disk and can be exported; older messages are not automatically included in model context. Put important long-term facts in campaign notes. The service uses `store: false` and sends no Foundry action tools. Failed/incomplete provider requests do not append a partial conversation. Large PDFs or long contexts can exceed the selected model's limits; errors leave stored files/history intact.

The first adapter follows OpenAI's [file-input documentation](https://developers.openai.com/api/docs/guides/file-inputs). Files are supplied per request; this build does not claim a background search index, reliable OCR of every scan, or direct attachment to a ChatGPT project.

## Trigger bindings

From a GM script macro, call:

```js
await game.modules.get("morelord-game-master").api.addTrigger({
  name: "Wild Magic check",
  kind: "sorcerer",
  tableUuid: "Compendium.morelord-game-master.roll-tables.RollTable.aDMFCKJcdKaJjTc6"
});
```

Message-based triggers execute once per source message on the active GM. The Wild Magic rule matches characters with the Sorcerer class and Wild Magic subclass identifiers and requests a blind d20 in chat after the spell attack roll (or after casting for spells without an attack roll), for spells sourced from `class:sorcerer`, including cantrips. A 1 initially rolls the requested Wild Magic Surge table. Each missed d20 raises the threshold by one (2 or lower, then 3 or lower, up to 20); a surge resets it to 1. Thresholds persist per actor/trigger, and pending requests use the current threshold when resolved. A retry reuses its existing d20 and prevents duplicate table results. Racial spells do not trigger it. The Sneak Attack rule matches the Rogue class and Sneak Attack feature identifiers and requires a targeted hit with a Finesse or Ranged weapon, advantage or an eligible adjacent ally, and no disadvantage. It waits for the linked weapon damage card before rolling. It uses native Sneak Attack scaling and critical damage, once per character per combat turn. Without a target, a hit and eligibility cannot be verified automatically. Trigger results are private to GMs and Assistant GMs.

## Deliberately unresolved design items

- Claude/Grok adapters, local Codex/Claude session reuse, external-project import/sync, and MCP sharing.
- Automatic journal ingestion, indexed PDF retrieval, and model-specific OCR/limit validation.

These were open decisions in the supplied checkpoint, rather than configured campaign behavior. The original design materials remain unchanged in `P:\Gaming\TTRPG\Morelord Gaming\Modules\Morelord Game Master`.

## Verification

Run `npm test` for the dependency-free Node checks. Run `node tests/browser-smoke.mjs` for a headless Chrome interaction check (`CHROME_PATH` can select another Chrome/Edge executable). Screenshots are written to `test-results/`.

The browser harness exercises actual module handlers with real Core UI/services, mocked Foundry documents, and a real local companion with a simulated provider. It checks chat-only results, duplicate clicks, saved controls, sound, macros, triggers, campaign switching, file upload/removal, chat, and hotbar restoration. It does **not** establish live multiplayer/Foundry integration or successful paid provider calls.

Before using this in a session: enable it in the development world, make a request with a second player client, check a real playlist and ambience mix, run a harmless macro, and verify your trigger binding and PDF/model combination. Run the module-owned in-game checks through Core’s runner as described below. Real AI-provider validation requires your credentials.

## In-game regression checks

From a GM browser console in a development world with the module and Core enabled:

```js
const { runInGameTests } = await import("./modules/morelord-core/scripts/testing/in-game.js");
const { gameMasterChecks } = await import("./modules/morelord-game-master/scripts/testing/in-game.mjs");
const report = await runInGameTests({ checks: gameMasterChecks });
console.log(report);
```

The module suite creates and removes its own temporary character and chat cards. It does not alter existing characters or saved board configuration. Separate player-session verification remains necessary for actual delivery/visibility under your world permissions.

Roll requests use Core cards and icon controls. Macros use Core's action-bar-sized image variant and Foundry's native context menu. Popup forms have distinct stable IDs, allowing Core to remember each form's size and position independently.

Foraging uses the saved Player Settings scope and remembers the selected terrain. Survival checks use Journeys' six terrain choices and current configured DCs, with DIS/Roll/ADV. After all rolls finish, a chat card, respecting the Blind roll toggle, lists each total and pass/fail, food found, meals still needed, and water availability. It does not modify an active journey or consume inventory.

Roll cards use three independent columns: encounter/search/foraging/death on the left, group checks in the middle, and player checks on the right. Cards retain their own heights. Labels use Encounter Check, Foraging Check, and saved labels such as Stealth Check or Persuasion Check - Daludriel. Blind roll defaults off for unconfigured cards; saved choices remain sticky.

Every trigger card, including Lucky Finds, uses Core’s shared card footer with status and an enable/pause icon aligned at the bottom. Icons have tooltips and accessible labels. In Dev1, run `triggerFooterCheck` from `scripts/testing/trigger-footer.mjs` through Core’s shared in-game runner to verify matching controls, bottom alignment, and containment. The September 21 Dev1 run passed with Lucky Finds, Sneak Attack, and Wild Magic displayed together (Foundry 14.368 / D&D5e 6.0.3).

All roll-request cards are public, including Wild Magic d20 requests; assigned-player/GM roll permissions still apply. Blind results and summaries remain private. Pending legacy request cards are made public when their active GM loads the module. Wild Magic never waits for optional damage; Sneak Attack still waits for weapon damage.

Core automatically preserves scroll positions when the tray redraws. In-Foundry regression tests run only in Dev1; an absent or different world produces a skip without changing worlds.

## Lucky Finds after combat

Import the **Lucky Finds** table from Dungeons of Drakkenheim into the world. Existing Lucky Finds rules remain available in Triggers; new rules can be registered through the module API while New Trigger is disabled. The enabled rule runs once when a started combat is ended/deleted; removing an unstarted combat does not trigger it. The creating GM coordinates it, with Core's active-GM fallback if that GM is offline. Missing world tables skip the action.

When the updated Craftworks integration and Champion Drakkenheim access are available, the result opens in Craftworks' GM-only Lucky Finds window with linked items and clickable private dice. Without that optional integration, the imported table rolls natively to GM-only chat. Craftworks is not a new required dependency.

Regression: `npm test`; in Dev1 run Core's shared runner with `luckyFindChecks` from `scripts/testing/lucky-finds.mjs`. Live verification is pending while Demo2 is loaded.

## World Clock and global triggers

Configured World Clock rules advance world time by the saved game-minute increment and real-minute interval; defaults are **10** and **1**. There is one World Clock rule. Pause or enable it using its trigger card; configuration is currently programmatic while the editor is unavailable. It runs while the tray is hidden, provided an eligible GM is connected.

The clock adds whole configured increments to Foundry world time. Game pause and any started combat suspend its real-time countdown. Pausing the game retains the partial interval; changing the interval, disabling the trigger, reloading, or changing the coordinating GM starts a fresh interval. It does not count time while no GM is connected. The GM can still add or subtract time with the D&D calendar controls.

While managed combat is running, native combat time advancement is deferred. Ending/deleting it adds **6 seconds per round**, including the final round being played: ending in round 3 adds 18 seconds. Rewinding rounds adjusts the deferred duration; resetting to round zero cancels it. Deferred seconds are saved on the combat document, survive reloads, and are settled even if the trigger is disabled before combat ends. Enabling the clock midway through combat tracks subsequent rounds and the final round only. Unstarted combats add nothing.

Global trigger definitions are stored in **Foundry User Data → Data/morelord-game-master/triggers.json**, outside the module directory so module updates do not replace them. Back up this file. The active GM loads it when joining; Core's contextual socket service coordinates GM saves and the current world's board setting mirrors the definitions for connected clients. File-upload permission is required. This is installation-wide sharing, not synchronization between separate Foundry installations.

On first use, existing triggers from the first loaded world seed the shared file without changing their IDs. Each world's previous trigger list is retained as `board.legacyWorldTriggers` before loading the global definitions. Previously deleted global triggers are not recreated from an old world's cache. Global class rules match that world's characters; actor counters and combat state remain with their world documents. Compendium table UUIDs remain portable; world tables are resolved by their saved name in other worlds. Character-specific item rules retain their original-world binding until edited to select a character in another world.

Macros, saved roll requests, sound buttons, and remembered options remain **world-specific**. Existing browser macro pins that resolve in a world are copied into its world setting on its first migration; their original browser storage is retained.

Per-scene time-per-hex and token-movement time advancement are planned for later and are not enabled here.

Verification: `npm test` covers clock timing, pause/combat suspension, GM handoff, calendar changes, combat rewind/settlement, and global-file migration across worlds. The offline browser harness covers clock creation, interval editing, and shared saves using Core UI. In Dev1, run Core's `runInGameTests({checks:worldClockChecks})` with `worldClockChecks` imported from `scripts/testing/world-clock.mjs`; this creates a disposable combat, verifies deferred native time and manual changes, then restores the clock, board, and pause state. Live verification was skipped because the running world is Demo2.


Clicking a roll immediately replaces that character’s response controls with centered **Completed** text using Core’s shared submission/completion helpers. Other characters can roll while the dice animate, and rejected submissions restore their controls. GM acknowledgments preserve private outcomes and duplicate protection. Summaries, search rewards, and Wild Magic outcomes still wait for the relevant optional Dice So Nice animations; those waits do not hold the shared roll queue. Saved result messages recover missing outcomes after reload.

## Managed trigger macros and compendiums

Compendiums are **Morelord Gaming → Game Master → Game Master Macros** and **Game Master Roll Tables**. Seven script macros include Wild Magic Surge, Volatile Magic, Sneak Attack, Lucky Finds, World Clock, Item Use — Roll Table, and Roll of Fate. The two copied roll tables preserve their original result content; the personal Graypes Compendium originals are untouched. No dependency on Graypes Compendium is added.

The Triggers tab starts and stops managed script macros; stopping removes their registered listeners and timers, and refresh restores only enabled rules. New Trigger remains visible but disabled; Edit and Delete are absent. Macro commands contain their executable conditions/actions; the manager provides shared Core services, a serialized action queue, and disposable hook/timer registration. Running a managed trigger macro from the hotbar explains how to start it instead of installing an unmanaged listener. Rule IDs, enabled states, custom table overrides, and per-character surge counters survive migration. Known personal surge-table references migrate to Game Master Roll Tables; other custom bindings remain unchanged. Volatile Magic is added stopped, ready for the GM to enable.

Volatile Magic qualifies on any spell cast by a character, including cantrips and racial spells, after the spell attack or non-attack casting completion. It requests the same escalating d20 as Wild Magic. Counters are separate per character and trigger; both may respond to the same qualifying Sorcerer spell without suppressing one another. Requests are public, assigned players or GMs can resolve them, and blind results remain private.

Roll of Fate is available on Roll Requests and as a macro. It chooses equally among currently selected character tokens (not the configured party), ignores NPC tokens, and posts a public Core chat card: Fate has decided that [Character Name] shall be targeted! One token is chosen directly; no eligible token produces only a notification. Selecting two tokens representing the same character gives that character two entries, because the selection is token-based.

After first installation of the new packs, restart the Foundry server/world to load the manifest. A client refresh alone cannot add server-side compendiums. Existing clients should then refresh. Compendium folder placement migrates once, retaining IDs and later manual organization. Pausing World Clock stops its timer; already-deferred combat time is still settled at combat end by the recovery listener.

### Pack development

`tools/build-macros.mjs` compiles the executable macro commands from the tested trigger/clock sources and builds the two LevelDB packs from `pack-source`. Set `FOUNDRY_CLASSIC_LEVEL` to an installed `classic-level/index.js`; build only while the packs are closed in Foundry. `--json-only` updates macro JSON without opening databases. Building overwrites bundled macro commands, so export personal edits before rebuilding. The table export tool reads only the verified Dev1 world; it never modifies source tables.

### September 22 verification

Core (66), Craftworks (67), and Game Master (19) automated tests pass, together with the Core and Game Master design-system checks. Dev1 live tests passed for compiled native trigger macros, independent escalating surge counters, stopped-listener cleanup, and zero/one/multiple-token Roll of Fate. These tests create disposable native Macro and RollTable documents from the shipped JSON because the running server has not yet registered the new packs. After the server restart, Dev1 verification confirmed both installed packs under Morelord Gaming / Game Master: seven executable macros and both tables with all 25 Wild Magic and 12 Volatile Magic results. Global trigger bindings migrated to the installed macros and copied surge tables; enabled triggers reported Running and Volatile Magic remained Stopped. Graypes Compendium remained a separate top-level folder. Player-session visibility, light theme, and 200% zoom remain unverified for these changes. Repeat the checks with macroTriggerCheck and fateCheck from scripts/testing/macro-triggers.mjs through Core’s shared in-game runner.

## GitHub installation and releases

Install using https://raw.githubusercontent.com/tmoreland72/morelord-game-master/master/module.json in Foundry Setup. This module is distributed only through GitHub, without a Foundry package-directory or Morelord website listing. Morelord Core 0.3.11 or newer is required; version 0.3.10 lacks the shared roll-request services.

Use the existing 0.1.1 version for the first release, then increment module.json and package.json for later updates. Stop Foundry before committing pack databases. Run npm test, node --test tests/release-sync.test.cjs, and relevant Dev1 checks. Commit the complete LevelDB packs, including numbered .log files and their CURRENT/MANIFEST files, then push master. Sync manifest release creates a matching tag and GitHub release; wait for it to pass and verify the public manifest and archive. Never move an existing version tag. No release.ps1 or release.config.json is used for this GitHub branch-archive workflow.
