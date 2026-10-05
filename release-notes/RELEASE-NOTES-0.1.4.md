# Morelord Game Master 0.1.4

- Remove the unconfigured “Configured character” template from the default trigger control panel and clean it up on upgrade.
- Preserve configured item-use triggers and the Item Use macro in the compendium. The five built-in triggers still start stopped.

Automated migration tests cover removal and preservation of configured rules. Live verification remains limited to Dev1; the shared defaultTriggersCheck includes this regression.

- Match the tray tab to the control panel’s transparency using Core’s shared tray-handle component, with an up/down chevron reflecting its closed/open state.

Requires Core 0.3.13 for the shared tray surface. Rendered tab backgrounds and both arrow states passed isolated-browser checks with Foundry and Core styles. Live Foundry verification was skipped because TestA is active.
