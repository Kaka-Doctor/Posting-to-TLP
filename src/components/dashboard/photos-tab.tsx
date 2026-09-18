'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Upload, Loader2, Trash2, ImageIcon, Check, FolderSearch } from 'lucide-react'
import { fmtBytes, type PhotoItem } from './types'

export function PhotosTab({ onRefresh }: { onRefresh: () => void }) {
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draftDesc, setDraftDesc] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/photos')
      if (res.ok) setPhotos(await res.json())
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function upload() {
    const files = fileRef.current?.files
    if (!files || files.length === 0) {
      toast.error('Choose at least one JPEG photo first')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      Array.from(files).forEach((f) => form.append('files', f))
      const res = await fetch('/api/photos', { method: 'POST', body: form })
      const json = await res.json()
      if (json.created?.length > 0) {
        toast.success(`${json.created.length} photo${json.created.length > 1 ? 's' : ''} added to the library`)
      }
      if (json.errors?.length > 0) {
        toast.warning('Some files were skipped', { description: json.errors.join(' · ').slice(0, 300) })
      }
      if (fileRef.current) fileRef.current.value = ''
      await load()
      onRefresh()
    } catch {
      toast.error('Upload failed — try again')
    } finally {
      setUploading(false)
    }
  }

  const [importing, setImporting] = useState(false)

  async function scanDataFolder() {
    setImporting(true)
    try {
      const res = await fetch('/api/import', { method: 'POST' })
      const json = await res.json()
      if (json.ok) {
        toast.success(`Scan complete — ${json.message}`, {
          description: `Connection: ${json.connection}. Re-scan any time after dropping new files into data/.`,
        })
      } else {
        toast.error(json.message || 'Scan failed')
      }
      await load()
      onRefresh()
    } catch {
      toast.error('Scan failed — try again')
    } finally {
      setImporting(false)
    }
  }

  async function saveDesc(id: string) {
    try {
      const res = await fetch(`/api/photos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: draftDesc }),
      })
      if (res.ok) {
        toast.success('Photo description saved')
        setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, description: draftDesc } : p)))
        setEditing(null)
      } else {
        toast.error('Could not save description')
      }
    } catch {
      toast.error('Could not save description')
    }
  }

  async function toggleActive(photo: PhotoItem, active: boolean) {
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, active } : p)))
    try {
      await fetch(`/api/photos/${photo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      onRefresh()
    } catch {
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, active: !active } : p)))
      toast.error('Could not update photo')
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== id))
        toast.success('Photo removed')
        onRefresh()
      } else {
        toast.error('Could not delete photo')
      }
    } catch {
      toast.error('Could not delete photo')
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Upload className="h-5 w-5 text-emerald-600" aria-hidden />
              <div className="flex-1">
                <p className="font-medium">Add photos to the library</p>
                <p className="text-xs text-muted-foreground">
                  JPEG only · max 8MB · at least 320px wide (Instagram rules).
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                ref={fileRef}
                type="file"
                accept="image/jpeg"
                multiple
                className="flex-1 cursor-pointer text-sm file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-emerald-700 dark:file:bg-emerald-950 dark:file:text-emerald-300"
                aria-label="Choose JPEG photos to upload"
              />
              <Button onClick={upload} disabled={uploading} className="bg-emerald-600 hover:bg-emerald-700">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                {uploading ? 'Uploading…' : 'Upload'}
              </Button>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-center sm:gap-3">
              <FolderSearch className="h-4 w-4 shrink-0 text-teal-600" aria-hidden />
              <p className="flex-1 text-xs text-muted-foreground">
                Photos and captions dropped into the <span className="font-mono font-medium">data/</span> folder of the repo (your GitHub content folder) are picked up automatically on every start — press scan to re-check right now.
              </p>
              <Button variant="outline" size="sm" onClick={scanDataFolder} disabled={importing} className="shrink-0">
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <FolderSearch className="h-3.5 w-3.5" aria-hidden />}
                {importing ? 'Scanning…' : 'Scan data folder'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : photos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <ImageIcon className="h-8 w-8 text-zinc-300 dark:text-zinc-600" aria-hidden />
            <p className="font-medium">Your photo library is empty</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Upload the photos the agent should choose from. When every photo has been used once, the cycle starts over.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {photos.map((p) => (
            <Card key={p.id} className={p.active ? '' : 'opacity-60'}>
              <CardContent className="p-3">
                <div className="relative">
                  <img
                    src={p.thumbUrl}
                    alt={p.description || p.originalName}
                    className="aspect-square w-full rounded-md object-cover"
                    loading="lazy"
                  />
                  <div className="absolute right-2 top-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="icon" className="h-7 w-7" aria-label={`Delete ${p.originalName}`}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
                          <AlertDialogDescription>
                            &quot;{p.originalName}&quot; will be removed from the library ({fmtBytes(p.sizeBytes)}, used {p.timesUsed}×). This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Keep it</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(p.id)} className="bg-rose-600 hover:bg-rose-700">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium" title={p.originalName}>{p.originalName}</p>
                    <Badge variant="secondary" className="shrink-0">{p.timesUsed}×</Badge>
                  </div>

                  {editing === p.id ? (
                    <div className="flex gap-1">
                      <Input
                        value={draftDesc}
                        onChange={(e) => setDraftDesc(e.target.value)}
                        placeholder="e.g. Colourful classroom display"
                        className="h-8 text-xs"
                        aria-label="Photo description"
                        autoFocus
                      />
                      <Button size="icon" className="h-8 w-8 shrink-0 bg-emerald-600 hover:bg-emerald-700" onClick={() => saveDesc(p.id)} aria-label="Save description">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full truncate rounded border border-dashed border-zinc-200 px-2 py-1 text-left text-xs text-muted-foreground hover:border-emerald-300 hover:text-emerald-700 dark:border-zinc-700 dark:hover:border-emerald-700 dark:hover:text-emerald-300"
                      onClick={() => { setEditing(p.id); setDraftDesc(p.description) }}
                    >
                      {p.description || '+ add description (helps AI matching)'}
                    </button>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{fmtBytes(p.sizeBytes)}</span>
                    <div className="flex items-center gap-1.5">
                      <Switch checked={p.active} onCheckedChange={(v) => toggleActive(p, v)} aria-label={`Use ${p.originalName} in rotation`} />
                      <span className="text-xs text-muted-foreground">{p.active ? 'in rotation' : 'paused'}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
