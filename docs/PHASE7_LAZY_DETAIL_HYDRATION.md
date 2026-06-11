# Phase 7 Lazy Detail Hydration — Implementation Notes

## Problem

The boot-sidecar path makes initial load fast, but resource workspaces remain partial because full sidecar hydration was disabled to prevent whole-body repaint and unstable UX.

Known partial areas before this phase:

- Rule Lists
- SelectionLists
- Resources
- Drivers
- Tables
- UDF count/detail completeness

## Design

Add a targeted lazy loader:

- Load the fast boot model first.
- When a detail workspace is opened, check whether the current model has enough rows.
- If not, fetch `ac-rule-viewer.fwd.json` once.
- Apply it to `fwdData` / `fwdSidecarData`.
- Rebuild the model once.
- Clear derived caches.
- Render the selected workspace.

## Added runtime API

```js
window.fwViewerLazyHydrationState()
```

Returns:

```js
{
  fwdStatus: 'none' | 'loading' | 'loaded' | 'failed',
  fwdLoadedAtUtc: string,
  fwdElapsedMs: number,
  fwdError: string | null,
  pendingWorkspace: string,
  pendingReason: string,
  hydratedWorkspaces: string[]
}
```

## Runtime diagnostics added

```text
lazy-static-fwd-start
lazy-static-fwd-applied
lazy-static-fwd-failed
```

## Workspace hook

The workspace navigation branch in `70-actions-commands.js` now calls:

```js
maybeHydrateWorkspaceOnDemand(state.workspaceView, act)
```

before `renderAll()`.

When it returns `true`, the lazy loader owns the immediate loading state and re-renders once hydration completes.

## Safety

The lazy loader is idempotent:

- It will not fetch if the full FWD detail is already loaded.
- It will not start parallel duplicate FWD loads.
- It will not re-render a workspace that the user has already navigated away from.
- It records diagnostics instead of silently failing.
