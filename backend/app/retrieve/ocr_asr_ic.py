from elasticsearch import Elasticsearch
from typing import Optional, List, Dict

class ElasticSearcher:
    def __init__(self, host="http://localhost:9200", timeout=120):
        self.es = Elasticsearch(host)

    def search_text(self, index_name, query_string, size=10):
        query = {
            "query": {
                "match": {
                    "text": query_string
                }
            }
        }

        response = self.es.search(
            index=index_name,
            body={**query, "size": size}
        )
        hits = response["hits"]["hits"]
        if not hits:
            return []
        scores = [hit["_score"] for hit in hits]
        mn, mx = min(scores), max(scores)
        if mx - mn != 0:
            norm_scores = [(s - mn) / (mx - mn) for s in scores]
        else:
            norm_scores = [1.0 for _ in scores]

        return [
            {
                "id": int(hit["_id"]),
                "score": norm_score
            }
            for hit, norm_score in zip(hits, norm_scores)
        ]

if __name__ == "__main__":
    searcher = ElasticSearcher()
    text_results = searcher.search_text(
        index_name="asr",
        query_string="hello world"
    )
    print("\nText search:")
    for r in text_results:
        print(r)
