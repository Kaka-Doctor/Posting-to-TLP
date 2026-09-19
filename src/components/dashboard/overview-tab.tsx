'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Clock, Images, MessageSquareText, CalendarCheck, Instagram, Facebook, Zap,
  CircleCheck, CircleX, CircleAlert, ExternalLink, Loader2, RefreshCw, FlaskConical,
} from 'lucide-react'
import { fmtCountdown, type StatusResponse, type PostItem } from './types'

const statusStyle: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  failed: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  skipped: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  pending: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function OverviewTab({ status, onRefresh }: { status: StatusResponse | null; onRefresh: () => void }) {
  const [posts, setPosts] = useState<PostItem[]>([])
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [running, setRunning] = useState(false)

  const loadPosts = useCallback(async () => {
    try {
      const res = await fetch('/api/posts')
      if (res.ok) setPosts(await res.json())
    } catch {
      /* ignore */
    } finally {
      setLoadingPosts(false)
    }
  }, [])

  useEffect(() => {
    loadPosts()
    const t = setInterval(loadPosts, 20000)
    return () => clearInterval(t)
  }, [loadPosts])

  async function runNow(dryRun: boolean) {
    setRunning(true)
    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      })
      const json = await res.json()
      if (json.ok) {
        toast.success(json.message, { description: json.post?.pickNote?.slice(0, 160) })
      } else {
        toast.error(json.message, { description: json.post?.igError || json.post?.fbError || '' })
      }
      await loadPosts()
      onRefresh()
    } catch {
      toast.error('Could not reach the agent')
    } finally {
      setRunning(false)
    }
  }

  const next = status?.activity.nextSlotInMinutes ?? null
  const cards = [
    {
      title: 'Next post in',
      value: fmtCountdown(next),
      sub: status ? `at ${status.slots.split(',').join(' · ')} (${status.timezone.split('/').pop()?.replace(/_/g, ' ')})` : '',
      icon: Clock,
      tone: 'text-emerald-600',
    },
    {
      title: 'Photos in library',
      value: `${status?.library.activePhotoCount ?? 0} / ${status?.library.photoCount ?? 0}`,
      sub: 'active / total',
      icon: Images,
      tone: 'text-amber-600',
    },
    {
      title: 'Captions in bank',
      value: `${status?.library.activeCaptionCount ?? 0} / ${status?.library.captionCount ?? 0}`,
      sub: 'active / total',
      icon: MessageSquareText,
      tone: 'text-teal-600',
    },
    {
      title: 'Posted today',
      value: `${status?.activity.postsToday ?? 0}`,
      sub: `${status?.activity.publishedTotal ?? 0} published all-time`,
      icon: CalendarCheck,
      tone: 'text-rose-600',
    },
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.title}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{c.title}</p>
                <c.icon className={`h-4 w-4 ${c.tone}`} aria-hidden />
              </div>
              <p className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{c.value}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Connection + controls */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-amber-500" aria-hidden /> Agent status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={status?.autoPost ? 'default' : 'secondary'} className={status?.autoPost ? 'bg-emerald-600 hover:bg-emerald-600' : ''}>
                {status?.autoPost ? 'Auto-posting armed' : 'Auto-posting paused'}
              </Badge>
              <Badge variant={status?.scheduler.started ? 'default' : 'secondary'} className={status?.scheduler.started ? 'bg-teal-600 hover:bg-teal-600' : ''}>
                {status?.scheduler.started ? 'Scheduler live' : 'Scheduler starting…'}
              </Badge>
              <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
                Local time: {status?.activity.localTime ?? '—'}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span className="flex items-center gap-2">
                {status?.connected.instagram ? (
                  <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden />
                ) : (
                  <CircleX className="h-4 w-4 text-rose-500" aria-hidden />
                )}
                <Instagram className="h-4 w-4" aria-hidden />
                {status?.connected.instagram ? `@${status.connected.igUsername || 'instagram'}` : 'Instagram not connected'}
              </span>
              <span className="flex items-center gap-2">
                {status?.connected.facebook ? (
                  <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden />
                ) : (
                  <CircleX className="h-4 w-4 text-rose-500" aria-hidden />
                )}
                <Facebook className="h-4 w-4" aria-hidden />
                {status?.connected.facebook ? status.connected.pageName || 'Facebook page' : 'Facebook not connected'}
              </span>
              <span className="flex items-center gap-2 text-muted-foreground">
                {status?.connected.tokenHealth.ok ? (
                  <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden />
                ) : (
                  <CircleAlert className="h-4 w-4 text-amber-500" aria-hidden />
                )}
                {status?.connected.tokenHealth.ok
                  ? `Token OK${status.connected.tokenDaysLeft !== null ? ` · ${status.connected.tokenDaysLeft}d left` : ' · no expiry'}`
                  : 'Token needs attention'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-6">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="lg"
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  disabled={running || !status?.connected.instagram && !status?.connected.facebook}
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
                  {running ? 'Posting…' : 'Post now'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Post to Instagram + Facebook now?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The agent will take the least-recently-used photo and caption, post the caption exactly as written, and publish to every connected platform. This does not affect the scheduled 3 daily slots.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => runNow(false)} className="bg-emerald-600 hover:bg-emerald-700">
                    Yes, post now
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <div className="flex w-full gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => runNow(true)} disabled={running}>
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FlaskConical className="h-3.5 w-3.5" aria-hidden />}
                Test pick
              </Button>
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { loadPosts(); onRefresh(); }}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              <span className="font-medium">Test pick</span> shows which photo and caption the rotation would post — without publishing anything.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Post history */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Post history</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Photo</TableHead>
                  <TableHead>When / slot</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Caption</TableHead>
                  <TableHead className="hidden lg:table-cell">Links</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPosts && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden />
                    </TableCell>
                  </TableRow>
                )}
                {!loadingPosts && posts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Nothing posted yet — add photos and captions, connect your pages, and the agent takes over.
                    </TableCell>
                  </TableRow>
                )}
                {posts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.photoThumb ? (
                        <img src={p.photoThumb} alt={p.photoName} className="h-10 w-10 rounded object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-zinc-100 text-zinc-400">
                          <Images className="h-4 w-4" aria-hidden />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{fmtTime(p.createdAt)}</div>
                      <div className="text-xs text-muted-foreground">{p.slotLabel}</div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusStyle[p.status] ?? statusStyle.pending}`}>
                        {p.status}
                      </span>
                      {p.status === 'failed' && p.igError && (
                        <div className="mt-1 max-w-48 truncate text-xs text-rose-500" title={p.igError}>{p.igError}</div>
                      )}
                      {p.status === 'failed' && p.fbError && !p.igError && (
                        <div className="mt-1 max-w-48 truncate text-xs text-rose-500" title={p.fbError}>{p.fbError}</div>
                      )}
                    </TableCell>
                    <TableCell className="hidden max-w-72 md:table-cell">
                      <div className="truncate text-sm" title={p.finalCaption}>{p.finalCaption || '—'}</div>
                      {p.pickNote && (
                        <div className="truncate text-xs text-muted-foreground" title={p.pickNote}>{p.pickNote}</div>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex gap-2">
                        {p.igPermalink && (
                          <a href={p.igPermalink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-emerald-700 hover:underline dark:text-emerald-400">
                            <Instagram className="h-3.5 w-3.5" aria-hidden /> IG <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        )}
                        {p.fbPermalink && (
                          <a href={p.fbPermalink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-emerald-700 hover:underline dark:text-emerald-400">
                            <Facebook className="h-3.5 w-3.5" aria-hidden /> FB <ExternalLink className="h-3 w-3" aria-hidden />
                          </a>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Agent activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {(status?.recentLogs ?? []).map((l) => (
              <li key={l.id} className="flex items-start gap-2">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    l.level === 'success' ? 'bg-emerald-500' : l.level === 'error' ? 'bg-rose-500' : 'bg-zinc-400'
                  }`}
                  aria-hidden
                />
                <span className="text-muted-foreground">{fmtTime(l.createdAt)}</span>
                <span className="min-w-0 flex-1">{l.message}</span>
              </li>
            ))}
            {(status?.recentLogs ?? []).length === 0 && (
              <li className="text-muted-foreground">No activity logged yet.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
