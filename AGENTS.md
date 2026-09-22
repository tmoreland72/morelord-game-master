# Morelord Game Master

Follow `../morelord-core/AGENTS.md`, `../morelord-core/MORELORD-BRAND-GUIDE.md`,
and `../morelord-core/IN-GAME-TESTING.md` before changing this module.

- Morelord Core is required. Reuse its UI, participation, user filtering, skill
  rolls, and contextual socket service; do not recreate these locally.
- Configure participants on the Player Settings tab. Party roll cards and saved group checks use this shared scope; single-character checks choose from it.
- Requests stay in chat, never player popup dialogs. Eligible online players may
  roll their characters. Any GM may roll for anyone, including inactive players.
- Each roll card has a saved Blind roll toggle. Blind results and summaries are GM/Assistant-only; non-blind results are public. Never return private totals in request flags or acknowledgements.
- Show check results only as chat cards, never in the Game Master tray.
- Preserve the bottom tray. Tabs are Roll Requests, Macros, Sound, Triggers, Campaign AI, and Player Settings. Roll Requests uses inline cards without section/column headers.
- Request cards show only the title, optional DC, and character roll controls.
- Roll Requests, Macros, and Triggers have no outer surface frame. Roll cards contain options, a blind toggle, and a bottom-right dice-icon action.
- Module settings belong in Foundry Game Settings, not the tray.
- Sound actions use full-width Core buttons. Saved roll cards use Core trash-icon deletion controls.
- Starting music stops other music first and uses native shuffle; ambience remains separate.
- Skill chat controls use DIS / Roll / ADV; normal Roll preserves automatic system modifiers.
- Delerium Search reuses Craftworks rules and rewards with Game Master's chat UI.
- Blind death saves keep sheet counters unchanged; public death saves retain native updates.

- Derive saved labels: skill for groups, skill - character for players, playlist/file names for sound.
- Call for Roll actions are not saved buttons; save all control changes immediately for next time. Encounter dice use a dropdown.
- Create skill summaries only after every roll card exists; retain averages for single-player checks.
- Delerium summaries have no average; reuse Craftworks rewards/encounters and expose their actions.
- Macros follows Roll Requests, starts empty, and accepts dragged macros without a ten-slot limit.
- Triggers use native spell provenance and qualifying Sneak Attack hits, with once-per-turn damage.

- Foraging reuses Journeys terrain/DC configuration and food rules, with chat requests and complete-only summaries respecting visibility.
- Macros are 50% larger than the native action bar, with twice the spacing and rounded-square shape: left click executes; native right-click menu removes only the pin.
- + New Trigger sits left-aligned outside the content section.
- Sorcerer triggers request a blind d20 first; threshold starts at 1, increases per missed d20, and resets after a surge table roll.

- Wild Magic and Sneak Attack triggers match class/subclass/feature identifiers, not named characters. Surge thresholds and once-per-turn Sneak Attack limits are separate per character. Preserve existing rule IDs and counters.

- Trigger timing: Wild Magic waits for the spell attack roll, or casting completion when no attack is required; Sneak Attack waits for the linked weapon damage card. Do not trigger on the initial usage/attack card.
- Give every popup form a distinct stable ID so Core retains its size independently.

Roll cards use three independent columns: encounter/search/foraging/death on the left, group checks in the middle, and player checks on the right. Cards retain their own heights. Labels use Encounter Check, Foraging Check, and saved labels such as Stealth Check or Persuasion Check - Daludriel. Blind roll defaults off for unconfigured cards; saved choices remain sticky.

Trigger cards place status, enable/pause, edit, and delete icons in a bottom-aligned footer. Icons have tooltips and accessible labels.

All roll-request cards are public, including Wild Magic d20 requests; assigned-player/GM roll permissions still apply. Blind results and summaries remain private. Pending legacy request cards are made public when their active GM loads the module. Wild Magic never waits for optional damage; Sneak Attack still waits for weapon damage.

- Before any in-Foundry testing, verify the loaded world ID is `dev1` (Dev1). If another world is loaded, or its identity cannot be verified, skip all in-Foundry testing without switching worlds. An explicit user instruction to skip testing takes precedence even in Dev1.

- Trigger definitions are global across worlds on the same Foundry installation. Macros, saved roll requests, sound buttons, and remembered options are world-specific.
- World Clock defaults to 10 game minutes per real minute; game pause and started combat suspend its timer. Defer combat time and add 6 seconds per round on combat end without double-counting native advancement. Preserve manual calendar adjustments. Hex-map timing is future work.
