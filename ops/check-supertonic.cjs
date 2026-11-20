const { chromium } = require('playwright-core');
(async () => {
 const browser = await chromium.launch({channel:'chrome',headless:true});
 try {
  const page = await browser.newPage({serviceWorkers:'block'});
  page.on('pageerror',e=>console.error(e.message));
  page.on('requestfailed',r=>console.error(new URL(r.url()).pathname,r.failure().errorText));
  await page.route('**/speech-pack-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Ses testi</title>'}));
  await page.route('**/voice-test-lib.js',r=>r.fulfill({path:'voice-test-lib.js',contentType:'text/javascript'}));
  await page.route('**/typed-build/supertonic-worker.js',r=>r.fulfill({path:'assets/typed-build/supertonic-worker.js',contentType:'text/javascript'}));
  await page.goto('https://hafize-ua.web.app/speech-pack-test');
  await page.evaluate(async()=>{
    const lib=await import('/voice-test-lib.js');
    const voice=await lib.findVoice('piper:tr-supertonic3');
    if(voice?.speakers!==10)throw Error('Ten speakers expected');
    await lib.downloadVoice(voice,()=>{});
    if(!await lib.isDownloaded(voice))throw Error('Download marker missing');
    for(const speaker of [0,5]){
      const {pcm,sampleRate}=await lib.synthesize(voice,speaker,'Merhaba Ümit.',1);
      if(pcm.length<sampleRate/5 || !pcm.some(x=>Math.abs(x)>0.01))throw Error('No audible signal');
    }
    await lib.removeVoice(voice);
    if(await lib.isDownloaded(voice))throw Error('Delete failed');
  });
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});