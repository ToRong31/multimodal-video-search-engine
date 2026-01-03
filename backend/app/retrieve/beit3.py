import os
import re
import json
from typing import List, Tuple, Optional

import numpy as np
from PIL import Image

import torch
import torch.nn as nn
import torch.nn.functional as F

from torchvision import transforms
from torchvision.transforms import InterpolationMode
from timm.data.constants import IMAGENET_DEFAULT_MEAN, IMAGENET_DEFAULT_STD
from timm.models.layers import trunc_normal_ as trunc_normal_fn

from transformers import XLMRobertaTokenizer
from huggingface_hub import hf_hub_download

from pymilvus import MilvusClient


class BEiT3Searcher:
    class _BEiT3Wrapper(nn.Module):
        def __init__(self, args):
            super().__init__()
            self.args = args
            from torchscale.model.BEiT3 import BEiT3
            self.beit3 = BEiT3(args)
            self.apply(self._init_weights)

        def _init_weights(self, m):
            if isinstance(m, nn.Linear):
                trunc_normal_fn(m.weight, std=.02)
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.LayerNorm):
                nn.init.constant_(m.bias, 0)
                nn.init.constant_(m.weight, 1.0)

    class _BEiT3ForRetrieval(_BEiT3Wrapper):
        def __init__(self, args):
            super().__init__(args)
            d = args.encoder_embed_dim
            self.language_head = nn.Linear(d, d, bias=False)
            self.vision_head   = nn.Linear(d, d, bias=False)
            for m in [self.language_head, self.vision_head]:
                self._init_weights(m)

        @torch.no_grad()
        def forward(self, image=None, text_description=None, text_padding_position=None):
            v_cls = t_cls = None
            if image is not None:
                out = self.beit3(textual_tokens=None, visual_tokens=image, text_padding_position=None)
                v = self.vision_head(out["encoder_out"][:, 0])
                v_cls = F.normalize(v, dim=-1)
            if text_description is not None:
                out = self.beit3(textual_tokens=text_description, visual_tokens=None, text_padding_position=text_padding_position)
                t = self.language_head(out["encoder_out"][:, 0])
                t_cls = F.normalize(t, dim=-1)
            return v_cls, t_cls

    def __init__(self, repo_id: str = "Quintu/beit3", milvus_uri: Optional[str] = None, milvus_token: Optional[str] = None, url: Optional[str] = None):
        self.repo_id = repo_id
        self.device = torch.device("cpu")
        self.model: Optional[nn.Module] = None
        self.tokenizer: Optional[XLMRobertaTokenizer] = None
        self.milvus_uri = milvus_uri or url
        self.milvus_token = milvus_token
        self.image_transform = transforms.Compose([
            transforms.Resize(384, interpolation=InterpolationMode.BICUBIC),
            transforms.CenterCrop(384),
            transforms.ToTensor(),
            transforms.Normalize(mean=IMAGENET_DEFAULT_MEAN, std=IMAGENET_DEFAULT_STD),
        ])
        self.max_text_len = 64

    def load_model(
        self,
        device: str = "cuda",
        ckpt_filename: str = "beit3_large_patch16_384_coco_retrieval.pth",
        spm_filename: str = "beit3.spm",
    ):
        self.device = torch.device(device if device in ("cuda", "cpu") else "cpu")

        ckpt_path = hf_hub_download(self.repo_id, filename=ckpt_filename)
        spm_path  = hf_hub_download(self.repo_id, filename=spm_filename)

        args = self._get_large_config(img_size=384)
        self.model = self._BEiT3ForRetrieval(args).to(self.device)
        state = torch.load(ckpt_path, map_location="cpu")
        state_dict = state.get("model", state)
        self.model.load_state_dict(state_dict, strict=False)
        self.model.eval()

        self.tokenizer = XLMRobertaTokenizer(spm_path, use_fast=False)

    @torch.no_grad()
    def encode_text(self, texts: List[str]) -> np.ndarray:
        assert self.model is not None and self.tokenizer is not None, "Hãy gọi load_model() trước."
        enc = self.tokenizer(
            texts,
            padding="max_length",
            truncation=True,
            max_length=self.max_text_len,
            add_special_tokens=True,
            return_tensors="pt",
        )
        input_ids = enc["input_ids"].to(self.device)
        pad_mask  = (enc["attention_mask"] == 0).to(self.device).bool()

        use_fp16 = (self.device.type == "cuda")
        with torch.autocast(device_type=("cuda" if use_fp16 else "cpu"),
                            dtype=torch.float16, enabled=use_fp16):
            _, t = self.model(text_description=input_ids, text_padding_position=pad_mask)
        return t.float().cpu().numpy()  # (B, 1024), L2-normalized

    @torch.no_grad()
    def encode_image_paths(self, image_paths: List[str]) -> np.ndarray:
        assert self.model is not None, "Hãy gọi load_model() trước."
        imgs = []
        for p in image_paths:
            im = Image.open(p).convert("RGB")
            imgs.append(self.image_transform(im))
        batch = torch.stack(imgs, dim=0).to(self.device)

        use_fp16 = (self.device.type == "cuda")
        with torch.autocast(device_type=("cuda" if use_fp16 else "cpu"),
                            dtype=torch.float16, enabled=use_fp16):
            v, _ = self.model(image=batch)
        return v.float().cpu().numpy()  # (B, 1024), L2-normalized

    def _get_milvus(self, milvus_uri: Optional[str] = None, milvus_token: Optional[str] = None) -> MilvusClient:
        uri = milvus_uri or self.milvus_uri or "http://localhost:19530"
        token = milvus_token or self.milvus_token
        if token:
            return MilvusClient(uri=uri, token=token)
        return MilvusClient(uri=uri)

    def text_search(
        self,
        query: str,
        topk: int = 100,
        collection_name: str = "beit3",
        milvus_token: Optional[str] = None,
    ) -> List[dict]:
        client = self._get_milvus(self.milvus_uri, milvus_token)

        vec = self.encode_text([query])[0]  # (1024,)
        res = client.search(
            collection_name=collection_name,
            data=[vec.astype(np.float32).tolist()],
            anns_field="vector",
            limit=int(topk),
            search_params={"metric_type": "COSINE"},
        )
        hits = res[0] if isinstance(res, list) else res
        out: List[dict] = []
        for h in hits:
            out.append({
                "id": h.get("id") if isinstance(h, dict) else getattr(h, "id", None),
                "score": float(h.get("distance") if isinstance(h, dict) else getattr(h, "distance", 0.0)),
            })
        return out

    @staticmethod
    def _get_large_config(img_size=384, patch_size=16, drop_path_rate=0.0, mlp_ratio=4, vocab_size=64010):
        from torchscale.architecture.config import EncoderConfig
        return EncoderConfig(
            img_size=img_size, patch_size=patch_size, vocab_size=vocab_size, multiway=True,
            layernorm_embedding=False, normalize_output=True, no_output_layer=True,
            drop_path_rate=drop_path_rate, encoder_embed_dim=1024, encoder_attention_heads=16,
            encoder_ffn_embed_dim=int(1024 * mlp_ratio), encoder_layers=24, checkpoint_activations=None,
        )

if __name__ == "__main__":
    URL = "http://milvus:19530"
    searcher = BEiT3Searcher(url=URL)
    searcher.load_model(device="cpu")
    print(searcher.text_search(query="a dog", 
                               topk=100,
                               collection_name="beit3"))