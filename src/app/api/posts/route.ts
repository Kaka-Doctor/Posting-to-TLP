import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const posts = await db.post.findMany({
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: { photo: true, caption: true },
  })
  return NextResponse.json(
    posts.map((p) => ({
      id: p.id,
      slotLabel: p.slotLabel,
      source: p.source,
      status: p.status,
      finalCaption: p.finalCaption,
      photoName: p.photo?.originalName ?? '',
      photoThumb: p.photo ? `/api/photos/${p.photo.id}/raw?size=thumb` : '',
      igPermalink: p.igPermalink,
      igError: p.igError,
      fbPermalink: p.fbPermalink,
      fbError: p.fbError,
      aiReason: p.aiReason,
      createdAt: p.createdAt,
    }))
  )
}
