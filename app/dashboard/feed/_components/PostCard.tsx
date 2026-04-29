'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import type { PostWithAuthor, PostComment } from '@/types/feed'

const TYPE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  highlight:        { bg: '#2d5fc422', color: '#4d8ae8', label: 'HIGHLIGHT' },
  looking_for_club: { bg: '#f59e0b22', color: '#f59e0b', label: 'LOOKING FOR CLUB' },
  season_review:    { bg: '#7c3aed22', color: '#a78bfa', label: 'SEASON REVIEW' },
  general:          { bg: '#37415130', color: '#9ca3af', label: 'GENERAL' },
}

const ROLE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  player: { bg: '#2d5fc422', color: '#4d8ae8', label: 'PLAYER' },
  admin:  { bg: '#2d5fc422', color: '#4d8ae8', label: 'PLAYER' },
  coach:  { bg: '#f59e0b22', color: '#f59e0b', label: 'COACH' },
  fan:    { bg: '#37415130', color: '#9ca3af', label: 'FAN' },
}

const DEFAULT_MESSAGE = "Hi, I came across your post and I'm interested in having a chat."

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

function getInitials(name: string | null): string {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function Avatar({ url, name, size = 40 }: { url: string | null; name: string | null; size?: number }) {
  if (url) {
    return (
      <img src={url} alt={name ?? ''}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      backgroundColor: '#1e2235', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0,
    }}>
      <span style={{ fontSize: size * 0.36, fontWeight: 700, color: '#8892aa', fontFamily: "'Inter', sans-serif" }}>
        {getInitials(name)}
      </span>
    </div>
  )
}

// ─── Message modal ────────────────────────────────────────────────────────────

function MessageModal({
  playerName,
  playerId,
  onClose,
  onSent,
}: {
  playerName: string | null
  playerId: string
  onClose: () => void
  onSent: () => void
}) {
  const [message, setMessage] = useState(DEFAULT_MESSAGE)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId, content: message.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to send. Try again.')
        setSending(false)
        return
      }
      onSent()
    } catch {
      setError('Failed to send. Try again.')
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-10">
          <div className="mx-auto mb-5 rounded-full" style={{ width: 36, height: 4, backgroundColor: '#1e2235' }} />

          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 700, color: '#e8dece', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            Message {playerName ?? 'Player'}
          </h2>
          <p className="text-xs mb-5" style={{ color: '#8892aa' }}>
            Starting a conversation — they'll be notified instantly.
          </p>

          <textarea
            value={message}
            onChange={e => setMessage(e.target.value.slice(0, 400))}
            rows={4}
            className="w-full rounded-xl px-4 py-3 text-sm resize-none mb-4"
            style={{
              backgroundColor: '#0a0a0a',
              border: '1px solid #1e2235',
              color: '#e8dece',
              fontFamily: "'Inter', sans-serif",
              outline: 'none',
              lineHeight: 1.6,
            }}
          />

          {error && (
            <p className="mb-3 text-sm" style={{ color: '#ef4444' }}>{error}</p>
          )}

          <button
            onClick={handleSend}
            disabled={!message.trim() || sending}
            className="w-full py-4 rounded-xl font-bold"
            style={{
              backgroundColor: message.trim() && !sending ? '#2d5fc4' : '#1e2235',
              color: message.trim() && !sending ? '#fff' : '#4b5563',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 16,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {sending ? 'Sending…' : 'Send Message'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Post Card ─────────────────────────────────────────────────────────────────

export default function PostCard({
  post,
  viewerId,
  viewerRole,
  onDelete,
}: {
  post: PostWithAuthor
  viewerId: string
  viewerRole: string
  onDelete?: (id: string) => void
}) {
  const [likeCount, setLikeCount] = useState(post.likeCount)
  const [hasLiked, setHasLiked] = useState(post.hasLiked)
  const [commentCount, setCommentCount] = useState(post.commentCount)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<PostComment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [showMessageModal, setShowMessageModal] = useState(false)
  const [messageSent, setMessageSent] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)

  async function toggleLike() {
    const supabase = createClient()
    if (hasLiked) {
      setHasLiked(false)
      setLikeCount(c => c - 1)
      await supabase.from('post_likes').delete().eq('post_id', post.id).eq('user_id', viewerId)
    } else {
      setHasLiked(true)
      setLikeCount(c => c + 1)
      await supabase.from('post_likes').insert({ post_id: post.id, user_id: viewerId })
    }
  }

  async function toggleComments() {
    if (showComments) { setShowComments(false); return }
    setShowComments(true)
    if (comments.length > 0) return
    setLoadingComments(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('post_comments')
      .select('id, post_id, author_id, content, created_at, author:profiles!author_id(full_name, avatar_url)')
      .eq('post_id', post.id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
    const normalized = (data ?? []).map((c: any) => ({
      ...c,
      author: Array.isArray(c.author) ? (c.author[0] ?? null) : c.author,
    }))
    setComments(normalized as PostComment[])
    setLoadingComments(false)
  }

  async function deleteComment(commentId: string) {
    const supabase = createClient()
    await supabase.from('post_comments').update({ is_deleted: true }).eq('id', commentId)
    setComments(prev => prev.filter(c => c.id !== commentId))
    setCommentCount(c => c - 1)
  }

  async function submitComment() {
    if (!newComment.trim() || submittingComment) return
    setSubmittingComment(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('post_comments')
      .insert({ post_id: post.id, author_id: viewerId, content: newComment.trim() })
      .select('id, post_id, author_id, content, created_at, author:profiles!author_id(full_name, avatar_url)')
      .single()
    if (data) {
      const d = data as any
      const normalized: PostComment = { ...d, author: Array.isArray(d.author) ? (d.author[0] ?? null) : d.author }
      setComments(prev => [...prev, normalized])
      setCommentCount(c => c + 1)
      setNewComment('')
    }
    setSubmittingComment(false)
  }

  function handleMessageClick() {
    if (messageSent) return
    setShowMessageModal(true)
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    setDeleting(true)
    setDeleteError(false)
    const res = await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
    if (!res.ok) {
      setDeleting(false)
      setConfirmDelete(false)
      setDeleteError(true)
      setTimeout(() => setDeleteError(false), 3000)
      return
    }
    onDelete?.(post.id)
  }

  const typeStyle = TYPE_STYLE[post.post_type] ?? TYPE_STYLE.general
  const roleStyle = ROLE_STYLE[post.author.role ?? 'player'] ?? ROLE_STYLE.player
  const isCoachViewer = viewerRole === 'coach'
  const isOwnPost = post.author_id === viewerId
  const authorIsCoach = post.author.role === 'coach'
  const showMessageButton = isCoachViewer && !isOwnPost && !authorIsCoach

  return (
    <>
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        {/* Header */}
        <div className="flex items-start gap-3 p-4 pb-3">
          <Avatar url={post.author.avatar_url} name={post.author.full_name} size={42} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 17, fontWeight: 700, color: '#e8dece', lineHeight: 1 }}>
                {post.author.full_name ?? 'Unknown'}
              </span>
              <span className="px-1.5 py-0.5 rounded"
                style={{ backgroundColor: roleStyle.bg, color: roleStyle.color, fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700 }}>
                {roleStyle.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {post.author.position && <span className="text-xs" style={{ color: '#8892aa' }}>{post.author.position}</span>}
              {post.author.position && post.author.location && <span style={{ color: '#4b5563' }}>·</span>}
              {post.author.location && <span className="text-xs" style={{ color: '#8892aa' }}>{post.author.location}</span>}
              <span style={{ color: '#374151' }}>·</span>
              <span className="text-xs" style={{ color: '#4b5563' }}>{timeAgo(post.created_at)}</span>
            </div>
          </div>
          <span className="px-2 py-1 rounded-lg flex-shrink-0"
            style={{ backgroundColor: typeStyle.bg, color: typeStyle.color, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>
            {typeStyle.label}
          </span>
        </div>

        {/* Caption */}
        {post.caption && (
          <p className="px-4 pt-3 pb-3 text-sm leading-relaxed" style={{ color: '#e8dece', fontFamily: "'Inter', sans-serif" }}>
            {post.caption}
          </p>
        )}

        {/* Image */}
        {post.image_url && (
          <div style={{ padding: '0 16px 12px' }}>
            <div style={{ maxHeight: 360, maxWidth: 420, overflow: 'hidden', borderRadius: 10 }}>
              <img src={post.image_url} alt="" style={{ display: 'block', width: '100%', height: 'auto' }} />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-5 px-4 py-3" style={{ borderTop: '1px solid #1e2235' }}>
          {/* Like */}
          <button onClick={toggleLike} className="flex items-center gap-1.5 transition-opacity active:opacity-60">
            <svg width="18" height="18" viewBox="0 0 24 24" fill={hasLiked ? '#ef4444' : 'none'} stroke={hasLiked ? '#ef4444' : '#8892aa'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            <span className="text-xs tabular-nums" style={{ color: hasLiked ? '#ef4444' : '#8892aa' }}>{likeCount}</span>
          </button>

          {/* Comments */}
          <button onClick={toggleComments} className="flex items-center gap-1.5 transition-opacity active:opacity-60">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={showComments ? '#2d5fc4' : '#8892aa'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-xs tabular-nums" style={{ color: showComments ? '#2d5fc4' : '#8892aa' }}>{commentCount}</span>
          </button>

          {/* Coach: Message player */}
          {showMessageButton && (
            <button
              onClick={handleMessageClick}
              disabled={messageSent}
              className="flex items-center gap-1.5 ml-auto transition-opacity active:opacity-70"
            >
              {messageSent ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-xs font-semibold" style={{ color: '#4ade80', fontFamily: "'Inter', sans-serif" }}>Sent</span>
                </>
              ) : (
                <>
                  <MessageCircle size={17} color="#e8dece" strokeWidth={1.8} />
                  <span className="text-xs font-semibold" style={{ color: '#e8dece', fontFamily: "'Inter', sans-serif" }}>
                    Message Player
                  </span>
                </>
              )}
            </button>
          )}

          {/* Own post: delete */}
          {isOwnPost && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 ml-auto transition-opacity active:opacity-60"
            >
              {deleteError ? (
                <span className="text-xs font-semibold" style={{ color: '#ef4444', fontFamily: "'Inter', sans-serif" }}>
                  Failed — try again
                </span>
              ) : confirmDelete ? (
                <span className="text-xs font-semibold" style={{ color: '#ef4444', fontFamily: "'Inter', sans-serif" }}>
                  Tap again to delete
                </span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={deleting ? '#4b5563' : '#4b5563'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Comments section */}
        {showComments && (
          <div style={{ borderTop: '1px solid #1e2235' }}>
            {loadingComments ? (
              <div className="px-4 py-4 space-y-2">
                {[1, 2].map(i => (
                  <div key={i} className="h-3 rounded animate-pulse" style={{ backgroundColor: '#1e2235', width: i === 1 ? '70%' : '50%' }} />
                ))}
              </div>
            ) : comments.length === 0 ? (
              <p className="px-4 py-3 text-xs" style={{ color: '#4b5563' }}>No comments yet.</p>
            ) : (
              <div className="px-4 py-3 space-y-3">
                {comments.map(c => (
                  <div key={c.id} className="flex gap-2.5 group">
                    <Avatar url={c.author?.avatar_url ?? null} name={c.author?.full_name ?? null} size={26} />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold" style={{ color: '#e8dece', fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {c.author?.full_name ?? 'Unknown'}
                      </span>
                      <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#8892aa' }}>{c.content}</p>
                    </div>
                    {c.author_id === viewerId && (
                      <button
                        onClick={() => deleteComment(c.id)}
                        className="flex-shrink-0 self-start opacity-0 group-hover:opacity-100 transition-opacity active:opacity-60 mt-0.5"
                        title="Delete comment"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 px-4 py-3" style={{ borderTop: '1px solid #1e2235' }}>
              <input
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
                placeholder="Add a comment…"
                className="flex-1 text-xs px-3 py-2 rounded-lg"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece', fontFamily: "'Inter', sans-serif", outline: 'none' }}
              />
              <button
                onClick={submitComment}
                disabled={!newComment.trim() || submittingComment}
                className="px-3 py-2 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: newComment.trim() && !submittingComment ? '#2d5fc4' : '#1e2235', color: newComment.trim() && !submittingComment ? '#fff' : '#8892aa' }}>
                {submittingComment ? '…' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>

      {showMessageModal && (
        <MessageModal
          playerName={post.author.full_name}
          playerId={post.author_id}
          onClose={() => setShowMessageModal(false)}
          onSent={() => { setShowMessageModal(false); setMessageSent(true) }}
        />
      )}

    </>
  )
}
