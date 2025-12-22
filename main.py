from app.config.setup import manager
from app.config.settings import TOPK_NORMAL, TOPK_NORMAL_SINGLE_METHOD, TOPK_TEMPORAL, TOPK_PREV, TOPK_IS
from app.result.temporal_search import TemporalSearch
from typing import List, Optional
import json
from PIL import Image
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from pathlib import Path
import json
import re
import gc
from typing import List, Dict, Optional
from fastapi import Path as PathParam
import asyncio
import os
import functools
from fastapi import UploadFile, File
import uuid

app = FastAPI()
# Fix path to point to template folder instead of static
STATIC_DIR = Path(__file__).resolve().parent / "template"
print(f"Static directory path: {STATIC_DIR}")

# Custom static files class to add no-cache headers for JS files
class NoCacheStaticFiles(StaticFiles):
    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        # Add no-cache headers for JavaScript files
        if args[0].endswith('.js'):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

# Mount template folder with /template path and no-cache for JS
app.mount("/template", NoCacheStaticFiles(directory=STATIC_DIR), name="template")

# Mount data folder to serve metadata files
DATA_DIR = Path(__file__).resolve().parent / "data"
app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")

TEMP_UPLOADS_DIR = Path(__file__).resolve().parent / "temp_uploads"
TEMP_UPLOADS_DIR.mkdir(exist_ok=True)
app.mount("/temp_uploads", StaticFiles(directory=TEMP_UPLOADS_DIR), name="temp_uploads")

@app.get("/health")
async def health():
    return {"ok": True}

@app.get("/")
def serve_index():
    return FileResponse(STATIC_DIR / "index.html")

topk_normal = TOPK_NORMAL
topk_normal_single_method = TOPK_NORMAL_SINGLE_METHOD
topk_temporal = TOPK_TEMPORAL
topk_prev = TOPK_PREV
topk_is = TOPK_IS


# Search request model
class SearchRequest(BaseModel):
    # Query data - 3 elements for temporal mode, 1 for single mode
    queries: List[Optional[str]]    # [text, text, text] or [text, None, None]
    OCR: List[Optional[str]]        # [text, text, text] or [text, None, None]relative_path:
    ASR: Optional[str]              # [None] in temporal, [text] in single
    
    # Model flags - 3 elements for temporal mode, 1 for single mode
    ClipBigg14: List[bool]          # [bool, bool, bool] or [bool, False, False]
    ClipH14: List[bool]             # [bool, bool, bool] or [bool, False, False]
    ImageCap: List[bool]            # [bool, bool, bool] or [bool, False, False]
    Beit3: List[bool]                # [bool, bool, bool] or [bool, False, False]
    SigLip2: List[bool]              # [bool, bool, bool] or [bool, False, False]
    GoogleSearch: List[bool]        # [bool, bool, bool] or [bool, False, False]
    
    # Mode indicator
    is_temporal: bool = False
    # Toggle translating the question
    use_trans: bool =True



# Mount temp uploads directory

class ImageSearchRequest(BaseModel):
    image_id: Optional[str] = None  # Single image (backward compatible)
    image_ids: Optional[List[str]] = None  # Multiple images for temporal search
    model_name: str = "siglip2"
    topk: int = 100
    collection_name: Optional[str] = None

_metadata_cache = {}

async def load_metadata(metadata_type: str):
    """Load and cache metadata"""
    if metadata_type not in _metadata_cache:
        metadata_file = DATA_DIR / "metadata" / f"path_{metadata_type}.json"
        if metadata_file.exists():
            import json
            with open(metadata_file, 'r') as f:
                _metadata_cache[metadata_type] = json.load(f)
                print(f"?? Loaded {metadata_type} metadata: {len(_metadata_cache[metadata_type])} entries")
        else:
            _metadata_cache[metadata_type] = {}
    return _metadata_cache[metadata_type]

@app.on_event("startup")
async def startup_event():
    global keyframe_metadata, scene_metadata
    keyframe_metadata = await load_metadata("keyframe")
    scene_metadata = await load_metadata("scene")



MAX_CONCURRENCY = int(os.getenv("MAX_CONCURRENCY", "4"))
JOB_SEM = asyncio.Semaphore(MAX_CONCURRENCY)
try:
    _to_thread = asyncio.to_thread
except AttributeError:
    async def _to_thread(func, *args, **kwargs):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, functools.partial(func, *args, **kwargs))

async def run_blocking(func, *args, **kwargs):
    """Offload hàm sync sang thread để không chặn event loop."""
    return await _to_thread(func, *args, **kwargs)


def extract_active_methods(request: SearchRequest):
    """Extract active methods from request"""
    active_methods = []
  
    has_asr = bool(request.ASR and request.ASR.strip())

    has_ocr = any(ocr for ocr in request.OCR if ocr)
    
    if has_asr:
        active_methods.append("asr")

    if has_ocr:
        active_methods.append("ocr")
    if any(request.ClipH14):
        active_methods.append("cliph14")
    if any(request.ClipBigg14):
        active_methods.append("clipbigg14")
    if any(request.ImageCap):
        active_methods.append("img_cap")
    if any(request.Beit3):
        active_methods.append("beit3")
    if any(request.SigLip2):
        active_methods.append("siglip2")
    if any(request.GoogleSearch):
        active_methods.append("gg")

    return active_methods

def prepare_mixsearch_input(request: SearchRequest, active_methods: list):
    """
    Prepare input for mixsearch function with consistent array format
    
    Always returns arrays of 3 elements for all fields:
    - For temporal mode: [val1, val2, val3] 
    - For single mode: [val1, None, None]
    """
    
    mode = "temporal" if request.is_temporal else "single"
    
    # Process queries - always 3 elements
    queries = []
    for i in range(3):
        if i < len(request.queries) and request.queries[i] and request.queries[i].strip():
            queries.append(request.queries[i].strip())
        else:
            queries.append(None)
    
    # Process OCR - always 3 elements  
    ocr = []
    for i in range(3):
        if i < len(request.OCR) and request.OCR[i] and request.OCR[i].strip():
            ocr.append(request.OCR[i].strip())
        else:
            ocr.append(None)
    
    # Process ASR
    asr = request.ASR.strip() if request.ASR else None

    clipbigg14 = []
    for i in range(3):
        if i < len(request.ClipBigg14):
            clipbigg14.append(request.ClipBigg14[i])
        else:
            clipbigg14.append(False)

    cliph14 = []
    for i in range(3):
        if i < len(request.ClipH14):
            cliph14.append(request.ClipH14[i])
        else:
            cliph14.append(False)

    image_cap = []
    for i in range(3):
        if i < len(request.ImageCap):
            image_cap.append(request.ImageCap[i])
        else:
            image_cap.append(False)
    
    beit3 = []
    for i in range(3):
        if i < len(request.Beit3):
            beit3.append(request.Beit3[i])
        else:
            beit3.append(False)
    siglip2 = []
    for i in range(3):
        if i < len(request.SigLip2):
            siglip2.append(request.SigLip2[i])
        else:
            siglip2.append(False)

    GoogleSearch = []
    for i in range(3):
        if i < len(request.GoogleSearch):
            GoogleSearch.append(request.GoogleSearch[i])
        else:
            GoogleSearch.append(False)

    use_trans = request.use_trans

    
    print(f"Prepared mixsearch input for {mode} mode:")
    print(f"  - queries: {queries}")
    print(f"  - OCR: {ocr}")
    print(f"  - ASR: {asr}")
    print(f"  - ClipBigg14: {clipbigg14}")
    print(f"  - ClipH14: {cliph14}")
    print(f"  - ImageCap: {image_cap}")
    print(f"  - Beit3: {beit3}")
    print(f"  - SigLip2: {siglip2}")
    print(f"  - Translate: {use_trans}")
    
    return {
        "queries": queries,              # [text, text, text] or [text, None, None]
        "OCR": ocr,                     # [text, text, text] or [text, None, None]  
        "ASR": asr,                     # [str]
        "ClipBigg14": clipbigg14,   # [bool, bool, bool] or [bool, False, False]
        "ClipH14": cliph14,            # [bool, bool, bool] or [bool, False, False]
        "ImageCap": image_cap,          # [bool, bool, bool] or [bool, False, False]
        "Beit3": beit3,       # [bool, bool, bool] or [bool, False, False]
        "SigLip2": siglip2,       # [bool, bool, bool] or [bool, False, False]
        "GoogleSearch": GoogleSearch,   # [bool, bool, bool] or [bool, False, False]
        "mode": mode,
        "use_trans": use_trans                   # "temporal" or "single"
    }

def lookup_path_from_metadata(result_id: str, method: str = "keyframe") -> Optional[str]:
    method_norm = (method or "keyframe").lower().replace(" ", "_")
    scene_methods = {'asr', 'vid_cap', 'video_captioning', 'scene'}
    metadata = scene_metadata if method_norm in scene_methods else keyframe_metadata

    entry = metadata.get(result_id)
    if isinstance(entry, str):
        rel = entry
    elif isinstance(entry, dict):
        rel = entry.get("path")
    else:
        return None

    if not rel:
        return None

    rel = rel.replace("../../data/keyframe/", "").replace("data/keyframe/", "").lstrip("/")
    if rel.lower().startswith("keyframe/"):
        rel = rel[9:]
    return rel

@app.get("/api/image/{result_id}")
async def get_image(result_id: str, method: str = "keyframe"):
    relative_path = lookup_path_from_metadata(result_id, method)
    if not relative_path:
        raise HTTPException(status_code=404, detail="Not found")

    async with JOB_SEM:
        def _abs_exists(rel_path: str):
            base_dir_keyframe = Path(__file__).resolve().parent / "data" / "keyframe"
            abs_path = (base_dir_keyframe / rel_path).resolve()
            return abs_path.exists(), abs_path.suffix.lower()
        
        exists, suffix = await run_blocking(_abs_exists, relative_path)
       

    if not exists:
        raise HTTPException(status_code=404, detail="File missing on disk")

    media_type = {
        ".webp": "image/webp",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
    }.get(suffix, "application/octet-stream")

    accel_target = f"/protected/keyframe/{relative_path}"
    resp = Response(status_code=200)
    resp.headers["Content-Type"] = media_type
    resp.headers["X-Accel-Redirect"] = accel_target
    return resp



@app.get("/api/video-frames")
async def get_video_frames(video_id: str):
    """
    Return all result_ids for frames that live in the given keyframe folder.
    The project's metadata contains entries like:
      "0": "../../data/keyframe/L21_V001/keyframe_0.webp"
    We match metadata paths that contain the folder name (e.g. "L21_V001")
    and return an ordered list of frames with their result_id so frontend
    can call /api/image/{result_id}.
    """
    try:
        print(f"📹 Fetching all frames for video: {video_id}")

        async with JOB_SEM:
            def _collect_frames(vid_id: str):
                # SỬA: Dùng keyframe_metadata đã load sẵn
                metadata = keyframe_metadata
                
                if not isinstance(metadata, dict) or not metadata:
                    return None, "Metadata not available"

                print(f"🔍 Searching in {len(metadata)} metadata entries for video: {vid_id}")

                vid_token = vid_id.strip()
                matches = []

                # Iterate metadata to find entries whose path contains the folder token
                for result_id, entry in metadata.items():
                    # entry can be a string path or a dict with 'path'
                    path_str = None
                    if isinstance(entry, str):
                        path_str = entry
                    elif isinstance(entry, dict):
                        path_str = entry.get("path") or entry.get("uri") or entry.get("url")
                    if not path_str:
                        continue

                    # Normalize path (remove ../../ or leading prefixes)
                    clean = path_str.replace("\\", "/")
                    # Remove prefixes like "../../data/keyframe/" or "data/keyframe/"
                    if "data/keyframe/" in clean:
                        clean = clean.split("data/keyframe/")[-1]
                    
                    # Check if this path belongs to the requested video folder
                    # Match patterns: "L21_V001/...", "/L21_V001/..."
                    if clean.startswith(f"{vid_token}/"):
                        filename = clean.split("/")[-1]
                        frame_id = Path(filename).stem
                        matches.append((result_id, filename, frame_id, clean))

                if not matches:
                    print(f"⚠️ No metadata frames found for video: {vid_id}")
                    # Debug: show some sample paths
                    sample_paths = []
                    for i, (rid, entry) in enumerate(metadata.items()):
                        if i >= 5:
                            break
                        path_str = entry if isinstance(entry, str) else entry.get("path")
                        if path_str:
                            clean = path_str.split("data/keyframe/")[-1] if "data/keyframe/" in path_str else path_str
                            sample_paths.append(clean)
                    print(f"📝 Sample paths in metadata: {sample_paths}")
                    return None, f"No metadata frames found for video: {vid_id}"

                # Sort matches by numeric suffix in filename
                def sort_key(t):
                    # t = (result_id, filename, frame_id, clean)
                    fname = t[1]
                    # Extract trailing number: "keyframe_123.webp" -> 123
                    m = __import__("re").search(r"(\d+)(?=\.\w+$|$)", fname)
                    if m:
                        return int(m.group(1))
                    return fname

                matches.sort(key=sort_key)

                frames = []
                for result_id, filename, frame_id, clean_path in matches:
                    frames.append({
                        "result_id": str(result_id),
                        "filename": filename,
                        "frame_id": frame_id,
                        "relative_path": clean_path
                    })

                print(f"✅ Found {len(frames)} frames for video {vid_id}")
                return frames, None

            frames, error = await run_blocking(_collect_frames, video_id)

        if error:
            print(f"❌ {error}")
            raise HTTPException(status_code=404, detail=error)

        if not frames:
            raise HTTPException(status_code=404, detail=f"No frames found for video: {video_id}")

        return {
            "success": True,
            "video_id": video_id,
            "total_frames": len(frames),
            "frames": frames
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error fetching video frames: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))



# Sửa endpoint Image Search
# ...existing code...

@app.post("/api/image-search")
async def image_search_endpoint(request: ImageSearchRequest):
    """
    Image search endpoint - supports both single and temporal (2-3 images) search
    - Single image: Returns normal search results
    - Multiple images (2-3): Returns temporal search results
    """
    try:
        # Normalize input: convert to list
        image_ids = []
        if request.image_ids:
            image_ids = request.image_ids
        elif request.image_id:
            image_ids = [request.image_id]
        else:
            return {"error": "Either image_id or image_ids must be provided"}
        
        print(f"🔍 Image Search: {len(image_ids)} image(s)")
        
        # ==== TEMPORAL SEARCH (2-3 images) ====
        if len(image_ids) >= 2:
            if len(image_ids) > 3:
                return {"error": "Maximum 3 images supported for temporal search"}
            
            print(f"🔄 Using temporal search mode")
            
            # Collect image paths
            image_paths = []
            for image_id in image_ids:
                # Check if UUID (uploaded image)
                if len(image_id) == 36 and '-' in image_id:
                    image_path = TEMP_UPLOADS_DIR / f"{image_id}.jpg"
                    if not image_path.exists():
                        return {"error": f"Uploaded image not found: {image_id}"}
                    print(f"📤 Using uploaded image: {image_path}")
                    image_paths.append(str(image_path))
                else:
                    # Result ID from metadata
                    meta_entry = keyframe_metadata.get(image_id)
                    if not meta_entry:
                        return {"error": f"Image not found in metadata: {image_id}"}
                    
                    image_path_str = meta_entry if isinstance(meta_entry, str) else meta_entry.get("path")
                    if not image_path_str:
                        return {"error": f"Image path not found for: {image_id}"}
                    
                    image_path_clean = image_path_str.replace("../../", "")
                    image_path = Path(__file__).resolve().parent / image_path_clean
                    
                    if not image_path.exists():
                        return {"error": f"Image file not found: {image_path}"}
                    
                    print(f"📁 Using metadata image: {image_path}")
                    image_paths.append(str(image_path))
            
            # Perform temporal search
            def temporal_search_task(paths: List[str]):
                return manager.temporal_image_search(
                    image_paths=paths,
                    model_name=request.model_name,
                    topk=request.topk or topk_is
                )
            
            async with JOB_SEM:
                result = await run_blocking(temporal_search_task, image_paths)
            
            return result
        
        # ==== SINGLE IMAGE SEARCH ====
        image_id = image_ids[0]
        should_skip_encoding = False

        # Check if UUID (uploaded image)
        if len(image_id) == 36 and '-' in image_id:
            image_path = TEMP_UPLOADS_DIR / f"{image_id}.jpg"
            if not image_path.exists():
                return {"error": f"Uploaded image not found: {image_id}"}
            print(f"📤 Using uploaded image from: {image_path}")
        else:
            # Result ID from metadata
            method_norm = (request.model_name or "keyframe").lower().replace(" ", "_")
            scene_methods = {'asr', 'scene'}
            metadata = scene_metadata if method_norm in scene_methods else keyframe_metadata

            meta_entry = metadata.get(image_id)
            if not meta_entry:
                return {"error": "Image not found in metadata"}

            image_path_str = meta_entry if isinstance(meta_entry, str) else meta_entry.get("path")
            if not image_path_str:
                return {"error": "Image path not found"}

            image_path_clean = image_path_str.replace("../../", "")
            image_path = Path(__file__).resolve().parent / image_path_clean
            
            if not image_path.exists():
                return {"error": f"Image file not found: {image_path}"}
            
            print(f"📁 Using metadata image from: {image_path}")
            should_skip_encoding = True

        # Load and search
        def image_search_task(img_path: Path, skip_encode: bool):
            pil_image = None
            if not skip_encode:
                with Image.open(img_path) as raw_image:
                    pil_image = raw_image.convert("RGB")

            search_resp = manager.search_by_image(
                image=pil_image,
                model_name="siglip2",
                topk=request.topk or topk_is,
                image_path=str(img_path)
            )

            if isinstance(search_resp, dict):
                items = search_resp.get("image_search") or []
            elif isinstance(search_resp, list):
                items = search_resp
            else:
                items = []

            formatted_results = []
            for result in items:
                try:
                    result_id = str(result.get("id"))
                    if not result_id or result_id == "None":
                        continue
                    result_image_path = keyframe_metadata.get(result_id, "unknown")
                    formatted_results.append({
                        "id": result_id,
                        "score": float(result.get("score", 0.0)),
                        "url": f"/api/image/{result_id}?method=keyframe",
                        "title": f"Similar Image {result_id}",
                        "description": f"Image similar to query",
                        "path": result_image_path
                    })
                except Exception as e:
                    print(f"⚠️ Skipped invalid result: {e}")
            
            return {
                "success": True,
                "query_image_id": image_id,
                "method": request.model_name,
                "results": formatted_results,
                "total": len(formatted_results)
            }
        
        async with JOB_SEM:
            result = await run_blocking(image_search_task, image_path, should_skip_encoding)
        
        return result
        
    except Exception as e:
        print(f"❌ Image Search error: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

@app.post("/api/search-new")
async def search_endpoint_new(request: SearchRequest):
    ts = TemporalSearch()

    print(f"Search request: Mode={'Temporal' if request.is_temporal else 'Single'}")

    active_methods = extract_active_methods(request)
    input = prepare_mixsearch_input(request, active_methods)

    print(f"Active methods: {active_methods}")

    mode = "temporal" if request.is_temporal else "single"
    if mode == "temporal":
        topk_each_override = topk_temporal
        topk_final_override = topk_temporal
    else:
        if len(active_methods) == 1:
            topk_each_override = topk_normal_single_method
            topk_final_override = topk_normal_single_method
        else:
            topk_each_override = topk_normal
            topk_final_override = topk_normal

    async with JOB_SEM:
        result = await run_blocking(
            ts.search,
            queries=input["queries"],
            ocr_text=input["OCR"],
            asr_text=input["ASR"],
            use_cliph14=input["ClipH14"],
            use_clipbigg14=input["ClipBigg14"],
            use_beit3=input["Beit3"],
            use_siglip2=input["SigLip2"],
            use_gg=input["GoogleSearch"],
            use_image_cap=input["ImageCap"],
            use_trans=input["use_trans"],
            topk_each=topk_each_override,
            topk_final=topk_final_override,
            topk_prev=topk_prev,
        )

    return result
    

@app.post("/api/upload-query-image")
async def upload_query_image(image: UploadFile = File(...)):
    """Upload image from clipboard paste"""
    try:
        # Generate unique ID
        image_id = str(uuid.uuid4())
        
        # Save to temp directory
        upload_dir = Path("temp_uploads")
        upload_dir.mkdir(exist_ok=True)
        
        file_path = upload_dir / f"{image_id}.jpg"
        
        # Save file
        contents = await image.read()
        with open(file_path, "wb") as f:
            f.write(contents)
        
        # TODO: Process image với CLIP/etc để extract features
        # features = extract_image_features(file_path)
        
        return {
            "image_id": image_id,
            "image_url": f"/temp_uploads/{image_id}.jpg",
            "status": "success"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))