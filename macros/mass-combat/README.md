# Mass Combat

GM macros for selecting attackers, selecting targets, and resolving a group of ordinary attacks quickly. Uses one shared attack profile, d20 attack rolls, fixed average damage, and focus fire. Requires Morelord Core, Game Master, and D&D5e 6.0.3+.

1. Select the living attackers on the map. Run **Mass Combat — Select Attackers**.
2. Select the living opposing tokens. Run **Mass Combat — Attack Targets**. Review attack bonus, attacks per troop, average normal/critical damage, damage type, and normal/advantage/disadvantage. Expand Target order to inspect the order. Resolve attacks.
3. Read the GM-only chat card for hits, casualties, and remaining HP. Run **Mass Combat — Apply Damage** when ready. Only HP and temporary HP are changed; tokens stay on the map. The macro does not apply Dead effects or mark combatants defeated. Independently configured system/module automation may still react to HP changes.

Repeat step 2 with new target selections to keep using the same attackers. Step 1 changes the attacking group. Rerunning Attack Targets while a result is pending offers Apply or Discard; it never silently rerolls. Your attacker selection, profile, and pending message survive refresh, scoped to your user in this world.

The first available simple attack on the first attacker supplies editable suggestions. **All troops in a batch use the entered profile:** use separate batches for different weapons/modifiers. Complex or multi-type damage may require manual entries or separate batches. Set attacks per troop explicitly for multiattack. Automatic situational attack modifiers are not evaluated; include them in the entered bonus/mode. Native critical dice provide a suggested average critical value, which can be adjusted for house rules.

Each attack checks the current focus target's AC. Natural 1 misses; natural 20 hits using the entered average critical damage. A killing blow's excess damage is lost. Subsequent attacks move to the next listed target. An immune target can therefore absorb all remaining attacks without damage; change target selection if the troops should change tactics. Attacks stop once every target falls.

The native D&D5e calculator determines each target's per-hit resistance, immunity, vulnerability, damage reduction, and threshold. The magical checkbox supplies the magical weapon property. Temporary HP is spent before HP. Shared linked target actors are rejected when selected more than once; troop tokens should have independent HP. Apply checks that HP and defenses still match the preview and otherwise asks for a new resolution. Interrupted application can resume without double damage when HP still matches the expected before/after values; discarding an interrupted batch keeps damage already applied.

This is a mass-combat shortcut for ordinary attacks. Range, line of sight, cover, ammunition/resources, on-hit riders, survival traits, reactions, concentration checks per hit, and weapon mastery remain GM-controlled. Damage is committed per target as a batch. Use one GM/browser to resolve a given group at a time; overlapping batches from different GMs are not a supported workflow.

## Import and verification

The three JSON files contain native script macros; import each through a Macro's **Import Data** command, then drag into Game Master's Macros tab. They use installed Core/Game Master utilities and do not require the new source file on the running server. Build them with `node tools/build-mass-combat.mjs`.

Run `node --test tests/mass-combat.test.mjs`. `node tools/verify-smithy.mjs --mass-test` is restricted to the explicitly user-authorized Drakkenheim world and Chuck GM, tests in a disposable copy of The Scar, cleans up its tokens/actors/chat/combat, and installs the macros only after passing. It never applies damage to the campaign scene. Do not run during a session. The saved live report records exact versions and results.

Verification: all 32 module Node checks and the design-system boundary check passed. Four live checks passed on Foundry 14.368 / D&D5e 6.0.3 for 20 remembered attackers, native resistance/immunity, unchanged HP during preview, stale-preview rejection, HP/temporary-HP application, and repeated Apply protection. Disposable documents were cleaned up; the campaign scene retained its 49 tokens. A separate non-damaging check executed the installed native macros, verified the remembered attack profile and pins, and inspected 540px/380px forms. Core supplies form/card/identity styling, user filtering, and serialization. Full light-theme/zoom testing and arbitrary third-party combat automation are not covered.
