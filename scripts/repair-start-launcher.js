const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "scripts", "start-fw-editor-viewer.ps1");

if (!fs.existsSync(file)) {
  throw new Error(`Missing ${file}`);
}

function readText(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function writeText(file, text) {
  fs.writeFileSync(file, text.replace(/^\uFEFF/, ""), "utf8");
}

function findParamBlockEnd(text) {
  const paramIndex = text.search(/(^|\r?\n)\s*param\s*\(/i);
  if (paramIndex < 0) {
    throw new Error("Could not find param(...) block.");
  }

  const openIndex = text.indexOf("(", paramIndex);
  if (openIndex < 0) {
    throw new Error("Could not find opening parenthesis for param block.");
  }

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (ch === ">" && text[i - 1] === "#") inBlockComment = false;
      continue;
    }

    if (!inSingle && !inDouble) {
      if (ch === "#" && next === "<") {
        inBlockComment = true;
        i++;
        continue;
      }

      if (ch === "#") {
        inLineComment = true;
        continue;
      }
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (inSingle || inDouble) continue;

    if (ch === "(") depth++;
    if (ch === ")") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }

  throw new Error("Could not find end of param block.");
}

let text = readText(file).replace(/\r\n/g, "\n");

// Remove all prior bad LocalFast wait-mode patch blocks, wherever inserted.
text = text.replace(
  /\n?# LocalFast intentionally skips snapshot warm-up\.[\s\S]*?if \(\$ViewerMode -eq "LocalFast" -and \$OpenWaitMode -eq "ready"\) \{\s*\n\s*Write-Host "\[INFO\] LocalFast selected; changing open wait mode from ready to live because snapshot readiness is on-demand\." -ForegroundColor Yellow\s*\n\s*\$OpenWaitMode = "live"\s*\n\}\s*\n?/g,
  "\n"
);

// Remove same block if it was inserted at the very top without a leading newline.
text = text.replace(
  /^# LocalFast intentionally skips snapshot warm-up\.[\s\S]*?if \(\$ViewerMode -eq "LocalFast" -and \$OpenWaitMode -eq "ready"\) \{\s*\n\s*Write-Host "\[INFO\] LocalFast selected; changing open wait mode from ready to live because snapshot readiness is on-demand\." -ForegroundColor Yellow\s*\n\s*\$OpenWaitMode = "live"\s*\n\}\s*\n?/,
  ""
);

// Ensure file starts with comment, [CmdletBinding], or param after removing broken insertions.
const trimmedStart = text.replace(/^\s+/, "");
if (!/^(<#|#|\[CmdletBinding\(\)\]|param\s*\()/i.test(trimmedStart)) {
  throw new Error("Unexpected content before CmdletBinding/param after cleanup. Open the first 30 lines manually.");
}

const insert = `
# LocalFast intentionally skips snapshot warm-up. In that mode, ready health can
# remain 503 because full snapshot extraction is on-demand. Browser-open readiness
# should use live health so the viewer opens once the API listener/routes are available.
if ($ViewerMode -eq "LocalFast" -and $OpenWaitMode -eq "ready") {
    Write-Host "[INFO] LocalFast selected; changing open wait mode from ready to live because snapshot readiness is on-demand." -ForegroundColor Yellow
    $OpenWaitMode = "live"
}

`;

const paramEnd = findParamBlockEnd(text);
text = text.slice(0, paramEnd) + insert + text.slice(paramEnd);

writeText(file, text.replace(/\n/g, "\r\n"));

console.log("[OK] Repaired scripts/start-fw-editor-viewer.ps1 param/CmdletBinding placement.");
