# Morelord Game Master 0.1.8

## Improvements

- Resize the bottom-centered panel to 65% of viewport width and 75% of viewport height.
- Keep the panel above other Foundry windows.
- Make the panel and handle backgrounds fully opaque using Morelord Core's shared window opacity control. Requires Core 0.4.1 or newer.

## Verification

35 automated module checks and five release-workflow checks passed. Core's 68 automated checks and the design-system boundary check passed. Live Dev1 verification on Foundry 14.368 / D&D5e 6.0.3 passed all 15 checks across 1280×850, 1920×1080, and 700×600 viewports; screenshots were inspected. The broader mocked browser harness remains blocked by an existing roll-summary fixture mismatch; its panel sizing checks passed before that failure. Existing published compendium databases are retained; live compaction files and unrelated local test artifacts are excluded.
