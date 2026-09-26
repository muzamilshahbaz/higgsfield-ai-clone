'use client'

import * as React from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { LIMITS } from '@/lib/constants'
import { UPLOAD_MIME_TYPES } from '@/lib/validation/generation'
import { cn, formatBytes } from '@/lib/utils'

/**
 * The start frame for image-to-video.
 *
 * Uploads immediately on drop rather than at submit: by the time the user has
 * finished writing the prompt the image is already in storage, so Generate is
 * one round trip and the preview is proof the upload worked.
 */
export function ImageDrop({
  value,
  onChange,
  error,
  disabled,
}: {
  value: string | null
  onChange: (url: string | null) => void
  error?: string
  disabled?: boolean
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [localError, setLocalError] = React.useState<string | null>(null)

  const upload = React.useCallback(
    async (file: File) => {
      setLocalError(null)

      if (!UPLOAD_MIME_TYPES.includes(file.type as (typeof UPLOAD_MIME_TYPES)[number])) {
        setLocalError('Use a PNG, JPEG or WebP image.')
        return
      }
      if (file.size > LIMITS.maxUploadBytes) {
        setLocalError(`That image is ${formatBytes(file.size)}. The limit is 10MB.`)
        return
      }

      setUploading(true)
      try {
        const form = new FormData()
        form.append('file', file)

        const response = await fetch('/api/uploads', { method: 'POST', body: form })
        const data = (await response.json()) as {
          image?: { url: string }
          error?: { message: string }
        }

        if (!response.ok || !data.image) {
          setLocalError(data.error?.message ?? 'Could not upload that image.')
          return
        }
        onChange(data.image.url)
      } catch {
        setLocalError('Could not reach the server. Check your connection.')
      } finally {
        setUploading(false)
      }
    },
    [onChange],
  )

  const message = localError ?? error

  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-muted-foreground">Start frame</span>

      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Start frame" className="h-40 w-full object-cover" />
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            className="absolute right-2 top-2"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label="Remove the start frame"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer.files?.[0]
            if (file) void upload(file)
          }}
          className={cn(
            'flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-60',
            dragging
              ? 'border-primary bg-primary/10 text-brand'
              : 'border-border bg-surface/30 text-muted-foreground hover:border-muted hover:bg-surface/60 hover:text-foreground',
            message && 'border-destructive/60',
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="size-5 animate-spin" aria-hidden />
              Uploading…
            </>
          ) : (
            <>
              <ImagePlus className="size-5" aria-hidden />
              <span>Drop an image, or click to browse</span>
              <span className="text-xs text-muted-foreground/80">PNG, JPEG or WebP · up to 10MB</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_MIME_TYPES.join(',')}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
          // Reset so picking the same file twice still fires a change.
          event.target.value = ''
        }}
      />

      {message && <p className="text-xs text-danger">{message}</p>}
    </div>
  )
}
