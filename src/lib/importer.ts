import { db } from '@/lib/db'
import { log } from '@/lib/settings'
import { exchangeLongLivedToken, fetchPages } from '@/lib/meta'
import { promises as fs } from 'fs'
import path from 'path'

export const DATA_DIR = path.join(process.cwd(), 'data')
export const PHOTOS_DIR = path.join(DATA_DIR, 'photos')
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json')
export const CAPTIONS_FILE = path.join(DATA_DIR, 'captions.txt')

const globalForImport = globalThis as unknown as { __dataImported?: boolean }

/**
 * Creates the tables if they don't exist (Prisma-equivalent DDL).
 * Needed for serverless hosts (Vercel) where the SQLite file starts empty,
 * and harmless everywhere else.
 */
export async function ensureSchema(): Promise<void> {
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "autoPost" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
    "slots" TEXT NOT NULL DEFAULT '06:00,12:00,18:00',
    "graceMinutes" INTEGER NOT NULL DEFAULT 60,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiEnhanceCaptions" BOOLEAN NOT NULL DEFAULT false,
    "groqApiKey" TEXT NOT NULL DEFAULT '',
    "groqModel" TEXT NOT NULL DEFAULT 'groq/compound',
    "pageTheme" TEXT NOT NULL DEFAULT 'Teaching resources: lesson plans, teaching tips, classroom ideas and encouragement for teachers',
    "metaUserToken" TEXT NOT NULL DEFAULT '',
    "appId" TEXT NOT NULL DEFAULT '',
    "appSecret" TEXT NOT NULL DEFAULT '',
    "pageId" TEXT NOT NULL DEFAULT '',
    "pageName" TEXT NOT NULL DEFAULT '',
    "pageAccessToken" TEXT NOT NULL DEFAULT '',
    "igUserId" TEXT NOT NULL DEFAULT '',
    "igUsername" TEXT NOT NULL DEFAULT '',
    "tokenObtainedAt" DATETIME,
    "tokenExpiresAt" DATETIME,
    "publicBaseUrl" TEXT NOT NULL DEFAULT '',
    "configTokenSeen" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  // Databases created by an older build may lack the rotation column
  try {
    await db.$executeRawUnsafe(`ALTER TABLE "Settings" ADD COLUMN "configTokenSeen" TEXT NOT NULL DEFAULT ''`)
  } catch {
    /* column already exists */
  }
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "thumbname" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT 'uploads',
    "originalName" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Caption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "text" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slotKey" TEXT NOT NULL,
    "slotLabel" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "photoId" TEXT,
    "captionId" TEXT,
    "finalCaption" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "igPostId" TEXT NOT NULL DEFAULT '',
    "igPermalink" TEXT NOT NULL DEFAULT '',
    "igError" TEXT NOT NULL DEFAULT '',
    "fbPostId" TEXT NOT NULL DEFAULT '',
    "fbPermalink" TEXT NOT NULL DEFAULT '',
    "fbError" TEXT NOT NULL DEFAULT '',
    "aiReason" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" DATETIME
  )`)
  await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AgentLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
}

export interface DataConfig {
  metaUserToken?: string
  appId?: string
  appSecret?: string
  pageId?: string
  pageName?: string
  pageAccessToken?: string
  igUserId?: string
  igUsername?: string
  groqApiKey?: string
  groqModel?: string
  timezone?: string
  slots?: string
  aiEnabled?: boolean
  aiEnhanceCaptions?: boolean
  pageTheme?: string
  publicBaseUrl?: string
}

export interface ImportSummary {
  fresh: boolean
  photosAdded: number
  captionsAdded: number
  configApplied: string[]
  connection: 'already' | 'restored' | 'connected' | 'failed' | 'skipped'
  message: string
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.jpe?g$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'photo'
}

async function readJson(file: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Imports everything found in the data/ folder:
 *  - config.json  → tokens & keys (secrets fill empty fields only)
 *  - photos/*.jpg → photo library (committed files, served read-only)
 *  - captions.txt → caption bank (sections separated by --- lines)
 *
 * Safe to run repeatedly — existing entries are skipped, stored settings
 * are never overwritten with emptier values.
 */
export async function importFromDataFolder(): Promise<ImportSummary> {
  const summary: ImportSummary = {
    fresh: false,
    photosAdded: 0,
    captionsAdded: 0,
    configApplied: [],
    connection: 'skipped',
    message: '',
  }

  // ---- settings row ----
  let settings = await db.settings.findUnique({ where: { id: 'settings' } })
  if (!settings) {
    settings = await db.settings.create({
      data: { id: 'settings', groqApiKey: process.env.GROQ_API_KEY ?? '' },
    })
    summary.fresh = true
  }

  const cfg = (await readJson(CONFIG_FILE)) as Partial<DataConfig>

  // Values can come from data/config.json OR environment variables
  // (env vars are the natural source on Vercel — see README.md).
  const resolved: Record<string, string> = {}
  const envSources: Record<string, string | undefined> = {
    metaUserToken: process.env.META_ACCESS_TOKEN,
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    groqApiKey: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_MODEL,
    publicBaseUrl: process.env.PUBLIC_BASE_URL,
  }
  for (const key of Object.keys(envSources)) {
    const fromCfg = cfg[key as keyof DataConfig]
    resolved[key] =
      typeof fromCfg === 'string' && fromCfg.trim()
        ? fromCfg.trim()
        : (envSources[key] ?? '').trim()
  }

  // ---- apply config: on a fresh DB apply everything; otherwise fill only empty fields ----
  const data: Record<string, unknown> = {}
  const strFields: Array<[keyof DataConfig, keyof typeof settings]> = [
    ['groqApiKey', 'groqApiKey'],
    ['groqModel', 'groqModel'],
    ['metaUserToken', 'metaUserToken'],
    ['appId', 'appId'],
    ['appSecret', 'appSecret'],
    ['publicBaseUrl', 'publicBaseUrl'],
  ]
  for (const [cfgKey, dbKey] of strFields) {
    const value = resolved[cfgKey as string]
    if (value && !(settings as Record<string, unknown>)[dbKey as string]) {
      data[dbKey as string] = value
      summary.configApplied.push(String(cfgKey))
    }
  }
  if (summary.fresh) {
    if (typeof cfg.timezone === 'string' && cfg.timezone.trim()) data.timezone = cfg.timezone.trim()
    if (typeof cfg.slots === 'string' && cfg.slots.trim()) data.slots = cfg.slots.trim()
    if (typeof cfg.pageTheme === 'string' && cfg.pageTheme.trim()) data.pageTheme = cfg.pageTheme.trim()
    if (typeof cfg.aiEnabled === 'boolean') data.aiEnabled = cfg.aiEnabled
    if (typeof cfg.aiEnhanceCaptions === 'boolean') data.aiEnhanceCaptions = cfg.aiEnhanceCaptions
    // direct page connection from config (Vercel fast path — no token exchange needed)
    if (cfg.pageId && cfg.pageAccessToken) {
      data.pageId = cfg.pageId
      data.pageAccessToken = cfg.pageAccessToken
      data.pageName = cfg.pageName ?? ''
      data.igUserId = cfg.igUserId ?? ''
      data.igUsername = cfg.igUsername ?? ''
      summary.connection = 'restored'
    }
  }
  if (Object.keys(data).length > 0) {
    settings = await db.settings.update({ where: { id: 'settings' }, data })
  }

  // ---- photos from data/photos ----
  try {
    const files = await fs.readdir(PHOTOS_DIR)
    for (const file of files) {
      if (!/\.jpe?g$/i.test(file)) continue
      const id = `data-${slugify(file)}`
      const exists = await db.photo.findUnique({ where: { id } })
      if (exists) continue
      let description = ''
      try {
        description = (await fs.readFile(path.join(PHOTOS_DIR, `${file}.txt`), 'utf-8')).trim().slice(0, 300)
      } catch { /* optional */ }
      const stat = await fs.stat(path.join(PHOTOS_DIR, file))
      await db.photo.create({
        data: {
          id,
          filename: file,
          location: 'data',
          originalName: file,
          description,
          mimeType: 'image/jpeg',
          sizeBytes: stat.size,
        },
      })
      summary.photosAdded++
    }
  } catch {
    /* data/photos missing or unreadable */
  }

  // ---- captions from data/captions.txt ----
  try {
    const raw = await fs.readFile(CAPTIONS_FILE, 'utf-8')
    const texts = raw
      .split(/\n\s*---+\s*\n/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2 && t.length <= 2200)
    if (texts.length > 0) {
      const existing = new Set((await db.caption.findMany({ select: { text: true } })).map((c) => c.text))
      const fresh = texts.filter((t) => !existing.has(t))
      if (fresh.length > 0) {
        await db.caption.createMany({ data: fresh.map((text) => ({ text })) })
        summary.captionsAdded = fresh.length
      }
    }
  } catch {
    /* captions.txt missing */
  }

  // ---- connect / re-connect based on the raw token fingerprint ----
  // First connect (no page linked yet) OR token rotation (the raw token in
  // data/config.json / env changed since the last successful connect).
  const rawToken = resolved.metaUserToken
  const tokenRotated = Boolean(rawToken && rawToken !== settings.configTokenSeen)
  if (rawToken && (!settings.pageAccessToken || tokenRotated)) {
    summary.connection = await autoConnect(rawToken, resolved.appId || settings.appId, resolved.appSecret || settings.appSecret)
  } else if (summary.connection === 'skipped' && settings.pageAccessToken) {
    summary.connection = 'already'
  }

  summary.message =
    `Imported ${summary.photosAdded} photo(s), ${summary.captionsAdded} caption(s)` +
    (summary.configApplied.length > 0 ? `, config: ${summary.configApplied.join(', ')}` : '')

  if (summary.photosAdded + summary.captionsAdded > 0 || summary.configApplied.length > 0) {
    await log('success', `Data folder import → ${summary.message} (connection: ${summary.connection})`)
  }
  globalForImport.__dataImported = true
  return summary
}

/** Exchange token → list pages → pick the configured/IG-linked page → save connection */
async function autoConnect(userToken: string, appId: string, appSecret: string): Promise<ImportSummary['connection']> {
  try {
    let token = userToken
    let expiresAt: Date | null = null
    if (appId && appSecret) {
      try {
        const exchanged = await exchangeLongLivedToken(userToken, appId, appSecret)
        token = exchanged.token
        // A re-exchange of an already-long-lived token returns no expires_in —
        // treat 0 as "no known expiry" instead of "expired now"
        expiresAt =
          exchanged.expiresInDays > 0 ? new Date(Date.now() + exchanged.expiresInDays * 86400000) : null
      } catch {
        /* fall back to the raw token */
      }
    }
    const pages = await fetchPages(token)
    if (pages.length === 0) return 'failed'

    const configured = await db.settings.findUnique({ where: { id: 'settings' } })
    const page =
      pages.find((p) => p.id === configured?.pageId) ??
      pages.find((p) => p.igUserId) ??
      pages[0]

    await db.settings.update({
      where: { id: 'settings' },
      data: {
        metaUserToken: token,
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.accessToken,
        igUserId: page.igUserId,
        igUsername: page.igUsername,
        tokenObtainedAt: new Date(),
        tokenExpiresAt: expiresAt,
        configTokenSeen: userToken,
      },
    })
    await log('success', `Auto-connected to page "${page.name}" from data/config.json`)
    return 'connected'
  } catch (e) {
    await log('error', `Auto-connect from config failed: ${e instanceof Error ? e.message : 'unknown'}`)
    return 'failed'
  }
}

/**
 * Boot-time bootstrap: create tables if missing + import the data folder once.
 * Idempotent and failure-tolerant (never blocks posting).
 */
export async function ensureDb(): Promise<void> {
  if (globalForImport.__dataImported) return
  try {
    await ensureSchema()
  } catch {
    /* schema already exists (or DDL blocked) — ignore */
  }
  try {
    await importFromDataFolder()
  } catch (e) {
    console.error('[agent] data import failed at boot', e)
    globalForImport.__dataImported = true
  }
}
