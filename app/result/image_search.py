from PIL import Image
from typing import Optional, List, Dict, Any
from app.retrieve.clip import CLIPSearcher
from app.retrieve.siglip2 import SigLIP2Searcher
from app.vector_database.vector_db_manager import DatabaseManager
from app.utils.dataset import Dataset
from app.utils.create_id_group import create_id_group


class ImageSearch:    
    def __init__(
        self,
        clip_searcher: Optional[CLIPSearcher] = None,
        siglip2_searcher: Optional[SigLIP2Searcher] = None,
        db_url: str = "https://in01-cead85a4142c060.aws-us-west-2.vectordb.zillizcloud.com:19537",
        db_token: str ="26eb62fb5801c195bc36b7c06061feed24c616d702d78bea7c43baabce9abc9a8702e76ac8c2e07979ae0757f4fe0f6111d45eca",
        topk_each: int = 100
    ):
        self.clip_searcher = clip_searcher
        self.siglip2_searcher = siglip2_searcher
        self.db_manager = DatabaseManager(db_url)
        self.topk_each = topk_each
        
        self.collections = {
            "h14_quickgelu": "h14_quickgelu",
            "bigg14_datacomp": "bigg14_datacomp",
            "siglip2": "siglip2"
        }
    
    def search(
        self,
        image: Optional[Image.Image] = None,
        model_name: str = "h14_quickgelu",
        collection_name: Optional[str] = None,
        image_path: Optional[str] = None,
        db_token: str = "26eb62fb5801c195bc36b7c06061feed24c616d702d78bea7c43baabce9abc9a8702e76ac8c2e07979ae0757f4fe0f6111d45eca",
    ) -> Dict:
        if collection_name is None:
            collection_name = self.collections.get(model_name, model_name)
        
        print(f"ImageSearch - Using model: {model_name}, collection: {collection_name}")
        
        try:
            # Handle SigLIP2 search
            if model_name == "siglip2":
                if self.siglip2_searcher is None:
                    raise ValueError("SigLIP2 searcher not initialized")
                
                results = self.siglip2_searcher.img_search(
                    image=image,
                    image_path=image_path,
                    topk=self.topk_each,
                    collection_name=collection_name,
                    milvus_uri="https://in01-cead85a4142c060.aws-us-west-2.vectordb.zillizcloud.com:19537",
                    milvus_token= db_token
                )
            else:
                # Handle CLIP search
                if self.clip_searcher is None:
                    raise ValueError("CLIP searcher not initialized")

                local_image = image
                if local_image is None:
                    if image_path is None:
                        raise ValueError("Image object or image_path must be provided for CLIP search")
                    with Image.open(image_path) as pil_image:
                        local_image = pil_image.convert("RGB")
                
                results = self.clip_searcher.img_search(
                    model_name=model_name,
                    topk=self.topk_each,
                    image=local_image,
                    collection_name=collection_name,
                )
            
            formatted_results = Dataset.format_search_results(results, "image_search")
            
            return {
                "mode": "ImageSearch",
                "image_search": formatted_results
            }
            
        except Exception as e:
            print(f"Error in ImageSearch: {e}")
            return {
                "mode": "ImageSearch",
                "results": [],
                "error": str(e)
            }
    
    def temporal_search(
        self,
        images: Optional[List[Image.Image]] = None,
        image_paths: Optional[List[str]] = None,
        model_name: str = "siglip2",
        collection_name: Optional[str] = None
    ) -> Dict:
        """
        Temporal search with 2-3 images
        Args:
            images: List of PIL Image objects (2-3 items)
            image_paths: List of image paths (2-3 items) 
            model_name: Model to use for search
            collection_name: Milvus collection name
        Returns:
            Aggregated temporal search results
        """
        try:
            # Validate inputs
            image_list = []
            path_list = []
            
            if images:
                image_list = [img for img in images if img is not None]
            if image_paths:
                path_list = [path for path in image_paths if path is not None and path.strip()]
            
            # Need at least 2 valid images
            total_items = max(len(image_list), len(path_list))
            if total_items < 2:
                return {
                    "mode": "TemporalImageSearch",
                    "error": "Temporal image search requires at least 2 images"
                }
            
            print(f"🖼️ Temporal Image Search: {total_items} images")
            
            # Search each image individually
            formatted_results: Dict[str, Dict[str, List[Dict]]] = {}
            
            for idx in range(total_items):
                q_key = f"q{idx}"
                formatted_results[q_key] = {}
                
                # Get image and path for this index
                current_image = image_list[idx] if idx < len(image_list) else None
                current_path = path_list[idx] if idx < len(path_list) else None
                
                if current_image is None and current_path is None:
                    continue
                
                # Perform single image search
                result = self.search(
                    image=current_image,
                    model_name=model_name,
                    collection_name=collection_name,
                    image_path=current_path
                )
                
                # Extract results
                image_results = result.get("image_search", [])
                
                # Store in temporal format
                formatted_results[q_key][f"q{idx}_0"] = image_results
                formatted_results[q_key][f"ensemble_all_q{idx}"] = image_results
            
            # Use create_id_group to aggregate results (similar to temporal text search)
            final_results = create_id_group("B", formatted_results, n_items=total_items)
            
            return final_results
            
        except Exception as e:
            print(f"Error in Temporal ImageSearch: {e}")
            import traceback
            traceback.print_exc()
            return {
                "mode": "TemporalImageSearch",
                "results": [],
                "error": str(e)
            }
