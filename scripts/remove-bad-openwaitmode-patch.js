const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "scripts", "start-fw-editor-viewer.ps1");

if (!fs.existsSync(file)) {
  throw new Error("Missing scripts/start-fw-editor-viewer.ps1");
}

let text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");

// Remove the bad patch block that referenced non-existent $OpenWaitMode.
text = text.replace(
  /\r?\n?# LocalFast intentionally skips snapshot warm-up\.[\s\S]*?if \(\$ViewerMode -eq "LocalFast" -and \$OpenWaitMode -eq "ready"\) \{[\s\S]*?\$OpenWaitMode = "live"[\s\S]*?\}\r?\n?/g,
  "\r\n"
);

fs.writeFileSync(file, text.replace(/^\uFEFF/, ""), "utf8");

console.log("[OK] Removed bad OpenWaitMode block from launcher.");
