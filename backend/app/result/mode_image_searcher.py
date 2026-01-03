from typing import List, Dict, Optional, Callable, Any
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, as_completed
from app.retrieve.clip import CLIPSearcher
from app.retrieve.beit3 import BEiT3Searcher
from app.retrieve.siglip2 import SigLIP2Searcher
from app.retrieve.ocr_asr_ic import ElasticSearcher
from app.retrieve.google import GoogleSearcher
from app.vector_database.vector_db_manager import DatabaseManager
from app.generate.gemini.gemini import Gemini
from app.utils.dataset import Dataset
from app.utils.weight_manager import weight_manager

@dataclass
class MethodConfig:
    name: str
    enabled: bool
    search_func: Callable
    param: Any

class ModeImageSearcher:
    def __init__(
        self,
        clip_searcher: Optional[CLIPSearcher] = None,
        beit3: Optional[BEiT3Searcher] = None,
        siglip2: Optional[SigLIP2Searcher] = None,
        es: Optional[ElasticSearcher] = None,
        google_searcher: Optional[GoogleSearcher] = None,
        db_url: Optional[str] = None,
        db_token: Optional[str] = None,
        topk_each: int = 100,
        topk_final: int = 100,
        topk_prev: int = 500,
        max_workers_methods: int = 8  # số luồng chạy các phương pháp cho 1 query
    ):
        self.clip_searcher = clip_searcher
        self.beit3 = beit3
        self.siglip2 = siglip2
        self.es = es
        self.google_searcher = google_searcher

        self.db_manager = DatabaseManager(db_url, db_token)
        self.topk_each = topk_each
        self.topk_final = topk_final
        self.topk_prev = topk_prev

        self.max_workers_methods = max_workers_methods

        self.weights = {
            "clip_h14": 1.0, "clip_bigg14": 1.0, "siglip2": 1.0,
            "beit3": 0.8, "ocr": 0.8, "gg": 0.6, "img_cap": 0.8
        }
        self.weight_manager = weight_manager

        self.collections = {
            "h14_quickgelu": "h14_quickgelu", "bigg14_datacomp": "bigg14_datacomp",
            "beit3": "beit3", "siglip2": "siglip2"
        }

    def search(
        self,
        query: str,
        ocr_text: Optional[str] = None,
        use_cliph14: bool = False,
        use_clipbigg14: bool = False,
        use_beit3: bool = False,
        use_siglip2: bool = False,
        use_gg: bool = False,
        use_image_cap: bool = False,
        weight_config: Optional[str] = None,
        use_trans: bool = True
    ) -> Dict:
        print(f"Mode Image - Methods: ClipH14={use_cliph14}, ClipBigG14={use_clipbigg14}, BEiT3={use_beit3}, SigLIP2={use_siglip2}, OCR={bool(ocr_text)}, GG={use_gg}, ImgCap={use_image_cap}")

        optimal_weights = self.weight_manager.get_weights_for_methods(
            use_cliph14=use_cliph14,
            use_clipbigg14=use_clipbigg14,
            use_image_cap=use_image_cap,
            use_beit3=use_beit3,
            use_siglip2=use_siglip2,
            use_ocr=bool(ocr_text),
            use_gg=use_gg,
            config_name=weight_config
        )
        
        if optimal_weights:
            self.weights.update(optimal_weights)
            suggested_config, _ = self.weight_manager.suggest_config(
                use_cliph14, use_clipbigg14, use_image_cap, use_beit3, use_siglip2, bool(ocr_text), use_gg
            )
            print(f"Using weight configuration: {suggested_config}")
            print(f"Active weights: {optimal_weights}")

        original_query = query
        if use_trans and any([use_cliph14, use_clipbigg14, use_beit3, use_siglip2, bool(ocr_text), use_image_cap]):
            queries = self._generate_queries(query)
            print(f"Translated query: {queries[0]}")
        else:
            queries = [query]

        # Xử lý query chạy song song các method
        all_query_buckets = {
            q_idx: self._search_single_query_parallel(
                q, original_query, ocr_text, use_cliph14, use_clipbigg14,
                use_beit3, use_siglip2, use_gg, use_image_cap
            )
            for q_idx, q in enumerate(queries)
        }

        return self._create_all_results(
            all_query_buckets, use_cliph14, use_clipbigg14,
            use_beit3, use_siglip2, bool(ocr_text), use_gg, use_image_cap
        )

    def _search_single_query_parallel(
        self, query: str, original_query: str, ocr_text: Optional[str], use_cliph14: bool,
        use_clipbigg14: bool, use_beit3: bool, use_siglip2: bool, use_gg: bool, use_image_cap: bool
    ) -> Dict[str, List[Dict]]:
        """
        Chạy song song các phương pháp cho 1 query bằng ThreadPoolExecutor.
        """
        method_configs = [
            MethodConfig("clip_h14", use_cliph14, self._search_clip_h14, query),
            MethodConfig("clip_bigg14", use_clipbigg14, self._search_clip_bigg14, query),
            MethodConfig("beit3", use_beit3, self._search_beit3, query),
            MethodConfig("siglip2", use_siglip2, self._search_siglip2, query),
            MethodConfig("img_cap", use_image_cap, self._search_image_cap, query),
            MethodConfig("ocr", bool(ocr_text), self._search_ocr, ocr_text),
            MethodConfig("gg", use_gg, self._search_google, original_query)
        ]

        results: Dict[str, List[Dict]] = {}
        # Nếu max_workers_methods <= 1 → chạy tuần tự để đảm bảo an toàn
        if self.max_workers_methods <= 1:
            for cfg in method_configs:
                if not cfg.enabled: 
                    continue
                out = cfg.search_func(cfg.param)
                if out: results[cfg.name] = out
            return results

        with ThreadPoolExecutor(max_workers=self.max_workers_methods, thread_name_prefix="img-method") as ex:
            futures = {
                ex.submit(cfg.search_func, cfg.param): cfg.name
                for cfg in method_configs if cfg.enabled
            }
            for fut in as_completed(futures):
                name = futures[fut]
                try:
                    out = fut.result()
                    if out:
                        results[name] = out
                except Exception as e:
                    # Log lỗi từng method, không làm hỏng cả query
                    print(f"[WARN] Method '{name}' failed: {e}")
        return results

    
    def _create_all_results(self, all_query_buckets: Dict[int, Dict[str, List[Dict]]],
                            use_cliph14: bool, use_clipbigg14: bool,
                            use_beit3: bool, use_siglip2: bool, has_ocr: bool, use_gg: bool, use_image_cap: bool) -> Dict:
        method_flags = [
            ("clip_h14", use_cliph14), ("clip_bigg14", use_clipbigg14),
            ("beit3", use_beit3), ("siglip2", use_siglip2), ("ocr", has_ocr), ("gg", use_gg), ("img_cap", use_image_cap)
        ]
        results_per_query = {
            f"query_{q_idx}": {
                "per_method": {
                    method: buckets[method] for method, enabled in method_flags
                    if enabled and method in buckets
                },
                "ensemble_all_methods": Dataset.merge_results(
                    {k: v for k, v in buckets.items() if v}, self.weights, self.topk_final
                )
            }
            for q_idx, buckets in all_query_buckets.items()
        }

        per_method_across_queries: Dict[str, List[Dict]] = {}
        for method_name, enabled in method_flags:
            if not enabled: 
                continue
            merged_results = []
            for buckets in all_query_buckets.values():
                if method_name in buckets:
                    merged_results.extend(buckets[method_name])
            if merged_results:
                per_method_across_queries[method_name] = Dataset.merge_results(
                    {method_name: merged_results},
                    {method_name: self.weights.get(method_name, 1.0)},
                    self.topk_final
                )

        merged_all_queries = {m: [] for m, enabled in method_flags if enabled}
        for buckets in all_query_buckets.values():
            for m in merged_all_queries.keys():
                if m in buckets:
                    merged_all_queries[m].extend(buckets[m])

        ensemble_all_queries_all_methods = Dataset.merge_results(
            merged_all_queries, self.weights, self.topk_final
        )
        return Dataset.create_response_structure(
            results_per_query, per_method_across_queries,
            ensemble_all_queries_all_methods, "Image"
        )

    def _generate_queries(self, query: str) -> List[str]:
        """Translate query to English only, no augmentation."""
        if not query: return [query]
        for attempt in range(3):
            try:
                gm = Gemini()
                translated = gm.translate_to_en(query)
                if translated and isinstance(translated, str):
                    return [translated]
                print(f"Warning: Attempt {attempt + 1}/3 - Invalid translation format")
            except Exception as e:
                print(f"Warning: Attempt {attempt + 1}/3 - Translation error: {str(e)}")
        print("Warning: Using original query as fallback")
        return [query]

    # ----- Các method đơn lẻ giữ nguyên logic gốc ----- #
    def _search_clip_h14(self, query: str) -> Optional[List[Dict]]:
        if not self.clip_searcher or "h14_quickgelu" not in getattr(self.clip_searcher, "models", {}):
            return None
        results = self.clip_searcher.text_search(
            model_name="h14_quickgelu",
            topk=self.topk_each,
            query=query,
            collection_name=self.collections["h14_quickgelu"],
        )
        return Dataset.format_search_results(results, "clip_h14")

    def _search_clip_bigg14(self, query: str) -> Optional[List[Dict]]:
        if not self.clip_searcher:
            return None
        multi_models = [
            ("bigg14_datacomp", self.collections["bigg14_datacomp"], 0.3),
        ]
        multi_buckets = {
            model_name: self.clip_searcher.text_search(
                model_name, self.topk_each, query,
                collection_name=coll
            )
            for model_name, coll, _ in multi_models
            if model_name in getattr(self.clip_searcher, "models", {})
        }
        if multi_buckets:
            mc_weights = {m: w for m, _, w in multi_models}
            return Dataset.merge_results(multi_buckets, mc_weights, self.topk_each)
        return None

    def _search_beit3(self, query: str) -> Optional[List[Dict]]:
        if not self.beit3: return None
        results = self.beit3.text_search(
            query=query,
            topk=self.topk_each,
            collection_name=self.collections["beit3"],
        )
        return Dataset.format_search_results(results, "beit3")

    def _search_siglip2(self, query: str) -> Optional[List[Dict]]:
        if not self.siglip2: return None
        results = self.siglip2.text_search(
            query=query,
            topk=self.topk_each,
            collection_name=self.collections["siglip2"],
        )
        return Dataset.format_search_results(results, "siglip2")
    
    def _search_image_cap(self, query: str) -> Optional[List[Dict]]:
        if not self.es: return None
        results = self.es.search_text("ic", query, size=self.topk_each)
        return Dataset.format_search_results(results, "img_cap")
    
    def _search_ocr(self, ocr_text: str) -> Optional[List[Dict]]:
        if not self.es: return None
        results = self.es.search_text("ocr", ocr_text, size=self.topk_each)
        return Dataset.format_search_results(results, "ocr")
    
    def _search_google(self, query: str) -> Optional[List[Dict]]:
        if not self.google_searcher: return None
        results = self.google_searcher.search(
            query=query,
            collection_name=self.collections["h14_quickgelu"],
            topk=self.topk_each,
            max_download=3,
            model_name="h14_quickgelu"
        )
        return Dataset.format_search_results(results, "gg")

    def get_available_weight_configs(self) -> List[str]:
        """Get list of all available weight configurations."""
        return self.weight_manager.get_available_configs()
    
    def get_weight_config_details(self, config_name: str) -> Optional[Dict[str, float]]:
        """Get details of a specific weight configuration."""
        return self.weight_manager.get_config_details(config_name)
    
    def suggest_weight_config(self, 
                            use_cliph14: bool = False,
                            use_clipbigg14: bool = False,
                            use_image_cap: bool = False,
                            use_beit3: bool = False,
                            use_siglip2: bool = False,
                            use_ocr: bool = False,
                            use_gg: bool = False) -> tuple:
        """Suggest optimal weight configuration for given method combination."""
        return self.weight_manager.suggest_config(
            use_cliph14, use_clipbigg14, use_image_cap, use_beit3, use_siglip2, use_ocr, use_gg
        )
    
    def add_custom_weight_config(self, config_name: str, weights: Dict[str, float]) -> None:
        """Add a custom weight configuration."""
        self.weight_manager.add_custom_config(config_name, weights)
