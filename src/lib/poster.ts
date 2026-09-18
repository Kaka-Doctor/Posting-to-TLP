import { db } from '@/lib/db'
import { getSettings, log, localNow, targetsConfigured } from '@/lib/settings'
import { pickPair, enhanceCaption } from '@/lib/groq'
import { publishToInstagram, publishToFacebook, minutesSinceLastPost } from '@/lib/meta'
import type { Photo, Caption, Post } from '@prisma/client'

const globalForPoster = globalThis as unknown as { __posterRunning: boolean }

function timeOfDayFor(minutesOfDay: number): 'morning' | 'midday' | 'evening' {
  if (minutesOfDay < 10 * 60) return 'morning'
  if (minutesOfDay < 15 * 60) return 'midday'
  return 'evening'
}

/** Least-recently-used ordering used by the sequential (non-AI) picker */
const LRU = [{ timesUsed: 'asc' as const }, { lastUsedAt: 'asc' as const }]

export interface RunOutcome {
  ok: boolean
  post: Post | null
  message: string
}

export interface RunOptions {
  /** Select photo + caption (AI or fallback) but do NOT publish anything */
  dryRun?: boolean
}

/**
 * Runs one full posting cycle:
 * select photo + caption (AI or sequential) -> publish to Instagram + Facebook -> record history.
 *
 * Resilience guarantee: every AI step is wrapped in try/catch with a
 * sequential-rotation fallback — if Groq is down, wrong, or slow, the post
 * still goes out using the least-recently-used photo + caption.
 */
export async function runPostingJob(
  slotKey: string,
  slotLabel: string,
  source: 'auto' | 'manual',
  opts: RunOptions = {}
): Promise<RunOutcome> {
  if (globalForPoster.__posterRunning) {
    return { ok: false, post: null, message: 'Another posting job is already running' }
  }
  globalForPoster.__posterRunning = true
  try {
    const settings = await getSettings()
    const targets = targetsConfigured(settings)
    if (!targets.instagram && !targets.facebook) {
      await log('error', `${slotLabel}: Cannot post — Meta account not connected yet (see Setup tab)`)
      return { ok: false, post: null, message: 'Meta account not connected yet' }
    }

    const photos = await db.photo.findMany({ where: { active: true }, orderBy: LRU })
    const captions = await db.caption.findMany({ where: { active: true }, orderBy: LRU })

    if (photos.length === 0 || captions.length === 0) {
      const why = photos.length === 0 ? 'no active photos' : 'no active captions'
      const post = await db.post.create({
        data: {
          slotKey,
          slotLabel,
          source,
          status: 'skipped',
          finalCaption: '',
          igError: photos.length === 0 ? 'Library empty' : '',
          fbError: photos.length === 0 ? 'Library empty' : '',
        },
      })
      await log('error', `${slotLabel}: Skipped — ${why} in the library`)
      return { ok: false, post, message: `Nothing to post: ${why}` }
    }

    // ---- Pick photo + caption ----
    let photo: Photo = photos[0]
    let caption: Caption = captions[0]
    let aiReason = 'Sequential rotation (least-recently-used)'

    if (settings.aiEnabled && settings.groqApiKey) {
      try {
        const now = localNow(settings.timezone)
        const choice = await pickPair(
          settings,
          slotLabel,
          timeOfDayFor(now.minutesOfDay),
          photos.map((p) => ({
            id: p.id,
            name: p.originalName,
            description: p.description || p.originalName,
            timesUsed: p.timesUsed,
          })),
          captions.map((c) => ({ id: c.id, text: c.text, timesUsed: c.timesUsed }))
        )
        photo = photos.find((p) => p.id === choice.photoId) ?? photos[0]
        caption = captions.find((c) => c.id === choice.captionId) ?? captions[0]
        aiReason = `AI pick: ${choice.reason}`
        await log('info', `${slotLabel}: Groq chose photo "${photo.originalName}" + caption "${caption.text.slice(0, 40)}..." — ${choice.reason}`)
      } catch (e) {
        aiReason = `AI failed, fell back to rotation: ${e instanceof Error ? e.message : 'unknown'}`
        await log('error', `${slotLabel}: Groq selection failed → sequential fallback (${e instanceof Error ? e.message : 'unknown'})`)
      }
    }

    // ---- Final caption (optional AI polish) ----
    let finalCaption = caption.text
    if (settings.aiEnabled && settings.aiEnhanceCaptions && settings.groqApiKey) {
      try {
        finalCaption = await enhanceCaption(settings, caption.text)
        await log('info', `${slotLabel}: Caption polished by Groq`)
      } catch (e) {
        finalCaption = caption.text
        await log('error', `${slotLabel}: Caption polish failed → using original (${e instanceof Error ? e.message : 'unknown'})`)
      }
    }

    // ---- Public image URL (Meta servers download the image from here) ----
    const baseUrl = settings.publicBaseUrl.replace(/\/$/, '')
    const imageUrl = `${baseUrl}/api/photos/${photo.id}/raw`

    // ---- Dry run: record what WOULD be posted, publish nothing ----
    if (opts.dryRun) {
      const post = await db.post.create({
        data: {
          slotKey,
          slotLabel,
          source,
          photoId: photo.id,
          captionId: caption.id,
          finalCaption,
          status: 'skipped',
          igError: 'Dry run — nothing was published',
          fbError: 'Dry run — nothing was published',
          aiReason: `DRY RUN — ${aiReason}`,
        },
      })
      const urlNote = baseUrl
        ? 'image URL ready'
        : 'public URL not captured yet (open the dashboard once, or set PUBLIC_BASE_URL)'
      await log(
        'info',
        `${slotLabel}: DRY RUN — would post "${photo.originalName}" + "${finalCaption.slice(0, 40)}…" — ${aiReason} (${urlNote})`
      )
      return {
        ok: true,
        post,
        message: `Dry run: picked "${photo.originalName}" — nothing was published (${urlNote})`,
      }
    }

    if (!baseUrl) {
      const post = await db.post.create({
        data: {
          slotKey,
          slotLabel,
          source,
          photoId: photo.id,
          captionId: caption.id,
          finalCaption,
          status: 'failed',
          igError: 'Public URL not set',
          fbError: 'Public URL not set',
          aiReason: 'Photos are served from settings.publicBaseUrl — it is empty',
        },
      })
      await log('error', `${slotLabel}: Cannot publish — publicBaseUrl is empty. Open the dashboard once (it self-captures) or set PUBLIC_BASE_URL.`)
      return {
        ok: false,
        post,
        message: 'Public URL not set — open the dashboard once or set PUBLIC_BASE_URL, then retry',
      }
    }

    // ---- Duplicate-post guard ----
    // A persistent database already dedupes by slot. On serverless hosts
    // (Vercel) the database resets between invocations, so we ask Meta when
    // the last post actually went out before publishing again.
    const guardMinutes =
      source === 'auto'
        ? process.env.VERCEL
          ? Number(process.env.DEDUP_GUARD_MINUTES ?? 30)
          : 0
        : 3
    if (guardMinutes > 0) {
      const lastAgo = await minutesSinceLastPost(settings.igUserId, settings.pageId, settings.pageAccessToken)
      if (lastAgo !== null && lastAgo < guardMinutes) {
        const post = await db.post.create({
          data: {
            slotKey,
            slotLabel,
            source,
            photoId: photo.id,
            captionId: caption.id,
            finalCaption,
            status: 'skipped',
            igError: 'Duplicate guard',
            fbError: 'Duplicate guard',
            aiReason: `Duplicate guard — a post went out ${lastAgo} min ago (guard: ${guardMinutes} min)`,
          },
        })
        await log('info', `${slotLabel}: Skipped by duplicate guard — last post was ${lastAgo} min ago`)
        return {
          ok: true,
          post,
          message: `Duplicate guard: a post was published ${lastAgo} min ago — skipped to avoid double-posting`,
        }
      }
    }

    // ---- Publish ----
    const [igResult, fbResult] = await Promise.all([
      targets.instagram
        ? publishToInstagram(settings.igUserId, settings.pageAccessToken, imageUrl, finalCaption)
        : Promise.resolve(null),
      targets.facebook
        ? publishToFacebook(settings.pageId, settings.pageAccessToken, imageUrl, finalCaption)
        : Promise.resolve(null),
    ])

    const igOk = igResult === null || igResult.ok
    const fbOk = fbResult === null || fbResult.ok
    const status = igOk && fbOk ? 'published' : igOk || fbOk ? 'partial' : 'failed'

    const post = await db.post.create({
      data: {
        slotKey,
        slotLabel,
        source,
        photoId: photo.id,
        captionId: caption.id,
        finalCaption,
        status,
        igPostId: igResult?.postId ?? '',
        igPermalink: igResult?.permalink ?? '',
        igError: igResult && !igResult.ok ? igResult.error : '',
        fbPostId: fbResult?.postId ?? '',
        fbPermalink: fbResult?.permalink ?? '',
        fbError: fbResult && !fbResult.ok ? fbResult.error : '',
        aiReason,
        postedAt: new Date(),
      },
    })

    if (status !== 'failed') {
      await db.photo.update({
        where: { id: photo.id },
        data: { timesUsed: { increment: 1 }, lastUsedAt: new Date() },
      })
      await db.caption.update({
        where: { id: caption.id },
        data: { timesUsed: { increment: 1 }, lastUsedAt: new Date() },
      })
    }

    if (status === 'published') {
      await log('success', `${slotLabel}: Posted to Instagram${targets.instagram && targets.facebook ? ' + ' : ''}${targets.facebook ? 'Facebook' : ''} — "${photo.originalName}"`)
    } else if (status === 'partial') {
      await log('error', `${slotLabel}: Partially posted — IG: ${igResult?.error || 'OK'} | FB: ${fbResult?.error || 'OK'}`)
    } else {
      await log('error', `${slotLabel}: Post failed — IG: ${igResult?.error || 'not configured'} | FB: ${fbResult?.error || 'not configured'}`)
    }

    return {
      ok: status !== 'failed',
      post,
      message:
        status === 'published'
          ? 'Posted successfully to both platforms'
          : status === 'partial'
            ? 'Posted to one platform, the other failed (see history)'
            : 'Posting failed (see history)',
    }
  } finally {
    globalForPoster.__posterRunning = false
  }
}
