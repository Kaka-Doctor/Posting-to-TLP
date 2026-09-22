#!/usr/bin/env python3
"""State surgery + premature IG post cleanup for BOTH repos.

Main repo (Posting-to-social-medias):
  - future slots (09-22 12:00/18:00, 09-23 x3, 09-24 x3) + today's 06:00 slot:
    remove premature ig.id (posts published at booking time, not slot time),
    attach the caption for the IG catch-up to reuse
  - delete 9 premature IG media objects via Graph API

Biblia repo:
  - 09-23 + 09-24 slots: remove premature ig.id, attach captions from posts.json
  - delete 2 premature IG media objects
"""
import json
import urllib.request
import urllib.parse

GRAPH = 'https://graph.facebook.com/v21.0'
MAIN = '/home/z/my-project'
BIBLIA = '/home/z/biblia-repo'


def graph_delete(obj_id, token):
    url = f'{GRAPH}/{obj_id}?access_token={token}'
    req = urllib.request.Request(url, method='DELETE')
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {'error': str(e.read())}


# ── MAIN REPO ────────────────────────────────────────────────────────────────
cfg = json.load(open(f'{MAIN}/data/config.json'))
mt = cfg['pageAccessToken']
state = json.load(open(f'{MAIN}/data/state.json'))
caption = open(f'{MAIN}/data/captions.txt', encoding='utf-8').read().strip()

# slots to fix: remove premature ig + attach caption
fix_slots = [
    ('2026-09-22', '06:00'),  # posted 14h early; within 4h grace → re-post via catch-up
    ('2026-09-22', '12:00'),
    ('2026-09-22', '18:00'),
    ('2026-09-23', '06:00'), ('2026-09-23', '12:00'), ('2026-09-23', '18:00'),
    ('2026-09-24', '06:00'), ('2026-09-24', '12:00'), ('2026-09-24', '18:00'),
]
deleted, kept = [], []
for dk, label in fix_slots:
    rec = state['days'].get(dk, {}).get(label)
    if not rec:
        print(f'  ? {dk} {label}: no state record — skipping')
        continue
    ig = rec.get('ig', {}).get('id')
    if ig:
        res = graph_delete(ig, mt)
        ok = 'error' not in res
        print(f'  {dk} {label}: delete IG media {ig} → {"OK" if ok else res["error"][:80]}')
        deleted.append(ig)
        if ok:
            rec.pop('ig', None)
            rec['caption'] = caption
        else:
            kept.append(ig)
    else:
        rec['caption'] = caption
        print(f'  {dk} {label}: no ig.id — caption attached only')

json.dump(state, open(f'{MAIN}/data/state.json', 'w'), indent=2)
print(f'MAIN: {len(deleted)} premature IG posts deleted, {len(kept)} kept on error')

# ── BIBLIA REPO ──────────────────────────────────────────────────────────────
pcfg = json.load(open(f'{BIBLIA}/data/config.json'))
pt = pcfg['pageAccessToken']
pstate = json.load(open(f'{BIBLIA}/data/state.json'))
manifest = json.load(open(f'{BIBLIA}/data/posts.json'))
cap_by_photo = {p['photo']: p['caption'] for p in manifest['posts']}

for dk, label in [('2026-09-23', '09:00'), ('2026-09-24', '09:00')]:
    rec = pstate['days'].get(dk, {}).get(label)
    if not rec:
        print(f'  ? {dk} {label}: no state record — skipping')
        continue
    ig = rec.get('ig', {}).get('id')
    if ig:
        res = graph_delete(ig, pt)
        ok = 'error' not in res
        print(f'  {dk} {label}: delete IG media {ig} → {"OK" if ok else res["error"][:80]}')
        if ok:
            rec.pop('ig', None)
            rec['caption'] = cap_by_photo.get(rec.get('photo', ''), '')
    else:
        rec['caption'] = cap_by_photo.get(rec.get('photo', ''), '')

json.dump(pstate, open(f'{BIBLIA}/data/state.json', 'w'), indent=2)
print('BIBLIA: premature IG posts deleted, captions attached')
