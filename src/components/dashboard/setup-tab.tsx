'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Loader2, Link2, Clock, ChevronDown, CircleCheck, CircleAlert, Save } from 'lucide-react'
import type { StatusResponse } from './types'

interface PageOption {
  id: string
  name: string
  category: string
  igUsername: string
  hasInstagram: boolean
}

export function SetupTab({ status, onRefresh }: { status: StatusResponse | null; onRefresh: () => void }) {
  // ---- connection wizard state ----
  const [token, setToken] = useState('')
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [pages, setPages] = useState<PageOption[]>([])
  const [selectedPage, setSelectedPage] = useState('')
  const [tokenNote, setTokenNote] = useState('')
  const [connecting, setConnecting] = useState(false)

  // ---- settings state ----
  const [autoPost, setAutoPost] = useState(true)
  const [slots, setSlots] = useState('06:00,12:00,18:00')
  const [timezone, setTimezone] = useState('Africa/Dar_es_Salaam')
  const [graceMinutes, setGraceMinutes] = useState(60)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s) return
        setAutoPost(s.autoPost)
        setSlots(s.slots)
        setTimezone(s.timezone)
        setGraceMinutes(s.graceMinutes)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  async function detect() {
    if (!token.trim()) {
      toast.error('Paste your access token first')
      return
    }
    setConnecting(true)
    setPages([])
    setSelectedPage('')
    try {
      const res = await fetch('/api/setup/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), appId: appId.trim(), appSecret: appSecret.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Token check failed')
        return
      }
      setPages(json.pages)
      setTokenNote(json.tokenNote)
      if (json.pages.length === 1) setSelectedPage(json.pages[0].id)
      toast.success(`Found ${json.pages.length} page${json.pages.length > 1 ? 's' : ''} — pick the one to connect`)
    } catch {
      toast.error('Could not contact Meta — check the token and try again')
    } finally {
      setConnecting(false)
    }
  }

  async function connect() {
    if (!selectedPage) {
      toast.error('Select a page first')
      return
    }
    setConnecting(true)
    try {
      const res = await fetch('/api/setup/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), appId: appId.trim(), appSecret: appSecret.trim(), pageId: selectedPage }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? 'Connection failed')
        return
      }
      if (json.instagram?.linked) {
        toast.success(`Connected to "${json.page.name}" + Instagram @${json.instagram.username}`)
      } else {
        toast.warning(`Connected to "${json.page.name}", but no Instagram account is linked to this page`, {
          description: 'In the Instagram app: Settings → Account → switch to Business/Creator and link this page, then reconnect.',
        })
      }
      setPages([])
      setToken('')
      onRefresh()
    } catch {
      toast.error('Connection failed — try again')
    } finally {
      setConnecting(false)
    }
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { autoPost, slots, timezone, graceMinutes }
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Settings saved — the agent picks them up within 30 seconds')
        onRefresh()
      } else {
        toast.error(json.error ?? 'Could not save settings')
      }
    } catch {
      toast.error('Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  const connected = status?.connected

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ---------- 1. Connect accounts ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-emerald-600" aria-hidden /> Connect your Facebook Page + Instagram
          </CardTitle>
          <CardDescription>
            Paste an access token from the Graph API Explorer. The agent auto-detects your pages, stores a page token, and starts posting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connected && (connected.instagram || connected.facebook) && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-1.5">
                  {connected.tokenHealth.ok ? <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden /> : <CircleAlert className="h-4 w-4 text-amber-500" aria-hidden />}
                  {connected.tokenHealth.ok ? 'Connected' : connected.tokenHealth.message}
                </span>
                {connected.facebook && <span>Facebook: {connected.pageName}</span>}
                {connected.instagram && <span>Instagram: @{connected.igUsername}</span>}
                {connected.tokenDaysLeft !== null && (
                  <Badge variant="secondary" className={connected.tokenDaysLeft <= 7 ? 'border border-amber-400 text-amber-700 dark:text-amber-300' : ''}>
                    token: {connected.tokenDaysLeft}d left
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Reconnect with a fresh token any time — posting continues using the same photo library.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="token">Access token (required)</Label>
            <Input
              id="token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="EAAG… paste the token from Graph API Explorer"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="appid">App ID (optional, enables 60-day token)</Label>
              <Input id="appid" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="1234567890" autoComplete="off" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appsecret">App Secret (optional)</Label>
              <Input id="appsecret" type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="app secret from app settings" autoComplete="off" />
            </div>
          </div>
          <Button onClick={detect} disabled={connecting} className="bg-emerald-600 hover:bg-emerald-700">
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
            {connecting ? 'Checking…' : 'Detect my pages'}
          </Button>

          {tokenNote && pages.length > 0 && (
            <p className="text-xs text-muted-foreground">{tokenNote}</p>
          )}

          {pages.length > 0 && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Choose the page to connect:</p>
              <RadioGroup value={selectedPage} onValueChange={setSelectedPage} className="gap-2">
                {pages.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <RadioGroupItem value={p.id} id={`page-${p.id}`} />
                    <Label htmlFor={`page-${p.id}`} className="flex-1 cursor-pointer font-normal">
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{p.category}</span>
                      {p.hasInstagram ? (
                        <Badge className="ml-2 bg-emerald-600 hover:bg-emerald-600">@{p.igUsername}</Badge>
                      ) : (
                        <Badge variant="secondary" className="ml-2 border border-amber-300 text-amber-700 dark:text-amber-300">no Instagram linked</Badge>
                      )}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
              <Button onClick={connect} disabled={!selectedPage || connecting} className="bg-emerald-600 hover:bg-emerald-700">
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CircleCheck className="h-4 w-4" aria-hidden />}
                Save &amp; connect this page
              </Button>
            </div>
          )}

          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-4 w-4" aria-hidden />
              How do I get this token? (step by step)
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2 rounded-md border bg-zinc-50 p-4 text-sm dark:bg-zinc-900/50">
              <ol className="list-decimal space-y-2 pl-5">
                <li>In the <b>Instagram app</b>, make sure <b>@teachers_lesson_plan</b> is a Business or Creator account (Settings → Account type) linked to your Facebook page.</li>
                <li>Go to <b>developers.facebook.com</b> → My Apps → <b>Create App</b> → type <b>Business</b> → create it (free).</li>
                <li>Open the <b>Graph API Explorer</b> (developers.facebook.com/tools/explorer), select your new app in the top-right.</li>
                <li>Click <b>Generate Access Token</b> and tick these permissions: <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">pages_show_list</code>, <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">pages_manage_posts</code>, <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">pages_read_engagement</code>, <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">instagram_basic</code>, <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">instagram_content_publish</code>. Approve the Facebook login popup.</li>
                <li>Copy the token shown, paste it above, and press <b>Detect my pages</b>.</li>
                <li>(Optional) Add your App ID + App Secret above so the agent converts your token into a 60-day one automatically.</li>
              </ol>
              <p className="text-xs text-muted-foreground">
                No app review needed — since you only post to your own page, development mode is enough. Tokens expire after ~60 days; the Overview tab warns you before that happens.
              </p>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* ---------- 2. Schedule ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-emerald-600" aria-hidden /> Schedule
          </CardTitle>
          <CardDescription>The agent checks the clock every 30 seconds and posts at each slot time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="font-medium">Auto-posting</p>
              <p className="text-xs text-muted-foreground">Turn off to pause all scheduled posting</p>
            </div>
            <Switch checked={autoPost} onCheckedChange={setAutoPost} aria-label="Toggle auto posting" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="slots">Posting times (HH:MM, comma separated)</Label>
              <Input id="slots" value={slots} onChange={(e) => setSlots(e.target.value)} placeholder="06:00,12:00,18:00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tz">Timezone</Label>
              <Input id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Africa/Dar_es_Salaam" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grace">Catch-up window (minutes)</Label>
              <Input id="grace" type="number" min={0} max={480} value={graceMinutes} onChange={(e) => setGraceMinutes(Number(e.target.value) || 0)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Catch-up window: if the agent was briefly offline/restarting at a slot time, it still fires that slot if it comes back within this many minutes.
          </p>
        </CardContent>
      </Card>

      {/* ---------- 3. Rotation note ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-emerald-600" aria-hidden /> How content is picked
          </CardTitle>
          <CardDescription>
            No AI involved: at each slot time the agent takes the photo and caption used the longest ago, posts your caption exactly as written, then moves them to the back of the queue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            To post to a different page, edit <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">pageId</code> in
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">data/config.json</code> (see the README in the data folder) and push — the agent re-connects automatically.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-2">
        <Button onClick={saveSettings} disabled={saving || !loaded} className="bg-emerald-600 hover:bg-emerald-700" size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Save all settings
        </Button>
      </div>
    </div>
  )
}
