import os
import json
import logging
from typing import Optional, Dict, List
from concurrent.futures import ThreadPoolExecutor, as_completed
import numpy as np
import faiss
from pymilvus import MilvusClient, DataType


class MilvusVectorDB:
    def __init__(
        self,
        collection_name: str = "video_vectors",
        vector_size: int = 768,
        distance: str = "COSINE",  # one of: "COSINE", "IP", "L2"
        milvus_uri: Optional[str] = None,
        milvus_token: Optional[str] = None,  # For Zilliz Cloud authentication
        use_gpu: bool = True,  # Auto-detect and use GPU if available
        index_type: str = "HNSW",  # HNSW for better performance
        hnsw_m: int = 48,  # HNSW M parameter (4-64)
        hnsw_ef_construction: int = 200,  # HNSW efConstruction (8-512)
    ):
        self.logger = logging.getLogger(__name__)
        self.collection_name = collection_name
        self.vector_size = vector_size
        self.distance = (distance or "COSINE").upper()
        self.milvus_uri = milvus_uri or self._pick_milvus_uri()
        self.milvus_token = milvus_token
        
        # Create client with token if provided (for Zilliz Cloud)
        if self.milvus_token:
            self.client = MilvusClient(uri=self.milvus_uri, token=self.milvus_token)
        else:
            self.client = MilvusClient(uri=self.milvus_uri)
            
        self.use_gpu = use_gpu
        self.index_type = index_type
        self.hnsw_m = hnsw_m
        self.hnsw_ef_construction = hnsw_ef_construction

    def _pick_milvus_uri(self) -> str:
        candidates = ("http://milvus:19530", "http://localhost:19530")
        for uri in candidates:
            try:
                tmp = MilvusClient(uri=uri)
                _ = tmp.list_collections()
                self.logger.info(f"Using Milvus at {uri}")
                return uri
            except Exception:
                continue
        self.logger.warning("No Milvus reachable. Defaulting to http://milvus:19530")
        return "http://milvus:19530"
    
    def _check_gpu_available(self) -> bool:
        """Check if GPU index is available in Milvus"""
        try:
            # Try to get server info to check GPU support
            # This is a simple check - in production you might query Milvus capabilities
            import subprocess
            result = subprocess.run(['nvidia-smi'], capture_output=True, text=True, timeout=2)
            return result.returncode == 0
        except Exception:
            return False

    def _ensure_collection(self, vector_dim: int) -> bool:
        try:
            if self.collection_name in self.client.list_collections():
                return True

            schema = self.client.create_schema(auto_id=False, description=f"Vectors for {self.collection_name}")
            schema.add_field(field_name="id", datatype=DataType.INT64, is_primary=True)
            schema.add_field(field_name="vector", datatype=DataType.FLOAT_VECTOR, dim=int(vector_dim))
            schema.add_field(field_name="payload", datatype=DataType.JSON)

            index_params = self.client.prepare_index_params()
            
            # Note: HNSW does not have GPU version - it's CPU-only but very fast
            # GPU indexes available: GPU_IVF_FLAT, GPU_IVF_PQ, GPU_CAGRA (Milvus 2.4+)
            
            # Priority: HNSW (best quality) > GPU_IVF_FLAT (if GPU requested) > AUTOINDEX
            if self.index_type == "HNSW":
                # HNSW provides excellent search performance on CPU
                index_params.add_index(
                    field_name="vector",
                    index_type="HNSW",
                    metric_type=self.distance,
                    params={
                        "M": self.hnsw_m,  # Max number of connections per layer
                        "efConstruction": self.hnsw_ef_construction  # Search scope during construction
                    }
                )
                self.logger.info(f"Using HNSW index (M={self.hnsw_m}, ef={self.hnsw_ef_construction}) for {self.collection_name}")
            elif self.use_gpu and self._check_gpu_available() and self.index_type == "GPU_IVF_FLAT":
                # GPU_IVF_FLAT for GPU-accelerated search (user must explicitly set index_type="GPU_IVF_FLAT")
                index_params.add_index(
                    field_name="vector",
                    index_type="GPU_IVF_FLAT",
                    metric_type=self.distance,
                    params={"nlist": 1024}  # Number of cluster units
                )
                self.logger.info(f"Using GPU_IVF_FLAT index for {self.collection_name}")
            else:
                # Fallback to AUTOINDEX (Milvus will choose best index automatically)
                index_params.add_index(
                    field_name="vector",
                    index_type="AUTOINDEX",
                    metric_type=self.distance,
                )
                self.logger.info(f"Using AUTOINDEX for {self.collection_name}")

            self.client.create_collection(
                collection_name=self.collection_name,
                schema=schema,
                index_params=index_params,
                enable_dynamic_field=True,
            )
            return True
        except Exception as e:
            self.logger.error(f"_ensure_collection error: {e}")
            return False

    def create_collection_from_faiss(
        self,
        faiss_file_path: str,
        metadata_file_path: Optional[str] = None,
        batch_size: int = 500,
        num_workers: int = 4,  # Number of parallel upload workers
    ) -> bool:
        try:
            index = faiss.read_index(faiss_file_path)
            dim = index.d
            metadata: Dict[str, Dict] = {}
            if metadata_file_path and os.path.exists(metadata_file_path):
                with open(metadata_file_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
            if not self._ensure_collection(dim):
                return False
            return self._upload_from_faiss(index, metadata, batch_size=batch_size, num_workers=num_workers)
        except Exception as e:
            self.logger.error(f"create_collection_from_faiss error: {e}")
            return False

    def _upload_from_faiss(self, index: faiss.Index, metadata: Dict, batch_size: int = 500, num_workers: int = 4) -> bool:
        total = index.ntotal
        self.logger.info(f"Uploading {total} vectors to '{self.collection_name}' with {num_workers} parallel workers")

        def reconstruct_range(i0: int, i1: int) -> np.ndarray:
            try:
                return index.reconstruct_n(i0, i1 - i0)
            except Exception:
                out = np.empty((i1 - i0, index.d), dtype="float32")
                for k, pid in enumerate(range(i0, i1)):
                    try:
                        out[k] = index.reconstruct(pid)
                    except Exception:
                        out[k].fill(0.0)
                return out

        def process_batch(batch_info):
            """Process a single batch - to be run in parallel
            Each thread creates its own MilvusClient to avoid connection conflicts
            """
            i, j = batch_info
            try:
                # Create a new client for this thread to avoid "closed channel" errors
                if self.milvus_token:
                    thread_client = MilvusClient(uri=self.milvus_uri, token=self.milvus_token)
                else:
                    thread_client = MilvusClient(uri=self.milvus_uri)
                
                vecs = reconstruct_range(i, j)
                entities: List[Dict] = []
                for off, v in enumerate(vecs):
                    pid = i + off
                    ent: Dict = {
                        "id": int(pid), 
                        "vector": v.astype(np.float32).tolist(), 
                        "payload": metadata.get(str(pid)) or {}
                    }
                    entities.append(ent)
                
                # Use thread-local client for insertion
                thread_client.insert(self.collection_name, data=entities)
                return True, i, j
            except Exception as e:
                self.logger.error(f"Batch [{i}:{j}] error: {e}")
                return False, i, j

        try:
            # Create batch ranges
            batch_ranges = []
            for i in range(0, total, batch_size):
                j = min(i + batch_size, total)
                batch_ranges.append((i, j))
            
            # Upload batches in parallel
            success_count = 0
            with ThreadPoolExecutor(max_workers=num_workers) as executor:
                futures = {executor.submit(process_batch, batch_range): batch_range for batch_range in batch_ranges}
                
                for future in as_completed(futures):
                    success, i, j = future.result()
                    if success:
                        success_count += 1
                        if success_count % 20 == 0:
                            self.logger.info(f"Inserted {success_count}/{len(batch_ranges)} batches ({j}/{total} vectors)")
            
            self.logger.info(f"Upload complete: {success_count}/{len(batch_ranges)} batches successful")
            return success_count == len(batch_ranges)
        except Exception as e:
            self.logger.error(f"_upload_from_faiss error: {e}")
            return False

    def search(self, query_vector: np.ndarray, limit: int = 10, with_payload: bool = True, ef: Optional[int] = None) -> List[Dict]:
        try:
            self._ensure_collection(self.vector_size)
            qv = query_vector.astype(np.float32).tolist()
            
            # Build search params based on index type
            search_params = {"metric_type": self.distance}
            if self.index_type == "HNSW":
                # ef controls search quality/speed tradeoff (higher = better quality, slower)
                # Default: max(limit * 2, 100) - can be overridden by passing ef parameter
                search_params["ef"] = ef or max(limit * 2, 150)  # Increased default from 100 to 150
            elif self.use_gpu and self._check_gpu_available():
                search_params["nprobe"] = 128  # Number of clusters to search for GPU index
            
            res = self.client.search(
                collection_name=self.collection_name,
                data=[qv],
                anns_field="vector",
                limit=int(limit),
                output_fields=["payload"] if with_payload else [],
                search_params=search_params,
            )
            # MilvusClient returns a list of hits per query → res[0]
            hits = res[0] if isinstance(res, list) else res
            out: List[Dict] = []
            for h in hits:
                out.append({
                    "id": h.get("id") if isinstance(h, dict) else getattr(h, "id", None),
                    "score": float(h.get("distance") if isinstance(h, dict) else getattr(h, "distance", 0.0)),
                    "payload": (h.get("entity", {}) or {}).get("payload") if isinstance(h, dict) else getattr(getattr(h, "entity", {}), "payload", None),
                })
            return out
        except Exception as e:
            self.logger.error(f"search error: {e}")
            return []

    def close(self):
        try:
            # MilvusClient does not require explicit close, but keep for symmetry
            if hasattr(self.client, "close"):
                self.client.close()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()