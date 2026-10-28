---
title: Morelord Game Master Documentation
description: Your in-game Dungeon Master Screen for roll requests, party rewards, macros, sound, triggers, and a rules cheat sheet.
slug: morelord-game-master
product: morelord-game-master
version: 0.3.0
foundry: 14
order: 0
---

# Morelord Game Master

Morelord Game Master is free. Every DM needs a screen. This one lives inside Foundry and only the GM sees it. Players never open it, but they receive the roll requests you send.

## Setup

Requires Foundry VTT v14 or newer, the D&D 5e system 6.0 or newer, and Morelord Core 0.5.2 or newer. Enable Core and Game Master in your world.

As a GM, click the **Game Master** handle at the bottom of the screen, or press **Alt+G**. You can change the shortcut in Foundry's keybinding settings. The screen opens as a tray above the canvas and below Foundry windows and dialogs, so you can keep working while it is open.

## Player Settings

Choose the characters in scope once. Party requests, selected-token requests, and the party bulk actions use that scope. The heading matches the other sections in the tray.

## Roll Requests

Build a skill check, ability check, or saving throw with an optional DC, then choose who rolls: the whole party, selected party tokens, or one character. One character lists every player character in the world. The label sits above that select. Sending with none chosen warns and leaves the form as it is. The request names only the chosen character, so only that character's owner can roll. Field labels sit above their controls. Players receive the request in chat and roll with the system's roll dialog, including advantage, disadvantage, and automatic modifiers. A summary card lists each total and, when a DC is set, who passed.

Turn on **Blind roll** to keep results and summaries visible only to GMs and Assistant GMs. Specialty requests sit below the builder: Encounter Check, Delerium Search, Foraging Check, Death Save, and Roll of Fate. GM Settings can hide any of them or change their order.

## Bulk Actions

Coins and XP share the first row. Inspiration and Prototype Token Sync share the next. Undo Last Action is one right-aligned button between the tab bar and those sections. It is disabled when nothing can be undone, and that state updates as soon as an undoable action is stored or undone. Each row is only as tall as its tallest card. Every label sits above its control, lined up on the left. Selects are wide enough for their longest choice. Coins puts the coin amounts, Clear, and Apply on the line under Action. XP puts Action and Apply on one line and Amount on the next line, with the label above the field. Inspiration puts Action and Apply together the same way. Card titles stay on one line. Prototype Token Sync uses that same row: Target above its select, then Apply. Party, Selected Tokens, and All Tokens are the choices. All Tokens includes NPC tokens on the scene. Token Disposition, Token Vision, Token Display Bars, and Token Display Name use the same card row as the other bulk actions. Each one has a title, then Target and the setting with labels above the selects, then Apply. Target is All Tokens on Current Scene or Selected Tokens. Apply updates those scene tokens in one batch. An empty target warns. Undo restores the previous token fields.

Enter coins once, then split them amongst the party, give the amount to each member, or take coins back. Removal uses personal coins first, then the shared party purse, and reports any shortfall in chat. You can also grant or set XP, grant or clear Heroic Inspiration, and copy prototype tokens for the party, the selected tokens, or every token on the scene, including NPCs.

Undo restores the latest of those changes. Until something can be undone, the Undo Last Action button stays disabled.

## Macros

Drag a macro into the panel to pin it, drag pins to reorder them, and click to run. Each pin is tall enough to show its icon, with the name beside it. Pins are saved for the world. Unpinning does not delete the macro.

Right-click a pin to run it on load for you, or, as a GM, for everyone in the world.

## Sound

Start a playlist or a saved ambience, set every track's volume at once, and stop what is playing from **Now Playing**. When you add ambience, type a name for the whole mix. The Name field starts empty. Add with an empty name warns and leaves the dialog open, with your layers and volumes still selected, and puts the cursor in Name. Saved playlist and ambience buttons fill the column, with delete at the right end of the same row. Add Playlist and Add Ambience are accent buttons of that same width. Now Playing lists each layer by its file name, with the mix name underneath. **Stop All Sound** stops music, ambience, and anything else Foundry still has playing.

## Triggers

Triggers react to moments in play, such as a Wild Magic surge check after a Sorcerer spell, Sneak Attack damage on a qualifying hit, Lucky Finds after combat, or a World Clock that advances time. Each trigger card shows when it runs and what it does. Turn each trigger on or off with its play and pause control to suit your table. Triggers keep running while the screen is closed. GM Settings can hide a trigger card or change the order; hiding one does not pause it.

## Cheat Sheet

Look up conditions, actions, DCs, exhaustion, travel pace, and other quick rules without leaving the game. Hover or focus a chip for a short summary. Sections can collapse, and GM Settings can hide or reorder them.

## GM Settings

Roll Requests, Bulk Actions, Triggers, and Cheat Sheet each have a list. A grip on the row reorders that list for this world. The checkbox shows or hides the item. These choices are saved for the world. Ambience folders stay in Foundry's Game Settings.
