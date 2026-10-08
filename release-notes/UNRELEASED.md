# Unreleased

- The open tray stays above the canvas and below Foundry windows, so dialogs, notifications, and context menus can be used. Rebuilding the tray keeps in-progress fields. Chat messages no longer rebuild it. Success messages use Foundry notifications.
- Playlist, ambience, Now Playing, and Set All Track Volumes use Foundry's volume-slider scale. Saved levels from the older linear scale convert once.
- Managed trigger macros call the module API instead of pasting trigger source. Sneak Attack adjacency is measured on the target token's scene. An older pasted compendium command is replaced on load.
- GM Settings can reorder specialty requests by dragging them. The order is saved for this world and used on the Roll Requests grid. Hidden requests keep their place, and the check builder stays where it is.
- Start Playlist opens its dialog above the tray, starts the chosen playlist at the chosen volume, and re-enables the button after success or failure. A playback error is shown as a Foundry notification.
- Set All Track Volumes stores the level on every PlaylistSound in every playlist, including stopped tracks and ambience, and on saved playback buttons. The current song changes immediately, and a playlist started afterward plays at that level.
- Roll Requests keeps the check builder on one row inside a card that matches the specialty cards. Each specialty card puts its selector, Blind roll, and dice button on one row under the title. Roll of Fate can choose the party or the selected tokens. GM Settings can hide each specialty for the current world.
- Macro pins show the icon on the left and the name on the right. Long names truncate with an ellipsis, and the full name is on hover. Dragging a pin reorders it and saves that order immediately without running the macro.
- Trigger cards use one header row for the name, scope, status icon, and play/pause control. When and Then sit tightly underneath, and each card is only as tall as that content. The Triggers tab no longer has a New Trigger button. Trigger behavior stays in module code.
