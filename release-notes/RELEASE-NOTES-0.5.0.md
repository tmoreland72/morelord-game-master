# Morelord Game Master 0.5.0

## What Changed

### Added

- Treasure Hoard on Roll Requests asks one Player Settings character to roll a CR 0-4 or CR 5-10 hoard from the SRD 5.2.1 tables. The chat card is titled Roll for Treasure. The character rolls one step at a time on that same card: the d100, shown as Initial Roll, then that row's gems or art objects, then each magic item. A Rare row's Rare or Rare II choice is part of that item's roll. A row that lists nothing says No treasure. The card does not show table names, and it shows how many magic items the row calls for.
- Public and private hoards add each item to that character once. Coins on a row are one gp, sp, or cp total through Morelord Core. Private whispers the card to the character's owners and the GMs and hides it from other players. Treasure Hoard uses Private, not Blind roll. Each roll animates once and uses the character owner's dice.
- Spell scrolls are filled in only when Craftworks is active and its generator allows access. The magic item names are the SRD 5.2.1 names.

### Changed

- Skill checks, ability checks, saving throws, foraging, encounter checks, death saves, Delerium Search, Wild Magic checks, and Treasure Hoard steps use Morelord Core's shared roll-request card. Ammunition recovered uses Core's shared item card.
- Bulk coin splits and removals use Morelord Core's currency rates. The coins each character receives are unchanged.
- Requires Morelord Core 0.9.2 for shared currency, roll-request cards, and Treasure Hoard.
- Private Treasure Hoards keep their whisper through Core's `preserveMessageMode`. Hoard steps use `holdCompletion`, so a step does not flash Completed before the next roll. Treasure grants use Core's `inventory.addItems`.

### Fixed

- Bulk Action cards keep Apply beside the last control, including after Amount on the XP card. Help icons sit on the label line, so those labels line up with the others.
