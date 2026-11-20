const {webkit} = require('playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage({isMobile:true, hasTouch:true, viewport:{width:390,height:844}, serviceWorkers:'block'});
    page.on('console', m => { if (['warning','error'].includes(m.type())) console.error(m.text().slice(0,400)); });
    page.on('pageerror', e => console.error(e.message));
    await page.route('**/mobile-voice-test', route => route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="tr"><div class="settings-workspace"></div><button data-voice-toggle="output"></button><div id="toast"></div><script type="module" src="/typed-build/voice-output.js"></script><script type="module" src="/typed-build/voice-settings.js"></script></html>`}));
    for (const module of ['voice-output','voice-settings','supertonic-worker']) {
      await page.route('**/typed-build/'+module+'.js', route => route.fulfill({path:'assets/typed-build/'+module+'.js',contentType:'text/javascript'}));
    }
    await page.addInitScript(() => {
      window.started = 0; window.nativeWords = [];
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = async function() {
        await play.call(this);
        if (this.duration > 0.15 && this.src.startsWith('blob:')) window.started++;
      };
      const speak = speechSynthesis.speak.bind(speechSynthesis);
      speechSynthesis.speak = u => { if(u.text.trim())window.nativeWords.push(u.text); return speak(u); };
    });
    await page.goto('https://hafize-ua.web.app/mobile-voice-test');
    for(const name of ['dfki','Supertonic 3']){
      const row = page.locator('.voice-row').filter({has:page.getByText(name,{exact:true})});
      await row.getByRole('button',{name:/İndir/}).tap();
      await row.getByRole('button',{name:'Seç',exact:true}).waitFor({timeout:180000});
      await row.getByRole('button',{name:'Seç',exact:true}).tap();
      if(name==='Supertonic 3') await row.getByRole('combobox').selectOption('5');
      const before = await page.evaluate(()=>window.started);
      await row.getByRole('button',{name:/Dinle/}).tap();
      await page.waitForFunction(n=>window.started>n,before,{timeout:120000});
      assert.deepEqual(await page.evaluate(()=>window.nativeWords),[]);
      await page.evaluate(()=>document.dispatchEvent(new Event('hafize:voice-output-stop')));
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});