# Morelord Game Master Changelog

## 0.4.2

### Changed

- Game Master now releases the same way as every other Morelord module: GitHub release with a module zip, Foundry package version, and morelordgaming.com release record. Same features as 0.4.1; requires Morelord Core 0.8.0+.

## 0.4.1

- Hotfix. CSS files use LF line endings, including on Windows, so the tray stylesheet test matches a literal newline.
- The README states version 0.4.1. The missing-Core error message now says Morelord Core 0.8.0+.

## 0.4.0

- Removed Game Master's Token Distance Indicator override. The indicator stays a Morelord Core feature. Game Master no longer promotes Core's setting, copies a previous client value, or changes its hint.
- Macro pins and GM Settings rows reorder with Morelord Core's sortable helper. Dragging shows the whole card under the pointer and a landing line where it will drop. The new order is saved for the world. Dragging a macro pin does not run it. Dropping a new macro still pins it. Requires Morelord Core 0.8.0.
- GM Settings groups Roll Requests, Bulk Actions, Triggers, and Cheat Sheet in the same ml-card used by Roll Requests and Bulk, laid out side by side in Core's auto-fit grid. Each section title is the same strong card title used on Bulk and token cards, with no subtitle. Each section lists its items in one vertical column, and dragging reorders that list. Long row labels wrap inside the card. Player Settings uses Core's horizontal character choice grid.

## 0.3.0

- The Game Master tray stays open until you press Escape or click the handle. Calling for a roll, applying a bulk action, undoing an action, running a macro, and opening Foundry Game Settings no longer close it.
- The tray sits above normal Foundry windows. Roll dialogs (including the D&D system's roll configuration dialog and Foundry's dice roller), chat card popouts, confirm and prompt dialogs, and the file browser open above the tray. Tooltips and notifications stay above both. A focused character sheet stays underneath.
- Roll Requests: Character appears on the check builder row only when Who rolls is One character, and shows or hides the moment you change Who rolls. Its list is every player character in the world, not only the Player Settings party. Sending with no character chosen warns and leaves the form open. The request names only that character, so only their owner gets the Roll button.
- Bulk Actions adds four scene token actions: Token Disposition, Token Vision, Token Display Bars, and Token Display Name. Each applies to all tokens on the current scene or to the selected tokens in one batch. Tokens that already match are skipped, and an empty target warns. Undo Last Action restores the previous token settings.
- Prototype Token Sync has a Target choice: Party, Selected Tokens, or All Tokens, where All Tokens includes NPC tokens on the scene.
- Undo Last Action is one right-aligned button between the tab bar and the bulk cards. It is disabled until there is something to undo and updates as soon as an action is saved or undone. The XP card keeps Action and Apply on one row, with Amount on the next line.

## 0.2.0

- Skill checks, ability checks, saving throws, Foraging, and death saves show a single Roll button. The button uses the dnd5e native roll, including the system's roll dialog and automatic advantage or disadvantage. The custom advantage and disadvantage prompt is removed.
- Blind results and summaries stay visible only to GMs and assistants. A blind check is evaluated by the active GM. A public death save still updates the character sheet; a blind death save does not.
- Bulk Actions adds XP, Inspiration, Prototype Token Sync, and Undo Last Action. Coins and XP sit side by side on the first row. Inspiration, Prototype Token Sync, and Undo Last Action share the second row and stretch to the same height. Apply sits beside its field.
- XP can be split among the Player Settings party, given in full to each member, or set to the same amount for every member. A split gives any remainder to one random party member, matching leftover copper for coins. Set replaces each character's experience with a non-negative whole number. The action updates each character's experience, and Undo restores the previous values.
- Inspiration grants Heroic Inspiration to every party member or clears it.
- Prototype Token Sync copies each party character's token on the active GM's current scene onto that character's prototype token. A selected token is preferred when several are placed. Characters with no token on that scene are skipped and named in the chat card. Linked and unlinked tokens both copy name, name display, actor link, image and scale, width, height, depth, disposition, resource bar display, primary resource bar, secondary resource bar, vision, detection modes, light, lock rotation, rotation, opacity, dynamic ring, and occlusion. The tray card stays short. Its help icon opens that list. Only settings that differ are written. A prototype Foundry would leave unchanged is skipped, so that copy is not reported as a cancelled character update.
- Undo Last Action restores only the most recent Coins, XP, Inspiration, or Prototype Token Sync change, then clears. Each of those actions, including every XP mode, saves a snapshot and enables Undo as soon as the action finishes, without reopening the tray. The button is disabled and reads Nothing to undo when there is nothing to undo, and Undo Last Action when a snapshot is stored. The snapshot is stored for the world and survives a reload.
- The first click applies the control after a tray field is edited. That includes Bulk Actions, Set All Track Volumes and the Now Playing sliders, playlist and ambience buttons, roll requests, and macros. Saving the edited field no longer rebuilds the tray before that click, including when the setting update arrives after the save. Set all party XP stays selected when the tray rebuilds.
- Bulk Actions labels the Coins addition button, the XP button, and Prototype Token Sync Apply. Coin removals still use Take. Inspiration already uses Apply. Undo Last Action keeps its name.
- The XP action explanation is a help icon beside the Action label, and Foundry's tooltip shows that text. Prototype Token Sync shows its description on the existing help icon the same way. That icon still opens the copied-settings list.
- Changing the Roll Requests type updates the second dropdown. A skill check lists the SRD 5.2 skills. An ability check or saving throw lists the six abilities. The selected value stays inside that list.
- Add folder opens the folder browser at the data root. An existing ambience row and a directory the file browser used earlier in the session stay out of that starting location.
- Set All Track Volumes writes one hundredth gain to every song in every playlist, then reads those sounds back. Ambience playlists are left unchanged, including stopped ambience layers and saved ambience buttons. Foundry v14 cleans PlaylistSound volume on the server to hundredths, so a thousandth such as 0.225 is stored as 0.23. 37 is stored as 0.23 and the slider reads 38. 30 is stored as 0.16 and the slider reads 29. No hundredth reads back as 37 or as 30. A second click while that update is still running is ignored, and the button stays disabled until the update finishes.
- Set Ambience Volumes sets every ambience layer that is playing now to the entered percent. Stopped ambience layers keep their current level, and saved ambience buttons keep the volume they will reapply the next time they play. The percent is remembered for the world and is the default volume for each layer in Add Ambience afterward.
- Stop All Sound stops every playlist and every ambience layer, including a PlaylistSound whose document says it is stopped while its audio is still playing, and every sound in Foundry's playing, pending, and cached audio. Those sounds stop immediately. It does not close the Game Master tray. Stop Music and Stop Ambience still appear while those kinds are playing.
- Add Playlist starts the chosen playlist at the dialog volume. The playlist list opens with nothing selected, and Add clears that choice for the next time. The volume stays at the last Set All Track Volumes percent. Add Ambience lists each layer on one compact row: checkbox, file name, help icon, and volume. One Name field above the list names the whole mix. That field starts empty, and Add requires the GM to type the group name. Saved buttons show that name. Playlists and Ambience use the same full-width row: the name fills the column and the trash icon is a fixed square at the right end of that row. Add Playlist and Add Ambience are accent buttons as wide as those rows. An empty ambience name warns, leaves the dialog open with the selected layers and volumes intact, and focuses Name. Choosing no playlist, no sound, no character, or a volume outside 0–100 warns the same way and leaves that dialog open. Now Playing titles each playing layer with its file name and shows the group name underneath. The help icon's tooltip shows the full path to the left. The button says Add. Every layer starts unchecked, at the remembered ambience volume. Buttons share one height, except macro pins. Field labels sit above their fields, and those controls keep that height.
- Granting inspiration no longer fails when a party member already has it. Grant skips members who already have inspiration, and clear skips members who do not. A stored false value is not treated as already granted. XP, coins, and prototype token sync also skip a character who would not change. Only characters who change are saved for undo. A grant or clear that changes someone enables Undo even when Foundry omits that actor from the update result. If nobody changes, the previous undo stays and a notice says so. The chat card can say how many were skipped.
- Each new bulk action posts a short public chat card, the same way Coins does.
- Opening Foundry Game Settings closes the Game Master tray. The module Configure menu opened from Game Settings does the same. The tray handle opens it again afterward.
- Ambience can use more than one source folder. Foundry Game Settings lists the folders, and a GM can add or remove them with the folder FilePicker. The list starts empty. A previous single folder is copied into that list once when the saved value has a path. That value is read from the setting document by its key. A world whose list was emptied while that path was still stored gets the folder back once, and the old setting is then cleared so a removed folder stays removed. Each folder is scanned recursively, including S3 and other FilePicker sources. A missing or invalid folder is skipped, with a console warning and one notice, and Add Ambience still opens for the folders that can be read. Saved ambience buttons still play the full path they already stored.
- Add folder in Game Master settings opens Foundry's folder browser without the settings dialog blocking it. The browser comes to the front at the data root, including when ambience rows already exist and when the browser remembers another directory. Browsing into a folder and choosing it adds that folder to the list, and Save stores the list.
- Token Distance Indicator is registered by Morelord Core. Core's history has no Force choice; it was a per-client checkbox. Game Master makes it a world setting that only a GM can change, so that choice is forced for every client. Turning it off hides the hover distance for players. A world that has never saved the setting takes a GM's previous client choice when that choice was off; otherwise it stays on.
- Game Master settings are world settings only a GM can change. That covers the tray board, macro pins, specialty order, the legacy ambience folder, ambience folders, the ambience migration flag, bulk undo, and each specialty visibility toggle. They were already stored for the world. Players can no longer write them. The Alt+G shortcut stays a per-user keybinding.
- The Cheat Sheet places Misc immediately after Improvising Damage. Misc is one chip each for Typical DC, Exhaustion, Jumping, and Travel Pace, plus Mounted and Underwater. Each tooltip is a bold title, bold subheadings where a rule has parts, and short bullets or a small table. Cover and vision stays its own section after Misc. The tab does not show a license line.
- Drakkenheim is one collapsible section when `drakkenheim-core`, `drakkenheim-monsters`, or `drakkenheim-scgd` is active. The summaries are static and original. Contamination is one chip whose tooltip lists levels 1–6. Delerium Search covers outside the wall (DC 15) and inside the wall (DC 20). Two or more failed checks draw a random encounter. Delerium lists Chip, Fragment, Shard, Crystal, and Geode in ascending value, with weight. Dazed and Weakened join the main Conditions section with a faint purple background. Mutations, madness, and container titles such as New Conditions are not shown. The sheet does not read compendium text and does not wait on Craftworks. `game.modules.get('morelord-game-master').api.debugDrakkenheimCheat()` reports whether those modules are active and which static chips are shown.
- Bulk Actions rows stay as tall as their content. Cards in a row match that height. Each field is a left-aligned stack: the label sits above the control. Selects are as wide as their longest option. Coins keeps Action on the first line and the five coin amounts with Clear and Apply on the next. XP keeps Action, Amount, and Apply together, wrapping inside the card when the card is narrow. Inspiration keeps Action and Apply together the same way. Card titles stay on one line. Prototype Token Sync and Undo use a normal-width left-aligned button. Inputs, selects, steppers, and buttons keep one control height, and Apply lines up with the control. Macro pins are the exception: they are tall enough for the icon and its padding.
- Drakkenheim conditions in the Conditions section are the content set: Addled, Bewildered, Bleeding, Bloodied, Burning, Clumsy, Dazed, Defenseless, Distracted, Enfeebled, Entangled, Frozen, Helpless, Immobilized, Jinxed, Shocked, Sickened, Slowed, Staggered, Valor, and Weakened.
- GM Settings groups Roll Requests, Bulk Actions, Triggers, and Cheat Sheet. Each row has a grip icon and a show/hide toggle. Dragging saves that world's order. Hidden items stay in the order and leave the tab. Player Settings uses the same section heading as the other tabs.
- Calling for a roll, applying a bulk action, or running a macro closes the Game Master tray. A bulk action that changes nothing still closes it. The handle opens it again. A cancelled character check and the sound controls, including Stop All Sound, leave the tray open.
- Right-click a Macros tab pin for Run on load for me, or, as a GM, Run on load for everyone. Each entry switches to Running on load for me or Running on load for everyone while it is on, and choosing it again turns it off. For me is stored for that user and runs only on that client. For everyone is stored for the world and runs for every user who loads the world, including players. A pin marked both ways runs once. Macros the user cannot see or execute are skipped, and one failure does not stop the others. A blue user icon (Runs on load for you) marks a pin that runs only for you. A pin marked for everyone shows only the gold group icon (Runs on load for everyone). Each icon is 14px on a small dark pad.

## 0.1.15

- Removed Campaign AI from the GM tray, including its tab, Foundry settings, local service, and provider configuration. The tray tabs are Roll Requests, Bulk Actions, Macros, Sound, Triggers, GM Settings, and Player Settings.

## 0.1.14

- Fixed Game Master forms, including Start Playlist, opening behind the tray. Forms now use the native Foundry modal dialog layer above the tray while retaining shared Core styling.

## 0.1.13

- Added Bulk Actions immediately before Macros, using the party configured on Player Settings.
- The Action dropdown supports Split amount amongst party members, Give amount to all party members, Split removal amongst party members, and Take amount from all party members.
- Split operations divide total copper value before making whole-coin shares. Any remaining copper goes to a random party member.
- Removals use personal coins first, then the shared D&D5e Party/Group purse. Unpaid amounts appear as Deficit; balances never become negative. Mixed-coin deductions retain exact copper precision.
- Standard public chat cards show Added or Removed, with orange Paid by Party or Deficit only when applicable. All displayed coin counts are whole numbers.
- Compact coin fields use Core's stacked-right number arrows and standard field labels. Clear resets all five amounts; Send/Take clears them after a successful operation. The selected action stays saved for the world.
- Game Master remains above other Foundry windows when they open or regain focus.
- Requires Morelord Core 0.5.2 for the shared stacked number controls and field-label styling.

## 0.1.12

### Improvements

- Mass Combat uses Core's shared combat service while preserving Game Master's saved groups, flag namespace, macro IDs, and pins.
- Mass Combat supports native weapon and saving-throw activities, updates fields when the activity changes, and summarizes hits, kills, and actual damage in private chat. Preview leaves HP unchanged; Apply Damage retains defense, temporary HP, stale-preview, and duplicate-application protection. Non-damage effects, resources, and recharge remain GM-managed.
- Smithy at the Scar uses Core's shared perimeter placement while preserving its wave, reinforcement, initiative, independent-HP, and Ratling Safe Word rules.
- Bundled trigger macros use the current module API wrappers. Existing imported macros remain supported.
- Requires Morelord Core 0.5.0 or newer. Verified on Foundry VTT 14.369 and D&D5e 6.0.6; supported minimum versions remain unchanged apart from Core.

### Fixed

- Release regressions wait for summaries and surge outcomes after dice animations, explicitly choose the party/skill scope, and create disposable rogue/sorcerer fixtures instead of requiring named campaign characters. Modifier checks follow the installed D&D5e native behavior.

## 0.1.11

## 0.1.10

## 0.1.9

### Improvements

- Documentation uses Core to open the website documentation index.
- Added a manifest changelog link and moved release history into `release-notes/`. Local working files belong in ignored `/tmp/`.

## 0.1.8

### Improvements

- Resize the bottom-centered panel to 65% of viewport width and 75% of viewport height.
- Keep the panel above other Foundry windows.
- Make the panel and handle backgrounds fully opaque using Morelord Core's shared window opacity control. Requires Core 0.4.1 or newer.

## 0.1.6

### Improvements

- Add native Mass Combat macros for attacker selection, batch attacks, focus fire, private previews, and explicit HP/temporary-HP damage. Do not automatically mark tokens Dead or combatants defeated.
- Add Select NPCs with a dynamic type dropdown and scene token counts.
- Add optional Smithy at the Scar macros for four waves, perimeter placement, independent HP, ten reinforcement rounds, and the ratling safe word. Support unlinked combats and all four Haze Hulk variants.
- Add remembered Set All Track Volumes controls with native Foundry volume conversion.

## 0.1.5

## 0.1.4

## 0.1.3

## 0.1.2

## 0.1.1
