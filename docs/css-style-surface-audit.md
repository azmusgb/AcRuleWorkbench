# CSS and Inline Style Surface Audit

Reviewed build: `v103-fw-editor-viewer`

This audit covers every source-clean `.html`, `.css`, and `.js` file that can affect the FW Editor Viewer, API harness, historical design previews, static tests, and browser fixtures.

## Summary

| Surface | Result |
|---|---:|
| HTML files reviewed | 8 |
| CSS files reviewed | 12 |
| JS files reviewed for generated inline styles | 27 |
| `<style>` blocks in HTML | 0 |
| Inline `style=` attributes in HTML | 0 |
| Generated inline `style=` attributes in viewer JS | 0 |
| DOM `.style` / `setAttribute('style')` mutations in app JS | 0 |
| Active viewer `!important` declarations | 2000 |
| Total `!important` declarations across duplicated/source CSS surfaces | 10093 |

## Decisions

- Active HTML files stay structural only. No embedded `<style>` blocks and no inline `style=` attributes are allowed.
- Dynamic viewer layout values now use bounded CSS classes rather than generated inline style attributes.
- Tree depth, meter width, editor pane size, shell pane width, and clipboard fallback positioning are handled through audited CSS classes.
- The remaining `!important` declarations are accounted for as legacy compatibility debt in layered CSS. The active viewer bundle is capped by static tests at `<= 2000`.
- `src/viewer/ac-rule-viewer.css`, root `ac-rule-viewer.css`, `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css`, and `AcRuleWorkbench.Core/Viewer/ac-viewer-template.css` must stay byte-identical.

## Enforced by tests

Run:

```powershell
npm test
```

The command now includes:

```text
node tests/static/style-surfaces.static.test.js
```

That test fails if active HTML reintroduces style blocks, inline style attributes, generated inline style strings, DOM inline style mutation, unsynchronized viewer CSS, or unaudited `!important` growth.
