# Configuration

## Recommended defaults

```json
{
  "server": {
    "urls": ["http://127.0.0.1:8787"],
    "enableDebugApi": false,
    "allowPathQuery": false,
    "enableCors": false
  },
  "formworks": {
    "defaultFwdPath": "C:\\rri\\ddce\\configs\\Server\\R1\\fwd\\fwd.cfd",
    "defaultProcessName": "AC",
    "requireNativeRuntime": true
  },
  "snapshot": {
    "cacheEnabled": true,
    "refreshOnStartup": true,
    "maskSensitiveValues": true
  }
}
```

The current CLI accepts these behaviors as flags. Keep production startup scripts explicit rather than relying on request-level path overrides.
