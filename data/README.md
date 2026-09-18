# 📁 Your Data Folder — Put Everything Here

This is the folder where you drop everything the agent needs. **Every file here is picked up automatically** when the agent starts, and you can also re-scan it any time with the **"Scan data folder"** button in the dashboard (Photos tab) or by calling `POST /api/import`.

After adding files on your own computer: commit + push to GitHub, and Vercel redeploys with the new content in seconds.

---

## 1. Photos → `data/photos/`

Drop your photos for posting here.

- **Format:** `.jpg` / `.jpeg` only (Instagram requirement)
- **Size:** at least 320 px wide, at most 8 MB per photo
- **Naming:** any filename, e.g. `monday-lesson.jpg` — the AI uses the filename as a hint when matching photos to captions
- **Optional description:** create a text file with the **same name plus `.txt`** to describe the photo — the AI reads it and uses it to pick the best photo-caption pair:

```
data/photos/
├── monday-lesson.jpg
├── monday-lesson.jpg.txt      ← optional: "Grade 5 fractions lesson plan slide"
├── classroom-decor.jpeg
└── classroom-decor.jpeg.txt   ← optional: "Bright reading corner setup"
```

Photos are used **in rotation** (least-recently-used first) and the AI prefers photos that have been used less often, so nothing gets over-posted.

> Tip: a `SAMPLE-*.jpg` file may be included here so you can test immediately — delete it once you add your own photos.

## 2. Captions → `data/captions.txt`

One caption per section. Separate captions with a line containing only `---`:

```
First caption goes here, with hashtags and emojis if you like.

---

Second caption here.

---

Third caption here.
```

- Keep each caption between 2 and 2200 characters (Instagram limit).
- Empty sections and duplicates are ignored automatically, so you can edit this file freely and re-scan.

## 3. Keys & tokens → `data/config.json`

Everything else the agent needs (your Meta token, App ID, App Secret, Groq key, timezone, posting times) lives in `data/config.json`. A ready-to-edit template is in `data/config.example.json`.

Your real values are already saved in `data/config.json` on this machine. **This file is git-ignored on purpose** — for your Vercel deployment you paste the same values into Vercel → Settings → Environment Variables (the main README.md shows exactly which variables to create).

## What happens after you drop files

1. The agent scans this folder at startup (and on every "Scan data folder" click).
2. New photos and captions are added to the library — existing ones are skipped, nothing is duplicated.
3. At each posting time (default **6:00, 12:00, 18:00** EAT) the agent asks Groq to pick the best photo + caption combo, then posts to **Instagram and Facebook at the same time**.
4. **If Groq ever fails, the agent still posts** — it falls back to its own rotation picker, so your pages never go silent.
