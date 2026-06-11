const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const url = process.argv[2] || "http://127.0.0.1:8787/viewer?nocache=phase7-lazy";
const outDir = path.join(process.cwd(), "artifacts", "viewer-stability");
fs.mkdirSync(outDir, { recursive: true });

const events = [];

function log(type, value) {
  const entry = { type, utc: new Date().toISOString(), ...(value || {}) };
  events.push(entry);
  console.log(`[${type}]`, value || {});
}

function isAcceptableLazyStatus(status) {
  return status === "loaded" || status === "granular";
}

async function clickByCenterPoint(page, selector, label) {
  log("click", { label, selector });

  const loc = page.locator(selector).first();
  await loc.waitFor({ state: "visible", timeout: 15000 });

  const handle = await loc.elementHandle();
  if (!handle) {
    throw new Error(`No element handle for ${label}`);
  }

  await handle.evaluate(el => {
    el.scrollIntoView({ block: "center", inline: "center" });
  });

  await page.waitForTimeout(100);

  const box = await loc.boundingBox();
  if (!box) {
    throw new Error(`No bounding box for ${label}`);
  }

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function waitForLazyHydration(page, label) {
  await page.waitForFunction(() => {
    const lazy = window.fwViewerLazyHydrationState?.();
    const diag = window.fwViewerDiagnostics?.();

    const statusOk =
      lazy?.fwdStatus === "loaded" ||
      lazy?.fwdStatus === "granular" ||
      lazy?.fwdStatus === "failed";

    const modeOk = /lazy-fwd/.test(diag?.fwdApiHydrationState?.mode || "");

    return statusOk || modeOk;
  }, { timeout: 30000 }).catch(() => {
    log("lazy-wait-timeout", { label });
  });

  await page.waitForTimeout(250);
}

async function snapshot(page, label) {
  const snap = await page.evaluate(() => {
    const lazy = window.fwViewerLazyHydrationState?.() || {};
    const diag = window.fwViewerDiagnostics?.() || {};

    return {
      workspaceView: document.body?.dataset?.workspaceView || "",
      bodyTextLength: document.body?.innerText?.length || 0,
      lazy,
      payloadCounts: diag.payloadCounts || {},
      hydration: diag.fwdApiHydrationState || {}
    };
  });

  console.log(`\n[SNAPSHOT:${label}]`, snap);
  events.push({ type: "snapshot", label, utc: new Date().toISOString(), data: snap });

  if (snap.bodyTextLength < 200) {
    events.push({
      type: "body-blank-detected",
      label,
      bodyTextLength: snap.bodyTextLength
    });
  }

  return snap;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  page.on("console", msg => {
    console.log("[console]", { level: msg.type(), text: msg.text() });
  });

  page.on("pageerror", err => {
    log("pageerror", { message: err.message, stack: err.stack });
  });

  page.on("requestfailed", req => {
    log("requestfailed", {
      url: req.url(),
      failure: req.failure()?.errorText || ""
    });
  });

  page.on("response", res => {
    if (res.status() >= 400 && !/favicon/i.test(res.url())) {
      log("http-error", { url: res.url(), status: res.status() });
    }
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);

  await snapshot(page, "after-load");

  const targets = [
    ["UDFs", 'button[data-action="view-udfs"]'],
    ["Rule Lists", 'button[data-action="view-rule-lists"]'],
    ["Tables", 'button[data-action="view-tables"]'],
    ["Selection Lists", 'button[data-action="view-selection-lists"]'],
    ["Resources", 'button[data-action="view-resources"]'],
    ["Drivers", 'button[data-action="view-drivers"]']
  ];

  for (const [label, selector] of targets) {
    try {
      await clickByCenterPoint(page, selector, label);
      await waitForLazyHydration(page, label);
      await snapshot(page, `after-${label}`);
    } catch (err) {
      log("click-failed", { label, selector, message: err.message });
    }
  }

  const final = await snapshot(page, "final");

  const failures = events.filter(e =>
    e.type === "body-blank-detected" ||
    e.type === "pageerror" ||
    e.type === "click-failed" ||
    e.type === "requestfailed" ||
    (e.type === "http-error" && !/favicon/i.test(e.url || ""))
  );

  const finalStatus = final.lazy?.fwdStatus || "";
  const finalMode = final.hydration?.mode || "";

  if (!isAcceptableLazyStatus(finalStatus) && !/lazy-fwd/.test(finalMode)) {
    failures.push({
      type: "lazy-not-loaded",
      status: finalStatus,
      mode: finalMode,
      error: final.lazy?.fwdError || null
    });
  }

  const reportPath = path.join(outDir, `phase7-lazy-detail-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    url,
    events,
    final,
    failures
  }, null, 2), "utf8");

  console.log(`\n[COMPLETE] Phase 7 lazy detail report written: ${reportPath}`);
  console.log(`\n[SUMMARY] failures: ${failures.length}`);

  for (const failure of failures) {
    console.log("[FAIL]", failure);
  }

  await browser.close();

  if (failures.length > 0) {
    process.exitCode = 1;
  }
})().catch(err => {
  console.error("[FATAL]", err);
  process.exitCode = 1;
});