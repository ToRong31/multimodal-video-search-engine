import json
import re
from typing import List, Dict, Optional

from app.config.setup import manager as default_manager
from app.utils.create_id_group import create_id_group


class TemporalSearch:
    def __init__(self, mgr: Optional[object] = None) -> None:
        # Fallback to global configured manager if none is provided
        self.manager = mgr or default_manager

    def search(
        self,
        queries: Optional[List[str]] = None,
        ocr_text: Optional[List[str]] = None,
        asr_text: Optional[str] = None,
        use_cliph14: List[bool] = False,
        use_clipbigg14: List[bool] = False,
        use_beit3: List[bool] = False,
        use_siglip2: List[bool] = False,
        use_image_cap: List[bool] = False,
        use_gg: List[bool] = False,
        use_trans: bool = True,
        # Optional overrides forwarded to manager for each call
        topk_each: Optional[int] = None,
        topk_final: Optional[int] = None,
        topk_prev: Optional[int] = None
    ):
        if asr_text is not None:
            return self.search_mode_a(queries=queries, asr_text=asr_text)
        return self.search_mode_b(
            queries=queries,
            ocr_text=ocr_text,
            use_cliph14=use_cliph14,
            use_clipbigg14=use_clipbigg14,
            use_beit3=use_beit3,
            use_siglip2=use_siglip2,
            use_image_cap=use_image_cap,
            use_gg=use_gg,
            use_trans=use_trans,
            topk_each=topk_each,
            topk_final=topk_final,
            topk_prev=topk_prev
        )

    def search_mode_a(
        self,
        queries: Optional[List[str]] = None,
        asr_text: Optional[str] = None,
        topk_each: Optional[int] = None,
        topk_final: Optional[int] = None,
        topk_prev: Optional[int] = None
    ):
        print("Mode A - Normal search")
        q = None
        if isinstance(queries, list) and len([x for x in queries if x is not None]) == 1:
            q = next((x for x in queries if x is not None), None)
        results = self.manager.mixed_search(
            query=q,
            asr_text=asr_text,
            topk_each=topk_each,
            topk_final=topk_final,
            topk_prev=topk_prev
        )
        # print(json.dumps(results, indent=2, ensure_ascii=False))
        return results

    def search_mode_b(
        self,
        queries: Optional[List[str]] = None,
        ocr_text: Optional[List[str]] = None,
        use_cliph14: List[bool] = False,
        use_clipbigg14: List[bool] = False,
        use_beit3: List[bool] = False,
        use_siglip2: List[bool] = False,
        use_image_cap: List[bool] = False,
        use_gg: List[bool] = False,
        use_trans: bool = True,
        topk_each: Optional[int] = None,
        topk_final: Optional[int] = None,
        topk_prev: Optional[int] = None
    ):
        single_ocr = isinstance(ocr_text, list) and len([x for x in ocr_text if x is not None]) == 1
        no_query = (not queries) or (isinstance(queries, list) and not any(queries))

        if single_ocr and no_query:
            print("Mode B - Normal OCR-only search")
            only_ocr = next(x for x in ocr_text if x is not None)
            results = self.manager.mixed_search(
                query=None,
                ocr_text=only_ocr,
                use_cliph14=False,
                use_clipbigg14=False,
                use_beit3=False,
                use_siglip2=False,
                use_image_cap=False,
                topk_each=topk_each,
                topk_final=topk_final,
                topk_prev=topk_prev
            )
            # print(json.dumps(results, indent=2, ensure_ascii=False))
            return results

        non_none_queries = [q for q in (queries or []) if q is not None]
        if len(non_none_queries) == 1:
            print("Mode B - Normal search")
            idx = next(i for i, q in enumerate(queries) if q is not None)
            current_ocr = ocr_text[idx] if isinstance(ocr_text, list) else ocr_text

            current_cliph14 = use_cliph14[idx] if isinstance(use_cliph14, list) else bool(use_cliph14)
            current_clipbigg14 = use_clipbigg14[idx] if isinstance(use_clipbigg14, list) else bool(use_clipbigg14)
            current_beit3 = use_beit3[idx] if isinstance(use_beit3, list) else bool(use_beit3)
            current_siglip2 = use_siglip2[idx] if isinstance(use_siglip2, list) else bool(use_siglip2)
            current_imgcap = use_image_cap[idx] if isinstance(use_image_cap, list) else bool(use_image_cap)
            current_gg = use_gg[idx] if isinstance(use_gg, list) else bool(use_gg)

            results = self.manager.mixed_search(
                query=non_none_queries[0],
                ocr_text=current_ocr,
                use_cliph14=current_cliph14,
                use_clipbigg14=current_clipbigg14,
                use_beit3=current_beit3,
                use_siglip2=current_siglip2,
                use_image_cap=current_imgcap,
                use_gg=current_gg,
                use_trans=use_trans,
                topk_each=topk_each,
                topk_final=topk_final,
                topk_prev=topk_prev
            )
            # print(json.dumps(results, indent=2, ensure_ascii=False))
            return results

        # Temporal B
        print("Mode B - Temporal search")
        if isinstance(ocr_text, list) and ((not queries) or not any(queries)):
            print("Mode B - Temporal OCR-only search")
            formatted_results: Dict[str, Dict[str, List[Dict]]] = {}
            idx = 0
            for current_ocr in (ocr_text or []):
                if current_ocr is None:
                    continue
                q_key = f"q{idx}"
                formatted_results[q_key] = {}
                result = self.manager.mixed_search(
                    query=None,
                    ocr_text=current_ocr,
                    use_cliph14=False,
                    use_clipbigg14=False,
                    use_beit3=False,
                    use_siglip2=False,
                    use_image_cap=False,
                    topk_each=topk_each,
                    topk_final=topk_final,
                    topk_prev=topk_prev
                )
                per_query_results = result.get("per_query", {})
                query_pairs = []
                for key in per_query_results.keys():
                    match = re.match(r"query_(\d+)$", key)
                    if match:
                        query_pairs.append((int(match.group(1)), key))
                query_pairs.sort(key=lambda x: x[0])
                formatted_block: Dict[str, List[Dict]] = {}
                for sub_idx, sub_key in query_pairs:
                    formatted_block[f"q{idx}_{sub_idx}"] = per_query_results.get(sub_key, {}).get("ensemble_all_methods", [])
                formatted_block[f"ensemble_all_q{idx}"] = result.get("ensemble_all_queries_all_methods", [])
                formatted_results[q_key] = formatted_block
                idx += 1
            n_items = len([x for x in (ocr_text or []) if x is not None])
            if n_items < 2:
                raise ValueError("Mode B temporal OCR-only search requires at least 2 valid OCR texts")
            final_results = create_id_group("B", formatted_results, n_items=n_items)
            # print(json.dumps(final_results, indent=2, ensure_ascii=False))
            return final_results

        formatted_results: Dict[str, Dict[str, List[Dict]]] = {}
        idx = 0
        for q_text in (queries or []):
            if q_text is None:
                continue
            q_key = f"q{idx}"
            formatted_results[q_key] = {}
            current_cliph14 = use_cliph14[idx] if isinstance(use_cliph14, list) else bool(use_cliph14)
            current_clipbigg14 = use_clipbigg14[idx] if isinstance(use_clipbigg14, list) else bool(use_clipbigg14)
            current_beit3 = use_beit3[idx] if isinstance(use_beit3, list) else bool(use_beit3)
            current_siglip2 = use_siglip2[idx] if isinstance(use_siglip2, list) else bool(use_siglip2)
            current_imgcap = use_image_cap[idx] if isinstance(use_image_cap, list) else bool(use_image_cap)
            current_gg = use_gg[idx] if isinstance(use_gg, list) else bool(use_gg)
            current_ocr = ocr_text[idx] if isinstance(ocr_text, list) else ocr_text
            result = self.manager.mixed_search(
                query=q_text,
                ocr_text=current_ocr,
                use_cliph14=current_cliph14,
                use_clipbigg14=current_clipbigg14,
                use_beit3=current_beit3,
                use_siglip2=current_siglip2,
                use_image_cap=current_imgcap,
                use_gg=current_gg,
                use_trans=use_trans,
                topk_each=topk_each,
                topk_final=topk_final,
                topk_prev=topk_prev
            )
            per_query_results = result.get("per_query", {})
            query_pairs = []
            for key in per_query_results.keys():
                match = re.match(r"query_(\d+)$", key)
                if match:
                    query_pairs.append((int(match.group(1)), key))
            query_pairs.sort(key=lambda x: x[0])
            formatted_block: Dict[str, List[Dict]] = {}
            for sub_idx, sub_key in query_pairs:
                formatted_block[f"q{idx}_{sub_idx}"] = per_query_results.get(sub_key, {}).get("ensemble_all_methods", [])
            formatted_block[f"ensemble_all_q{idx}"] = result.get("ensemble_all_queries_all_methods", [])
            formatted_results[q_key] = formatted_block
            idx += 1
        n_items = len([q for q in (queries or []) if q is not None])
        final_results = create_id_group("B", formatted_results, n_items=n_items)
        # print(json.dumps(final_results, indent=2, ensure_ascii=False))
        return final_results

