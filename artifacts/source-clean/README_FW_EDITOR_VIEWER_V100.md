# FW Editor Viewer v101

Live-lazy body bootstrap fix. The hosted viewer now rejects empty JSON sidecar fallbacks and calls `/api/v1/viewer/bootstrap` to render a lightweight FWD catalog immediately when the full static sidecars are absent or stale. Full snapshot/resource hydration remains on demand.

## Key changes

- Added `/api/v1/viewer/bootstrap`.
- Live session cache now retains document/page/batch/process names.
- Viewer bootstrap detects empty `{}` sidecar responses and falls back to hosted live-lazy bootstrap.
- Static tests guard the no-blank-body live-lazy path.
