from typing import List, Dict, Optional
from PIL import Image
from app.result.mode_scene_searcher import ModeSceneSearcher
from app.result.mode_image_searcher import ModeImageSearcher
from app.result.image_search import ImageSearch
from app.utils.dataset import Dataset

class MixedSearchManager:
    """Main manager class for coordinating all search modes"""
    
    def __init__(
        self,
        mode_scene_searcher: Optional[ModeSceneSearcher] = None,
        mode_image_searcher: Optional[ModeImageSearcher] = None,
        mode_object_searcher: Optional[object] = None,
        image_search: Optional[ImageSearch] = None
    ):
        self.mode_scene_searcher = mode_scene_searcher
        self.mode_image_searcher = mode_image_searcher
        # Object mode removed
        self.mode_object_searcher = None
        self.image_search = image_search
    
    def mixed_search(
        self,
        query: Optional[str] = None,
        ocr_text: Optional[str] = None,
        asr_text: Optional[str] = None,
        ob_list: Optional[List] = None,
        use_cliph14: bool = False,
        use_clipbigg14: bool = False,
        use_beit3: bool = False,
        use_siglip2: bool = False,
        use_gg: bool = False,
        use_image_cap: bool = False,
        weight_config: Optional[str] = None,
        # Optional overrides for this single call
        topk_each: Optional[int] = None,
        topk_final: Optional[int] = None,
        topk_prev: Optional[int] = None,
        use_trans: bool = True
    ) -> Dict:
        mode = Dataset.validate_inputs(query, ocr_text, asr_text, ob_list)
        print(f"Running mixed_search in mode: {mode}")

        # Temporarily override topk settings across searchers for this call
        saved_values: Dict[tuple, int] = {}
        try:
            for searcher in (self.mode_image_searcher, self.mode_scene_searcher):
                if searcher is None: 
                    continue
                if topk_each is not None and hasattr(searcher, "topk_each"):
                    saved_values[(id(searcher), "topk_each")] = getattr(searcher, "topk_each")
                    setattr(searcher, "topk_each", int(topk_each))
                if topk_final is not None and hasattr(searcher, "topk_final"):
                    saved_values[(id(searcher), "topk_final")] = getattr(searcher, "topk_final")
                    setattr(searcher, "topk_final", int(topk_final))
                if topk_prev is not None and hasattr(searcher, "topk_prev"):
                    saved_values[(id(searcher), "topk_prev")] = getattr(searcher, "topk_prev")
                    setattr(searcher, "topk_prev", int(topk_prev))

            if mode == "Scene":
                return self._handle_mode_scene(query, asr_text)
            elif mode == "Image":
                return self._handle_mode_image(query, ocr_text, use_cliph14, use_clipbigg14, use_beit3, use_siglip2, use_gg, use_image_cap, use_trans, weight_config)
            else:
                return {"error": f"Unknown mode: {mode}"}
        finally:
            # Restore original values
            for searcher in (self.mode_image_searcher, self.mode_scene_searcher):
                if searcher is None: 
                    continue
                for attr in ("topk_each", "topk_final", "topk_prev"):
                    key = (id(searcher), attr)
                    if key in saved_values:
                        setattr(searcher, attr, saved_values[key])
    
    def _handle_mode_scene(self, query: Optional[str], asr_text: Optional[str]) -> Dict:
        if not self.mode_scene_searcher: return {"mode": "Scene", "error": "Mode Scene searcher not initialized"}
        return self.mode_scene_searcher.search(query, asr_text)
    
    def _handle_mode_image(self, query: str, ocr_text: Optional[str], use_cliph14: bool, use_clipbigg14: bool, use_beit3: bool, use_siglip2: bool, use_gg: bool, use_image_cap: bool, use_trans: bool, weight_config: Optional[str] = None) -> Dict:
        if not self.mode_image_searcher: return {"mode": "Image", "error": "Mode Image searcher not initialized"}
        return self.mode_image_searcher.search(query, ocr_text, use_cliph14, use_clipbigg14, use_beit3, use_siglip2, use_gg, use_image_cap, weight_config, use_trans=use_trans)
    
    def search_by_image(
        self,
        image: Optional[Image.Image] = None,
        model_name: str = "siglip2",
        collection_name: Optional[str] = None,
        topk: Optional[int] = None,
        image_path: Optional[str] = None
    ) -> Dict:
        if not self.image_search:
            return {"mode": "ImageSearch", "results": [], "error": "Image searcher not initialized"}
        saved_topk = getattr(self.image_search, "topk_each", None)
        try:
            if topk is not None:
                self.image_search.topk_each = int(topk)
            return self.image_search.search(
                image=image,
                model_name=model_name,
                collection_name=collection_name,
                image_path=image_path
            )
        finally:
            if saved_topk is not None:
                self.image_search.topk_each = saved_topk
    
    def temporal_image_search(
        self,
        images: Optional[List[Image.Image]] = None,
        image_paths: Optional[List[str]] = None,
        model_name: str = "siglip2",
        collection_name: Optional[str] = None,
        topk: Optional[int] = None
    ) -> Dict:
        """
        Temporal search with 2-3 images
        Args:
            images: List of PIL Image objects (2-3 items)
            image_paths: List of image paths (2-3 items)
            model_name: Model to use for search
            collection_name: Milvus collection name
            topk: Number of results per search
        """
        if not self.image_search:
            return {"mode": "TemporalImageSearch", "results": [], "error": "Image searcher not initialized"}
        
        saved_topk = getattr(self.image_search, "topk_each", None)
        try:
            if topk is not None:
                self.image_search.topk_each = int(topk)
            return self.image_search.temporal_search(
                images=images,
                image_paths=image_paths,
                model_name=model_name,
                collection_name=collection_name
            )
        finally:
            if saved_topk is not None:
                self.image_search.topk_each = saved_topk