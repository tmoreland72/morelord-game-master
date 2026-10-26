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
- Preserve the bottom tray. Tabs are Roll Requests, Bulk Actions, Macros, Sound, Triggers, GM Settings, and Player Settings. Roll Requests keeps the check builder on one row, then shows enabled specialty requests as compact cards in a grid. There are no section or column headers.
- The check builder stays on one line inside a card with the same border, background, and padding as the specialty cards: type, skill or ability, optional DC, who rolls, Blind roll when it can be private, and the dice button. Specialty cards place the request name above one row: the selector fills the remaining space, then Blind roll, then the dice button. Roll of Fate has no blind toggle, so its row is Who rolls and the dice button. Delerium Search keeps the Craftworks search-area selector and the showDeleriumSearch world toggle.
- Roll Requests, Macros, and Triggers have no outer surface frame.
- Per-world GM toggles live on the GM Settings tray tab. Specialty request visibility is set there and stored as world settings, defaulting on so an upgrade hides nothing. Dragging a GM Settings row saves that world's card order; hidden requests keep their place. Ambience and other module configuration stay in Foundry Game Settings. Ambience is a list of source folders a GM can add or remove with the folder FilePicker. The list starts empty. A previous single folder is copied once only when that saved value has a path. The Game Master settings dialog stays non-modal so the browser can be used. A missing starting folder opens the browser at the data root, and the chosen folder is added to the list before Save. Each folder is scanned recursively, and its FilePicker source is kept. A missing or invalid folder is skipped, with a console warning and one notice. Saved ambience buttons store full file paths.
- Sound actions use full-width Core buttons. Saved sound buttons use Core trash-icon deletion controls.
- Starting music stops other music first and uses native shuffle; ambience remains separate. Start Playlist starts the chosen playlist at the dialog volume. The tray stays above the canvas and Foundry windows, and a rebuild keeps in-progress fields. Opening Foundry Game Settings closes the tray, including this module's Configure menu. The handle opens it again. Sound levels use Foundry's volume curve.
- Skill, ability, save, foraging, and death-save chat cards show a single Roll button. That button uses the dnd5e native roll, including the system's roll dialog and automatic modifiers.
- Delerium Search reuses Craftworks rules and rewards with Game Master's chat UI.
- Blind death saves keep sheet counters unchanged; public death saves retain native updates.

- Derive saved sound labels from playlist and file names.
- Call for Roll actions are not saved buttons; save all control changes immediately for next time. Encounter dice use a dropdown.
- Create skill summaries only after every roll card exists; retain averages for single-player checks.
- Delerium summaries have no average; reuse Craftworks rewards/encounters and expose their actions.
- Macros follows Bulk Actions, starts empty, and accepts dragged macros without a ten-slot limit.
- Triggers use native spell provenance and qualifying Sneak Attack hits, with once-per-turn damage. Managed macros call the module API. Sneak Attack adjacency is measured on the target token's scene.

- Foraging reuses Journeys terrain/DC configuration and food rules, with chat requests and complete-only summaries respecting visibility.
- Macro pins are compact rows: the icon is on the left and the name is on the right. Long names truncate with an ellipsis, and the full name is available on hover. Left click executes. Dragging a pin reorders it and saves that order immediately for the world; the drag does not execute the macro. Dropping a new macro still pins it. The native right-click menu removes only the pin.
- The Triggers tab does not create triggers. Trigger behavior stays in module code. The tray can enable, pause, and show each trigger.
- Sorcerer triggers request a blind d20 first; threshold starts at 1, increases per missed d20, and resets after a surge table roll.

- Wild Magic and Sneak Attack triggers match class/subclass/feature identifiers, not named characters. Surge thresholds and once-per-turn Sneak Attack limits are separate per character. Preserve existing rule IDs and counters.

- Trigger timing: Wild Magic waits for the spell attack roll, or casting completion when no attack is required; Sneak Attack waits for the linked weapon damage card. Do not trigger on the initial usage/attack card.
- Give every popup form a distinct stable ID so Core retains its size independently.

Roll Requests uses one check builder and a card grid for each enabled specialty: Encounter Check, Delerium Search, Foraging Check, Death Save, and Roll of Fate. The grid is three columns when the tray is wide, two when it is medium, and one when it is very narrow. Hidden specialties leave the grid without an empty cell. Encounter uses the die dropdown. Delerium Search uses the Craftworks search area. Roll of Fate chooses among the Player Settings party or the selected character tokens. Blind roll defaults off for unconfigured private cards; saved choices remain sticky.

Trigger cards are only as tall as their content. The header is one row: name, scope, status icon, and play/pause. When and Then sit tightly under that row. The status icon shows Running or Stopped; the card does not repeat that word. Icons have tooltips and accessible labels. Edit and Delete stay hidden.

All roll-request cards are public, including Wild Magic d20 requests; assigned-player/GM roll permissions still apply. Blind results and summaries remain private. Pending legacy request cards are made public when their active GM loads the module. Wild Magic never waits for optional damage; Sneak Attack still waits for weapon damage.

- Before any in-Foundry testing, verify the loaded world ID is `dev1` (Dev1). If another world is loaded, or its identity cannot be verified, skip all in-Foundry testing without switching worlds. An explicit user instruction to skip testing takes precedence even in Dev1.

- Trigger definitions are global across worlds on the same Foundry installation. Macros, saved roll requests, sound buttons, and remembered options are world-specific.
- World Clock defaults to 10 game minutes per real minute; game pause and started combat suspend its timer. Defer combat time and add 6 seconds per round on combat end without double-counting native advancement. Preserve manual calendar adjustments. Hex-map timing is future work.

- Keep per-version release notes in `release-notes/`. Put temporary scripts, staging folders, browser profiles, and other working files in the owning module's `/tmp/` directory; ignore `/tmp/` in Git and exclude it from release archives. Preserve permanent source, documentation, and regression evidence.

- Bulk Actions uses the Player Settings scope for coins, XP, inspiration, and prototype token sync. The menu order is Coins, XP, then Inspiration and Prototype Token Sync side by side in one compact card row, then Undo Last Action. That shared row uses the specialty-card grid and becomes two columns once the tray is wide enough for two cards. Coin and XP splits give the entire remainder to one random party member: leftover copper for coins, leftover XP for experience. Giving an amount to each member adds the full amount to everyone. Coin removal spends personal currency first, then the shared D&D5e Party/Group purse, and reports any unpaid deficit without negative balances. Inspiration grants or clears Heroic Inspiration. Prototype Token Sync copies the current scene token onto the prototype token and skips characters with no placed token. Undo Last Action restores only the latest bulk action from its world setting. Every applied operation posts a standard public Core chat card.

## Releases and documentation

- Every release maintains the cumulative root `CHANGELOG.md` (newest version first, `#`/`##`/`###` headings with spaces after `#`, `- ` bullets, no `---` horizontal rules) alongside `release-notes/RELEASE-NOTES-<version>.md`.
- `release-notes/` is export-ignored, so the installed module gets the changelog from `./CHANGELOG.md`. Keep that file at the repository root. A legacy `release-notes/<version>.md` note is included when `RELEASE-NOTES-<version>.md` is absent.
- Regenerate `CHANGELOG.md` with `node scripts/changelog.cjs` after editing release notes. `node scripts/changelog.cjs --check` verifies it. The manifest release sync refuses to publish when those notes exist and `CHANGELOG.md` is stale. Omit `## Verification` and other internal test sections from the cumulative file.
