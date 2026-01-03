from typing import Dict, Optional
from app.vector_database.vector_db import MilvusVectorDB

class DatabaseManager:
    
    def __init__(self, milvus_uri: Optional[str] = None, milvus_token: Optional[str] = None):
        # Import here to avoid circular dependency
        try:
            from app.config.settings import MILVUS_URI, MILVUS_TOKEN
            self.milvus_uri = milvus_uri or MILVUS_URI
            self.milvus_token = milvus_token or MILVUS_TOKEN
        except ImportError:
            # Fallback if settings not available
            self.milvus_uri = milvus_uri or "http://milvus:19530"
            self.milvus_token = milvus_token
        self._collections: Dict[str, MilvusVectorDB] = {}
        
        self.collection_configs = {
            "h14_quickgelu": {
                "vector_size": 1024,
                "distance": "COSINE",
                "collection_name": "h14_quickgelu"
            },
            "bigg14_datacomp": {
                "vector_size": 1280,
                "distance": "COSINE",
                "collection_name": "bigg14_datacomp"
            },
            "beit3": {
                "vector_size": 1024,
                "distance": "COSINE",
                "collection_name": "beit3"
            },
            "siglip2": {
                "vector_size": 1536,
                "distance": "COSINE",
                "collection_name": "siglip2"
            }
        }   
    
    def get_collection(self, collection_key: str, use_gpu: bool = True, index_type: str = "HNSW") -> MilvusVectorDB:
        """
        Get or create a MilvusVectorDB instance for the specified collection
        
        Args:
            collection_key: Key for the collection (e.g., 'vc', 'ic', 'h14_quickgelu')
            use_gpu: Whether to use GPU index if available
            index_type: Index type to use (HNSW, AUTOINDEX, etc.)
            
        Returns:
            MilvusVectorDB instance
        """
        if collection_key not in self._collections:
            if collection_key not in self.collection_configs:
                raise ValueError(f"Unknown collection key: {collection_key}")
            
            config = self.collection_configs[collection_key]
            self._collections[collection_key] = MilvusVectorDB(
                collection_name=config["collection_name"],
                vector_size=config["vector_size"],
                distance=config["distance"],
                milvus_uri=self.milvus_uri,
                milvus_token=self.milvus_token,
                use_gpu=use_gpu,
                index_type=index_type,
                hnsw_m=16,
                hnsw_ef_construction=200,
            )
        
        return self._collections[collection_key]
    
    def get_custom_collection(
        self, 
        collection_name: str, 
        vector_size: int, 
        distance: str = "COSINE",
        use_gpu: bool = True,
        index_type: str = "HNSW"
    ) -> MilvusVectorDB:
        """
        Get or create a custom MilvusVectorDB instance
        
        Args:
            collection_name: Name of the collection
            vector_size: Size of the vectors
            distance: Distance metric to use
            use_gpu: Whether to use GPU index if available
            index_type: Index type to use (HNSW, AUTOINDEX, etc.)
            
        Returns:
            MilvusVectorDB instance
        """
        key = f"custom_{collection_name}"
        if key not in self._collections:
            self._collections[key] = MilvusVectorDB(
                collection_name=collection_name,
                vector_size=vector_size,
                distance=distance,
                milvus_uri=self.milvus_uri,
                milvus_token=self.milvus_token,
                use_gpu=use_gpu,
                index_type=index_type,
                hnsw_m=16,
                hnsw_ef_construction=200,
            )
        
        return self._collections[key]
    
    def list_collections(self) -> list:
        """List all available collection keys"""
        return list(self.collection_configs.keys())
    
    def get_collection_info(self, collection_key: str) -> Optional[Dict]:
        """Get information about a specific collection"""
        if collection_key in self.collection_configs:
            return self.collection_configs[collection_key].copy()
        return None
    
    def update_milvus_uri(self, new_uri: str):
        """Update the Milvus URI and clear cached connections"""
        self.milvus_uri = new_uri
        self._collections.clear()
    
    def close_all_connections(self):
        """Close all database connections"""
        for collection in self._collections.values():
            try:
                # Close if the vector DB exposes a close method
                if hasattr(collection, 'close'):
                    collection.close()
            except Exception as e:
                print(f"Warning: Error closing collection connection: {e}")
        
        self._collections.clear()
