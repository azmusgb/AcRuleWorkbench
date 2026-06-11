const fs = require("fs");

const file = ".\\scripts\\test-phase7-lazy-detail-hydration.js";
let text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");

text = text.replace(
  /lazy\.fwdStatus\s*!==\s*["']loaded["']/g,
  '!(lazy.fwdStatus === "loaded" || lazy.fwdStatus === "granular")'
);

text = text.replace(
  /status:\s*lazy\.fwdStatus/g,
  'status: lazy.fwdStatus'
);

fs.writeFileSync(file, text, "utf8");

console.log("[OK] Phase 7 regression test now accepts Phase 8 granular lazy mode.");
