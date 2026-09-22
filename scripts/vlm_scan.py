#!/usr/bin/env python3
"""Batch VLM scan of all candidate VOTD images → /tmp/vlm-results/<name>.json"""
import subprocess, json, os, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

PHOTOS = "/home/z/my-project/biblia-repo/data/photos"
OUT = "/tmp/vlm-results"
os.makedirs(OUT, exist_ok=True)

PROMPT = ('This image is supposed to be a YouVersion-style Bible verse graphic. '
          'Answer in strict JSON only (no markdown, no code fences): '
          '{"is_verse_graphic": boolean, "verse_ref": "Book Chapter:Verse exactly as written on the image", '
          '"verse_text": "the scripture text written on the image, verbatim", '
          '"language": "language of the text", '
          '"quality": "clean|watermark|screenshot_with_ui|lowres|not_a_verse_graphic", '
          '"notes": "one short sentence"}')

files = sorted(f for f in os.listdir(PHOTOS) if f.lower().endswith(".jpg"))

def scan(name):
    dest = os.path.join(OUT, name + ".json")
    if os.path.exists(dest) and os.path.getsize(dest) > 100:
        return name, "cached"
    last = ""
    for attempt in range(4):
        try:
            r = subprocess.run(
                ["z-ai", "vision", "-p", PROMPT, "-i", os.path.join(PHOTOS, name), "-o", dest],
                capture_output=True, text=True, timeout=180)
            ok = os.path.exists(dest) and os.path.getsize(dest) > 100
            if ok:
                return name, "ok" + (f" (attempt {attempt+1})" if attempt else "")
            last = (r.stderr or r.stdout or "")[:120]
        except Exception as e:
            last = str(e)[:120]
        import time; time.sleep(8 * (attempt + 1))
    return name, "fail: " + last

fails = 0
with ThreadPoolExecutor(max_workers=1) as ex:
    futs = {ex.submit(scan, f): f for f in files}
    for fut in as_completed(futs):
        name, status = fut.result()
        if status.startswith("fail"):
            fails += 1
            print(f"  ✗ {name} → {status}")
        else:
            print(f"  ✓ {name} ({status})")

print(f"\ndone: {len(files) - fails}/{len(files)} succeeded")
sys.exit(1 if fails else 0)
