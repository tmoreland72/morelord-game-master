# Morelord Game Master 0.2.0

## What Changed

- Skill checks, ability checks, saving throws, Foraging, and death saves show a single Roll button. The button uses the dnd5e native roll, including the system's roll dialog and automatic advantage or disadvantage. The custom advantage and disadvantage prompt is removed.
- Blind results and summaries stay visible only to GMs and assistants. A blind check is evaluated by the active GM. A public death save still updates the character sheet; a blind death save does not.
- Bulk Actions adds XP, Inspiration, Prototype Token Sync, and Undo Last Action under Coins. Inspiration and Prototype Token Sync share one compact card row. Coins, XP, and Undo Last Action each stay on their own row.
- XP can be split among the Player Settings party, given in full to each member, or set to the same amount for every member. A split gives any remainder to one random party member, matching leftover copper for coins. Set replaces each character's experience with a non-negative whole number. The action updates each character's experience, and Undo restores the previous values.
- Inspiration grants Heroic Inspiration to every party member or clears it.
- Prototype Token Sync copies each party character's token on the active GM's current scene onto that character's prototype token. A selected token is preferred when several are placed. Characters with no token on that scene are skipped and named in the chat card. Position, coordinates, elevation, token identity, and placed-token runtime state are not copied.
- Undo Last Action restores only the most recent Coins, XP, Inspiration, or Prototype Token Sync change, then clears. Each of those actions, including every XP mode, saves a snapshot and enables Undo as soon as the action finishes, without reopening the tray. The button is disabled when there is nothing to undo. The snapshot is stored for the world and survives a reload.
- The first click applies the control after a tray field is edited. That includes Bulk Actions, Set All Track Volumes and the Now Playing sliders, playlist and ambience buttons, roll requests, and macros. Saving the edited field no longer rebuilds the tray before that click. Set all party XP stays selected when the tray rebuilds.
- Granting inspiration no longer fails when a party member already has it. Grant skips members who already have inspiration, and clear skips members who do not. XP, coins, and prototype token sync also skip a character who would not change. Only characters who change are saved for undo. If nobody changes, the previous undo stays and a notice says so. The chat card can say how many were skipped.
- Each new bulk action posts a short public chat card, the same way Coins does.
- Opening Foundry Game Settings closes the Game Master tray. The module Configure menu opened from Game Settings does the same. The tray handle opens it again afterward.
- Ambience can use more than one source folder. Foundry Game Settings lists the folders, and a GM can add or remove them with the folder FilePicker. The list starts empty. A previous single folder is copied into that list once when the saved value has a path. Each folder is scanned recursively, including S3 and other FilePicker sources. A missing or invalid folder is skipped, with a console warning and one notice, and Play Ambience continues. The ambience picker shows the path inside the source folder so files that share a name stay distinct. Saved ambience buttons still play the full path they already stored.
- Add folder in Game Master settings opens Foundry's folder browser without the settings dialog blocking it. The browser comes to the front. If the current folder is missing, it opens at the data root. Browsing into a folder and choosing it adds that folder to the list, and Save stores the list.

## Verification

- Passed the module test suite.
