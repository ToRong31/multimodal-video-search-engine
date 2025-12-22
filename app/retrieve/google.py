# -*- coding: utf-8 -*-
"""
Google-only Image Fetcher + CLIP rerank (CombSUM) – Legacy-compatible for icrawler 0.6.x

Flow:
  1) Google Custom Search (CSE) → fetch image URLs (ổn định, chính chủ Google)
  2) Nếu thiếu KEY/CX → fallback GoogleImageCrawler (chỉ Google)

Tính năng:
- Vá SafeGoogleParser (luôn generator, nuốt lỗi parse).
- Patch threading.excepthook để nuốt TypeError vô hại từ parser-threads.
- Chặn stderr của worker để giảm spam.
- Lọc query rỗng/None, lọc ảnh nhỏ (MIN_W, MIN_H).
- CombSUM (gộp điểm giữa nhiều ảnh/query).
- search_many(...).
- debug=True: in version icrawler/bs4/lxml/requests, trạng thái parser,
  đường rẽ CSE/icrawler, tham số crawl, và full stack-trace khi lỗi.

Yêu cầu:
    pip install pillow requests icrawler beautifulsoup4 lxml

Biến môi trường (khuyến nghị dùng CSE):
    export GOOGLE_CSE_KEY=...
    export GOOGLE_CSE_CX=...
"""

import os
import re
import io
import sys
import shutil
import logging
import threading
import contextlib
import traceback
from typing import Optional, List, Dict, Iterable

import requests
from PIL import Image

# --------- icrawler (Google only) ----------
from icrawler.builtin import GoogleImageCrawler
try:
    from icrawler.builtin.google import GoogleParser  # type: ignore
except Exception:
    GoogleParser = None  # type: ignore

# --------- giảm ồn mặc định ----------
logging.getLogger("icrawler").setLevel(logging.ERROR)
logging.getLogger("downloader").setLevel(logging.CRITICAL)
logging.getLogger("icrawler.downloader").setLevel(logging.CRITICAL)

# --------- cấu hình ----------
MIN_W, MIN_H = 200, 200
DF_USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                 "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")


# =========================
# Safe Google Parser
# =========================
if GoogleParser is not None:
    class SafeGoogleParser(GoogleParser):  # type: ignore
        def parse(self, *args, **kwargs):
            try:
                for item in super().parse(*args, **kwargs):
                    if not item:
                        continue
                    yield item
            except Exception:
                return
else:
    SafeGoogleParser = None  # type: ignore


# =========================
# Logger helper
# =========================
def _make_logger(name: str = "google_searcher", level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
        logger.addHandler(handler)
    logger.setLevel(level)
    return logger


# =========================
#  GoogleSearcher
# =========================
class GoogleSearcher:
    """
    Google-only image → CLIP search (CombSUM).
    """

    def __init__(self, clip_searcher, logger: Optional[logging.Logger] = None):
        self.clip_searcher = clip_searcher
        self.api_key = os.getenv("GOOGLE_CSE_KEY", "").strip()
        self.cx = os.getenv("GOOGLE_CSE_CX", "").strip()
        self.logger = logger or _make_logger(level=logging.INFO)

    # ---------- Diagnostics ----------
    def _diag_versions(self, debug: bool):
        if not debug:
            return
        try:
            import icrawler as _ic
            import bs4 as _bs4
            import lxml as _lxml
            import requests as _req
            self.logger.info(f"[DIAG] icrawler={getattr(_ic, '__version__', '?')}, "
                             f"bs4={getattr(_bs4, '__version__', '?')}, "
                             f"lxml={getattr(_lxml, '__version__', '?')}, "
                             f"requests={getattr(_req, '__version__', '?')}")
        except Exception as e:
            self.logger.warning(f"[DIAG] version check failed: {e}")

    def _diag_parser(self, debug: bool):
        if not debug:
            return
        self.logger.info(f"[DIAG] GoogleParser is None? {GoogleParser is None}")
        self.logger.info(f"[DIAG] SafeGoogleParser is None? {SafeGoogleParser is None}")

    def _diag_env(self, debug: bool):
        if not debug:
            return
        has_cse = bool(self.api_key and self.cx)
        self.logger.info(f"[DIAG] CSE configured? {has_cse} "
                         f"(GOOGLE_CSE_KEY={'***' if self.api_key else 'None'}, "
                         f"GOOGLE_CSE_CX={'***' if self.cx else 'None'})")

    # ---------- Helpers ----------
    @staticmethod
    def _valid_query(q: Optional[str]) -> Optional[str]:
        if not isinstance(q, str):
            return None
        q = q.strip()
        if not q or q.lower() in {"none", "null"}:
            return None
        return q

    @staticmethod
    def _safe_filename(url: str, idx: int) -> str:
        base = re.sub(r"[^a-zA-Z0-9._-]+", "_", url.split("?")[0].split("/")[-1]) or f"img_{idx}.jpg"
        if not re.search(r"\.(jpg|jpeg|png|webp|bmp)$", base, re.IGNORECASE):
            base += ".jpg"
        return base

    @staticmethod
    def _aggregate_sum(all_results: Iterable[Dict]) -> List[Dict]:
        sums: Dict[str, float] = {}
        for r in all_results:
            rid = r.get("id")
            if rid is None:
                continue
            sc = float(r.get("score", 0.0))
            sums[rid] = sums.get(rid, 0.0) + sc
        return [{"id": rid, "score": s} for rid, s in sums.items()]

    def _open_image_bytes(self, content: bytes) -> Optional[Image.Image]:
        try:
            img = Image.open(io.BytesIO(content)).convert("RGB")
            if img.width < MIN_W or img.height < MIN_H:
                return None
            return img
        except Exception:
            return None

    def _open_image_file(self, path: str) -> Optional[Image.Image]:
        try:
            img = Image.open(path).convert("RGB")
            if img.width < MIN_W or img.height < MIN_H:
                return None
            return img
        except Exception:
            return None

    def _iter_images_from_dir(self, folder: str, limit: int) -> List[Image.Image]:
        imgs: List[Image.Image] = []
        if not os.path.isdir(folder):
            return imgs
        exts = (".jpg", ".jpeg", ".png", ".webp", ".bmp")
        files = [f for f in os.listdir(folder) if f.lower().endswith(exts)]
        files.sort()
        for fname in files[:limit]:
            p = os.path.join(folder, fname)
            img = self._open_image_file(p)
            if img:
                imgs.append(img)
        return imgs

    @contextlib.contextmanager
    def _silence_worker_stderr(self):
        with open(os.devnull, "w") as _devnull, contextlib.redirect_stderr(_devnull):
            yield

    def _patch_thread_excepthook(self):
        original = getattr(threading, "excepthook", None)
        def _ex(args):
            if args.exc_type is TypeError and args.thread and str(args.thread.name).startswith("parser-"):
                return
            if original:
                original(args)
            else:
                sys.__excepthook__(args.exc_type, args.exc_value, args.exc_traceback)
        return original, _ex

    # ---------- Google CSE ----------
    def _google_cse_fetch_urls(self, query: str, max_download: int, safe: str, debug: bool) -> List[str]:
        if not (self.api_key and self.cx):
            return []
        session = requests.Session()
        session.headers.update({"User-Agent": DF_USER_AGENT})

        urls: List[str] = []
        remaining = max_download
        start = 1
        while remaining > 0 and start <= 91:  # 10/page
            num = min(10, remaining)
            params = {
                "key": self.api_key, "cx": self.cx, "q": query,
                "searchType": "image", "num": num, "start": start, "safe": safe,
            }
            try:
                r = session.get("https://www.googleapis.com/customsearch/v1", params=params, timeout=15)
                if debug:
                    self.logger.info(f"[CSE] HTTP {r.status_code} start={start} num={num}")
                r.raise_for_status()
                data = r.json()
                items = data.get("items") or []
                if debug:
                    self.logger.info(f"[CSE] items={len(items)}")
                for it in items:
                    link = it.get("link")
                    if isinstance(link, str) and link.startswith("http"):
                        urls.append(link)
                if not items:
                    break
                remaining -= len(items)
                start += len(items)
            except Exception as e:
                if debug:
                    self.logger.error(f"[CSE] fetch error: {type(e).__name__}: {e}")
                    traceback.print_exc()
                break
        return urls

    def _download_urls_to_dir(self, urls: List[str], save_dir: str, limit: int, timeout: int, debug: bool) -> List[Image.Image]:
        os.makedirs(save_dir, exist_ok=True)
        session = requests.Session()
        session.headers.update({"User-Agent": DF_USER_AGENT})

        imgs: List[Image.Image] = []
        for i, url in enumerate(urls):
            if len(imgs) >= limit:
                break
            try:
                r = session.get(url, timeout=timeout, stream=True)
                if debug:
                    u = url if len(url) <= 80 else url[:80] + "..."
                    self.logger.info(f"[CSE] GET {r.status_code} {u}")
                r.raise_for_status()
                content = r.content
                img = self._open_image_bytes(content)
                if not img:
                    if debug:
                        self.logger.info("[CSE] skip (too small or invalid image)")
                    continue
                fname = self._safe_filename(url, i)
                with open(os.path.join(save_dir, fname), "wb") as f:
                    f.write(content)
                imgs.append(img)
            except Exception as e:
                if debug:
                    self.logger.warning(f"[CSE] download failed: {type(e).__name__}: {e}")
                continue
        return imgs

    # ---------- icrawler Google fallback (legacy-safe) ----------
    def _google_icrawler_download(
        self,
        query: str,
        save_dir: str,
        max_download: int,
        filters: Optional[dict],
        timeout: int,
        debug: bool,
    ) -> List[Image.Image]:
        """
        Tương thích bản icrawler cũ:
        - KHÔNG truyền downloader_kwargs ở constructor
        - KHÔNG truyền override_download_timeout vào crawl()
        - Chỉ dùng tham số gốc mà mọi bản 0.6.x đều nhận
        """
        shutil.rmtree(save_dir, ignore_errors=True)
        os.makedirs(save_dir, exist_ok=True)

        original_ex, patched_ex = self._patch_thread_excepthook()
        try:
            threading.excepthook = patched_ex  # type: ignore
        except Exception:
            pass

        try:
            if debug:
                self._diag_versions(debug)
                self._diag_parser(debug)
                self.logger.info(f"[IC] build crawler: parser_cls={SafeGoogleParser if SafeGoogleParser else None}")
                self.logger.info(f"[IC] params: keyword={repr(query)}, max_num={max_download}, filters={filters}")
                self.logger.info(f"[IC] NOTE: legacy path (no downloader_kwargs / no override_download_timeout)")

            crawler = GoogleImageCrawler(
                storage={"root_dir": save_dir},
                feeder_threads=1,
                parser_threads=4,
                downloader_threads=4,
                parser_cls=SafeGoogleParser if SafeGoogleParser is not None else None,
            )
            # Lưu ý: ta KHÔNG set UA/timeout qua API (bản cũ không hỗ trợ truyền hợp lệ)
            # vẫn chặn stderr để tránh spam
            with self._silence_worker_stderr():
                crawler.crawl(
                    keyword=query,
                    max_num=max_download,
                    filters=filters,
                )
        except Exception as e:
            self.logger.error(f"[IC] Crawler error (query='{query}'): {type(e).__name__}: {e}")
            traceback.print_exc()
        finally:
            try:
                threading.excepthook = original_ex  # type: ignore
            except Exception:
                pass

        imgs = self._iter_images_from_dir(save_dir, limit=max_download)
        if debug:
            self.logger.info(f"[IC] downloaded images: {len(imgs)}")
        return imgs

    # ---------- Public APIs ----------
    def search(
        self,
        query: str,
        collection_name: str,
        topk: int = 20,
        max_download: int = 40,
        model_name: str = "h14_quickgelu",
        save_dir: Optional[str] = "data/google_images",
        filters: Optional[dict] = None,
        timeout: int = 15,       # chỉ dùng cho CSE; icrawler legacy sẽ bỏ qua
        safe: str = "off",
        debug: bool = False,
    ) -> List[Dict]:
        """
        Chạy một query (bật debug=True để chẩn đoán gốc lỗi).
        """
        q = self._valid_query(query)
        if not q:
            self.logger.warning(f"[GoogleSearch] Skipped invalid/empty query: {query!r}")
            return []

        base_dir = save_dir or "data/google_images"
        target_dir = os.path.join(base_dir, "google_cse")
        shutil.rmtree(target_dir, ignore_errors=True)
        os.makedirs(target_dir, exist_ok=True)

        if debug:
            self._diag_env(debug)
            self.logger.info(f"[FLOW] query={repr(q)}, topk={topk}, max_download={max_download}, model={model_name}")

        # 1) Google CSE
        imgs: List[Image.Image] = []
        if self.api_key and self.cx:
            urls = self._google_cse_fetch_urls(q, max_download=max_download, safe=safe, debug=debug)
            if debug:
                self.logger.info(f"[CSE] url_count={len(urls)}")
            if urls:
                imgs = self._download_urls_to_dir(urls, target_dir, limit=max_download, timeout=timeout, debug=debug)

        # 2) Fallback: icrawler Google (legacy-safe)
        if not imgs:
            if debug:
                self.logger.info("[FLOW] fallback to icrawler.GoogleImageCrawler (legacy-safe)")
            imgs = self._google_icrawler_download(q, target_dir, max_download, filters, timeout, debug)

        if not imgs:
            self.logger.error(f"[GoogleSearch] No images downloaded for query: '{q}'")
            return []

        self.logger.info(f"[GoogleSearch] Successfully downloaded {len(imgs)} images for query: '{q}'")

        # 3) CLIP search + CombSUM
        all_results: List[Dict] = []
        for idx, img in enumerate(imgs):
            try:
                res = self.clip_searcher.img_search(
                    model_name=model_name, topk=topk, image=img, collection_name=collection_name,
                )
                if res:
                    all_results.extend(res)
                if debug:
                    self.logger.info(f"[CLIP] img#{idx} → {len(res) if res else 0} hits")
            except Exception as e:
                self.logger.warning(f"[CLIP] search error: {type(e).__name__}: {e}")
                if debug:
                    traceback.print_exc()

        if not all_results:
            self.logger.error("[GoogleSearch] No CLIP results found")
            return []

        fused = self._aggregate_sum(all_results)
        fused.sort(key=lambda x: x["score"], reverse=True)
        return fused[:topk]

    def search_many(
        self,
        queries: List[Optional[str]],
        collection_name: str,
        topk: int = 20,
        max_download: int = 40,
        model_name: str = "h14_quickgelu",
        save_dir: Optional[str] = "data/google_images",
        filters: Optional[dict] = None,
        timeout: int = 15,
        safe: str = "off",
        debug: bool = False,
    ) -> List[Dict]:
        """
        Chạy nhiều query và gộp CombSUM toàn bộ (debug=True để theo dõi từng query).
        """
        all_results: List[Dict] = []
        for q in queries:
            if not self._valid_query(q):
                self.logger.warning(f"[GoogleSearch] Skipped invalid/empty query in list: {q!r}")
                continue
            res = self.search(
                query=q,
                collection_name=collection_name,
                topk=topk,
                max_download=max_download,
                model_name=model_name,
                save_dir=save_dir,
                filters=filters,
                timeout=timeout,
                safe=safe,
                debug=debug,
            )
            if res:
                all_results.extend(res)

        if not all_results:
            return []

        fused = self._aggregate_sum(all_results)
        fused.sort(key=lambda x: x["score"], reverse=True)
        return fused[:topk]
