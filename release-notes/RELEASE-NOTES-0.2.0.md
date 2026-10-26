# Morelord Game Master 0.2.0

## What Changed

- Skill checks, ability checks, saving throws, Foraging, and death saves show a single Roll button. The button uses the dnd5e native roll, including the system's roll dialog and automatic advantage or disadvantage. The custom advantage and disadvantage prompt is removed.
- Blind results and summaries stay visible only to GMs and assistants. A blind check is evaluated by the active GM. A public death save still updates the character sheet; a blind death save does not.
- Bulk Actions adds XP, Inspiration, Prototype Token Sync, and Undo Last Action under Coins. Inspiration and Prototype Token Sync share one compact card row. Coins, XP, and Undo Last Action each stay on their own row.
- XP can be split among the Player Settings party or given in full to each member. A split gives any remainder to one random party member, matching leftover copper for coins. The action updates each character's experience.
- Inspiration grants Heroic Inspiration to every party member or clears it.
- Prototype Token Sync copies each party character's token on the active GM's current scene onto that character's prototype token. A selected token is preferred when several are placed. Characters with no token on that scene are skipped and named in the chat card. Position, coordinates, elevation, token identity, and placed-token runtime state are not copied.
- Undo Last Action restores only the most recent Coins, XP, Inspiration, or Prototype Token Sync change, then clears. The button is disabled when there is nothing to undo. The snapshot is stored for the world and survives a reload.
- Each new bulk action posts a short public chat card, the same way Coins does.
- Opening Foundry Game Settings closes the Game Master tray. The module Configure menu opened from Game Settings does the same. The tray handle opens it again afterward.
- Ambience can use more than one source folder. Foundry Game Settings lists the folders, and a GM can add or remove them with the folder FilePicker. An existing single folder is copied into that list once. Each folder is scanned recursively, including S3 and other FilePicker sources. The ambience picker shows the path inside the source folder so files that share a name stay distinct. Saved ambience buttons still play the full path they already stored.

## Verification

- Passed the module test suite.
