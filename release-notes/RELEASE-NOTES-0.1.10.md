# Morelord Game Master 0.1.10

Released October 5, 2026.

- Add stopped-by-default **Critical Hit** and **Critical Fumble** triggers for character and NPC attack rolls. Native critical/fumble detection respects kept advantage/disadvantage dice and system critical thresholds; selected ranged/thrown attacks use the ranged table, and spell attacks use magic.
- Include all six **Critical Rolls** tables (60 results) from Morelord Compendium in **Game Master Roll Tables**. Results remain blind GM/Assistant-only chat cards, once per attack card; no world-table import or Morelord Compendium dependency is required.
- Upgrade existing global catalogs with only the two new stopped rules, preserving saved rules and states. Reuse Core services, trigger macro lifecycle, and card controls.
- Verification: 37 automated tests, the Core design-system scan, and six Dev1 live checks passed; all six installed tables, private results, duplicate prevention, and paused listeners are covered. Trigger cards were visually inspected.
- Give new critical-result chat cards a Core success/danger heading, attacker portrait/name, attack category, weapon/spell, and kept attack die so the reason for the table roll is clear. Preserve native table dice, results, and GM-only visibility; leave Dice So Nice settings unchanged.

Verified on Foundry VTT 14.368 and D&D5e 6.0.3 in Dev1. All 37 module tests, five release-synchronizer tests, the Core design-system scan, and six live checks passed. New result cards were visually inspected. Full player/theme/zoom coverage is not claimed.
