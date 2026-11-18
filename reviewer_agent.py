# Reviewer Agent
# Bağımsız doğrulama ajanı: düzenleme önerisini inceler, risk/regresyon analiz eder
import json
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional
from enum import Enum


class RiskLevel(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class ReviewFinding:
    category: str  # "correctness", "regression", "safety", "style"
    severity: RiskLevel
    description: str
    evidence: str
    suggestion: str


@dataclass
class ReviewReport:
    proposal_id: str
    tensor_changes: List[Dict]
    eval_before: Dict
    eval_after: Dict
    findings: List[ReviewFinding]
    overall_risk: RiskLevel
    recommendation: str  # "approve", "request_changes", "reject"
    reviewer_notes: str


class ReviewerAgent:
    """Düzenleme önerisini (tensor diff + eval sonuçları) inceler."""
    
    def __init__(self, eval_thresholds: Optional[Dict[str, float]] = None):
        self.eval_thresholds = eval_thresholds or {
            "MATH-500": 0.80,
            "GSM8K": 0.85,
            "IFEval": 0.90,
            "Regression": 1.0
        }
    
    def review(self,
               proposal_id: str,
               tensor_changes: List[Dict],
               eval_before: Dict,
               eval_after: Dict) -> ReviewReport:
        """Tam inceleme raporu üretir."""
        findings = []
        
        # 1. Tensor değişikliği analizi
        findings.extend(self._analyze_tensor_changes(tensor_changes))
        
        # 2. Regresyon analizi (eval skorları)
        findings.extend(self._analyze_regression(eval_before, eval_after))
        
        # 3. Güvenlik/istikrar analizi
        findings.extend(self._analyze_stability(tensor_changes, eval_after))
        
        # 4. Genel risk ve öneri
        overall_risk = self._compute_overall_risk(findings)
        recommendation = self._make_recommendation(overall_risk, findings)
        
        return ReviewReport(
            proposal_id=proposal_id,
            tensor_changes=tensor_changes,
            eval_before=eval_before,
            eval_after=eval_after,
            findings=findings,
            overall_risk=overall_risk,
            recommendation=recommendation,
            reviewer_notes=self._generate_notes(findings, overall_risk)
        )
    
    def _analyze_tensor_changes(self, changes: List[Dict]) -> List[ReviewFinding]:
        findings = []
        if not changes:
            findings.append(ReviewFinding(
                category="correctness",
                severity=RiskLevel.LOW,
                description="No tensor changes proposed",
                evidence="Empty changes list",
                suggestion="Verify this is intentional"
            ))
            return findings
        
        # Attention/MLP katmanlarına odaklan
        attention_changes = [c for c in changes if 'attn' in c['tensor'] or 'attention' in c['tensor']]
        mlp_changes = [c for c in changes if 'mlp' in c['tensor'] or 'feed_forward' in c['tensor']]
        embedding_changes = [c for c in changes if 'embed' in c['tensor']]
        
        if embedding_changes:
            findings.append(ReviewFinding(
                category="safety",
                severity=RiskLevel.HIGH,
                description=f"{len(embedding_changes)} embedding tensor(s) modified",
                evidence=f"Tensors: {[c['tensor'] for c in embedding_changes]}",
                suggestion="Embedding changes affect entire vocabulary; require extensive eval"
            ))
        
        if len(attention_changes) > 10:
            findings.append(ReviewFinding(
                category="stability",
                severity=RiskLevel.MEDIUM,
                description=f"Many attention tensors changed ({len(attention_changes)})",
                evidence="Broad attention modification may alter reasoning patterns",
                suggestion="Run targeted reasoning benchmarks"
            ))
        
        return findings
    
    def _analyze_regression(self, before: Dict, after: Dict) -> List[ReviewFinding]:
        findings = []
        
        for bench_name, threshold in self.eval_thresholds.items():
            before_score = self._get_score(before, bench_name)
            after_score = self._get_score(after, bench_name)
            
            if before_score is None or after_score is None:
                findings.append(ReviewFinding(
                    category="regression",
                    severity=RiskLevel.MEDIUM,
                    description=f"Missing eval data for {bench_name}",
                    evidence=f"before={before_score}, after={after_score}",
                    suggestion=f"Run {bench_name} benchmark before proposing"
                ))
                continue
            
            delta = after_score - before_score
            
            if after_score < threshold:
                findings.append(ReviewFinding(
                    category="regression",
                    severity=RiskLevel.HIGH if delta < -0.05 else RiskLevel.MEDIUM,
                    description=f"{bench_name} below threshold: {after_score:.3f} < {threshold}",
                    evidence=f"Delta: {delta:+.3f} (before: {before_score:.3f})",
                    suggestion="Revert or iterate until threshold met"
                ))
            elif delta < -0.02:
                findings.append(ReviewFinding(
                    category="regression",
                    severity=RiskLevel.MEDIUM,
                    description=f"{bench_name} regressed by {delta:.3f}",
                    evidence=f"Before: {before_score:.3f}, After: {after_score:.3f}",
                    suggestion="Investigate cause; consider partial revert"
                ))
            elif delta > 0.01:
                findings.append(ReviewFinding(
                    category="improvement",
                    severity=RiskLevel.LOW,
                    description=f"{bench_name} improved by {delta:.3f}",
                    evidence=f"Before: {before_score:.3f}, After: {after_score:.3f}",
                    suggestion="Positive change; ensure no hidden trade-offs"
                ))
        
        return findings
    
    def _get_score(self, eval_data: Dict, bench_name: str) -> Optional[float]:
        # eval_data formatı: {"results": [{"task": "MATH-500", "score": 0.82, ...}, ...]}
        for r in eval_data.get('results', []):
            if r.get('task') == bench_name:
                return r.get('score')
        return None
    
    def _analyze_stability(self, changes: List[Dict], eval_after: Dict) -> List[ReviewFinding]:
        findings = []
        
        # Çok fazla tensör değişimi = istikrar riski
        if len(changes) > 50:
            findings.append(ReviewFinding(
                category="stability",
                severity=RiskLevel.MEDIUM,
                description=f"Large number of tensor changes: {len(changes)}",
                evidence="High change count correlates with instability",
                suggestion="Prefer minimal, targeted edits"
            ))
        
        # Eval sonrası passed=False varsa
        for r in eval_after.get('results', []):
            if not r.get('passed', True):
                findings.append(ReviewFinding(
                    category="stability",
                    severity=RiskLevel.HIGH,
                    description=f"Benchmark failed: {r.get('task')}",
                    evidence=f"Score: {r.get('score')}, Passed: {r.get('passed')}",
                    suggestion="Do not deploy until all benchmarks pass"
                ))
        
        return findings
    
    def _compute_overall_risk(self, findings: List[ReviewFinding]) -> RiskLevel:
        if not findings:
            return RiskLevel.LOW
        
        max_severity = max(f.severity for f in findings)
        severity_order = [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL]
        return max_severity
    
    def _make_recommendation(self, risk: RiskLevel, findings: List[ReviewFinding]) -> str:
        if risk == RiskLevel.CRITICAL:
            return "reject"
        elif risk == RiskLevel.HIGH:
            # Eğer HIGH sadece regression ise ve düzeltilebilirse
            regression_high = any(f.category == "regression" and f.severity == RiskLevel.HIGH for f in findings)
            if regression_high:
                return "request_changes"
            return "reject"
        elif risk == RiskLevel.MEDIUM:
            return "request_changes"
        return "approve"
    
    def _generate_notes(self, findings: List[ReviewFinding], risk: RiskLevel) -> str:
        lines = [f"Overall Risk: {risk.value.upper()}", "", "Findings:"]
        for f in findings:
            lines.append(f"  - [{f.severity.value.upper()}] {f.category}: {f.description}")
            lines.append(f"    Evidence: {f.evidence}")
            lines.append(f"    Suggestion: {f.suggestion}")
            lines.append("")
        return '\n'.join(lines)