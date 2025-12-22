import cohere
import json
from typing import List, Dict
import numpy as np

class CohereReranker:
    def __init__(self, api_key: str, model: str = "rerank-english-v3.0"):
        self.client = cohere.Client(api_key)
        self.model = model
        self.meta = {}

    def load_metadata(self, path: str):
        with open(path, "r", encoding="utf-8") as f:
            self.meta = json.load(f)

    def search(
        self,
        query: str,
        ids: List[str],
        top_k: int = 5,
    ) -> List[Dict]:
        if not self.meta:
            raise ValueError("Metadata is empty. Call load_metadata(path) first.")

        docs = []
        valid_ids = []
        for i in ids:
            if i in self.meta:
                docs.append(self.meta[i])
                valid_ids.append(i)

        if not docs:
            return []

        response = self.client.rerank(
            model=self.model,
            query=query,
            documents=docs,
            top_n=min(top_k, len(docs)),
        )

        results = [
            {
                "id": valid_ids[r.index],  
                "score": r.relevance_score,
            }
            for r in response.results 
        ]

        scores = np.array([r["score"] for r in results], dtype=np.float32)
        if len(scores) > 1 and scores.max() != scores.min():
            scores = (scores - scores.min()) / (scores.max() - scores.min())
        else:
            scores = np.ones_like(scores)

        for i, r in enumerate(results):
            r["score"] = float(scores[i])

        return results

# # 1. Khởi tạo
# from app.config.settings import COHERE_KEYS
# from app.generate.gemini.api_key_manager import APIKeyManager

# mgr = APIKeyManager(COHERE_KEYS)
# reranker = CohereReranker(mgr.get_next_key())

# # 2. Load metadata 1 lần
# reranker.load_metadata("data/index/rerank/ic.json")

# # 3. Search nhiều lần
# query1 = "What causes climate change?"
# ids1 = ["0", "1", "2"]
# print(reranker.search(query1, ids1, top_k=2))

# query2 = "City skyline at sunset"
# ids2 = ["3", "4", "5"]
# print(reranker.search(query2, ids2, top_k=2))