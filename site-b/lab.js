const train = [[-2,0],[0,1],[1,2],[2,-1],[-1,-2],[3,1]];
const holdout = [[1,-1],[-3,2],[2,2],[0,-2]];
const label = ([x,y]) => 2*x - 3*y + 1;
const predict = ([a,b,c],[x,y]) => a*x + b*y + c;
const loss = (w, data) => data.reduce((sum,row) => sum + (predict(w,row)-label(row))**2,0)/data.length;

function fit(initial, rate, epochs) {
  let w = [...initial];
  for (let i=0; i<epochs; i++) {
    const gradient = [0,0,0];
    for (const row of train) {
      const error = predict(w,row)-label(row);
      [...row,1].forEach((x,j) => { gradient[j] += 2*error*x/train.length; });
    }
    w = w.map((v,j) => v-rate*gradient[j]);
  }
  return w;
}
const el = id => document.getElementById(id);
let current = [0,0,0];
let candidate = null;
const history = [];
const audit = [];
function log(action, data) {
  audit.push({action, time:new Date().toISOString(), ...data});
  el('export').disabled = false;
  saveSession();
}
function invalidate() { candidate = null; el('apply').disabled = true; }
el('experiment').addEventListener('input', invalidate);
el('experiment').onsubmit = event => {
  event.preventDefault();
  invalidate();
  const rate = el('rate').valueAsNumber;
  const epochs = el('epochs').valueAsNumber;
  if (!(rate>=0.001 && rate<=2 && Number.isInteger(epochs) && epochs>=1 && epochs<=200)) return;
  const weights = fit(current,rate,epochs);
  const before = loss(current,holdout), after = loss(weights,holdout);
  const improved = Number.isFinite(after) && after < before;
  if (improved) candidate = weights;
  el('apply').disabled = !improved;
  el('result').textContent = ['Önceki hata: '+before.toPrecision(6),'Aday hatası: '+after.toPrecision(6),'Aday ağırlıkları: '+weights.map(x=>x.toPrecision(5)).join(', '), improved?'Hata azaldı. Aday kabul edilebilir.':'Hata azalmadı. Aday uygulanamaz.'].join('\n');
  log('evaluate',{rate,epochs,initial:[...current],weights,before,after,improved,trainingRows:train.length,validationRows:holdout.length});
};
el('apply').onclick = () => {
  if (!candidate) return;
  history.push(current); current = candidate; invalidate(); el('undo').disabled=false;
  el('result').textContent += '\nAday bu oturumda etkin.';
  log('accept',{weights:current});
};
el('undo').onclick = () => {
  if (!history.length) return;
  current = history.pop(); invalidate(); el('undo').disabled = !history.length;
  el('result').textContent = 'Önceki ağırlıklar geri yüklendi. Hata: '+loss(current,holdout).toPrecision(6);
  log('rollback',{weights:current});
};
el('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({model:'linear-2d-v1',train,holdout,audit},null,2)],{type:'application/json'}));
  const a=document.createElement('a'); a.href=url; a.download='hafize-deney.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
};
const ranking = el('ranking');
function clearDerivedResults() {
  ranking.replaceChildren();
  el('prediction').textContent = '';
}
el('experiment').addEventListener('input', clearDerivedResults);
el('apply').addEventListener('click', clearDerivedResults);
el('undo').addEventListener('click', clearDerivedResults);
el('compare').onclick = () => {
  if (!el('epochs').reportValidity()) return;
  const epochs = el('epochs').valueAsNumber;
  const trials = [0.01,0.05,0.1,0.2,0.5].map(rate => ({
    rate, error: loss(fit(current,rate,epochs),holdout)
  })).sort((a,b) => a.error - b.error);
  ranking.replaceChildren();
  for (const trial of trials) {
    const row = document.createElement('li');
    row.textContent = 'Hız '+trial.rate+' · Hata '+trial.error.toPrecision(6)+' ';
    const select = document.createElement('button');
    select.type = 'button';
    select.textContent = 'Bu adayla dene';
    select.onclick = () => {
      el('rate').value = trial.rate;
      el('experiment').requestSubmit();
    };
    row.append(select); ranking.append(row);
  }
};
el('predict').onsubmit = event => {
  event.preventDefault();
  const row = [el('x1').valueAsNumber,el('x2').valueAsNumber];
  const expected = label(row), actual = predict(current,row);
  el('prediction').textContent = Number.isFinite(actual) && Number.isFinite(expected)
    ? 'Tahmin: '+actual.toPrecision(6)+' · Hedef: '+expected.toPrecision(6)+' · Mutlak hata: '+Math.abs(actual-expected).toPrecision(6)
    : 'Daha küçük sayılarla tekrar dene.';
};

const sessionKey = 'weight-space06.lab.v1';
function saveSession() {
  try {
    const snapshot = JSON.stringify({
      current, candidate, history, audit, rate: el('rate').value,
      epochs: el('epochs').value, result: el('result').textContent
    });
    sessionStorage.setItem(sessionKey,snapshot);
    el('session-info').textContent = 'Bu sekmede kayıtlı.';
  } catch {
    el('session-info').textContent = 'Oturum kaydedilemedi. Son deney kaydını JSON olarak indirebilirsin.';
  }
}
function restoreSession() {
  try {
    const saved = sessionStorage.getItem(sessionKey);
    if (!saved) return;
    const state = JSON.parse(saved);
    const vector = w => Array.isArray(w) && w.length===3 && w.every(Number.isFinite);
    if (!vector(state.current) || !(state.candidate===null || vector(state.candidate)) ||
        !Array.isArray(state.history) || !state.history.every(vector) || !Array.isArray(state.audit) ||
        !state.audit.every(e=>e && ['evaluate','accept','rollback'].includes(e.action))) throw Error();
    current=state.current;
    candidate=state.candidate;
    for (const entry of state.history) history.push(entry);
    for (const entry of state.audit) audit.push(entry);
    el('rate').value=state.rate;
    el('epochs').value=state.epochs;
    el('result').textContent=state.result;
    el('export').disabled=!audit.length;
    el('apply').disabled=!candidate;
    el('undo').disabled=!history.length;
    el('session-info').textContent='Bu sekmedeki deney geri yüklendi.';
  } catch {
    el('session-info').textContent='Önceki oturum yüklenemedi.';
  }
}
el('experiment').addEventListener('input',saveSession);
restoreSession();
