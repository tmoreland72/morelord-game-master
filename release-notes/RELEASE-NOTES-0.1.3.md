# Morelord Game Master 0.1.3

- Require Core 0.3.12, which fixes the missing public runSerialized socket method in Core 0.3.11.
- Saved-roll results can finish through the corrected Core API. Existing roll records and trigger settings are preserved.

This release changes dependency metadata and its error message only. Game Master regression tests pass; live testing was skipped because TestA, not Dev1, is active.
