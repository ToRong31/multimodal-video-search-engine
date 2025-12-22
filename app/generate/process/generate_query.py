import os
import google.generativeai as genai
from typing import List, Optional, Callable, Any

try:
    # Available via google-api-core; used to detect quota/limit errors
    from google.api_core.exceptions import ResourceExhausted, TooManyRequests, Forbidden
except Exception:  # pragma: no cover
    ResourceExhausted = tuple()  # type: ignore
    TooManyRequests = tuple()  # type: ignore
    Forbidden = tuple()  # type: ignore

class QueryGenerator:
    def __init__(self, api_key_manager=None, api_key: Optional[str] = None, model: str = "gemini-2.0-flash"):
        self.mgr = api_key_manager
        self.api_key = api_key
        self.gen_model = model
        
    def _cfg(self): 
        key = None
        if self.mgr is not None:
            key = self.mgr.get_next_key()
        elif self.api_key is not None:
            key = self.api_key
        else:
            key = os.getenv("GEMINI_API_KEY")
        genai.configure(api_key=key)
        
    def _model(self): 
        self._cfg()
        return genai.GenerativeModel(self.gen_model)
    
    def _is_quota_error(self, error: Exception) -> bool:
        # Check known exception classes and common message fragments
        if isinstance(error, (ResourceExhausted, TooManyRequests)):
            return True
        # Some backends may surface 403 when quota exhausted
        if isinstance(error, Forbidden):
            message = str(error).lower()
            if any(s in message for s in ["quota", "exceeded", "rate", "billing", "exhausted"]):
                return True
        message = str(error).lower()
        return any(s in message for s in [
            "quota", "rate limit", "rate-limit", "too many requests", "429", "exceeded", "exhausted"
        ])

    def _run_with_model(self, fn: Callable[[Any], Any]):
        # If no manager, just use configured single key
        if self.mgr is None:
            m = self._model()
            return fn(m)
        # With manager: try once per available key; mark exhausted on quota errors
        while True:
            try:
                key = self.mgr.get_next_key()
            except Exception:
                # No keys available
                raise RuntimeError("No available API keys: all keys are exhausted")
            genai.configure(api_key=key)
            m = genai.GenerativeModel(self.gen_model)
            try:
                return fn(m)
            except Exception as e:
                if self._is_quota_error(e):
                    try:
                        self.mgr.mark_exhausted(key)
                    except Exception:
                        pass
                    # try next key
                    continue
                raise
    
    def translate(self, text: str) -> str:
        prompt = (
            "You are a translator to English.\n"
            "- If the input is already English, return it unchanged.\n"
            "- Otherwise, translate it to natural, fluent English.\n"
            "- Output only the final text with no quotes or extra words.\n"
            f"Input:\n{text}\nOutput:"
        )
        r = self._run_with_model(lambda m: m.generate_content(prompt))
        return (getattr(r, "text", "") or "").strip()

    def generate_simple(self, text: str) -> List[str]:
        paraphrase_prompt = (
            "You are a video retrieval expert. Generate a single English paraphrase of the given query "
            "that maintains the same intent but uses different wording.\n"
            "Input:\n{}\n\nParaphrase:".format(text)
        )
        
        paraphrase_response = self._run_with_model(
            lambda m: m.generate_content(
                paraphrase_prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.7, 
                    max_output_tokens=64, 
                    response_mime_type="text/plain"
                )
            )
        )
        paraphrase = (getattr(paraphrase_response, "text", "") or "").strip().strip('"')
        augment_prompt = (
            "You are a video retrieval expert. Generate a single English query that adds a litte bit more context "
            "to the given query to improve retrieval accuracy. "
            "Add relevant visual details, scene context, or temporal information.\n"
            "Input:\n{}\n\nAugmented:".format(text)
        )
        augment_response = self._run_with_model(
            lambda m: m.generate_content(
                augment_prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.7, 
                    max_output_tokens=96, 
                    response_mime_type="text/plain"
                )
            )
        )
        augmented = (getattr(augment_response, "text", "") or "").strip().strip('"')
        
        results = []
        if paraphrase and paraphrase != text:
            results.append(paraphrase)
        else:
            results.append(text)  
            
        if augmented and augmented != text:
            results.append(augmented)
        else:
            results.append(text)  
            
        return results[:2]  

    def generate_queries(self, text: str) -> List[str]:
        original = text.strip()
        augmented_queries = self.generate_simple(text)
        
        if len(augmented_queries) >= 2:
            paraphrase = augmented_queries[0]
            augmented = augmented_queries[1]
        else:
            paraphrase = original
            augmented = original
        
        return [original, paraphrase, augmented]