import torch

try:
    import open_clip 
except Exception: 
    open_clip = None  
try:
    import clip as clip_lib  
except Exception: 
    clip_lib = None
from PIL import Image
from pymilvus import MilvusClient
import numpy as np
from typing import Optional

class CLIPSearcher:
    def __init__(self, milvus_uri: Optional[str] = None, url: Optional[str] = None):
        self.models = {}
        self.milvus_uri = milvus_uri or url

    def load_model(self, name: str, device: str = "cpu"):
        if name == "h14_quickgelu":
            if open_clip is None:
                raise ImportError("The 'open_clip' package is not installed. Install it or disable H14 features.")
            model, _, preprocess = open_clip.create_model_and_transforms("ViT-H-14-378-quickgelu", pretrained="dfn5b")
            tokenizer = open_clip.get_tokenizer("ViT-H-14-378-quickgelu")
            model = model.to(device).eval()
            self.models[name] = {"type": "open_clip", "model": model, "preprocess": preprocess, "tokenizer": tokenizer, "device": device}
        elif name == "bigg14_datacomp":
            if open_clip is None:
                raise ImportError("The 'open_clip' package is not installed. Install it or disable bigG features.")
            model, _, preprocess = open_clip.create_model_and_transforms("hf-hub:UCSC-VLAA/ViT-bigG-14-CLIPA-datacomp1B")
            tokenizer = open_clip.get_tokenizer("hf-hub:UCSC-VLAA/ViT-bigG-14-CLIPA-datacomp1B")
            model = model.to(device).eval()
            self.models[name] = {"type": "open_clip", "model": model, "preprocess": preprocess, "tokenizer": tokenizer, "device": device}
        else:
            raise ValueError(f"Unknown model name: {name}")

    def _encode_text(self, model_info, text: str) -> np.ndarray:
        if model_info["type"] == "clip":
            tokens = clip_lib.tokenize([text]).to(model_info["device"])
            with torch.no_grad():
                feats = model_info["model"].encode_text(tokens)
        else:
            tokens = model_info["tokenizer"]([text]).to(model_info["device"])
            with torch.no_grad():
                feats = model_info["model"].encode_text(tokens)
        x = feats.cpu().numpy().astype(np.float32)
        x = x / np.linalg.norm(x, axis=1, keepdims=True)
        return x[0]

    def _encode_image(self, model_info, image: Image.Image) -> np.ndarray:
        image = image.convert("RGB")
        tensor = model_info["preprocess"](image).unsqueeze(0).to(model_info["device"])
        with torch.no_grad():
            feats = model_info["model"].encode_image(tensor)
        x = feats.cpu().numpy().astype(np.float32)
        x = x / np.linalg.norm(x, axis=1, keepdims=True)
        return x[0]

    def _get_milvus(self, milvus_uri: Optional[str]) -> MilvusClient:
        return MilvusClient(uri=milvus_uri or self.milvus_uri or "http://localhost:19530")

    def text_search(self, model_name: str, topk: int, query: str, collection_name: str):
        if model_name not in self.models:
            raise ValueError(f"Model '{model_name}' not loaded")
        vec = self._encode_text(self.models[model_name], query)
        client = self._get_milvus(self.milvus_uri)
        res = client.search(
            collection_name=collection_name,
            data=[vec.astype(np.float32).tolist()],
            anns_field="vector",
            limit=int(topk),
            search_params={"metric_type": "COSINE"},
        )
        hits = res[0] if isinstance(res, list) else res
        out = []
        for h in hits:
            out.append({
                "id": h.get("id") if isinstance(h, dict) else getattr(h, "id", None),
                "score": float(h.get("distance") if isinstance(h, dict) else getattr(h, "distance", 0.0)),
            })
        return out

    def img_search(self, model_name: str, topk: int, image: Image.Image, collection_name: str):
        if model_name not in self.models:
            raise ValueError(f"Model '{model_name}' not loaded")
        vec = self._encode_image(self.models[model_name], image)
        client = self._get_milvus(self.milvus_uri)
        res = client.search(
            collection_name=collection_name,
            data=[vec.astype(np.float32).tolist()],
            anns_field="vector",
            limit=int(topk),
            search_params={"metric_type": "COSINE"},
        )
        hits = res[0] if isinstance(res, list) else res
        out = []
        for h in hits:
            out.append({
                "id": h.get("id") if isinstance(h, dict) else getattr(h, "id", None),
                "score": float(h.get("distance") if isinstance(h, dict) else getattr(h, "distance", 0.0)),
            })
        return out

if __name__ == "__main__":
    from PIL import Image

    URL = "http://milvus:19530"
    searcher = CLIPSearcher(url=URL)
    searcher.load_model("bigg14_datacomp", device="cpu")  # Use "cuda" if GPU available

    print("\nText search results:")
    results = searcher.text_search(
        model_name="bigg14_datacomp",
        query="a yellow construction vest",
        topk=10,
        collection_name="bigg14_datacomp"
    )
    print(results)

    print("\nImage search results:")
    image_path = "data/keyframe/L21_V001/keyframe_96.webp" 
    try:
        with Image.open(image_path) as img:
            results = searcher.img_search(
                model_name="bigg14_datacomp",
                image=img,
                topk=10, 
                collection_name="bigg14_datacomp"
            )
            print(results)
    except FileNotFoundError:
        print(f"Test image not found at {image_path}")

