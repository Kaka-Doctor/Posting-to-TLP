import { NextResponse } from 'next/server'
import { runPostingJob } from '@/lib/poster'
import { log } from '@/lib/settings'

export const dynamic = 'force-dynamic'

/**
 * Manual trigger — same job the scheduler runs.
 * Body (optional): { "dryRun": true } → picks photo + caption (AI or fallback)
 * but publishes nothing. Perfect for testing without touching your pages.
 */
export async function POST(request: Request) {
  let dryRun = false
  try {
    const body = await request.json()
    dryRun = Boolean(body?.dryRun)
  } catch {
    /* no body — normal run */
  }

  await log('info', dryRun ? 'Dry-run test triggered from dashboard' : 'Manual "Post Now" triggered from dashboard')
  const result = await runPostingJob(`manual-${Date.now()}`, dryRun ? 'Manual (dry run)' : 'Manual', 'manual', { dryRun })
  return NextResponse.json(
    {
      ok: result.ok,
      message: result.message,
      post: result.post
        ? {
            id: result.post.id,
            status: result.post.status,
            caption: result.post.finalCaption,
            aiReason: result.post.aiReason,
            igPermalink: result.post.igPermalink,
            fbPermalink: result.post.fbPermalink,
            igError: result.post.igError,
            fbError: result.post.fbError,
          }
        : null,
    },
    { status: result.ok ? 200 : 400 }
  )
}
