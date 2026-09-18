# 📁 Your Data Folder — Put Everything Here

This is the folder where you drop everything the agent needs. **Every file here is picked up automatically** when the agent starts, and you can also re-scan it any time with the **"Scan data folder"** button in the dashboard (Photos tab) or by calling `POST /api/import`.

After adding files on your own computer: commit + push to GitHub, and Vercel/Netlify redeploys with the new content in seconds.

---

## 1. Photos → `data/photos/`

Drop your photos for posting here.

- **Format:** `.jpg` / `.jpeg` only (Instagram requirement)
- **Size:** at least 320 px wide, at most 8 MB per photo
- **Naming:** any filename, e.g. `monday-lesson.jpg`

Photos are used **in rotation** (least-recently-used first), so nothing gets over-posted.

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
- Captions are posted **exactly as written** — nothing is rewritten.
- Empty sections and duplicates are ignored automatically, so you can edit this file freely and re-scan.

## 3. The switch file → `data/config.json`

Everything you might change later lives in this **one file**:

| Field | What it is |
|---|---|
| `metaUserToken` | Your Facebook access token (the master key) |
| `appId` / `appSecret` | Your Meta app credentials |
| **`pageId`** | **The page the agent posts to — change this to switch pages** |
| `pageName`, `igUserId`, `igUsername` | Informational — auto-refreshed on connect |
| `timezone`, `slots` | The schedule (default 06:00, 12:00, 18:00 EAT) |

This file **is committed to the repo** (which is private) so your Vercel/Netlify deployment works with zero manual setup. If you ever make the repo public, move these values to host environment variables and delete this file from git (the main README.md shows exactly which variables to create).

### Switching to another page

1. Open `data/config.json`.
2. Change `pageId` to the new page's ID (the `_readme` field inside the file lists all your pages and their IDs — e.g. `Ladies Of Destiny=710815315448548`). You can also set just `igUsername` and leave `pageId` empty.
3. Commit + push. On the next start or cron hit the agent notices the change, fetches the new page's access token from Meta, and starts posting there. Photos, captions, and the schedule carry over unchanged.

## What happens after you drop files

1. The agent scans this folder at startup (and on every "Scan data folder" click).
2. New photos and captions are added to the library — existing ones are skipped, nothing is duplicated.
3. At each posting time (default **6:00, 12:00, 18:00** EAT) the agent takes the least-recently-used photo + caption and posts to **Instagram and Facebook at the same time**, caption exactly as written.
4. If one platform errors, the other still gets its post — the failure is recorded in the history with the exact reason.
