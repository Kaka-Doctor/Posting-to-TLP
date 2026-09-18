import type { Settings } from '@prisma/client'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export interface PhotoOption {
  id: string
  name: string
  description: string
  timesUsed: number
}

export interface CaptionOption {
  id: string
  text: string
  timesUsed: number
}

export interface PairChoice {
  photoId: string
  captionId: string
  reason: string
}

async function chat(settings: Settings, messages: Array<{ role: string; content: string }>): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.groqApiKey}`,
    },
    body: JSON.stringify({ model: settings.groqModel, messages }),
    // Never let a slow/hung Groq call block a scheduled post
    signal: AbortSignal.timeout(25000),
  })
  const json = (await res.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  }
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `Groq HTTP ${res.status}`)
  }
  const content = json.choices?.[0]?.message?.content ?? ''
  if (!content) throw new Error('Groq returned an empty response')
  return content
}

/** Extract the first JSON object from a model reply (tolerates markdown fences) */
function extractJson<T>(raw: string): T {
  const cleaned = raw.replace(/```json/gi, '```').replace(/```/g, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON found in model reply')
  return JSON.parse(cleaned.slice(start, end + 1)) as T
}

const SLOT_VIBES: Record<string, string> = {
  morning: 'Morning post (6:00 AM) — teachers are scrolling before class; energising, "start your day" content works best.',
  midday: 'Midday post (12:00 PM) — lunch-break scrolling; quick practical tips and classroom hacks work best.',
  evening: 'Evening post (6:00 PM) — teachers unwinding after school; reflective, motivational, save-for-later content works best.',
}

/**
 * Ask Groq to choose the best caption-photo pair for the current slot.
 * Fair rotation is encouraged by exposing timesUsed and nudging the model
 * toward less-used items.
 */
export async function pickPair(
  settings: Settings,
  slotLabel: string,
  timeOfDay: 'morning' | 'midday' | 'evening',
  photos: PhotoOption[],
  captions: CaptionOption[]
): Promise<PairChoice> {
  const vibe = SLOT_VIBES[timeOfDay] ?? 'General post.'
  const system = `You are the content scheduler for a Facebook page and Instagram account about: ${settings.pageTheme}.
${vibe}
You must pick ONE photo and ONE caption to publish together right now.

Rules:
- Prefer photos and captions with LOWER "timesUsed" so content rotates fairly.
- Match the caption to the photo so they make sense together (use the photo description).
- If a caption references something visual, pick a photo that actually shows it.

Available photos (JSON): ${JSON.stringify(photos)}
Available captions (JSON): ${JSON.stringify(captions)}

Reply with STRICT JSON only, no other text:
{"photoId": "<id from photos>", "captionId": "<id from captions>", "reason": "<one short sentence>"}`

  const raw = await chat(settings, [
    { role: 'system', content: system },
    { role: 'user', content: `Choose the best pair for this ${slotLabel} slot now.` },
  ])
  const parsed = extractJson<PairChoice>(raw)

  const photoOk = photos.some((p) => p.id === parsed.photoId)
  const captionOk = captions.some((c) => c.id === parsed.captionId)
  if (!photoOk || !captionOk) {
    throw new Error('Model picked an id that does not exist')
  }
  return {
    photoId: parsed.photoId,
    captionId: parsed.captionId,
    reason: String(parsed.reason ?? '').slice(0, 300),
  }
}

/** Optional: let Groq lightly polish a caption (emoji + hashtags), keeping meaning */
export async function enhanceCaption(settings: Settings, original: string): Promise<string> {
  const raw = await chat(settings, [
    {
      role: 'system',
      content: `You rewrite social media captions for a page about: ${settings.pageTheme}.
Keep the original meaning and language. Make it engaging, add a few fitting emojis and 3-6 relevant hashtags at the end. Keep it under 2100 characters.
Reply with STRICT JSON only: {"caption": "<rewritten caption>"}`,
    },
    { role: 'user', content: original },
  ])
  const parsed = extractJson<{ caption: string }>(raw)
  if (!parsed.caption || parsed.caption.length < 5) throw new Error('Model returned an invalid caption')
  return parsed.caption
}

/** Connectivity test used by the Setup tab */
export async function testGroq(settings: Settings): Promise<{ ok: boolean; message: string }> {
  try {
    const raw = await chat(settings, [
      { role: 'user', content: 'Reply with exactly: OK' },
    ])
    return { ok: true, message: `Model ${settings.groqModel} replied: ${raw.slice(0, 80)}` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Unknown Groq error' }
  }
}
