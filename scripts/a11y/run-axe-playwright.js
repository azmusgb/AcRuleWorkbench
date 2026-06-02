const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('fs');
const path = require('path');

(async function(){
  const root = path.resolve(__dirname, '..', '..');
  const url = process.argv[2] || 'http://127.0.0.1:8787/';
  const out = path.resolve(__dirname, 'a11y-report.json');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  try{
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    const results = await new AxeBuilder({ page }).analyze();
    fs.writeFileSync(out, JSON.stringify(results, null, 2), 'utf8');
    console.log('Axe run complete. Report written to', out);
  }catch(e){
    console.error('Error running axe:', e);
    process.exitCode = 2;
  }finally{
    await browser.close();
  }
})();
