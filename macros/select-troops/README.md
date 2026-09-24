# Select NPCs

One GM macro lists every NPC type on the viewed scene in an alphabetical dropdown with token counts. Types use source actor names, so numbered or renamed tokens stay grouped; different NPC variants have separate entries. Selection includes creatures at 0 HP and excludes player characters.

Select a type and click Select tokens to replace the current selection. Cancel preserves the selection. HP, statuses, and initiative are unchanged. Run Mass Combat — Select Attackers or Mass Combat — Attack Targets afterward as needed.

Rebuild with `node tools/build-selection-macros.mjs`. This picker replaces the four fixed troop-selection macros and their tray pins.
