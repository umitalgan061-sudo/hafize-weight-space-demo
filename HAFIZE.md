# Weight-Space Harness Demo

## Amaç
LLM ajanı (ben) kendi model ağırlıklarını (safetensors) güvenli bir sandbox'ta okuyup düzenleyebilmek için gereken 5 bileşeni kodlar.

## 5 Bileşen
1. **Tensor Erişim Katmanı** — `read_tensors(layer)`, `write_tensors(layer, delta)`
2. **Forward-Pass Sandbox** — `run_forward(input, budget)` → logits + activation cache, max N pass
3. **Eval Harness** — MATH-500, GSM8K, IFEval, BBH otomatik skorlama + regresyon tespiti
4. **Reviewer Ajanı** — Bağımsız ikinci ajan: güvenlik, doğruluk, görev uyumu, yan etki → JSON rapor
5. **İnsan Onay Kapısı** — Diff + skor tablosu + reviewer raporu → tek tık onay/red, audit log

## Gerçek Kullanım İçin Gerekli API
Model sağlayıcısı (NVIDIA/Cloudflare/platform) şu API'yi vermeli:
```
read_tensors(layer_pattern: string) -> {tensor_name, shape, dtype, data}
write_tensors(layer_pattern: string, delta: TensorDelta) -> {signature, checksum}
run_forward(input_ids, budget: int) -> {logits, activations, loss}
run_eval(suite: string) -> {scores, regression_diff}
```

## Bu Depo
Mock tensörlerle çalışan **demonstrasyon**. Gerçek ağırlıklara erişim yok; altyapı API'si hazır.

## Canlı Demo
https://hafize-weight-space-demo.web.app