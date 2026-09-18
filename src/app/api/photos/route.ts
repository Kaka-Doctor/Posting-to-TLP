import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { log } from '@/lib/settings'
import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import sharp from 'sharp'

export const dynamic = 'force-dynamic'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')
const THUMBS_DIR = path.join(UPLOADS_DIR, 'thumbs')
const MAX_BYTES = 8 * 1024 * 1024 // Instagram API limit

export async function GET() {
  const photos = await db.photo.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(
    photos.map((p) => ({
      id: p.id,
      originalName: p.originalName,
      description: p.description,
      active: p.active,
      timesUsed: p.timesUsed,
      lastUsedAt: p.lastUsedAt,
      sizeBytes: p.sizeBytes,
      thumbUrl: `/api/photos/${p.id}/raw?size=thumb`,
      fullUrl: `/api/photos/${p.id}/raw`,
      createdAt: p.createdAt,
    }))
  )
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  }
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files uploaded' }, { status: 400 })
  }

  await fs.mkdir(UPLOADS_DIR, { recursive: true })
  await fs.mkdir(THUMBS_DIR, { recursive: true })

  const created: Array<Record<string, unknown>> = []
  const errors: string[] = []

  for (const file of files) {
    try {
      if (file.type !== 'image/jpeg') {
        errors.push(`${file.name}: skipped — Instagram accepts JPEG only (got ${file.type || 'unknown type'})`)
        continue
      }
      if (file.size > MAX_BYTES) {
        errors.push(`${file.name}: skipped — over 8MB (Instagram limit)`)
        continue
      }

      const buf = Buffer.from(await file.arrayBuffer())
      const image = sharp(buf, { failOn: 'error' })
      const meta = await image.metadata()
      if (!meta.width || !meta.height) throw new Error('Could not read image dimensions')
      if (meta.width < 320) throw new Error('Image is narrower than 320px (Instagram minimum)')

      const id = randomUUID()
      const stored = `${id}.jpg`
      await fs.writeFile(path.join(UPLOADS_DIR, stored), buf)

      // Small thumbnail for fast grid rendering
      try {
        await sharp(buf).resize({ width: 420, withoutEnlargement: true }).jpeg({ quality: 72 }).toFile(path.join(THUMBS_DIR, stored))
      } catch {
        /* thumbnail is optional */
      }

      const photo = await db.photo.create({
        data: {
          id,
          filename: stored,
          thumbname: stored,
          originalName: file.name.slice(0, 200),
          mimeType: 'image/jpeg',
          sizeBytes: file.size,
          description: String(form.get(`description_${file.name}`) ?? '').slice(0, 300),
        },
      })
      created.push({ id: photo.id, originalName: photo.originalName })
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : 'failed to process'}`)
    }
  }

  if (created.length > 0) {
    await log('success', `Uploaded ${created.length} photo${created.length > 1 ? 's' : ''} to the library`)
  }
  if (errors.length > 0) {
    await log('error', `Photo upload issues: ${errors.join(' | ')}`)
  }

  return NextResponse.json({ created, errors }, { status: created.length > 0 ? 201 : 400 })
}
