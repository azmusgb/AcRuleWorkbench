# Viewer module split plan

The shipped runtime still uses the bundled `ac-rule-viewer.js`. New logic should be moved here first, then bundled/synchronized into the runtime file.

Priority extraction order:
1. state and persisted settings
2. model indexes and search blobs
3. resource workspaces
4. UDF renderer
5. rule list / Action List renderer
6. rule property sheet
7. event/action command registry
