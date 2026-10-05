# Morelord Game Master 0.1.2

- Fix first installation showing only Volatile Magic: seed all six managed triggers, each stopped by default.
- Repair existing incomplete catalogs without changing existing IDs, enabled states, or custom bindings. Keep global settings shared across worlds and retain later explicit deletions.
- New programmatic trigger registrations also start stopped. Roll of Fate remains a one-shot macro.

Verification: 20 automated tests, including fresh-install defaults and the Volatile-only upgrade; repeatable Dev1 check in scripts/testing/default-triggers.mjs.

Live regression was skipped because the running world is not Dev1; no world was switched. Previously verified Foundry compatibility remains 14.368. This code-only release retains the previously verified pack databases.
