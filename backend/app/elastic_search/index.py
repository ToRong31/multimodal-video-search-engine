import os
import json
import requests
from pathlib import Path
from elasticsearch import Elasticsearch
from elasticsearch.helpers import streaming_bulk
import glob

def get_es_host():
    fallback_hosts = [
        "http://elasticsearch:9200",
        "http://localhost:9200",
    ]
    for host in fallback_hosts:
        try:
            r = requests.get(f"{host}", timeout=2)
            if r.status_code == 200:
                print(f"[✓] Connected to Elasticsearch at: {host}")
                return host
        except requests.exceptions.RequestException:
            print(f"[✗] Cannot connect to: {host}")
    raise ConnectionError("❌ Could not connect to any Elasticsearch instance.")

# === Path setup (fixed) ===
HERE = Path(__file__).resolve()
REPO_ROOT = HERE.parents[2]  # app/elastic_search/index.py -> up 2 = repo root AIC2025
DATA_FOLDER = REPO_ROOT / "data" / "index" / "sparse"  # AIC2025/data/index/sparse

ES_HOST = get_es_host()
es = Elasticsearch(ES_HOST)

print("Ping:", es.ping())
print("Info:", es.info())

def create_index_with_mapping(index_name):
    if index_name.lower().startswith("object"):
        mapping = {
            "mappings": {
                "properties": {
                    "objects": {
                        "type": "nested",
                        "properties": {
                            "name":  {"type": "keyword"},
                            "color": {"type": "keyword"}
                        }
                    }
                }
            }
        }
    else:
        mapping = {
            "mappings": {
                "properties": {
                    "text": { "type": "text" }
                }
            }
        }
    es.indices.create(index=index_name, body=mapping, ignore=400)

def _iter_json_records(path: Path):
    # Hỗ trợ: .json (dict key->value) hoặc .jsonl/.ndjson (mỗi dòng 1 doc)
    if path.suffix.lower() == ".json":
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        for key, value in data.items():
            yield key, value
    else:
        with path.open("r", encoding="utf-8") as f:
            for i, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                _id = obj.get("_id") or obj.get("id") or str(i)
                yield _id, obj

def index_file(path: Path):
    index_name = path.stem
    print(f"\n-- Processing `{path}` → index `{index_name}`")

    create_index_with_mapping(index_name)

    actions = []
    for key, value in _iter_json_records(path):
        if index_name.lower().startswith("object"):
            # Expect value = list of [name, color]
            if isinstance(value, dict) and "objects" in value:
                objects = value["objects"]
            else:
                objects = [{"name": o[0], "color": o[1]} for o in value]
            doc = {"objects": objects}
        else:
            # Lưu toàn bộ value vào text (chuẩn hóa sang str)
            doc = {"text": json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value}

        actions.append({"_index": index_name, "_id": key, "_source": doc})

    if not actions:
        print("  ⚠ No records parsed from file.")
        return

    success = failures = 0
    for ok, result in streaming_bulk(
        client=es,
        actions=actions,
        raise_on_error=False,
        max_retries=3
    ):
        if ok:
            success += 1
        else:
            failures += 1
            res = list(result.values())[0]
            err = res.get("error", {})
            doc_id = res.get("_id")
            print(f"  ✗ Failed to index _id={doc_id}: {err}")

    print(f" → Indexed: {success}/{len(actions)} successful, {failures} failed")

def main():
    print(f"Resolved DATA_FOLDER: {DATA_FOLDER}")
    patterns = [str(DATA_FOLDER / "*.json"), str(DATA_FOLDER / "*.jsonl"), str(DATA_FOLDER / "*.ndjson")]
    files = []
    for p in patterns:
        files.extend(glob.glob(p))

    if not files:
        print("No JSON files found in", DATA_FOLDER)
        print("Checked patterns:", patterns)
        return

    print(f"Found {len(files)} file(s).")
    for path_str in files:
        path = Path(path_str)
        try:
            index_file(path)
        except Exception as e:
            print(f" !!! Error processing `{path}`: {e}")

    print("\nCurrent indices:")
    print(es.cat.indices(format="table"))

if __name__ == "__main__":
    main()
