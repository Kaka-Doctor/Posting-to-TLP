import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')
const DATA_PHOTOS_DIR = path.join(process.cwd(), 'data', 'photos')

function resolvePath(location: string, filename: string, thumb: boolean): string {
  if (location === 'data') {
    // Photos committed in the repo (data/photos) — served as-is (no thumbnails)
    return path.join(DATA_PHOTOS_DIR, filename)
  }
  return thumb ? path.join(UPLOADS_DIR, 'thumbs', filename) : path.join(UPLOADS_DIR, filename)
}

function jpegResponse(buf: Buffer) {
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' },
  })
}

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
  const primary = resolvePath(photo.location, photo.filename, wantThumb && Boolean(photo.thumbname))

  try {
    return jpegResponse(await fs.readFile(primary))
  } catch {
    // Thumb missing or wrong dir → always fall back to the original file
    for (const candidate of [
      resolvePath(photo.location, photo.filename, false),
      path.join(UPLOADS_DIR, photo.filename),
      path.join(DATA_PHOTOS_DIR, photo.filename),
    ]) {
      try {
        return jpegResponse(await fs.readFile(candidate))
      } catch {
        /* try next */
      }
    }
    return NextResponse.json({ error: 'File missing on disk' }, { status: 404 })
  }
}
