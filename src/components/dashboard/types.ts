export interface StatusResponse {
  autoPost: boolean
  timezone: string
  slots: string
  graceMinutes: number
  aiEnabled: boolean
  aiEnhanceCaptions: boolean
  groqModel: string
  groqKeySet: boolean
  pageTheme: string
  connected: {
    instagram: boolean
    facebook: boolean
    pageName: string
    igUsername: string
    tokenHealth: { ok: boolean; pageName: string; message: string }
    tokenDaysLeft: number | null
  }
  library: {
    photoCount: number
    activePhotoCount: number
    captionCount: number
    activeCaptionCount: number
  }
  activity: {
    postsToday: number
    publishedTotal: number
    nextSlotInMinutes: number | null
    localTime: string
  }
  scheduler: { started: boolean; lastTickAt: string | null; state: string }
  recentLogs: Array<{ id: string; level: string; message: string; createdAt: string }>
}

export interface PhotoItem {
  id: string
  originalName: string
  description: string
  active: boolean
  timesUsed: number
  lastUsedAt: string | null
  sizeBytes: number
  thumbUrl: string
  fullUrl: string
  createdAt: string
}

export interface CaptionItem {
  id: string
  text: string
  active: boolean
  timesUsed: number
  lastUsedAt: string | null
  createdAt: string
}

export interface PostItem {
  id: string
  slotLabel: string
  source: string
  status: string
  finalCaption: string
  photoName: string
  photoThumb: string
  igPermalink: string
  igError: string
  fbPermalink: string
  fbError: string
  aiReason: string
  createdAt: string
}

export function fmtCountdown(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes <= 0) return 'any moment now'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return `${h} h ${m} min`
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
