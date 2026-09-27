'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Loader2, MessageCircle, Reply, Send, Trash2 } from 'lucide-react'

import { addCommentAction, deleteCommentAction } from '@/app/explore/actions'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ExploreComment } from '@/lib/explore'
import { cn, formatRelativeTime } from '@/lib/utils'

/**
 * The conversation under a published shot.
 *
 * Loads its own thread rather than receiving one, because the dialog that
 * hosts it is opened from a grid that has no business fetching comments for
 * every card it draws. One request when a shot is opened, and one more after
 * each post.
 *
 * Ordering is newest root first, with each root's replies oldest first — the
 * list of conversations is a feed, a conversation is a transcript. The service
 * sorts both; this component never re-sorts, so the two can never disagree.
 */

const MAX_LENGTH = 1000

export function CommentThread({
  generationId,
  signedIn,
  returnTo,
  onCountChange,
}: {
  generationId: string
  signedIn: boolean
  /** Where sign-in should send the reader back to. */
  returnTo: string
  /** Keeps the card's comment count in step with what happened here. */
  onCountChange?: (delta: number) => void
}) {
  const [comments, setComments] = React.useState<ExploreComment[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [replyTo, setReplyTo] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/explore/${generationId}/comments`)
      if (!response.ok) throw new Error('Could not load the comments.')

      const data = (await response.json()) as { comments?: ExploreComment[] }
      setComments(data.comments ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the comments.')
    } finally {
      setLoading(false)
    }
  }, [generationId])

  React.useEffect(() => {
    void load()
  }, [load])

  const total = React.useMemo(
    () => comments.reduce((sum, comment) => sum + 1 + comment.replies.length, 0),
    [comments],
  )

  async function post(body: string, parentId: string | null) {
    const result = await addCommentAction(generationId, body, parentId)

    if (!result.ok) {
      toast.error(result.error)
      return false
    }

    // Refetched rather than spliced in locally: the row the server wrote
    // carries its own id, timestamp and byline, and inventing a stand-in for
    // those is how a comment ends up briefly attributed to nobody.
    setReplyTo(null)
    onCountChange?.(1)
    await load()
    return true
  }

  async function remove(comment: ExploreComment) {
    const result = await deleteCommentAction(comment.id)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    onCountChange?.(-result.data.removed)
    toast.success(result.data.removed > 1 ? 'Comment and its replies deleted' : 'Comment deleted')
    await load()
  }

  return (
    <section className="space-y-4" aria-label="Comments">
      <div className="flex items-center gap-2">
        <MessageCircle className="size-4 text-muted-foreground" aria-hidden />
        <h3 className="font-display text-sm font-medium">
          {total === 0 ? 'Comments' : `${total} ${total === 1 ? 'comment' : 'comments'}`}
        </h3>
      </div>

      {signedIn ? (
        <CommentComposer
          placeholder="Say something about this shot…"
          onSubmit={(body) => post(body, null)}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-surface/40 px-3.5 py-3 text-sm text-muted-foreground">
          <Link
            href={`/sign-in?next=${encodeURIComponent(returnTo)}`}
            className="text-brand underline-offset-4 hover:underline"
          >
            Sign in
          </Link>{' '}
          to join the conversation.
        </p>
      )}

      {loading ? (
        <ThreadSkeleton />
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-danger">
          {error}{' '}
          <button
            type="button"
            onClick={() => void load()}
            className="underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      ) : comments.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          No comments yet. Be the first to say something.
        </p>
      ) : (
        <ol className="space-y-5">
          {comments.map((comment) => (
            <li key={comment.id}>
              <CommentRow
                comment={comment}
                signedIn={signedIn}
                replying={replyTo === comment.id}
                onReply={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                onDelete={() => void remove(comment)}
              />

              {(comment.replies.length > 0 || replyTo === comment.id) && (
                <ol className="mt-3 space-y-3 border-l border-border pl-4">
                  {comment.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentRow
                        comment={reply}
                        signedIn={signedIn}
                        compact
                        onDelete={() => void remove(reply)}
                      />
                    </li>
                  ))}

                  {replyTo === comment.id && (
                    <li>
                      <CommentComposer
                        autoFocus
                        placeholder="Write a reply…"
                        onCancel={() => setReplyTo(null)}
                        onSubmit={(body) => post(body, comment.id)}
                      />
                    </li>
                  )}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/**
 * One comment.
 *
 * Replies get the `compact` treatment — a smaller avatar and no reply button,
 * because the thread is one level deep by construction and a reply control on
 * a reply would promise nesting that `add_comment()` flattens anyway.
 */
function CommentRow({
  comment,
  signedIn,
  compact = false,
  replying = false,
  onReply,
  onDelete,
}: {
  comment: ExploreComment
  signedIn: boolean
  compact?: boolean
  replying?: boolean
  onReply?: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const name = comment.author_name?.trim() || comment.author_handle || 'Someone'
  const initials = initialsOf(name)

  return (
    <article className="flex gap-3">
      <Avatar className={cn('shrink-0', compact ? 'size-6' : 'size-8')}>
        {comment.author_avatar_url && <AvatarImage src={comment.author_avatar_url} alt="" />}
        <AvatarFallback className={compact ? 'text-[10px]' : 'text-xs'}>{initials}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>{name}</span>
          {comment.author_handle && (
            <span className="text-xs text-muted-foreground">@{comment.author_handle}</span>
          )}
          <time
            dateTime={comment.created_at}
            className="text-xs text-muted-foreground"
            title={new Date(comment.created_at).toLocaleString()}
          >
            {formatRelativeTime(comment.created_at)}
          </time>
        </div>

        {/* `whitespace-pre-wrap` keeps the author's line breaks, and
            `break-words` stops one unbroken 300-character string from
            widening the whole dialog. */}
        <p
          className={cn(
            'whitespace-pre-wrap break-words leading-relaxed text-foreground/90',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {comment.body}
        </p>

        <div className="flex items-center gap-3 pt-0.5">
          {onReply && signedIn && (
            <button
              type="button"
              onClick={onReply}
              aria-expanded={replying}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Reply className="size-3" aria-hidden />
              Reply
            </button>
          )}

          {comment.canDelete &&
            (confirming ? (
              <span className="inline-flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Delete?</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true)
                    onDelete()
                  }}
                  className="text-danger underline underline-offset-4"
                >
                  {busy ? 'Deleting…' : 'Yes'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-muted-foreground underline underline-offset-4"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-danger"
              >
                <Trash2 className="size-3" aria-hidden />
                Delete
              </button>
            ))}
        </div>
      </div>
    </article>
  )
}

/**
 * The write box.
 *
 * Submits on ⌘/Ctrl+Enter as well as the button — a comment box that only
 * submits by mouse is a comment box people stop using. Plain Enter inserts a
 * newline, because these are paragraphs, not chat messages.
 */
function CommentComposer({
  placeholder,
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  placeholder: string
  autoFocus?: boolean
  onSubmit: (body: string) => Promise<boolean>
  onCancel?: () => void
}) {
  const [body, setBody] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const trimmed = body.trim()
  const tooLong = trimmed.length > MAX_LENGTH
  const canSubmit = trimmed.length > 0 && !tooLong && !busy

  async function submit() {
    if (!canSubmit) return
    setBusy(true)

    const posted = await onSubmit(trimmed)
    setBusy(false)

    // Cleared only on success, so a rejected comment is not also a lost one.
    if (posted) setBody('')
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        autoFocus={autoFocus}
        placeholder={placeholder}
        rows={2}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            void submit()
          }
        }}
        className="min-h-[4.5rem] resize-y text-sm"
      />

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span
          className={cn(
            'mr-auto text-xs tabular-nums',
            tooLong ? 'text-danger' : 'text-muted-foreground',
          )}
        >
          {/* Only shown once it is worth watching — a counter from zero is
              noise on a box most people fill with one sentence. */}
          {trimmed.length > MAX_LENGTH - 200 && `${trimmed.length} / ${MAX_LENGTH}`}
        </span>

        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}

        <Button size="sm" onClick={() => void submit()} disabled={!canSubmit}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          Post
        </Button>
      </div>
    </div>
  )
}

function ThreadSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading comments">
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex gap-3">
          <div className="shimmer size-8 shrink-0 rounded-full bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="shimmer h-3 w-32 rounded bg-surface-2" />
            <div className="shimmer h-3 w-full rounded bg-surface-2" />
            <div className="shimmer h-3 w-3/5 rounded bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  )
}

function initialsOf(name: string): string {
  const words = name.replace(/^@/, '').split(/\s+/).filter(Boolean)
  if (words.length >= 2) return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase()
  return name.replace(/^@/, '').slice(0, 2).toUpperCase()
}
