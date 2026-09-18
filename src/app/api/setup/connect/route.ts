import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSettings, log, isUsablePublicHost } from '@/lib/settings'
import { exchangeLongLivedToken, fetchPages } from '@/lib/meta'

export const dynamic = 'force-dynamic'

function derivePublicBaseUrl(request: Request): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
  if (!isUsablePublicHost(host)) return ''
  return `${proto}://${host}`.replace(/\/$/, '')
}

interface ConnectBody {
  token?: string
  appId?: string
  appSecret?: string
  pageId?: string
}

/**
 * Two-step flow:
 *  1. { token, appId?, appSecret? }  -> verifies token, returns page list to choose from
 *  2. { token, appId?, appSecret?, pageId }  -> saves the chosen page + IG account
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ConnectBody
  const token = (body.token ?? '').trim()
  const appId = (body.appId ?? '').trim()
  const appSecret = (body.appSecret ?? '').trim()

  if (!token) {
    return NextResponse.json({ error: 'Access token is required' }, { status: 400 })
  }

  // Try to extend the token when app credentials are supplied
  let workingToken = token
  let expiresAt: Date | null = null
  let tokenNote = 'Token stored as-is (page tokens drawn from it still work long-term)'
  if (appId && appSecret) {
    try {
      const exchanged = await exchangeLongLivedToken(token, appId, appSecret)
      workingToken = exchanged.token
      if (exchanged.expiresInDays > 0) {
        expiresAt = new Date(Date.now() + exchanged.expiresInDays * 86400000)
        tokenNote = `Exchanged to a long-lived user token (~${exchanged.expiresInDays} days)`
      } else {
        tokenNote = 'Token is already long-lived (no new expiry reported)'
      }
    } catch (e) {
      tokenNote = `Could not exchange token (${e instanceof Error ? e.message : 'unknown'}) — using the one you pasted`
    }
  }

  // List the pages this token can manage
  let pages
  try {
    pages = await fetchPages(workingToken)
  } catch (e) {
    return NextResponse.json(
      { error: `Token check failed: ${e instanceof Error ? e.message : 'unknown error'}` },
      { status: 400 }
    )
  }
  if (pages.length === 0) {
    return NextResponse.json(
      { error: 'This token cannot manage any Facebook Page. Make sure the token has pages_show_list + pages_manage_posts permissions.' },
      { status: 400 }
    )
  }

  // Step 1: just return the pages for selection
  if (!body.pageId) {
    return NextResponse.json({
      step: 'select-page',
      tokenNote,
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        igUsername: p.igUsername,
        hasInstagram: Boolean(p.igUserId),
      })),
    })
  }

  // Step 2: save the selected page
  const page = pages.find((p) => p.id === body.pageId)
  if (!page) {
    return NextResponse.json({ error: 'Selected page was not found for this token' }, { status: 400 })
  }

  await getSettings() // ensure row exists
  const derivedUrl = derivePublicBaseUrl(request)
  await db.settings.update({
    where: { id: 'settings' },
    data: {
      metaUserToken: workingToken,
      appId,
      appSecret,
      configTokenSeen: token,
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.accessToken,
      igUserId: page.igUserId,
      igUsername: page.igUsername,
      tokenObtainedAt: new Date(),
      tokenExpiresAt: expiresAt,
      ...(derivedUrl ? { publicBaseUrl: derivedUrl } : {}),
    },
  })

  await log(
    page.igUserId ? 'success' : 'info',
    `Connected to page "${page.name}"${page.igUserId ? ` + Instagram @${page.igUsername}` : ' (no Instagram account linked to this page)'}`
  )

  return NextResponse.json({
    step: 'connected',
    tokenNote,
    page: { id: page.id, name: page.name },
    instagram: { linked: Boolean(page.igUserId), username: page.igUsername },
    publicBaseUrl: derivedUrl,
  })
}
