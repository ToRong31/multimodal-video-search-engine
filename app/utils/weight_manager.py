from typing import Dict, List, Optional, Tuple, Set
from app.config.weight_configs import ENSEMBLE_WEIGHT_CONFIGS, DEFAULT_WEIGHTS, BASE_WEIGHTS


class WeightManager:
    def __init__(self):
        self.weight_configs = ENSEMBLE_WEIGHT_CONFIGS.copy()
        self.default_weights = DEFAULT_WEIGHTS.copy()
        self.base_weights = BASE_WEIGHTS.copy()
    
    def get_weights_for_methods(self, 
                               use_cliph14: bool = False,
                               use_clipbigg14: bool = False,
                               use_image_cap: bool = False,
                               use_beit3: bool = False,
                               use_siglip2: bool = False,
                               use_ocr: bool = False,
                               use_gg: bool = False,
                               config_name: Optional[str] = None) -> Dict[str, float]:
        # If specific config name is provided, try to use it
        if config_name and config_name in self.weight_configs:
            return self.weight_configs[config_name].copy()
        
        # Generate active methods list
        active_methods = []
        if use_cliph14:
            active_methods.append("clip_h14")
        if use_clipbigg14:
            active_methods.append("clip_bigg14")
        if use_image_cap:
            active_methods.append("img_cap")
        if use_beit3:
            active_methods.append("beit3")
        if use_siglip2:
            active_methods.append("siglip2")
        if use_ocr:
            active_methods.append("ocr")
        if use_gg:
            active_methods.append("gg")
        
        # If no methods selected, return empty dict
        if not active_methods:
            return {}
        
        # Generate combination key (sorted alphabetically)
        combination_key = "_".join(sorted(active_methods))
        
        # Try to find exact match
        if combination_key in self.weight_configs:
            return self._filter_weights(self.weight_configs[combination_key], active_methods)
        
        # If no exact match, generate weights using base weights
        return self._generate_dynamic_weights(active_methods)
    
    def _filter_weights(self, weights: Dict[str, float], active_methods: List[str]) -> Dict[str, float]:
        return {method: weight for method, weight in weights.items() if method in active_methods}
    
    def _generate_dynamic_weights(self, active_methods: List[str]) -> Dict[str, float]:
        return {method: self.base_weights.get(method, 1.0) for method in active_methods}
    
    def get_available_configs(self) -> List[str]:
        return list(self.weight_configs.keys())
    
    def get_config_details(self, config_name: str) -> Optional[Dict[str, float]]:
        return self.weight_configs.get(config_name)
    
    def add_custom_config(self, config_name: str, weights: Dict[str, float]) -> None:
        self.weight_configs[config_name] = weights.copy()
    
    def get_method_combinations(self) -> List[Tuple[str, List[str]]]:
        combinations = []
        for config_name, weights in self.weight_configs.items():
            methods = list(weights.keys())
            combinations.append((config_name, methods))
        return combinations
    
    def suggest_config(self, 
                      use_cliph14: bool = False,
                      use_clipbigg14: bool = False,
                      use_image_cap: bool = False,
                      use_beit3: bool = False,
                      use_siglip2: bool = False,
                      use_ocr: bool = False,
                      use_gg: bool = False) -> Tuple[str, Dict[str, float]]:
        active_methods = []
        if use_cliph14:
            active_methods.append("clip_h14")
        if use_clipbigg14:
            active_methods.append("clip_bigg14")
        if use_image_cap:
            active_methods.append("img_cap")
        if use_beit3:
            active_methods.append("beit3")
        if use_siglip2:
            active_methods.append("siglip2")
        if use_ocr:
            active_methods.append("ocr")
        if use_gg:
            active_methods.append("gg")
        
        if not active_methods:
            return ("default", self.default_weights.copy())
        
        # Special case suggestions
        active_set = set(active_methods)
        
        # Default: try exact match or generate dynamic
        combination_key = "_".join(sorted(active_methods))
        if combination_key in self.weight_configs:
            return (combination_key, self.weight_configs[combination_key])
        else:
            return ("dynamic", self._generate_dynamic_weights(active_methods))


# Global instance for easy access
weight_manager = WeightManager()
