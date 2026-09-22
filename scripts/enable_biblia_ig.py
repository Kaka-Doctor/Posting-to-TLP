#!/usr/bin/env python3
"""Enable FB + IG dual-platform for the Biblia repo with the minted permanent page token."""
import json

CONFIG = "/home/z/biblia-repo/data/config.json"
PERM_FILE = "/tmp/biblia_page_token.txt"

with open(PERM_FILE) as f:
    perm = f.read().strip()

cfg = json.load(open(CONFIG))

cfg["platforms"] = "facebook,instagram"
cfg["pageAccessToken"] = perm
cfg["igUserId"] = "17841470180666328"
cfg["igUsername"] = "biblia_tafsiri_mbalimbali"
cfg["pageName"] = "Biblia Tafsiri Mbalimbali"
cfg["pageId"] = "447560908444853"
cfg["_readme"] = (
    "THE config file for the Biblia Tafsiri Mbalimbali agent — posts one verse per day at 09:00 EAT "
    "to BOTH the Facebook page (binary photo upload) and the Instagram account "
    "(@biblia_tafsiri_mbalimbali, via hidden-FB-photo CDN container). (1) TOKENS: the permanent page "
    "token below (pageAccessToken) never expires — it was minted 2026-09-22 from the user token the "
    "owner pasted, using the app-id/secret exchange, and covers pages_manage_posts + "
    "instagram_content_publish. If it is ever revoked (password change / app removal), paste a fresh "
    "Graph API Explorer token into data/meta-token.txt and push — the next landed run re-mints it "
    "automatically. (2) Pause everything: set autoPost to false (the runner reads it live; force runs "
    "still work). (3) Schedule: slots + timezone — to change posting time edit 'slots' only. "
    "Page: Biblia Tafsiri Mbalimbali = 447560908444853; IG = 17841470180666328. "
    "If this repo ever goes public, move these values to host env vars instead."
)

json.dump(cfg, open(CONFIG, "w"), indent=2, ensure_ascii=False)
print("config.json updated:")
print(f"  platforms      = {cfg['platforms']}")
print(f"  pageId         = {cfg['pageId']}")
print(f"  igUserId       = {cfg['igUserId']} (@{cfg['igUsername']})")
print(f"  pageAccessToken= {perm[:25]}... ({len(perm)} chars, permanent)")
print(f"  slots          = {cfg['slots']} ({cfg['timezone']}), grace={cfg['graceMinutes']}m, horizon={cfg['scheduleDays']}d")
