#!/bin/bash
# Batch VLM scan of all candidate VOTD images → /tmp/vlm-results/<name>.json
PHOTOS=/home/z/my-project/biblia-repo/data/photos
OUT=/tmp/vlm-results
rm -rf "$OUT"; mkdir -p "$OUT"

PROMPT='This image is supposed to be a YouVersion-style Bible verse graphic. Answer in strict JSON only (no markdown, no code fences): {"is_verse_graphic": boolean, "verse_ref": "Book Chapter:Verse exactly as written on the image", "verse_text": "the scripture text written on the image, verbatim", "language": "language of the text", "quality": "clean|watermark|screenshot_with_ui|lowres|not_a_verse_graphic", "notes": "one short sentence"}'

ls "$PHOTOS"/*.jpg | while read -r f; do
  echo "$(basename "$f")"
done | xargs -P 4 -I{} bash -c '
  name="{}"
  z-ai vision -p "$0" -i "'"$PHOTOS"'/$name" -o "'"$OUT"'/$name.json" >/dev/null 2>&1 || echo "FAIL: $name"
' "$PROMPT"

echo "done: $(ls "$OUT" | wc -l) results"
