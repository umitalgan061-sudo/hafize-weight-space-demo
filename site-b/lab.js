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
  log('accept',{weights:current}); el('result').textContent += '\nAday bu oturumda etkin.';
};
el('undo').onclick = () => {
  if (!history.length) return;
  current = history.pop(); invalidate(); el('undo').disabled = !history.length;
  log('rollback',{weights:current}); el('result').textContent = 'Önceki ağırlıklar geri yüklendi. Hata: '+loss(current,holdout).toPrecision(6);
};
el('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({model:'linear-2d-v1',train,holdout,audit},null,2)],{type:'application/json'}));
  const a=document.createElement('a'); a.href=url; a.download='hafize-deney.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
};