const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
    const origin='https://hafize-ua.web.app';
    await page.goto(origin+'/');
    await page.locator('#messageInput').evaluate(box=>{box.value="250 TL’nin %18’i kaçtır?";box.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.match(await page.locator('#local-tool-suggestions output').textContent(),/≈ 45$/);
    // Exercise the shipped chat adapter without submitting a test conversation to the user's account.
    await page.route('**/calculation-transport-test',route=>route.fulfill({contentType:'text/html',body:'<script>window.fetch=async(_,init)=>new Response(init.body)</script><script type="module" src="/typed-build/analysis-draft.js"></script>'}));
    await page.goto(origin+'/calculation-transport-test');
    const send = text => page.evaluate(async value => {
      const response = await fetch('/api/chat',{method:'POST',body:JSON.stringify({messages:[{role:'user',content:value}]})});
      return (await response.json()).messages[0].content;
    },text);
    assert.match(await send('(5+3)*2'),/yerel hesap sonucu.*≈ 16/);
    assert.equal(await send('Bugün hava nasıl?'),'Bugün hava nasıl?');
    const revision=await page.evaluate(async()=>{
      const messages=[{role:'user',content:'Belediyeye otopark ışıkları için mail yaz.'},{role:'assistant',content:'Sayın yetkili, otopark aydınlatması hakkında yazıyorum.'},{role:'user',content:'Daha kısa yaz'}];
      return (await (await fetch('/api/chat',{method:'POST',body:JSON.stringify({messages})})).json()).messages;
    });
    assert.match(revision.at(-1).content,/hedef kitleyi/);
    assert.equal(revision[0].content,'Belediyeye otopark ışıkları için mail yaz.');
    const followup=async (history,question)=>page.evaluate(async ({history,question})=>{
      const messages=history.flatMap(text=>[{role:'user',content:text},{role:'assistant',content:'Önceki yanıt'}]);
      messages.push({role:'user',content:question});
      const response=await fetch('/api/chat',{method:'POST',body:JSON.stringify({messages})});
      return (await response.json()).messages.at(-1).content;
    },{history,question});
    assert.match(await followup(["250 TL’nin %18’i kaçtır?"],"Peki ya %20’si?"),/250 × 20 \/ 100 ≈ 50/);
    assert.match(await followup(["250 TL’nin %18’i kaçtır?"],"Sonucun %20’si?"),/45 × 20 \/ 100 ≈ 9/);
    assert.equal(await followup(["Ankara hakkında konuşalım"],"Peki %10?"),"Peki %10?");
    await page.goto(origin+'/');
    await page.locator('#messageInput').evaluate(box=>{box.value='Deney kaydını doğrula';box.dispatchEvent(new Event('input',{bubbles:true}));});
    const suggestion=page.locator('#local-tool-suggestions a').first();
    assert.equal(await suggestion.getAttribute('href'),'/task-plan.html#experiment-file');
    // Verify the deployed module on a fixture with the same message/composer markup.
    // The production sign-in screen stays intact; no account or real conversation is needed.
    await page.route('**/quote-browser-test',route=>route.fulfill({contentType:'text/html',body:'<section id="messages"></section><form id="composer"><textarea id="messageInput"></textarea></form><script type="module" src="/typed-build/analysis-draft.js"></script>'}));
    await page.goto(origin+'/quote-browser-test');
    await page.evaluate(()=>{
      const message=document.createElement('article');message.className='message assistant';
      const content=document.createElement('div');content.className='content';content.textContent='P5 aydınlatması';
      message.append(content);document.querySelector('#messages').append(message);
      const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(content);
      selection.removeAllRanges();selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.locator('#quote-chat-selection').click();
    assert.match(await page.locator('#messageInput').inputValue(),/> P5 aydınlatması/);
    await page.goto('https://weight-space06.web.app/lab.html');
    await page.locator('#experiment button').click();
    const points=page.locator('#learning-curve tr');
    assert.equal(await points.count(),5);
    assert.equal(await points.last().locator('td').first().textContent(),'20');
    assert.ok(Number(await points.last().locator('td').last().textContent()) < Number(await points.first().locator('td').last().textContent()));
    await page.goto(origin+'/file-analysis.html');
    await page.locator('#upload').setInputFiles({name:'ilceler.csv',mimeType:'text/csv',buffer:Buffer.from('İlçe;Bedel\nÇankaya;10,5\nÇankaya;4,5\nSincan;boş')});
    await page.waitForFunction(()=>document.querySelector('#source').value.includes('Çankaya'));
    await page.click('#analyze');
    await page.click('#calc');
    const first=page.locator('#output tbody tr').first();
    assert.deepEqual(await first.locator('td').allTextContents(),['Çankaya','2','15','7,5']);
    assert.match(await page.locator('#status').innerText(),/1 boş/);
    const pending=page.waitForEvent('download');
    await page.click('#download');
    const saved=await pending;
    const report=JSON.parse(require('node:fs').readFileSync(await saved.path(),'utf8'));
    assert.deepEqual(report.rows[0],['Çankaya','2','15','7,5']);
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
