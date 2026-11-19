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
  console.log('Published camera and voice modules passed the synthetic two-camera, transcript, spoken-reply event, fallback, flip and cleanup checks.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
