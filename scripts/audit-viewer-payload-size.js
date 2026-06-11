const fs = require("fs");

const files = [
  "ac-rule-viewer.tree.json",
  "ac-rule-viewer.rel.json",
  "ac-rule-viewer.rules.json",
  "ac-rule-viewer.fwd.json"
];

function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}

function sizeOf(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function getArrays(root, prefix = "") {
  const found = [];

  if (Array.isArray(root)) {
    found.push([prefix || "(root)", root]);
    return found;
  }

  if (!root || typeof root !== "object") {
    return found;
  }

  for (const [key, value] of Object.entries(root)) {
    const name = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      found.push([name, value]);
    } else if (value && typeof value === "object") {
      found.push(...getArrays(value, name));
    }
  }

  return found;
}

function summarizeArray(name, arr) {
  console.log(`\n${name}`);
  console.log("-".repeat(name.length));
  console.log(`items: ${arr.length}`);

  if (!arr.length) return;

  const fieldSizes = new Map();
  const sampleCount = Math.min(arr.length, 1000);

  for (const item of arr.slice(0, sampleCount)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;

    for (const key of Object.keys(item)) {
      const bytes = sizeOf(item[key]);
      fieldSizes.set(key, (fieldSizes.get(key) || 0) + bytes);
    }
  }

  const rows = [...fieldSizes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([key, bytes]) => ({
      field: key,
      sampledKb: Math.round(bytes / 1024),
      projectedMb: Number(((bytes / sampleCount) * arr.length / 1024 / 1024).toFixed(2))
    }));

  console.table(rows);
}

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`\nMISSING: ${file}`);
    continue;
  }

  const rawWithBom = fs.readFileSync(file, "utf8");
  const raw = stripBom(rawWithBom);
  const json = JSON.parse(raw);

  console.log(`\n\nFILE: ${file}`);
  console.log("=".repeat(`FILE: ${file}`.length));
  console.log(`MB: ${(Buffer.byteLength(raw, "utf8") / 1024 / 1024).toFixed(2)}`);
  console.log(`BOM: ${rawWithBom.charCodeAt(0) === 0xFEFF ? "yes" : "no"}`);
  console.log(`top-level keys: ${Object.keys(json).join(", ")}`);

  const arrays = getArrays(json);

  if (!arrays.length) {
    console.log("No arrays found.");
    continue;
  }

  arrays
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12)
    .forEach(([name, arr]) => summarizeArray(name, arr));
}
