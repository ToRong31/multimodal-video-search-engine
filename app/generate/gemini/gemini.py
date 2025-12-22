from typing import List, Optional
from app.generate.gemini.api_key_manager import APIKeyManager
from app.generate.process.generate_query import QueryGenerator
from app.config.settings import GEMINI_KEYS, GEMINI_MODEL_NAME 

class Gemini:
    def __init__(self):
        self.api_key_manager = APIKeyManager(GEMINI_KEYS)
        self.query_helper = QueryGenerator(self.api_key_manager, model=GEMINI_MODEL_NAME)

    def generate_queries(self, text: str) -> List[str]:
        en_text = self.query_helper.translate(text)
        return self.query_helper.generate_queries(en_text)

    def translate_to_en(self, text: str) -> str:
        # Rotate to next API key to avoid rate limiting
        self.api_key_manager.get_next_key()
        return self.query_helper.translate(text)
