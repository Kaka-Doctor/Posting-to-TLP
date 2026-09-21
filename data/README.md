# 📁 Your Data Folder — Put Everything Here

This is the folder where you drop everything the agent needs. **Every file here is picked up automatically** when the agent starts, and you can also re-scan it any time with the **"Scan data folder"** button in the dashboard (Photos tab) or by calling `POST /api/import`.

After adding files on your own computer: commit + push to GitHub — the GitHub Actions runner picks them up on its next 30-minute check (or a Vercel/Netlify deploy redeploys with the new content in seconds).

---

## 1. Photos → `data/photos/`

Drop your photos for posting here.

- **Format:** `.jpg` / `.jpeg` (Instagram requirement) — but if you drop `.png` or `.webp` files here, the GitHub Actions workflow **converts them to JPEG automatically**
- **Size:** any size works — the workflow auto-fixes everything: converts PNG → JPEG, crops to 4:5…1.91:1, scales to max 1440 px wide, upscales too-small images, and commits the fixed files back
- **Naming:** any filename, e.g. `monday-lesson.jpg`

Photos are used **in rotation** (least-recently-used first), so nothing gets over-posted.

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
- Captions are posted **exactly as written** — nothing is rewritten.
- Empty sections and duplicates are ignored automatically, so you can edit this file freely and re-scan.

## 3. The switch file → `data/config.json`

Everything you might change later lives in this **one file**:

| Field | What it is |
|---|---|
| `metaUserToken` | Your Facebook access token (the master key) |
| `appId` / `appSecret` | Your Meta app credentials |
| **`pageId`** | **The page the agent posts to — change this to switch pages** |
| `pageAccessToken` | The page's **permanent** token — maintained by the agent itself; posting keeps working even after `metaUserToken` expires |
| `pageName`, `igUserId`, `igUsername` | Informational — auto-refreshed on connect |
| `timezone`, `slots` | The schedule (default 06:00, 12:00, 18:00 EAT) |
| `autoPost` | Set to `false` to pause all automatic posting (remove the line or set `true` to resume) |

This file **is committed to the repo** (which is private) so your deployment works with zero manual setup. If you ever make the repo public, move these values to host environment variables and delete this file from git (the main README.md shows exactly which variables to create).

### Switching to another page

1. Open `data/config.json`.
2. Change `pageId` to the new page's ID (the `_readme` field inside the file lists all your pages and their IDs — e.g. `Ladies Of Destiny=710815315448548`). You can also set just `igUsername` and leave `pageId` empty.
3. If you run the agent on **GitHub Actions**, also paste a **fresh `metaUserToken`** (from the Graph API Explorer) — the old one is only used to mint the new page's permanent token, after which it can expire freely. On web hosts the saved page token takes care of this automatically.
4. Commit + push. The next run notices the change, fetches the new page's access token from Meta, and starts posting there. Photos, captions, and the schedule carry over unchanged.

## 4. The agent's memory → `data/state.json`

Written and committed **by the GitHub Actions runner** — you never edit it:

- which slots are already posted (per day, per slot)
- the rotation counters (which photo / caption comes next)
- a rolling event log of the last 100 runs

Deleting this file resets the agent's memory (it would re-post a slot it already did, if still inside the catch-up window). Keep it committed.

## What happens after you drop files

1. The agent scans this folder at startup (and on every "Scan data folder" click). The GitHub Actions runner reads the files directly on every run.
2. New photos and captions are added to the library — existing ones are skipped, nothing is duplicated.
3. At each posting time (default **6:00, 12:00, 18:00** EAT) the agent takes the least-recently-used photo + caption and posts to **Instagram and Facebook at the same time**, caption exactly as written.
4. If one platform errors, the other still gets its post — the failure is recorded in the history with the exact reason.
