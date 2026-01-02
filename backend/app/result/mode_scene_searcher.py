from typing import List, Dict, Optional
from dataclasses import dataclass
from app.retrieve.ocr_asr_ic import ElasticSearcher
from app.utils.dataset import Dataset

@dataclass
class SceneMethodConfig:
    name: str
    enabled: bool
    search_func: callable
    param: any

class ModeSceneSearcher:
    """Scene mode: ASR"""

    def __init__(
        self,
        es: Optional[ElasticSearcher] = None,
        topk_each: int = 200,
        topk_final: int = 200,
        topk_prev: int = 500
    ):
        self.es = es
        self.topk_each = topk_each
        self.topk_final = topk_final
        self.topk_prev = topk_prev

        self.weights = {"asr": 1.0}

    def search(
        self,
        query: Optional[str] = None,
        asr_text: Optional[str] = None
    ) -> Dict:
        if not asr_text:
            return {"mode": "Scene", "error": "ASR text is required"}

        asr_bucket: Optional[List[Dict]] = None
        asr_bucket = self._search_asr(asr_text)

        return self._create_all_results_scene(
            asr_bucket=asr_bucket,
            has_asr=asr_text is not None
        )

    def _create_all_results_scene(
        self,
        asr_bucket: Optional[List[Dict]],
        has_asr: bool
    ) -> Dict:
        results_per_query: Dict[str, Dict] = {}
        per_method = {}
        if has_asr and asr_bucket:
            per_method["asr"] = asr_bucket
        results_per_query["query_0"] = {
            "per_method": per_method,
            "ensemble_all_methods": Dataset.merge_results(
                per_method, self.weights, self.topk_final
            )
        }

        per_method_across_queries: Dict[str, List[Dict]] = {}
        if has_asr and asr_bucket:
            per_method_across_queries["asr"] = Dataset.merge_results(
                {"asr": asr_bucket}, {"asr": self.weights["asr"]}, self.topk_final
            )

        merged_all: Dict[str, List[Dict]] = {}
        if has_asr and asr_bucket:
            merged_all["asr"] = asr_bucket

        ensemble_all_queries_all_methods = Dataset.merge_results(
            merged_all, self.weights, self.topk_final
        )

        return Dataset.create_response_structure(
            results_per_query, per_method_across_queries,
            ensemble_all_queries_all_methods, "Scene"
        )

    def _search_asr(self, query: Optional[str]) -> Optional[List[Dict]]:
        if not self.es or not query:
            return None
        results = self.es.search_text("asr", query, size=self.topk_each)
        return Dataset.format_search_results(results, "asr")
