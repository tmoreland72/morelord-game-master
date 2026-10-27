# Morelord Game Master Changelog

## 0.2.0

### What Changed

- Skill checks, ability checks, saving throws, Foraging, and death saves show a single Roll button. The button uses the dnd5e native roll, including the system's roll dialog and automatic advantage or disadvantage. The custom advantage and disadvantage prompt is removed.
- Blind results and summaries stay visible only to GMs and assistants. A blind check is evaluated by the active GM. A public death save still updates the character sheet; a blind death save does not.
- Bulk Actions adds XP, Inspiration, Prototype Token Sync, and Undo Last Action under Coins. Inspiration and Prototype Token Sync share one compact card row. Coins, XP, and Undo Last Action each stay on their own row.
- XP can be split among the Player Settings party, given in full to each member, or set to the same amount for every member. A split gives any remainder to one random party member, matching leftover copper for coins. Set replaces each character's experience with a non-negative whole number. The action updates each character's experience, and Undo restores the previous values.
- Inspiration grants Heroic Inspiration to every party member or clears it.
- Prototype Token Sync copies each party character's token on the active GM's current scene onto that character's prototype token. A selected token is preferred when several are placed. Characters with no token on that scene are skipped and named in the chat card. Linked and unlinked tokens both copy name, name display, actor link, image and scale, width, height, depth, disposition, resource bar display, primary resource bar, secondary resource bar, vision, detection modes, light, lock rotation, rotation, opacity, dynamic ring, and occlusion. The tray card stays short. Its help icon opens that list. Only settings that differ are written. A prototype Foundry would leave unchanged is skipped, so that copy is not reported as a cancelled character update.
- Undo Last Action restores only the most recent Coins, XP, Inspiration, or Prototype Token Sync change, then clears. Each of those actions, including every XP mode, saves a snapshot and enables Undo as soon as the action finishes, without reopening the tray. The button is disabled when there is nothing to undo. The snapshot is stored for the world and survives a reload.
- The first click applies the control after a tray field is edited. That includes Bulk Actions, Set All Track Volumes and the Now Playing sliders, playlist and ambience buttons, roll requests, and macros. Saving the edited field no longer rebuilds the tray before that click, including when the setting update arrives after the save. Set all party XP stays selected when the tray rebuilds.
- Bulk Actions labels the Coins addition button, the XP button, and Prototype Token Sync Apply. Coin removals still use Take. Inspiration already uses Apply. Undo Last Action keeps its name.
- The XP action explanation is a help icon beside the Action label, and that text shows on hover. Prototype Token Sync shows its description on the existing help icon. That icon still opens the copied-settings list.
- Changing the Roll Requests type updates the second dropdown. A skill check lists the SRD 5.2 skills. An ability check or saving throw lists the six abilities. The selected value stays inside that list.
- Add folder opens the folder browser at the data root. An existing ambience row and a directory the file browser used earlier in the session stay out of that starting location.
- Set All Track Volumes writes one hundredth gain to every sound in every playlist, then reads those sounds back. Foundry v14 cleans PlaylistSound volume on the server to hundredths, so a thousandth such as 0.225 is stored as 0.23. 37 is stored as 0.23 and the slider reads 38. 30 is stored as 0.16 and the slider reads 29. No hundredth reads back as 37 or as 30. A second click while that update is still running is ignored, and the button stays disabled until the update finishes.
- Granting inspiration no longer fails when a party member already has it. Grant skips members who already have inspiration, and clear skips members who do not. XP, coins, and prototype token sync also skip a character who would not change. Only characters who change are saved for undo. If nobody changes, the previous undo stays and a notice says so. The chat card can say how many were skipped.
- Each new bulk action posts a short public chat card, the same way Coins does.
- Opening Foundry Game Settings closes the Game Master tray. The module Configure menu opened from Game Settings does the same. The tray handle opens it again afterward.
- Ambience can use more than one source folder. Foundry Game Settings lists the folders, and a GM can add or remove them with the folder FilePicker. The list starts empty. A previous single folder is copied into that list once when the saved value has a path. That value is read from the setting document by its key. A world whose list was emptied while that path was still stored gets the folder back once, and the old setting is then cleared so a removed folder stays removed. Each folder is scanned recursively, including S3 and other FilePicker sources. A missing or invalid folder is skipped, with a console warning and one notice, and Play Ambience continues. The ambience picker shows the path inside the source folder so files that share a name stay distinct. Saved ambience buttons still play the full path they already stored.
- Add folder in Game Master settings opens Foundry's folder browser without the settings dialog blocking it. The browser comes to the front at the data root, including when ambience rows already exist and when the browser remembers another directory. Browsing into a folder and choosing it adds that folder to the list, and Save stores the list.
- Token Distance Indicator is registered by Morelord Core. Core's history has no Force choice; it was a per-client checkbox. Game Master makes it a world setting that only a GM can change, so that choice is forced for every client. Turning it off hides the hover distance for players. A world that has never saved the setting takes a GM's previous client choice when that choice was off; otherwise it stays on.
- Game Master settings are world settings only a GM can change. That covers the tray board, macro pins, specialty order, the legacy ambience folder, ambience folders, the ambience migration flag, bulk undo, and each specialty visibility toggle. They were already stored for the world. Players can no longer write them. The Alt+G shortcut stays a per-user keybinding.

## 0.1.15

### What Changed

- Removed Campaign AI from the GM tray, including its tab, Foundry settings, local service, and provider configuration. The tray tabs are Roll Requests, Bulk Actions, Macros, Sound, Triggers, GM Settings, and Player Settings.

## 0.1.14

### What Changed

- Fixed Game Master forms, including Start Playlist, opening behind the tray. Forms now use the native Foundry modal dialog layer above the tray while retaining shared Core styling.

## 0.1.13

### What Changed

- Added Bulk Actions immediately before Macros, using the party configured on Player Settings.
- The Action dropdown supports Split amount amongst party members, Give amount to all party members, Split removal amongst party members, and Take amount from all party members.
- Split operations divide total copper value before making whole-coin shares. Any remaining copper goes to a random party member.
- Removals use personal coins first, then the shared D&D5e Party/Group purse. Unpaid amounts appear as Deficit; balances never become negative. Mixed-coin deductions retain exact copper precision.
- Standard public chat cards show Added or Removed, with orange Paid by Party or Deficit only when applicable. All displayed coin counts are whole numbers.
- Compact coin fields use Core's stacked-right number arrows and standard field labels. Clear resets all five amounts; Send/Take clears them after a successful operation. The selected action stays saved for the world.
- Game Master remains above other Foundry windows when they open or regain focus.
- Requires Morelord Core 0.5.2 for the shared stacked number controls and field-label styling.

## 0.1.12

Released October 22, 2026.

### Improvements

- Mass Combat uses Core's shared combat service while preserving Game Master's saved groups, flag namespace, macro IDs, and pins.
- Mass Combat supports native weapon and saving-throw activities, updates fields when the activity changes, and summarizes hits, kills, and actual damage in private chat. Preview leaves HP unchanged; Apply Damage retains defense, temporary HP, stale-preview, and duplicate-application protection. Non-damage effects, resources, and recharge remain GM-managed.
- Smithy at the Scar uses Core's shared perimeter placement while preserving its wave, reinforcement, initiative, independent-HP, and Ratling Safe Word rules.
- Bundled trigger macros use the current module API wrappers. Existing imported macros remain supported.
- Requires Morelord Core 0.5.0 or newer. Verified on Foundry VTT 14.369 and D&D5e 6.0.6; supported minimum versions remain unchanged apart from Core.

### Fixed

- Release regressions wait for summaries and surge outcomes after dice animations, explicitly choose the party/skill scope, and create disposable rogue/sorcerer fixtures instead of requiring named campaign characters. Modifier checks follow the installed D&D5e native behavior.

### Distribution

Game Master continues to distribute through its GitHub manifest and branch archive. It has no Foundry package-directory or Morelord website listing.

## 0.1.11

Released October 8, 2026.

- The open tray stays above the canvas and below Foundry windows, so dialogs, notifications, and context menus can be used. Rebuilding the tray keeps in-progress fields. Chat messages no longer rebuild it. Success messages use Foundry notifications.
- Playlist, ambience, Now Playing, and Set All Track Volumes use Foundry's volume-slider scale. Saved levels from the older linear scale convert once.
- Managed trigger macros call the module API instead of pasting trigger source. Sneak Attack adjacency is measured on the target token's scene. An older pasted compendium command is replaced on load.
- GM Settings can reorder specialty requests by dragging them. The order is saved for this world and used on the Roll Requests grid. Hidden requests keep their place, and the check builder stays where it is. Specialty visibility stays on that tab, using the existing world setting keys.
- Start Playlist opens its dialog above the tray, starts the chosen playlist at the chosen volume, and re-enables the button after success or failure. A playback error is shown as a Foundry notification.
- Set All Track Volumes stores the level on every PlaylistSound in every playlist, including stopped tracks and ambience, and on saved playback buttons. The current song changes immediately, and a playlist started afterward plays at that level.
- Roll Requests keeps the check builder on one row inside a card that matches the specialty cards. Each specialty card puts its selector, Blind roll, and dice button on one row under the title. Roll of Fate can choose the party or the selected tokens. GM Settings can hide each specialty for the current world.
- Macro pins show the icon on the left and the name on the right. Long names truncate with an ellipsis, and the full name is on hover. Dragging a pin reorders it and saves that order immediately without running the macro.
- Trigger cards use one header row for the name, scope, status icon, and play/pause control. When and Then sit tightly underneath, and each card is only as tall as that content. The Triggers tab no longer has a New Trigger button. Trigger behavior stays in module code.

Compatibility remains the previously verified Foundry VTT 14.368.

## 0.1.10

Released October 5, 2026.

- Add stopped-by-default **Critical Hit** and **Critical Fumble** triggers for character and NPC attack rolls. Native critical/fumble detection respects kept advantage/disadvantage dice and system critical thresholds; selected ranged/thrown attacks use the ranged table, and spell attacks use magic.
- Include all six **Critical Rolls** tables (60 results) from Morelord Compendium in **Game Master Roll Tables**. Results remain blind GM/Assistant-only chat cards, once per attack card; no world-table import or Morelord Compendium dependency is required.
- Upgrade existing global catalogs with only the two new stopped rules, preserving saved rules and states. Reuse Core services, trigger macro lifecycle, and card controls.
- Give new critical-result chat cards a Core success/danger heading, attacker portrait/name, attack category, weapon/spell, and kept attack die so the reason for the table roll is clear. Preserve native table dice, results, and GM-only visibility; leave Dice So Nice settings unchanged.

## 0.1.9

### Improvements

- Documentation uses Core to open the website documentation index.
- Added a manifest changelog link and moved release history into `release-notes/`. Local working files belong in ignored `/tmp/`.

## 0.1.8

### Improvements

- Resize the bottom-centered panel to 65% of viewport width and 75% of viewport height.
- Keep the panel above other Foundry windows.
- Make the panel and handle backgrounds fully opaque using Morelord Core's shared window opacity control. Requires Core 0.4.1 or newer.

## 0.1.7

- Added Hunter's Mark automatic damage against the caster's marked target, including critical damage on a kept natural 20. Supports native D&D5e 6 effect provenance.
- Added Ammunition Recovery: return half the ammunition consumed during combat, rounded down per character and stack, when combat ends. Handles depleted stacks and prevents duplicate recovery.
- Roll of Fate now starts with the selected character's portrait and name: "Affrun has been chosen by fate!"
- New triggers start paused. Refresh GM and player clients after updating, then enable the desired triggers. Ammunition tracking begins when enabled; keep attack messages until combat ends.

Install/update through the [module manifest](https://raw.githubusercontent.com/tmoreland72/morelord-game-master/master/module.json). This repository distributes the master branch archive; the release tag records version 0.1.7. Foundry compatibility remains verified at 14.368. There is no Foundry package-directory listing.

## 0.1.6

### Improvements

- Add native Mass Combat macros for attacker selection, batch attacks, focus fire, private previews, and explicit HP/temporary-HP damage. Do not automatically mark tokens Dead or combatants defeated.
- Add Select NPCs with a dynamic type dropdown and scene token counts.
- Add optional Smithy at the Scar macros for four waves, perimeter placement, independent HP, ten reinforcement rounds, and the ratling safe word. Support unlinked combats and all four Haze Hulk variants.
- Add remembered Set All Track Volumes controls with native Foundry volume conversion.

## 0.1.5

- Volatile Magic now requests a d4 and rolls its table only on a 1. It ignores prior progression counters; Wild Magic retains its escalating d20.
- All GM clients load the shared trigger catalog on startup, including when another GM is already connected. Empty catalogs recover the five built-ins stopped by default.
- Preserve configured triggers, saved rolls, private outcomes, and existing character data.

## 0.1.4

- Remove the unconfigured “Configured character” template from the default trigger control panel and clean it up on upgrade.
- Preserve configured item-use triggers and the Item Use macro in the compendium. The five built-in triggers still start stopped.
- Match the tray tab to the control panel’s transparency using Core’s shared tray-handle component, with an up/down chevron reflecting its closed/open state.

Requires Core 0.3.13 for the shared tray surface.

## 0.1.3

- Require Core 0.3.12, which fixes the missing public runSerialized socket method in Core 0.3.11.
- Saved-roll results can finish through the corrected Core API. Existing roll records and trigger settings are preserved.

This release changes dependency metadata and its error message only.

## 0.1.2

- Fix first installation showing only Volatile Magic: seed all six managed triggers, each stopped by default.
- Repair existing incomplete catalogs without changing existing IDs, enabled states, or custom bindings. Keep global settings shared across worlds and retain later explicit deletions.
- New programmatic trigger registrations also start stopped. Roll of Fate remains a one-shot macro.

Previously verified Foundry compatibility remains 14.368. This code-only release retains the previously verified pack databases.

## 0.1.1

Initial GitHub-only distribution of the GM tray: roll requests, macro pins, sound controls, and managed trigger macros.

- Includes Game Master Macros and Game Master Roll Tables under Morelord Gaming / Game Master.
- Includes independent escalating Wild Magic and Volatile Magic checks, selected-token Roll of Fate, and start/stop trigger controls.
- Requires Morelord Core 0.3.11 or newer for shared roll-request services.

Install through the manifest URL in README.md. No Foundry package-directory or Morelord website listing is published.
