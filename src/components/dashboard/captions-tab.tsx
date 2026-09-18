'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Loader2, Plus, Trash2, MessageSquareText, Pencil, Check, X } from 'lucide-react'
import type { CaptionItem } from './types'

export function CaptionsTab({ onRefresh }: { onRefresh: () => void }) {
  const [captions, setCaptions] = useState<CaptionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/captions')
      if (res.ok) setCaptions(await res.json())
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function add() {
    const raw = draft.trim()
    if (raw.length < 2) {
      toast.error('Write a caption first')
      return
    }
    // Bulk mode: paste many captions separated by a line with only ---
    const texts = raw.includes('---')
      ? raw.split(/\n\s*---\s*\n/).map((t) => t.trim()).filter((t) => t.length >= 2)
      : [raw]
    setAdding(true)
    try {
      const res = await fetch('/api/captions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success(`${json.created} caption${json.created > 1 ? 's' : ''} added to the bank`)
        setDraft('')
        await load()
        onRefresh()
      } else {
        toast.error(json.error ?? 'Could not add caption')
      }
    } catch {
      toast.error('Could not add caption')
    } finally {
      setAdding(false)
    }
  }

  async function save(id: string) {
    const text = editText.trim()
    if (text.length < 2) {
      toast.error('Caption is too short')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/captions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        setCaptions((prev) => prev.map((c) => (c.id === id ? { ...c, text } : c)))
        setEditing(null)
        toast.success('Caption updated')
      } else {
        toast.error('Could not update caption')
      }
    } catch {
      toast.error('Could not update caption')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(c: CaptionItem, active: boolean) {
    setCaptions((prev) => prev.map((x) => (x.id === c.id ? { ...x, active } : x)))
    try {
      await fetch(`/api/captions/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      onRefresh()
    } catch {
      setCaptions((prev) => prev.map((x) => (x.id === c.id ? { ...x, active: !active } : x)))
      toast.error('Could not update caption')
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/captions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setCaptions((prev) => prev.filter((c) => c.id !== id))
        toast.success('Caption deleted')
        onRefresh()
      } else {
        toast.error('Could not delete caption')
      }
    } catch {
      toast.error('Could not delete caption')
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <MessageSquareText className="h-5 w-5 text-teal-600" aria-hidden />
              <div className="flex-1">
                <p className="font-medium">Add captions to the bank</p>
                <p className="text-xs text-muted-foreground">
                  Tip: paste several captions at once and separate them with a line containing only <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">---</code>
                </p>
              </div>
            </div>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={'e.g. Monday motivation for every teacher 💪 Which lesson are you most excited about this week?\n\n#TeachersOfInstagram #LessonPlans\n\n---\n\nSecond caption goes here…'}
              rows={5}
              className="text-sm"
              aria-label="New caption"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{draft.length}/2200 characters</span>
              <Button onClick={add} disabled={adding} className="bg-teal-600 hover:bg-teal-700">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                Add caption{draft.includes('---') ? 's' : ''}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : captions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <MessageSquareText className="h-8 w-8 text-zinc-300 dark:text-zinc-600" aria-hidden />
            <p className="font-medium">Your caption bank is empty</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Add the captions the agent should post. Groq will pick the best caption for each photo and time slot.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
          {captions.map((c) => (
            <Card key={c.id} className={c.active ? '' : 'opacity-60'}>
              <CardContent className="p-4">
                {editing === c.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={4}
                      className="text-sm"
                      aria-label="Edit caption"
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                        <X className="h-3.5 w-3.5" aria-hidden /> Cancel
                      </Button>
                      <Button size="sm" onClick={() => save(c.id)} disabled={saving} className="bg-teal-600 hover:bg-teal-700">
                        <Check className="h-3.5 w-3.5" aria-hidden /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="whitespace-pre-wrap text-sm">{c.text}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{c.timesUsed}×</Badge>
                        <span className="text-xs text-muted-foreground">
                          used {c.timesUsed === 0 ? 'never' : c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(c.id); setEditText(c.text) }} aria-label="Edit caption">
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:text-rose-700" aria-label="Delete caption">
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this caption?</AlertDialogTitle>
                              <AlertDialogDescription>
                                It will no longer be picked for future posts. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep it</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(c.id)} className="bg-rose-600 hover:bg-rose-700">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <Switch checked={c.active} onCheckedChange={(v) => toggleActive(c, v)} aria-label="Use caption in rotation" />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
