# Morelord Game Master

Follow `../morelord-core/AGENTS.md`, `../morelord-core/MORELORD-BRAND-GUIDE.md`,
and `../morelord-core/IN-GAME-TESTING.md` before changing this module.

- Morelord Core is required. Reuse its UI, participation, user filtering, skill
  rolls, and contextual socket service; do not recreate these locally.
- Configure participants on the Player Settings tab. Party requests, selected-token requests, and single-character checks use this shared scope.
- Requests stay in chat, never player popup dialogs. Eligible online players may
  roll their characters. Any GM may roll for anyone, including inactive players.
- The check builder and each private specialty request have a saved Blind roll toggle. Roll of Fate stays public and has no blind toggle. Blind results and summaries are GM/Assistant-only; non-blind results are public. Never return private totals in request flags or acknowledgements.
- Show check results only as chat cards, never in the Game Master tray.
- Preserve the bottom tray. Tabs are Roll Requests, Macros, Sound, Triggers, Campaign AI, GM Settings, and Player Settings. Roll Requests is the check builder followed by one specialty row per enabled request, with no section or column headers.
- Every roll request in the tray uses one shared row and stays on one line: its selector or selectors, the Blind roll toggle when the request can be private, and the dice request button. The builder's selectors are type, skill or ability, optional DC, and who rolls.
- Roll Requests, Macros, and Triggers have no outer surface frame.
- Per-world GM toggles live on the GM Settings tray tab. Specialty request visibility is set there and stored as world settings, defaulting on so an upgrade hides nothing. Ambience, the Campaign AI companion, and other module configuration stay in Foundry Game Settings.
- Sound actions use full-width Core buttons. Saved sound buttons use Core trash-icon deletion controls.
- Starting music stops other music first and uses native shuffle; ambience remains separate.
- Skill chat controls use DIS / Roll / ADV; normal Roll preserves automatic system modifiers.
- Delerium Search reuses Craftworks rules and rewards with Game Master's chat UI.
- Blind death saves keep sheet counters unchanged; public death saves retain native updates.

- Derive saved sound labels from playlist and file names.
- Call for Roll actions are not saved buttons; save all control changes immediately for next time. Encounter dice use a dropdown.
- Create skill summaries only after every roll card exists; retain averages for single-player checks.
- Delerium summaries have no average; reuse Craftworks rewards/encounters and expose their actions.
- Macros follows Roll Requests, starts empty, and accepts dragged macros without a ten-slot limit.
- Triggers use native spell provenance and qualifying Sneak Attack hits, with once-per-turn damage.

- Foraging reuses Journeys terrain/DC configuration and food rules, with chat requests and complete-only summaries respecting visibility.
- Macro pins are compact rows: the icon is on the left and the name is on the right. Long names truncate with an ellipsis, and the full name is available on hover. Left click executes. Dragging a pin reorders it and saves that order immediately for the world; the drag does not execute the macro. Dropping a new macro still pins it. The native right-click menu removes only the pin.
- + New Trigger sits left-aligned outside the content section.
- Sorcerer triggers request a blind d20 first; threshold starts at 1, increases per missed d20, and resets after a surge table roll.

- Wild Magic and Sneak Attack triggers match class/subclass/feature identifiers, not named characters. Surge thresholds and once-per-turn Sneak Attack limits are separate per character. Preserve existing rule IDs and counters.

- Trigger timing: Wild Magic waits for the spell attack roll, or casting completion when no attack is required; Sneak Attack waits for the linked weapon damage card. Do not trigger on the initial usage/attack card.
- Give every popup form a distinct stable ID so Core retains its size independently.

Roll Requests uses one check builder and one row for each enabled specialty request: Encounter Check, Delerium Search, Foraging Check, Death Save, and Roll of Fate. Encounter uses the die dropdown. Blind roll defaults off for unconfigured rows; saved choices remain sticky.

Trigger cards are only as tall as their content. The header is one row: name, scope, status icon, and play/pause. When and Then sit tightly under that row. The status icon shows Running or Stopped; the card does not repeat that word. Icons have tooltips and accessible labels. Edit and Delete stay hidden.

All roll-request cards are public, including Wild Magic d20 requests; assigned-player/GM roll permissions still apply. Blind results and summaries remain private. Pending legacy request cards are made public when their active GM loads the module. Wild Magic never waits for optional damage; Sneak Attack still waits for weapon damage.

- Before any in-Foundry testing, verify the loaded world ID is `dev1` (Dev1). If another world is loaded, or its identity cannot be verified, skip all in-Foundry testing without switching worlds. An explicit user instruction to skip testing takes precedence even in Dev1.

- Trigger definitions are global across worlds on the same Foundry installation. Macros, saved roll requests, sound buttons, and remembered options are world-specific.
- World Clock defaults to 10 game minutes per real minute; game pause and started combat suspend its timer. Defer combat time and add 6 seconds per round on combat end without double-counting native advancement. Preserve manual calendar adjustments. Hex-map timing is future work.

- Keep release notes and changelogs in `release-notes/`. Put temporary scripts, staging folders, browser profiles, and other working files in the owning module's `/tmp/` directory; ignore `/tmp/` in Git and exclude it from release archives. Preserve permanent source, documentation, and regression evidence.
