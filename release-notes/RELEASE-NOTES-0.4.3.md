# Morelord Game Master 0.4.3

## What Changed

### Fixed

- The tray stays in place when another module renders a window, including FA Battlemaps. The tray reads that window's real element, including a jQuery collection or a list of elements. A window that is still rendering, or whose element is missing or not an element, is skipped, and that window's own render still finishes.
