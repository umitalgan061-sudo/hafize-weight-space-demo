# Weight-Space Harness


**Model ağırlıklarını (tensörleri) güvenli, denetlenebilir ve geri alınabilir bir şekilde düzenlemek için uçtan uca altyapı.**


## 🎯 Ne İşe Yarar?


Bu proje, bir LLM'in kendi model ağırlıklarını (checkpoint tensörlerini) **kendisi düzenleyebilmesi** için gerekli olan **tüm altyapıyı** sağlar:


1. **Sandbox** — Tensor okuma/yazma, forward-pass bütçesi, checkpoint diff, safetensors I/O
2. **Eval Harness** — MATH-500, GSM8K, IFEval, Regression benchmark suite'leri
3. **Reviewer Agent** — Bağımsız doğrulama: tensor change analizi, regresyon tespiti, risk skorlama
4. **Human Gate** — İnsan onay kapısı: diff özeti, eval karşılaştırması, karar kaydı


## 📦 Modüller


| Dosya | Açıklama |
|-------|----------|
| `sandbox.py` | `WeightSpaceSandbox` sınıfı: checkpoint yükleme, tensor CRUD, forward budget, diff summary |
| `eval_harness.py` | `Benchmark` baz sınıfı + `MATH500`, `GSM8K`, `IFEval`, `RegressionSuite` + `run_full_suite()` |
| `reviewer_agent.py` | `ReviewerAgent` sınıfı: tensor/regression/stability analizi, risk seviyesi, öneri |
| `human_gate.py` | `HumanGate` sınıfı: onay isteği yaşam döngüsü, özet üretimi, karar kaydı |
| `index.html` | Demo arayüzü (mock pipeline simülasyonu) |


## 🚀 Hızlı Başlangıç


### Demo (Mock)
```bash
# Sadece index.html'i tarayıcıda açın
# Butonlarla mock pipeline simülasyonu çalıştırın
```


### Gerçek Kullanım (Model Sağlayıcı API'si Gerekir)
```python
from sandbox import WeightSpaceSandbox, ForwardBudget
from eval_harness import run_full_suite, MATH500, GSM8K, IFEval
from reviewer_agent import ReviewerAgent
from human_gate import HumanGate


# 1. Sandbox başlat (safetensors checkpoint)
sandbox = WeightSpaceSandbox("model.safetensors", ForwardBudget(max_passes=100))


# 2. Tensor oku/yaz
tensor = sandbox.read_tensor("model.layers.15.attn.q_proj.weight")
# ... tensor üzerinde hipotez tabanlı düzenleme ...
diff = sandbox.write_tensor("model.layers.15.attn.q_proj.weight", new_tensor)


# 3. Eval çalıştır
def model_fn(prompt: str) -> str:
    # Model provider API: run_forward + tokenizer
