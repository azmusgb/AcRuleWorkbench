# FW Companion FAQ

## What is FW Companion?

FW Companion is a read-only browser companion for FormWorks/FWD configuration. It helps inspect documents, pages, fields, Rule Lists, UDFs, tables, SelectionLists, functions, drivers, and resources without opening FW Editor for every lookup.

## Does it replace FW Editor?

No. FW Editor remains the system of record for authoring, editing, testing, and saving FWD changes.

## Can it edit rules, UDFs, tables, or fields?

No. Edit, save, add, delete, move, rename, enable, and disable writeback behavior is intentionally out of scope.

## Does it execute AC rules?

No. FW Companion reads static FWD configuration. It can show how rules, status results, action lists, fields, attributes, UDFs, and tables are configured, but it does not run AC Rules Tester and does not prove runtime claim outcomes.

## What should I inspect first on a rule?

Use this order:

1. Rule name and scope
2. Function and function type
3. Fields / Parameters
4. Attributes
5. Status Results / Actions
6. Parent Rule / Sub-list path
7. References
8. Reader Status
9. Raw, only when the formatted view needs confirmation

## What are Additional Rules?

Additional Rules are rules that were loaded from the rule inventory when exact Rule List / Action List placement could not be confirmed. They remain searchable and inspectable, but they should not be treated as confirmed parent/action order.

## Is Reader Status an error panel?

No. Reader Status is a secondary status area. It explains load/read messages that may affect interpretation. It should not dominate normal rule inspection.

## What does Partial mean?

Partial means the companion loaded useful configuration but some placement or detail could not be fully confirmed. In that case, the viewer keeps available rules visible under Additional Rules and shows a Reader Status message.

## What is Raw for?

Raw is the final confirmation layer. Use it when a formatted view looks incomplete, confusing, or inconsistent. Do not use Raw as the default workflow.

## What vocabulary should the UI and docs use?

Use FW Editor vocabulary:

- Rule List
- Rule
- Parent Rule
- Status Result
- Action List
- Sub-list
- Fields / Parameters
- Attributes
- UDF
- Table / SelectionList
- Reader Status

Avoid making parser/extraction terminology part of the normal product experience.

## Why is the viewer desktop-first?

FWD rule inspection is dense. FW Companion is optimized for desktop use with keyboard-friendly navigation, resizable panes, and scrollable configuration windows.

## Why are some internal names still `AcRuleWorkbench` or `start-workbench`?

Those are compatibility names in the codebase and scripts. The user-facing product direction is FW Companion.

## What should I send to someone else when asking about a rule?

Copy the selected configuration summary and include:

- scope
- rule name
- function
- fields/parameters
- attributes
- status actions
- whether it appears under a normal Rule List or Additional Rules
- any Reader Status message

Do not state that a branch executed unless you also have runtime/test evidence.
