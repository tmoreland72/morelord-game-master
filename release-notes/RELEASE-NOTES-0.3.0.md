# Morelord Game Master 0.3.0

## What Changed

- The Game Master tray stays open until you press Escape or click the handle. Calling for a roll, applying a bulk action, undoing an action, running a macro, and opening Foundry Game Settings no longer close it.
- The tray sits above normal Foundry windows. Roll dialogs (including the D&D system's roll configuration dialog and Foundry's dice roller), chat card popouts, confirm and prompt dialogs, and the file browser open above the tray. Tooltips and notifications stay above both. A focused character sheet stays underneath.
- Roll Requests: Character appears on the check builder row only when Who rolls is One character, and shows or hides the moment you change Who rolls. Its list is every player character in the world, not only the Player Settings party. Sending with no character chosen warns and leaves the form open. The request names only that character, so only their owner gets the Roll button.
- Bulk Actions adds four scene token actions: Token Disposition, Token Vision, Token Display Bars, and Token Display Name. Each applies to all tokens on the current scene or to the selected tokens in one batch. Tokens that already match are skipped, and an empty target warns. Undo Last Action restores the previous token settings.
- Prototype Token Sync has a Target choice: Party, Selected Tokens, or All Tokens, where All Tokens includes NPC tokens on the scene.
- Undo Last Action is one right-aligned button between the tab bar and the bulk cards. It is disabled until there is something to undo and updates as soon as an action is saved or undone. The XP card keeps Action and Apply on one row, with Amount on the next line.

## Verification

- Module test suite: 128 passed, 1 failed. The failure is the Smithy at the Scar partial-token-creation test, which fails the same way on master before this release and is not part of the release checks.
- The release checks (changelog, release sync, website publish) pass.