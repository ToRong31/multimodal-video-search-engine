import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_KEYS = os.getenv("GEMINI_KEYS", "").split(",")
COHERE_KEYS = os.getenv("COHERE_API_KEY", "").split(",")

GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL_NAME", "gemini-pro")

# ----- Milvus Cloud (Zilliz Cloud) Configuration -----
# Use Milvus Cloud for all vector database operations
MILVUS_URI = os.getenv("MILVUS_URI", os.getenv("ZILLIZ_CLOUD_URI", "https://in03-xxxxxxxxxxxx.api.gcp-us-west1.zillizcloud.com"))
MILVUS_TOKEN = os.getenv("MILVUS_TOKEN", os.getenv("ZILLIZ_CLOUD_TOKEN", ""))

# ----- TopK configuration (override via environment) -----
def _get_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except Exception:
        return default

TOPK_NORMAL = _get_int("TOPK_NORMAL", 112)
TOPK_NORMAL_SINGLE_METHOD = _get_int("TOPK_NORMAL_SINGLE_METHOD", 168)
TOPK_TEMPORAL = _get_int("TOPK_TEMPORAL", 100)
TOPK_PREV = _get_int("TOPK_PREV", 250)
TOPK_IS = _get_int("TOPK_IS", 200)
