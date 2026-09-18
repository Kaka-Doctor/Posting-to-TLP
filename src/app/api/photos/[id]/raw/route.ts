import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const UPLOADS_DIR = '/home/z/my-project/uploads'
const THUMB_DIR = path.join(UPLOADS_DIR, 'thumbs')

/**
 * PUBLIC image endpoint. Instagram/Facebook servers download the photo
 * from this URL when publishing — it must stay reachable without auth.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const photo = await db.photo.findUnique({ where: { id } })
  if (!photo) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  }

  const wantThumb = new URL(request.url).searchParams.get('size') === 'thumb'
  const filename = wantThumb && photo.thumbname ? path.join(THUMB_DIR, photo.thumbname) : path.join(UPLOADS_DIR, photo.filename)

  try {
    const buf = await fs.readFile(filename)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    // Thumb missing → fall back to the original
    try {
      const buf = await fs.readFile(path.join(UPLOADS_DIR, photo.filename))
      return new NextResponse(new Uint8Array(buf), {
        headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' },
      })
    } catch {
      return NextResponse.json({ error: 'File missing on disk' }, { status: 404 })
    }
  }
}

