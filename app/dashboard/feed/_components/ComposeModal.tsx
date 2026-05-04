'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import type { PostWithAuthor } from '@/types/feed'

export default function ComposeModal({
  userId,
  onClose,
  onPost,
}: {
  userId: string
  onClose: () => void
  onPost: (post: PostWithAuthor) => void
}) {
  const [postType] = useState('general')
  const [caption, setCaption] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Image files only.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Max file size is 5MB.'); return }
    setError(null)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit() {
    if ((!caption.trim() && !imageFile) || submitting) return
    setSubmitting(true)
    setError(null)

    const supabase = createClient()
    let image_url: string | null = null

    if (imageFile) {
      const ext = imageFile.name.split('.').pop() ?? 'jpg'
      const path = `${userId}/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('post-images')
        .upload(path, imageFile)

      if (uploadErr) {
        setError('Image upload failed. Try again.')
        setSubmitting(false)
        return
      }

      const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path)
      image_url = publicUrl
    }

    const { data: post, error: insertErr } = await supabase
      .from('posts')
      .insert({ author_id: userId, post_type: postType, caption: caption.trim(), image_url })
      .select('id, author_id, post_type, caption, image_url, created_at, author:profiles!author_id(id, full_name, avatar_url, role, position, location)')
      .single()

    if (insertErr || !post) {
      setError('Failed to post. Try again.')
      setSubmitting(false)
      return
    }

    const p = post as any
    onPost({
      id: p.id,
      author_id: p.author_id,
      post_type: p.post_type,
      caption: p.caption,
      image_url: p.image_url,
      created_at: p.created_at,
      author: p.author ?? { id: userId, full_name: null, avatar_url: null, role: null, position: null, location: null },
      likeCount: 0,
      hasLiked: false,
      commentCount: 0,
    })
  }

  const canSubmit = (caption.trim().length > 0 || imageFile !== null) && !submitting

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-10">
          {/* Handle */}
          <div className="mx-auto mb-5 rounded-full" style={{ width: 36, height: 4, backgroundColor: '#1e2235' }} />

          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 22, fontWeight: 700, color: '#e8dece', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 20 }}>
            New Post
          </h2>

          {/* Caption */}
          <div className="relative mb-4">
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value.slice(0, 500))}
              placeholder="What's happening? Let coaches know what you can do…"
              rows={4}
              className="w-full rounded-xl px-4 py-3 text-sm resize-none"
              style={{
                backgroundColor: '#0a0a0a',
                border: '1px solid #1e2235',
                color: '#e8dece',
                fontFamily: "'Inter', sans-serif",
                outline: 'none',
                lineHeight: 1.6,
              }}
            />
            <span
              className="absolute bottom-3 right-3 text-xs tabular-nums"
              style={{ color: caption.length > 450 ? '#f59e0b' : '#4b5563' }}
            >
              {caption.length}/500
            </span>
          </div>

          {/* Image */}
          {imagePreview ? (
            <div className="relative mb-4">
              <div style={{ height: 200, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0a0a0a' }}>
                <img
                  src={imagePreview}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                />
              </div>
              <button
                onClick={removeImage}
                className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.72)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e8dece" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-3.5 rounded-xl flex items-center justify-center gap-2 mb-4"
              style={{ border: '1px dashed #1e2235', backgroundColor: 'transparent', color: '#8892aa' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span className="text-sm" style={{ fontFamily: "'Inter', sans-serif" }}>Add photo (optional)</span>
            </button>
          )}

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />

          {error && (
            <p className="mb-3 text-sm" style={{ color: '#ef4444', fontFamily: "'Inter', sans-serif" }}>{error}</p>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-4 rounded-xl font-bold"
            style={{
              backgroundColor: canSubmit ? '#f59e0b' : '#1e2235',
              color: canSubmit ? '#0a0a0a' : '#4b5563',
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 16,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {submitting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}
