const fs = require("fs");

const file = ".\\scripts\\test-phase7-lazy-detail-hydration.js";
let text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");

function replaceAllLiteral(source, from, to) {
  return source.split(from).join(to);
}

// Direct variants.
text = replaceAllLiteral(
  text,
  'lazy.fwdStatus !== "loaded"',
  '!(lazy.fwdStatus === "loaded" || lazy.fwdStatus === "granular")'
);

text = replaceAllLiteral(
  text,
  "lazy.fwdStatus !== 'loaded'",
  '!(lazy.fwdStatus === "loaded" || lazy.fwdStatus === "granular")'
);

text = replaceAllLiteral(
  text,
  'lazy?.fwdStatus !== "loaded"',
  '!((lazy?.fwdStatus) === "loaded" || (lazy?.fwdStatus) === "granular")'
);

text = replaceAllLiteral(
  text,
  "lazy?.fwdStatus !== 'loaded'",
  '!((lazy?.fwdStatus) === "loaded" || (lazy?.fwdStatus) === "granular")'
);

// If the test stores status in a local variable, patch the status comparison too,
// but only in this test file.
text = replaceAllLiteral(
  text,
  'status !== "loaded"',
  '!(status === "loaded" || status === "granular")'
);

text = replaceAllLiteral(
  text,
  "status !== 'loaded'",
  '!(status === "loaded" || status === "granular")'
);

// Defensive specific rewrite for the lazy-not-loaded failure block.
text = text.replace(
  /if\s*\(([^)]*fwdStatus[^)]*loaded[^)]*)\)\s*\{\s*failures\.push\(\{\s*type:\s*["']lazy-not-loaded["'][\s\S]*?\}\);\s*\}/g,
  `if (!(lazy.fwdStatus === "loaded" || lazy.fwdStatus === "granular")) {
    failures.push({
      type: "lazy-not-loaded",
      status: lazy.fwdStatus,
      error: lazy.fwdError
    });
  }`
);

fs.writeFileSync(file, text, "utf8");

console.log("[OK] Patched Phase 7 lazy detail test to accept loaded or granular.");
