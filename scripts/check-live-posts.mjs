// Check the live posts on Instagram + Facebook via Meta Graph API
// Read-only: fetches published media/feed, prints a friendly summary.
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../data/config.json', import.meta.url), 'utf8'));
const PAGE_ID = cfg.pageId;
const IG_ID = cfg.igUserId;
const PAGE_TOKEN = cfg.pageAccessToken || cfg.metaUserToken;

const G = 'https://graph.facebook.com/v21.0';

async function gql(path, params = {}) {
  const qs = new URLSearchParams({ access_token: PAGE_TOKEN, ...params });
  const r = await fetch(`${G}/${path}?${qs}`);
  const j = await r.json();
  if (j.error) throw new Error(`${path}: ${j.error.message} (code ${j.error.code})`);
  return j;
}

function trim(s, n) { return (s || '').replace(/\s+/g, ' ').slice(0, n); }

console.log('=== INSTAGRAM @' + (cfg.igUsername || 'teachers_lesson_plan') + ' — latest media ===');
try {
  const ig = await gql(`${IG_ID}/media`, { fields: 'id,caption,permalink,timestamp,media_type,thumbnail_url,like_count,comments_count', limit: 6 });
  for (const m of ig.data) {
    console.log(`\n[IG ${m.id}] ${m.media_type || ''} ${m.timestamp}`);
    console.log(`  caption: "${trim(m.caption, 140)}"`);
    console.log(`  likes: ${m.like_count ?? 'n/a'}  comments: ${m.comments_count ?? 'n/a'}`);
    console.log(`  link: ${m.permalink}`);
  }
} catch (e) { console.log('IG error:', e.message); }

console.log('\n=== FACEBOOK "' + (cfg.pageName || 'page') + '" — latest feed ===');
try {
  const fb = await gql(`${PAGE_ID}/feed`, { fields: 'id,message,created_time,permalink_url,full_picture,is_published,status_type', limit: 6 });
  for (const p of fb.data) {
    console.log(`\n[FB ${p.id}] ${p.created_time} ${p.status_type || ''} published=${p.is_published !== false}`);
    console.log(`  message: "${trim(p.message, 140)}"`);
    console.log(`  has photo: ${!!p.full_picture}`);
    console.log(`  link: ${p.permalink_url}`);
  }
} catch (e) { console.log('FB error:', e.message); }

// Cross-check: the two permalinks recorded in state.json
console.log('\n=== Cross-check state.json permalinks ===');
const state = JSON.parse(readFileSync(new URL('../data/state.json', import.meta.url), 'utf8'));
const day = state.days['2026-09-20'] || {};
for (const [slot, rec] of Object.entries(day)) {
  if (rec.status !== 'published') continue;
  console.log(`\nSlot ${slot} → photo ${rec.photo}`);
  if (rec.ig) {
    try {
      const m = await gql(String(rec.ig.id), { fields: 'id,permalink,timestamp,like_count,comments_count' });
      console.log(`  IG live: id=${m.id} ts=${m.timestamp} likes=${m.like_count ?? 0} comments=${m.comments_count ?? 0} (${m.permalink})`);
    } catch (e) { console.log('  IG lookup failed:', e.message); }
  }
  if (rec.fb) {
    try {
      const p = await gql(String(rec.fb.id), { fields: 'id,permalink_url,created_time,message' });
      console.log(`  FB live: id=${p.id} ts=${p.created_time} (${p.permalink_url})`);
      console.log(`  FB message head: "${trim(p.message, 120)}"`);
    } catch (e) { console.log('  FB lookup failed:', e.message); }
  }
}
