export default [
  {
    files: ["ac-rule-viewer.js", "src/viewer/**/*.js", "AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        window: "readonly", document: "readonly", console: "readonly", fetch: "readonly", AbortController: "readonly", URLSearchParams: "readonly", URL: "readonly", Blob: "readonly", navigator: "readonly", localStorage: "readonly", setTimeout: "readonly", clearTimeout: "readonly", confirm: "readonly", alert: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-redeclare": "error"
    }
  }
];
