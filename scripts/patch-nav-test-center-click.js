const fs = require("fs");

const file = ".\\scripts\\test-viewer-nav-stability.js";
let text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");

if (!text.includes("async function clickByCenterPoint")) {
  text = text.replace(
    "async function snapshot(label) {",
`async function clickByCenterPoint(locator) {
    const handle = await locator.elementHandle();
    if (!handle) throw new Error("No element handle for click target.");

    await handle.evaluate(el => {
      el.scrollIntoView({ block: "center", inline: "center" });
    });

    await page.waitForTimeout(100);

    const box = await locator.boundingBox();
    if (!box) throw new Error("No bounding box for click target.");

    await page.mouse.click(
      box.x + box.width / 2,
      box.y + box.height / 2
    );
  }

  async function snapshot(label) {`
  );
}

text = text.replace(
  /await loc\.click\(\{ timeout: 7000 \}\);/g,
  "await clickByCenterPoint(loc);"
);

fs.writeFileSync(file, text, "utf8");

console.log("[OK] Patched test-viewer-nav-stability.js to use center-point mouse clicks.");
console.log(text.includes("await clickByCenterPoint(loc);")
  ? "[OK] Replacement verified."
  : "[WARN] Replacement was not found after patch.");
