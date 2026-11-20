// Publish only selected frontend assets, retaining the live site's API adapter and Hosting rules.
const fs = require('node:fs');
const { gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { getAccessToken } = require('firebase-tools/lib/apiv2');
const site = 'sites/hafize-ua';
const origin = 'https://hafize-ua.web.app';
const base = 'https://firebasehosting.googleapis.com/v1beta1/';
const sum = bytes => createHash('sha256').update(bytes).digest('hex');

async function api(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method, headers: { Authorization: 'Bearer ' + await getAccessToken(), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) throw Error(method + ' ' + path.split('?')[0] + ' HTTP ' + response.status + ': ' + (await response.text()).slice(0,350));
  return response.json();
}

async function liveRelease() {
  const data = await api(site + '/channels/live/releases?pageSize=1');
  const release = data.releases?.[0];
  if (!release?.version?.name) throw Error('Active version missing');
  return release;
}
async function publicBytes(path) {
  const response = await fetch(origin + path + '?releaseCheck=' + Date.now(), { redirect:'error' });
  if (!response.ok) throw Error('Live read failed: ' + path);
  return Buffer.from(await response.arrayBuffer());
}

async function publish() {
  await requireAuth({project:'projelerim-8fecd'});
  const release = await liveRelease();
  const previous = release.version.name.replace(/^projects\/[^/]+\//, '');
  const version = await api(previous);
  const files = Object.create(null);
  let token = '';
  do {
    const listing = await api(previous + '/files?pageSize=1000&pageToken=' + encodeURIComponent(token));
    for (const file of listing.files || []) files[file.path] = file.hash;
    token = listing.nextPageToken;
  } while (token);
  if (!files['/index.html'] || !files['/hafize-uyum.js'] || Object.keys(files).length !== Number(version.fileCount)) throw Error('Incomplete live manifest');
  const original = (await publicBytes('/index.html')).toString('utf8');
  const anchor = '<div class="sidebar-footer">';
  if (original.split(anchor).length !== 2) throw Error('Unexpected navigation layout');
  let html = original;
  const additions = [];
  for (const [url,title] of [['/file-analysis.html','CSV ve kod değişikliklerini incele'],['/task-plan.html','Görev planını denetle'],['/studio.html','Ses ve montaj stüdyosu'],['https://weight-space06.web.app/lab.html','Ağırlık laboratuvarı']]) {
    if (!html.includes('href="'+url+'"')) additions.push('<a class="soft-btn" href="'+url+'">'+title+'</a>');
  }
  html = html.replace(anchor, anchor+'\n'+additions.join('\n'));
  if (!html.includes('src="/typed-build/analysis-draft.js"')) {
    if (!html.includes('</body>')) throw Error('Missing page body');
    html = html.replace('</body>', '<script type="module" src="/typed-build/analysis-draft.js"></script></body>');
  }
  const overlay = new Map([['/index.html',Buffer.from(html)]]);
  for (const path of ['typed-build/supertonic-worker.js','typed-build/voice-settings.js','typed-build/voice-output.js','typed-build/live-screen.js','typed-build/voice-mode.js','voice-mode.css','file-analysis.html','typed-build/file-analysis.js','typed-build/analysis-draft.js','task-plan.html','studio.html','studio.css','typed-build/task-plan.js','typed-build/studio.js']) {
    overlay.set('/'+path,fs.readFileSync('assets/'+path));
  }
  const uploads = new Map();
  for (const [path,bytes] of overlay) {
    const compressed = gzipSync(bytes), hash = sum(compressed);
    files[path] = hash; uploads.set(hash,compressed);
  }
  const draft = await api(site+'/versions','POST',{ config:version.config || {} });
  const name = draft.name.replace(/^projects\/[^/]+\//,'');
  const entries = Object.entries(files);
  for (let start=0;start<entries.length;start+=800) {
    const data = await api(name+':populateFiles','POST',{files:Object.fromEntries(entries.slice(start,start+800))});
    for (const hash of data.uploadRequiredHashes || []) {
      if (!uploads.has(hash)) throw Error('Existing asset unavailable; original release remains active');
      const url = new URL(data.uploadUrl+'/'+hash);
      if (url.origin !== 'https://upload-firebasehosting.googleapis.com') throw Error('Unexpected upload origin');
      const response = await fetch(url,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+await getAccessToken(),'Content-Type':'application/octet-stream'},body:uploads.get(hash)});
      if (!response.ok) throw Error('File upload failed '+response.status);
    }
  }
  await api(name+'?updateMask=status','PATCH',{status:'FINALIZED'});
  if ((await liveRelease()).name !== release.name) throw Error('Live version changed during deployment');
  await api(site+'/releases?versionName='+encodeURIComponent(name),'POST',{message:'Hafize planner and studio '+process.env.GITHUB_SHA});
  for (const [path,bytes] of overlay) {
    let ok=false;
    for(let retry=0;retry<5 && !ok;retry++) {
      ok=(await publicBytes(path)).equals(bytes);
      if(!ok) await new Promise(done=>setTimeout(done,3000));
    }
    if(!ok) throw Error('Live bytes differ: '+path);
  }
  console.log('Verified '+origin+' frontend release '+name);
}
publish().catch(error=>{console.error(error.message);process.exitCode=1});
