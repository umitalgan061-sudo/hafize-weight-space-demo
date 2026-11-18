# Weight-Space Sandbox
# Model checkpoint (safetensors) okuma/yazma ve forward-pass bütçeli çalıştırma
import torch
import safetensors.torch as st
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, Optional, List
import hashlib
import json


@dataclass
class TensorInfo:
    name: str
    shape: List[int]
    dtype: str
    device: str
    hash: str  # sha256 of tensor bytes


@dataclass
class ForwardBudget:
    max_passes: int = 100
    used_passes: int = 0
    
    def consume(self, n: int = 1) -> bool:
        if self.used_passes + n > self.max_passes:
            return False
        self.used_passes += n
        return True


class WeightSpaceSandbox:
    """Model ağırlıklarını güvenli bir sandbox'ta okur, yazar ve forward-pass çalıştırır."""
    
    def __init__(self, checkpoint_path: str, budget: Optional[ForwardBudget] = None):
        self.checkpoint_path = Path(checkpoint_path)
        self.budget = budget or ForwardBudget()
        self.tensors: Dict[str, torch.Tensor] = {}
        self.metadata: Dict[str, TensorInfo] = {}
        self._load_checkpoint()
    
    def _load_checkpoint(self):
        """safetensors checkpoint'ten tensörleri yükler."""
        if not self.checkpoint_path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {self.checkpoint_path}")
        
        state_dict = st.load_file(str(self.checkpoint_path))
        for name, tensor in state_dict.items():
            self.tensors[name] = tensor.clone()
            self.metadata[name] = TensorInfo(
                name=name,
                shape=list(tensor.shape),
                dtype=str(tensor.dtype),
                device=str(tensor.device),
                hash=self._tensor_hash(tensor)
            )
    
    def _tensor_hash(self, tensor: torch.Tensor) -> str:
        """Tensörün byte'ları üzerinden SHA256."""
        return hashlib.sha256(tensor.cpu().numpy().tobytes()).hexdigest()[:16]
    
    def read_tensor(self, name: str) -> torch.Tensor:
        """Tensörü okur (copy döndürür)."""
        if name not in self.tensors:
            raise KeyError(f"Tensor not found: {name}")
        return self.tensors[name].clone()
    
    def write_tensor(self, name: str, new_tensor: torch.Tensor) -> Dict:
        """Tensörü yazar, diff metadata döndürür."""
        if name not in self.tensors:
            raise KeyError(f"Tensor not found: {name}")
        
        old_hash = self.metadata[name].hash
        old_shape = self.metadata[name].shape
        new_shape = list(new_tensor.shape)
        
        if old_shape != new_shape:
            raise ValueError(f"Shape mismatch: {old_shape} vs {new_shape}")
        
        self.tensors[name] = new_tensor.clone()
        new_hash = self._tensor_hash(new_tensor)
        self.metadata[name].hash = new_hash
        
        return {
            "tensor": name,
            "old_hash": old_hash,
            "new_hash": new_hash,
            "changed": old_hash != new_hash,
            "shape": new_shape
        }
    
    def list_tensors(self, pattern: Optional[str] = None) -> List[TensorInfo]:
        """Tensörleri listeler (opsiyonel regex pattern)."""
        import re
        result = []
        for name, info in self.metadata.items():
            if pattern is None or re.search(pattern, name):
                result.append(info)
        return result
    
    def forward_pass(self, input_ids: torch.Tensor, **kwargs) -> torch.Tensor:
        """Bütçeli forward pass. Model sınıfı dışarıdan inject edilmeli."""
        if not self.budget.consume(1):
            raise RuntimeError(f"Forward budget exceeded: {self.budget.max_passes}")
        
        # Model forward'ı dışarıdan sağlanacak (dependency injection)
        # Bu metod sadece bütçe kontrolü yapar; gerçek forward model sınıfında olur.
        raise NotImplementedError("Model forward() inject edilmeli. sandbox.run_forward(model, input_ids) kullanın.")
    
    def run_forward(self, model: torch.nn.Module, input_ids: torch.Tensor, **kwargs) -> torch.Tensor:
        """Modeli sandbox tensörleriyle çalıştırır."""
        if not self.budget.consume(1):
            raise RuntimeError(f"Forward budget exceeded")
        
        # Modelin state_dict'ini sandbox tensörleriyle güncelle
        original_state = {k: v.clone() for k, v in model.state_dict().items()}
        try:
            model.load_state_dict(self.tensors, strict=False)
            model.eval()
            with torch.no_grad():
                output = model(input_ids, **kwargs)
            return output
        finally:
            # Orijinal state'e dön (sandbox izole)
            model.load_state_dict(original_state, strict=False)
    
    def save_checkpoint(self, output_path: str):
        """Değiştirilmiş tensörleri safetensors olarak kaydeder."""
        st.save_file(self.tensors, output_path)
    
    def get_diff_summary(self) -> Dict:
        """Değişen tensörlerin özeti."""
        changed = []
        for name, info in self.metadata.items():
            current_hash = self._tensor_hash(self.tensors[name])
            if current_hash != info.hash:
                changed.append({
                    "tensor": name,
                    "old_hash": info.hash,
                    "new_hash": current_hash,
                    "shape": info.shape
                })
        return {
            "total_tensors": len(self.metadata),
            "changed_tensors": len(changed),
            "changes": changed
        }