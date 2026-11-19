const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
    const origin='https://hafize-ua.web.app';
    await page.goto(origin+'/file-analysis.html');
    await page.locator('#upload').setInputFiles({name:'ilceler.csv',mimeType:'text/csv',buffer:Buffer.from('İlçe;Bedel\nÇankaya;10,5\nÇankaya;4,5\nSincan;boş')});
    await page.waitForFunction(()=>document.querySelector('#source').value.includes('Çankaya'));
    await page.click('#analyze');
    await page.click('#calc');
    const first=page.locator('#output tbody tr').first();
    assert.deepEqual(await first.locator('td').allTextContents(),['Çankaya','2','15','7,5']);
    assert.match(await page.locator('#status').innerText(),/1 boş/);
    await page.click('#chat');
    await page.waitForFunction(()=>document.querySelector('#messageInput')?.value.includes('Çankaya'));
    await page.goto(origin+'/file-analysis.html');
    await page.selectOption('#kind','diff');
    await page.fill('#source','--- a/app.ts\n+++ b/app.ts\n@@ -1 +1 @@\n-old\n+// TODO verify');
    await page.click('#analyze');
    assert.deepEqual(await page.locator('#output tbody tr td').allTextContents(),['app.ts','1','1','L1 // TODO verify']);
    console.log('CSV totals, ignored values, chat draft and patch line numbers verified on the live site.');
  } finally { await browser.close(); }
})().catch(err=>{ console.error(err); process.exitCode=1; });
