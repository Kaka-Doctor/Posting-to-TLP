#!/usr/bin/env python3
"""Aggregate all VLM scan results → one clean manifest table."""
import json, os, re

OUT = "/tmp/vlm-results"
rows = {}
for name in sorted(os.listdir(OUT)):
    if not name.endswith(".json"):
        continue
    photo = name[:-5]  # strip ".json"
    try:
        raw = open(os.path.join(OUT, name)).read()
        start = raw.find("{")
        d, _ = json.JSONDecoder().raw_decode(raw[start:])
        content = d["choices"][0]["message"]["content"].strip()
        # strip markdown fences if present
        content = re.sub(r"^```[a-z]*\s*|\s*```\s*$", "", content)
        content = content.replace("```", "").strip()
        v = json.loads(content)
        rows[photo] = v
    except Exception as e:
        print(f"PARSE FAIL {photo}: {e}")

print(f"parsed {len(rows)}/24\n")
print(f"{'photo':26s} {'ok':5s} {'ref':24s} {'quality':20s} verse text")
usable, rejected = [], []
for photo, v in sorted(rows.items()):
    ok = bool(v.get("is_verse_graphic")) and v.get("quality") in ("clean",)
    line = f"{photo:26s} {'YES' if ok else 'no':5s} {str(v.get('verse_ref',''))[:24]:24s} {str(v.get('quality',''))[:20]:20s} {str(v.get('verse_text',''))[:55]}"
    print(line)
    (usable if ok else rejected).append(photo)

print(f"\nUSABLE ({len(usable)}): {', '.join(usable)}")
print(f"REJECTED ({len(rejected)}): {', '.join(rejected)}")
json.dump(rows, open("/tmp/vlm-aggregate.json", "w"), indent=1)
print("\naggregate saved → /tmp/vlm-aggregate.json")
