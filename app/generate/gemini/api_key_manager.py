class APIKeyManager:
    def __init__(self, keys):
        self.keys = {key: 0 for key in keys}
        self.index = 0
        self.key_list = list(self.keys.keys())
        self.exhausted = set()
    def get_next_key(self):
        available_keys = [k for k in self.key_list if k not in self.exhausted]
        if not available_keys:
            raise RuntimeError("No available API keys: all keys are exhausted")
        if len(set(self.keys[k] for k in available_keys)) == 1:
            self.index = 0
        for _ in range(len(self.key_list)):
            key = self.key_list[self.index]
            self.index = (self.index + 1) % len(self.key_list)
            if key in self.exhausted:
                continue
            self.keys[key] += 1
            return key
        raise RuntimeError("Failed to select an API key: all keys appear exhausted")
    def get_key_usage(self):
        return self.keys
    def mark_exhausted(self, key):
        if key not in self.keys:
            raise KeyError(f"Unknown API key: {key}")
        self.exhausted.add(key)
    def mark_active(self, key):
        if key not in self.keys:
            raise KeyError(f"Unknown API key: {key}")
        self.exhausted.discard(key)
    def is_exhausted(self, key):
        if key not in self.keys:
            raise KeyError(f"Unknown API key: {key}")
        return key in self.exhausted
    def get_available_keys(self):
        return [k for k in self.key_list if k not in self.exhausted]