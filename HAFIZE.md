# Weight-Space Harness — HAFIZE.md

## Proje Amacı
Model ağırlıklarını (tensörleri) **güvenli, denetlenebilir, geri alınabilir** bir şekilde düzenlemek için uçtan uca altyapı:
- Sandbox (okuma/yazma, forward-pass bütçesi)
- Standart değerlendirme (MATH-500, GSM8K, IFEval, Regression)
- Bağımsız Reviewer ajanı (risk/regresyon/istikrar)
- İnsan onay kapısı (diff özeti, eval karşılaştırması, karar kaydı)

## Kullanıcı Senaryosu
1. Ajan (veya insan) bir hipotez kurar: "Layer 15 attention q_proj'e rank-1 update uygulama reasoning'i iyileştirir"
2. `sandbox.write_tensor()` ile tensörü düzenler
3. `sandbox.run_forward()` + `eval_harness.run_full_suite()` ile doğrular
4. `reviewer_agent.review()` risk analizi yapar
5. `human_gate.create_request()` insan onayı ister
6. Onaylanırsa `sandbox.save_checkpoint()` → production rollout

## Modüller
| Dosya | Sorumluluk |
|-------|------------|
| `sandbox.py` | Checkpoint I/O, tensor CRUD, forward budget, diff summary |
| `eval_harness.py` | Benchmark suite'leri, model_fn interface, raporlama |
| `reviewer_agent.py` | Tensor change analizi, regression detection, risk scoring |
| `human_gate.py` | Onay isteği yaşam döngüsü, özet üretimi, karar kaydı |
| `index.html` | Demo arayüzü (mock simülasyon) |

## Gereksinimler (Model Sağlayıcıdan)
Bu harness **model ağırlıklarına erişim gerektirir**. Sağlayıcı şu API'leri vermeli:

```python
class ModelProviderAPI:
    def read_tensors(self, layer_pattern: str) -> Dict[str, torch.Tensor]: ...
    def write_tensors(self, tensors: Dict[str, torch.Tensor]) -> Dict[str, str]: ...  # returns new hashes
    def run_forward(self, input_ids: torch.Tensor, budget: int) -> torch.Tensor: ...
    def run_eval(self, suite: List[str]) -> Dict: ...  # MATH, GSM8K, IFEval, Regression
```

Bu API olmadan harness **mock/demo modunda** çalışır (index.html simülasyonu).

## Güvenlik Prensipleri
1. **İzolasyon**: Sandbox orijinal model state'ini değiştirmez (copy-on-write)
2. **Bütçe**: Forward-pass sayısı sınırlı (default 100)
3. **Doğrulama**: Her değişiklik benchmark suite'i geçmeli
4. **Bağımsız İnceleme**: Reviewer ajanı düzenleyen ajandan ayrı
5. **İnsan Onayı**: Production'a geçiş insansız olmaz
6. **Geri Alma**: Her checkpoint versiyonlanır, anında rollback mümkün

## Geliştirme Öncelikleri
1. ✅ Core modules (sandbox, eval, reviewer, gate)
2. ✅ Demo UI (index.html)
3. ⏳ Real provider adapter (NVIDIA/Cloudflare API entegrasyonu)
4. ⏳ CLI tooling (`ws-harness propose/eval/review/gate/deploy`)
5. ⏳ CI/CD integration (GitHub Actions → gate → deploy)
6. ⏳ Audit logging (her pass, tensor change, decision immutable log)

## Deploy
- GitHub: umitalgan061-sudo/hafize-weight-space-demo
- Firebase: https://hafize-weight-space-demo.web.app (demo)
- Real deployment: requires provider API credentials