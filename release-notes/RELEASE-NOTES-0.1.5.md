# Morelord Game Master 0.1.5

- Volatile Magic now requests a d4 and rolls its table only on a 1. It ignores prior progression counters; Wild Magic retains its escalating d20.
- All GM clients load the shared trigger catalog on startup, including when another GM is already connected. Empty catalogs recover the five built-ins stopped by default.
- Preserve configured triggers, saved rolls, private outcomes, and existing character data.

Automated regressions cover d4 results 1–4, no progression, both shared-catalog startup paths, and existing Wild Magic behavior. Dev1-only live regressions are provided in scripts/testing/macro-triggers.mjs and scripts/testing/default-triggers.mjs.

All 21 automated tests and the Core design-system check pass. Live verification was skipped because Lost Mine of Phandelver (Tuesdays), not Dev1, is active.
