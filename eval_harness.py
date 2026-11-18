# Evaluation Harness
# Standardized benchmark suite: MATH-500, GSM8K, IFEval, custom regression
import json
import re
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Dict, Callable, Optional
from abc import ABC, abstractmethod
import subprocess
import sys


@dataclass
class EvalResult:
    task: str
    score: float
    details: Dict
    passed: bool


class Benchmark(ABC):
    """Benchmark baz sınıfı."""
    
    @abstractmethod
    def name(self) -> str:
        pass
    
    @abstractmethod
    def evaluate(self, model_fn: Callable[[str], str]) -> EvalResult:
        pass


class MATH500(Benchmark):
    """MATH-500 benchmark (Hendrycks et al.)."""
    
    def name(self) -> str:
        return "MATH-500"
    
    def evaluate(self, model_fn: Callable[[str], str]) -> EvalResult:
        # Gerçek implementasyonda: math_500.jsonl'den problemleri çek,
        # model_fn ile çöz, cevapları normalize et, accuracy hesapla
        # Burada iskelet:
        problems = self._load_problems()
        correct = 0
        details = []
        
        for prob in problems:
            prompt = f"Problem: {prob['problem']}\\nSolution:"
            response = model_fn(prompt)
            predicted = self._extract_answer(response)
            expected = prob['answer']
            is_correct = self._normalize(predicted) == self._normalize(expected)
            if is_correct:
                correct += 1
            details.append({
                "problem": prob['problem'][:100],
                "predicted": predicted,
                "expected": expected,
                "correct": is_correct
            })
        
        return EvalResult(
            task=self.name(),
            score=correct / len(problems) if problems else 0.0,
            details={"samples": details},
            passed=correct / len(problems) >= 0.8 if problems else False
        )
    
    def _load_problems(self) -> List[Dict]:
        # HuggingFace datasets veya local dosyadan yükle
        return []  # placeholder
    
    def _extract_answer(self, text: str) -> str:
        # \boxed{...} veya son satır parse
        match = re.search(r'\\boxed\{([^}]+)\}', text)
        if match:
            return match.group(1).strip()
        lines = text.strip().split('\\n')
        return lines[-1].strip() if lines else ""
    
    def _normalize(self, ans: str) -> str:
        return ans.strip().lower().replace(' ', '')


class GSM8K(Benchmark):
    """GSM8K benchmark (Cobbe et al.)."""
    
    def name(self) -> str:
        return "GSM8K"
    
    def evaluate(self, model_fn: Callable[[str], str]) -> EvalResult:
        problems = self._load_problems()
        correct = 0
        details = []
        
        for prob in problems:
            prompt = f"Question: {prob['question']}\\nAnswer:"
            response = model_fn(prompt)
            predicted = self._extract_answer(response)
            expected = prob['answer']
            is_correct = self._normalize(predicted) == self._normalize(expected)
            if is_correct:
                correct += 1
            details.append({
                "question": prob['question'][:100],
                "predicted": predicted,
                "expected": expected,
                "correct": is_correct
            })
        
        return EvalResult(
            task=self.name(),
            score=correct / len(problems) if problems else 0.0,
            details={"samples": details},
            passed=correct / len(problems) >= 0.85 if problems else False
        )
    
    def _load_problems(self) -> List[Dict]:
        return []
    
    def _extract_answer(self, text: str) -> str:
        # #### 42 formatı
        match = re.search(r'####\s*([\d.,]+)', text)
        if match:
            return match.group(1).replace(',', '').strip()
        return text.strip()
    
    def _normalize(self, ans: str) -> str:
        return ans.strip().lower()


class IFEval(Benchmark):
    """IFEval: Instruction Following Evaluation (Zhou et al.)."""
    
    def name(self) -> str:
        return "IFEval"
    
    def evaluate(self, model_fn: Callable[[str], str]) -> EvalResult:
        tasks = self._load_tasks()
        passed_count = 0
        details = []
        
        for task in tasks:
            prompt = task['prompt']
            response = model_fn(prompt)
            checks = self._check_constraints(response, task['constraints'])
            all_passed = all(checks.values())
            if all_passed:
                passed_count += 1
            details.append({
                "prompt": prompt[:100],
                "response": response[:200],
                "checks": checks,
                "passed": all_passed
            })
        
        return EvalResult(
            task=self.name(),
            score=passed_count / len(tasks) if tasks else 0.0,
            details={"samples": details},
            passed=passed_count / len(tasks) >= 0.9 if tasks else False
        )
    
    def _load_tasks(self) -> List[Dict]:
        return []
    
    def _check_constraints(self, response: str, constraints: List[Dict]) -> Dict[str, bool]:
        results = {}
        for c in constraints:
            ctype = c['type']
            if ctype == 'keyword':
                results[c['name']] = c['keyword'].lower() in response.lower()
            elif ctype == 'length':
                results[c['name']] = len(response) <= c['max_length']
            elif ctype == 'format':
                results[c['name']] = bool(re.search(c['pattern'], response))
            else:
                results[c['name']] = False
        return results


class RegressionSuite(Benchmark):
    """Özel regresyon testleri: bilinen girdi-beklenen çıktı çiftleri."""
    
    def __init__(self, test_cases: List[Dict]):
        self.test_cases = test_cases
    
    def name(self) -> str:
        return "Regression"
    
    def evaluate(self, model_fn: Callable[[str], str]) -> EvalResult:
        passed = 0
        details = []
        for tc in self.test_cases:
            response = model_fn(tc['input'])
            expected = tc['expected']
            match = self._match(response, expected, tc.get('match_type', 'exact'))
            if match:
                passed += 1
            details.append({
                "input": tc['input'],
                "response": response[:200],
                "expected": expected,
                "passed": match
            })
        return EvalResult(
            task=self.name(),
            score=passed / len(self.test_cases) if self.test_cases else 0.0,
            details={"samples": details},
            passed=passed == len(self.test_cases)
        )
    
    def _match(self, response: str, expected: str, match_type: str) -> bool:
        if match_type == 'exact':
            return response.strip() == expected.strip()
        elif match_type == 'contains':
            return expected in response
        elif match_type == 'regex':
            return bool(re.search(expected, response))
        return False


def run_full_suite(model_fn: Callable[[str], str], benchmarks: Optional[List[Benchmark]] = None) -> Dict:
    """Tüm benchmarkları çalıştırır, özet rapor döndürür."""
    if benchmarks is None:
        benchmarks = [MATH500(), GSM8K(), IFEval()]
    
    results = []
    for bench in benchmarks:
        result = bench.evaluate(model_fn)
        results.append(asdict(result))
    
    all_passed = all(r['passed'] for r in results)
    avg_score = sum(r['score'] for r in results) / len(results) if results else 0.0
    
    return {
        "results": results,
        "summary": {
            "total_benchmarks": len(results),
            "passed_benchmarks": sum(1 for r in results if r['passed']),
            "average_score": avg_score,
            "all_passed": all_passed
        }
    }