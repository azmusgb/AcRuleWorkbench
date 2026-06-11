const fs = require("fs");
const path = require("path");

async function main() {
  const { chromium } = require("playwright");

  const outDir = path.join(process.cwd(), "artifacts", "viewer-stability");
  fs.mkdirSync(outDir, { recursive: true });

  const url = process.argv[2] || "http://127.0.0.1:8787/viewer?nocache=stability-test";
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const events = [];
  const snapshots = [];

  function log(type, data = {}) {
    const row = { t: new Date().toISOString(), type, ...data };
    events.push(row);
    console.log(`[${type}]`, data);
  }

  page.on("console", msg => {
    log("console", { level: msg.type(), text: msg.text().slice(0, 500) });
  });

  page.on("pageerror", err => {
    log("pageerror", { message: err.message, stack: err.stack });
  });

  page.on("requestfailed", req => {
    log("requestfailed", {
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText
    });
  });

  page.on("response", res => {
    if (res.status() >= 400) {
      log("http-error", { status: res.status(), url: res.url() });
    }
  });

  page.on("framenavigated", frame => {
    if (frame === page.mainFrame()) {
      log("navigation", { url: frame.url() });
    }
  });

  async function snapshot(label) {
    const data = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0];
      const body = document.body;
      const diag = window.fwViewerDiagnostics?.();

      return {
        href: location.href,
        readyState: document.readyState,
        bodyTextLength: body?.innerText?.length || 0,
        bodyHtmlLength: body?.innerHTML?.length || 0,
        bodyChildren: body?.children?.length || 0,
        activeElement: document.activeElement?.tagName || null,
        title: document.title,
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
    console.log(`\n[SNAPSHOT:${label}]`);
    console.table(data.nav || {});
    console.log({
      href: data.href,
      readyState: data.readyState,
      bodyTextLength: data.bodyTextLength,
      bodyHtmlLength: data.bodyHtmlLength,
      bodyChildren: data.bodyChildren,
      bootState: data.bootState,
      fwdApiHydrationState: data.fwdApiHydrationState
    });

    return data;
  }

  log("goto", { url });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  await snapshot("after-load");

  // Watch body stability for 10 seconds.
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500);
    const s = await snapshot(`watch-${i + 1}`);
    if (s.bodyTextLength < 100 || s.bodyChildren === 0) {
      log("body-blank-detected", {
        label: `watch-${i + 1}`,
        bodyTextLength: s.bodyTextLength,
        bodyChildren: s.bodyChildren,
        href: s.href
      });
    }
  }

  // Click visible buttons/tabs/links one at a time and detect body blanking/navigation.
  const clickableCount = await page.locator('button:visible, [role="tab"]:visible, a[href]:visible').count();
  log("clickable-count", { clickableCount });

  const maxClicks = Math.min(clickableCount, 20);

  for (let i = 0; i < maxClicks; i++) {
    const loc = page.locator('button:visible, [role="tab"]:visible, a[href]:visible').nth(i);

    const label = await loc.evaluate(el => {
      return {
        tag: el.tagName,
        role: el.getAttribute("role"),
        text: (el.innerText || el.textContent || "").trim().slice(0, 120),
        href: el.getAttribute("href"),
        aria: el.getAttribute("aria-label"),
        id: el.id,
        cls: el.className
      };
    }).catch(() => null);

    if (!label) continue;

    log("click-before", { index: i, label });
    await snapshot(`before-click-${i}`);

    try {
      await loc.click({ timeout: 5000 });
    } catch (err) {
      log("click-failed", { index: i, label, message: err.message });
      continue;
    }

    await page.waitForTimeout(1000);
    const after = await snapshot(`after-click-${i}`);

    if (after.bodyTextLength < 100 || after.bodyChildren === 0) {
      log("body-blank-after-click", { index: i, label, after });
    }
  }

  const report = { url, events, snapshots };
  const reportPath = path.join(outDir, `viewer-stability-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`\n[COMPLETE] Stability report written: ${reportPath}`);
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
