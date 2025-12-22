from typing import List, Dict, Optional, Any
import json

class Dataset:
    """Class to format and standardize output from different search methods"""
    
    @staticmethod
    def format_search_results(results: List[Dict], method_name: str) -> List[Dict]:
        """Format search results to standard format"""
        formatted = []
        for item in results:
            try:
                pid = item.get("id")
                if pid is None:
                    continue
                
                # Convert id to int if possible
                try:
                    pid = int(pid)
                except (ValueError, TypeError):
                    continue
                
                # Get score, default to 0.0 if not available
                try:
                    score = float(item.get("score", 0.0))
                except (ValueError, TypeError):
                    score = 0.0
                
                formatted.append({
                    "id": pid,
                    "score": score
                })
            except Exception as e:
                print(f"Warning: Error formatting result item {item}: {e}")
                continue
        
        return formatted
    
    @staticmethod
    def merge_results(buckets: Dict[str, List[Dict]], weights: Dict[str, float], topk: int) -> List[Dict]:
        """Merge results from different methods using weighted scoring"""
        acc = {}
        
        for src, items in buckets.items():
            if not items:
                continue
                
            w = float(weights.get(src, 1.0))
            for item in items:
                pid = item.get("id")
                if pid is None:
                    continue
                    
                if pid not in acc:
                    acc[pid] = {
                        "id": pid,
                        "score": 0.0
                    }
                
                score = float(item.get("score", 0.0))
                acc[pid]["score"] += w * score
        
        merged = list(acc.values())
        merged.sort(key=lambda x: x["score"], reverse=True)
        
        return merged[:topk]
    
    @staticmethod
    def create_response_structure(
        per_query: Dict[str, Dict],
        per_method_across_queries: Dict[str, List[Dict]],
        ensemble_all_queries_all_methods: List[Dict],
        mode: str
    ) -> Dict[str, Any]:
        """Create standardized response structure"""
        return {
            "mode": mode,
            "per_query": per_query,
            "ensemble_per_method_across_queries": per_method_across_queries,
            "ensemble_all_queries_all_methods": ensemble_all_queries_all_methods
        }
    
    @staticmethod
    def validate_inputs(
        query: Optional[str] = None,
        ocr_text: Optional[str] = None,
        asr_text: Optional[str] = None,
        use_video_cap: bool = False
    ) -> str:
        """
        Validate inputs and determine search mode
        
        Mode Scene: Audio/Video mode (ASR text OR video captioning)
        Mode Image: Image/Text mode (query-based search)
        Mode Object: Object detection mode (object list)
        """
        if asr_text is not None or use_video_cap:
            return "Scene"  # Audio/Video mode
        else:
            return "Image"  # Image/Text mode
