'use client'

import { useCallback, useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Bot, LayoutDashboard, Images, MessageSquareText, Settings2 } from 'lucide-react'
import { OverviewTab } from '@/components/dashboard/overview-tab'
import { PhotosTab } from '@/components/dashboard/photos-tab'
import { CaptionsTab } from '@/components/dashboard/captions-tab'
import { SetupTab } from '@/components/dashboard/setup-tab'
import { fmtCountdown, type StatusResponse } from '@/components/dashboard/types'

export default function Home() {
  const [status, setStatus] = useState<StatusResponse | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/status')
      if (res.ok) setStatus(await res.json())
    } catch {
      /* agent still starting up */
    }
  }, [])

  useEffect(() => {
    const initial = setTimeout(refresh, 0)
    const t = setInterval(refresh, 15000)
    return () => {
      clearTimeout(initial)
      clearInterval(t)
    }
  }, [refresh])

  const armed = status?.autoPost && (status?.connected.instagram || status?.connected.facebook)
  const needsSetup = status !== null && !(status.connected.instagram || status.connected.facebook)

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-600 text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <Bot className="h-6 w-6" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">Auto-Poster Agent</h1>
              <p className="text-xs text-emerald-100/90 sm:text-sm">
                Instagram + Facebook · 3 posts a day · your content, posted as-is
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={
                  armed
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                    : 'border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-100'
                }
              >
                {armed ? `Next post in ${fmtCountdown(status?.activity.nextSlotInMinutes ?? null)}` : needsSetup ? 'Setup needed' : 'Paused'}
              </Badge>
              {status?.scheduler.started && (
                <Badge variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/10">
                  scheduler live
                </Badge>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <Tabs defaultValue={needsSetup ? 'setup' : 'overview'} className="w-full">
          <TabsList className="mb-4 grid h-auto w-full grid-cols-4 rounded-lg bg-zinc-200/70 p-1 dark:bg-zinc-800/70">
            <TabsTrigger value="overview" className="gap-1.5 py-2 text-xs sm:text-sm">
              <LayoutDashboard className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="photos" className="gap-1.5 py-2 text-xs sm:text-sm">
              <Images className="h-4 w-4" aria-hidden />
              Photos
            </TabsTrigger>
            <TabsTrigger value="captions" className="gap-1.5 py-2 text-xs sm:text-sm">
              <MessageSquareText className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Captions</span>
            </TabsTrigger>
            <TabsTrigger value="setup" className="gap-1.5 py-2 text-xs sm:text-sm">
              <Settings2 className="h-4 w-4" aria-hidden />
              Setup
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab status={status} onRefresh={refresh} />
          </TabsContent>
          <TabsContent value="photos">
            <PhotosTab onRefresh={refresh} />
          </TabsContent>
          <TabsContent value="captions">
            <CaptionsTab onRefresh={refresh} />
          </TabsContent>
          <TabsContent value="setup">
            <SetupTab status={status} onRefresh={refresh} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="mt-auto border-t bg-white py-3 text-center text-xs text-muted-foreground dark:bg-zinc-900">
        Posts at {status?.slots ?? '06:00,12:00,18:00'} · {status?.timezone.replace(/_/g, ' ') ?? 'Africa/Dar es Salaam'} · keeps running while this app is live
      </footer>
    </div>
  )
}
