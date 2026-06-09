# TODO - FW Editor Viewer fixes

## 1) Fix pane resizing bug
- [ ] Locate resize wiring + `applyPaneLayout()` + `inspector-open` sync logic in `ac-rule-viewer.js`
- [ ] Make resize drag state update both pane widths and inspector-open class deterministically
- [ ] Ensure persisted widths restore correctly and do not get overridden by auto layout
- [ ] Add small guard to avoid repeated `applyPaneLayout()` during pointermove causing class/state churn

## 2) Improve tree performance
- [ ] Identify expensive calls during typing/filter updates (`visibleStructureRows()`, cache invalidation)
- [ ] Add debounce for `state.query`/`state.treeFilter` changes
- [ ] Ensure visible rows calculation is done once per render and reused
- [ ] Verify cache keys include only the needed state (scopeId, expanded, collapsed, etc.)

## 3) Add new tree filter mode
- [ ] Choose mode name: `missing-refs`
- [ ] Implement logic in `passesTreeFilter()` and corresponding UI select/toolbar
- [ ] Ensure diagnostics/unresolved mapping exists to drive the filter
- [ ] Add empty-state messaging for when no matches

## 4) Adjust dark mode/layout
- [ ] Verify theme toggle sets `document.documentElement[data-theme]`
- [ ] Remove/avoid CSS overrides that conflict with intended dark variables for shell/panes/inspector
- [ ] Confirm in `ac-rule-viewer.css` that dark theme surfaces apply consistently

## Validation
- [ ] Run viewer (open `ac-rule-viewer.html`) and smoke-test: resize panes, typing filter, switching modes, theme toggle
- [ ] Confirm inspector opens/closes correctly after resize
- [ ] Confirm no console errors during search/filter interactions

