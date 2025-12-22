import os
import time
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from vector_db import MilvusVectorDB 
from pymilvus import MilvusClient

# Resolve project root and default dense index directory robustly
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FOLDER_PATH = os.path.join(PROJECT_ROOT, "data", "index", "dense")

# Zilliz Cloud Configuration (load from environment or use defaults)
MILVUS_URI = os.getenv("ZILLIZ_CLOUD_URI", "http://milvus:19530")
MILVUS_TOKEN = os.getenv("ZILLIZ_CLOUD_TOKEN", None)
DISTANCE = "COSINE"
BATCH_SIZE = 100  # Reduced batch size to save RAM during indexing
NUM_UPLOAD_WORKERS = 1  # Parallel workers per collection (using thread-local clients)
NUM_COLLECTIONS_PARALLEL = 1  # Process collections sequentially to avoid gRPC connection conflicts

# Only load siglip2 collection
ONLY_COLLECTIONS = ["siglip2"]

def wait_for_milvus(milvus_uri: Optional[str], milvus_token: Optional[str], timeout: int = 180, interval: float = 3.0) -> bool:
    uri = milvus_uri or "http://milvus:19530"
    deadline = time.time() + timeout
    last_err = None
    while time.time() < deadline:
        try:
            if milvus_token:
                client = MilvusClient(uri=uri, token=milvus_token)
            else:
                client = MilvusClient(uri=uri)
            # simple readiness probe
            _ = client.list_collections()
            return True
        except Exception as e:
            last_err = e
            time.sleep(interval)
    print(f"Milvus/Zilliz not ready after {timeout}s at {uri}: {last_err}")
    return False


def process_single_collection(args):
    """Process a single collection - designed for parallel execution"""
    fname, folder, milvus_uri, milvus_token, distance = args
    collection_name = os.path.splitext(fname)[0]
    faiss_path = os.path.join(folder, fname)
    metadata_path = os.path.join(folder, collection_name + ".json")
    metadata_path = metadata_path if os.path.exists(metadata_path) else None

    print(f"\n=== Processing {collection_name} ===")
    
    # Check file size to estimate RAM needed
    try:
        file_size_mb = os.path.getsize(faiss_path) / (1024 * 1024)
        print(f"    FAISS file size: {file_size_mb:.1f} MB")
        print(f"    Estimated RAM needed: {file_size_mb * 1.5:.1f} MB (file + overhead)")
    except Exception:
        pass
    
    try:
        db = MilvusVectorDB(
            collection_name=collection_name,
            distance=distance,
            milvus_uri=milvus_uri,
            milvus_token=milvus_token,
            use_gpu=False,  # HNSW is CPU-based
            index_type="HNSW",  # HNSW for best search quality
            hnsw_m=32,  # Good balance between speed and accuracy
            hnsw_ef_construction=200,  # Higher = better quality index
        )

        ok = db.create_collection_from_faiss(
            faiss_file_path=faiss_path,
            metadata_file_path=metadata_path,
            batch_size=BATCH_SIZE,
            num_workers=NUM_UPLOAD_WORKERS,  # Parallel upload within collection
        )
        
        db.close()
        
        # Explicit cleanup to free RAM after upload
        del db
        import gc
        gc.collect()
        
        if ok:
            print(f"✅ Uploaded {collection_name} successfully. RAM freed.")
            return collection_name, True
        else:
            print(f"❌ Failed to upload {collection_name}.")
            return collection_name, False
    except Exception as e:
        print(f"❌ Error processing {collection_name}: {e}")
        return collection_name, False


def upload_folder_to_milvus(
    folder: str,
    milvus_uri: Optional[str] = None,
    milvus_token: Optional[str] = None,
    distance: str = "COSINE",
    parallel_collections: int = NUM_COLLECTIONS_PARALLEL,
    only_collections: Optional[list] = None,
):
    if not os.path.isdir(folder):
        print(f"❌ Folder not found: {os.path.abspath(folder)}")
        print("Tip: Ensure your dense FAISS .bin files are located under 'data/index/dense' in the project root.")
        return

    bin_files = [f for f in os.listdir(folder) if f.endswith(".bin")]
    
    # Filter only specified collections
    if only_collections:
        bin_files = [f for f in bin_files if os.path.splitext(f)[0] in only_collections]
        print(f"📌 Only loading collections: {only_collections}")
    
    bin_files.sort()

    if not bin_files:
        print(f"⚠️  Không tìm thấy .bin phù hợp trong: {folder}")
        return

    # Ensure Milvus/Zilliz is ready before starting
    if not wait_for_milvus(milvus_uri, milvus_token):
        return

    is_cloud = "zillizcloud.com" in (milvus_uri or "")
    print(f"\n🚀 Starting upload to {'Zilliz Cloud' if is_cloud else 'Milvus'} of {len(bin_files)} collections")
    print(f"   - URI: {milvus_uri or 'http://milvus:19530'}")
    print(f"   - Collections: {[os.path.splitext(f)[0] for f in bin_files]}")
    print(f"   - Parallel collections: {parallel_collections}")
    print(f"   - Workers per collection: {NUM_UPLOAD_WORKERS}")
    print(f"   - Batch size: {BATCH_SIZE} (optimized for RAM)")
    print(f"   - Index type: HNSW")
    print(f"   \n💡 RAM Optimization: Using small batch size + cleanup after each collection")
    
    # Process collections in parallel using threads (not processes)
    # Note: Using ThreadPoolExecutor instead of ProcessPoolExecutor
    # to avoid segfault issues with gRPC/Milvus client in forked processes
    args_list = [(fname, folder, milvus_uri, milvus_token, distance) for fname in bin_files]
    
    results = []
    with ThreadPoolExecutor(max_workers=parallel_collections) as executor:
        futures = {executor.submit(process_single_collection, args): args[0] for args in args_list}
        
        for future in as_completed(futures):
            fname = futures[future]
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                print(f"❌ Exception processing {fname}: {e}")
                results.append((fname, False))
    
    # Summary
    successful = sum(1 for _, ok in results if ok)
    print(f"\n{'='*50}")
    print(f"Upload Summary: {successful}/{len(bin_files)} collections uploaded successfully")
    print(f"{'='*50}")

if __name__ == "__main__":
    upload_folder_to_milvus(
        folder=FOLDER_PATH,
        milvus_uri=MILVUS_URI,
        milvus_token=MILVUS_TOKEN,
        distance=DISTANCE,
        only_collections=ONLY_COLLECTIONS,
    )
