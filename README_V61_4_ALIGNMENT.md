# v61.4 Alignment Review

## Current documentation authority

For current FormWorks Editor, AC function, UDF, SelectionList/table, project-code, and Editor-gap interpretation, use `README.md`, `docs/formworks-editor-ac-reference-guide.md`, `docs/project-code-catalog.md`, and `docs/editor-gap-closure-plan.md`. This file is a historical alignment note.

AC Rule Workbench is aligned as a read-only FW Editor companion for AC-related FWD configuration.

## Product boundary

- FW Editor remains the authoring, editing, testing, and saving tool.
- AC Rule Workbench is a read-only FWD configuration viewer.
- The viewer presents pages, documents, rule scopes, global definitions, UDFs, tables, drivers, rule parameters, actions, references, and raw extracted configuration.
- Enhanced functions are search, navigation, list/detail inspection, UDF caller navigation, and field-catalog matching.

## Removed from product language

The user-facing viewer now avoids diagnostic-dashboard framing, source-authority badges, scoring language, and analysis features that do not belong in a read-only FW Editor companion.

## Notes

Some internal compatibility endpoints and DTO fields may still carry historic names where renaming them would break existing API callers. User-facing labels and OpenAPI descriptions have been reframed around read-only FWD configuration.
