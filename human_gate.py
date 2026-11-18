# Human Gate
# İnsan onay kapısı: tensor diff özeti, eval karşılaştırması, reviewer raporu → onay/red
import json
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional
from enum import Enum
from datetime import datetime, timedelta
from reviewer_agent import ReviewerAgent, ReviewReport, RiskLevel


class GateDecision(Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


@dataclass
class GateRequest:
    proposal_id: str
    tensor_changes: List[Dict]
    eval_before: Dict
    eval_after: Dict
    reviewer_report: ReviewReport
    created_at: str  # ISO timestamp
    expires_at: str  # ISO timestamp
    decided_at: Optional[str] = None
    decision: GateDecision = GateDecision.PENDING
    decided_by: Optional[str] = None
    decision_notes: Optional[str] = None


class HumanGate:
    """İnsan onay akışını yönetir."""
    
    def __init__(self, storage_path: str = "./gate_requests.json"):
        self.storage_path = storage_path
        self.requests: Dict[str, GateRequest] = {}
        self._load()
    
    def _load(self):
        import os
        if os.path.exists(self.storage_path):
            with open(self.storage_path, 'r') as f:
                data = json.load(f)
                for req_data in data:
                    # ReviewReport deserialization basitleştirildi
                    self.requests[req_data['proposal_id']] = GateRequest(**req_data)
    
    def _save(self):
        with open(self.storage_path, 'w') as f:
            json.dump([asdict(r) for r in self.requests.values()], f, indent=2, default=str)
    
    def create_request(self,
                       proposal_id: str,
                       tensor_changes: List[Dict],
                       eval_before: Dict,
                       eval_after: Dict,
                       reviewer: ReviewerAgent,
                       ttl_hours: int = 24) -> GateRequest:
        """Yeni onay isteği oluşturur."""
        reviewer_report = reviewer.review(proposal_id, tensor_changes, eval_before, eval_after)
        
        now = datetime.utcnow()
        request = GateRequest(
            proposal_id=proposal_id,
            tensor_changes=tensor_changes,
            eval_before=eval_before,
            eval_after=eval_after,
            reviewer_report=reviewer_report,
            created_at=now.isoformat() + 'Z',
            expires_at=(now + timedelta(hours=ttl_hours)).isoformat() + 'Z'
        )
        
        self.requests[proposal_id] = request
        self._save()
        return request
    
    def get_request(self, proposal_id: str) -> Optional[GateRequest]:
        return self.requests.get(proposal_id)
    
    def list_pending(self) -> List[GateRequest]:
        now = datetime.utcnow()
        pending = []
        for req in self.requests.values():
            if req.decision == GateDecision.PENDING:
                if datetime.fromisoformat(req.expires_at.replace('Z', '')) > now:
                    pending.append(req)
                else:
                    req.decision = GateDecision.EXPIRED
        self._save()
        return pending
    
    def decide(self, proposal_id: str, decision: GateDecision, decided_by: str, notes: str = "") -> bool:
        """İnsan kararını kaydeder."""
        if proposal_id not in self.requests:
            return False
        
        req = self.requests[proposal_id]
        if req.decision != GateDecision.PENDING:
            return False
        
        req.decision = decision
        req.decided_at = datetime.utcnow().isoformat() + 'Z'
        req.decided_by = decided_by
        req.decision_notes = notes
        self._save()
        return True
    
    def generate_summary(self, proposal_id: str) -> str:
        """İnsan için okunabilir özet üretir."""
        req = self.requests.get(proposal_id)
        if not req:
            return "Request not found"
        
        lines = [
            f"=== WEIGHT-SPACE EDIT PROPOSAL ===",
            f"Proposal ID: {req.proposal_id}",
            f"Status: {req.decision.value.upper()}",
            f"Created: {req.created_at}",
            f"Expires: {req.expires_at}",
            "",
            f"--- TENSOR CHANGES ({len(req.tensor_changes)}) ---",
        ]
        
        for c in req.tensor_changes[:20]:  # ilk 20
            status = "CHANGED" if c['old_hash'] != c['new_hash'] else "UNCHANGED"
            lines.append(f"  {c['tensor']} [{c['shape']}] {status} ({c['old_hash']} -> {c['new_hash']})")
        
        if len(req.tensor_changes) > 20:
            lines.append(f"  ... and {len(req.tensor_changes) - 20} more")
        
        lines.extend([
            "",
            f"--- EVAL COMPARISON ---",
        ])
        
        for r in req.eval_after.get('results', []):
            before_score = None
            for b in req.eval_before.get('results', []):
                if b.get('task') == r.get('task'):
                    before_score = b.get('score')
                    break
            after_score = r.get('score')
            delta = after_score - before_score if before_score is not None else None
            lines.append(f"  {r.get('task')}: {after_score:.3f} (Δ{delta:+.3f}) {'✅' if r.get('passed') else '❌'}")
        
        lines.extend([
            "",
            f"--- REVIEWER REPORT ---",
            f"Overall Risk: {req.reviewer_report.overall_risk.value.upper()}",
            f"Recommendation: {req.reviewer_report.recommendation.upper()}",
            "",
            req.reviewer_report.reviewer_notes,
        ])
        
        if req.decision == GateDecision.PENDING:
            lines.append("\n>>> DECISION REQUIRED: approve / reject <<<")
        
        return '\n'.join(lines)