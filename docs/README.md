---
title: Morelord Game Master Documentation
description: Your in-game Dungeon Master Screen for roll requests, party rewards, macros, sound, triggers, and a rules cheat sheet.
slug: morelord-game-master
product: morelord-game-master
version: 0.2.0
foundry: 14
order: 0
---

# Morelord Game Master

Morelord Game Master is free. Every DM needs a screen. This one lives inside Foundry and only the GM sees it. Players never open it, but they receive the roll requests you send.

## Setup

Requires Foundry VTT v14 or newer, the D&D 5e system 6.0 or newer, and Morelord Core 0.5.2 or newer. Enable Core and Game Master in your world.

As a GM, click the **Game Master** handle at the bottom of the screen, or press **Alt+G**. You can change the shortcut in Foundry's keybinding settings. The screen opens as a tray above the canvas and below Foundry windows and dialogs, so you can keep working while it is open.

## Player Settings

Choose the characters in scope once. Party requests, selected-token requests, and Bulk Actions use that scope. The heading matches the other sections in the tray.

## Roll Requests

Build a skill check, ability check, or saving throw with an optional DC, then choose who rolls: the whole party, selected party tokens, or one character. Field labels sit above their controls. Players receive the request in chat and roll with the system's roll dialog, including advantage, disadvantage, and automatic modifiers. A summary card lists each total and, when a DC is set, who passed.

Turn on **Blind roll** to keep results and summaries visible only to GMs and Assistant GMs. Specialty requests sit below the builder: Encounter Check, Delerium Search, Foraging Check, Death Save, and Roll of Fate. GM Settings can hide any of them or change their order.

## Bulk Actions

Coins and XP share the first row. Inspiration, Prototype Token Sync, and Undo Last Action share the second. Each row is only as tall as its tallest card. Every label sits above its control, lined up on the left. Selects are wide enough for their longest choice. Coins puts the coin amounts, Clear, and Apply on the line under Action. XP puts Action, Amount, and Apply together, and that row wraps inside the card when the card is narrow. Inspiration puts Action and Apply together the same way. Card titles stay on one line. Prototype Token Sync and Undo use a normal-width button on the left.

Enter coins once, then split them amongst the party, give the amount to each member, or take coins back. Removal uses personal coins first, then the shared party purse, and reports any shortfall in chat. You can also grant or set XP, grant or clear Heroic Inspiration, and copy each character's token on the current scene onto that character's prototype token.

Undo restores the latest of those changes. Until something can be undone, the button reads Nothing to undo.

## Macros

Drag a macro into the panel to pin it, drag pins to reorder them, and click to run. Each pin is tall enough to show its icon, with the name beside it. Pins are saved for the world. Unpinning does not delete the macro.

Right-click a pin to run it on load for you, or, as a GM, for everyone in the world.

## Sound

Start a playlist or a saved ambience, set every track's volume at once, and stop what is playing from **Now Playing**. When you add ambience, type a name for the whole mix. The Name field starts empty, and Add will not continue without it. The saved button shows that name. Now Playing lists each layer by its file name, with the mix name underneath. **Stop All Sound** stops music, ambience, and anything else Foundry still has playing.

## Triggers

Triggers react to moments in play, such as a Wild Magic surge check after a Sorcerer spell, Sneak Attack damage on a qualifying hit, Lucky Finds after combat, or a World Clock that advances time. Each trigger card shows when it runs and what it does. Turn each trigger on or off with its play and pause control to suit your table. Triggers keep running while the screen is closed. GM Settings can hide a trigger card or change the order; hiding one does not pause it.

## Cheat Sheet

Look up conditions, actions, DCs, exhaustion, travel pace, and other quick rules without leaving the game. Hover or focus a chip for a short summary. Sections can collapse, and GM Settings can hide or reorder them.

## GM Settings

Roll Requests, Bulk Actions, Triggers, and Cheat Sheet each have a list. A grip on the row reorders that list for this world. The checkbox shows or hides the item. These choices are saved for the world. Ambience folders stay in Foundry's Game Settings.
