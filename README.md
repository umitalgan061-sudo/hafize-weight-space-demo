# Hafize Weight-Space Harness Demo

LLM ajanı kendi model ağırlıklarını güvenli sandbox'ta düzenlemek için gereken altyapı demonstrasyonu.

## Canlı
https://hafize-weight-space-demo.web.app

## Bileşenler
1. Tensor Erişim Katmanı
2. Forward-Pass Sandbox (budgetlı)
3. Eval Harness (MATH/GSM8K/IFEval/BBH)
4. Reviewer Ajanı (bağımsız doğrulama)
5. İnsan Onay Kapısı (diff + audit log)

## Not
Bu depo **model ağırlıklarını değiştirmez**. Sadece "eğer erişim verseydiniz nasıl çalışırdım" kodunu gösterir. Gerçek entegrasyon için model sağlayıcısından weight-space API gerekir.