# Workbench Motion System

## Decision

The FormWorks Editor Viewer remains a static HTML/CSS/JavaScript application hosted by the existing .NET Framework/x86 runtime. React, Tailwind, Magic UI, and Motion Primitives were not added because doing so would introduce a second application framework and a new build/runtime dependency solely for visual effects.

The implementation instead applies the useful parts of those systems as a small internal **Workbench Motion** layer built on:

- Existing viewer design tokens
- CSS transitions and keyframes
- The browser Web Animations API
- `MutationObserver` for dynamically rendered viewer surfaces
- `prefers-reduced-motion` for accessibility

No external package or CDN is required.

## Motion principles

Motion must communicate state, hierarchy, or continuity. It must not compete with rules, diagnostics, warnings, evidence, or selection.

The layer currently provides:

1. **Initial shell reveal** — top bar and panes enter with a restrained stagger.
2. **Dynamic content reveal** — content, navigation, tabs, view bars, search results, and inspector updates receive a short transition after DOM replacement.
3. **Selection emphasis** — newly active rules, navigation rows, and tabs receive one bounded focus-ring pulse.
4. **Inspector continuity** — opening the details pane uses a short horizontal entrance.
5. **Modal continuity** — the help dialog animates only when visibility changes from closed to open.
6. **Status emphasis** — status text changes receive one short scale/fade response.

## Performance safeguards

- Motion is skipped when Web Animations is unavailable.
- Motion is disabled when the user requests reduced motion.
- Only the first 10 direct children of a refreshed surface are staggered.
- Repeated updates are coalesced into one animation frame.
- A prior animation on the same element is cancelled before a replacement begins.
- Modal and status effects are edge-triggered to prevent observer retrigger loops.

## Source ownership

The canonical implementation is:

```text
src/viewer/ac-rule-viewer.html
```

The following runtime copies must remain byte-for-byte identical:

```text
AcRuleWorkbench.Core/Viewer/ac-rule-viewer.html
AcRuleWorkbench.Core/Viewer/ac-viewer-template.html
```

The static contract test enforces this boundary.

## Validation

Run from the repository root:

```powershell
npm run test:viewer
npm run lint:viewer
npm run test:browser
```

Manual checks:

1. Open the viewer with normal motion enabled.
2. Navigate between FWD scopes and resource workspaces.
3. Select rules and Action Lists and confirm the details pane opens without layout instability.
4. Open and close Help repeatedly and confirm it animates once per opening.
5. Change the operating-system reduced-motion preference and confirm decorative transitions stop.
6. Confirm keyboard focus indicators remain visible throughout.

## Extension rule

Add motion only when it explains an application event. New effects must be tokenized, bounded, reduced-motion safe, and covered by a static or browser contract. Promotional effects such as particles, cursor trails, rainbow borders, and perpetual animated backgrounds remain out of scope.
