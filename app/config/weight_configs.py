from typing import Dict, List, Tuple, Optional

# Base weights for individual methods
BASE_WEIGHTS = {
    "clip_h14": 1.0,
    "clip_bigg14": 1.0,
    "img_cap": 0.8,
    "beit3": 1.0,
    "ocr": 0.8,
    "gg": 0.6
}

ENSEMBLE_WEIGHT_CONFIGS = {
    # Single method configurations
    "clip_h14": {
        "clip_h14": 1.0
    },
    "clip_bigg14": {
        "clip_bigg14": 1.0
    },
    "img_cap": {
        "img_cap": 1.0
    },
    "beit3": {
        "beit3": 1.0
    },
    "ocr": {
        "ocr": 1.0
    },
    "gg": {
        "gg": 1.0
    },
    
    # Two method combinations
    "clip_h14_clip_bigg14": {
        "clip_h14": 0.6,
        "clip_bigg14": 0.4
    },
    "clip_h14_img_cap": {
        "clip_h14": 0.7,
        "img_cap": 0.5
    },
    "clip_h14_beit3": {
        "clip_h14": 0.5,
        "beit3": 0.5
    },
    "clip_h14_ocr": {
        "clip_h14": 0.7,
        "ocr": 0.7
    },
    "clip_h14_gg": {
        "clip_h14": 0.8,
        "gg": 0.6
    },
    "clip_bigg14_img_cap": {
        "clip_bigg14": 0.6,
        "img_cap": 0.5
    },
    "clip_bigg14_beit3": {
        "clip_bigg14": 0.7,
        "beit3": 0.6
    },
    "clip_bigg14_ocr": {
        "clip_bigg14": 0.6,
        "ocr": 0.5
    },
    "clip_bigg14_gg": {
        "clip_bigg14": 0.7,
        "gg": 0.4
    },
    "img_cap_beit3": {
        "img_cap": 0.6,
        "beit3": 0.5
    },
    "img_cap_ocr": {
        "img_cap": 0.6,
        "ocr": 0.6
    },
    "img_cap_gg": {
        "img_cap": 0.6,
        "gg": 0.4
    },
    "beit3_ocr": {
        "beit3": 0.5,
        "ocr": 0.5
    },
    "beit3_gg": {
        "beit3": 0.6,
        "gg": 0.4
    },
    "ocr_gg": {
        "ocr": 0.6,
        "gg": 0.4
    },
    
    # Three method combinations
    "clip_h14_clip_bigg14_img_cap": {
        "clip_h14": 0.5,
        "clip_bigg14": 0.4,
        "img_cap": 0.4
    },
    "clip_h14_clip_bigg14_beit3": {
        "clip_h14": 0.6,
        "clip_bigg14": 0.5,
        "beit3": 0.4
    },
    "clip_h14_img_cap_beit3": {
        "clip_h14": 0.6,
        "img_cap": 0.5,
        "beit3": 0.4
    },
    "clip_h14_img_cap_ocr": {
        "clip_h14": 0.6,
        "img_cap": 0.5,
        "ocr": 0.4
    },
    "clip_h14_img_cap_gg": {
        "clip_h14": 0.7,
        "img_cap": 0.5,
        "gg": 0.3
    },
    "clip_h14_beit3_ocr": {
        "clip_h14": 0.6,
        "beit3": 0.4,
        "ocr": 0.4
    },
    "clip_bigg14_img_cap_beit3": {
        "clip_bigg14": 0.5,
        "img_cap": 0.4,
        "beit3": 0.4
    },
    
    # Four method combinations
    "clip_h14_clip_bigg14_img_cap_beit3": {
        "clip_h14": 0.5,
        "clip_bigg14": 0.4,
        "img_cap": 0.4,
        "beit3": 0.3
    },
    "clip_h14_clip_bigg14_img_cap_ocr": {
        "clip_h14": 0.5,
        "clip_bigg14": 0.4,
        "img_cap": 0.4,
        "ocr": 0.3
    },
    "clip_h14_img_cap_beit3_ocr": {
        "clip_h14": 0.6,
        "img_cap": 0.4,
        "beit3": 0.3,
        "ocr": 0.3
    },
    "clip_h14_img_cap_beit3_gg": {
        "clip_h14": 0.6,
        "img_cap": 0.4,
        "beit3": 0.3,
        "gg": 0.2
    },
    
    # Five method combinations
    "clip_h14_clip_bigg14_img_cap_beit3_ocr": {
        "clip_h14": 0.5,
        "clip_bigg14": 0.4,
        "img_cap": 0.4,
        "beit3": 0.3,
        "ocr": 0.3
    },
    "clip_h14_clip_bigg14_img_cap_beit3_gg": {
        "clip_h14": 0.5,
        "clip_bigg14": 0.4,
        "img_cap": 0.4,
        "beit3": 0.3,
        "gg": 0.2
    },
    
    # All methods combination
    "clip_h14_clip_bigg14_img_cap_beit3_ocr_gg": {
        "clip_h14": 0.5,
        "clip_bigg14": 0.4,
        "img_cap": 0.4,
        "beit3": 0.3,
        "ocr": 0.3,
        "gg": 0.2
    }
}

# Default fallback configuration
DEFAULT_WEIGHTS = BASE_WEIGHTS.copy()
