import json
import os
import pickle
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import List, Optional

import numpy as np
from PIL import Image

import torch
from transformers import AutoModel, AutoProcessor
from pymilvus import MilvusClient
from tqdm import tqdm


def _process_single_entry(key, entry, base_dir: Path, project_root: Path) -> dict:
    result = {}

    try:
        path_str = entry if isinstance(entry, str) else entry.get("path") or entry.get("uri") or entry.get("url")
    except AttributeError:
        path_str = None

    if not path_str:
        return result

    try:
        key_int = int(key)
    except (TypeError, ValueError):
        return result

    try:
        candidate = base_dir / path_str
        abs_path = candidate.resolve()
    except Exception:
        try:
            abs_path = (project_root / path_str).resolve()
        except Exception:
            return result

    str_abs = str(abs_path)
    result[str_abs] = key_int

    try:
        rel = abs_path.relative_to(project_root)
    except (ValueError, Exception):
        return result

    rel_str = str(rel)
    result[rel_str] = key_int

    if "data/keyframe/" in rel_str:
        suffix = rel_str.split("data/keyframe/", 1)[-1]
        result[suffix] = key_int

    return result


def _build_path_map_chunk(chunk, base_dir_str: str, project_root_str: str) -> dict:
    base_dir = Path(base_dir_str)
    project_root = Path(project_root_str)
    chunk_map = {}

    for key, entry in chunk:
        chunk_map.update(_process_single_entry(key, entry, base_dir, project_root))

    return chunk_map


class SigLIP2Searcher:
    _path_id_map = None

    def __init__(self,
                 model_repo: str = "google/siglip2-giant-opt-patch16-384",
                 model_tag: str = "siglip2_giant_opt_p16_384",
                 batch_size: int = 32,
                 strict_fp32: bool = True,
                 disable_tf32: bool = True,
                 cudnn_benchmark: bool = True,
                 use_fast: bool = True,
                 milvus_uri: Optional[str] = None,
                 milvus_token: Optional[str] = None,
                 url: Optional[str] = None):
        self.model_repo = model_repo
        self.model_tag = model_tag
        self.batch_size = int(batch_size)
        self.device = torch.device("cpu")
        self.model = None
        self.processor = None

        self.milvus_uri = milvus_uri or url
        self.milvus_token = milvus_token

        self.strict_fp32 = strict_fp32
        self.disable_tf32 = disable_tf32
        self.cudnn_benchmark = cudnn_benchmark
        self.use_fast = use_fast

    def load_model(self, device: str = "cuda"):
        self.device = torch.device(device if device in ("cuda", "cpu") else "cpu")

        torch.backends.cudnn.benchmark = self.cudnn_benchmark
        if self.disable_tf32 and torch.cuda.is_available():
            torch.backends.cuda.matmul.allow_tf32 = False
            torch.backends.cudnn.allow_tf32 = False

        self.model = AutoModel.from_pretrained(self.model_repo)
        self.processor = AutoProcessor.from_pretrained(self.model_repo, use_fast=self.use_fast)

        if self.strict_fp32:
            self.model = self.model.float()

        self.model = self.model.to(self.device).eval()


    @classmethod
    def load_path_id_map(cls) -> dict:
        if cls._path_id_map is not None:
            return cls._path_id_map

        metadata_path = Path(__file__).resolve().parents[2] / "data" / "metadata" / "path_keyframe.json"
        path_map = {}

        if not metadata_path.exists():
            cls._path_id_map = path_map
            return cls._path_id_map

        cache_path = metadata_path.with_suffix(".cache.pkl")

        try:
            metadata_mtime = metadata_path.stat().st_mtime
        except OSError as exc:
            print(f"[SigLIP2] Failed to stat metadata file: {exc}")
            metadata_mtime = None

        if cache_path.exists() and metadata_mtime is not None:
            try:
                with open(cache_path, "rb") as f:
                    cached = pickle.load(f)
            except Exception as exc:
                print(f"[SigLIP2] Failed to load cache: {exc}")
            else:
                cached_mtime = cached.get("metadata_mtime") if isinstance(cached, dict) else None
                cached_map = cached.get("path_map") if isinstance(cached, dict) else None
                if isinstance(cached_map, dict) and cached_mtime == metadata_mtime:
                    cls._path_id_map = cached_map
                    return cls._path_id_map

        base_dir = metadata_path.parent
        project_root = Path(__file__).resolve().parents[2]

        try:
            with open(metadata_path, "r", encoding="utf-8") as f:
                raw = json.load(f)
        except Exception as exc:
            print(f"[SigLIP2] Failed to load path_keyframe metadata: {exc}")
            cls._path_id_map = path_map
            return cls._path_id_map

        iterable = raw.items() if isinstance(raw, dict) else enumerate(raw)
        items = list(iterable)
        total_items = len(items)

        if total_items == 0:
            cls._path_id_map = path_map
            return cls._path_id_map

        cpu_count = os.cpu_count() or 1
        use_parallel = cpu_count > 1 and total_items >= 10000

        if use_parallel:
            max_workers = min(cpu_count, 8)
            chunk_size = max(1000, total_items // (max_workers * 4))
            chunks = [items[i:i + chunk_size] for i in range(0, total_items, chunk_size)]

            with ProcessPoolExecutor(max_workers=max_workers) as executor:
                future_to_size = {}
                for chunk in chunks:
                    future = executor.submit(
                        _build_path_map_chunk,
                        chunk,
                        str(base_dir),
                        str(project_root)
                    )
                    future_to_size[future] = len(chunk)

                with tqdm(total=total_items, desc="Building path-id map (parallel)", unit="items") as progress:
                    for future in as_completed(future_to_size):
                        chunk_len = future_to_size[future]
                        try:
                            chunk_map = future.result()
                        except Exception as exc:
                            print(f"[SigLIP2] Worker failed: {exc}")
                            chunk_map = {}
                        path_map.update(chunk_map)
                        progress.update(chunk_len)
        else:
            for key, entry in tqdm(items, total=total_items, desc="Building path-id map"):
                path_map.update(_process_single_entry(key, entry, base_dir, project_root))

        cls._path_id_map = path_map

        if metadata_mtime is None:
            try:
                metadata_mtime = metadata_path.stat().st_mtime
            except OSError:
                metadata_mtime = None

        if metadata_mtime is not None:
            try:
                with open(cache_path, "wb") as f:
                    pickle.dump({
                        "metadata_mtime": metadata_mtime,
                        "path_map": path_map,
                    }, f, protocol=pickle.HIGHEST_PROTOCOL)
            except Exception as exc:
                print(f"[SigLIP2] Failed to write cache: {exc}")

        return cls._path_id_map

    @classmethod
    def find_id_for_path(cls, image_path: Optional[str]) -> Optional[int]:
        if not image_path:
            return None
        print("Finding id for path...")
        mapping = cls.load_path_id_map()
        print("Mapping loaded")
        candidates = []
        try:
            candidates.append(str(Path(image_path).resolve()))
        except Exception:
            pass

        candidates.append(str(image_path))

        for candidate in candidates:
            if candidate in mapping:
                return mapping[candidate]

        # also try project-relative path if possible
        try:
            project_root = Path(__file__).resolve().parents[2]
            rel = Path(candidate).resolve().relative_to(project_root)
            rel_str = str(rel)
            return mapping.get(rel_str)
        except Exception:
            return None

    def vector_from_id(self, collection_name: str, entity_id: int, milvus_uri: Optional[str] = None, milvus_token: Optional[str] = None) -> Optional[np.ndarray]:
        client = self._get_milvus(milvus_uri, milvus_token)
        try:
            res = client.query(
                collection_name=collection_name,
                filter=f"id in [{int(entity_id)}]",
                output_fields=["vector"],
                limit=1,
            )
        except Exception as exc:
            print(f"[SigLIP2] Failed to fetch vector for id {entity_id}: {exc}")
            return None

        if not res:
            return None

        first = res[0]
        vec = None

        if isinstance(first, dict):
            vec = first.get("vector")
            if vec is None:
                entity = first.get("entity")
                if isinstance(entity, dict):
                    vec = entity.get("vector")
                elif hasattr(entity, "get"):
                    vec = entity.get("vector")
        else:
            if hasattr(first, "get"):
                vec = first.get("vector")
            if vec is None and hasattr(first, "entity"):
                entity = getattr(first, "entity")
                if isinstance(entity, dict):
                    vec = entity.get("vector")
                elif hasattr(entity, "get"):
                    vec = entity.get("vector")
                elif hasattr(entity, "vector"):
                    vec = getattr(entity, "vector")

        if vec is None:
            return None

        return np.asarray(vec, dtype=np.float32)

    @torch.inference_mode()
    def _encode_text(self, texts: List[str]) -> np.ndarray:
        assert self.model is not None and self.processor is not None, "Hãy gọi load_model() trước."
        inputs = self.processor(
            text=texts,
            padding="max_length",
            max_length=64,
            truncation=True,
            return_tensors="pt"
        ).to(self.device)
        feats = self.model.get_text_features(**inputs)          # (B, D)
        feats = torch.nn.functional.normalize(feats.float(), dim=-1)
        return feats.cpu().numpy().astype(np.float32)

    @torch.inference_mode()
    def _encode_image(self, images, l2norm: bool = True) -> np.ndarray:
        """
        Encode images to feature vectors.
        Args:
            images: Can be either a path, a PIL image, or a list of those
            l2norm: whether to apply L2 normalization on feature vectors
        """
        assert self.model is not None and self.processor is not None, "Hãy gọi load_model() trước."

        if images is None:
            return np.empty((0, 0), dtype=np.float32)

        # Normalize input into a list
        if isinstance(images, (Image.Image, str)):
            items = [images]
        elif isinstance(images, list):
            items = images
        else:
            raise ValueError(f"Unsupported image input type: {type(images)}")

        features = []
        for item in items:
            if isinstance(item, str):
                with Image.open(item) as im:
                    pil_img = im.convert("RGB")
            elif isinstance(item, Image.Image):
                pil_img = item.convert("RGB")
            else:
                raise ValueError(f"Expected PIL Image or path string, got {type(item)}")

            inputs = self.processor(images=[pil_img], return_tensors="pt").to(self.device)
            feats = self.model.get_image_features(**inputs).float()   # (1, D)
            if l2norm:
                feats = torch.nn.functional.normalize(feats, dim=-1)
            features.append(feats[0].cpu().numpy().astype(np.float32))

        if not features:
            # xác định D bằng pass giả
            dummy = Image.new("RGB", (384, 384))
            inputs = self.processor(images=[dummy], return_tensors="pt").to(self.device)
            D = int(self.model.get_image_features(**inputs).shape[-1])
            return np.empty((0, D), dtype=np.float32)

        return np.stack(features, axis=0)

    def _get_milvus(self, milvus_uri: Optional[str] = None, milvus_token: Optional[str] = None) -> MilvusClient:
        uri = milvus_uri or self.milvus_uri or "http://localhost:19530"
        token = milvus_token or self.milvus_token
        if token:
            return MilvusClient(uri=uri, token=token)
        return MilvusClient(uri=uri)

    def text_search(
        self,
        query: str,
        topk: int = 5,
        collection_name: str = "siglip2",
        milvus_uri: Optional[str] = None,
        milvus_token: Optional[str] = None,
    ):

        vec = self._encode_text([query])[0]  # (D,)
        client = self._get_milvus(milvus_uri, milvus_token)
        res = client.search(
            collection_name=collection_name,
            data=[vec.tolist()],
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

    def img_search(
        self,
        image=None,
        image_path: Optional[str] = None,
        topk: int = 5,
        collection_name: str = "siglip2",
        milvus_uri: Optional[str] = None,
        milvus_token: Optional[str] = None,
    ):
        """
        Search using an image.
        Args:
            image: PIL.Image.Image object (preferred)
            image_path: str path to image file (legacy support)
            topk: number of top results
            collection_name: Milvus collection name
            milvus_uri: Milvus URI (optional)
            milvus_token: Milvus token for Zilliz Cloud (optional)
        """
        # Support both new (image) and legacy (image_path) parameters
        if image is None and image_path is None:
            raise ValueError("Either 'image' or 'image_path' must be provided")

        vec = None

        path_id = self.find_id_for_path(str(image_path) if image_path is not None else None)
        # print(f"Path ID: {path_id}")

        if path_id is not None:
            vec = self.vector_from_id(collection_name=collection_name, entity_id=path_id, milvus_uri=milvus_uri, milvus_token=milvus_token)

        if vec is None:
            if image is not None:
                feats = self._encode_image(image)
            else:
                feats = self._encode_image([image_path])

            if feats.shape[0] == 0:
                return []

            vec = feats[0]

        # print(f"vec: {vec}")

        client = self._get_milvus(milvus_uri, milvus_token)
        res = client.search(
            collection_name=collection_name,
            data=[vec.tolist()],
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
    URL = "http://milvus:19530"
    searcher = SigLIP2Searcher(
        url=URL,
        use_fast=True,
    )
    searcher.load_model(device="cpu")  # đổi thành "cuda" nếu có GPU

    # # Ví dụ:
    # results = searcher.text_search("a dog", topk=100, collection_name="siglip2")
    # print(results)
    # print(len(results))

    # Test image search
    from PIL import Image
    test_image_path = "data/keyframe/L21_V001/keyframe_174.webp"
    try:
        # test_image = Image.open(test_image_path)
        img_results = searcher.img_search(
            image_path=test_image_path,
            topk=5,
            collection_name="siglip2",
            milvus_uri=URL
        )
        print("\n=== Image Search Results ===")
        print(img_results)
        print(f"Found {len(img_results)} results")
    except FileNotFoundError:
        print(f"Test image not found at {test_image_path}")
    except Exception as e:
        print(f"Image search test error: {e}")
