import torch
import json
import os
import numpy as np
from typing import List, Dict, Optional
from app.retrieve.clip import CLIPSearcher
from app.retrieve.beit3 import BEiT3Searcher
from app.retrieve.siglip2 import SigLIP2Searcher
from app.retrieve.ocr_asr_ic import ElasticSearcher
from app.retrieve.google import GoogleSearcher

from app.result.mixed_search_manager import MixedSearchManager
from app.result.mode_scene_searcher import ModeSceneSearcher
from app.result.mode_image_searcher import ModeImageSearcher
from app.result.image_search import ImageSearch



def create_searchers(
    clip_searcher: Optional[CLIPSearcher] = None,
    beit3: Optional[BEiT3Searcher] = None,
    siglip2: Optional[SigLIP2Searcher] = None,
    es: Optional[ElasticSearcher] = None,
    google_searcher: Optional[GoogleSearcher] = None,
    db_url: Optional[str] = None,
    db_token: Optional[str] = None,
    topk_each: int = 300,
    topk_final: int = 100,
    topk_prev: int = 500,
    img_search_model: str = "h14_quickgelu"
) -> MixedSearchManager:
    # Use cloud settings by default
    if db_url is None:
        try:
            from app.config.settings import MILVUS_URI
            db_url = MILVUS_URI
        except ImportError:
            db_url = "http://milvus:19530"
    
    if db_token is None:
        try:
            from app.config.settings import MILVUS_TOKEN
            db_token = MILVUS_TOKEN
        except ImportError:
            db_token = None

    mode_scene_searcher = ModeSceneSearcher(
        es=es,
        topk_each=topk_each,
        topk_final=topk_final,
        topk_prev=topk_prev
    )
    
    mode_image_searcher = ModeImageSearcher(
        clip_searcher=clip_searcher,
        beit3=beit3,
        siglip2=siglip2,
        es=es,
        google_searcher=google_searcher,
        db_url=db_url,
        db_token=db_token,
        topk_each=topk_each,
        topk_final=topk_final,
        topk_prev=topk_prev
    )
    
    if img_search_model == "siglip2":
        image_search = ImageSearch(
            siglip2_searcher=siglip2,
            db_url=db_url,
            db_token=db_token,
            topk_each=topk_final
        )
    else:
        image_search = ImageSearch(
            clip_searcher=clip_searcher,
            db_url=db_url,
            db_token=db_token,
            topk_each=topk_final
        )
    
    return MixedSearchManager(
        mode_scene_searcher=mode_scene_searcher,
        mode_image_searcher=mode_image_searcher,
        image_search=image_search
    )