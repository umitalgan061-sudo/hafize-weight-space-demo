const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
  const origin='https://hafize-ua.web.app';
  await page.addInitScript(()=>{
    window.tracks=[]; window.recognitions=[]; window.frames=[];window.speech=[];
    window.SpeechRecognition=class {
      start(){window.recognitions.push(this);this.onstart?.();}
      abort(){} stop(){this.onend?.();}
    };
    Object.defineProperty(navigator.mediaDevices,'enumerateDevices',{value:async()=>['user','environment'].map(deviceId=>({deviceId,kind:'videoinput'}))});
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async constraints=>{
      const mode=constraints.video.facingMode.exact || constraints.video.facingMode.ideal;
      if(window.rejectDual && constraints.video.facingMode.exact)throw new Error('Busy');
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
      const ctx=canvas.getContext('2d');ctx.fillStyle=mode==='environment'?'#f00':'#00f';ctx.fillRect(0,0,320,240);
      const stream=canvas.captureStream(10),track=stream.getVideoTracks()[0];
      Object.defineProperty(track,'getSettings',{value:()=>({facingMode:mode,deviceId:mode})});
      const timer=setInterval(()=>{if(track.readyState==='ended')clearInterval(timer);else ctx.fillRect(0,0,320,240);},60);
      window.tracks.push(track);return stream;
    }});
    window.HafizeAuth={fetch:async(path,init)=>{
      if(path==='/api/screen/frame')window.frames.push(JSON.parse(init.body));
      return new Response('{}',{status:200});
    }};
    document.addEventListener('hafize:voice-output-speak',e=>window.speech.push(e.detail.text));
  });
  await page.route('**/camera-conversation-test',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="tr"><link rel="stylesheet" href="/voice-mode.css"><body><form id="composer"><textarea id="messageInput"></textarea><button type="button" id="micBtn">Ses</button><button type="button" id="liveScreenBtn">Ekran</button><button type="button" id="liveCameraBtn">Kamera</button></form><div id="messages"></div><div id="toast"></div><script type="module" src="/typed-build/live-screen.js"></script><script type="module" src="/typed-build/voice-mode.js"></script></body></html>`}));
  await page.goto(origin+'/camera-conversation-test');
  await page.evaluate(()=>document.querySelector('#composer').addEventListener('submit',async e=>{
    e.preventDefault();const box=document.querySelector('#messageInput');box.disabled=true;
    await window.HafizeLiveScreen.beforeSend(box.value);
    const reply=document.createElement('article');reply.className='message assistant';reply.innerHTML='<div class="content">Kameralar açık.</div>';
    document.querySelector('#messages').append(reply);box.disabled=false;
  }));
  await page.click('#liveCameraBtn');
  const autoTalk = page.getByLabel('Kamerayı açınca sesli sohbeti başlat');
  assert.equal(await autoTalk.isChecked(), false);
  await autoTalk.check();
  await page.getByRole('button',{name:'Sesli sohbete geç'}).click();
  await page.waitForSelector('.voice-mode .live-screen-chip video');
  await page.waitForFunction(()=>window.frames.length>0);
  await page.locator('[data-second-camera]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.vm-camera-host video')[1]?.videoWidth>0);
  await page.evaluate(()=>{const rec=window.recognitions.at(-1);rec.onresult({results:[Object.assign([{transcript:'Kamerada ne var?'}],{isFinal:true})]});rec.onend();});
  await page.waitForFunction(()=>window.frames.some(f=>f.question==='Kamerada ne var?'));
  const pixels=await page.evaluate(async()=>{
    const img=await createImageBitmap(await (await fetch(window.frames.find(f=>f.question).data)).blob());
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
    return [0.25,0.75].map(x=>Array.from(ctx.getImageData(c.width*x,c.height/2,1,1).data));
  });
  assert.ok(pixels[0][0]>230 && pixels[1][2]>230);
  await page.waitForFunction(()=>window.speech.some(text=>text.includes('Kameralar açık')));
  await page.locator('[data-second-camera]').click();
  await page.evaluate(()=>{window.rejectDual=true});
  await page.locator('[data-second-camera]').click();
  await page.waitForFunction(()=>document.querySelector('.live-screen-text').textContent.includes('birlikte açılamadı'));
  await page.getByRole('button',{name:'Ön ve arka kamera arasında geçiş yap'}).click();
  await page.waitForFunction(()=>document.querySelector('.vm-camera-host video')?.srcObject?.getVideoTracks()[0]?.getSettings().facingMode==='user');
  await page.click('.vm-close');
  assert.ok(await page.evaluate(()=>window.tracks.every(t=>t.readyState==='ended')));
  await page.reload();
  await page.click('#liveCameraBtn');
  await page.waitForSelector('.voice-mode .live-screen-chip video');
  await page.waitForFunction(() => window.recognitions.length > 0);
  await page.evaluate(() => {
    const recognized = window.recognitions.at(-1);
    window.submittedGreetings = 0;
    document.querySelector('#composer').addEventListener('submit', () => window.submittedGreetings++);
    const result = Object.assign([{transcript:'Naber?'}], {isFinal:true});
    recognized.onresult({results:[result]});
    recognized.onend();
  });
  assert.deepEqual(await page.evaluate(() => [window.speech, window.submittedGreetings]),
    [['İyiyim, sen nasılsın?'], 0]);
  await page.evaluate(() => {
    const source = 'voice-output';
    const state = speaking => document.dispatchEvent(new CustomEvent('hafize:voice-output-state', {
      detail: {source, speaking, origin: 'voice-mode'}
    }));
    state(true);
    state(false);
  });
  await page.waitForFunction(() => window.recognitions.length > 1);
  await autoTalk.uncheck();
  await page.click('.vm-close');
  await page.click('#liveCameraBtn');
  await page.getByRole('button', {name:'Sesli sohbete geç'}).waitFor();
  assert.equal(await page.locator('.voice-mode').isVisible(), false);
  const result = await page.evaluate(async () => {
    const voice = await import('/typed-build/voice-output.js');
    const line = 'Dr. Ece bugün %15,5 dedi. Sonra ' + 'konuşmaya devam etti, '.repeat(8) + 'sen nasılsın?';
    const chunks = voice.splitSpeechText(line, 80);
    const voices = ['Yelda', 'Yelda (Enhanced)'].map(name => ({lang:'tr-TR', name, voiceURI:name}));
    return [chunks.join(' '), voice.normalizeSpeechText(line), chunks[0], voice.pickTurkishVoice(voices).name, voice.pickTurkishVoice(voices,'Yelda').name];
  });
  assert.equal(result[0], result[1]);
  assert.equal(result[2], 'Doktor Ece bugün yüzde 15,5 dedi.');
  assert.deepEqual(result.slice(3), ['Yelda (Enhanced)', 'Yelda']);
  console.log('Published camera and voice modules passed the synthetic two-camera, transcript, spoken-reply event, fallback, flip and cleanup checks.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
