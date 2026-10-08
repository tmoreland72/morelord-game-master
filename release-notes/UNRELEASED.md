# Unreleased

- The open Game Master tray stays above the canvas and sidebars and below Foundry windows, so playlist, ambience, settings, and campaign dialogs, context menus, and the file picker remain clickable.
- A DC or Blind roll choice stays in place when chat, playlist, or player updates arrive while the tray is open.
- Successful tray actions use Foundry notifications.
- Playlist, ambience, Now Playing, and Set All Track Volumes share Foundry's volume curve. Saved percentages stay the same and are converted once.
- Trigger compendium macros call the module API instead of running a pasted copy of the trigger source. Roll of Fate calls `api.rollOfFate`. A ready GM replaces bundled macros that still contain the pasted source.
- Sneak Attack adjacency is measured on the token's scene, including when the GM is viewing a different scene.
