import os
import sys

# Ensure project root is on sys.path so `app` imports work when run as a script
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.result.searchers import create_searchers
from app.retrieve.clip import CLIPSearcher
from app.retrieve.beit3 import BEiT3Searcher
from app.retrieve.siglip2 import SigLIP2Searcher
from app.retrieve.ocr_asr_ic import ElasticSearcher
from app.retrieve.google import GoogleSearcher


clip = CLIPSearcher(milvus_uri="http://milvus:19530")
# clip.load_model("bigg14_datacomp", device="cpu")
# clip.load_model("h14_quickgelu", device="cuda")

beit3 = BEiT3Searcher(milvus_uri="http://milvus:19530")
# beit3.load_model(device="cuda")

siglip2 = SigLIP2Searcher(milvus_uri="http://milvus:19530")
# siglip2.load_path_id_map()
siglip2.load_model(device="cuda")

es = ElasticSearcher(host="http://elasticsearch:9200")

google_searcher = GoogleSearcher(clip_searcher=clip)

manager = create_searchers(
    clip_searcher=clip,
    beit3=beit3,
    siglip2=siglip2,
    es=es,
    google_searcher=google_searcher,
    db_url="http://milvus:19530",
    img_search_model="siglip2"
)


if __name__ == "__main__":
    # # Test text search
    # try:
    #     print("\n=== Testing text search ===")
    #     results = manager.mixed_search(
    #         query="a dog",
    #         use_cliph14=False,
    #         use_clipbigg14=False, 
    #         use_beit3=True,
    #         use_siglip2=False,
    #         use_trans=False
    #     )
    #     print(results)
    # except Exception as e:
    #     print(f"Text search error: {e}")

    # Test image search
    try:
        print("\n=== Testing image search ===")
        from PIL import Image
        image_path = "data/keyframe/L21_V001/keyframe_0.webp"
        image = Image.open(image_path)
        results = manager.search_by_image(
            image=image,
            model_name="siglip2",
            collection_name="siglip2"
        )
        print(results)
    except FileNotFoundError:
        print(f"Test image not found at {image_path}")

    
    # # Test listing Milvus collections
    # try:
    #     print("\n=== Testing Milvus collections ===")
    #     from pymilvus import connections, utility, Collection
        
    #     # Connect to Milvus
    #     connections.connect("default", host="milvus", port="19530")
        
    #     # List all collections
    #     collections = utility.list_collections()
    #     print(f"Available collections: {collections}")
        
    #     # Get basic stats for each collection using supported APIs
    #     for collection_name in collections:
    #         try:
    #             coll = Collection(collection_name)
    #             num_entities = coll.num_entities
    #             print(f"Collection '{collection_name}': num_entities={num_entities}")
    #         except Exception as e:
    #             print(f"Error getting stats for collection '{collection_name}': {e}")
    
    # except Exception as e:
    #     print(f"Milvus collections error: {e}")

    # Collection 'h14_quickgelu': num_entities=1555846
    # Collection 'siglip2': num_entities=949262
    # Collection 'beit3': num_entities=1555846
    # Collection 'bigg14_datacomp': num_entities=1555846