const fs = require("fs");
const path = require("path");

async function main() {
  const { chromium } = require("playwright");

  const root = process.cwd();
  const outDir = path.join(root, "artifacts", "viewer-stability");
  fs.mkdirSync(outDir, { recursive: true });

  const url = process.argv[2] || "http://127.0.0.1:8787/viewer?nocache=nav-stability-test";

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const events = [];
  const snapshots = [];

  function log(type, data = {}) {
    const row = { t: new Date().toISOString(), type, ...data };
    events.push(row);
    console.log(`[${type}]`, data);
  }

  page.on("console", msg => log("console", {
    level: msg.type(),
    text: msg.text().slice(0, 500)
  }));

  page.on("pageerror", err => log("pageerror", {
    message: err.message,
    stack: err.stack
  }));

  page.on("requestfailed", req => log("requestfailed", {
    url: req.url(),
    method: req.method(),
    failure: req.failure()?.errorText
  }));

  page.on("response", res => {
    if (res.status() >= 400) {
      log("http-error", { status: res.status(), url: res.url() });
    }
  });

  async function closeModalIfOpen() {
    await page.keyboard.press("Escape").catch(() => {});
    await page.evaluate(() => {
      const backdrop = document.querySelector("#modalBackdrop.open");
      if (backdrop) backdrop.click();

      const openBackdrop = document.querySelector("#modalBackdrop.open");
      if (openBackdrop) {
        openBackdrop.classList.remove("open");
        openBackdrop.setAttribute("aria-hidden", "true");
        openBackdrop.style.display = "none";
      }

      document.querySelectorAll(".modal.open, [role='dialog'].open, .help-modal.open")
        .forEach(el => {
          el.classList.remove("open");
          el.setAttribute("aria-hidden", "true");
          el.style.display = "none";
        });

      document.body?.classList?.remove("modal-open");
    }).catch(() => {});

    await page.waitForTimeout(150);
  }

  async function clickByCenterPoint(locator) {
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

  async function snapshot(label) {
    const data = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const diag = window.fwViewerDiagnostics?.();

      return {
        href: location.href,
        readyState: document.readyState,
        bodyTextLength: document.body?.innerText?.length || 0,
        bodyHtmlLength: document.body?.innerHTML?.length || 0,
        bodyChildren: document.body?.children?.length || 0,
        modalOpen: !!document.querySelector("#modalBackdrop.open"),
        bootState: diag?.bootState || null,
        fwdApiHydrationState: diag?.fwdApiHydrationState || null,
        payloadCounts: diag?.payloadCounts || null,
        modelCounts: diag?.modelCounts || null,
        nav: nav ? {
          domInteractive: Math.round(nav.domInteractive),
          domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
          loadEventEnd: Math.round(nav.loadEventEnd),
          transferSizeKb: Math.round((nav.transferSize || 0) / 1024),
          decodedBodyKb: Math.round((nav.decodedBodySize || 0) / 1024)
        } : null
      };
    });

    snapshots.push({ label, t: new Date().toISOString(), ...data });

    console.log(`\n[SNAPSHOT:${label}]`, {
      bodyTextLength: data.bodyTextLength,
      bodyHtmlLength: data.bodyHtmlLength,
      bodyChildren: data.bodyChildren,
      modalOpen: data.modalOpen,
      mode: data.fwdApiHydrationState?.mode,
      nav: data.nav
    });

    if (data.bodyTextLength < 100 || data.bodyChildren === 0) {
      log("body-blank-detected", {
        label,
        bodyTextLength: data.bodyTextLength,
        bodyChildren: data.bodyChildren,
        href: data.href
      });
    }

    return data;
  }

  const targets = [
    { name: "AC Rule List", selector: 'button[data-action="view-structure"]' },
    { name: "Rule Lists", selector: 'button[data-action="view-rule-lists"]' },
    { name: "UDFs", selector: 'button[data-action="view-udfs"]' },
    { name: "Functions", selector: 'button[data-action="view-functions"]' },
    { name: "Tables", selector: 'button[data-action="view-tables"]' },
    { name: "Selection Lists", selector: 'button[data-action="view-selection-lists"]' },
    { name: "Resources", selector: 'button[data-action="view-resources"]' },
    { name: "Drivers", selector: 'button[data-action="view-drivers"]' },
    { name: "Scope DentalADA", selector: 'button[data-scope="AC/Pages/DentalADA"]' },
    { name: "Scope General", selector: 'button[data-scope="AC/Pages/General"]' },
    { name: "Scope Dental_Doc", selector: 'button[data-scope="AC/Documents/Dental_Doc"]' },
    { name: "Scope DeltaCare_Doc", selector: 'button[data-scope="AC/Documents/DeltaCare_Doc"]' },
    { name: "Tab Overview", selector: '[role="tab"]:has-text("Overview")' },
    { name: "Tab Fields / Parameters", selector: '[role="tab"]:has-text("Fields / Parameters")' },
    { name: "Tab Raw", selector: '[role="tab"]:has-text("Raw")' }
  ];

  log("goto", { url });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1000);
  await closeModalIfOpen();
  await snapshot("after-load");

  for (const target of targets) {
    await closeModalIfOpen();

    const loc = page.locator(target.selector).first();
    const count = await loc.count().catch(() => 0);

    if (!count) {
      log("target-missing", target);
      continue;
    }

    const label = await loc.evaluate(el => ({
      tag: el.tagName,
      action: el.getAttribute("data-action"),
      scope: el.getAttribute("data-scope"),
      role: el.getAttribute("role"),
      text: (el.innerText || el.textContent || "").trim().slice(0, 160),
      aria: el.getAttribute("aria-label"),
      cls: el.className
    })).catch(() => null);

    log("click-before", { target, label });
    await snapshot(`before-${target.name}`);

    try {
      await clickByCenterPoint(loc);
    } catch (err) {
      log("click-failed", {
        target,
        label,
        message: err.message
      });
      continue;
    }

    await page.waitForTimeout(750);
    const after = await snapshot(`after-${target.name}`);

    if (after.modalOpen) {
      log("modal-open-after-click", { target, label });
    }
  }

  const reportPath = path.join(outDir, `viewer-nav-stability-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ url, events, snapshots }, null, 2), "utf8");

  console.log(`\n[COMPLETE] Stability report written: ${reportPath}`);

  const failed = events.filter(e =>
    e.type === "body-blank-detected" ||
    e.type === "click-failed" ||
    e.type === "pageerror"
  );

  console.log(`\n[SUMMARY] failures: ${failed.length}`);
  for (const f of failed) {
    console.log(`[FAIL] ${f.type}`, f.target || f.label || f.message || f);
  }

  await browser.close();

  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
