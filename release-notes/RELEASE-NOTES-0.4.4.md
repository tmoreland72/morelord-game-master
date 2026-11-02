# Morelord Game Master 0.4.4

## What Changed

### Changed

- Delerium Search uses Morelord Core 0.9.0 for zones, scoring, rewards, and the results window. The tray card appears only while a Drakkenheim content module is active and Show Delerium Search is on, including on the GM Settings list. Reordering the other specialty rows keeps Delerium Search in its saved place. Chat cards, Blind roll, the Player Settings party, and the authority GM's award socket stay in Game Master.
- Combat-end Lucky Finds rolls the world table into GM chat.
- Requires Morelord Core 0.9.0.
- The disabled Undo Last Action button reads Nothing to undo, and its tooltip says the same. A saved snapshot updates that label without rebuilding the tray. While a snapshot exists, the button still reads Undo Last Action, including while a bulk action is busy.
- Bulk chat cards no longer add a skipped-characters line for people already in the target state. XP, inspiration, prototype token sync, and coins still leave those characters unchanged. The notice when nobody changes stays, and a missing scene token is still named on the prototype sync card.
