import 'server-only'

import type { ExploreComment } from '@/lib/explore'
import { createClient, getCurrentUser, tryCreateClient } from '@/lib/supabase/server'
import type { CommentRow } from '@/types/database'

/**
 * Comments on published work.
 *
 * Reads go through `comments_select_public`, which re-checks the parent
 * generation on every row: a thread is readable exactly as long as the shot it
 * is on is public. Nothing is deleted when an author unpublishes — the policy
 * simply stops matching, and the conversation comes back intact if they
 * publish again.
 *
 * Writes never touch the table directly. `add_comment()` and
 * `delete_comment()` (migration 0013) move the row and the counter on
 * `generations` inside one transaction, and copy the author's byline from
 * their own profile so a client cannot post under someone else's name.
 */

export const COMMENT_MAX_LENGTH = 1000

/** How many root comments a thread loads at once. */
export const COMMENT_PAGE_SIZE = 50

/**
 * A thread, newest root first, with each root's replies oldest first.
 *
 * The two orders are deliberate and not an inconsistency: the list of
 * conversations is a feed, where the newest is the most interesting, and a
 * conversation is a transcript, where reading order is chronological.
 */
export async function listComments(generationId: string): Promise<ExploreComment[]> {
  const supabase = await tryCreateClient()
  if (!supabase) return []

  const user = await getCurrentUser()

  const { data, error } = await supabase
    .from('comments')
    .select('*')
    // Comments a moderator has hidden are excluded here rather than filtered in
    // the renderer, so a hide takes effect on every surface that reads a thread —
    // the permalink, the dialog and the count below — without each of them having
    // to remember. See migration 0016 for why a hide is reversible and a delete
    // is the admin's separate, deliberate action.
    .eq('is_hidden', false)
    .eq('generation_id', generationId)
    .order('created_at', { ascending: false })
    .limit(COMMENT_PAGE_SIZE * 4)

  if (error) {
    console.error('[comment.service] listComments failed:', error.message)
    return []
  }

  const rows = data ?? []
  if (rows.length === 0) return []

  // Who owns the work decides who may moderate its thread. One extra read
  // rather than a join, for the same reason as everywhere else in this
  // codebase: each table is then read under exactly its own policy.
  const ownerId = user ? await generationOwner(generationId) : null

  const canDelete = (row: CommentRow) =>
    Boolean(user) && (row.user_id === user?.id || ownerId === user?.id)

  const roots: ExploreComment[] = []
  const repliesByParent = new Map<string, ExploreComment[]>()

  for (const row of rows) {
    const comment: ExploreComment = { ...row, canDelete: canDelete(row), replies: [] }

    if (row.parent_id) {
      const bucket = repliesByParent.get(row.parent_id)
      if (bucket) bucket.push(comment)
      else repliesByParent.set(row.parent_id, [comment])
    } else {
      roots.push(comment)
    }
  }

  for (const root of roots) {
    const replies = repliesByParent.get(root.id) ?? []
    // The query sorted everything newest-first; a transcript reads the other
    // way round.
    replies.sort((a, b) => a.created_at.localeCompare(b.created_at))
    root.replies = replies
  }

  return roots.slice(0, COMMENT_PAGE_SIZE)
}

/**
 * The owner of a generation, or null.
 *
 * Reads only the id column and only for a row the caller can already see, so
 * this discloses nothing that the feed does not — but it is the one read that
 * decides who gets a delete button, so it is scoped as tightly as it can be.
 */
async function generationOwner(generationId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('generations')
    .select('user_id')
    .eq('id', generationId)
    .maybeSingle()

  return data?.user_id ?? null
}

export type CommentMutation<T> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Posts a comment, or a reply to one.
 *
 * The length check here is the same one the function and the column constraint
 * make. Three copies sounds like two too many, but they answer different
 * questions: this one produces a sentence a person can act on, the function's
 * protects the counter, and the column's is what makes the rule true of the
 * data rather than of the code paths we remembered.
 */
export async function addComment(
  generationId: string,
  body: string,
  parentId?: string | null,
): Promise<CommentMutation<{ id: string }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Sign in to join the conversation.' }

  const trimmed = body.trim()
  if (trimmed.length === 0) return { ok: false, error: 'Write something first.' }
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    return { ok: false, error: `Keep it under ${COMMENT_MAX_LENGTH} characters.` }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('add_comment', {
    p_generation_id: generationId,
    p_body: trimmed,
    p_parent_id: parentId ?? null,
  })

  if (error) {
    console.error('[comment.service] addComment failed:', error.message)

    if (error.message.includes('GENERATION_NOT_PUBLIC')) {
      return { ok: false, error: 'That shot is no longer public.' }
    }
    if (error.message.includes('GENERATION_NOT_FOUND')) {
      return { ok: false, error: 'That shot is gone.' }
    }
    if (error.message.includes('PARENT_NOT_FOUND')) {
      return { ok: false, error: 'The comment you replied to has been deleted.' }
    }
    if (error.message.includes('COMMENT_TOO_LONG')) {
      return { ok: false, error: `Keep it under ${COMMENT_MAX_LENGTH} characters.` }
    }
    return { ok: false, error: 'Could not post that. Try again.' }
  }

  return { ok: true, data: { id: String(data) } }
}

/**
 * Deletes a comment and any replies under it.
 *
 * Permitted for the comment's author and for the owner of the work it sits
 * on. `delete_comment()` re-checks both — it runs as definer, so RLS is not
 * consulted for it and the rule has to be stated in the function itself.
 */
export async function deleteComment(
  commentId: string,
): Promise<CommentMutation<{ id: string; removed: number }>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You need to be signed in.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('delete_comment', { p_comment_id: commentId })

  if (error) {
    console.error('[comment.service] deleteComment failed:', error.message)

    if (error.message.includes('NOT_PERMITTED')) {
      return { ok: false, error: 'That is not your comment.' }
    }
    if (error.message.includes('COMMENT_NOT_FOUND')) {
      return { ok: false, error: 'That comment is already gone.' }
    }
    return { ok: false, error: 'Could not delete that. Try again.' }
  }

  return { ok: true, data: { id: commentId, removed: typeof data === 'number' ? data : 1 } }
}
