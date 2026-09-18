import { GRAPH_API } from '@/lib/settings'

export interface PageInfo {
  id: string
  name: string
  category: string
  accessToken: string
  igUserId: string
  igUsername: string
}

async function graphGet(path: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH_API}/${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { method: 'GET' })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`
    throw new Error(msg)
  }
  return json as Record<string, unknown>
}

async function graphPost(path: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH_API}/${path}`)
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) body.set(k, v)
  const res = await fetch(url, { method: 'POST', body })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error) {
    const msg = (json as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`
    throw new Error(msg)
  }
  return json as Record<string, unknown>
}

/**
 * Exchange a short-lived user token for a long-lived one (~60 days).
 * Requires the App ID + App Secret of the Meta app the token belongs to.
 */
export async function exchangeLongLivedToken(
  shortToken: string,
  appId: string,
  appSecret: string
): Promise<{ token: string; expiresInDays: number }> {
  const json = await graphGet('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  })
  const token = String(json.access_token ?? '')
  const expires = Number(json.expires_in ?? 0) // seconds
  if (!token) throw new Error('Token exchange returned no access token')
  return { token, expiresInDays: Math.round(expires / 86400) }
}

/**
 * List the Facebook Pages the token can manage, including each page's
 * page access token and linked Instagram Business account.
 */
export async function fetchPages(userToken: string): Promise<PageInfo[]> {
  const json = await graphGet('me/accounts', {
    fields: 'id,name,category,access_token,instagram_business_account{id,username}',
    access_token: userToken,
    limit: '50',
  })
  const data = (json.data ?? []) as Array<Record<string, unknown>>
  return data.map((p) => {
    const ig = (p.instagram_business_account ?? null) as Record<string, unknown> | null
    return {
      id: String(p.id ?? ''),
      name: String(p.name ?? ''),
      category: String(p.category ?? ''),
      accessToken: String(p.access_token ?? ''),
      igUserId: ig ? String(ig.id ?? '') : '',
      igUsername: ig ? String(ig.username ?? '') : '',
    }
  })
}

/** Quick health probe for the stored page token */
export async function checkPageHealth(
  pageId: string,
  pageToken: string
): Promise<{ ok: boolean; pageName: string; message: string }> {
  try {
    const json = await graphGet(pageId, { fields: 'name', access_token: pageToken })
    return { ok: true, pageName: String(json.name ?? ''), message: 'Connected' }
  } catch (e) {
    return { ok: false, pageName: '', message: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export interface PublishResult {
  ok: boolean
  postId: string
  permalink: string
  error: string
}

/**
 * Publish a photo to Instagram. Two-step Graph API flow:
 * 1. Create a media container (Meta servers fetch image_url — must be public)
 * 2. Publish the container
 */
export async function publishToInstagram(
  igUserId: string,
  pageToken: string,
  imageUrl: string,
  caption: string
): Promise<PublishResult> {
  try {
    const container = await graphPost(`${igUserId}/media`, {
      image_url: imageUrl,
      caption: caption.slice(0, 2200),
      access_token: pageToken,
    })
    const creationId = String(container.id ?? '')
    if (!creationId) throw new Error('No container id returned')

    // Poll container status (Meta needs a moment to download the image)
    let ready = false
    for (let i = 0; i < 10; i++) {
      const status = await graphGet(creationId, {
        fields: 'status_code',
        access_token: pageToken,
      })
      if (String(status.status_code ?? '') === 'FINISHED') {
        ready = true
        break
      }
      if (String(status.status_code ?? '') === 'ERROR') {
        throw new Error('Instagram could not process the image')
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    if (!ready) throw new Error('Image processing timed out (try a smaller JPEG)')

    const published = await graphPost(`${igUserId}/media_publish`, {
      creation_id: creationId,
      access_token: pageToken,
    })
    const postId = String(published.id ?? '')
    let permalink = ''
    try {
      const info = await graphGet(postId, {
        fields: 'permalink',
        access_token: pageToken,
      })
      permalink = String(info.permalink ?? '')
    } catch {
      /* permalink lookup is best-effort */
    }
    return { ok: true, postId, permalink, error: '' }
  } catch (e) {
    return {
      ok: false,
      postId: '',
      permalink: '',
      error: e instanceof Error ? e.message : 'Unknown Instagram error',
    }
  }
}

/** Publish a photo post to a Facebook Page feed */
export async function publishToFacebook(
  pageId: string,
  pageToken: string,
  imageUrl: string,
  caption: string
): Promise<PublishResult> {
  try {
    const json = await graphPost(`${pageId}/photos`, {
      url: imageUrl,
      caption: caption.slice(0, 5000),
      access_token: pageToken,
    })
    const postId = String(json.post_id ?? json.id ?? '')
    let permalink = ''
    try {
      const info = await graphGet(postId, {
        fields: 'permalink_url',
        access_token: pageToken,
      })
      permalink = String(info.permalink_url ?? '')
    } catch {
      /* best-effort */
    }
    return { ok: true, postId, permalink, error: '' }
  } catch (e) {
    return {
      ok: false,
      postId: '',
      permalink: '',
      error: e instanceof Error ? e.message : 'Unknown Facebook error',
    }
  }
}
