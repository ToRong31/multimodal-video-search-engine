import json
from typing import Dict
from typing import Optional


# Cached mapping from keyframe id -> video folder (e.g., L21_V001)
_ID_TO_VIDEO: Optional[Dict[int, str]] = None
_METADATA_LOAD_ERROR: bool = False


def _load_id_to_video_mapping(path: str = "data/metadata/path_keyframe.json") -> None:
    """Load mapping from keyframe id (int) to its video folder name.

    When loading fails, sets a flag to skip same-video filtering gracefully.
    """
    global _ID_TO_VIDEO, _METADATA_LOAD_ERROR
    if _ID_TO_VIDEO is not None or _METADATA_LOAD_ERROR:
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw_mapping = json.load(f)
        id_to_video: Dict[int, str] = {}
        for id_str, rel_path in raw_mapping.items():
            # Normalize and parse folder right after "keyframe/"
            norm_path = str(rel_path).replace("\\", "/")
            parts = norm_path.split("/")
            folder = None
            if "keyframe" in parts:
                idx = parts.index("keyframe")
                if idx + 1 < len(parts):
                    folder = parts[idx + 1]
            if folder is not None:
                try:
                    id_to_video[int(id_str)] = folder
                except Exception:
                    # Skip malformed id entries silently
                    pass
        _ID_TO_VIDEO = id_to_video
    except Exception:
        # If metadata cannot be loaded, fall back to previous behavior
        _METADATA_LOAD_ERROR = True
        _ID_TO_VIDEO = {}


def _get_video_folder(frame_id: int) -> Optional[str]:
    """Return the video folder for a given keyframe id, or None if unknown."""
    _load_id_to_video_mapping()
    if _ID_TO_VIDEO is None:
        return None
    return _ID_TO_VIDEO.get(frame_id)


def create_id_group(mode: str, results: Dict, n_items: int = 3) -> Dict:
    if n_items not in [2, 3]:
        raise ValueError("n_items must be 2 or 3")
        
    if mode == "C":
        items = [results.get(f"q{i}", []) for i in range(n_items)]
        
        valid_sets = []
        for item0 in items[0]:
            id0 = item0["id"] 
            score0 = item0["score"]
            video0 = _get_video_folder(id0)
            
            # Enforce same-video grouping when metadata is available
            valid_items1 = [
                item for item in items[1]
                if item["id"] > id0 and (
                    (_METADATA_LOAD_ERROR) or (
                        video0 is not None and _get_video_folder(item["id"]) == video0
                    )
                )
            ]
            
            if n_items == 2:
                for item1 in valid_items1:
                    id1 = item1["id"]
                    score1 = item1["score"]
                    
                    pair = [
                        {"id": id0, "score": score0},
                        {"id": id1, "score": score1}
                    ]
                    total_score = score0 + score1
                    valid_sets.append((pair, total_score))
                    
            else: # n_items == 3
                for item1 in valid_items1:
                    id1 = item1["id"]
                    score1 = item1["score"]
                    video1 = video0  # same-video constraint already applied
                    
                    valid_items2 = [
                        item for item in items[2]
                        if item["id"] > id1 and (
                            (_METADATA_LOAD_ERROR) or (
                                video1 is not None and _get_video_folder(item["id"]) == video1
                            )
                        )
                    ]
                    
                    for item2 in valid_items2:
                        id2 = item2["id"]
                        score2 = item2["score"]
                        
                        triplet = [
                            {"id": id0, "score": score0},
                            {"id": id1, "score": score1}, 
                            {"id": id2, "score": score2}
                        ]
                        total_score = score0 + score1 + score2
                        valid_sets.append((triplet, total_score))
        
        valid_sets.sort(key=lambda x: x[1], reverse=True)
        
        return {
            "objects": [item_set for item_set, _ in valid_sets]
        }
    
    result_dict = {}
    
    for i in range(3):
        key = f"ensemble_qx_{i}"
        result_dict[key] = []
        
        items = [
            results.get(f"q{j}", {}).get(f"q{j}_{i}", []) 
            for j in range(n_items)
        ]
        
        for item0 in items[0]:
            id0 = item0["id"]
            score0 = item0["score"]
            video0 = _get_video_folder(id0)
            
            valid_items1 = [
                item for item in items[1]
                if item["id"] > id0 and (
                    (_METADATA_LOAD_ERROR) or (
                        video0 is not None and _get_video_folder(item["id"]) == video0
                    )
                )
            ]
            
            if n_items == 2:
                for item1 in valid_items1:
                    id1 = item1["id"]
                    score1 = item1["score"]
                    
                    pair = [
                        {"id": id0, "score": score0},
                        {"id": id1, "score": score1}
                    ]
                    result_dict[key].append(pair)
                    
            else: # n_items == 3
                for item1 in valid_items1:
                    id1 = item1["id"]
                    score1 = item1["score"]
                    video1 = video0
                    
                    valid_items2 = [
                        item for item in items[2]
                        if item["id"] > id1 and (
                            (_METADATA_LOAD_ERROR) or (
                                video1 is not None and _get_video_folder(item["id"]) == video1
                            )
                        )
                    ]
                    
                    for item2 in valid_items2:
                        id2 = item2["id"]
                        score2 = item2["score"]
                        
                        triplet = [
                            {"id": id0, "score": score0},
                            {"id": id1, "score": score1},
                            {"id": id2, "score": score2}
                        ]
                        result_dict[key].append(triplet)
    
    key = "ensemble_qx_x"
    result_dict[key] = []
    
    items = [
        results.get(f"q{i}", {}).get(f"ensemble_all_q{i}", [])
        for i in range(n_items)
    ]
    
    for item0 in items[0]:
        id0 = item0["id"]
        score0 = item0["score"]
        video0 = _get_video_folder(id0)
        
        valid_items1 = [
            item for item in items[1]
            if item["id"] > id0 and (
                (_METADATA_LOAD_ERROR) or (
                    video0 is not None and _get_video_folder(item["id"]) == video0
                )
            )
        ]
        
        if n_items == 2:
            for item1 in valid_items1:
                id1 = item1["id"]
                score1 = item1["score"]
                
                pair = [
                    {"id": id0, "score": score0},
                    {"id": id1, "score": score1}
                ]
                result_dict[key].append(pair)
                
        else: # n_items == 3
            for item1 in valid_items1:
                id1 = item1["id"]
                score1 = item1["score"]
                video1 = video0
                
                valid_items2 = [
                    item for item in items[2]
                    if item["id"] > id1 and (
                        (_METADATA_LOAD_ERROR) or (
                            video1 is not None and _get_video_folder(item["id"]) == video1
                        )
                    )
                ]
                
                for item2 in valid_items2:
                    id2 = item2["id"]
                    score2 = item2["score"]
                    
                    triplet = [
                        {"id": id0, "score": score0},
                        {"id": id1, "score": score1},
                        {"id": id2, "score": score2}
                    ]
                    result_dict[key].append(triplet)
    
    return result_dict


