import { NextResponse } from 'next/server'
import { runPostingJob } from '@/lib/poster'
import { log } from '@/lib/settings'

export const dynamic = 'force-dynamic'

/** Manual "Post Now" trigger — runs the exact same job the scheduler runs */
export async function POST() {
  await log('info', 'Manual "Post Now" triggered from dashboard')
  const result = await runPostingJob(`manual-${Date.now()}`, 'Manual', 'manual')
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
